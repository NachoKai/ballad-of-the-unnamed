import type {
  CharacterState,
  ClassKit,
  CombatAbility,
  CombatLogEntry,
  CombatMove,
  CombatStatus,
  CombatStatusId,
  CreatureContent,
  CreatureMove,
  CombatRewards,
  CreatureRarity,
  EndingType,
  EventContent,
  Locale,
  LocaleMap,
  PendingCombatState,
  ServedCombatState,
} from "../../../shared/types.js"
import type { ContentRegistry } from "../../content/registry.js"
import type { Rng } from "../../../shared/rng.js"
import { GAME_CONFIG } from "../../../shared/config.js"
// Deliberate cycle (mirrors minigames/pressConference.ts): engine -> helpers
// -> combat -> engine. Safe because every symbol below is referenced only
// inside function bodies (ESM live bindings resolve at call time).
import { ageUp, bumpCounter, defaultFaction, heroicOrPeaceful, rollDeath } from "../engine.js"
import {
  activeMenace,
  adjustReputation,
  clearExpiredHunted,
  deductStamina,
  logTurn,
  recomputeDerived,
  registerMenaceKill,
  updateMarketValue,
  updateMomentum,
} from "../helpers.js"
import type { ResolveOutput } from "../engine.js"

// Tiny inline locale lookup — do NOT import from helpers.js (import cycle:
// helpers imports this module for the serve path).
function loc(m: LocaleMap, locale: Locale): string {
  return m[locale] ?? m.en
}
export { loc }

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// ---- Damage & stats --------------------------------------------------------

export function playerBaseAttack(c: CharacterState, kit: ClassKit): number {
  const b = kit.basicAttack
  return b.base + Math.floor(c[b.stat] * b.coefficient)
}

export function playerBaseDefense(c: CharacterState): number {
  return Math.floor(c.constitution * GAME_CONFIG.combatConMitigation)
}

// ±combatVariance around 1.
export function rollVariance(rng: Rng): number {
  return 1 - GAME_CONFIG.combatVariance + rng.next() * GAME_CONFIG.combatVariance * 2
}

// Physical damage to a creature: defense subtracts; magic uses magicResistance.
export function physicalDamage(raw: number, defense: number): number {
  return Math.max(1, raw - defense)
}
export function magicDamage(raw: number, resistance: number): number {
  return Math.max(1, raw - resistance)
}

// Effective creature attack: enraged x1.5, slowed x0.6 (statuses on the creature).
export function creatureEffectiveAttack(
  creature: CreatureContent,
  statuses: CombatStatus[],
): number {
  let atk = creature.attack
  if (statuses.some((s) => s.id === "enraged")) atk *= 1.5
  if (statuses.some((s) => s.id === "slowed")) atk *= 0.6
  return Math.max(1, Math.round(atk))
}

// Effective player attack: base + attack_up − attack_down (min 1).
export function playerEffectiveAttack(state: PendingCombatState): number {
  let atk = state.playerBaseAttack
  for (const s of state.playerStatuses) {
    if (s.id === "attack_up") atk += s.amount ?? 0
    if (s.id === "attack_down") atk -= s.amount ?? 0
  }
  return Math.max(1, Math.round(atk))
}

export function playerEffectiveDefense(state: PendingCombatState): number {
  let def = state.playerBaseDefense
  for (const s of state.playerStatuses) {
    if (s.id === "defense_up") def += s.amount ?? 0
  }
  return def
}

export function fleeChance(c: CharacterState, kit: ClassKit, creature: CreatureContent): number {
  return clamp(
    GAME_CONFIG.combatFleeBase +
      kit.fleeModifier +
      c.dexterity * GAME_CONFIG.combatFleeDexCoeff -
      creature.fleeDifficulty,
    0.1,
    0.95,
  )
}

// Weighted pick among the moves whose health-fraction gates pass. Phase logic
// (enrage below half health, flee when almost dead) is content, not code.
export function pickCreatureMove(
  creature: CreatureContent,
  healthFrac: number,
  rng: Rng,
): CreatureMove {
  const pool = creature.moves.filter((m) => {
    if (m.minHealthFraction != null && healthFrac < m.minHealthFraction) return false
    if (m.maxHealthFraction != null && healthFrac > m.maxHealthFraction) return false
    return true
  })
  // Defensive fallback: if phase gating excluded every move (e.g. a boss whose
  // enrage phase-gate is miss-authored), fall back to the full move list so the
  // creature never stands frozen.
  const list = pool.length > 0 ? pool : creature.moves
  return rng.weighted(list, (m) => m.weight)
}

export function hasStatus(statuses: CombatStatus[], id: CombatStatusId): boolean {
  return statuses.some((s) => s.id === id)
}

// End-of-round bookkeeping: poison ticks (from the round after application),
// timed statuses decrement and expire, guarding clears.
export function applyStatusesTick(state: PendingCombatState, _c: CharacterState): void {
  const poisoned = state.creatureStatuses.find((s) => s.id === "poisoned")
  let poisonedTick = 0
  if (poisoned && (poisoned.appliedRound ?? -1) < state.round) {
    poisonedTick = poisoned.amount ?? GAME_CONFIG.combatPoisonPerTurn
    state.creatureHealth = Math.max(0, state.creatureHealth - poisonedTick)
  }
  for (const side of [state.creatureStatuses, state.playerStatuses]) {
    for (let i = side.length - 1; i >= 0; i--) {
      const s = side[i]
      // Poison's turns count ticks remaining, not rounds remaining: it only
      // burns a turn on rounds where it actually ticks.
      if (s.id === "poisoned" && poisonedTick === 0) continue
      if (s.turns === 0) continue // permanent until cleared
      s.turns -= 1
      if (s.turns <= 0) side.splice(i, 1)
    }
  }
  // guarding is pushed with turns: 1, so the decrement loop above already
  // removed it — no separate clear needed.
  if (poisonedTick > 0) {
    const last = state.log[state.log.length - 1]
    if (last) last.poisonedTick = poisonedTick
  }
}

// ---- Player ability dispatch ----------------------------------------------

function applyPlayerAbility(
  state: PendingCombatState,
  c: CharacterState,
  ability: CombatAbility,
  entry: CombatLogEntry,
  rng: Rng,
): void {
  const stat = c[ability.stat] as number
  if (ability.effect === "damage" || ability.effect === "damage_and_debuff") {
    const crit = rng.bool(ability.critChance ?? 0.05)
    let raw = ability.base + Math.floor(stat * ability.coefficient)
    if (crit) raw = Math.round(raw * GAME_CONFIG.combatCritMultiplier)
    const rolled = Math.max(1, Math.round(raw * rollVariance(rng)))
    entry.playerDamage =
      ability.school === "magic"
        ? magicDamage(rolled, state.creature.magicResistance)
        : physicalDamage(rolled, state.creature.defense)
    entry.playerCrit = crit
    state.creatureHealth = Math.max(0, state.creatureHealth - entry.playerDamage)
    if (ability.effect === "damage_and_debuff" && state.creatureHealth > 0) {
      state.creatureStatuses.push({ id: "slowed", turns: ability.statusTurns ?? 2 })
    }
    return
  }
  if (ability.effect === "damage_over_time") {
    const rolled = Math.max(1, ability.base + Math.floor(stat * ability.coefficient))
    entry.playerDamage = physicalDamage(rolled, state.creature.defense)
    state.creatureHealth = Math.max(0, state.creatureHealth - entry.playerDamage)
    if (state.creatureHealth > 0) {
      state.creatureStatuses.push({
        id: "poisoned",
        turns: ability.statusTurns ?? 3,
        amount: ability.dotPerTurn ?? GAME_CONFIG.combatPoisonPerTurn,
        appliedRound: state.round,
      })
    }
    return
  }
  if (ability.effect === "heal") {
    const amount =
      ability.base + Math.floor(stat * (ability.healCoefficient ?? ability.coefficient))
    const healed = Math.min(GAME_CONFIG.startingHealth, c.health + amount)
    entry.playerHeal = healed - c.health
    c.health = healed
    return
  }
  if (ability.effect === "buff_attack") {
    state.playerStatuses.push({
      id: "attack_up",
      turns: 0,
      amount: ability.base + Math.floor(stat * ability.coefficient),
    })
    return
  }
  if (ability.effect === "buff_defense") {
    state.playerStatuses.push({
      id: "defense_up",
      turns: 0,
      amount: ability.base + Math.floor(stat * ability.coefficient),
    })
    return
  }
  if (ability.effect === "stun") {
    if (rng.bool(ability.stunChance ?? 1)) {
      state.creatureStatuses.push({ id: "stunned", turns: 1 })
    }
    return
  }
  if (ability.effect === "flee_boost") {
    state.playerStatuses.push({ id: "smoke", turns: 0 })
    return
  }
  if (ability.effect === "steal") {
    const crit = rng.bool(ability.critChance ?? 0.05)
    let raw = ability.base + Math.floor(stat * ability.coefficient)
    if (crit) raw = Math.round(raw * GAME_CONFIG.combatCritMultiplier)
    const rolled = Math.max(1, Math.round(raw * rollVariance(rng)))
    entry.playerDamage = physicalDamage(rolled, state.creature.defense)
    entry.playerCrit = crit
    entry.playerGold = entry.playerDamage
    state.creatureHealth = Math.max(0, state.creatureHealth - entry.playerDamage)
    c.gold += entry.playerDamage
  }
}

// ---- Round resolution ------------------------------------------------------

// Resolve one full round: player action → creature reaction (unless fled or
// dead) → end-of-round status ticks. Mutates `state` and `c.health`. Sets
// `state.over`/`state.result` when the fight ends.
export function resolveCombatRound(
  state: PendingCombatState,
  c: CharacterState,
  kit: ClassKit,
  move: CombatMove,
  rng: Rng,
): { over: boolean } {
  if (state.over) throw new Error("combat already finished")
  const round = state.round + 1
  state.round = round
  const entry: CombatLogEntry = { round, playerAction: move.kind }
  state.log.push(entry)

  // --- Player action ---
  if (move.kind === "attack") {
    const crit = rng.bool(kit.basicAttack.critChance)
    let raw = playerEffectiveAttack(state)
    if (crit) raw = Math.round(raw * GAME_CONFIG.combatCritMultiplier)
    const rolled = Math.max(1, Math.round(raw * rollVariance(rng)))
    entry.playerDamage = physicalDamage(rolled, state.creature.defense)
    entry.playerCrit = crit
    state.creatureHealth = Math.max(0, state.creatureHealth - entry.playerDamage)
  } else if (move.kind === "ability") {
    const ability = kit.abilities.find((a) => a.id === move.abilityId)
    if (!ability) throw new Error("unknown ability")
    if (c.age < (ability.unlockAge ?? 0)) throw new Error("locked ability")
    if (state.resource < ability.cost) throw new Error("insufficient resource")
    state.resource -= ability.cost
    entry.playerAbilityId = ability.id
    applyPlayerAbility(state, c, ability, entry, rng)
  } else if (move.kind === "defend") {
    state.playerStatuses.push({ id: "guarding", turns: 1 })
  } else if (move.kind === "flee") {
    const smoke = hasStatus(state.playerStatuses, "smoke")
    if (smoke || rng.bool(fleeChance(c, kit, state.creature))) {
      entry.playerFled = true
      state.over = true
      state.result = "fled"
      return { over: true }
    }
  }

  // Creature dead?
  if (state.creatureHealth <= 0) {
    state.over = true
    state.result = "won"
    return { over: true }
  }

  // --- Creature reaction ---
  if (hasStatus(state.creatureStatuses, "stunned")) {
    entry.creatureSkipped = true
  } else {
    const healthFrac = state.creatureHealth / state.creature.health
    const mv = pickCreatureMove(state.creature, healthFrac, rng)
    entry.creatureMoveId = mv.id
    if (mv.effect === "damage") {
      const raw = Math.round(
        creatureEffectiveAttack(state.creature, state.creatureStatuses) *
          (mv.damageMultiplier ?? 1) *
          rollVariance(rng),
      )
      let dmg = Math.max(1, raw - playerEffectiveDefense(state))
      if (hasStatus(state.playerStatuses, "guarding")) {
        dmg = Math.round(dmg * GAME_CONFIG.combatGuardFactor)
      }
      dmg = Math.max(1, dmg)
      const next = c.health - dmg
      // canKillPlayer:false creatures can't drop health below the safety floor;
      // an already-low health is never "healed" up by the clamp.
      c.health = state.creature.canKillPlayer
        ? Math.max(0, next)
        : Math.min(c.health, Math.max(GAME_CONFIG.combatSafetyFloor, next))
      entry.creatureDamage = dmg
    } else if (mv.effect === "self_buff_attack") {
      if (!hasStatus(state.creatureStatuses, "enraged")) {
        state.creatureStatuses.push({ id: "enraged", turns: 0 })
      }
    } else if (mv.effect === "debuff_player_attack") {
      state.playerStatuses.push({
        id: "attack_down",
        turns: 2,
        amount: mv.debuffAmount ?? 3,
      })
    } else if (mv.effect === "heal") {
      const healed = Math.min(state.creature.health, state.creatureHealth + (mv.healAmount ?? 0))
      entry.creatureHeal = healed - state.creatureHealth
      state.creatureHealth = healed
    } else if (mv.effect === "flee_if_low_hp") {
      // The creature gives up and runs — the fight ends without a kill.
      entry.creatureFled = true
      state.over = true
      state.result = "fled"
      return { over: true }
    }
  }

  // Player dead?
  if (c.health <= 0) {
    state.over = true
    state.result = "lost"
    return { over: true }
  }

  // End of round: poison can finish the creature off here.
  applyStatusesTick(state, c)
  if (state.creatureHealth <= 0) {
    state.over = true
    state.result = "won"
    return { over: true }
  }
  return { over: false }
}

// ---- Combat session lifecycle ---------------------------------------------

// Weight for the rarity-weighted creature pick (higher rarity = rarer).
const CREATURE_WEIGHT: Record<CreatureRarity, number> = {
  common: 5,
  uncommon: 3,
  rare: 1.5,
  elite: 0.6,
  boss: 0.2,
}

// Open a fight for an encounter event: pick the creature (rarity-weighted,
// arc-filtered) and snapshot the whole creature into the persisted state so
// content edits mid-run can't corrupt an active fight.
export function startCombatState(
  ev: EventContent,
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): PendingCombatState {
  const authored = (ev.combat?.creatures ?? [])
    .map((id) => registry.creaturesById.get(id))
    .filter((cr): cr is CreatureContent => Boolean(cr))
  // Arc gate: only creatures whose arcs include the current arc are offered.
  // If EVERY authored creature is excluded (age/arc mismatch in content), fall
  // back to the full authored pool so a fight can never soft-lock on an empty
  // pick (content error surfaces in registry validation instead).
  const eligible = authored.filter((cr) => !cr.arcs || cr.arcs.includes(c.currentArc))
  const pool = eligible.length > 0 ? eligible : authored
  const creature = rng.weighted(pool, (cr) => CREATURE_WEIGHT[cr.rarity])
  const kit = registry.classKits[c.class]
  // Resource refills every encounter; floor at 1 so a low-stat character can
  // always afford at least their cheapest ability.
  const resourceMax = Math.max(1, Math.floor(c[kit.resourceStat] * kit.resourceMultiplier))
  return {
    eventId: ev.id,
    creature,
    creatureHealth: creature.health,
    creatureStatuses: [],
    playerBaseAttack: playerBaseAttack(c, kit),
    playerBaseDefense: playerBaseDefense(c),
    playerStatuses: [],
    resource: resourceMax,
    resourceMax,
    round: 0,
    log: [],
    over: false,
    result: null,
  }
}

// Serialize an in-progress fight for the client (localized labels only). Rng-
// FREE — safe on the resume path.
export function combatView(
  state: PendingCombatState,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
): ServedCombatState {
  const kit = registry.classKits[c.class]
  const moveNames: Record<string, string> = {}
  for (const mv of state.creature.moves) {
    moveNames[mv.id] = loc(mv.name ?? { en: mv.id, es: mv.id }, locale)
  }
  // Surface the active menace when it targets this fight's creature, so the
  // client can show why the encounter feels emboldened (and the kill progress).
  const menace = activeMenace(c)
  const menaceInfo =
    menace && menace.creatureIds.includes(state.creature.id)
      ? {
          headline: loc(
            registry.events.find((e) => e.id === menace.eventId)?.worldEventHeadline ?? {
              en: "A menace stirs",
              es: "Una amenaza se agita",
            },
            locale,
          ),
          kills: menace.kills,
          killTarget: menace.killTarget,
        }
      : undefined
  return {
    creature: {
      id: state.creature.id,
      name: loc(state.creature.name, locale),
      icon: state.creature.icon,
      rarity: state.creature.rarity,
      currentHealth: state.creatureHealth,
      maxHealth: state.creature.health,
      attack: creatureEffectiveAttack(state.creature, state.creatureStatuses),
      defense: state.creature.defense,
      magicResistance: state.creature.magicResistance,
      statuses: state.creatureStatuses,
    },
    player: {
      health: c.health,
      maxHealth: GAME_CONFIG.startingHealth,
      resource: state.resource,
      resourceMax: state.resourceMax,
      resourceLabel: loc(kit.resourceLabel, locale),
      attack: playerEffectiveAttack(state),
      defense: playerEffectiveDefense(state),
      statuses: state.playerStatuses,
    },
    kit: {
      basicAttackLabel: loc(kit.basicAttack.label, locale),
      abilityMenuLabel: loc(kit.abilityMenuLabel, locale),
      abilities: kit.abilities.map((a) => ({
        id: a.id,
        label: loc(a.label, locale),
        icon: a.icon,
        cost: a.cost,
        unlocked: c.age >= (a.unlockAge ?? 0),
      })),
    },
    round: state.round,
    log: state.log,
    creatureMoveNames: moveNames,
    over: state.over,
    result: state.result,
    menace: menaceInfo,
  }
}

// Mirrors prepareInteractiveServe: init the persisted state once per event.
// The first call draws the creature from the run Rng; later calls (resume)
// are Rng-free and reuse the persisted state.
export function prepareCombatServe(
  ev: EventContent,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
): ServedCombatState {
  if (!c.pendingCombat || c.pendingCombat.eventId !== ev.id) {
    c.pendingCombat = startCombatState(ev, c, registry, rng)
  }
  return combatView(c.pendingCombat, c, locale, registry)
}

// endCombat's output: a standard ResolveOutput plus the loot breakdown granted
// on a win (null on flee/loss), for the client's result screen.
export interface CombatResolveOutput extends ResolveOutput {
  rewards?: CombatRewards
}

// End the fight and apply the full turn tail (mirrors applyMinigameOutcome):
// loot + counters on a win, bookkeeping on every outcome, and the standard
// mortality roll. Clears c.pendingCombat.
export function endCombat(
  c: CharacterState,
  ev: EventContent,
  state: PendingCombatState,
  registry: ContentRegistry,
  rng: Rng,
): CombatResolveOutput {
  c.turn += 1
  // The run's story: combat turns record the outcome as the "choice".
  logTurn(c, ev.id, `result:${state.result ?? "fled"}`)
  const creature = state.creature
  const loot = creature.loot
  let narrative: string
  let rewards: CombatRewards | undefined

  if (state.result === "won") {
    const gold = rng.int(loot.goldMin, loot.goldMax)
    const fame = rng.int(loot.fameMin, loot.fameMax)
    c.gold += gold
    c.fame += fame
    if (loot.reputationDelta) {
      adjustReputation(c, loot.reputationFaction ?? defaultFaction(c), loot.reputationDelta)
    }
    const items: { itemId: string; qty: number }[] = []
    for (const drop of loot.items ?? []) {
      if (rng.bool(drop.chance)) {
        const existing = c.inventory.find((inv) => inv.itemId === drop.itemId)
        if (existing) existing.qty += 1
        else c.inventory.push({ itemId: drop.itemId, qty: 1, expiresAtTurn: null })
        const got = items.find((i) => i.itemId === drop.itemId)
        if (got) got.qty += 1
        else items.push({ itemId: drop.itemId, qty: 1 })
      }
    }
    rewards = { gold, fame, items }
    bumpCounter(c, "battles_won")
    bumpCounter(c, "monsters_killed")
    if (creature.rarity === "elite") bumpCounter(c, "elite_kills")
    if (creature.rarity === "boss") bumpCounter(c, "boss_kills")
    bumpCounter(c, `event_${ev.id}`)
    narrative =
      c.locale === "en"
        ? `The ${loc(creature.name, c.locale)} falls. You stand over the spoils: ${gold} gold${
            fame > 0 ? `, ${fame} fame` : ""
          }.`
        : `El ${loc(creature.name, c.locale)} cae. Te quedas con el botín: ${gold} de oro${
            fame > 0 ? `, ${fame} de fama` : ""
          }.`
    // A kill toward the active combat menace (world-event linkage) — resolves
    // the menace when the kill target is met (flag cleared by the helper).
    if (registerMenaceKill(c, creature.id)) {
      bumpCounter(c, "menaces_resolved")
      narrative =
        c.locale === "en"
          ? `${narrative} The menace is over — the roads are quiet again.`
          : `${narrative} La amenaza terminó — los caminos vuelven a estar en calma.`
    }
  } else if (state.result === "fled") {
    bumpCounter(c, "flees_count")
    narrative =
      c.locale === "en"
        ? "You break away and slip out of reach. The fight ends — no spoils, no glory, but you live."
        : "Te zafás y escapás. El combate termina — sin botín, sin gloria, pero vivís."
  } else {
    // lost — health already 0 (or the player was never able to continue).
    bumpCounter(c, "lost_encounters")
    narrative =
      c.locale === "en"
        ? `Darkness takes you. The ${loc(creature.name, c.locale)} is the last thing you see.`
        : `La oscuridad te envuelve. El ${loc(creature.name, c.locale)} es lo último que ves.`
  }

  // Turn bookkeeping tail — mirrors applyMinigameOutcome exactly.
  updateMomentum(c, 0)
  deductStamina(c)
  updateMarketValue(c)
  recomputeDerived(c)
  ageUp(c)
  clearExpiredHunted(c)

  let ended = false
  let endingType: EndingType | undefined
  if (rollDeath(c, 0, rng) || c.age >= GAME_CONFIG.maxAge) {
    // rollDeath already returns true when c.health <= 0 (combat loss).
    c.status = "dead"
    ended = true
    endingType = heroicOrPeaceful(c, "death")
  }

  c.pendingCombat = null
  return {
    narrative,
    ended,
    endingType,
    chosenRarity: "uncommon",
    wonBattle: state.result === "won",
    completedQuest: false,
    rewards,
  }
}

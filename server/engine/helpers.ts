import type {
  CharacterState,
  CombatMenaceState,
  EventContent,
  Locale,
  LocaleMap,
  PersonalityTag,
  Rarity,
  RelationshipEntry,
  RoleSignal,
  ServedChoice,
  ServedEvent,
  StatKey,
  TurnLogKind,
} from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import type { Rng } from "../../shared/rng.js"
import type { ContentRegistry } from "../content/registry.js"
import {
  affinityTierId,
  GAME_CONFIG,
  rarityRank,
  reputationTierId,
  RIVAL_FOCUSES,
} from "../../shared/config.js"
import { fmtInt } from "../../shared/format.js"
import { genderize } from "../../shared/genderize.js"
import { interactiveOpponentName, prepareInteractiveServe } from "./minigames/index.js"
import { prepareCombatServe } from "./combat/index.js"

// Fill {slot:pool} placeholders in a narrative string deterministically.
// The same rng sequence + same seed => identical filled text for daily mode.
export function fillSlots(
  text: string,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
  character?: CharacterState,
): string {
  // Gender-inflect player-referential Spanish words BEFORE slots are filled so
  // NPC/group text pulled from slot pools is never regendered with the player.
  // Runs without a stored gender (old saves) default to masculine.
  const gendered = character && locale === "es" ? genderize(text, character.gender) : text
  // Supports both {poolName} and {slot:poolName} placeholder styles.
  return gendered.replace(/\{(?:slot:)?([a-zA-Z_]+)\}/g, (_m, pool: string) => {
    // {rivalName} is special: substituted with the actual run's rival, not a pool.
    if (pool === "rivalName") {
      return character?.rival?.name ?? "your rival"
    }
    const entries = registry.slots[pool]
    if (!entries || entries.length === 0) return pool
    const chosen = rng.pick(entries)
    return chosen[locale] ?? chosen.en
  })
}

export function localize(map: LocaleMap, locale: Locale): string {
  return map[locale] ?? map.en
}

// Record one resolved beat of the run's story. Language-neutral (ids only,
// never baked prose) so the ending screen can re-render the "Your Story"
// scrollback in either locale, and the `turn_log` table can be mirrored at run
// end. `choiceId` is the chosen choice's id for regular events, a
// `tier:<tier>` / `result:<result>` key for minigames and combat encounters,
// or the item/faction/tournament id for the special kinds. Synthetic `__*`
// beats are skipped (they are scaffolding, not story) unless a non-event
// `kind` is passed explicitly — special life beats deliberately use a
// synthetic marker as their eventId (e.g. shop purchases).
export function logTurn(
  c: CharacterState,
  eventId: string,
  choiceId: string,
  tag?: PersonalityTag,
  kind: TurnLogKind = "event",
): void {
  if (!eventId || (eventId.startsWith("__") && kind === "event")) return
  const log = c.turnLog ?? (c.turnLog = [])
  log.push({ turn: c.turn, eventId, choiceId, tag, kind })
}

// Power level is a single scalar used for scoring and matchmaking-style gates.
export function computePowerLevel(c: CharacterState): number {
  const statSum = STAT_KEYS.reduce((s, k) => s + c[k], 0)
  return fmtInt(statSum + c.fame / 5 + c.age / 2)
}

export function recomputeDerived(c: CharacterState): void {
  // Clamp stats to sane ranges. All player-facing numbers are integers, so
  // round away any fractional noise (fatigue-modified stamina, weighted gains).
  for (const k of STAT_KEYS) {
    c[k] = Math.max(0, Math.min(40, fmtInt(c[k])))
  }
  c.health = Math.max(0, Math.min(100, fmtInt(c.health)))
  c.stamina = Math.max(0, Math.min(100, fmtInt(c.stamina)))
  c.fame = Math.max(0, fmtInt(c.fame))
  c.gold = Math.max(0, fmtInt(c.gold))
  c.powerLevel = computePowerLevel(c)
  // liability: normalize (also repairs stale saves that predate the field).
  adjustLiability(c, 0)
}

// liability ("Expediente"): what the realm knows of your darker deeds.
// Gains come from shady choices and grave outcomes; slow decay per season
// keeps it from being a death spiral. Clamped 0..liabilityMax.
export function adjustLiability(c: CharacterState, delta: number): void {
  c.liability = Math.max(0, Math.min(GAME_CONFIG.liabilityMax, (c.liability ?? 0) + delta))
}

export function primaryReputation(c: CharacterState): number {
  if (c.reputations.length === 0) return 0
  return Math.max(...c.reputations.map((r) => r.value))
}

export function peakReputation(c: CharacterState): number {
  if (c.reputations.length === 0) return 0
  return Math.max(...c.reputations.map((r) => r.peakValue))
}

// Positive reputation gains are scaled up by the config knob (negative deltas
// pass through untouched) so faction standing climbs faster — the "renombre too
// slow" balance knob. Used both when applying (adjustReputation) and when
// serving the pre-pick display (serveEvent), so the card always shows exactly
// what will be applied.
export function scaledReputationDelta(delta: number): number {
  return delta > 0 ? Math.round(delta * GAME_CONFIG.reputationGainMultiplier) : delta
}

export function adjustReputation(
  c: CharacterState,
  faction: string,
  delta: number,
  scale = true,
): void {
  let rep = c.reputations.find((r) => r.faction === faction)
  if (!rep) {
    rep = { faction, value: 0, peakValue: 0 }
    c.reputations.push(rep)
  }
  // `scale: false` is for rewards that are already computed at their final
  // value (the season dividend), so the applied number matches the served one.
  const scaled = scale ? scaledReputationDelta(delta) : delta
  rep.value = Math.max(0, Math.min(100, rep.value + scaled))
  rep.peakValue = Math.max(rep.peakValue, rep.value)
}

export function reputationLabel(c: CharacterState): string {
  return reputationTierId(primaryReputation(c))
}

// Momentum shifts based on how the last few turns trended (stored in counters).
export function updateMomentum(c: CharacterState, netStatGain: number): void {
  // Shop momentum modifier (camp_seer): helps recover from bad streaks.
  const momentumMod = getActiveModifier(c, "momentumRecoveryModifier")
  const adjusted = netStatGain + (c.momentum === "falling" ? Math.abs(momentumMod) : 0)
  if (adjusted > 2) c.momentum = "rising"
  else if (adjusted < 0) c.momentum = "falling"
  else c.momentum = "normal"
}

export function adjustAffinity(
  c: CharacterState,
  npcId: string,
  delta: number,
  turn: number,
): void {
  const rel = c.relationships.find((r) => r.npcId === npcId)
  if (!rel) return
  rel.affinity = Math.max(-100, Math.min(100, rel.affinity + delta))
  rel.peakAffinity = Math.max(rel.peakAffinity, rel.affinity)
  rel.lastSeenTurn = turn
}

export function relationshipAffinityTier(c: CharacterState, npcId: string): string {
  const rel = c.relationships.find((r) => r.npcId === npcId)
  if (!rel) return "stranger"
  return affinityTierId(rel.affinity)
}

export function ensureRelationship(
  c: CharacterState,
  npcId: string,
  npcRole: string,
  turn: number,
  npcName?: string,
): RelationshipEntry {
  let rel = c.relationships.find((r) => r.npcId === npcId)
  if (!rel) {
    rel = { npcId, npcRole, npcName, affinity: 0, peakAffinity: 0, lastSeenTurn: turn }
    c.relationships.push(rel)
  } else if (npcName && !rel.npcName) {
    rel.npcName = npcName
  }
  return rel
}

export function checkFlag(c: CharacterState, flag: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(flag)) {
    const existing = c.flags[key]
    if (existing === undefined) return false
    if (value !== undefined && value !== null && existing !== value) return false
  }
  return true
}

export function setFlag(c: CharacterState, key: string, value: unknown): void {
  c.flags[key] = value
}

// ---- Combat menace (world event → creature-pool weight linkage) ------------

// The character flag that holds the active menace (a CombatMenaceState blob).
export const COMBAT_MENACE_FLAG = "combat_menace"

// The active menace, or null when none is set or it has expired. Note this
// getter has a side effect: an expired menace is deleted from c.flags (lazy
// cleanup) so stale blobs don't linger — safe anywhere the character is later
// persisted, but callers should not rely on the flag surviving a read.
export function activeMenace(c: CharacterState): CombatMenaceState | null {
  const m = c.flags[COMBAT_MENACE_FLAG] as CombatMenaceState | undefined
  if (!m) return null
  if (c.seasonCount > m.untilSeason) {
    delete c.flags[COMBAT_MENACE_FLAG]
    return null
  }
  return m
}

// Arm a menace from a rolled world event. Only sets when no menace is active
// (a second menace event doesn't overwrite progress on the first).
export function setCombatMenace(c: CharacterState, ev: EventContent): void {
  const menace = ev.combatMenace
  if (!menace || activeMenace(c)) return
  c.flags[COMBAT_MENACE_FLAG] = {
    eventId: ev.id,
    creatureIds: menace.creatureIds,
    weightMultiplier: menace.weightMultiplier,
    killTarget: menace.killTarget,
    kills: 0,
    untilSeason: c.seasonCount + menace.durationSeasons,
  }
}

// A won fight against a menaced creature counts toward resolving it. Returns
// true when the kill target is met and the menace lifts.
export function registerMenaceKill(c: CharacterState, creatureId: string): boolean {
  const m = activeMenace(c)
  if (!m || !m.creatureIds.includes(creatureId)) return false
  m.kills += 1
  if (m.kills >= m.killTarget) {
    delete c.flags[COMBAT_MENACE_FLAG]
    return true
  }
  return false
}

// Weight multiplier a combat encounter gets while an active menace targets one
// of its creatures (1 = no boost).
export function menaceWeightMultiplier(ev: EventContent, c: CharacterState): number {
  const m = activeMenace(c)
  if (!m || ev.type !== "combat" || !ev.combat) return 1
  const targets = ev.combat.creatures.some((id) => m.creatureIds.includes(id))
  return targets ? m.weightMultiplier : 1
}

export function applyClanBetrayal(c: CharacterState, newClanId: string, turn: number): void {
  const oldClanId = c.currentClanId
  if (!oldClanId) return

  const membership = c.clanMemberships.find((m) => m.clanId === oldClanId && m.leftAtTurn == null)
  if (membership) {
    membership.leftAtTurn = turn
    membership.leftReason = "betrayed"
  }

  // Reputation crash at old clan.
  adjustReputation(c, oldClanId, -30)

  // Set hunted status.
  c.huntedBy = oldClanId
  c.huntedUntilTurn = turn + GAME_CONFIG.huntedDurationTurns

  c.currentClanId = null
  // Identity: leaving a foreign clan returns you to your home region.
  c.currentRegion = c.homeRegion
}

// The region a faction belongs to (see content/regions.json).
export function regionOf(factionId: string, registry: ContentRegistry): string {
  return registry.factionsById.get(factionId)?.region ?? "vale"
}

// whether the character is currently "riding the bench" at an over-
// reaching clan (stat gains reduced while this holds).
export function isBenched(c: CharacterState): boolean {
  return c.benchedUntilTurn != null && c.turn < c.benchedUntilTurn
}

export function joinClan(
  c: CharacterState,
  clanId: string,
  turn: number,
  signingGold: number,
  registry?: ContentRegistry,
): void {
  c.currentClanId = clanId
  c.gold += signingGold
  // The run's story: joining a clan is a life beat worth remembering. Logged
  // with the faction id as the "choice" so the ending screen can name it.
  logTurn(c, "__clan_join__", clanId, undefined, "clan")
  c.clanMemberships.push({
    clanId,
    rank: "recruit",
    joinedAtTurn: turn,
    leftAtTurn: null,
    leftReason: null,
  })
  // Start reputation at 0 in the new faction.
  adjustReputation(c, clanId, 0)
  // Geography: moving to a clan updates the current region; identity
  // (homeFactionId/homeRegion) is untouched.
  if (registry) {
    c.currentRegion = regionOf(clanId, registry)
  }
  // over-reaching bench: joining a big clan below its level leaves you on
  // the bench. Tracked as a counter so the "Bench to Banner" achievement can
  // verify the rise-from-below story actually happened.
  const wealth = registry?.factionsById.get(clanId)?.wealth ?? 3
  if (wealth >= 6 && c.powerLevel < wealth * 12) {
    c.benchedUntilTurn = turn + GAME_CONFIG.benchDurationTurns
    c.counters["bench_joined"] = (c.counters["bench_joined"] ?? 0) + 1
  }
}

export function leaveClanAmicably(c: CharacterState, turn: number): void {
  const oldClanId = c.currentClanId
  if (!oldClanId) return
  const membership = c.clanMemberships.find((m) => m.clanId === oldClanId && m.leftAtTurn == null)
  if (membership) {
    membership.leftAtTurn = turn
    membership.leftReason = "retired"
  }
  c.currentClanId = null
  // Identity: solo adventurers are back in their home region.
  c.currentRegion = c.homeRegion
}

export function clearExpiredHunted(c: CharacterState): void {
  if (c.huntedBy && c.huntedUntilTurn != null && c.turn >= c.huntedUntilTurn) {
    c.huntedBy = null
    c.huntedUntilTurn = null
  }
  // the bench stint ends once the character's turn passes the deadline.
  if (c.benchedUntilTurn != null && c.turn >= c.benchedUntilTurn) {
    c.benchedUntilTurn = null
  }
}

// ---- Event eligibility + weighting ----

export function isEligible(ev: EventContent, c: CharacterState): boolean {
  if (c.age < ev.minAge || c.age > ev.maxAge) return false
  if (ev.requiresClass && ev.requiresClass !== c.class) return false
  if (ev.excludeIfCompletedIds?.some((id) => c.counters[`event_${id}`])) {
    return false
  }
  if (ev.requiresTags && ev.requiresTags.length > 0) {
    const hasTag = ev.requiresTags.some((t) => (c.personality[t] ?? 0) > 0)
    if (!hasTag) return false
  }
  // Arc gating: requiresArc means event only shows during those arcs.
  if (ev.requiresArc && ev.requiresArc.length > 0) {
    if (!ev.requiresArc.includes(c.currentArc)) return false
  }
  // Arc exclusion: excludeIfArc means event doesn't show during those arcs.
  if (ev.excludeIfArc && ev.excludeIfArc.length > 0) {
    if (ev.excludeIfArc.includes(c.currentArc)) return false
  }
  // Locked event pools: if event belongs to a locked pool, it's ineligible.
  if (c.lockedEventPools.length > 0 && ev.type === "destiny") {
    // Check if this destiny event's pool is locked.
    if (ev.id && c.lockedEventPools.includes(ev.id)) return false
  }
  if (ev.requiresRelationshipId) {
    if (!c.relationships.some((r) => r.npcId === ev.requiresRelationshipId)) return false
  }
  if (ev.requiresFlag) {
    if (!checkFlag(c, ev.requiresFlag)) return false
  }
  if (ev.requiresClanId) {
    if (c.currentClanId !== ev.requiresClanId) return false
  }
  if (ev.requiresNoClan) {
    if (c.currentClanId != null) return false
  }
  if (ev.excludesIfClanId) {
    if (c.currentClanId === ev.excludesIfClanId) return false
  }
  if (ev.requiresHuntedBy) {
    if (!c.huntedBy) return false
  }
  // geography axis: "outsider" events only while away from home, and the
  // home-region pool only while there. Identity (homeRegion) is never touched.
  if (ev.requiresForeign) {
    if (c.currentRegion === c.homeRegion) return false
  }
  if (ev.requiresHomeRegion) {
    if (c.currentRegion !== c.homeRegion) return false
  }
  // region-gated event variants: same archetype, current-region dressing.
  if (ev.requiresRegion) {
    if (c.currentRegion !== ev.requiresRegion) return false
  }
  // origin-gated pools (underdog / privileged flavor).
  if (ev.requiresOrigin) {
    if (c.origin !== ev.requiresOrigin) return false
  }
  if (ev.involvesRival && !c.rival) return false
  // liability gate: dark-path events only show once your deeds have
  // accumulated enough to draw the underworld's attention.
  if (ev.requiresLiability) {
    if ((c.liability ?? 0) < ev.requiresLiability.min) return false
  }
  return true
}

// Does the character have at least one playable choice in this event? A choice
// is playable when it is ungated or its stat requirement is met. Guard used by
// selectEvent so a player is never handed a card set they cannot act on — an
// event whose choices are ALL stat-locked would soft-lock the run.
export function hasPlayableChoice(ev: EventContent, c: CharacterState): boolean {
  const choices = ev.choices ?? []
  if (choices.length === 0) return false
  return choices.some((ch) => !ch.requiresStat || c[ch.requiresStat.stat] >= ch.requiresStat.min)
}

// Momentum nudges the effective weight so runs feel like they have streaks.
// An active combat menace also boosts matching combat encounters.
export function effectiveWeight(ev: EventContent, c: CharacterState): number {
  let w = ev.weight
  if (c.momentum === "rising" && ev.location === "court") w *= 1.3
  if (c.momentum === "falling" && ev.location === "dungeon") w *= 1.3
  w *= menaceWeightMultiplier(ev, c)
  return w
}

// ---- Serving events to the client (strip hidden fields) ----

// minutes-signal for a clan-join offer: bench (below its level), same
// (right-sized), up (arriving above the level you'd be slotted into).
export function roleSignalFor(
  c: CharacterState,
  factionId: string,
  registry: ContentRegistry,
): RoleSignal {
  const wealth = registry.factionsById.get(factionId)?.wealth ?? 3
  if (wealth >= 6 && c.powerLevel < wealth * 12) return "bench"
  if (c.powerLevel >= wealth * 18) return "up"
  return "same"
}

export function serveEvent(
  ev: EventContent,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
  isRetirementOffer: boolean,
): ServedEvent {
  const narrative = fillSlots(localize(ev.narrative, locale), locale, registry, rng, c)
  const flagLabel = ev.flagLabel ? localize(ev.flagLabel, locale) : undefined

  // Combat encounters are multi-round fights served as a combat frame. The
  // initial view initializes the persisted state once (creature pick from the
  // run Rng); resume re-serves from the persisted state, Rng-free.
  if (ev.combat) {
    const view = prepareCombatServe(ev, c, locale, registry, rng)
    return {
      eventId: ev.id,
      narrative,
      choices: [],
      isRetirementOffer,
      flagLabel,
      hasTraps: false,
      combat: { view },
    }
  }
  // Interactive minigames are multi-move games (tictactoe / rps) served as a
  // game frame instead of a card grid. The initial view is Rng-free and the
  // persisted state is initialized here once per event.
  const isInteractive = ev.resolution?.type === "interactive"
  if (isInteractive) {
    const view = prepareInteractiveServe(ev, c, locale)
    const opponentName = interactiveOpponentName(ev, c, locale)
    return {
      eventId: ev.id,
      narrative,
      choices: [],
      isRetirementOffer,
      flagLabel,
      hasTraps: false,
      interactive: { game: ev.resolution!.game ?? "tictactoe", opponentName, view },
    }
  }

  // Minigames present their cards as choices; regular events present choices.
  const isMinigame = ev.type === "minigame" || Boolean(ev.cards)
  let choices: ServedChoice[]
  if (isMinigame && ev.cards) {
    choices = ev.cards.map((card) => ({
      id: card.id,
      label: fillSlots(localize(card.label, locale), locale, registry, rng, c),
      icon: card.icon,
      tag: card.tag,
      rarity: "uncommon" as Rarity,
    }))
    // Cards keep their authored order (no rarity reveal sort for minigames).
  } else {
    choices = (ev.choices ?? []).map((ch) => ({
      id: ch.id,
      label: fillSlots(localize(ch.label, locale), locale, registry, rng, c),
      tag: ch.tag,
      rarity: ch.rarity,
      statDeltas: ch.statDeltas,
      tradeoffDeltas: ch.tradeoffDeltas,
      fameDelta: ch.fameDelta,
      // Display the scaled gain so the pre-pick card matches what actually
      // applies (adjustReputation applies the same scaled value).
      reputationDelta:
        ch.reputationDelta != null ? scaledReputationDelta(ch.reputationDelta) : undefined,
      goldDelta: ch.goldDelta,
      factionId: ch.factionId ?? ch.joinClanId ?? ch.reputationFaction,
      stipend: ch.stipend,
      roleSignal: ch.joinClanId ? roleSignalFor(c, ch.joinClanId, registry) : undefined,
      riskLabel: ch.riskLabel
        ? fillSlots(localize(ch.riskLabel, locale), locale, registry, rng, c)
        : undefined,
      // Stat gating: the served choice carries the requirement plus whether
      // the current character meets it, so the client can render locked state.
      requiresStat: ch.requiresStat,
      statMet: ch.requiresStat ? c[ch.requiresStat.stat] >= ch.requiresStat.min : undefined,
      // liability: warn the player when a pick stains the record.
      liabilityDelta: ch.liabilityDelta,
    }))
    // Sort so rarer, more interesting choices read last (feels like a reveal).
    choices.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
  }
  // Urn mechanic: hint that a trap lurks among the cards (never which one).
  const hasTraps = isMinigame && ev.cards ? ev.cards.some((k) => k.trap) : false
  return { eventId: ev.id, narrative, choices, isRetirementOffer, flagLabel, hasTraps }
}

export function statLabelKeys(): readonly StatKey[] {
  return STAT_KEYS
}

// Market value: fluctuates independently of gold. Represents the character's
// worth on the open market (prize money, bounty, sponsorship, etc.).
export function computeMarketValue(c: CharacterState): number {
  const agePenalty = c.age > 35 ? (c.age - 35) * 100 : 0
  return Math.max(0, c.powerLevel * 50 + c.fame * 10 + c.achievements.length * 200 - agePenalty)
}

export function updateMarketValue(c: CharacterState): void {
  c.marketValue = computeMarketValue(c)
  if (c.marketValue > c.marketValuePeak) {
    c.marketValuePeak = c.marketValue
  }
}

// Stamina: each turn costs 1 base stamina. If stamina < 20, apply a fatigue
// penalty to all stat gains. Recovery happens through shop items or rest events.
export const STAMINA_BASE_COST = 1
export const STAMINA_FATIGUE_THRESHOLD = 20
export const FATIGUE_MULTIPLIER = 0.5

// Read aggregate modifier value for a given effect type from owned inventory.
// Retinue items apply their effect value as a flat sum; consumables with the same
// effect type stack additively while active.
export function getActiveModifier(c: CharacterState, effectType: string): number {
  let total = 0
  for (const entry of c.inventory) {
    // Shop item effects are looked up from content data; we don't store them
    // on the inventory entry, so we match by known item ids.
    const MOD_MAP: Record<string, { type: string; value: number }> = {
      camp_cook: { type: "fatigueModifier", value: -0.15 },
      battle_healer: { type: "injuryRiskModifier", value: -0.15 },
      camp_seer: { type: "momentumRecoveryModifier", value: -0.2 },
      weapon_master: { type: "ageDeclineDelay", value: 3 },
      guild_herald: { type: "offerQualityModifier", value: 0.15 },
      season_healer: { type: "injuryRiskModifier", value: -0.1 },
    }
    const mod = MOD_MAP[entry.itemId]
    if (mod && mod.type === effectType) {
      total += mod.value * entry.qty
    }
  }
  return total
}

export function deductStamina(c: CharacterState, extraCost = 0): void {
  const fatigueMod = getActiveModifier(c, "fatigueModifier")
  const cost = Math.max(0, STAMINA_BASE_COST + extraCost + fatigueMod)
  c.stamina = Math.max(0, c.stamina - cost)
  // Track consecutive turns spent at 0 stamina so the engine can force recovery.
  c.staminaZeroStreak = c.stamina <= 0 ? (c.staminaZeroStreak ?? 0) + 1 : 0
}

export function isFatigued(c: CharacterState): boolean {
  return c.stamina < STAMINA_FATIGUE_THRESHOLD
}

// Age-related stat decline: after ageRiskStart, stats decay each season.
// "weapon_master" retinue delays this by adding years to the effective start.
export function ageDeclineStart(c: CharacterState): number {
  const delay = getActiveModifier(c, "ageDeclineDelay")
  return GAME_CONFIG.ageRiskStart + delay
}

export function applyAgeDecline(c: CharacterState): void {
  const declineStart = ageDeclineStart(c)
  if (c.age <= declineStart) return
  const yearsOver = c.age - declineStart
  if (yearsOver % 3 === 0) {
    // Every 3 years past decline start, lose 1 from every physical stat.
    const physicalStats = STAT_KEYS.filter((k) => k !== "intelligence" && k !== "charisma")
    for (const k of physicalStats) {
      if (c[k] > 0) c[k] -= 1
    }
  }
}

// ---- Rival seasonal focus ----

// Localized label for a rival's seasonal focus id (see RIVAL_FOCUSES in
// config). Empty string for unknown/legacy ids so callers can omit the clause.
export function rivalFocusLabel(focusId: string | undefined, locale: Locale): string {
  const focus = RIVAL_FOCUSES.find((f) => f.id === focusId)
  if (!focus) return ""
  return localize(focus.label, locale)
}

// The season-summary rival update line: who, where, their seasonal focus, the
// faction they ride with, and power/score. When the rival switched factions on
// this season's advance (factionSwitchTurn === c.turn), the move is narrated
// as the headline — "abandoned X for Y" — exactly once, since the turn
// advances past it on the next serve. Shared by the engine serve path and the
// /state resume route so the text never drifts between live serve and reload.
export function buildRivalUpdate(
  c: CharacterState,
  registry: ContentRegistry,
  locale: Locale,
): string {
  const rv = c.rival
  if (!rv) return ""
  const rvClassName = registry.classesById.get(rv.class)?.name
  const rvClass = rvClassName ? localize(rvClassName, locale) : rv.class
  const focus = rivalFocusLabel(rv.focusId, locale)
  const focusClause = focus
    ? locale === "en"
      ? `, chasing ${focus}`
      : `, persiguiendo ${focus}`
    : ""
  const faction = rv.factionId ? registry.factionsById.get(rv.factionId) : undefined
  const factionName = faction ? localize(faction.name, locale) : ""
  const justSwitched = rv.factionSwitchTurn != null && rv.factionSwitchTurn === c.turn
  // The switch itself is the news; the plain "riding with" clause is for the
  // seasons where they stay put.
  let factionClause = ""
  if (justSwitched && factionName) {
    const oldFaction = rv.lastFactionId ? registry.factionsById.get(rv.lastFactionId) : undefined
    const oldName = oldFaction ? localize(oldFaction.name, locale) : ""
    factionClause =
      locale === "en"
        ? oldName
          ? ` — and has abandoned the ${oldName} for the ${factionName}!`
          : ` — and has pledged to the ${factionName}!`
        : oldName
          ? ` — y ha abandonado ${oldName} para unirse a ${factionName}!`
          : ` — y ha jurado lealtad a ${factionName}!`
  } else if (factionName) {
    factionClause =
      locale === "en" ? `, riding with the ${factionName}` : `, cabalgando con ${factionName}`
  }
  return locale === "en"
    ? `${rv.name} (${rvClass}) is active in ${localizeLocation(rv.location, locale)}${focusClause}${factionClause}. Power: ${rv.powerLevel}, score: ${rv.score}`
    : `${rv.name} (${rvClass}) está activo en ${localizeLocation(rv.location, locale)}${focusClause}${factionClause}. Poder: ${rv.powerLevel}, puntos: ${rv.score}`
}

const LOCALE_LOCATION: Record<string, string> = {
  "the northern reaches": "las fronteras del norte",
  "the capital": "la capital",
  "the wildlands": "las tierras salvajes",
  "distant shores": "costas lejanas",
  "the court": "la corte",
}

export function localizeLocation(location: string, locale: Locale): string {
  if (locale === "en") return location
  return LOCALE_LOCATION[location] ?? location
}

// ---- Season grade & headline ----

// The season summary grade (1-10) from power/fame/counters, plus the optional
// swing from a resolved season-end capstone (debate verdict / urn draw).
export function computeSeasonGrade(c: CharacterState, capstoneDelta = 0): number {
  const base = Math.round(
    Math.min(
      10,
      Math.max(
        1,
        c.powerLevel / 10 +
          c.fame / 20 +
          (c.counters["battles_won"] ?? 0) * 0.2 +
          (c.counters["quests_completed"] ?? 0) * 0.1,
      ),
    ),
  )
  return Math.max(1, Math.min(10, base + capstoneDelta))
}

export function seasonHeadline(grade: number, locale: Locale): string {
  return grade >= 8
    ? locale === "en"
      ? "A Season of Glory"
      : "Una Temporada de Gloria"
    : grade >= 5
      ? locale === "en"
        ? "A Steady Season"
        : "Una Temporada Estable"
      : locale === "en"
        ? "A Season of Hardship"
        : "Una Temporada de Dificultades"
}

// "The bards sing": renown earned at the season boundary, scaled by the season
// grade. Fame always accrues; standing with the current faction accrues only
// while the character belongs to one (a solo wanderer has no faction to thank).
// Computed deterministically from the character + capstone verdict, and shared
// by the serve path, the /state resume path, and resolveSeasonSummary so the
// displayed amounts always match what gets applied.
export function seasonRenownGains(
  c: CharacterState,
  capstoneDelta = 0,
): { fame: number; reputation: number } {
  const grade = computeSeasonGrade(c, capstoneDelta)
  return {
    fame: grade * GAME_CONFIG.seasonFamePerGrade,
    reputation: c.currentClanId ? grade * GAME_CONFIG.seasonReputationPerGrade : 0,
  }
}

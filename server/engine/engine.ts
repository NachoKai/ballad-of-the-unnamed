import type {
  ArchetypeContent,
  CharacterState,
  EndingType,
  EventContent,
  FinaleChoice,
  FinaleStage,
  Locale,
  MinigameOutcome,
  OutcomeTier,
  Rarity,
  RivalState,
  ServedClanOffer,
  ServedEvent,
  StatDeltas,
} from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import { Rng } from "../../shared/rng.js"
import { CLAN_SPECIALTIES, GAME_CONFIG, arcForAge, RIVAL_NAMES } from "../../shared/config.js"
import type { ContentRegistry } from "../content/registry.js"
import {
  adjustAffinity,
  adjustReputation,
  applyAgeDecline,
  applyClanBetrayal,
  clearExpiredHunted,
  deductStamina,
  effectiveWeight,
  ensureRelationship,
  fillSlots,
  getActiveModifier,
  isFatigued,
  isEligible,
  localizeLocation,
  joinClan,
  leaveClanAmicably,
  localize,
  primaryReputation,
  recomputeDerived,
  serveEvent,
  setFlag,
  updateMarketValue,
  updateMomentum,
} from "./helpers.js"
import { generateFinaleStage1, generateFinaleStage2 } from "./finale.js"

// ---------------------------------------------------------------------------
// Character creation
// ---------------------------------------------------------------------------

export function createCharacter(input: {
  id: string
  name: string
  classId: string
  archetypeId?: string | null
  locale: Locale
  registry: ContentRegistry
}): CharacterState {
  const { registry } = input
  const cls = registry.classesById.get(input.classId)
  if (!cls) throw new Error(`unknown class ${input.classId}`)

  let archetype: ArchetypeContent | undefined
  if (input.archetypeId) {
    const pool = registry.archetypes[input.classId] ?? []
    archetype = pool.find((a) => a.id === input.archetypeId)
    if (!archetype)
      throw new Error(`unknown archetype ${input.archetypeId} for class ${input.classId}`)
  }

  const base: CharacterState = {
    id: input.id,
    name: input.name,
    class: cls.id,
    archetype: archetype?.id ?? null,
    epithet: null,
    age: GAME_CONFIG.startingAge,
    currentArc: arcForAge(GAME_CONFIG.startingAge),
    strength: cls.base.strength + (archetype?.statDeltas.strength ?? 0),
    dexterity: cls.base.dexterity + (archetype?.statDeltas.dexterity ?? 0),
    constitution: cls.base.constitution + (archetype?.statDeltas.constitution ?? 0),
    intelligence: cls.base.intelligence + (archetype?.statDeltas.intelligence ?? 0),
    charisma: cls.base.charisma + (archetype?.statDeltas.charisma ?? 0),
    seasonCount: 0,
    inventory: [],
    lockedEventPools: [],
    stamina: GAME_CONFIG.startingStamina,
    health: GAME_CONFIG.startingHealth,
    fame: 0,
    gold: cls.startingGold ?? 20,
    marketValue: (cls.startingGold ?? 20) * 2,
    marketValuePeak: (cls.startingGold ?? 20) * 2,
    momentum: "normal",
    status: "alive",
    locale: input.locale,
    turn: 0,
    powerLevel: 0,
    counters: {},
    reputations: cls.startingFaction
      ? [{ faction: cls.startingFaction, value: 10, peakValue: 10 }]
      : [],
    personality: {},
    achievements: [],
    // Social & World Systems
    relationships: [],
    rival: null,
    currentClanId: null,
    huntedBy: null,
    huntedUntilTurn: null,
    clanMemberships: [],
    flags: {},
    finaleStage2Choice: undefined,
  }
  recomputeDerived(base)
  return base
}

// ---------------------------------------------------------------------------
// Deciding what event to serve this turn
// ---------------------------------------------------------------------------

function isRetirementTurn(c: CharacterState): boolean {
  if (c.age < GAME_CONFIG.retirementEligibleAge) return false
  return c.turn % GAME_CONFIG.retirementOfferEvery === 0
}

export function wouldBeDestinyTurn(c: CharacterState): boolean {
  if (c.turn === 0) return false
  const yearsPlayed = Math.floor(c.turn / GAME_CONFIG.turnsPerYear)
  return yearsPlayed > 0 && yearsPlayed % GAME_CONFIG.destinyCardYears === 0 && c.age >= 16
}

// ---------------------------------------------------------------------------
// Rival generation
// ---------------------------------------------------------------------------

export function generateRival(c: CharacterState, registry: ContentRegistry, rng: Rng): RivalState {
  const classes = registry.classes
  const otherClasses = classes.filter((cls) => cls.id !== c.class)
  const rivalClass = otherClasses.length > 0 ? rng.pick(otherClasses).id : c.class
  const name = rng.pick(RIVAL_NAMES)
  const rivalFactions = registry.factions.filter((f) => f.id !== c.reputations[0]?.faction)
  const faction = rivalFactions.length > 0 ? rng.pick(rivalFactions).id : null
  return {
    name,
    class: rivalClass,
    factionId: faction,
    powerLevel: c.powerLevel - rng.int(0, 5),
    age: c.age,
    location: "distant lands",
    achievementsCount: 0,
    score: 0,
    lastAdvancedTurn: 0,
  }
}

// ---------------------------------------------------------------------------
// World event rolling
// ---------------------------------------------------------------------------

export function rollWorldEvents(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { headline: string; narrative: string }[] {
  const results: { headline: string; narrative: string }[] = []
  const worldPool = registry.events.filter((e) => e.type === "world" && isEligible(e, c))
  const count = Math.min(GAME_CONFIG.worldEventsPerSeason, worldPool.length)
  for (let i = 0; i < count; i++) {
    const ev = rng.pick(worldPool)
    if (!ev) continue
    const headline = ev.worldEventHeadline
      ? fillSlots(localize(ev.worldEventHeadline, c.locale), c.locale, registry, rng)
      : "The World Turns"
    const narrative = fillSlots(localize(ev.narrative, c.locale), c.locale, registry, rng)
    results.push({ headline, narrative })
  }
  return results
}

// ---------------------------------------------------------------------------
// Clan offer generation
// ---------------------------------------------------------------------------

export function generateClanOffer(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { offers: ServedClanOffer[] } {
  const factions = registry.factions.filter((f) => f.id !== c.currentClanId)
  const shuffled = [...factions].sort(() => rng.next() - 0.5)
  const count = Math.min(3, shuffled.length)
  const offers: ServedClanOffer[] = []
  for (let i = 0; i < count; i++) {
    const f = shuffled[i]
    const specialty = rng.pick(CLAN_SPECIALTIES)
    const qualityMod = getActiveModifier(c, "offerQualityModifier")
    const signingGold = Math.round(
      (500 + c.fame * 10 + c.powerLevel * 5) * (0.5 + rng.next() * 1.0) * (1 + qualityMod),
    )
    offers.push({
      clanId: f.id,
      name: localize(f.name, c.locale),
      specialty: localize(specialty.label, c.locale),
      signingGold,
      perkLabel: `+${Math.floor(signingGold / 500)} renown`,
      icon: "🏛️",
    })
  }
  return { offers }
}

// ---------------------------------------------------------------------------
// Rival advancement at season boundary
// ---------------------------------------------------------------------------

export function advanceRival(c: CharacterState, rng: Rng): void {
  if (!c.rival) return
  c.rival.age = c.age
  c.rival.powerLevel += rng.int(-1, 3)
  c.rival.powerLevel = Math.max(0, c.rival.powerLevel)
  c.rival.achievementsCount += rng.bool(0.15) ? 1 : 0
  c.rival.score += rng.int(0, 5)
  c.rival.lastAdvancedTurn = c.turn
  // Random flavor updates.
  const locations = [
    "the northern reaches",
    "the capital",
    "the wildlands",
    "distant shores",
    "the court",
  ]
  c.rival.location = rng.pick(locations)
}

// Pick the event/minigame for the upcoming turn. Deterministic via the run rng.
export function selectEvent(c: CharacterState, registry: ContentRegistry, rng: Rng): EventContent {
  // Destiny events: roughly once every destinyCardYears in-game years.
  if (wouldBeDestinyTurn(c)) {
    const destinyPool = registry.events.filter((e) => e.type === "destiny" && isEligible(e, c))
    if (destinyPool.length > 0) {
      return rng.weighted(destinyPool, (ev) => effectiveWeight(ev, c))
    }
  }
  // Occasionally offer a minigame instead of a normal event.
  const pool: EventContent[] = []
  const wantMinigame = rng.bool(0.28)
  const candidates = wantMinigame ? registry.minigames : registry.events
  for (const ev of candidates) {
    if (ev.type === "destiny") continue
    if (isEligible(ev, c)) pool.push(ev)
  }
  // Fallback: if the chosen pool is empty, try the other pool, then any event.
  const finalPool = pool.length > 0 ? pool : registry.events.filter((e) => isEligible(e, c))
  if (finalPool.length === 0) {
    // Absolute fallback: first event ignoring gating.
    return registry.events[0]
  }
  return rng.weighted(finalPool, (ev) => effectiveWeight(ev, c))
}

// A synthetic season-summary event (generated server-side at season boundaries).
export function generateSeasonSummary(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): EventContent {
  // Clear expired hunted status and advance rival at season boundary.
  clearExpiredHunted(c)
  if (c.rival) {
    advanceRival(c, rng)
  }
  return {
    id: "__season_summary__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    narrative: {
      en: `Season ${c.seasonCount + 1} draws to a close. The road ahead stretches, and your legend grows.`,
      es: `La temporada ${c.seasonCount + 1} llega a su fin. El camino se extiende y tu leyenda crece.`,
    },
    choices: [
      {
        id: "continue",
        rarity: "common" as Rarity,
        label: { en: "Continue", es: "Continuar" },
        narrative: {
          en: "Onward. There is more to come.",
          es: "Adelante. Queda mucho por venir.",
        },
      },
    ],
  }
}

// A synthetic retirement-offer event (not authored in content).
export function retirementOfferEvent(): EventContent {
  return {
    id: "__retirement_offer__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "court",
    narrative: {
      en: "The years sit heavier now. Word has spread of your deeds, and a quiet estate could be yours. Do you hang up the blade, or ride on?",
      es: "Los años pesan más. Se habla de tus hazañas, y una hacienda tranquila podría ser tuya. ¿Cuelgas la espada o sigues cabalgando?",
    },
    choices: [
      {
        id: "retire",
        rarity: "rare" as Rarity,
        label: {
          en: "Retire with honor",
          es: "Retirarse con honor",
        },
        narrative: {
          en: "You lay down the blade while the songs are still kind.",
          es: "Dejas la espada mientras las canciones aún son amables.",
        },
      },
      {
        id: "ride_on",
        rarity: "common" as Rarity,
        label: { en: "Ride on", es: "Seguir cabalgando" },
        narrative: {
          en: "Not yet. There is more road, and more to prove.",
          es: "Todavía no. Queda camino, y queda mucho por demostrar.",
        },
        statDeltas: { constitution: 1 },
      },
    ],
  }
}

export function buildServedEvent(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { event: EventContent; served: ServedEvent; finaleStage?: FinaleStage } {
  // Finale stage 2: outcome narrative with a single "continue" button.
  if (c.finaleStage2Choice) {
    const stage2 = generateFinaleStage2(
      c,
      c.finaleStage2Choice.endingType,
      c.finaleStage2Choice.risky
        ? ({ id: "finale_risky" } as FinaleChoice)
        : ({ id: "finale_safe" } as FinaleChoice),
      registry,
      rng,
      c.locale,
    )
    const ev: EventContent = {
      id: "__finale_outcome__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      narrative: stage2.narrative,
      choices: [
        {
          id: "continue",
          rarity: "common" as Rarity,
          label: { en: "The end", es: "El final" },
          narrative: { en: "The story closes.", es: "La historia se cierra." },
        },
      ],
    }
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: stage2,
    }
  }
  // Finale stage 1: if pendingFinaleType is set, serve the risky/safe choice.
  if (c.pendingFinaleType) {
    const endingType = c.pendingFinaleType
    const stage = generateFinaleStage1(c, endingType, registry, rng, c.locale)
    const ev: EventContent = {
      id: "__finale__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      narrative: stage.narrative,
      choices: (stage.choices ?? []).map((ch) => ({
        id: ch.id,
        rarity: "rare" as Rarity,
        label: ch.label,
        narrative: ch.narrative,
        statDeltas: ch.statDeltas,
        fameDelta: ch.fameDelta,
        goldDelta: ch.goldDelta,
        reputationDelta: ch.reputationDelta,
        reputationFaction: ch.reputationFaction,
        healthDelta: ch.healthDelta,
      })),
    }
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: stage,
    }
  }
  // Season boundary: after every seasonLength turns, serve the season summary.
  if (c.turn > 0 && c.turn % GAME_CONFIG.seasonLength === 0) {
    const ev = generateSeasonSummary(c, registry, rng)
    const served = serveEvent(ev, c, c.locale, registry, rng, false)
    served.isSeasonSummary = true
    const grade = Math.round(
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
    served.seasonGrade = grade
    served.seasonHeadline =
      grade >= 8
        ? c.locale === "en"
          ? "A Season of Glory"
          : "Una Temporada de Gloria"
        : grade >= 5
          ? c.locale === "en"
            ? "A Steady Season"
            : "Una Temporada Estable"
          : c.locale === "en"
            ? "A Season of Hardship"
            : "Una Temporada de Dificultades"

    // Roll world events and embed in season summary.
    served.worldEvents = rollWorldEvents(c, registry, rng)

    // Rival update.
    if (c.rival) {
      const rv = c.rival
      const rvClassName = registry.classesById.get(rv.class)?.name
      const rvClass = rvClassName ? localize(rvClassName, c.locale) : rv.class
      served.rivalUpdate =
        c.locale === "en"
          ? `${rv.name} (${rvClass}) is active in ${localizeLocation(rv.location, c.locale)}. Power: ${rv.powerLevel}, score: ${rv.score}`
          : `${rv.name} (${rvClass}) está activo en ${localizeLocation(rv.location, c.locale)}. Poder: ${rv.powerLevel}, puntos: ${rv.score}`
    }

    return { event: ev, served, finaleStage: undefined }
  }
  // Clan offer: ~8% chance for clanless characters (not on season/retirement turns).
  if (!c.currentClanId && rng.bool(0.08)) {
    const { offers } = generateClanOffer(c, registry, rng)
    const ev: EventContent = {
      id: "__clan_offer__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      narrative: {
        en: "A messenger arrives with offers from several factions seeking your allegiance...",
        es: "Un mensajero llega con ofertas de varias facciones buscando tu lealtad...",
      },
      choices: offers.map((o) => {
        const faction = registry.factions.find((f) => f.id === o.clanId)
        return {
          id: `join_${o.clanId}`,
          rarity: "uncommon" as Rarity,
          label: faction?.name ?? { en: o.name, es: o.name },
          narrative: { en: o.perkLabel, es: o.perkLabel },
          joinClanId: o.clanId,
        }
      }),
    }
    const served = serveEvent(ev, c, c.locale, registry, rng, false)
    served.isClanOffer = true
    served.clanOfferChoices = offers
    return { event: ev, served, finaleStage: undefined }
  }
  if (isRetirementTurn(c)) {
    const ev = retirementOfferEvent()
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, true),
      finaleStage: undefined,
    }
  }
  const ev = selectEvent(c, registry, rng)
  return {
    event: ev,
    served: serveEvent(ev, c, c.locale, registry, rng, false),
    finaleStage: undefined,
  }
}

// Resolve a season summary event: advance season, clean up expired inventory.
export function resolveSeasonSummary(c: CharacterState): void {
  c.seasonCount += 1
  c.turn += 1
  // Clean up expired consumables.
  c.inventory = c.inventory.filter((entry) => {
    if (entry.expiresAtTurn && entry.expiresAtTurn <= c.turn) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Applying deltas
// ---------------------------------------------------------------------------

function computeTagSynergy(
  c: CharacterState,
  choice: { wantedTags?: Record<string, number>; punishedTags?: Record<string, number> },
): number {
  let synergy = 0
  if (choice.wantedTags) {
    for (const [tag, bonus] of Object.entries(choice.wantedTags)) {
      if ((c.personality[tag] ?? 0) > 0) synergy += bonus
    }
  }
  if (choice.punishedTags) {
    for (const [tag, malus] of Object.entries(choice.punishedTags)) {
      if ((c.personality[tag] ?? 0) > 0) synergy += malus
    }
  }
  return synergy
}

function applyStatDeltas(c: CharacterState, deltas?: StatDeltas, multiplier = 1): number {
  if (!deltas) return 0
  let net = 0
  const fatigue = isFatigued(c) ? 0.5 : 1
  for (const k of STAT_KEYS) {
    if (deltas[k]) {
      const raw = deltas[k] as number
      const adjusted = raw > 0 ? Math.round(raw * fatigue * multiplier) : raw
      c[k] += adjusted
      net += adjusted
    }
  }
  return net
}

function bumpCounter(c: CharacterState, key: string, by = 1): void {
  c.counters[key] = (c.counters[key] ?? 0) + by
}

// Track drawn-card rarity for the collection-style achievements.
function recordRarity(c: CharacterState, rarity: Rarity): void {
  if (rarity === "rare") bumpCounter(c, "rare_cards")
  if (rarity === "volatile") bumpCounter(c, "legendary_cards")
}

// ---------------------------------------------------------------------------
// Death / aging
// ---------------------------------------------------------------------------

function rollDeath(c: CharacterState, pendingInjuryRisk: number, rng: Rng): boolean {
  // Shop item injury risk modifier (battle_healer, season_healer).
  const shopMitigation = getActiveModifier(c, "injuryRiskModifier")
  // Injury/accident risk from the chosen outcome, mitigated by constitution + shop.
  const conMitigation = Math.min(0.4, c.constitution * 0.01)
  const injuryChance = Math.max(0, pendingInjuryRisk - conMitigation + shopMitigation)
  if (injuryChance > 0 && rng.bool(injuryChance)) return true

  // Age-based background risk after ageRiskStart.
  if (c.age >= GAME_CONFIG.ageRiskStart) {
    const ageRisk = (c.age - GAME_CONFIG.ageRiskStart) * 0.012
    if (rng.bool(ageRisk)) return true
  }
  // Health depletion.
  if (c.health <= 0) return true
  return false
}

function ageUp(c: CharacterState): void {
  if (c.turn % GAME_CONFIG.turnsPerYear === 0) {
    c.age += 1
    c.currentArc = arcForAge(c.age)
    applyAgeDecline(c)
  }
}

// ---------------------------------------------------------------------------
// Resolve a regular-event choice
// ---------------------------------------------------------------------------

export interface ResolveOutput {
  narrative: string
  ended: boolean
  endingType?: EndingType
  chosenRarity: Rarity
  wonBattle: boolean
  completedQuest: boolean
}

export function resolveChoice(
  c: CharacterState,
  event: EventContent,
  choiceId: string,
  registry: ContentRegistry,
  rng: Rng,
): ResolveOutput {
  const choice = (event.choices ?? []).find((ch) => ch.id === choiceId)
  if (!choice) throw new Error(`unknown choice ${choiceId} for event ${event.id}`)

  c.turn += 1
  recordRarity(c, choice.rarity)

  // Personality: award the tag associated with the choice.
  if (choice.tag) {
    c.personality[choice.tag] = (c.personality[choice.tag] ?? 0) + 1
  }

  let ended = false
  let endingType: EndingType | undefined

  // Personality tag synergy: past choices amplify present outcomes.
  const tagSynergy = 1 + computeTagSynergy(c, choice)

  // Retirement handling — now sets up the two-stage finale instead of ending immediately.
  if (event.id === "__retirement_offer__" && choice.id === "retire") {
    c.status = "retired"
    c.pendingFinaleType = heroicOrPeaceful(c, "retirement")
    ended = false
  }

  // Finale stage 1 resolution: apply the risky/safe choice, generate stage 2.
  if (event.id === "__finale__") {
    endingType = c.pendingFinaleType
    c.pendingFinaleType = undefined
    c.finaleStage2Choice = {
      endingType: endingType as EndingType,
      risky: choice.id === "finale_risky",
    }
    ended = false
  }

  // Finale stage 2 resolution: the story ends.
  if (event.id === "__finale_outcome__") {
    endingType = c.finaleStage2Choice?.endingType
    c.finaleStage2Choice = undefined
    ended = true
  }

  // Season summary handling.
  if (event.id === "__season_summary__") {
    resolveSeasonSummary(c)
    return {
      narrative: "",
      ended: false,
      endingType: undefined,
      chosenRarity: "common" as Rarity,
      wonBattle: false,
      completedQuest: false,
    }
  }

  // Destiny pool effects: lock/unlock event pools.
  if (choice.unlocksEventPool) {
    for (const poolId of choice.unlocksEventPool) {
      const idx = c.lockedEventPools.indexOf(poolId)
      if (idx !== -1) c.lockedEventPools.splice(idx, 1)
    }
  }
  if (choice.locksEventPool) {
    for (const poolId of choice.locksEventPool) {
      if (!c.lockedEventPools.includes(poolId)) {
        c.lockedEventPools.push(poolId)
      }
    }
  }

  // NPC relationship effects.
  if (choice.introducesRelationshipId) {
    ensureRelationship(
      c,
      choice.introducesRelationshipId,
      choice.introducesNpcRole ?? "acquaintance",
      c.turn,
      choice.introducesNpcName?.[c.locale] ?? undefined,
    )
  }
  if (choice.affinityDelta && event.requiresRelationshipId) {
    adjustAffinity(c, event.requiresRelationshipId, choice.affinityDelta, c.turn)
  } else if (choice.affinityDelta && choice.introducesRelationshipId) {
    adjustAffinity(c, choice.introducesRelationshipId, choice.affinityDelta, c.turn)
  }

  // Long-term flag setting.
  if (choice.setsFlag) {
    for (const [key, value] of Object.entries(choice.setsFlag)) {
      setFlag(c, key, value)
    }
  }

  // Clan joining through a choice.
  if (choice.joinClanId) {
    // If currently in a clan, this is a betrayal.
    if (c.currentClanId) {
      applyClanBetrayal(c, choice.joinClanId, c.turn)
    }
    const signingGold = Math.round(500 + c.fame * 10)
    joinClan(c, choice.joinClanId, c.turn, signingGold)
  }

  // Leaving a clan amicably.
  if (choice.leaveReason) {
    leaveClanAmicably(c, c.turn)
  }

  const net = applyStatDeltas(c, choice.statDeltas, tagSynergy)
  applyStatDeltas(c, choice.tradeoffDeltas, tagSynergy)
  if (choice.goldDelta) c.gold += choice.goldDelta
  if (choice.fameDelta) c.fame += choice.fameDelta
  if (choice.staminaDelta) c.stamina += choice.staminaDelta
  if (choice.healthDelta) c.health += choice.healthDelta
  if (choice.reputationDelta) {
    adjustReputation(c, choice.reputationFaction ?? defaultFaction(c), choice.reputationDelta)
  }

  // Counters for scoring / achievements.
  const wonBattle =
    Boolean(choice.countersDelta?.battles_won) || (event.location === "dungeon" && net > 0)
  const completedQuest = Boolean(choice.countersDelta?.quests_completed)
  if (choice.countersDelta) {
    for (const [k, v] of Object.entries(choice.countersDelta)) bumpCounter(c, k, v)
  }
  if (wonBattle && !choice.countersDelta?.battles_won) bumpCounter(c, "battles_won")
  // Mark this event as completed (for one-shot gating).
  bumpCounter(c, `event_${event.id}`)

  updateMomentum(c, net)
  deductStamina(c)
  updateMarketValue(c)
  recomputeDerived(c)
  ageUp(c)
  clearExpiredHunted(c)

  // Death roll (skip if already retired or finale-pending).
  if (!ended && c.status !== "retired") {
    const injuryRisk = choice.injuryRiskDelta ?? 0
    if (rollDeath(c, injuryRisk, rng) || c.age >= GAME_CONFIG.maxAge) {
      c.status = "dead"
      ended = true
      endingType = heroicOrPeaceful(c, "death")
    }
  }

  const narrative = fillSlots(localize(choice.narrative, c.locale), c.locale, registry, rng)

  return {
    narrative,
    ended,
    endingType,
    chosenRarity: choice.rarity,
    wonBattle,
    completedQuest,
  }
}

// ---------------------------------------------------------------------------
// Resolve a minigame card selection (hidden weighted match)
// ---------------------------------------------------------------------------

export function resolveMinigame(
  c: CharacterState,
  event: EventContent,
  cardId: string,
  registry: ContentRegistry,
  rng: Rng,
): ResolveOutput {
  const res = event.resolution
  const outcomes = event.outcomes
  if (!res || !outcomes) throw new Error(`minigame ${event.id} malformed`)
  const card = (event.cards ?? []).find((k) => k.id === cardId)
  if (!card) throw new Error(`unknown card ${cardId}`)

  c.turn += 1

  // Compute win chance from base + stat influence + card modifier.
  let winChance = res.baseWinChance
  for (const [stat, per] of Object.entries(res.statInfluence)) {
    winChance += (c[stat as keyof CharacterState] as number) * (per as number)
  }
  let critChance = 0.1
  const mod = res.cardModifiers?.[cardId]
  if (mod) {
    winChance += mod.winChanceDelta ?? 0
    critChance += mod.critChanceDelta ?? 0
  }
  winChance = Math.max(0.02, Math.min(0.97, winChance))

  // Subtype-specific adjustments.
  const subtype = res.type ?? "weighted_hidden_match"
  if (subtype === "grid_gamble") {
    // Pure luck: ignore stat influence, keep only base + card modifiers.
    winChance = Math.max(0.02, Math.min(0.97, res.baseWinChance + (mod?.winChanceDelta ?? 0)))
    critChance = 0.05
  }
  if (subtype === "timing_bar" && res.statThreshold) {
    // Stat widens the green zone: bonus if primary stat >= threshold.
    const primaryStat = event.primaryStat
    if (primaryStat && (c[primaryStat as keyof CharacterState] as number) >= res.statThreshold) {
      winChance += 0.08
    }
  }
  if (subtype === "memory_match" && res.statThreshold) {
    // Stat-gated bonus: higher stat = better recall.
    const primaryStat = event.primaryStat
    if (primaryStat && (c[primaryStat as keyof CharacterState] as number) >= res.statThreshold) {
      winChance += 0.1
    }
  }
  winChance = Math.max(0.02, Math.min(0.97, winChance))

  // Hidden roll -> outcome tier.
  const roll = rng.next()
  let tier: OutcomeTier
  if (roll < winChance * critChance) tier = "critical"
  else if (roll < winChance) tier = "success"
  else if (roll < winChance + (1 - winChance) * 0.4) tier = "partial"
  else tier = "fail"

  const outcome: MinigameOutcome = outcomes[tier]
  const net = applyStatDeltas(c, outcome.statDeltas)
  if (outcome.goldDelta) c.gold += outcome.goldDelta
  if (outcome.fameDelta) c.fame += outcome.fameDelta
  if (outcome.reputationDelta) {
    adjustReputation(c, outcome.reputationFaction ?? defaultFaction(c), outcome.reputationDelta)
  }
  if (outcome.countersDelta) {
    for (const [k, v] of Object.entries(outcome.countersDelta)) bumpCounter(c, k, v)
  }
  if (outcome.countersReset) {
    for (const k of outcome.countersReset) c.counters[k] = 0
  }
  bumpCounter(c, `event_${event.id}`)

  const wonBattle = tier === "critical" || tier === "success"
  if (wonBattle && !outcome.countersDelta?.battles_won) {
    bumpCounter(c, "battles_won")
  }

  updateMomentum(c, net)
  deductStamina(c)
  updateMarketValue(c)
  recomputeDerived(c)
  ageUp(c)
  clearExpiredHunted(c)

  let ended = false
  let endingType: EndingType | undefined
  const injuryRisk = outcome.injuryRiskDelta ?? 0
  if (rollDeath(c, injuryRisk, rng) || c.age >= GAME_CONFIG.maxAge) {
    c.status = "dead"
    ended = true
    endingType = heroicOrPeaceful(c, "death")
  }

  const narrative = fillSlots(localize(outcome.narrative, c.locale), c.locale, registry, rng)

  return {
    narrative,
    ended,
    endingType,
    chosenRarity: "uncommon",
    wonBattle,
    completedQuest: false,
  }
}

// ---------------------------------------------------------------------------

function defaultFaction(c: CharacterState): string {
  return c.reputations[0]?.faction ?? "commoners"
}

// Classify the ending as heroic/peaceful vs. plain, based on standing.
function heroicOrPeaceful(c: CharacterState, kind: "death" | "retirement"): EndingType {
  // Renown is reachable through any of three paths: standing with a faction,
  // widespread fame, or raw power accrued over a long, successful life.
  const renowned = primaryReputation(c) >= 55 || c.fame >= 60 || c.powerLevel >= 65
  if (kind === "death") return renowned ? "heroic_death" : "other_death"
  return renowned ? "peaceful_retirement" : "other_retirement"
}

import type {
  CharacterState,
  EndingType,
  EventContent,
  Locale,
  MinigameOutcome,
  OutcomeTier,
  Rarity,
  ServedEvent,
  StatDeltas,
} from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import { Rng } from "../../shared/rng.js"
import { GAME_CONFIG } from "../../shared/config.js"
import type { ContentRegistry } from "../content/registry.js"
import {
  adjustReputation,
  effectiveWeight,
  fillSlots,
  isEligible,
  localize,
  primaryReputation,
  recomputeDerived,
  serveEvent,
  updateMomentum,
} from "./helpers.js"

// ---------------------------------------------------------------------------
// Character creation
// ---------------------------------------------------------------------------

export function createCharacter(input: {
  id: string
  name: string
  classId: string
  locale: Locale
  registry: ContentRegistry
}): CharacterState {
  const { registry } = input
  const cls = registry.classesById.get(input.classId)
  if (!cls) throw new Error(`unknown class ${input.classId}`)

  const base: CharacterState = {
    id: input.id,
    name: input.name,
    class: cls.id,
    age: GAME_CONFIG.startingAge,
    strength: cls.base.strength,
    dexterity: cls.base.dexterity,
    constitution: cls.base.constitution,
    intelligence: cls.base.intelligence,
    charisma: cls.base.charisma,
    stamina: GAME_CONFIG.startingStamina,
    health: GAME_CONFIG.startingHealth,
    fame: 0,
    gold: cls.startingGold ?? 20,
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

// Pick the event/minigame for the upcoming turn. Deterministic via the run rng.
export function selectEvent(c: CharacterState, registry: ContentRegistry, rng: Rng): EventContent {
  // Occasionally offer a minigame instead of a normal event.
  const pool: EventContent[] = []
  const wantMinigame = rng.bool(0.28)
  const candidates = wantMinigame ? registry.minigames : registry.events
  for (const ev of candidates) {
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
): { event: EventContent; served: ServedEvent } {
  if (isRetirementTurn(c)) {
    const ev = retirementOfferEvent()
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, true),
    }
  }
  const ev = selectEvent(c, registry, rng)
  return {
    event: ev,
    served: serveEvent(ev, c, c.locale, registry, rng, false),
  }
}

// ---------------------------------------------------------------------------
// Applying deltas
// ---------------------------------------------------------------------------

function applyStatDeltas(c: CharacterState, deltas?: StatDeltas): number {
  if (!deltas) return 0
  let net = 0
  for (const k of STAT_KEYS) {
    if (deltas[k]) {
      c[k] += deltas[k] as number
      net += deltas[k] as number
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
  // Injury/accident risk from the chosen outcome, mitigated by constitution.
  const conMitigation = Math.min(0.4, c.constitution * 0.01)
  const injuryChance = Math.max(0, pendingInjuryRisk - conMitigation)
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

  // Retirement handling.
  if (event.id === "__retirement_offer__" && choice.id === "retire") {
    c.status = "retired"
    ended = true
    endingType = heroicOrPeaceful(c, "retirement")
  }

  const net = applyStatDeltas(c, choice.statDeltas)
  applyStatDeltas(c, choice.tradeoffDeltas)
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
  recomputeDerived(c)
  ageUp(c)

  // Death roll (skip if already retired).
  if (!ended) {
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
  recomputeDerived(c)
  ageUp(c)

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

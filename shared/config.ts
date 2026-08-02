// Central balance/config knobs. Tuning happens here, not scattered in logic.

export const GAME_CONFIG = {
  startingAge: 16,
  // Age increments every N turns (a "season"). Reference sim uses multi-turn seasons.
  turnsPerYear: 2,
  retirementEligibleAge: 40,
  maxAge: 90,
  startingHealth: 100,
  startingStamina: 50,

  // How often a retirement offer is injected once eligible (in turns).
  retirementOfferEvery: 3,

  // Rarity offer rates. A turn typically offers a Common + an Uncommon/Rare,
  // and sometimes a Volatile. Volatile is gated so it stays a moment.
  volatileOfferChance: 0.18,

  // Death: probability a pending injury actually lands is the summed
  // injuryRiskDelta from the chosen outcome, reduced by retinue modifiers.
  // Base per-turn illness/accident risk grows with age past this point.
  ageRiskStart: 55,

  // Season system: every N turns, a season summary event is served.
  seasonLength: 5,

  // Destiny card frequency: roughly once every N years.
  destinyCardYears: 10,

  // Tournament arc frequency: a playable tournament arc (intro → N fixtures →
  // honor beat) is rng-gated to fire roughly once every N in-game years.
  tournamentCadenceYears: 6,

  // Bench mechanic: turns a character sits "on the bench" after over-
  // reaching into a clan far above their level (stat gains reduced meanwhile).
  benchDurationTurns: 6,

  // Negotiation dial: base success chance, charisma contribution, and the
  // improved terms on a successful "press for more gold" roll.
  negotiationBaseChance: 0.55,
  negotiationCharismaCoeff: 0.02,
  negotiationGoldMultiplier: 1.5,
  negotiationStipendMultiplier: 1.3,

  // Clan hunting: turns a betrayed clan hunts the character.
  huntedDurationTurns: 8,

  // Faction offer rates for clan members (poaching).
  // Scales with powerLevel: base + powerLevel * perPower, capped.
  memberOfferBaseRate: 0.06,
  memberOfferRatePerPower: 0.002,
  memberOfferRateCap: 0.2,

  // World events: how many to roll per season.
  worldEventsPerSeason: 2,

  // Exhaustion: after N consecutive turns at 0 stamina, a recovery event is forced.
  forcedRecoveryTurns: 3,
  // Stamina restored by a forced recovery turn.
  forcedRecoveryRestore: 40,

  // Liability ("Expediente"): what the realm knows of your darker deeds.
  // Starts at 0; shady choices accrue it, a little decays each season so it
  // isn't a death spiral. Above the notorious threshold the HUD tints blood-
  // red and the underworld starts seeking you out (requiresLiability events).
  liabilityMax: 100,
  liabilityDecayPerSeason: 1,
  liabilityNotoriousThreshold: 50,
  goldPerTurn: 3,

  // Top 0.1% of all-time runs get promoted to "legendary" tier.
  legendaryThresholdPercentile: 0.999,
} as const

import type { Arc, Rarity } from "./types.js"

// Arc thresholds: age at which each chapter begins.
export const ARC_THRESHOLDS: { minAge: number; arc: Arc }[] = [
  { minAge: 0, arc: "child" },
  { minAge: 16, arc: "adventurer" },
  { minAge: 26, arc: "mercenary" },
  { minAge: 40, arc: "kingdom_hero" },
  { minAge: 60, arc: "legend" },
  { minAge: 80, arc: "old_hero" },
]

export function arcForAge(age: number): Arc {
  let arc: Arc = "child"
  for (const t of ARC_THRESHOLDS) {
    if (age >= t.minAge) arc = t.arc
  }
  return arc
}

// Rarity ordering (low → high). Also the canonical rarity list; drives how
// choices are sorted so rarer/more volatile options read last.
export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "volatile"]

export function rarityRank(rarity: string): number {
  const i = RARITY_ORDER.indexOf(rarity as Rarity)
  return i === -1 ? 0 : i
}

// Reputation tiers (localized names live in content/reputationTiers.json later;
// thresholds are language-neutral numbers).
export const REPUTATION_TIERS: { min: number; id: string }[] = [
  { min: 0, id: "outcast" },
  { min: 5, id: "stranger" },
  { min: 20, id: "known" },
  { min: 35, id: "acquaintance" },
  { min: 50, id: "respected" },
  { min: 65, id: "notable" },
  { min: 78, id: "renowned" },
  { min: 90, id: "legend" },
  { min: 99, id: "myth" },
]

export function reputationTierId(value: number): string {
  let id = REPUTATION_TIERS[0].id
  for (const tier of REPUTATION_TIERS) {
    if (value >= tier.min) id = tier.id
  }
  return id
}

// Affinity tiers for NPC relationships (-100 to 100).
export const AFFINITY_TIERS: { min: number; id: string }[] = [
  { min: -100, id: "nemesis" },
  { min: -50, id: "rival" },
  { min: -20, id: "wary" },
  { min: 0, id: "stranger" },
  { min: 20, id: "acquaintance" },
  { min: 50, id: "friend" },
  { min: 80, id: "devoted" },
]

export function affinityTierId(value: number): string {
  let id = AFFINITY_TIERS[0].id
  for (const tier of AFFINITY_TIERS) {
    if (value >= tier.min) id = tier.id
  }
  return id
}

// The rival's seasonal focus — what they're "about" this season (Puntero's
// Escándalo / Comunidad / Pasillos...). Shown in the HUD, flavors the season-
// summary rivalUpdate, and lightly biases how fast their score grows.
// `scoreBonus` is deterministic (no rng), so daily runs stay reproducible.
// NOTE: keep the en/es labels here in sync with `rivalFocus_*` in
// src/i18n/strings.ts (the HUD chip localizes via that table).
export const RIVAL_FOCUSES: {
  id: string
  label: { en: string; es: string }
  scoreBonus: number
}[] = [
  { id: "conquest", label: { en: "Conquest", es: "Conquista" }, scoreBonus: 1 },
  { id: "treasure", label: { en: "Treasure", es: "Tesoro" }, scoreBonus: 1 },
  { id: "court", label: { en: "Court Intrigue", es: "Intriga de Corte" }, scoreBonus: 0 },
  { id: "war", label: { en: "Open War", es: "Guerra Abierta" }, scoreBonus: 2 },
  { id: "lore", label: { en: "Lost Lore", es: "Saber Perdido" }, scoreBonus: 0 },
  { id: "crown", label: { en: "The Crown", es: "La Corona" }, scoreBonus: 1 },
]

// Rival name pool for archrival generation.
export const RIVAL_NAMES: string[] = [
  "Roderick",
  "Seraphina",
  "Theron",
  "Vaela",
  "Corvus",
  "Isolde",
  "Gideon",
  "Morwen",
  "Aldric",
  "Briar",
  "Cassian",
  "Dorian",
  "Elara",
  "Finnian",
  "Rowan",
]

// Clan specialties for offer generation.
export const CLAN_SPECIALTIES: { id: string; label: { en: string; es: string } }[] = [
  { id: "gold", label: { en: "Wealth & Trade", es: "Riqueza y Comercio" } },
  { id: "protection", label: { en: "Protection & Defense", es: "Protección y Defensa" } },
  { id: "fame", label: { en: "Fame & Influence", es: "Fama e Influencia" } },
  { id: "combat_training", label: { en: "Combat Training", es: "Entrenamiento de Combate" } },
  { id: "arcana", label: { en: "Arcane Knowledge", es: "Conocimiento Arcano" } },
]

// Composite score formula (see Ranking criteria & score formula in the spec).
export function computeScore(input: {
  achievementsCount: number
  battlesWon: number
  questsCompleted: number
  ageAtEnd: number
  finalPowerLevel: number
  reputationPeak: number
  netWorth: number
  endingType: string
  legacyScore?: number
}): number {
  const endingBonus =
    input.endingType === "heroic_death" ? 200 : input.endingType === "peaceful_retirement" ? 100 : 0
  return Math.round(
    input.achievementsCount * 500 +
      input.battlesWon * 50 +
      input.questsCompleted * 40 +
      Math.min(input.ageAtEnd, 80) * 20 +
      input.finalPowerLevel * 15 +
      input.reputationPeak * 5 +
      (input.legacyScore ?? 0) * 25 +
      input.netWorth / 100 +
      endingBonus,
  )
}

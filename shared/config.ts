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
} as const

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

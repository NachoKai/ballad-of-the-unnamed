// Maps internal stat keys to their i18n lookup key so abbreviations are
// translatable (e.g. STR → FUE in Spanish).
export const STAT_ABBR: Record<string, string> = {
  strength: "stat_strength_tag",
  dexterity: "stat_dexterity_tag",
  constitution: "stat_constitution_tag",
  intelligence: "stat_intelligence_tag",
  charisma: "stat_charisma_tag",
}

import type { Rarity } from "@shared/types"

// Electric border chaos intensity per rarity. More rarity = more chaos.
export const RARITY_CHAOS: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.03,
  rare: 0.1,
  volatile: 0.25,
}

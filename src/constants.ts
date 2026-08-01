// Maps internal stat keys to their i18n lookup key so abbreviations are
// translatable (e.g. STR → FUE in Spanish).
export const STAT_ABBR: Record<string, string> = {
  strength: "stat_strength_tag",
  dexterity: "stat_dexterity_tag",
  constitution: "stat_constitution_tag",
  intelligence: "stat_intelligence_tag",
  charisma: "stat_charisma_tag",
}

import type { EndingType, LeaderboardCategory, Rarity, RoleSignal } from "@shared/types"

// Electric border chaos intensity per rarity. More rarity = more chaos.
export const RARITY_CHAOS: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.03,
  rare: 0.1,
  volatile: 0.25,
}

// §20 role-signal shown on clan-join offer cards before the player commits.
// labelKey is the suffix of the `roleSignal*` i18n keys in src/i18n/strings.ts
// (must stay in sync with those keys), icon is the badge emoji, color the tag tint.
export const ROLE_SIGNAL: Record<RoleSignal, { icon: string; labelKey: string; color: string }> = {
  up: { icon: "⬆️", labelKey: "Up", color: "#6f8f6a" },
  same: { icon: "➡️", labelKey: "Same", color: "#c9a44c" },
  bench: { icon: "🪑", labelKey: "Bench", color: "#bf8a4c" },
}

// Ending-type presentation on the leaderboard (ending tag color).
export const ENDING_COLOR: Record<EndingType, string> = {
  heroic_death: "#c85a5a",
  peaceful_retirement: "#6f8f6a",
  other_death: "#7d715a",
  other_retirement: "#b6a889",
}

// Leaderboard sort categories in tab order. labelKey is an i18n key in
// src/i18n/strings.ts (must stay in sync with those keys).
export const LEADERBOARD_CATEGORIES: { id: LeaderboardCategory; labelKey: string }[] = [
  { id: "score", labelKey: "scoreLabel" },
  { id: "net_worth", labelKey: "netWorth" },
  { id: "achievements_count", labelKey: "achievements" },
  { id: "age_at_end", labelKey: "ageShort" },
  { id: "battles_won", labelKey: "battlesWon" },
]

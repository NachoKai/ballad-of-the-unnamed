// Maps internal stat keys to their i18n lookup key so abbreviations are
// translatable (e.g. STR → FUE in Spanish).
export const STAT_ABBR: Record<string, string> = {
  strength: "stat_strength_tag",
  dexterity: "stat_dexterity_tag",
  constitution: "stat_constitution_tag",
  intelligence: "stat_intelligence_tag",
  charisma: "stat_charisma_tag",
}

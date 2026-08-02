import type { Arc, Gender, Locale } from "@shared/types"
import { gt as translateGendered } from "../i18n/strings"

export const CAREER_POWER_TIERS: { min: number; tier: number }[] = [
  { min: 0, tier: 0 },
  { min: 80, tier: 1 },
  { min: 140, tier: 2 },
]

export function careerPowerTier(powerLevel: number): number {
  let tier = CAREER_POWER_TIERS[0].tier
  for (const t of CAREER_POWER_TIERS) {
    if (powerLevel >= t.min) tier = t.tier
  }
  return tier
}

export function careerTitle(
  locale: Locale,
  gender: Gender | null | undefined,
  arc: Arc,
  powerLevel: number,
): string {
  return translateGendered(locale, gender, `careerTitle_${arc}_${careerPowerTier(powerLevel)}`)
}

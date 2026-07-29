import type { AchievementContent, CharacterState, EndingType } from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import type { ContentRegistry } from "../content/registry.js"
import { peakReputation, primaryReputation } from "./helpers.js"

interface EvalContext {
  scoreSoFar?: number
  endingType?: EndingType
}

function conditionMet(a: AchievementContent, c: CharacterState, ctx: EvalContext): boolean {
  const cond = a.condition
  switch (cond.type) {
    case "counter_gte":
      return (c.counters[cond.key] ?? 0) >= cond.value
    case "gold_gte":
      return c.gold >= cond.value
    case "fame_gte":
      return c.fame >= cond.value
    case "stat_gte":
      return (c[cond.stat] ?? 0) >= cond.value
    case "age_gte":
      return c.age >= cond.value
    case "score_gte":
      return (ctx.scoreSoFar ?? 0) >= cond.value
    case "reputation_gte":
      return primaryReputation(c) >= cond.value
    case "reputation_lte":
      return primaryReputation(c) <= cond.value
    case "rare_cards_gte":
      return (c.counters["rare_cards"] ?? 0) >= cond.value
    case "legendary_cards_gte":
      return (c.counters["legendary_cards"] ?? 0) >= cond.value
    case "ending":
      return ctx.endingType === cond.value
    case "status":
      return c.status === cond.value
    default:
      return false
  }
}

// Returns newly unlocked achievements, mutating character.achievements.
export function evaluateAchievements(
  c: CharacterState,
  registry: ContentRegistry,
  ctx: EvalContext = {},
): AchievementContent[] {
  const unlocked: AchievementContent[] = []
  const owned = new Set(c.achievements)
  for (const a of registry.achievements) {
    if (owned.has(a.id)) continue
    if (conditionMet(a, c, ctx)) {
      c.achievements.push(a.id)
      owned.add(a.id)
      unlocked.push(a)
    }
  }
  return unlocked
}

// Convenience: max single stat, used by a couple of ending flavor checks.
export function highestStat(c: CharacterState): number {
  return Math.max(...STAT_KEYS.map((k) => c[k]))
}

export { peakReputation }

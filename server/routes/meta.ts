import { Router } from "express"
import type { Request, Response } from "express"
import { loadContent } from "../content/registry.js"
import { localize } from "../engine/helpers.js"
import {
  getLeaderboard,
  getLeaderboardByCategory,
  getCareerTotals,
  getPlayerRuns,
  getCrossRunCollection,
} from "../store/runStore.js"
import { todayDailySeed } from "../../shared/rng.js"
import type { LeaderboardCategory, Locale, RunType } from "../../shared/types.js"

export const metaRouter = Router()
const registry = loadContent()

function localeOf(req: Request): Locale {
  return (req.query.locale as string) === "es" ? "es" : "en"
}

// GET /api/meta/classes — localized class list for character creation.
metaRouter.get("/classes", (req: Request, res: Response) => {
  const locale = localeOf(req)
  const classes = registry.classes.map((c) => ({
    id: c.id,
    icon: c.icon,
    name: localize(c.name, locale),
    description: localize(c.description, locale),
    base: c.base,
    startingGold: c.startingGold,
    startingFaction: c.startingFaction ?? null,
  }))
  res.json({ classes, dailySeed: todayDailySeed() })
})

// GET /api/meta/achievements — full catalog (for a "collection" view).
metaRouter.get("/achievements", (req: Request, res: Response) => {
  const locale = localeOf(req)
  const achievements = registry.achievements.map((a) => ({
    id: a.id,
    icon: a.icon,
    rarity: a.rarity,
    hidden: Boolean(a.hidden),
    name: localize(a.name, locale),
    description: a.hidden ? "???" : localize(a.description, locale),
  }))
  res.json({ achievements })
})

// GET /api/meta/leaderboard?runType=standard|daily&tier=legendary&limit=25
metaRouter.get("/leaderboard", async (req: Request, res: Response) => {
  const runType: RunType = req.query.runType === "daily" ? "daily" : "standard"
  const limit = Math.min(100, Number(req.query.limit) || 25)
  const seed = runType === "daily" ? todayDailySeed() : undefined
  const tier = req.query.tier === "legendary" ? "legendary" : undefined
  const rows = await getLeaderboard({ runType, seed, limit, tier })
  const entries = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    class: r.character_class,
    finalPowerLevel: r.final_power_level,
    netWorth: r.net_worth,
    achievementsCount: r.achievements_count,
    battlesWon: r.battles_won,
    questsCompleted: r.quests_completed,
    ageAtEnd: r.age_at_end,
    reputationPeak: r.reputation_peak,
    endingType: r.ending_type,
    score: r.score,
    epithet: r.epithet,
    epilogue: r.epilogue,
  }))
  res.json({ runType, entries })
})

// GET /api/meta/collection — cross-run trophy hall stats
metaRouter.get("/collection", async (_req: Request, res: Response) => {
  const data = await getCrossRunCollection()
  const totalEndings = 4
  const totalFactions = registry.factions.length
  const totalClasses = registry.classes.length
  const totalAchievements = registry.achievements.length
  const total = totalEndings + totalFactions + totalClasses + totalAchievements
  const collected =
    data.uniqueEndings.length +
    data.uniqueFactions.length +
    data.uniqueClasses.length +
    data.uniqueAchievements.length
  res.json({
    ...data,
    completion: {
      endings: { collected: data.uniqueEndings.length, total: totalEndings },
      factions: { collected: data.uniqueFactions.length, total: totalFactions },
      classes: { collected: data.uniqueClasses.length, total: totalClasses },
      achievements: { collected: data.uniqueAchievements.length, total: totalAchievements },
      overall: {
        collected,
        total,
        pct: total === 0 ? 0 : Math.round((collected / total) * 1000) / 10,
      },
    },
  })
})

// GET /api/meta/leaderboard/:category?runType=standard|daily&limit=25
metaRouter.get("/leaderboard/:category", async (req: Request, res: Response) => {
  const category: LeaderboardCategory = (req.params.category as LeaderboardCategory) || "score"
  const runType: RunType = req.query.runType === "daily" ? "daily" : "standard"
  const limit = Math.min(100, Number(req.query.limit) || 25)
  const seed = runType === "daily" ? todayDailySeed() : undefined
  const rows = await getLeaderboardByCategory({ category, runType, seed, limit })
  const entries = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    class: r.character_class,
    finalPowerLevel: r.final_power_level,
    netWorth: r.net_worth,
    achievementsCount: r.achievements_count,
    battlesWon: r.battles_won,
    questsCompleted: r.quests_completed,
    ageAtEnd: r.age_at_end,
    reputationPeak: r.reputation_peak,
    endingType: r.ending_type,
    score: r.score,
    epithet: r.epithet,
    epilogue: r.epilogue,
  }))
  res.json({ category, runType, entries })
})

// GET /api/meta/career-totals
metaRouter.get("/career-totals", async (_req: Request, res: Response) => {
  const totals = await getCareerTotals()
  res.json(totals)
})

// GET /api/meta/player-runs?name=...
metaRouter.get("/player-runs", async (req: Request, res: Response) => {
  const name = String(req.query.name ?? "").trim()
  if (!name) return res.status(400).json({ error: "missing_name" })
  const rows = await getPlayerRuns(name)
  const entries = rows.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    name: r.name,
    class: r.character_class,
    finalPowerLevel: r.final_power_level,
    netWorth: r.net_worth,
    achievementsCount: r.achievements_count,
    battlesWon: r.battles_won,
    questsCompleted: r.quests_completed,
    ageAtEnd: r.age_at_end,
    reputationPeak: r.reputation_peak,
    endingType: r.ending_type,
    score: r.score,
    epithet: r.epithet,
    epilogue: r.epilogue,
  }))
  res.json({ entries })
})

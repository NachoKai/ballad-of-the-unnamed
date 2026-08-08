import { Router } from "express"
import type { Request, Response } from "express"
import { asyncHandler, errorMiddleware } from "../errors.js"
import { log } from "../logger.js"
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
import { fmtInt } from "../../shared/format.js"
import type { EventContent, LeaderboardCategory, Locale, RunType } from "../../shared/types.js"

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
metaRouter.get(
  "/leaderboard",
  asyncHandler(async (req: Request, res: Response) => {
  const runType: RunType = req.query.runType === "daily" ? "daily" : "standard"
  const limit = Math.min(100, Number(req.query.limit) || 25)
  const seed = runType === "daily" ? todayDailySeed() : undefined
  const tier = req.query.tier === "legendary" ? "legendary" : undefined
  const rows = await getLeaderboard({ runType, seed, limit, tier })
  // `tier` only exists for legendary fetches; omit it otherwise (undefined
  // fields are dropped from JSON, and pretty mode stays clean).
  log.info("leaderboard.fetch", { runType, limit, count: rows.length, ...(tier ? { tier } : {}) })
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
  }),
)

// A short, locale-aware display label for an encounter (events have no title
// field — the label is derived from flagLabel when authored, otherwise the
// first sentence of the narrative with {slot} placeholders stripped).
function encounterLabel(ev: EventContent, locale: Locale): string {
  if (ev.flagLabel) return localize(ev.flagLabel, locale)
  const raw = localize(ev.narrative, locale)
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (raw.length <= 64) return raw
  // Cut at the last sentence-ending punctuation before the limit so Spanish
  // decimals/ordinals ("40.000", "3.º") never truncate mid-number.
  const head = raw.slice(0, 64)
  const punct = Math.max(head.lastIndexOf("."), head.lastIndexOf("!"), head.lastIndexOf("?"))
  return punct > 12 ? `${head.slice(0, punct + 1)}…` : `${head.trim()}…`
}

// GET /api/meta/collection?locale=... — cross-run trophy hall stats
metaRouter.get(
  "/collection",
  asyncHandler(async (req: Request, res: Response) => {
  const locale = localeOf(req)
  const data = await getCrossRunCollection()
  log.debug("collection.fetch", { totalRuns: data.totalRuns })
  const seen = new Set(data.seenEventIds)

  // Per-encounter completion breakdown against the content catalog. World
  // events are ambient narration (never played as encounters), so they are
  // excluded — they are never recorded and would show as forever-missing.
  const storyEvents = registry.events.filter((e) => e.type !== "world")
  const encounterOf = (ev: EventContent) => ({
    id: ev.id,
    label: encounterLabel(ev, locale),
    // The event's authored location (a faction/place id) — the client renders
    // it as a small localized tag on the chip.
    group: ev.location ?? "",
    seen: seen.has(ev.id),
  })
  const encounters = {
    events: storyEvents.map(encounterOf),
    minigames: registry.minigames.map(encounterOf),
    combats: registry.combats.map(encounterOf),
  }
  const progressOf = (list: { seen: boolean }[]) => ({
    collected: list.filter((e) => e.seen).length,
    total: list.length,
  })

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
    encounters,
    encounterProgress: {
      events: progressOf(encounters.events),
      minigames: progressOf(encounters.minigames),
      combats: progressOf(encounters.combats),
    },
    completion: {
      endings: { collected: data.uniqueEndings.length, total: totalEndings },
      factions: { collected: data.uniqueFactions.length, total: totalFactions },
      classes: { collected: data.uniqueClasses.length, total: totalClasses },
      achievements: { collected: data.uniqueAchievements.length, total: totalAchievements },
      overall: {
        collected,
        total,
        pct: total === 0 ? 0 : fmtInt((collected / total) * 100),
      },
    },
  })
  }),
)

// GET /api/meta/leaderboard/:category?runType=standard|daily&limit=25
metaRouter.get(
  "/leaderboard/:category",
  asyncHandler(async (req: Request, res: Response) => {
  const category: LeaderboardCategory = (req.params.category as LeaderboardCategory) || "score"
  const runType: RunType = req.query.runType === "daily" ? "daily" : "standard"
  const limit = Math.min(100, Number(req.query.limit) || 25)
  const seed = runType === "daily" ? todayDailySeed() : undefined
  const rows = await getLeaderboardByCategory({ category, runType, seed, limit })
  log.info("leaderboard.fetch", { category, runType, limit, count: rows.length })
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
  }),
)

// GET /api/meta/career-totals
metaRouter.get(
  "/career-totals",
  asyncHandler(async (_req: Request, res: Response) => {
    const totals = await getCareerTotals()
    res.json(totals)
  }),
)

// GET /api/meta/player-runs?name=...
metaRouter.get(
  "/player-runs",
  asyncHandler(async (req: Request, res: Response) => {
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
  }),
)

// Route-level error handling (same contract as game.ts).
metaRouter.use(errorMiddleware)

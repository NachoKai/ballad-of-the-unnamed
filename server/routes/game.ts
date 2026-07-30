import { Router } from "express"
import type { Request, Response } from "express"
import { Rng, hashSeed, todayDailySeed } from "../../shared/rng.js"
import { computeScore, GAME_CONFIG } from "../../shared/config.js"
import { loadContent } from "../content/registry.js"
import {
  buildServedEvent,
  createCharacter,
  generateRival,
  resolveChoice,
  resolveMinigame,
} from "../engine/engine.js"
import { evaluateAchievements } from "../engine/achievements.js"
import {
  generateEpilogue,
  generateEpithet,
  generateRichEpilogueData,
  computeLegacyScore,
} from "../engine/epilogue.js"
import { localize, localizeLocation, peakReputation } from "../engine/helpers.js"
import {
  createRun,
  getRun,
  insertLeaderboardEntry,
  saveRun,
  type RunRecord,
} from "../store/runStore.js"
import type {
  AchievementContent,
  ArchetypeContent,
  Locale,
  RunType,
  TurnResult,
} from "../../shared/types.js"

export const gameRouter = Router()
const registry = loadContent()

const RUN_COOKIE = "run_token"

function localeOf(req: Request): Locale {
  const q = (req.query.locale as string) || (req.body?.locale as string)
  return q === "es" ? "es" : "en"
}

// Load a run by its id. The run id is an unguessable randomUUID generated on
// the server and only ever returned to the creating client, so possession of
// the id is itself the ownership capability. We intentionally do NOT gate on a
// cookie: the preview runs inside a cross-site iframe where a `sameSite: lax`
// cookie is treated as third-party and never sent, which would break /choose.
async function loadOwnedRun(req: Request): Promise<RunRecord | null> {
  const id = (req.body?.runId as string) || (req.query.runId as string)
  if (!id) return null
  return getRun(id)
}

// -- Serialize the achievements to localized client shape.
function serveAchievements(list: AchievementContent[], locale: Locale): AchievementContent[] {
  return list.map((a) => ({
    ...a,
    name: { en: localize(a.name, locale), es: a.name.es },
    description: { en: localize(a.description, locale), es: a.description.es },
  }))
}

// POST /api/game/archetype-draw  { classId, locale }
gameRouter.post("/archetype-draw", (req: Request, res: Response) => {
  const classId = String(req.body?.classId ?? "")
  const locale = localeOf(req)
  const pool = registry.archetypes[classId]
  if (!pool || pool.length === 0) {
    return res.status(400).json({ error: "no_archetypes_for_class" })
  }
  // Deterministic per-session draw: pick 3 from the pool using a fresh RNG.
  const rng = new Rng(hashSeed(classId + "_" + String(Date.now()) + Math.random()))
  const poolCopy = [...pool]
  const drawn: ArchetypeContent[] = []
  for (let i = 0; i < 3 && poolCopy.length > 0; i++) {
    const idx = rng.int(0, poolCopy.length - 1)
    drawn.push(poolCopy.splice(idx, 1)[0])
  }
  // Localize flavor text.
  const served = drawn.map((a) => ({
    id: a.id,
    icon: a.icon,
    name: localize(a.name, locale),
    flavor: localize(a.flavor, locale),
    statDeltas: a.statDeltas,
  }))
  res.json({ archetypes: served })
})

// POST /api/game/new  { name, classId, archetypeId, runType, locale }
gameRouter.post("/new", async (req: Request, res: Response) => {
  try {
    const name =
      String(req.body?.name ?? "")
        .trim()
        .slice(0, 24) || "Wanderer"
    const classId = String(req.body?.classId ?? "")
    const archetypeId = String(req.body?.archetypeId ?? "").trim() || null
    const runType: RunType = req.body?.runType === "daily" ? "daily" : "standard"
    const locale = localeOf(req)

    if (!registry.classesById.has(classId)) {
      return res.status(400).json({ error: "invalid_class" })
    }

    const seed = runType === "daily" ? todayDailySeed() : String(Date.now()) + Math.random()
    const rng = new Rng(hashSeed(seed))

    const character = createCharacter({
      id: crypto.randomUUID(),
      name,
      classId,
      archetypeId,
      locale,
      registry,
    })

    character.rival = generateRival(character, registry, rng)

    const run = await createRun({
      runType,
      seed,
      rngState: rng.getState(),
      locale,
      character,
    })

    // Build the first offered event.
    const rng2 = new Rng(run.rngState)
    const { event, served } = buildServedEvent(character, registry, rng2)
    run.pendingEvent = event
    run.rngState = rng2.getState()
    run.character = character
    await saveRun(run)

    res.cookie(RUN_COOKIE, run.id, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    })

    return res.json({
      runId: run.id,
      runType,
      character,
      event: served,
    })
  } catch (err) {
    console.log("[v0] /new error", (err as Error).message)
    return res.status(500).json({ error: "server_error" })
  }
})

// GET /api/game/state?runId=...  — resume after reload.
gameRouter.get("/state", async (req: Request, res: Response) => {
  const run = await loadOwnedRun(req)
  if (!run) return res.status(404).json({ error: "not_found" })
  const locale = run.locale
  let served = null
  if (run.pendingEvent && !run.finished) {
    // Re-serve the persisted pending event WITHOUT advancing rng state used for
    // resolution (use a throwaway rng for slot text so display stays stable-ish).
    const rng = new Rng(run.rngState)
    const { serveEvent } = await import("../engine/helpers.js")
    served = serveEvent(
      run.pendingEvent,
      run.character,
      locale,
      registry,
      rng,
      run.pendingEvent.id === "__retirement_offer__",
    )
    // Restore season summary flags.
    if (run.pendingEvent.id === "__season_summary__") {
      served.isSeasonSummary = true
      const c = run.character
      served.seasonGrade = Math.round(
        Math.min(
          10,
          Math.max(
            1,
            c.powerLevel / 10 +
              c.fame / 20 +
              (c.counters["battles_won"] ?? 0) * 0.2 +
              (c.counters["quests_completed"] ?? 0) * 0.1,
          ),
        ),
      )
      served.seasonHeadline =
        (served.seasonGrade ?? 5) >= 8
          ? locale === "en"
            ? "A Season of Glory"
            : "Una Temporada de Gloria"
          : (served.seasonGrade ?? 5) >= 5
            ? locale === "en"
              ? "A Steady Season"
              : "Una Temporada Estable"
            : locale === "en"
              ? "A Season of Hardship"
              : "Una Temporada de Dificultades"

      if (run.character.rival) {
        const rv = run.character.rival
        const rvClassName = registry.classesById.get(rv.class)?.name
        const rvClass = rvClassName ? localize(rvClassName, locale) : rv.class
        served.rivalUpdate =
          locale === "en"
            ? `${rv.name} (${rvClass}) is active in ${localizeLocation(rv.location, locale)}. Power: ${rv.powerLevel}, score: ${rv.score}`
            : `${rv.name} (${rvClass}) está activo en ${localizeLocation(rv.location, locale)}. Poder: ${rv.powerLevel}, puntos: ${rv.score}`
      }
    }
  }
  return res.json({
    runId: run.id,
    runType: run.runType,
    character: run.character,
    event: served,
    finished: run.finished,
  })
})

// GET /api/game/shop?runId=...  — available shop items for current run.
gameRouter.get("/shop", async (req: Request, res: Response) => {
  const run = await loadOwnedRun(req)
  if (!run) return res.status(404).json({ error: "not_found" })
  const locale = run.locale
  const c = run.character
  const items = registry.shop
    .filter((item) => {
      // Arc-gated shop items.
      if (item.requiresArc && item.requiresArc.length > 0) {
        return item.requiresArc.includes(c.currentArc)
      }
      return true
    })
    .map((item) => ({
      id: item.id,
      category: item.category,
      name: localize(item.name, locale),
      cost: item.cost,
      effect: item.effect,
      icon: item.icon,
      flavor: localize(item.flavor, locale),
      duration: item.duration,
      owned: c.inventory.find((inv) => inv.itemId === item.id)?.qty ?? 0,
    }))
  res.json({ items, gold: c.gold, inventory: c.inventory })
})

// POST /api/game/buy  { runId, itemId }
gameRouter.post("/buy", async (req: Request, res: Response) => {
  try {
    const run = await loadOwnedRun(req)
    if (!run) return res.status(404).json({ error: "not_found" })
    if (run.finished) return res.status(409).json({ error: "run_finished" })

    const itemId = String(req.body?.itemId ?? "")
    const item = registry.shop.find((i) => i.id === itemId)
    if (!item) return res.status(400).json({ error: "unknown_item" })

    // Arc gate check.
    if (item.requiresArc && item.requiresArc.length > 0) {
      if (!item.requiresArc.includes(run.character.currentArc)) {
        return res.status(400).json({ error: "item_not_available" })
      }
    }

    const c = run.character
    if (c.gold < item.cost) return res.status(400).json({ error: "not_enough_gold" })

    // Deduct gold.
    c.gold -= item.cost

    // Add to inventory.
    const existing = c.inventory.find((inv) => inv.itemId === itemId)
    if (existing) {
      existing.qty += 1
    } else {
      const expiresAtTurn =
        item.duration && item.duration > 0
          ? c.turn + item.duration * GAME_CONFIG.seasonLength
          : null
      c.inventory.push({ itemId, qty: 1, expiresAtTurn })
    }

    run.character = c
    await saveRun(run)

    return res.json({
      character: c,
      purchased: itemId,
      gold: c.gold,
      inventory: c.inventory,
    })
  } catch (err) {
    console.log("[v0] /buy error", (err as Error).message)
    return res.status(500).json({ error: "server_error" })
  }
})

// POST /api/game/choose  { runId, choiceId, cardId }
gameRouter.post("/choose", async (req: Request, res: Response) => {
  try {
    const run = await loadOwnedRun(req)
    if (!run) return res.status(404).json({ error: "not_found" })
    if (run.finished) return res.status(409).json({ error: "run_finished" })
    if (!run.pendingEvent) return res.status(409).json({ error: "no_pending_event" })

    const locale = run.locale
    const event = run.pendingEvent
    const rng = new Rng(run.rngState)
    const isMinigame = event.type === "minigame" || Boolean(event.cards)

    const outcome = isMinigame
      ? resolveMinigame(run.character, event, String(req.body?.cardId ?? ""), registry, rng)
      : resolveChoice(run.character, event, String(req.body?.choiceId ?? ""), registry, rng)

    // Track quests for scoring.
    if (outcome.completedQuest) {
      run.character.counters["quests_completed"] =
        (run.character.counters["quests_completed"] ?? 0) + 1
    }

    // Evaluate achievements (mid-run conditions).
    const newAchievements = evaluateAchievements(run.character, registry, {
      endingType: outcome.endingType,
    })

    let result: TurnResult

    if (outcome.ended && outcome.endingType) {
      const c = run.character
      const score = computeScore({
        achievementsCount: c.achievements.length,
        battlesWon: c.counters["battles_won"] ?? 0,
        questsCompleted: c.counters["quests_completed"] ?? 0,
        ageAtEnd: c.age,
        finalPowerLevel: c.powerLevel,
        reputationPeak: peakReputation(c),
        netWorth: c.gold,
        endingType: outcome.endingType,
        legacyScore: computeLegacyScore(c),
      })
      const epilogue = generateEpilogue(c, outcome.endingType, registry, locale)
      const epithetData = generateEpithet(c, registry, locale)
      const richEpilogueData = generateRichEpilogueData(
        c,
        outcome.endingType,
        score,
        registry,
        locale,
      )

      c.epithet = epithetData.title

      // Final achievement pass now that score is known.
      const finalAch = evaluateAchievements(run.character, registry, {
        endingType: outcome.endingType,
        scoreSoFar: score,
      })
      newAchievements.push(...finalAch)

      run.finished = true
      run.pendingEvent = null
      run.rngState = rng.getState()
      await saveRun(run)

      await insertLeaderboardEntry({
        runId: run.id,
        name: c.name,
        characterClass: c.class,
        finalPowerLevel: c.powerLevel,
        netWorth: c.gold,
        achievementsCount: c.achievements.length,
        battlesWon: c.counters["battles_won"] ?? 0,
        questsCompleted: c.counters["quests_completed"] ?? 0,
        ageAtEnd: c.age,
        reputationPeak: peakReputation(c),
        endingType: outcome.endingType,
        score,
        legacyScore: computeLegacyScore(c),
        epithet: epithetData.title,
        epilogue,
        runType: run.runType,
        seed: run.seed,
      })

      result = {
        character: c,
        narrative: outcome.narrative,
        newAchievements: serveAchievements(newAchievements, locale),
        ended: true,
        endingType: outcome.endingType,
        epilogue,
        richEpilogueData,
      }
      return res.json({ ...result, score })
    }

    // Not ended: pick the next event.
    const { event: nextEvent, served } = buildServedEvent(run.character, registry, rng)
    run.pendingEvent = nextEvent
    run.rngState = rng.getState()
    await saveRun(run)

    result = {
      character: run.character,
      narrative: outcome.narrative,
      newAchievements: serveAchievements(newAchievements, locale),
      ended: false,
    }
    return res.json({ ...result, event: served })
  } catch (err) {
    const msg = (err as Error).message
    console.log("[v0] /choose error", msg)
    if (msg.startsWith("unknown choice") || msg.startsWith("unknown card")) {
      return res.status(400).json({ error: "invalid_choice" })
    }
    return res.status(500).json({ error: "server_error", detail: msg })
  }
})

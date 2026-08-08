import { Router } from "express"
import type { Request, Response } from "express"
import { Rng, hashSeed, rivalRngFor, todayDailySeed } from "../../shared/rng.js"
import { computeScore, GAME_CONFIG } from "../../shared/config.js"
import { genderize } from "../../shared/genderize.js"
import { loadContent } from "../content/registry.js"
import {
  applyMinigameOutcome,
  buildServedEvent,
  createCharacter,
  generateRival,
  resolveChoice,
  resolveMinigame,
  seasonStipendFor,
  type ResolveOutput,
} from "../engine/engine.js"
import {
  applyInteractiveMove,
  interactiveTier,
  interactiveView,
} from "../engine/minigames/index.js"
import { combatView, endCombat, resolveCombatRound } from "../engine/combat/index.js"
import { evaluateAchievements } from "../engine/achievements.js"
import {
  generateEpilogue,
  generateEpithet,
  generateRichEpilogueData,
  computeLegacyScore,
} from "../engine/epilogue.js"
import {
  buildRivalUpdate,
  computeSeasonGrade,
  localize,
  peakReputation,
  seasonHeadline,
  seasonRenownGains,
} from "../engine/helpers.js"
import {
  createRun,
  getRun,
  insertLeaderboardEntry,
  persistCharacterSnapshot,
  saveRun,
  type RunRecord,
} from "../store/runStore.js"
import type {
  AchievementContent,
  ArchetypeContent,
  CombatMove,
  Gender,
  InteractiveMove,
  Locale,
  RunType,
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

// POST /api/game/archetype-draw  { classId, locale, gender, unlockedClasses? }
//
// Hidden "master" archetypes (content flag `hidden: true`) are only served
// fully to clients that prove the class is in their unlock set (the player
// finished a run with that class — tracked client-side in localStorage, since
// there are no accounts). Locked masters are still served, but masked as a
// "???" card so players know they exist; their identity and stats stay hidden.
gameRouter.post("/archetype-draw", (req: Request, res: Response) => {
  const classId = String(req.body?.classId ?? "")
  const locale = localeOf(req)
  const gender: Gender =
    req.body?.gender === "male" || req.body?.gender === "female" ? req.body.gender : "male"
  const unlockedClasses: string[] = Array.isArray(req.body?.unlockedClasses)
    ? req.body.unlockedClasses.filter((c: unknown): c is string => typeof c === "string")
    : []
  const unlocked = unlockedClasses.includes(classId)
  const pool = registry.archetypes[classId]
  if (!pool || pool.length === 0) {
    return res.status(400).json({ error: "no_archetypes_for_class" })
  }
  // Deterministic per-session draw: serve the WHOLE class pool in a seeded
  // shuffle so the player can weigh every archetype (not just a 3-card hand).
  const rng = new Rng(hashSeed(classId + "_" + String(Date.now()) + Math.random()))
  const poolCopy = [...pool]
  const drawn: ArchetypeContent[] = []
  while (poolCopy.length > 0) {
    const idx = rng.int(0, poolCopy.length - 1)
    drawn.push(poolCopy.splice(idx, 1)[0])
  }
  // Localize flavor text, inflecting the player-referential titles for gender.
  // Locked masters are masked: a "???" name, no stats, a key icon — the client
  // renders a distinct locked card with an unlock hint.
  const served = drawn.map((a) => {
    if (a.hidden && !unlocked) {
      return {
        id: a.id,
        icon: "key-round",
        name: "???",
        flavor: "",
        statDeltas: {},
        locked: true,
        isMaster: true,
      }
    }
    return {
      id: a.id,
      icon: a.icon,
      name:
        locale === "es" ? genderize(localize(a.name, locale), gender) : localize(a.name, locale),
      flavor:
        locale === "es"
          ? genderize(localize(a.flavor, locale), gender)
          : localize(a.flavor, locale),
      statDeltas: a.statDeltas,
      isMaster: a.hidden === true,
    }
  })
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
    const gender: Gender =
      req.body?.gender === "male" || req.body?.gender === "female" ? req.body.gender : "male"
    // origin dial: humble (poor start, underdog pool) or established.
    const origin = req.body?.origin === "established" ? "established" : "humble"
    // Hidden master archetypes require the class's unlock (client-side set of
    // classes with a finished run). Reject picks the client never unlocked.
    const unlockedClasses: string[] = Array.isArray(req.body?.unlockedClasses)
      ? req.body.unlockedClasses.filter((c: unknown): c is string => typeof c === "string")
      : []

    if (!registry.classesById.has(classId)) {
      return res.status(400).json({ error: "invalid_class" })
    }

    if (archetypeId) {
      const archetype = (registry.archetypes[classId] ?? []).find((a) => a.id === archetypeId)
      if (archetype?.hidden && !unlockedClasses.includes(classId)) {
        return res.status(400).json({ error: "locked_archetype" })
      }
    }

    const seed = runType === "daily" ? todayDailySeed() : String(Date.now()) + Math.random()
    const rng = new Rng(hashSeed(seed))
    // The archrival lives on its own parallel stream derived from the same
    // seed, so generating/advancing it never consumes — or perturbs — the
    // player's main stream (daily runs stay identical for everyone).
    const rivalRng = rivalRngFor(seed)

    const character = createCharacter({
      id: crypto.randomUUID(),
      name,
      gender,
      classId,
      archetypeId,
      origin,
      locale,
      registry,
    })

    character.rival = generateRival(character, registry, rivalRng)

    const run = await createRun({
      runType,
      seed,
      rngState: rng.getState(),
      rivalRngState: rivalRng.getState(),
      locale,
      character,
    })

    // Build the first offered event.
    const rng2 = new Rng(run.rngState)
    const rivalRng2 = new Rng(run.rivalRngState)
    const { event, served } = buildServedEvent(character, registry, rng2, rivalRng2)
    run.pendingEvent = event
    run.rngState = rng2.getState()
    run.rivalRngState = rivalRng2.getState()
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
    // Restore capstone flags for a pending capstone minigame.
    if (run.pendingEvent.isCapstone) {
      served.isCapstone = true
      served.capstoneKind = run.pendingEvent.capstoneKind ?? "debate"
    }
    // Restore season summary flags.
    if (run.pendingEvent.id === "__season_summary__") {
      served.isSeasonSummary = true
      const c = run.character
      const capstone = c.pendingCapstoneResult ?? null
      const grade = computeSeasonGrade(c, capstone?.gradeDelta ?? 0)
      served.seasonGrade = grade
      served.seasonHeadline = seasonHeadline(grade, locale)
      if (capstone) served.capstoneResult = capstone

      // Re-serve the renown dividend so a reload shows the same amounts that
      // resolveSeasonSummary will apply when the player continues.
      const renown = seasonRenownGains(c, capstone?.gradeDelta ?? 0)
      served.seasonFameGain = renown.fame
      if (renown.reputation > 0) served.seasonReputationGain = renown.reputation

      // The stipend row used to silently disappear on reload — restore it so
      // the resumed summary matches the live-served one.
      if (c.currentClanId) {
        served.stipendEarned = seasonStipendFor(c, c.currentClanId, registry)
      }

      if (run.character.rival) {
        served.rivalUpdate = buildRivalUpdate(run.character, registry, locale)
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
//
// The `newAchievements` field below is served with raw locale maps; the client
// resolves them against its own active locale (Toasts, EndingScreen, and
// App.tsx all use resolveLocaleMap), so pre-localizing here would bake the
// run's language into the payload and break a mid-run locale toggle.
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

    // Items can declare an achievementTrigger (e.g. the floating_realm luxury)
    // — bump that counter and unlock the achievement right away so the purchase
    // has a felt reward. `achievementTrigger` doubles as the counter key,
    // matching the authored `jetset_life` achievement condition.
    let newAchievements: AchievementContent[] = []
    if (item.achievementTrigger) {
      c.counters[item.achievementTrigger] = (c.counters[item.achievementTrigger] ?? 0) + 1
      newAchievements = evaluateAchievements(c, registry)
    }

    run.character = c
    await saveRun(run)

    return res.json({
      character: c,
      purchased: itemId,
      gold: c.gold,
      inventory: c.inventory,
      newAchievements,
    })
  } catch (err) {
    console.log("[v0] /buy error", (err as Error).message)
    return res.status(500).json({ error: "server_error" })
  }
})

// Shared tail for /choose and the finished branch of /minigame-move: applies
// quest/achievement bookkeeping, then either finalizes the ending or serves
// the next event. Returns the exact response payload for both routes.
async function finishResolvedTurn(
  run: RunRecord,
  outcome: ResolveOutput,
  rng: Rng,
  rivalRng: Rng,
): Promise<Record<string, unknown>> {
  const c = run.character
  const locale = run.locale
  if (outcome.completedQuest) {
    c.counters["quests_completed"] = (c.counters["quests_completed"] ?? 0) + 1
  }
  const newAchievements = evaluateAchievements(c, registry, { endingType: outcome.endingType })

  if (outcome.ended && outcome.endingType) {
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
    const finalAch = evaluateAchievements(c, registry, {
      endingType: outcome.endingType,
      scoreSoFar: score,
      runEnded: true,
    })
    newAchievements.push(...finalAch)
    run.finished = true
    run.pendingEvent = null
    run.rngState = rng.getState()
    run.rivalRngState = rivalRng.getState()
    await saveRun(run)
    await persistCharacterSnapshot(run)
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
    return {
      character: c,
      narrative: outcome.narrative,
      newAchievements,
      ended: true,
      endingType: outcome.endingType,
      epilogue,
      richEpilogueData,
      score,
    }
  }

  const { event, served } = buildServedEvent(c, registry, rng, rivalRng)
  run.pendingEvent = event
  run.rngState = rng.getState()
  run.rivalRngState = rivalRng.getState()
  await saveRun(run)
  return {
    character: c,
    narrative: outcome.narrative,
    newAchievements,
    ended: false,
    event: served,
  }
}

// POST /api/game/choose  { runId, choiceId, cardId }
gameRouter.post("/choose", async (req: Request, res: Response) => {
  try {
    const run = await loadOwnedRun(req)
    if (!run) return res.status(404).json({ error: "not_found" })
    if (run.finished) return res.status(409).json({ error: "run_finished" })
    if (!run.pendingEvent) return res.status(409).json({ error: "no_pending_event" })

    const event = run.pendingEvent
    const rng = new Rng(run.rngState)
    const rivalRng = new Rng(run.rivalRngState)
    const isMinigame = event.type === "minigame" || Boolean(event.cards)

    // Interactive minigames are multi-move and resolve through /minigame-move,
    // never through a single card-pick — reject stray /choose calls.
    const isInteractive = event.resolution?.type === "interactive"
    if (isInteractive) return res.status(400).json({ error: "interactive_minigame" })

    // Combat events resolve through /combat-move, never a single card-pick.
    if (event.combat) return res.status(400).json({ error: "combat_event" })

    const outcome = isMinigame
      ? resolveMinigame(run.character, event, String(req.body?.cardId ?? ""), registry, rng)
      : resolveChoice(run.character, event, String(req.body?.choiceId ?? ""), registry, rng)

    return res.json(await finishResolvedTurn(run, outcome, rng, rivalRng))
  } catch (err) {
    const msg = (err as Error).message
    console.log("[v0] /choose error", msg)
    if (
      msg.startsWith("unknown choice") ||
      msg.startsWith("unknown card") ||
      msg.startsWith("locked choice")
    ) {
      return res.status(400).json({ error: "invalid_choice" })
    }
    return res.status(500).json({ error: "server_error", detail: msg })
  }
})

// POST /api/game/minigame-move  { runId, move } — one move of an interactive
// minigame. Persists the game state after every move; the final move resolves
// the outcome through the standard outcome pipeline and serves the next event.
gameRouter.post("/minigame-move", async (req: Request, res: Response) => {
  try {
    const run = await loadOwnedRun(req)
    if (!run) return res.status(404).json({ error: "not_found" })
    if (run.finished) return res.status(409).json({ error: "run_finished" })
    const ev = run.pendingEvent
    const c = run.character
    if (!ev || ev.resolution?.type !== "interactive" || !c.pendingMinigame) {
      return res.status(400).json({ error: "no_interactive_minigame" })
    }
    if (c.pendingMinigame.eventId !== ev.id) {
      return res.status(400).json({ error: "interactive_mismatch" })
    }

    const move = req.body?.move as InteractiveMove
    if (!move || typeof move !== "object") {
      return res.status(400).json({ error: "invalid_move" })
    }

    const rng = new Rng(run.rngState)
    const rivalRng = new Rng(run.rivalRngState)
    const primaryStat = c[ev.primaryStat ?? "intelligence"] as number

    const state = c.pendingMinigame
    const locale = c.locale
    const before = interactiveView(state, locale, c.gold)
    // Reject moves after the match is already over: applyInteractiveMove has no
    // guard against post-over moves (rps keeps counting wins, ttt throws on a
    // full board), so the current view's over flag is the authoritative gate.
    if (before.over) {
      return res.status(400).json({ error: "match_already_finished" })
    }
    const { over } = applyInteractiveMove(state, move, primaryStat, rng, ev.resolution, c)

    if (!over) {
      run.rngState = rng.getState()
      await saveRun(run)
      return res.json({
        status: "playing",
        minigame: {
          game: state.game,
          view: interactiveView(state, locale, c.gold),
        },
        feedback: null,
      })
    }

    // Game over: resolve the tier and clear the pending game. The final view
    // rides along so the client can render the completed board under the
    // result banner (the last move's state is never sent as a "playing" frame).
    const tier = interactiveTier(state)
    const finalView = interactiveView(state, locale, c.gold)
    c.pendingMinigame = null
    run.character = c
    const outcome = applyMinigameOutcome(c, ev, tier, registry, rng)
    const payload = await finishResolvedTurn(run, outcome, rng, rivalRng)
    return res.json({
      status: "finished",
      minigame: { game: state.game, view: finalView },
      ...payload,
    })
  } catch (err) {
    const msg = (err as Error).message
    console.log("[v0] /minigame-move error", msg)
    if (
      msg.startsWith("invalid tictactoe cell") ||
      msg.startsWith("invalid memotest card") ||
      msg.startsWith("invalid press option") ||
      msg.startsWith("invalid move for")
    ) {
      return res.status(400).json({ error: "invalid_move" })
    }
    return res.status(500).json({ error: "server_error", detail: msg })
  }
})

// POST /api/game/combat-move  { runId, move } — one round of a combat
// encounter. Persists the fight state after every round; the final round
// resolves rewards/death through endCombat and serves the next event (same
// tail as /choose and /minigame-move).
gameRouter.post("/combat-move", async (req: Request, res: Response) => {
  try {
    const run = await loadOwnedRun(req)
    if (!run) return res.status(404).json({ error: "not_found" })
    if (run.finished) return res.status(409).json({ error: "run_finished" })
    const ev = run.pendingEvent
    const c = run.character
    if (!ev || !ev.combat || !c.pendingCombat) {
      return res.status(400).json({ error: "no_pending_combat" })
    }
    if (c.pendingCombat.eventId !== ev.id) {
      return res.status(400).json({ error: "combat_mismatch" })
    }
    const move = req.body?.move as CombatMove
    if (
      !move ||
      typeof move !== "object" ||
      !["attack", "ability", "defend", "flee"].includes(move.kind)
    ) {
      return res.status(400).json({ error: "invalid_move" })
    }
    const rng = new Rng(run.rngState)
    const rivalRng = new Rng(run.rivalRngState)
    const state = c.pendingCombat
    const locale = c.locale
    // Reject moves after the fight is already over: the round engine has no
    // guard against post-over rounds (it would keep attacking a corpse), so
    // the persisted state's over flag is the authoritative gate.
    if (state.over) return res.status(400).json({ error: "combat_already_finished" })

    let over: boolean
    try {
      over = resolveCombatRound(state, c, registry.classKits[c.class], move, rng).over
    } catch (err) {
      const msg = (err as Error).message
      if (
        msg.startsWith("unknown ability") ||
        msg.startsWith("locked ability") ||
        msg.startsWith("insufficient resource")
      ) {
        return res.status(400).json({ error: "invalid_move" })
      }
      throw err
    }

    if (!over) {
      run.rngState = rng.getState()
      await saveRun(run)
      return res.json({
        status: "playing",
        combat: { game: "combat", view: combatView(state, c, locale, registry) },
        feedback: null,
      })
    }

    // Fight over: apply rewards/death and serve the next beat.
    const finalView = combatView(state, c, locale, registry)
    const outcome = endCombat(c, ev, state, registry, rng)
    const payload = await finishResolvedTurn(run, outcome, rng, rivalRng)
    // Loot breakdown for the result screen — endCombat returns the exact
    // amounts granted (CombatResolveOutput.rewards), null when nothing won.
    const loot = outcome.rewards ?? null
    return res.json({
      status: "finished",
      combat: { game: "combat", view: finalView },
      loot,
      ...payload,
    })
  } catch (err) {
    const msg = (err as Error).message
    console.log("[v0] /combat-move error", msg)
    return res.status(500).json({ error: "server_error", detail: msg })
  }
})

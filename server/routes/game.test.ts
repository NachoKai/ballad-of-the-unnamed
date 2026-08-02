import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Request, Response } from "express"

// Mock the store BEFORE importing the router so no DATABASE_URL is needed.
const store = vi.hoisted(() => ({
  getRun: vi.fn(),
  saveRun: vi.fn(),
  createRun: vi.fn(),
  insertLeaderboardEntry: vi.fn(),
  persistCharacterSnapshot: vi.fn(),
}))

vi.mock("../store/runStore.js", () => ({
  createRun: store.createRun,
  getRun: store.getRun,
  insertLeaderboardEntry: store.insertLeaderboardEntry,
  persistCharacterSnapshot: store.persistCharacterSnapshot,
  saveRun: store.saveRun,
}))

import { gameRouter } from "./game.js"
import { createCharacter } from "../engine/engine.js"
import { loadContent } from "../content/registry.js"
import type { CharacterState, EventContent } from "../../shared/types.js"

const reg = loadContent()

beforeEach(() => {
  vi.clearAllMocks()
})

function makeLegendRun(): CharacterState {
  const c = createCharacter({
    id: "r1",
    name: "Test",
    classId: "warrior",
    origin: "established",
    locale: "en",
    registry: reg,
  })
  c.gold = 13000
  c.currentArc = "legend" // floating_realm requiresArc: legend/old_hero
  return c
}

// Drive the express router directly with a fake req/res and await res.json.
async function postBuy(run: CharacterState, itemId: string) {
  let statusCode = 200
  let resolveJson!: (v: { statusCode: number; body: unknown }) => void
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      resolveJson({ statusCode, body })
      return this
    },
  } as unknown as Response
  store.getRun.mockResolvedValue({
    id: run.id,
    runType: "standard",
    seed: "s",
    rngState: 1,
    locale: "en",
    character: run,
    pendingEvent: null,
    finished: false,
  })
  store.saveRun.mockResolvedValue(undefined)

  const jsonPromise = new Promise<{ statusCode: number; body: unknown }>((r) => {
    resolveJson = r
  })
  const req = {
    method: "POST",
    url: "/buy",
    body: { runId: run.id, itemId },
    query: {},
  } as unknown as Request
  gameRouter(req, res, () => {})
  return jsonPromise
}

// Drive POST /choose with a synthetic pending event on the run.
async function postChoose(run: CharacterState, pendingEvent: EventContent, cardId: string) {
  let statusCode = 200
  let resolveJson!: (v: { statusCode: number; body: unknown }) => void
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      resolveJson({ statusCode, body })
      return this
    },
  } as unknown as Response
  store.getRun.mockResolvedValue({
    id: run.id,
    runType: "standard",
    seed: "s",
    rngState: 1,
    locale: "en",
    character: run,
    pendingEvent,
    finished: false,
  })
  store.saveRun.mockResolvedValue(undefined)

  const jsonPromise = new Promise<{ statusCode: number; body: unknown }>((r) => {
    resolveJson = r
  })
  const req = {
    method: "POST",
    url: "/choose",
    body: { runId: run.id, cardId },
    query: {},
  } as unknown as Request
  gameRouter(req, res, () => {})
  return jsonPromise
}

// Drive POST /minigame-move with a synthetic pending interactive event on the
// run (the real interactive minigame content ships in Task 8).
async function postMinigameMove(run: CharacterState, pendingEvent: EventContent, move: unknown) {
  let statusCode = 200
  let resolveJson!: (v: { statusCode: number; body: unknown }) => void
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      resolveJson({ statusCode, body })
      return this
    },
  } as unknown as Response
  store.getRun.mockResolvedValue({
    id: run.id,
    runType: "standard",
    seed: "s",
    rngState: 1,
    locale: "en",
    character: run,
    pendingEvent,
    finished: false,
  })
  store.saveRun.mockResolvedValue(undefined)

  const jsonPromise = new Promise<{ statusCode: number; body: unknown }>((r) => {
    resolveJson = r
  })
  const req = {
    method: "POST",
    url: "/minigame-move",
    body: { runId: run.id, move },
    query: {},
  } as unknown as Request
  gameRouter(req, res, () => {})
  return jsonPromise
}

describe("POST /buy · achievementTrigger wiring", () => {
  it("buying floating_realm unlocks jetset_life and returns it in newAchievements", async () => {
    const c = makeLegendRun()
    const { body } = await postBuy(c, "floating_realm")

    const res = body as {
      character: CharacterState
      purchased: string
      gold: number
      inventory: { itemId: string; qty: number }[]
      newAchievements: { id: string }[]
    }
    expect(res.purchased).toBe("floating_realm")
    expect(res.gold).toBe(1000) // 13000 - 12000
    expect(res.character.gold).toBe(1000)
    expect(res.character.counters["jetset_life"]).toBe(1)
    expect(res.inventory.some((i) => i.itemId === "floating_realm")).toBe(true)
    expect(res.newAchievements.map((a) => a.id)).toContain("jetset_life")
    expect(res.character.achievements).toContain("jetset_life")
    expect(store.saveRun).toHaveBeenCalled()
  })

  it("buying an item without a trigger returns no new achievements", async () => {
    const c = makeLegendRun()
    const { body } = await postBuy(c, "camp_cook")

    const res = body as { newAchievements: { id: string }[]; character: CharacterState }
    expect(res.newAchievements).toHaveLength(0)
    expect(res.character.counters["jetset_life"]).toBeUndefined()
    expect(res.character.achievements).not.toContain("jetset_life")
  })

  it("rejects a purchase the character cannot afford", async () => {
    const c = makeLegendRun()
    c.gold = 500
    const { statusCode, body } = await postBuy(c, "floating_realm")

    expect(statusCode).toBe(400)
    const res = body as { error: string }
    expect(res.error).toBe("not_enough_gold")
  })
})

describe("POST /choose · interactive minigame guard", () => {
  it("/choose rejects interactive minigames", async () => {
    const c = makeLegendRun()
    // goblin_games.json (the real interactive minigame content) ships in Task 8;
    // drive the guard through a synthetic interactive event on run.pendingEvent.
    const ev: EventContent = {
      id: "interactive_route_test",
      type: "minigame",
      subtype: "interactive",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "intelligence",
      narrative: { en: "n", es: "n" },
      resolution: {
        type: "interactive",
        game: "rps",
        bestOf: 3,
        baseWinChance: 0.5,
        statInfluence: {},
      },
      outcomes: {
        critical: { narrative: { en: "c", es: "c" } },
        success: { narrative: { en: "s", es: "s" } },
        partial: { narrative: { en: "p", es: "p" } },
        fail: { narrative: { en: "f", es: "f" } },
      },
    }
    c.pendingMinigame = {
      eventId: ev.id,
      game: "rps",
      bestOf: 3,
      playerWins: 0,
      rivalWins: 0,
      rivalLastChoice: null,
      playerLastChoice: null,
    }
    const { statusCode, body } = await postChoose(c, ev, "rock")
    expect(statusCode).toBe(400)
    const res = body as { error: string }
    expect(res.error).toBe("interactive_minigame")
  })
})

describe("POST /minigame-move · interactive minigame moves", () => {
  // Synthetic interactive tictactoe content (real content ships in Task 8).
  const interactiveEv: EventContent = {
    id: "tactician_boards",
    type: "minigame",
    subtype: "interactive",
    minAge: 0,
    maxAge: 99,
    weight: 1,
    primaryStat: "intelligence",
    narrative: { en: "n", es: "n" },
    resolution: {
      type: "interactive",
      game: "tictactoe",
      baseWinChance: 0.5,
      statInfluence: {},
    },
    outcomes: {
      critical: { narrative: { en: "c", es: "c" } },
      success: { narrative: { en: "s", es: "s" } },
      partial: { narrative: { en: "p", es: "p" } },
      fail: { narrative: { en: "f", es: "f" } },
    },
  }

  it("/minigame-move advances a tictactoe game and finishes it", async () => {
    const c = makeLegendRun()
    c.pendingMinigame = {
      eventId: interactiveEv.id,
      game: "tictactoe",
      board: Array(9).fill(null),
      marksPlaced: 0,
    }
    const { statusCode, body } = await postMinigameMove(c, interactiveEv, {
      kind: "tictactoe",
      cell: 0,
    })
    expect(statusCode).toBe(200)
    const res = body as {
      status: string
      minigame: { game: string; view: { board: (string | null)[]; over: boolean } }
      feedback: null
    }
    expect(res.status).toBe("playing")
    expect(res.minigame.view.board[0]).toBe("X")
    const rivalCells = res.minigame.view.board.filter((cell) => cell === "O")
    expect(rivalCells).toHaveLength(1)
    expect(res.feedback).toBeNull()
    expect(store.saveRun).toHaveBeenCalled()
  })

  it("/minigame-move rejects moves when no interactive game is pending", async () => {
    const c = makeLegendRun()
    const { statusCode, body } = await postMinigameMove(c, interactiveEv, {
      kind: "tictactoe",
      cell: 0,
    })
    expect(statusCode).toBe(400)
    const res = body as { error: string }
    expect(res.error).toBe("no_interactive_minigame")
  })
})

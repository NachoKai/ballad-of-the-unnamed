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
import type { CharacterState } from "../../shared/types.js"

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

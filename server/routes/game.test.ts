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

import { Rng } from "../../shared/rng.js"
import { gameRouter } from "./game.js"
import { createCharacter } from "../engine/engine.js"
import { startCombatState } from "../engine/combat/index.js"
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
    rivalRngState: 1,
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
    rivalRngState: 1,
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

// Drive POST /archetype-draw (no store interaction — synchronous route).
async function postDraw(classId: string, unlockedClasses?: string[]) {
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

  const jsonPromise = new Promise<{ statusCode: number; body: unknown }>((r) => {
    resolveJson = r
  })
  const req = {
    method: "POST",
    url: "/archetype-draw",
    body: { classId, locale: "en", gender: "male", unlockedClasses },
    query: {},
  } as unknown as Request
  gameRouter(req, res, () => {})
  return jsonPromise
}

// Drive POST /combat-move with a pending combat event on the run.
async function postCombatMove(run: CharacterState, pendingEvent: EventContent, move: unknown) {
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
    rivalRngState: 1,
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
    url: "/combat-move",
    body: { runId: run.id, move },
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
    rivalRngState: 1,
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

describe("POST /archetype-draw · hidden master filtering", () => {
  it("serves every archetype, with locked masters masked as ??? cards", async () => {
    const { statusCode, body } = await postDraw("warrior")
    expect(statusCode).toBe(200)
    const res = body as {
      archetypes: {
        id: string
        locked?: boolean
        name: string
        statDeltas: Record<string, number>
      }[]
    }
    expect(res.archetypes).toHaveLength(9) // 8 normal + 1 hidden master
    const warlord = res.archetypes.find((a) => a.id === "warlord")!
    expect(warlord.locked).toBe(true)
    expect(warlord.name).toBe("???")
    expect(warlord.statDeltas).toEqual({})
    // Normal archetypes are served in full, never flagged locked.
    const berserker = res.archetypes.find((a) => a.id === "berserker")!
    expect(berserker.locked).toBeUndefined()
    expect(berserker.name).toBe("Berserker")
    expect(berserker.statDeltas).toEqual({ strength: 8 })
  })

  it("serves the master archetype in full once its class is unlocked", async () => {
    const { statusCode, body } = await postDraw("warrior", ["warrior"])
    expect(statusCode).toBe(200)
    const res = body as {
      archetypes: {
        id: string
        locked?: boolean
        isMaster?: boolean
        statDeltas: Record<string, number>
      }[]
    }
    const warlord = res.archetypes.find((a) => a.id === "warlord")!
    expect(warlord.locked).toBeUndefined()
    expect(warlord.isMaster).toBe(true)
    expect(warlord.statDeltas).toEqual({ strength: 8, intelligence: 4 })
  })

  it("a hidden archetype is never served unlocked for a class outside unlockedClasses", async () => {
    for (const cls of ["wizard", "rogue", "ranger", "cleric", "bard"]) {
      const { body } = await postDraw(cls, ["warrior"]) // only warrior is unlocked
      const res = body as { archetypes: { id: string; locked?: boolean; isMaster?: boolean }[] }
      const master = res.archetypes.find((a) => a.isMaster)!
      expect(master, `${cls} must have a master archetype`).toBeTruthy()
      expect(master.locked).toBe(true)
      // the class's normal archetypes still come through pickable
      expect(res.archetypes.filter((a) => !a.isMaster).every((a) => !a.locked)).toBe(true)
    }
  })
})

describe("POST /new · locked master archetype guard", () => {
  it("rejects creating a run with a hidden archetype whose class is not unlocked", async () => {
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

    const jsonPromise = new Promise<{ statusCode: number; body: unknown }>((r) => {
      resolveJson = r
    })
    const req = {
      method: "POST",
      url: "/new",
      body: { name: "X", classId: "warrior", archetypeId: "warlord", locale: "en", gender: "male" },
      query: {},
    } as unknown as Request
    gameRouter(req, res, () => {})
    const { statusCode: code, body } = await jsonPromise
    expect(code).toBe(400)
    expect((body as { error: string }).error).toBe("locked_archetype")
  })

  it("accepts a master archetype when the class is in unlockedClasses", async () => {
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
      cookie() {
        return this
      },
    } as unknown as Response
    store.createRun.mockResolvedValue({
      id: "run-unlocked",
      runType: "standard",
      seed: "s",
      rngState: 1,
      rivalRngState: 1,
      locale: "en",
      character: null,
      pendingEvent: null,
      finished: false,
    })
    store.saveRun.mockResolvedValue(undefined)

    const jsonPromise = new Promise<{ statusCode: number; body: unknown }>((r) => {
      resolveJson = r
    })
    const req = {
      method: "POST",
      url: "/new",
      body: {
        name: "X",
        classId: "warrior",
        archetypeId: "warlord",
        unlockedClasses: ["warrior"],
        locale: "en",
        gender: "male",
      },
      query: {},
    } as unknown as Request
    gameRouter(req, res, () => {})
    const { statusCode: code, body } = await jsonPromise
    expect(code).toBe(200)
    const result = body as { character: { archetype: string | null } }
    expect(result.character.archetype).toBe("warlord")
  })
})

describe("POST /minigame-move · memotest", () => {
  const memotestEv: EventContent = {
    id: "relic_memotest",
    type: "minigame",
    subtype: "interactive",
    minAge: 0,
    maxAge: 99,
    weight: 1,
    primaryStat: "intelligence",
    narrative: { en: "n", es: "n" },
    resolution: {
      type: "interactive",
      game: "memotest",
      baseWinChance: 0.5,
      statInfluence: { intelligence: 0.012 },
      rivalSkill: 0.5,
    },
    outcomes: {
      critical: { narrative: { en: "c", es: "c" } },
      success: { narrative: { en: "s", es: "s" } },
      partial: { narrative: { en: "p", es: "p" } },
      fail: { narrative: { en: "f", es: "f" } },
    },
  }

  it("/minigame-move deals the deck on the first flip and reveals it", async () => {
    const c = makeLegendRun()
    c.pendingMinigame = {
      eventId: memotestEv.id,
      game: "memotest",
      playerPairs: 0,
      rivalPairs: 0,
      matched: [],
      revealed: [],
      rivalMemory: {},
      lastPlayerTurn: null,
      lastRivalTurn: null,
    }
    const { statusCode, body } = await postMinigameMove(c, memotestEv, {
      kind: "memotest",
      card: 5,
    })
    expect(statusCode).toBe(200)
    const res = body as {
      status: string
      minigame: { game: string; view: { revealed: number[]; faces: Record<number, string> } }
      feedback: null
    }
    expect(res.status).toBe("playing")
    expect(res.minigame.game).toBe("memotest")
    expect(res.minigame.view.revealed).toEqual([5])
    expect(Object.keys(res.minigame.view.faces)).toContain("5")
    expect(res.feedback).toBeNull()
    // deck persisted on the run for deterministic resume
    expect(c.pendingMinigame?.deck).toHaveLength(16)
    expect(store.saveRun).toHaveBeenCalled()
  })

  it("/minigame-move rejects an out-of-range memotest card", async () => {
    const c = makeLegendRun()
    c.pendingMinigame = {
      eventId: memotestEv.id,
      game: "memotest",
      playerPairs: 0,
      rivalPairs: 0,
      matched: [],
      revealed: [],
      rivalMemory: {},
      lastPlayerTurn: null,
      lastRivalTurn: null,
    }
    const { statusCode, body } = await postMinigameMove(c, memotestEv, {
      kind: "memotest",
      card: 99,
    })
    expect(statusCode).toBe(400)
    const res = body as { error: string }
    expect(res.error).toBe("invalid_move")
  })
})

describe("POST /minigame-move · circus_wheel lockup guard", () => {
  // The real wheel: 13 segments, costs 60 gold per spin. A player who banks a
  // single "nothing" spin and drops to 51 gold (below the cost) is stranded —
  // the Spin button dies, so the ONLY escape is cashing out. These tests pin
  // that Cash Out always works (never a 400/500) and that a broke spin never
  // flips the wheel over or crashes the night.
  const wheelEv = reg.minigames.find((m) => m.id === "circus_wheel_of_fortune")!
  const wheelCfg = wheelEv.wheel!

  function wheelChar(gold: number): CharacterState {
    const c = createCharacter({
      id: "r1",
      name: "Test",
      classId: "warrior",
      origin: "established",
      locale: "en",
      registry: reg,
    })
    c.turn = 4
    c.gold = gold
    return c
  }

  it("cash-out always resolves at 51 gold (broke after one nothing spin)", async () => {
    const c = wheelChar(51)
    c.pendingMinigame = {
      eventId: wheelEv.id,
      game: "circus_wheel",
      wheel: {
        segments: wheelCfg.segments,
        cost: wheelCfg.cost,
        spins: [0], // landed "Nothing"
        freeSpins: 0,
        net: -wheelCfg.cost,
        hitJackpot: false,
        over: false,
        mysteryResults: {},
      },
    }
    const { statusCode, body } = await postMinigameMove(c, wheelEv, {
      kind: "circus_wheel",
      action: "leave",
    })
    expect(statusCode).toBe(200)
    const res = body as { status: string; event?: unknown; ended?: boolean }
    expect(res.status).toBe("finished")
    expect(res.ended).toBe(false)
    // The wheel's night is done — the next, normal event is served, so the
    // player is never trapped on the wheel screen.
    expect(res.event).toBeDefined()
  })

  it("spin at 51 gold (cost 60) is rejected without marking the wheel over", async () => {
    const c = wheelChar(51)
    c.pendingMinigame = {
      eventId: wheelEv.id,
      game: "circus_wheel",
      wheel: {
        segments: wheelCfg.segments,
        cost: wheelCfg.cost,
        spins: [],
        freeSpins: 0,
        net: 0,
        hitJackpot: false,
        over: false,
        mysteryResults: {},
      },
    }
    const { statusCode, body } = await postMinigameMove(c, wheelEv, {
      kind: "circus_wheel",
      action: "spin",
    })
    expect(statusCode).toBe(400)
    expect((body as { error: string }).error).toBe("invalid_move")
    // No partial charge: gold untouched, net untouched, game still open so a
    // reload won't see the wheel as already-finished.
    expect(c.gold).toBe(51)
    expect(c.pendingMinigame?.wheel?.net).toBe(0)
    expect(c.pendingMinigame?.wheel?.over).toBe(false)
  })

  it("spin once then cash out ends the night (two-move session)", async () => {
    const c = wheelChar(60)
    c.pendingMinigame = {
      eventId: wheelEv.id,
      game: "circus_wheel",
      wheel: {
        segments: wheelCfg.segments,
        cost: wheelCfg.cost,
        spins: [],
        freeSpins: 0,
        net: 0,
        hitJackpot: false,
        over: false,
        mysteryResults: {},
      },
    }
    const spin = await postMinigameMove(c, wheelEv, { kind: "circus_wheel", action: "spin" })
    expect(spin.statusCode).toBe(200)
    const res = spin.body as { status: string; minigame: { view: { spins: number } } }
    expect(res.status).toBe("playing")
    expect(res.minigame.view.spins).toBe(1)
    expect(c.gold).toBeLessThan(60)
    const out = await postMinigameMove(c, wheelEv, { kind: "circus_wheel", action: "leave" })
    expect(out.statusCode).toBe(200)
    expect((out.body as { status: string }).status).toBe("finished")
  })
})

describe("POST /combat-move · combat encounters", () => {
  const roadAmbush = reg.combats.find((e) => e.id === "road_ambush")!

  function combatChar(): CharacterState {
    const c = createCharacter({
      id: "r1",
      name: "Test",
      classId: "warrior",
      origin: "established",
      locale: "en",
      registry: reg,
    })
    c.turn = 4
    return c
  }

  it("full fight to victory grants loot and counters", async () => {
    const c = combatChar()
    // Force a rat_swarm (18 hp) so the fight ends quickly.
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(2))
    c.pendingCombat.creature = reg.creaturesById.get("rat_swarm")!
    c.pendingCombat.creatureHealth = c.pendingCombat.creature.health

    let last: { statusCode: number; body: unknown } | null = null
    let guard = 0
    while (guard < 30) {
      last = await postCombatMove(c, roadAmbush, { kind: "attack" })
      const res = last.body as { status: string }
      if (res.status === "finished") break
      guard++
    }
    expect(last).not.toBeNull()
    const res = last!.body as {
      status: string
      ended: boolean
      event?: unknown
      character: CharacterState
      loot: { gold: number; fame: number; items: { itemId: string; qty: number }[] } | null
      combat: { game: string; view: { result: string } }
    }
    expect(res.status).toBe("finished")
    expect(res.combat.game).toBe("combat")
    expect(res.combat.view.result).toBe("won")
    expect(res.ended).toBe(false)
    expect(res.event).toBeDefined()
    expect(res.character.counters["monsters_killed"]).toBe(1)
    expect(res.character.counters["battles_won"]).toBe(1)
    expect(res.loot).not.toBeNull()
    expect(res.loot!.gold).toBeGreaterThan(0)
    expect(store.saveRun).toHaveBeenCalled()
  })

  it("a non-final move returns status playing and persists", async () => {
    const c = combatChar()
    // stone_golem has 90 hp — an attack cannot end it in one round.
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(1))
    c.pendingCombat.creature = reg.creaturesById.get("stone_golem")!
    c.pendingCombat.creatureHealth = c.pendingCombat.creature.health
    const { statusCode, body } = await postCombatMove(c, roadAmbush, { kind: "attack" })
    expect(statusCode).toBe(200)
    const res = body as { status: string; combat: { view: { round: number } }; feedback: null }
    expect(res.status).toBe("playing")
    expect(res.combat.view.round).toBe(1)
    expect(res.feedback).toBeNull()
    expect(c.pendingCombat).not.toBeNull()
    expect(store.saveRun).toHaveBeenCalled()
  })

  it("flee grants no rewards and does not complete the encounter", async () => {
    const c = combatChar()
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(1))
    // smoke guarantees the flee succeeds.
    c.pendingCombat.playerStatuses.push({ id: "smoke", turns: 0 })
    const { statusCode, body } = await postCombatMove(c, roadAmbush, { kind: "flee" })
    expect(statusCode).toBe(200)
    const res = body as {
      status: string
      combat: { view: { result: string } }
      character: CharacterState
      loot: unknown
    }
    expect(res.status).toBe("finished")
    expect(res.combat.view.result).toBe("fled")
    expect(res.character.counters["flees_count"]).toBe(1)
    expect(res.character.counters["battles_won"]).toBeUndefined()
    expect(res.character.counters["event_road_ambush"]).toBeUndefined()
    expect(res.loot).toBeNull()
  })

  it("death against a canKillPlayer creature ends the run", async () => {
    const c = combatChar()
    c.health = 20
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(1))
    c.pendingCombat.creature = reg.creaturesById.get("werewolf")!
    c.pendingCombat.creatureHealth = c.pendingCombat.creature.health

    let last: { statusCode: number; body: unknown } | null = null
    let guard = 0
    while (guard < 40) {
      last = await postCombatMove(c, roadAmbush, { kind: "attack" })
      const res = last.body as { status: string }
      if (res.status === "finished") break
      guard++
    }
    const res = last!.body as { status: string; ended: boolean; endingType?: string }
    expect(res.status).toBe("finished")
    expect(res.ended).toBe(true)
    expect(res.endingType).toBeDefined()
    expect(c.status).toBe("dead")
  })

  it("rejects a move when no combat is pending", async () => {
    const c = combatChar()
    const { statusCode, body } = await postCombatMove(c, roadAmbush, { kind: "attack" })
    expect(statusCode).toBe(400)
    expect((body as { error: string }).error).toBe("no_pending_combat")
  })

  it("rejects a move whose pending event id mismatches", async () => {
    const c = combatChar()
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(1))
    // Serve a different combat event as the pending event.
    const other = reg.combats.find((e) => e.id === "wolf_territory")!
    const { statusCode, body } = await postCombatMove(c, other, { kind: "attack" })
    expect(statusCode).toBe(400)
    expect((body as { error: string }).error).toBe("combat_mismatch")
  })

  it("rejects unknown abilities and bad move kinds", async () => {
    const c = combatChar()
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(1))
    const unknown = await postCombatMove(c, roadAmbush, {
      kind: "ability",
      abilityId: "nope",
    })
    expect(unknown.statusCode).toBe(400)
    expect((unknown.body as { error: string }).error).toBe("invalid_move")

    const badKind = await postCombatMove(c, roadAmbush, { kind: "dance" })
    expect(badKind.statusCode).toBe(400)
    expect((badKind.body as { error: string }).error).toBe("invalid_move")
  })

  it("rejects a move after the fight is over", async () => {
    const c = combatChar()
    c.pendingCombat = startCombatState(roadAmbush, c, reg, new Rng(1))
    c.pendingCombat.over = true
    c.pendingCombat.result = "won"
    const { statusCode, body } = await postCombatMove(c, roadAmbush, { kind: "attack" })
    expect(statusCode).toBe(400)
    expect((body as { error: string }).error).toBe("combat_already_finished")
  })

  it("/choose rejects combat events", async () => {
    const c = combatChar()
    const { statusCode, body } = await postChoose(c, roadAmbush, "anything")
    expect(statusCode).toBe(400)
    expect((body as { error: string }).error).toBe("combat_event")
  })
})

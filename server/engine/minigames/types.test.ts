import { describe, expect, it } from "vitest"
import type {
  InteractiveGameKind,
  InteractiveMove,
  PendingMinigameState,
  PressQuestion,
  ServedInteractiveState,
} from "../../../shared/types.js"

describe("interactive minigame types", () => {
  it("discriminates tictactoe state from rps state", () => {
    const ttt: PendingMinigameState = {
      eventId: "tactician_boards",
      game: "tictactoe",
      board: Array(9).fill(null),
      marksPlaced: 0,
    }
    const rps: PendingMinigameState = {
      eventId: "goblin_hand_game",
      game: "rps",
      bestOf: 3,
      playerWins: 0,
      rivalWins: 0,
      rivalLastChoice: null,
      playerLastChoice: null,
    }
    expect(ttt.game).toBe("tictactoe")
    expect(rps.bestOf).toBe(3)
  })

  it("shapes a client move", () => {
    const move: InteractiveMove = { kind: "tictactoe", cell: 4 }
    expect(move.kind).toBe("tictactoe")
    const rpsMove: InteractiveMove = { kind: "rps", choice: "paper" }
    expect(rpsMove.kind).toBe("rps")
    const memMove: InteractiveMove = { kind: "memotest", card: 11 }
    expect(memMove.kind).toBe("memotest")
  })

  it("discriminates memotest state from the other games", () => {
    const mem: PendingMinigameState = {
      eventId: "relic_memotest",
      game: "memotest",
      deck: ["dragon_egg", "sword", "dragon_egg", "sword"],
      matched: [],
      playerMatched: [],
      rivalMatched: [],
      revealed: [2],
      playerPairs: 0,
      rivalPairs: 0,
      rivalMemory: {},
      lastPlayerTurn: null,
      lastRivalTurn: null,
    }
    expect(mem.game).toBe("memotest")
    expect(mem.deck?.[0]).toBe("dragon_egg")
    expect(mem.revealed).toEqual([2])
  })

  it("serializes a served memotest view", () => {
    const view: ServedInteractiveState = {
      game: "memotest",
      size: 4,
      pairsTotal: 8,
      playerPairs: 2,
      rivalPairs: 1,
      matched: [0, 1],
      playerMatched: [0, 1],
      rivalMatched: [],
      revealed: [],
      faces: { 0: "gem", 1: "gem" },
      lastPlayerTurn: null,
      lastRivalTurn: null,
      over: false,
      result: "playing",
    }
    expect(view.game).toBe("memotest")
    expect(view.faces[0]).toBe("gem")
    expect(view.result).toBe("playing")
  })

  it("serializes a served interactive state", () => {
    const view: ServedInteractiveState = {
      game: "tictactoe",
      board: Array(9).fill(null),
      playerMark: "X",
      rivalMark: "O",
      over: false,
      result: "playing",
    }
    expect(view.over).toBe(false)
  })
})

describe("press_conference types", () => {
  it("exposes the press_conference interactive kind", () => {
    const kind: InteractiveGameKind = "press_conference"
    expect(kind).toBe("press_conference")
  })

  it("the press_conference move discriminant is structurally valid", () => {
    const m: InteractiveMove = { kind: "press_conference", card: 2 }
    // Narrowing the union must succeed.
    if (m.kind === "press_conference") expect(m.card).toBe(2)
    else expect.fail("should narrow")
  })

  it("served view carries a press_conference branch", () => {
    const view: ServedInteractiveState = {
      game: "press_conference",
      index: 0,
      questions: [],
      answers: [],
      revealed: [],
      wanted: [null, null, null],
      over: false,
      result: "playing",
    }
    expect(view.game).toBe("press_conference")
    if (view.game === "press_conference") expect(view.result).toBe("playing")
  })

  it("PressQuestion carries a bilingual prompt and options", () => {
    const q: PressQuestion = {
      id: "q1",
      prompt: { en: "Who are you?", es: "¿Quién sos?" },
      options: [{ id: "a", icon: "gem", tag: "Confident", wantedTags: { Confident: 1 } }],
    }
    expect(q.options.length).toBeGreaterThan(0)
    expect(q.options[0].tag).toBe("Confident")
  })
})

import { describe, expect, it } from "vitest"
import type {
  InteractiveMove,
  PendingMinigameState,
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

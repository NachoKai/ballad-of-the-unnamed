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

import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import {
  createTicTacToeState,
  findWinningLine,
  isBoardFull,
  legalMoves,
  playerMarksUsed,
  rivalTicTacToeMove,
  WIN_LINES,
} from "./ticTacToe.js"
import type { TicTacToeCell } from "../../../shared/types.js"

function board(cells: Array<TicTacToeCell>): TicTacToeCell[] {
  return cells
}

describe("ticTacToe engine", () => {
  it("creates an empty 3x3 state", () => {
    const s = createTicTacToeState("e1")
    expect(s.game).toBe("tictactoe")
    expect(s.eventId).toBe("e1")
    expect(s.board).toEqual(Array(9).fill(null))
    expect(s.marksPlaced).toBe(0)
  })

  it("knows the eight winning lines", () => {
    expect(WIN_LINES).toHaveLength(8)
    expect(WIN_LINES[0]).toEqual([0, 1, 2]) // top row
    expect(WIN_LINES[7]).toEqual([2, 4, 6]) // anti-diagonal
  })

  it("finds a winning row", () => {
    const b = board(["X", "X", "X", null, null, null, null, null, null])
    expect(findWinningLine(b)).toEqual([0, 1, 2])
  })

  it("finds a winning column", () => {
    const b = board(["O", null, null, "O", null, null, "O", null, null])
    expect(findWinningLine(b)).toEqual([0, 3, 6])
  })

  it("returns null when nobody has three in a row", () => {
    const b = board(["X", "O", "X", "X", "O", "O", "O", "X", "X"])
    expect(findWinningLine(b)).toBeNull()
  })

  it("detects a full board", () => {
    const full = board(["X", "O", "X", "X", "O", "O", "O", "X", "X"])
    expect(isBoardFull(full)).toBe(true)
    const partial = board(["X", "O", "X", null, "O", "O", "O", "X", "X"])
    expect(isBoardFull(partial)).toBe(false)
  })

  it("counts player (X) marks used", () => {
    const b = board(["X", "O", "X", null, "O", "O", "O", "X", "X"])
    expect(playerMarksUsed(b)).toBe(4)
  })

  it("lists only empty cells as legal", () => {
    const b = board(["X", null, null, "O", null, null, null, null, null])
    expect(legalMoves(b)).toEqual([1, 2, 4, 5, 6, 7, 8])
  })

  it("blocks an immediate player threat at skill 1", () => {
    // Player X owns [0,1]; O to move must take 2.
    const b = board(["X", "X", null, "O", null, null, null, null, null])
    const move = rivalTicTacToeMove(b, 1, new Rng(99))
    expect(move).toBe(2)
  })

  it("takes the winning move when available at skill 1", () => {
    // O owns [0,4]; O to move must take 8 to win the diagonal.
    const b = board(["O", "X", null, null, "O", null, "X", null, null])
    const move = rivalTicTacToeMove(b, 1, new Rng(7))
    expect(move).toBe(8)
  })

  it("plays a random legal move at skill 0", () => {
    const b = board(["X", null, null, null, null, null, null, null, null])
    const move = rivalTicTacToeMove(b, 0, new Rng(123))
    expect(legalMoves(b)).toContain(move)
  })

  it("is deterministic for a fixed seed at skill 0", () => {
    const b = board([null, null, null, null, null, null, null, null, null])
    const a = rivalTicTacToeMove(b, 0, new Rng(42))
    const c2 = rivalTicTacToeMove([...b], 0, new Rng(42))
    expect(a).toBe(c2)
  })
})

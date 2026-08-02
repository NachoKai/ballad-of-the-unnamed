import { describe, expect, it } from "vitest"
import { boardToRows } from "./TicTacToeGame"

describe("boardToRows", () => {
  it("splits a flat 9-cell board into 3 rows of 3", () => {
    const rows = boardToRows(Array(9).fill(null))
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row).toHaveLength(3)
  })

  it("preserves cell order left-to-right, top-to-bottom", () => {
    const board: Array<"X" | "O" | null> = ["X", "O", null, null, "X", null, "O", null, "X"]
    const rows = boardToRows(board)
    expect(rows[0]).toEqual(["X", "O", null])
    expect(rows[1]).toEqual([null, "X", null])
    expect(rows[2]).toEqual(["O", null, "X"])
  })
})

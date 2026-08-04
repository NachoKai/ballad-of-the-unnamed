import { describe, expect, it } from "vitest"
import { cardRows, isFaceUp } from "./MemotestGame"
import type { ServedInteractiveState } from "@shared/types"

function memView(partial: Partial<Extract<ServedInteractiveState, { game: "memotest" }>> = {}) {
  return {
    game: "memotest" as const,
    size: 4,
    pairsTotal: 8,
    playerPairs: 0,
    rivalPairs: 0,
    matched: [],
    playerMatched: [],
    rivalMatched: [],
    revealed: [],
    faces: {},
    lastPlayerTurn: null,
    lastRivalTurn: null,
    over: false,
    result: "playing" as const,
    ...partial,
  }
}

describe("isFaceUp", () => {
  it("returns true for matched cards", () => {
    expect(isFaceUp(memView({ matched: [0, 7] }), 0)).toBe(true)
    expect(isFaceUp(memView({ matched: [0, 7] }), 1)).toBe(false)
  })

  it("returns true for revealed (pending) cards", () => {
    expect(isFaceUp(memView({ revealed: [11] }), 11)).toBe(true)
    expect(isFaceUp(memView({ revealed: [11] }), 12)).toBe(false)
  })
})

describe("cardRows", () => {
  it("builds a 4x4 row-major index grid", () => {
    const rows = cardRows(4, 16)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual([0, 1, 2, 3])
    expect(rows[3]).toEqual([12, 13, 14, 15])
  })

  it("preserves row-major order left-to-right, top-to-bottom", () => {
    const flat = rowsToFlat(cardRows(4, 16))
    expect(flat).toEqual(Array.from({ length: 16 }, (_, i) => i))
  })
})

function rowsToFlat(rows: number[][]): number[] {
  return rows.flat()
}

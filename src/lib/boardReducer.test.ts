import { describe, expect, it } from "vitest"
import { boardReducer } from "./boardReducer"

const initial = { loading: true, error: null, entries: [] as number[] }

describe("boardReducer", () => {
  it("start sets loading true, clears error and entries", () => {
    const before = { loading: false, error: "boom", entries: [1, 2] }
    expect(boardReducer(before, { type: "start" })).toEqual(initial)
  })

  it("ok stores entries, clears error, stops loading", () => {
    const before = { loading: true, error: null, entries: [] as number[] }
    expect(boardReducer(before, { type: "ok", entries: [3, 4] })).toEqual({
      loading: false,
      error: null,
      entries: [3, 4],
    })
  })

  it("fail stores the message, clears entries, stops loading", () => {
    const before = { loading: true, error: null, entries: [1] as number[] }
    expect(boardReducer(before, { type: "fail", message: "nope" })).toEqual({
      loading: false,
      error: "nope",
      entries: [],
    })
  })

  it("replaces previous entries on a subsequent ok", () => {
    const before = { loading: false, error: null, entries: [1] as number[] }
    expect(boardReducer(before, { type: "ok", entries: [9] })).toEqual({
      loading: false,
      error: null,
      entries: [9],
    })
  })
})

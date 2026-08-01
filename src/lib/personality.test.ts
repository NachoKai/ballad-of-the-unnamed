import { describe, expect, it } from "vitest"
import { personalitySummary } from "./personality"

describe("personalitySummary", () => {
  it("returns an empty array for an empty personality", () => {
    expect(personalitySummary({})).toEqual([])
  })

  it("returns a single tag when only one exists", () => {
    expect(personalitySummary({ Humble: 2 })).toEqual(["Humble"])
  })

  it("sorts tags by weight descending", () => {
    expect(personalitySummary({ Humble: 1, Cocky: 3, Brave: 2 })).toEqual([
      "Cocky",
      "Brave",
      "Humble",
    ])
  })

  it("truncates to the top 3 tags", () => {
    const p = { a: 5, b: 4, c: 3, d: 2, e: 1 }
    expect(personalitySummary(p)).toEqual(["a", "b", "c"])
  })

  it("returns fewer than 3 tags when the personality is small", () => {
    expect(personalitySummary({ Lone: 4, Quiet: 1 })).toEqual(["Lone", "Quiet"])
  })

  it("keeps insertion order for ties", () => {
    // Both tags have weight 2; Object.entries order (insertion order) is stable
    // for Array.prototype.sort, so the earlier tag wins.
    expect(personalitySummary({ Brave: 2, Wise: 2 })).toEqual(["Brave", "Wise"])
  })

  it("does not mutate the input object", () => {
    const p = { Humble: 1, Cocky: 3, Brave: 2 }
    const snapshot = { ...p }
    personalitySummary(p)
    expect(p).toEqual(snapshot)
  })
})

import { describe, expect, it } from "vitest"
import { TUTORIAL_PAGES } from "./tutorial"

describe("tutorial content", () => {
  it("has at least one page", () => {
    expect(TUTORIAL_PAGES.length).toBeGreaterThan(0)
  })

  it("every page has a non-empty title and body in both en and es", () => {
    for (const page of TUTORIAL_PAGES) {
      expect(page.title.en.length).toBeGreaterThan(0)
      expect(page.title.es.length).toBeGreaterThan(0)
      expect(page.body.en.length).toBeGreaterThan(0)
      expect(page.body.es.length).toBeGreaterThan(0)
    }
  })

  it("page ids are unique", () => {
    const ids = TUTORIAL_PAGES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

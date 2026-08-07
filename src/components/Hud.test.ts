import { describe, expect, it } from "vitest"
import { AFFINITY_TIERS } from "@shared/config"
import { makeT } from "../i18n/strings"

describe("affinity tier labels", () => {
  it("localizes every AFFINITY_TIERS id in en and es", () => {
    for (const tier of AFFINITY_TIERS) {
      const key = `affinity_tier_${tier.id}`
      const en = makeT("en")(key)
      const es = makeT("es")(key)
      expect(en.length).toBeGreaterThan(0)
      expect(es.length).toBeGreaterThan(0)
      // The key must resolve to real text, never fall through to the raw key.
      expect(en).not.toBe(key)
      expect(es).not.toBe(key)
    }
  })
})

describe("npc role labels", () => {
  // Every role authored via introducesNpcRole in content/events (the engine
  // defaults to "acquaintance" when a choice omits it). Keep in sync.
  const ROLES = [
    "mentor",
    "friend",
    "love_interest",
    "nemesis",
    "child",
    "apprentice",
    "ally",
    "acquaintance",
  ]

  it("localizes every npcRole in en and es", () => {
    for (const role of ROLES) {
      const key = `npcRole_${role}`
      const en = makeT("en")(key)
      const es = makeT("es")(key)
      expect(en.length).toBeGreaterThan(0)
      expect(es.length).toBeGreaterThan(0)
      // The key must resolve to real text, never fall through to the raw key.
      expect(en).not.toBe(key)
      expect(es).not.toBe(key)
    }
  })
})

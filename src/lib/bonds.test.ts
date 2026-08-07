import { describe, expect, it } from "vitest"
import { bondTone, showsBondPeak } from "./bonds"

describe("bondTone", () => {
  it("maps affinity to chip tones at the AFFINITY_TIERS boundaries", () => {
    expect(bondTone(100)).toBe("sage")
    expect(bondTone(50)).toBe("sage")
    expect(bondTone(49)).toBe("gold")
    expect(bondTone(20)).toBe("gold")
    expect(bondTone(19)).toBe("muted")
    expect(bondTone(0)).toBe("muted")
    expect(bondTone(-1)).toBe("blood")
    expect(bondTone(-100)).toBe("blood")
  })
})

describe("showsBondPeak", () => {
  it("marks only bonds that fell from a friend-tier peak", () => {
    // Fell from a real high: the classic "burned a friend" arc.
    expect(showsBondPeak({ affinity: 60, peakAffinity: 85 })).toBe(true)
    expect(showsBondPeak({ affinity: -70, peakAffinity: 85 })).toBe(true)
    // Reached exactly the friend-tier boundary before falling.
    expect(showsBondPeak({ affinity: 20, peakAffinity: 50 })).toBe(true)
    // Still at (or above-tracking) its peak — no arc to tell.
    expect(showsBondPeak({ affinity: 85, peakAffinity: 85 })).toBe(false)
    expect(showsBondPeak({ affinity: 40, peakAffinity: 40 })).toBe(false)
    // Fell from below friend tier: a trivial drift, not a story.
    expect(showsBondPeak({ affinity: 18, peakAffinity: 22 })).toBe(false)
    expect(showsBondPeak({ affinity: -70, peakAffinity: 25 })).toBe(false)
    // Never positive: a "peak" of 0 would read as "was +0 at their best".
    expect(showsBondPeak({ affinity: -80, peakAffinity: 0 })).toBe(false)
  })
})

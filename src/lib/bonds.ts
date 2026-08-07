// Bond display helpers shared by the HUD chip strip and the ending-screen
// relationships section.

// Bond chip/badge tone by affinity (-100..100): warm for allies, blood for
// foes, gold for promising acquaintances, muted for passing strangers.
export type BondTone = "sage" | "gold" | "muted" | "blood"

export function bondTone(affinity: number): BondTone {
  if (affinity >= 50) return "sage"
  if (affinity >= 20) return "gold"
  if (affinity >= 0) return "muted"
  return "blood"
}

// Whether a bond badge should show the peak-affinity arc marker. The
// relationship must have fallen from a friend-tier peak (>= 50 — the same
// cutoff the epilogue uses for "meaningful" relationships), so trivial dips
// like +22 → +18 don't get a marker that dilutes the consequential arcs.
// peakAffinity is always >= 0 (it starts at 0 and only tracks the max).
export function showsBondPeak(rel: { affinity: number; peakAffinity: number }): boolean {
  return rel.peakAffinity > rel.affinity && rel.peakAffinity >= 50
}

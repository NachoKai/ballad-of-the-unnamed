import type {
  CircusMysterySide,
  CircusWheelConfig,
  PendingMinigameState,
  OutcomeTier,
} from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"

// Create the persisted wheel state. Rng-FREE: the wheel config is authored
// content, so the resume path never needs the run Rng just to open the game.
export function createCircusState(eventId: string, wheel: CircusWheelConfig): PendingMinigameState {
  return {
    eventId,
    game: "circus_wheel",
    wheel: {
      segments: wheel.segments,
      cost: wheel.cost,
      spins: [],
      freeSpins: 0,
      net: 0,
      hitJackpot: false,
      over: false,
    },
  }
}

export function circusOver(state: PendingMinigameState): boolean {
  return state.wheel?.over === true
}

export interface CircusSpinResult {
  segment: number
  // mystery boxes reveal which side won on the landing (undefined otherwise).
  mystery?: CircusMysterySide
}

// Roll one spin: pick a segment uniformly, record the landing, and update the
// banked free spins / jackpot flag / net accumulator. Mystery boxes consume
// one extra rng draw for the treasure-vs-trap reveal (deterministic: a given
// seed + spin sequence always reveals the same side). The caller is
// responsible for charging the cost (via gold or a free spin) and for applying
// the character effects (gold/fame credits, item grants, health costs).
export function circusSpin(state: PendingMinigameState, rng: Rng): CircusSpinResult {
  const w = state.wheel
  if (!w || w.segments.length === 0) throw new Error("circus_wheel has no segments")
  const idx = rng.int(0, w.segments.length - 1)
  w.spins.push(idx)
  const seg = w.segments[idx]
  if (seg.kind === "freespin") w.freeSpins += 1
  if (seg.kind === "jackpot") w.hitJackpot = true
  if (seg.kind === "gold" || seg.kind === "jackpot") w.net += seg.amount ?? 0
  let mystery: CircusMysterySide | undefined
  if (seg.kind === "mystery") {
    mystery = rng.next() < (seg.chance ?? 0.5) ? "prize" : "injury"
    w.mysteryResults = { ...(w.mysteryResults ?? {}), [w.spins.length - 1]: mystery }
    if (mystery === "prize") w.net += seg.amount ?? 0
  }
  return { segment: idx, mystery }
}

// How the night went: hitting the jackpot is a critical; otherwise the tier
// tracks the net gold — ahead, broke-even-ish, or cleaned out.
export function circusTier(state: PendingMinigameState): OutcomeTier {
  const w = state.wheel
  if (!w) return "fail"
  if (w.hitJackpot) return "critical"
  if (w.net > 0) return "success"
  if (w.net >= -w.cost) return "partial"
  return "fail"
}

export function circusResult(state: PendingMinigameState): "playing" | "player_win" | "partial" | "player_lose" {
  const tier = circusTier(state)
  if (tier === "critical" || tier === "success") return "player_win"
  if (tier === "partial") return "partial"
  return "player_lose"
}

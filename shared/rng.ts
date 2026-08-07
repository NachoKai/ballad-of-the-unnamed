// Single deterministic PRNG per run. EVERY random draw in the turn-resolution
// pipeline (event pick, slot fill, rarity offer, minigame hidden var, injury
// roll) must go through one instance of this so daily mode ("same rolls for
// everyone that day") actually holds. Never call Math.random() in game logic.

export class Rng {
  private state: number

  constructor(seed: number) {
    // Ensure a non-zero 32-bit state.
    this.state = seed >>> 0 || 0x9e3779b9
  }

  // mulberry32
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // integer in [min, max]
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  bool(probability: number): boolean {
    return this.next() < probability
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  // weighted pick: items with a numeric weight
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    const total = items.reduce((sum, it) => sum + Math.max(0, weightOf(it)), 0)
    if (total <= 0) return items[0]
    let roll = this.next() * total
    for (const it of items) {
      roll -= Math.max(0, weightOf(it))
      if (roll < 0) return it
    }
    return items[items.length - 1]
  }

  // Snapshot / restore so a run can resume deterministically across requests.
  getState(): number {
    return this.state
  }
  setState(state: number): void {
    this.state = state >>> 0
  }
}

// Turn a string (e.g. a daily seed "2026-07-25" or a random uuid) into a 32-bit seed.
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function todayDailySeed(now = new Date()): string {
  // UTC midnight reseed: everyone on the same UTC date shares a seed.
  return now.toISOString().slice(0, 10)
}

// A parallel, independent-but-deterministic RNG stream for the archrival.
// Derived from the SAME run seed as the player's main stream, so the rival's
// whole career is a pure function of the seed (daily runs stay identical for
// everyone) — but it is a distinct stream, so rival rolls never consume or
// perturb the player's event sequence.
export function rivalRngFor(runSeed: string): Rng {
  return new Rng(hashSeed(runSeed + ":rival"))
}

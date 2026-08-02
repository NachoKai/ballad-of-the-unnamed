import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import {
  createMemotestState,
  dealMemotestDeck,
  ensureMemotestDeck,
  MEMOTEST_CARD_COUNT,
  MEMOTEST_FACES,
  memotestOver,
  memotestResult,
  rivalMemotestTurn,
} from "./memotest.js"
import type { PendingMinigameState } from "../../../shared/types.js"

describe("memotest engine", () => {
  it("creates an empty rng-free state", () => {
    const s = createMemotestState("e1")
    expect(s.game).toBe("memotest")
    expect(s.eventId).toBe("e1")
    expect(s.playerPairs).toBe(0)
    expect(s.rivalPairs).toBe(0)
    expect(s.matched).toEqual([])
    expect(s.revealed).toEqual([])
  })

  it("deals a deterministic 16-card deck with 8 pairs", () => {
    const deck = dealMemotestDeck(new Rng(42))
    expect(deck).toHaveLength(MEMOTEST_CARD_COUNT)
    const counts = new Map<string, number>()
    for (const face of deck) counts.set(face, (counts.get(face) ?? 0) + 1)
    expect(counts.size).toBe(MEMOTEST_FACES.length)
    for (const [, n] of counts) expect(n).toBe(2)
    // same seed => identical deal
    expect(dealMemotestDeck(new Rng(42))).toEqual(deck)
    expect(dealMemotestDeck(new Rng(43))).not.toEqual(deck)
  })

  it("deals the deck lazily on first use", () => {
    const s = createMemotestState("e1")
    expect(s.deck).toBeUndefined()
    const deck = ensureMemotestDeck(s, new Rng(7))
    expect(deck).toHaveLength(MEMOTEST_CARD_COUNT)
    expect(s.deck).toBe(deck)
  })

  it("knows when the altar is not yet cleared", () => {
    const s = createMemotestState("e1")
    expect(memotestOver(s)).toBe(false)
    expect(memotestResult(s)).toBe("playing")
  })

  it("declares a player win when pairs differ", () => {
    const s = createMemotestState("e1")
    s.deck = dealMemotestDeck(new Rng(1))
    s.matched = s.deck.map((_, i) => i)
    s.playerPairs = 5
    s.rivalPairs = 3
    expect(memotestOver(s)).toBe(true)
    expect(memotestResult(s)).toBe("player_win")
  })

  it("declares a draw on equal pair counts", () => {
    const s = createMemotestState("e1")
    s.deck = dealMemotestDeck(new Rng(1))
    s.matched = s.deck.map((_, i) => i)
    s.playerPairs = 4
    s.rivalPairs = 4
    expect(memotestResult(s)).toBe("draw")
  })

  it("a blind rival flips two distinct face-down cards", () => {
    const s = createMemotestState("e1")
    s.deck = dealMemotestDeck(new Rng(9))
    const turn = rivalMemotestTurn(s, null, 0, new Rng(3))
    expect(turn.cards).toHaveLength(2)
    expect(turn.cards[0]).not.toBe(turn.cards[1])
    expect(turn.matched).toBe(false)
    // blind play never resolves a pair (two distinct random cards)
    expect(s.rivalPairs).toBe(0)
    expect(s.lastRivalTurn?.matched).toBe(false)
  })

  it("a skilled rival remembers the player's miss and claims the pair", () => {
    const s = createMemotestState("e1")
    const deck = dealMemotestDeck(new Rng(5))
    s.deck = deck
    // find two indices with the same face to hand the rival as the player's miss
    const first = 0
    const second = deck.findIndex((f, i) => i !== first && f === deck[first])
    expect(second).toBeGreaterThan(0)
    const turn = rivalMemotestTurn(s, [first, second], 1, new Rng(11))
    expect(turn.matched).toBe(true)
    expect(s.rivalPairs).toBe(1)
    expect(s.matched).toContain(first)
    expect(s.matched).toContain(second)
  })

  it("a skilled rival claims a pair it has already seen", () => {
    const s = createMemotestState("e1")
    const deck = dealMemotestDeck(new Rng(5))
    s.deck = deck
    const a = 0
    const b = deck.findIndex((f, i) => i !== a && f === deck[a])!
    // rival saw the pair earlier
    s.rivalMemory = { [a]: deck[a], [b]: deck[b] }
    const turn = rivalMemotestTurn(s, null, 1, new Rng(2))
    expect(turn.matched).toBe(true)
    expect(turn.cards).toContain(a)
    expect(turn.cards).toContain(b)
  })

  it("a memory rival resolves the whole altar deterministically", () => {
    function play(seed: number) {
      const s = createMemotestState("e1")
      const rng = new Rng(seed)
      ensureMemotestDeck(s, rng)
      let guard = 0
      while (!memotestOver(s) && guard < 200) {
        rivalMemotestTurn(s, null, 1, rng)
        guard++
      }
      return { pairs: s.rivalPairs, guard }
    }
    expect(play(21)).toEqual(play(21))
    expect(play(21).pairs).toBe(8)
  })

  it("persists rival memory across turns (state shape)", () => {
    const s: PendingMinigameState = createMemotestState("e1")
    s.deck = dealMemotestDeck(new Rng(8))
    rivalMemotestTurn(s, null, 0, new Rng(4))
    expect(s.rivalMemory).toBeDefined()
    expect(Object.keys(s.rivalMemory ?? {})).toHaveLength(2)
  })
})

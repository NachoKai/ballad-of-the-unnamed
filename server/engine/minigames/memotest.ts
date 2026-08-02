import type { MemotestFace, PendingMinigameState } from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"

// Eight pairs of epic-fantasy relics on a 4x4 altar. Face keys are
// language-neutral; the client maps them to themed icons + labels.
export const MEMOTEST_FACES: MemotestFace[] = [
  "dragon_egg",
  "sword",
  "crown",
  "potion",
  "phoenix",
  "shield",
  "scroll",
  "gem",
]

export const MEMOTEST_SIZE = 4
export const MEMOTEST_CARD_COUNT = MEMOTEST_SIZE * MEMOTEST_SIZE

export interface MemotestTurn {
  cards: number[]
  matched: boolean
}

export function createMemotestState(eventId: string): PendingMinigameState {
  return {
    eventId,
    game: "memotest",
    playerPairs: 0,
    rivalPairs: 0,
    matched: [],
    revealed: [],
    rivalMemory: {},
    lastPlayerTurn: null,
    lastRivalTurn: null,
  }
}

// Fisher–Yates deal of 2x8 faces. Deterministic via the run Rng; called on the
// first move (never at state creation) so resume needs no Rng.
export function dealMemotestDeck(rng: Rng): MemotestFace[] {
  const deck: MemotestFace[] = [...MEMOTEST_FACES, ...MEMOTEST_FACES]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }
  return deck
}

// Deal the deck lazily on the first move; the run persists it from there on.
export function ensureMemotestDeck(state: PendingMinigameState, rng: Rng): MemotestFace[] {
  if (!state.deck || state.deck.length === 0) state.deck = dealMemotestDeck(rng)
  return state.deck
}

// The rival "sees" every card revealed so far: matched pairs, the player's
// just-missed pair (passed in as `seenPair`), and its own previous reveals.
// skill 1 = perfect memory, 0 = plays blind. All picks go through rng.
export function rivalMemotestTurn(
  state: PendingMinigameState,
  seenPair: [number, number] | null,
  skill: number,
  rng: Rng,
): MemotestTurn {
  const deck = ensureMemotestDeck(state, rng)
  const count = deck.length
  const matched = new Set(state.matched ?? [])
  const memory: Record<number, MemotestFace> = { ...(state.rivalMemory ?? {}) }
  for (const idx of matched) memory[idx] = deck[idx]
  if (seenPair) for (const idx of seenPair) memory[idx] = deck[idx]

  const faceDown = (idx: number): boolean => !matched.has(idx)

  if (rng.next() < skill) {
    // Remembered face-down cards grouped by face — grab a full pair if known.
    const byFace = new Map<MemotestFace, number[]>()
    for (const [idxStr, face] of Object.entries(memory)) {
      const idx = Number(idxStr)
      if (faceDown(idx)) {
        const bucket = byFace.get(face) ?? []
        bucket.push(idx)
        byFace.set(face, bucket)
      }
    }
    for (const bucket of byFace.values()) {
      if (bucket.length >= 2) {
        return flipRivalPair(state, [bucket[0], bucket[1]], memory, matched)
      }
    }
    // No known pair: flip one remembered card + one unseen card to build memory.
    const known = Object.keys(memory)
      .map(Number)
      .filter((idx) => faceDown(idx))
    const unknown: number[] = []
    for (let idx = 0; idx < count; idx++) {
      if (faceDown(idx) && memory[idx] === undefined) unknown.push(idx)
    }
    const first = known.length > 0 ? rng.pick(known) : rng.pick(unknown)
    const secondPool = unknown.filter((idx) => idx !== first)
    const second =
      secondPool.length > 0
        ? rng.pick(secondPool)
        : rng.pick(known.filter((idx) => idx !== first))
    return flipRivalPair(state, [first, second], memory, matched)
  }

  // Blind play: two uniformly random face-down cards.
  const faceDownList: number[] = []
  for (let idx = 0; idx < count; idx++) if (faceDown(idx)) faceDownList.push(idx)
  const first = rng.pick(faceDownList)
  const second = rng.pick(faceDownList.filter((idx) => idx !== first))
  return flipRivalPair(state, [first, second], memory, matched)
}

function flipRivalPair(
  state: PendingMinigameState,
  cards: number[],
  memory: Record<number, MemotestFace>,
  matched: Set<number>,
): MemotestTurn {
  const deck = state.deck!
  const [a, b] = cards
  const turn: MemotestTurn = { cards, matched: false }
  for (const idx of cards) memory[idx] = deck[idx]
  if (deck[a] === deck[b]) {
    turn.matched = true
    state.rivalPairs = (state.rivalPairs ?? 0) + 1
    state.matched = [...matched, a, b]
  }
  state.rivalMemory = memory
  state.lastRivalTurn = { cards, matched: turn.matched }
  return turn
}

export function memotestOver(state: PendingMinigameState): boolean {
  const total = state.deck?.length ?? MEMOTEST_CARD_COUNT
  return (state.matched?.length ?? 0) === total
}

// Memotest results carry a draw: equal pair counts leave the altar split.
export function memotestResult(
  state: PendingMinigameState,
): "playing" | "player_win" | "rival_win" | "draw" {
  if (!memotestOver(state)) return "playing"
  const pp = state.playerPairs ?? 0
  const rp = state.rivalPairs ?? 0
  if (pp > rp) return "player_win"
  if (rp > pp) return "rival_win"
  return "draw"
}

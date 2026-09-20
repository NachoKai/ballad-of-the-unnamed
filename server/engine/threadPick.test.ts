import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./jev.js", () => ({
  jevEnabled: vi.fn(() => true),
  askJevChoice: vi.fn(),
}))
vi.mock("../store/jevCache.js", () => ({
  getJevCache: vi.fn(async () => null),
  putJevCache: vi.fn(async () => {}),
}))

import type { CharacterState, ThreadContent } from "../../shared/types.js"
import type { ContentRegistry } from "../content/registry.js"
import { askJevChoice, jevEnabled } from "./jev.js"
import { getJevCache, putJevCache } from "../store/jevCache.js"
import {
  buildThreadRecap,
  coarseSignature,
  refineThreadPick,
  threadPickCacheKey,
  threadRelevantFlags,
} from "./threadPick.js"

const threadA: ThreadContent = { id: "a", title: { en: "Thread A", es: "Trama A" }, beats: [] }
const threadB: ThreadContent = { id: "b", title: { en: "Thread B", es: "Trama B" }, beats: [] }
const registry = { threads: [threadA, threadB] } as unknown as ContentRegistry

function makeChar(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: "run-1",
    age: 20,
    class: "warrior",
    archetype: null,
    currentArc: "adventurer",
    currentRegion: "vale",
    fame: 0,
    gold: 100,
    turn: 3,
    personality: { brave: 2 },
    flags: {},
    activeThread: { id: "a", beatIndex: 0 },
    threadCandidates: ["a", "b"],
    threadPickPending: true,
    ...overrides,
  } as unknown as CharacterState
}

function answer(choice: string, confidence = 0.9) {
  return [{ id: "thread", choice, confidence, probabilities: { [choice]: confidence } }]
}

describe("thread pick — signature + cache key", () => {
  it("ignores run id and turn log (only coarse fields matter)", () => {
    const flags = threadRelevantFlags(registry)
    const a = makeChar({ id: "run-1", turn: 3 })
    const b = makeChar({ id: "run-2", turn: 99 })
    expect(coarseSignature(a, flags)).toBe(coarseSignature(b, flags))
  })

  it("is stable regardless of personality key order", () => {
    const flags = threadRelevantFlags(registry)
    const a = makeChar({ personality: { brave: 2, cunning: 1 } })
    const b = makeChar({ personality: { cunning: 1, brave: 2 } })
    expect(coarseSignature(a, flags)).toBe(coarseSignature(b, flags))
  })

  it("changes with the coarse fields", () => {
    const flags = threadRelevantFlags(registry)
    expect(coarseSignature(makeChar({ fame: 0 }), flags)).not.toBe(
      coarseSignature(makeChar({ fame: 500 }), flags),
    )
  })

  it("produces the same cache key for the same day and the same key on different days", () => {
    const ids = ["b", "a"]
    const key = threadPickCacheKey("sig", ids, "2026-01-01")
    expect(threadPickCacheKey("sig", ["a", "b"], "2026-01-01")).toBe(key)
    expect(threadPickCacheKey("sig", ids, "2026-01-02")).not.toBe(key)
  })

  it("gathers only flag keys that can gate a thread", () => {
    const reg = {
      threads: [
        { id: "a", title: { en: "A", es: "A" }, beats: [], requiresFlag: { gated_a: true } },
        { id: "b", title: { en: "B", es: "B" }, beats: [], excludeIfFlag: { gated_b: true } },
      ],
    } as unknown as ContentRegistry
    const flags = threadRelevantFlags(reg)
    expect([...flags].sort()).toEqual(["gated_a", "gated_b"])
    // Unrelated flags do not fragment the signature.
    const sig = coarseSignature(makeChar({ flags: { gated_a: true, unrelated: 1 } }), flags)
    expect(sig).toContain("gated_a")
    expect(sig).not.toContain("unrelated")
  })
})

describe("refineThreadPick", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(jevEnabled).mockReturnValue(true)
    vi.mocked(getJevCache).mockResolvedValue(null)
    vi.mocked(askJevChoice).mockResolvedValue(null)
    vi.mocked(putJevCache).mockResolvedValue(undefined)
  })

  it("bails immediately when Jev is disabled", async () => {
    vi.mocked(jevEnabled).mockReturnValue(false)
    const c = makeChar()
    expect(await refineThreadPick(c, registry)).toBe(false)
    expect(c.threadPickPending).toBe(true)
    expect(askJevChoice).not.toHaveBeenCalled()
  })

  it("uses a cached choice without calling Jev", async () => {
    vi.mocked(getJevCache).mockResolvedValue({ choice: "b", payload: {} })
    const c = makeChar()
    expect(await refineThreadPick(c, registry)).toBe(true)
    expect(c.activeThread).toEqual({ id: "b", beatIndex: 0 })
    expect(c.threadPickPending).toBe(false)
    expect(askJevChoice).not.toHaveBeenCalled()
  })

  it("stores and applies a Jev pick on a cache miss", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(answer("b"))
    const c = makeChar()
    await refineThreadPick(c, registry)
    expect(c.activeThread).toEqual({ id: "b", beatIndex: 0 })
    expect(putJevCache).toHaveBeenCalledTimes(1)
  })

  it("keeps the fallback and clears pending when Jev returns null", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(null)
    const c = makeChar()
    await refineThreadPick(c, registry)
    expect(c.activeThread).toEqual({ id: "a", beatIndex: 0 })
    expect(c.threadPickPending).toBe(false)
    expect(putJevCache).not.toHaveBeenCalled()
  })

  it("keeps the fallback when the Jev pick is not a candidate", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(answer("not_a_candidate"))
    const c = makeChar()
    await refineThreadPick(c, registry)
    expect(c.activeThread).toEqual({ id: "a", beatIndex: 0 })
    expect(c.threadPickPending).toBe(false)
  })

  it("keeps the fallback below the confidence floor", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(answer("b", 0.2))
    const c = makeChar()
    await refineThreadPick(c, registry)
    expect(c.activeThread).toEqual({ id: "a", beatIndex: 0 })
    expect(putJevCache).not.toHaveBeenCalled()
  })

  it("clears pending and reports a change when no candidate resolves", async () => {
    const c = makeChar({ threadCandidates: ["ghost"] })
    expect(await refineThreadPick(c, registry)).toBe(true)
    expect(c.threadPickPending).toBe(false)
  })

  it("buildThreadRecap is human-readable and mentions the class", () => {
    expect(buildThreadRecap(makeChar())).toContain("warrior")
  })
})

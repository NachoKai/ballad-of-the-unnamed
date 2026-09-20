import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./jev.js", () => ({
  jevEnabled: vi.fn(() => true),
  askJevChoice: vi.fn(),
}))
vi.mock("../store/jevCache.js", () => ({
  getJevCache: vi.fn(async () => null),
  putJevCache: vi.fn(async () => {}),
}))

import type { CharacterState, EventContent } from "../../shared/types.js"
import { askJevChoice, jevEnabled } from "./jev.js"
import { getJevCache, putJevCache } from "../store/jevCache.js"
import { classifyDialogue, dialogueCacheKey, resolveDialogueShortcut } from "./dialogue.js"

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
    ...overrides,
  } as unknown as CharacterState
}

const event: EventContent = {
  id: "tavern_talk",
  type: "dialogue",
  weight: 1,
  minAge: 16,
  maxAge: 80,
  narrative: { en: "The stranger waits.", es: "El extraño espera." },
  dialoguePrompt: { en: "What do you say?", es: "¿Qué dices?" },
  rubricInstructions: { en: "Classify tone.", es: "Clasifica el tono." },
  fallback: "neutral",
  interpretations: [
    {
      id: "bold",
      intent: { en: "Bold", es: "Audaz" },
      outcomeNarrative: { en: "Bold.", es: "Audaz." },
      shortcutLabel: { en: "Be bold", es: "Sé audaz" },
    },
    {
      id: "kind",
      intent: { en: "Kind", es: "Amable" },
      outcomeNarrative: { en: "Kind.", es: "Amable." },
    },
    {
      id: "neutral",
      intent: { en: "Neutral", es: "Neutral" },
      outcomeNarrative: { en: "Neutral.", es: "Neutral." },
    },
  ],
}

function answer(choice: string, confidence = 0.9) {
  return [{ id: "reply", choice, confidence, probabilities: { [choice]: confidence } }]
}

describe("dialogue cache key", () => {
  it("normalizes whitespace and case", () => {
    const a = dialogueCacheKey("e", "  Hello   There ", "2026-01-01")
    expect(dialogueCacheKey("e", "hello there", "2026-01-01")).toBe(a)
  })

  it("changes with event id and day", () => {
    const k = dialogueCacheKey("e", "hi", "2026-01-01")
    expect(dialogueCacheKey("f", "hi", "2026-01-01")).not.toBe(k)
    expect(dialogueCacheKey("e", "hi", "2026-01-02")).not.toBe(k)
  })
})

describe("resolveDialogueShortcut", () => {
  it("returns the id for an interpretation carrying a shortcutLabel", () => {
    expect(resolveDialogueShortcut(event, "bold")).toBe("bold")
  })

  it("rejects interpretations without a shortcutLabel and unknown ids", () => {
    expect(resolveDialogueShortcut(event, "kind")).toBeNull()
    expect(resolveDialogueShortcut(event, "nope")).toBeNull()
  })
})

describe("classifyDialogue", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(jevEnabled).mockReturnValue(true)
    vi.mocked(getJevCache).mockResolvedValue(null)
    vi.mocked(askJevChoice).mockResolvedValue(null)
    vi.mocked(putJevCache).mockResolvedValue(undefined)
  })

  it("returns the authored fallback without calling Jev when disabled", async () => {
    vi.mocked(jevEnabled).mockReturnValue(false)
    expect(await classifyDialogue(makeChar(), event, "hello")).toBe("neutral")
    expect(askJevChoice).not.toHaveBeenCalled()
  })

  it("uses a cached classification without calling Jev", async () => {
    vi.mocked(getJevCache).mockResolvedValue({ choice: "kind", payload: {} })
    expect(await classifyDialogue(makeChar(), event, "hello")).toBe("kind")
    expect(askJevChoice).not.toHaveBeenCalled()
  })

  it("ignores a cached choice that is not an interpretation", async () => {
    vi.mocked(getJevCache).mockResolvedValue({ choice: "ghost", payload: {} })
    vi.mocked(askJevChoice).mockResolvedValue(answer("bold"))
    expect(await classifyDialogue(makeChar(), event, "hello")).toBe("bold")
  })

  it("classifies, caches, and returns a confident Jev pick", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(answer("bold"))
    expect(await classifyDialogue(makeChar(), event, "I punch him")).toBe("bold")
    expect(putJevCache).toHaveBeenCalledTimes(1)
  })

  it("falls back below the confidence floor", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(answer("bold", 0.2))
    expect(await classifyDialogue(makeChar(), event, "maybe")).toBe("neutral")
    expect(putJevCache).not.toHaveBeenCalled()
  })

  it("falls back when Jev returns a non-interpretation", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(answer("ghost"))
    expect(await classifyDialogue(makeChar(), event, "hi")).toBe("neutral")
  })

  it("falls back when Jev fails (null)", async () => {
    vi.mocked(askJevChoice).mockResolvedValue(null)
    expect(await classifyDialogue(makeChar(), event, "hi")).toBe("neutral")
  })
})

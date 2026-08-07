import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import type { CharacterState, PendingMinigameState, PressQuestion } from "../../../shared/types.js"
import {
  answerPressTarget,
  createPressState,
  pressOver,
  pressResult,
  pressTargetWeight,
} from "./pressConference.js"

const QUESTIONS: PressQuestion[] = [
  {
    id: "q1",
    prompt: { en: "Who are you?", es: "¿Quién sos?" },
    options: [
      { id: "a", icon: "gem", tag: "Confident", wantedTags: { Confident: 1 } },
      { id: "b", icon: "flame", tag: "Cocky", wantedTags: { Cocky: 1 } },
      { id: "c", icon: "scroll", tag: "Humble", wantedTags: { Humble: 1 } },
      { id: "d", icon: "heart", tag: "Supportive", wantedTags: { Supportive: 1 } },
    ],
  },
  {
    id: "q2",
    prompt: { en: "Next question", es: "Próxima" },
    options: [
      { id: "e", icon: "gem", tag: "Confident" },
      { id: "f", icon: "flame", tag: "Cocky" },
      { id: "g", icon: "scroll", tag: "Humble" },
      { id: "h", icon: "heart", tag: "Supportive" },
    ],
  },
  {
    id: "q3",
    prompt: { en: "Last", es: "Última" },
    options: [
      { id: "i", icon: "gem", tag: "Confident" },
      { id: "j", icon: "flame", tag: "Cocky" },
      { id: "k", icon: "scroll", tag: "Humble" },
      { id: "l", icon: "heart", tag: "Supportive" },
    ],
  },
]

// Minimal CharacterState the target-weight harness actually reads. Build with
// a partial cast so we don't have to enumerate 60+ fields here.
function characterState(tags: Record<string, number>): CharacterState {
  return {
    personality: tags,
    charisma: 50,
    fame: 50,
  } as unknown as CharacterState
}

function play(c: CharacterState, seed: number): PendingMinigameState {
  const state = createPressState("ev1", QUESTIONS)
  const rng = new Rng(seed)
  for (let q = 0; q < 3; q++) answerPressTarget(state, 0, c, rng, 0)
  return state
}

describe("pressConference", () => {
  it("creates an rng-free initial state", () => {
    const s = createPressState("ev1", QUESTIONS)
    expect(s.game).toBe("press_conference")
    expect(s.press!.answers).toEqual([])
    expect(s.press!.targets).toEqual([null, null, null])
    expect(s.press!.questions.length).toBe(3)
    expect(pressOver(s)).toBe(false)
    expect(pressResult(s)).toBe("playing")
  })

  it("pressTargetWeight reflects personality history", () => {
    const confident = characterState({ Confident: 5 })
    const weightConf = pressTargetWeight(QUESTIONS[0].options[0], confident, 0)
    const weightHumble = pressTargetWeight(QUESTIONS[0].options[2], confident, 0)
    // a confident history tilts the target toward the Confident option
    expect(weightConf).toBeGreaterThan(weightHumble)
  })

  it("fame and charisma widen the weight gap when statInfluence is positive", () => {
    const unknown = characterState({})
    const star = { ...characterState({}), fame: 90, charisma: 90 } as CharacterState
    const flat = pressTargetWeight(QUESTIONS[0].options[0], unknown, 0)
    const boosted = pressTargetWeight(QUESTIONS[0].options[0], star, 0.012)
    expect(boosted).toBeGreaterThan(flat)
  })

  it("answers advance and the over flag flips after 3", () => {
    const s = createPressState("ev1", QUESTIONS)
    const rng = new Rng(42)
    answerPressTarget(s, 0, characterState({}), rng, 0)
    expect(s.press!.answers.length).toBe(1)
    expect(s.press!.targets[0]).not.toBeNull()
    expect(pressOver(s)).toBe(false)
    expect(pressResult(s)).toBe("playing")
    answerPressTarget(s, 0, characterState({}), rng, 0)
    answerPressTarget(s, 0, characterState({}), rng, 0)
    expect(pressOver(s)).toBe(true)
    expect(["player_win", "partial", "player_lose"]).toContain(pressResult(s))
  })

  it("rejects an out-of-range option", () => {
    const s = createPressState("ev1", QUESTIONS)
    expect(() => answerPressTarget(s, 7, characterState({}), new Rng(1), 0)).toThrow(
      "invalid press option",
    )
    expect(() => answerPressTarget(s, -1, characterState({}), new Rng(1), 0)).toThrow()
  })

  it("rejects an answer after the interview is over", () => {
    const s = play(characterState({}), 42)
    expect(pressOver(s)).toBe(true)
    expect(() => answerPressTarget(s, 0, characterState({}), new Rng(1), 0)).toThrow(
      "press_after_end",
    )
  })

  it("is deterministic for the same seed + answers", () => {
    const a = play(characterState({}), 99)
    const b = play(characterState({}), 99)
    expect((a.press?.targets ?? []).join(",")).toBe((b.press?.targets ?? []).join(","))
  })

  it("reports the graduated result for 0/3, mixed, and 3/3 reads", () => {
    const zero = createPressState("ev1", QUESTIONS)
    zero.press!.answers = [0, 1, 2]
    zero.press!.targets = [3, 3, 3]
    expect(pressResult(zero)).toBe("player_lose")

    const mixed = createPressState("ev1", QUESTIONS)
    mixed.press!.answers = [0, 1, 2]
    mixed.press!.targets = [0, 3, 3]
    expect(pressResult(mixed)).toBe("partial")

    const sweep = createPressState("ev1", QUESTIONS)
    sweep.press!.answers = [0, 1, 2]
    sweep.press!.targets = [0, 1, 2]
    expect(pressResult(sweep)).toBe("player_win")
  })
})

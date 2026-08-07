import type {
  CharacterState,
  PendingMinigameState,
  PressQuestion,
  PressTagOption,
} from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"
// Deliberate cycle: engine -> helpers -> minigames/index -> this module ->
// engine. Safe because computeTagSynergy is only referenced inside function
// bodies (ESM live bindings resolve at call time); keep it that way.
import { computeTagSynergy } from "../engine.js"

// press_conference: a press room where an interviewer asks 3 questions, each
// with 4 personality-tag answers. The "correct" read is a hidden target drawn
// per question from the run Rng, weighted by the character's accumulated tag
// history (computeTagSynergy) plus a fame/charisma tilt — the El Ídolo model
// where "tu liderazgo y tu fama pesan tanto como el tono que elijas".

export function createPressState(
  eventId: string,
  questions: PressQuestion[],
): PendingMinigameState {
  return {
    eventId,
    game: "press_conference",
    press: {
      questions,
      answers: [],
      targets: questions.map(() => null),
    },
  }
}

export function pressOver(state: PendingMinigameState): boolean {
  const p = state.press
  if (!p) return false
  return p.answers.length >= p.questions.length
}

// Graduated outcome matching the El Ídolo reference: 0 correct → the room
// turned on you, 1-2 correct → a mixed read, 3 correct → a flawless read.
export function pressResult(
  state: PendingMinigameState,
): "playing" | "player_win" | "partial" | "player_lose" {
  const p = state.press
  if (!p) return "playing"
  let correct = 0
  for (let i = 0; i < p.answers.length; i++) {
    const target = p.targets[i]
    if (target != null && p.answers[i] === target) correct++
  }
  if (p.answers.length < p.questions.length) return "playing"
  if (correct === p.questions.length) return "player_win"
  if (correct === 0) return "player_lose"
  return "partial"
}

// How much this option should be favored as the hidden target. A history that
// lines up with the option's wanted/punished tags raises its weight (via
// computeTagSynergy), and fame/charisma widen the gap further — high-leadership
// characters "read" as wanting the confident, commanding answers.
export function pressTargetWeight(
  option: PressTagOption,
  c: CharacterState,
  statInfluence: number,
): number {
  const synergy = computeTagSynergy(
    c,
    option as { wantedTags?: Record<string, number>; punishedTags?: Record<string, number> },
  )
  const tilt = (c.fame / 100) * statInfluence * 4 + (c.charisma / 100) * statInfluence * 4
  // 1 + positive history edge + fame/charisma readiness = higher weight.
  return Math.max(0.08, 1 + synergy * 6 + tilt)
}

// Record one answer and draw the question's hidden target. `card` is the
// player's chosen option index (0-based). All randomness goes through the run
// Rng so daily runs stay deterministic.
export function answerPressTarget(
  state: PendingMinigameState,
  card: number,
  c: CharacterState,
  rng: Rng,
  statInfluence: number,
): void {
  const p = state.press
  if (!p) throw new Error("press_conference without state")
  if (pressOver(state)) throw new Error("press_after_end")
  if (!Number.isInteger(card) || card < 0 || card >= 4) throw new Error("invalid press option")
  const qi = p.answers.length
  const options = p.questions[qi].options
  // Weighted target draw from the run Rng (deterministic per daily seed).
  const target = rng.weighted(options, (op) => pressTargetWeight(op, c, statInfluence))
  p.targets[qi] = options.indexOf(target)
  p.answers.push(card)
}

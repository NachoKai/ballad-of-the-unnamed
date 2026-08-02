import type { PendingMinigameState, RpsChoice, RpsRoundResult } from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"

// The five hand-signs. Internal keys are language-neutral — the client maps
// them to themed labels (rock → Piedra/Rock, paper → Pergamino/Parchment,
// scissors → Daga/Dagger, lizard → Salamandra/Salamander, spock → Mago/Mage).
export const RPS_CHOICES: RpsChoice[] = ["rock", "paper", "scissors", "lizard", "spock"]

export function createRpsState(eventId: string, bestOf: number): PendingMinigameState {
  return {
    eventId,
    game: "rps",
    bestOf: Math.max(1, bestOf || 3),
    playerWins: 0,
    rivalWins: 0,
    rivalLastChoice: null,
    playerLastChoice: null,
  }
}

// Classic 5-signal rules: each sign beats exactly two others.
const BEATS: Record<RpsChoice, RpsChoice[]> = {
  rock: ["scissors", "lizard"],
  paper: ["rock", "spock"],
  scissors: ["paper", "lizard"],
  lizard: ["spock", "paper"],
  spock: ["scissors", "rock"],
}

export function judgeRound(player: RpsChoice, rival: RpsChoice): RpsRoundResult {
  if (player === rival) return "tie"
  return BEATS[player].includes(rival) ? "win" : "loss"
}

export function rpsMatchOver(state: PendingMinigameState): boolean {
  const target = Math.ceil((state.bestOf ?? 3) / 2)
  return (state.playerWins ?? 0) >= target || (state.rivalWins ?? 0) >= target
}

// skill 1 = unpredictable (uniform). Lower skill = more likely to repeat its
// last move, which the player can exploit. Deterministic via rng.
export function rivalRpsMove(state: PendingMinigameState, skill: number, rng: Rng): RpsChoice {
  if (rng.next() < skill || state.rivalLastChoice == null) return rng.pick(RPS_CHOICES)
  return state.rivalLastChoice
}

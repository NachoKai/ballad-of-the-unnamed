import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import { createRpsState, judgeRound, RPS_CHOICES, rivalRpsMove, rpsMatchOver } from "./rps.js"

describe("rps engine", () => {
  it("creates a best-of-n state", () => {
    const s = createRpsState("e1", 3)
    expect(s.game).toBe("rps")
    expect(s.bestOf).toBe(3)
    expect(s.playerWins).toBe(0)
    expect(s.rivalWins).toBe(0)
  })

  it("judges the classic three signals", () => {
    expect(judgeRound("rock", "scissors")).toBe("win")
    expect(judgeRound("rock", "paper")).toBe("loss")
    expect(judgeRound("rock", "rock")).toBe("tie")
    expect(judgeRound("paper", "rock")).toBe("win")
    expect(judgeRound("scissors", "paper")).toBe("win")
  })

  it("judges the arcane signals (lizard & spock)", () => {
    // lizard beats spock and paper; loses to rock and scissors.
    expect(judgeRound("lizard", "spock")).toBe("win")
    expect(judgeRound("lizard", "paper")).toBe("win")
    expect(judgeRound("lizard", "rock")).toBe("loss")
    expect(judgeRound("lizard", "scissors")).toBe("loss")
    // spock beats scissors and rock; loses to paper and lizard.
    expect(judgeRound("spock", "scissors")).toBe("win")
    expect(judgeRound("spock", "rock")).toBe("win")
    expect(judgeRound("spock", "paper")).toBe("loss")
    expect(judgeRound("spock", "lizard")).toBe("loss")
    // ties hold for the new signals too.
    expect(judgeRound("lizard", "lizard")).toBe("tie")
    expect(judgeRound("spock", "spock")).toBe("tie")
  })

  it("knows when a best-of-3 match is over", () => {
    const s = createRpsState("e1", 3)
    s.playerWins = 2
    s.rivalWins = 0
    expect(rpsMatchOver(s)).toBe(true)
    const t = createRpsState("e1", 3)
    t.playerWins = 1
    t.rivalWins = 1
    expect(rpsMatchOver(t)).toBe(false)
  })

  it("repeats its last choice at skill 0 (predictable)", () => {
    const s = createRpsState("e1", 3)
    s.rivalLastChoice = "rock"
    const move = rivalRpsMove(s, 0, new Rng(5))
    expect(move).toBe("rock")
  })

  it("plays uniformly at skill 1", () => {
    const s = createRpsState("e1", 3)
    s.rivalLastChoice = "rock"
    const seen = new Set<string>()
    for (let i = 0; i < 30; i++) seen.add(rivalRpsMove({ ...s }, 1, new Rng(i)))
    expect(seen.size).toBeGreaterThan(1)
  })

  it("draws all choices through the seeded rng deterministically", () => {
    const s = createRpsState("e1", 3)
    expect(RPS_CHOICES).toContain(rivalRpsMove(s, 1, new Rng(1)))
    expect(rivalRpsMove(createRpsState("e1", 3), 1, new Rng(1))).toBe(
      rivalRpsMove(createRpsState("e1", 3), 1, new Rng(1)),
    )
  })
})

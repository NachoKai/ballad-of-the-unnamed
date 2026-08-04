import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import {
  applyInteractiveMove,
  createInteractiveState,
  interactiveTier,
  interactiveView,
  rivalSkillFor,
} from "./index.js"
import type { EventContent, InteractiveMove } from "../../../shared/types.js"

function eventWith(game: "tictactoe" | "rps" | "memotest"): EventContent {
  return {
    id: `ev_${game}`,
    minAge: 0,
    maxAge: 99,
    weight: 1,
    primaryStat: "intelligence",
    narrative: { en: "go", es: "ve" },
    resolution: {
      type: "interactive",
      game,
      bestOf: 3,
      baseWinChance: 0.5,
      statInfluence: { intelligence: 0.01 },
      rivalSkill: 0.6,
    },
    outcomes: {
      critical: { narrative: { en: "c", es: "c" } },
      success: { narrative: { en: "s", es: "s" } },
      partial: { narrative: { en: "p", es: "p" } },
      fail: { narrative: { en: "f", es: "f" } },
    },
  }
}

describe("interactive orchestrator", () => {
  it("creates rng-free initial state per game kind", () => {
    const ttt = createInteractiveState(eventWith("tictactoe"))
    expect(ttt.game).toBe("tictactoe")
    expect(ttt.board).toEqual(Array(9).fill(null))
    const rps = createInteractiveState(eventWith("rps"))
    expect(rps.game).toBe("rps")
    expect(rps.bestOf).toBe(3)
    const mem = createInteractiveState(eventWith("memotest"))
    expect(mem.game).toBe("memotest")
    expect(mem.deck).toBeUndefined() // dealt lazily on the first move
    expect(mem.matched).toEqual([])
  })

  it("serializes a tictactoe view", () => {
    const state = createInteractiveState(eventWith("tictactoe"))
    const view = interactiveView(state)
    expect(view.game).toBe("tictactoe")
    expect(view.over).toBe(false)
    expect(view.result).toBe("playing")
  })

  it("lower primary stat keeps rival skill high; higher stat lowers it", () => {
    const res = eventWith("tictactoe").resolution!
    const low = rivalSkillFor(5, res)
    const high = rivalSkillFor(30, res)
    expect(low).toBeGreaterThan(high)
  })

  it("plays a tictactoe move and replies with the rival move", () => {
    const state = createInteractiveState(eventWith("tictactoe"))
    const move: InteractiveMove = { kind: "tictactoe", cell: 0 }
    const out = applyInteractiveMove(state, move, 20, new Rng(11))
    expect(out.over).toBe(false)
    // player marked cell 0, rival marked one legal cell elsewhere
    expect(state.board![0]).toBe("X")
    const playerCells = state.board!.filter((c) => c === "X")
    const rivalCells = state.board!.filter((c) => c === "O")
    expect(playerCells).toHaveLength(1)
    expect(rivalCells).toHaveLength(1)
    expect(state.marksPlaced).toBe(2)
  })

  it("rejects an illegal tictactoe move", () => {
    const state = createInteractiveState(eventWith("tictactoe"))
    state.board![0] = "X"
    expect(() =>
      applyInteractiveMove(state, { kind: "tictactoe", cell: 0 }, 20, new Rng(1)),
    ).toThrow()
  })

  it("rejects an rps move for a tictactoe game", () => {
    const state = createInteractiveState(eventWith("tictactoe"))
    expect(() =>
      applyInteractiveMove(state, { kind: "rps", choice: "rock" }, 20, new Rng(1)),
    ).toThrow()
  })

  it("deals the memotest deck on the first move and reveals the first card", () => {
    const state = createInteractiveState(eventWith("memotest"))
    const out = applyInteractiveMove(state, { kind: "memotest", card: 3 }, 20, new Rng(1))
    expect(out.over).toBe(false)
    expect(state.deck).toHaveLength(16)
    expect(state.revealed).toEqual([3])
    const view = interactiveView(state)
    if (view.game !== "memotest") throw new Error("expected memotest view")
    expect(view.pairsTotal).toBe(8)
    expect(view.faces[3]).toBe(state.deck![3])
    expect(Object.keys(view.faces)).toHaveLength(1)
  })

  it("matches a memotest pair for the player on the second flip", () => {
    const state = createInteractiveState(eventWith("memotest"))
    applyInteractiveMove(state, { kind: "memotest", card: 0 }, 20, new Rng(1))
    const first = state.revealed![0]
    const mate = state.deck!.findIndex((f, i) => i !== first && f === state.deck![first])
    const out = applyInteractiveMove(state, { kind: "memotest", card: mate }, 20, new Rng(1))
    expect(out.over).toBe(false)
    expect(state.playerPairs).toBe(1)
    expect(state.matched).toContain(first)
    expect(state.matched).toContain(mate)
    expect(state.playerMatched).toContain(first)
    expect(state.playerMatched).toContain(mate)
    expect(state.rivalMatched).toEqual([])
    expect(state.revealed).toEqual([])
    expect(state.lastPlayerTurn?.matched).toBe(true)
  })

  it("lets the rival take a turn after a memotest miss", () => {
    const state = createInteractiveState(eventWith("memotest"))
    applyInteractiveMove(state, { kind: "memotest", card: 0 }, 20, new Rng(1))
    const first = state.revealed![0]
    const mate = state.deck!.findIndex((f, i) => i !== first && f === state.deck![first])
    // flip a wrong card: the second flip must be a non-matching face
    const wrong = state.deck!.findIndex((f, i) => i !== first && f !== state.deck![first])
    expect(wrong).not.toBe(mate)
    const out = applyInteractiveMove(state, { kind: "memotest", card: wrong }, 20, new Rng(1))
    expect(out.over).toBe(false)
    expect(state.playerPairs).toBe(0)
    expect(state.lastPlayerTurn?.matched).toBe(false)
    expect(state.lastRivalTurn).toBeDefined()
    expect(state.revealed).toEqual([])
  })

  it("rejects illegal memotest moves", () => {
    const state = createInteractiveState(eventWith("memotest"))
    expect(() =>
      applyInteractiveMove(state, { kind: "memotest", card: 99 }, 20, new Rng(1)),
    ).toThrow()
    applyInteractiveMove(state, { kind: "memotest", card: 0 }, 20, new Rng(1))
    // re-flipping the already revealed card
    expect(() =>
      applyInteractiveMove(state, { kind: "memotest", card: 0 }, 20, new Rng(1)),
    ).toThrow()
    // a rps move for a memotest game
    expect(() =>
      applyInteractiveMove(state, { kind: "rps", choice: "rock" }, 20, new Rng(1)),
    ).toThrow()
  })

  it("maps memotest pair margins to outcome tiers", () => {
    const base = () => createInteractiveState(eventWith("memotest"))
    const sweep = base()
    sweep.playerPairs = 5
    sweep.rivalPairs = 3
    expect(interactiveTier(sweep)).toBe("critical")
    const narrow = base()
    narrow.playerPairs = 4
    narrow.rivalPairs = 3
    expect(interactiveTier(narrow)).toBe("success")
    const draw = base()
    draw.playerPairs = 4
    draw.rivalPairs = 4
    expect(interactiveTier(draw)).toBe("partial")
    const loss = base()
    loss.playerPairs = 3
    loss.rivalPairs = 5
    expect(interactiveTier(loss)).toBe("fail")
  })

  it("replays a full memotest identically for the same seed and moves", () => {
    function play(seed: number) {
      const state = createInteractiveState(eventWith("memotest"))
      const rng = new Rng(seed)
      let over = false
      let guard = 0
      while (!over && guard < 200) {
        const matched = state.matched ?? []
        const revealed = state.revealed ?? []
        const card = (() => {
          for (let i = 0; i < 16; i++) if (!matched.includes(i) && !revealed.includes(i)) return i
          return 0
        })()
        over = applyInteractiveMove(state, { kind: "memotest", card }, 20, rng).over
        guard++
      }
      return { state, over }
    }
    const a = play(7)
    const b = play(7)
    expect(a.state).toEqual(b.state)
    expect(a.over).toBe(b.over)
  })

  it("plays an rps round and reports the round result", () => {
    const state = createInteractiveState(eventWith("rps"))
    const move: InteractiveMove = { kind: "rps", choice: "paper" }
    const out = applyInteractiveMove(state, move, 20, new Rng(3))
    expect(out.roundResult).toBeDefined()
    expect(state.playerLastChoice).toBe("paper")
    const total =
      (state.playerWins ?? 0) + (state.rivalWins ?? 0) + (out.roundResult === "tie" ? 1 : 0)
    expect(total).toBe(1)
  })

  it("maps a fastest tictactoe win to critical", () => {
    // X at [0,1,2] with only 3 X marks => player win in 3 moves.
    const state = createInteractiveState(eventWith("tictactoe"))
    state.board = ["X", "X", "X", "O", "O", null, null, null, null]
    state.marksPlaced = 5
    expect(interactiveTier(state)).toBe("critical")
  })

  it("maps a normal tictactoe win to success", () => {
    const state = createInteractiveState(eventWith("tictactoe"))
    state.board = ["X", "O", "X", "O", "X", "O", "X", null, null]
    state.marksPlaced = 7
    expect(interactiveTier(state)).toBe("success")
  })

  it("maps a tictactoe draw to partial", () => {
    const state = createInteractiveState(eventWith("tictactoe"))
    state.board = ["X", "O", "X", "X", "O", "O", "O", "X", "X"]
    state.marksPlaced = 9
    expect(interactiveTier(state)).toBe("partial")
  })

  it("maps an rps sweep to critical and split loss to partial", () => {
    const s1 = createInteractiveState(eventWith("rps"))
    s1.playerWins = 2
    s1.rivalWins = 0
    expect(interactiveTier(s1)).toBe("critical")
    const s2 = createInteractiveState(eventWith("rps"))
    s2.playerWins = 1
    s2.rivalWins = 2
    expect(interactiveTier(s2)).toBe("partial")
  })

  it("replays a full match identically for the same seed and moves", () => {
    function play(seed: number) {
      const state = createInteractiveState(eventWith("rps"))
      const rng = new Rng(seed)
      const moves: InteractiveMove[] = [
        { kind: "rps", choice: "rock" },
        { kind: "rps", choice: "paper" },
        { kind: "rps", choice: "scissors" },
      ]
      let over = false
      for (const m of moves) {
        if (over) break
        over = applyInteractiveMove(state, m, 20, rng).over
      }
      return { state, over }
    }
    const a = play(7)
    const b = play(7)
    expect(a.state).toEqual(b.state)
    expect(a.over).toBe(b.over)
  })
})

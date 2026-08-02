import type {
  CharacterState,
  EventContent,
  InteractiveMove,
  MinigameResolution,
  OutcomeTier,
  PendingMinigameState,
  RpsRoundResult,
  ServedInteractiveState,
  TicTacToeCell,
} from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"
import {
  createTicTacToeState,
  findWinningLine,
  isBoardFull,
  legalMoves,
  playerMarksUsed,
  rivalTicTacToeMove,
  TIC_TAC_TOE_PLAYER,
  TIC_TAC_TOE_RIVAL,
} from "./ticTacToe.js"
import { createRpsState, judgeRound, rivalRpsMove, rpsMatchOver } from "./rps.js"

// Higher player primary stat ⇒ lower rival skill ⇒ easier opponent. Clamped so
// the game stays a real contest for every character.
export function rivalSkillFor(primaryStat: number, res: MinigameResolution): number {
  const base = res.rivalSkill ?? 0.6
  const coeff = Object.values(res.statInfluence)[0] ?? 0.01
  const skill = base - primaryStat * coeff * 2
  return Math.max(0.15, Math.min(0.9, skill))
}

export function createInteractiveState(ev: EventContent): PendingMinigameState {
  const game = ev.resolution?.game ?? "tictactoe"
  return game === "tictactoe"
    ? createTicTacToeState(ev.id)
    : createRpsState(ev.id, ev.resolution?.bestOf ?? 3)
}

function ticTacToeResult(board: TicTacToeCell[]): "playing" | "player_win" | "rival_win" | "draw" {
  const line = findWinningLine(board)
  if (line) return board[line[0]] === TIC_TAC_TOE_PLAYER ? "player_win" : "rival_win"
  return isBoardFull(board) ? "draw" : "playing"
}

export function interactiveView(state: PendingMinigameState): ServedInteractiveState {
  if (state.game === "tictactoe") {
    const board = state.board ?? Array(9).fill(null)
    return {
      game: "tictactoe",
      board,
      playerMark: TIC_TAC_TOE_PLAYER,
      rivalMark: TIC_TAC_TOE_RIVAL,
      over: ticTacToeResult(board) !== "playing",
      result: ticTacToeResult(board),
    }
  }
  const over = rpsMatchOver(state)
  const result = over
    ? (state.playerWins ?? 0) > (state.rivalWins ?? 0)
      ? "player_win"
      : "rival_win"
    : "playing"
  return {
    game: "rps",
    bestOf: state.bestOf ?? 3,
    playerWins: state.playerWins ?? 0,
    rivalWins: state.rivalWins ?? 0,
    round: (state.playerWins ?? 0) + (state.rivalWins ?? 0) + 1,
    lastRound:
      state.playerLastChoice && state.rivalLastChoice
        ? {
            player: state.playerLastChoice,
            rival: state.rivalLastChoice,
            result: judgeRound(state.playerLastChoice, state.rivalLastChoice),
          }
        : null,
    over,
    result,
  }
}

export function applyInteractiveMove(
  state: PendingMinigameState,
  move: InteractiveMove,
  primaryStat: number,
  rng: Rng,
): { over: boolean; roundResult?: RpsRoundResult } {
  const res: { over: boolean; roundResult?: RpsRoundResult } = { over: false }
  if (state.game === "tictactoe") {
    if (move.kind !== "tictactoe") throw new Error("invalid move for tictactoe")
    const board = state.board ?? Array(9).fill(null)
    if (board[move.cell] !== null || move.cell < 0 || move.cell > 8) {
      throw new Error("invalid tictactoe cell")
    }
    board[move.cell] = TIC_TAC_TOE_PLAYER
    state.marksPlaced = (state.marksPlaced ?? 0) + 1
    if (ticTacToeResult(board) !== "playing") {
      res.over = true
      return res
    }
    // Rival reply (only if the player didn't just win/fill the board).
    const skill = rivalSkillFor(primaryStat, {
      type: "interactive",
      baseWinChance: 0.5,
      statInfluence: {},
    })
    const rivalMove = rivalTicTacToeMove(board, skill, rng)
    board[rivalMove] = TIC_TAC_TOE_RIVAL
    state.marksPlaced = (state.marksPlaced ?? 0) + 1
    state.board = board
    res.over = ticTacToeResult(board) !== "playing"
    return res
  }

  if (move.kind !== "rps") throw new Error("invalid move for rps")
  const rivalChoice = rivalRpsMove(
    state,
    rivalSkillFor(primaryStat, { type: "interactive", baseWinChance: 0.5, statInfluence: {} }),
    rng,
  )
  const roundResult = judgeRound(move.choice, rivalChoice)
  state.playerLastChoice = move.choice
  state.rivalLastChoice = rivalChoice
  if (roundResult === "win") state.playerWins = (state.playerWins ?? 0) + 1
  if (roundResult === "loss") state.rivalWins = (state.rivalWins ?? 0) + 1
  res.roundResult = roundResult
  res.over = rpsMatchOver(state)
  return res
}

export function interactiveTier(state: PendingMinigameState): OutcomeTier {
  if (state.game === "tictactoe") {
    const board = state.board ?? Array(9).fill(null)
    const result = ticTacToeResult(board)
    if (result === "player_win") return playerMarksUsed(board) === 3 ? "critical" : "success"
    if (result === "draw") return "partial"
    return "fail"
  }
  const pw = state.playerWins ?? 0
  const rw = state.rivalWins ?? 0
  if (pw === 2 && rw === 0) return "critical"
  if (pw === 2 && rw === 1) return "success"
  if (pw === 1 && rw === 2) return "partial"
  return "fail"
}

// Build the interactive frame served to the client, initializing the persisted
// state once per event. Rng-FREE: safe to call on the resume path too.
export function prepareInteractiveServe(
  ev: EventContent,
  c: CharacterState,
  _locale: "en" | "es",
): ServedInteractiveState {
  if (!c.pendingMinigame || c.pendingMinigame.eventId !== ev.id) {
    c.pendingMinigame = createInteractiveState(ev)
  }
  return interactiveView(c.pendingMinigame)
}

export function interactiveOpponentName(
  ev: EventContent,
  c: CharacterState,
  locale: "en" | "es",
): string {
  if (ev.opponent) return ev.opponent[locale] ?? ev.opponent.en
  return c.rival?.name ?? "Rival"
}

export { legalMoves }
export type { CharacterState }

import type { PendingMinigameState, TicTacToeCell } from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"

export const TIC_TAC_TOE_SIZE = 3
export const TIC_TAC_TOE_PLAYER = "X"
export const TIC_TAC_TOE_RIVAL = "O"

export const WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
]

export function createTicTacToeState(eventId: string): PendingMinigameState {
  return {
    eventId,
    game: "tictactoe",
    board: Array(9).fill(null),
    marksPlaced: 0,
  }
}

export function legalMoves(board: TicTacToeCell[]): number[] {
  const out: number[] = []
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i)
  return out
}

export function findWinningLine(board: TicTacToeCell[]): number[] | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) return line
  }
  return null
}

export function isBoardFull(board: TicTacToeCell[]): boolean {
  return board.every((c) => c !== null)
}

export function playerMarksUsed(board: TicTacToeCell[]): number {
  return board.filter((c) => c === TIC_TAC_TOE_PLAYER).length
}

// Minimax: returns the best cell for `mark` (X maximizes, O minimizes).
function bestMoveFor(mark: "X" | "O", board: TicTacToeCell[]): number {
  const isMax = mark === "X"
  function score(): number {
    const line = findWinningLine(board)
    if (line) return board[line[0]] === "X" ? 10 : -10
    if (isBoardFull(board)) return 0
    return nullScore(board, !isMax)
  }
  // Score from the perspective of the side to move next.
  function nullScore(b: TicTacToeCell[], maximizing: boolean): number {
    let best = maximizing ? -Infinity : Infinity
    for (const i of legalMoves(b)) {
      b[i] = maximizing ? "X" : "O"
      const val = evaluate(b, !maximizing)
      b[i] = null
      best = maximizing ? Math.max(best, val) : Math.min(best, val)
    }
    return best
  }
  function evaluate(b: TicTacToeCell[], maximizing: boolean): number {
    const line = findWinningLine(b)
    if (line) return b[line[0]] === "X" ? 10 : -10
    if (isBoardFull(b)) return 0
    return nullScore(b, maximizing)
  }
  void score
  for (const i of legalMoves(board)) {
    board[i] = mark
    if (findWinningLine(board)) {
      board[i] = null
      return i
    }
    board[i] = null
  }
  let bestVal = isMax ? -Infinity : Infinity
  let bestCell = legalMoves(board)[0]
  for (const i of legalMoves(board)) {
    board[i] = mark
    const val = evaluate(board, !isMax)
    board[i] = null
    if (isMax ? val > bestVal : val < bestVal) {
      bestVal = val
      bestCell = i
    }
  }
  return bestCell
}

// skill 1 = perfect play; skill 0 = fully random. Deterministic via rng.
export function rivalTicTacToeMove(board: TicTacToeCell[], skill: number, rng: Rng): number {
  const moves = legalMoves(board)
  if (moves.length === 0) throw new Error("no legal moves")
  if (rng.next() < skill) return bestMoveFor(TIC_TAC_TOE_RIVAL, [...board])
  return rng.pick(moves)
}

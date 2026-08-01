// Generic async-list state machine for board-style screens (leaderboard, etc.):
// "start" → loading, "ok" → entries loaded, "fail" → error message.

export type BoardState<T> = {
  loading: boolean
  error: string | null
  entries: T[]
}

export type BoardAction<T> =
  | { type: "start" }
  | { type: "ok"; entries: T[] }
  | { type: "fail"; message: string }

export function boardReducer<T>(_state: BoardState<T>, action: BoardAction<T>): BoardState<T> {
  switch (action.type) {
    case "start":
      return { loading: true, error: null, entries: [] }
    case "ok":
      return { loading: false, error: null, entries: action.entries }
    case "fail":
      return { loading: false, error: action.message, entries: [] }
  }
}

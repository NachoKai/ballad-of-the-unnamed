import type {
  AchievementContent,
  CharacterState,
  CombatMove,
  EndingType,
  Gender,
  InteractiveGameKind,
  InteractiveMove,
  Locale,
  Origin,
  RichEpilogueData,
  RunType,
  ServedCombatState,
  ServedEvent,
  ServedInteractiveState,
} from "@shared/types"

export interface AchievementView {
  id: string
  icon: string
  rarity: string
  hidden: boolean
  name: string
  description: string
}

export interface ClassInfo {
  id: string
  icon: string
  name: string
  description: string
  base: Record<string, number>
  startingGold: number
  startingFaction: string | null
}

export interface ArchetypeView {
  id: string
  icon: string
  name: string
  flavor: string
  statDeltas: Record<string, number>
  // Hidden "master" archetypes: `locked` when the player hasn't finished a run
  // with this class yet (the card renders as "???"), `isMaster` when served
  // fully — either unlocked or still locked (so the client can style masters).
  locked?: boolean
  isMaster?: boolean
}

export interface NewRunResponse {
  runId: string
  runType: RunType
  character: CharacterState
  event: ServedEvent
}

export interface ChooseResponse {
  character: CharacterState
  narrative: string
  newAchievements: AchievementContent[]
  ended: boolean
  endingType?: EndingType
  epilogue?: string
  score?: number
  event?: ServedEvent
  richEpilogueData?: RichEpilogueData
}

// Response of POST /api/game/minigame-move. A "playing" status carries the
// fresh board; "finished" resolves the outcome and behaves like a ChooseResponse
// (plus the final board so the result banner can show the completed game).
export interface MinigameMoveResponse {
  status: "playing" | "finished"
  minigame?: { game: InteractiveGameKind; view: ServedInteractiveState }
  feedback?: string | null
  // finished — mirrors ChooseResponse:
  character?: CharacterState
  narrative?: string
  newAchievements?: AchievementContent[]
  ended?: boolean
  endingType?: EndingType
  epilogue?: string
  score?: number
  event?: ServedEvent
  richEpilogueData?: RichEpilogueData
}

// Response of POST /api/game/combat-move. A "playing" status carries the
// fresh fight view; "finished" resolves the outcome (loot + the standard
// ChooseResponse fields) so the result banner can show the final fight.
export interface CombatMoveResponse {
  status: "playing" | "finished"
  combat?: { game: "combat"; view: ServedCombatState }
  // finished: loot breakdown granted on a win (null on flee/loss).
  loot?: { gold: number; fame: number; items: { itemId: string; qty: number }[] } | null
  feedback?: string | null
  // finished — mirrors ChooseResponse:
  character?: CharacterState
  narrative?: string
  newAchievements?: AchievementContent[]
  ended?: boolean
  endingType?: EndingType
  epilogue?: string
  score?: number
  event?: ServedEvent
  richEpilogueData?: RichEpilogueData
}

export interface ShopItemView {
  id: string
  category: string
  name: string
  cost: number
  effect: { type: string; value: number } | null
  icon: string
  flavor: string
  duration?: number
  owned: number
}

export interface ShopResponse {
  items: ShopItemView[]
  gold: number
  inventory: { itemId: string; qty: number; expiresAtTurn: number | null }[]
}

export interface BuyResponse {
  character: CharacterState
  purchased: string
  gold: number
  inventory: { itemId: string; qty: number; expiresAtTurn: number | null }[]
  // Achievements unlocked by the purchase (e.g. luxury-item triggers).
  newAchievements: AchievementContent[]
}

// A structured API failure thrown by jfetch for any non-2xx response. `code`
// is the machine error code from the server (e.g. "invalid_choice"), `status`
// the HTTP status, `errorId` the server-side correlation id the player can
// quote when reporting a bug, and `detail` the raw server message (dev only).
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errorId: string | null
  readonly detail: string | null

  constructor(input: {
    status: number
    code: string
    errorId?: string | null
    detail?: string | null
  }) {
    // Fall back to the code so `err.message` stays useful for callers that
    // only read `.message` (the pre-ApiError behavior).
    super(input.detail || input.code)
    this.name = "ApiError"
    this.status = input.status
    this.code = input.code
    this.errorId = input.errorId ?? null
    this.detail = input.detail ?? null
  }
}

// One encounter in the Trophy Hall per-encounter breakdown: its id, a
// localized display label (derived server-side from the narrative), an
// optional group tag (the event's authored location, a faction/place id), and
// whether any finished run has faced it.
export interface EncounterView {
  id: string
  label: string
  group: string
  seen: boolean
}

export interface CollectionResponse {
  uniqueFactions: string[]
  uniqueEndings: string[]
  uniqueClasses: string[]
  uniqueAchievements: string[]
  // Every authored encounter id seen across all finished runs.
  seenEventIds: string[]
  totalRuns: number
  encounters: {
    events: EncounterView[]
    minigames: EncounterView[]
    combats: EncounterView[]
  }
  encounterProgress: {
    events: { collected: number; total: number }
    minigames: { collected: number; total: number }
    combats: { collected: number; total: number }
  }
  completion: {
    endings: { collected: number; total: number }
    factions: { collected: number; total: number }
    classes: { collected: number; total: number }
    achievements: { collected: number; total: number }
    overall: { collected: number; total: number; pct: number }
  }
}

export interface LeaderboardEntryView {
  rank: number
  id: string
  name: string
  class: string
  finalPowerLevel: number
  netWorth: number
  achievementsCount: number
  battlesWon: number
  questsCompleted: number
  ageAtEnd: number
  reputationPeak: number
  endingType: EndingType
  score: number
  epithet?: string | null
  epilogue: string
}

async function jfetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError({
      status: res.status,
      // The X-Request-Id header is echoed by the server's request logger, so
      // a player-reported id matches the terminal log even when the body
      // didn't carry one.
      code: typeof body.error === "string" ? body.error : `http_${res.status}`,
      errorId: (typeof body.errorId === "string" && body.errorId) || res.headers.get("x-request-id"),
      detail: typeof body.detail === "string" ? body.detail : null,
    })
  }
  return res.json() as Promise<T>
}

export const api = {
  classes: (locale: Locale) =>
    jfetch<{ classes: ClassInfo[]; dailySeed: string }>(`/api/meta/classes?locale=${locale}`),

  drawArchetypes: (input: {
    classId: string
    locale: Locale
    gender: Gender
    unlockedClasses?: string[]
  }) =>
    jfetch<{ archetypes: ArchetypeView[] }>("/api/game/archetype-draw", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  newRun: (input: {
    name: string
    gender: Gender
    classId: string
    archetypeId?: string
    origin?: Origin
    runType: RunType
    locale: Locale
    unlockedClasses?: string[]
  }) =>
    jfetch<NewRunResponse>("/api/game/new", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  state: (runId: string) =>
    jfetch<{
      runId: string
      runType: RunType
      character: CharacterState
      event: ServedEvent | null
      finished: boolean
    }>(`/api/game/state?runId=${runId}`),

  choose: (input: { runId: string; choiceId?: string; cardId?: string }) =>
    jfetch<ChooseResponse>("/api/game/choose", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // One move of an interactive minigame (tictactoe / rps).
  minigameMove: (input: { runId: string; move: InteractiveMove }) =>
    jfetch<MinigameMoveResponse>("/api/game/minigame-move", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // One round of a combat encounter (attack / ability / defend / flee).
  combatMove: (input: { runId: string; move: CombatMove }) =>
    jfetch<CombatMoveResponse>("/api/game/combat-move", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  shop: (runId: string) => jfetch<ShopResponse>(`/api/game/shop?runId=${runId}`),

  buy: (input: { runId: string; itemId: string }) =>
    jfetch<BuyResponse>("/api/game/buy", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  leaderboard: (runType: RunType, locale: Locale, tier?: string) =>
    jfetch<{ runType: RunType; entries: LeaderboardEntryView[] }>(
      `/api/meta/leaderboard?runType=${runType}&locale=${locale}&limit=25${tier ? `&tier=${tier}` : ""}`,
    ),

  leaderboardByCategory: (category: string, runType: RunType, locale: Locale) =>
    jfetch<{ category: string; runType: RunType; entries: LeaderboardEntryView[] }>(
      `/api/meta/leaderboard/${category}?runType=${runType}&locale=${locale}&limit=25`,
    ),

  achievements: (locale: Locale) =>
    jfetch<{ achievements: AchievementView[] }>(`/api/meta/achievements?locale=${locale}`),

  careerTotals: () =>
    jfetch<{ totalRuns: number; totalScore: number; totalAchievements: number }>(
      "/api/meta/career-totals",
    ),

  playerRuns: (name: string) =>
    jfetch<{ entries: LeaderboardEntryView[] }>(
      `/api/meta/player-runs?name=${encodeURIComponent(name)}`,
    ),

  collection: (locale: Locale) =>
    jfetch<CollectionResponse>(`/api/meta/collection?locale=${locale}`),
}

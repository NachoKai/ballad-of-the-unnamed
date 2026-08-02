import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Gender,
  InteractiveGameKind,
  InteractiveMove,
  Locale,
  Origin,
  RichEpilogueData,
  RunType,
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
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  classes: (locale: Locale) =>
    jfetch<{ classes: ClassInfo[]; dailySeed: string }>(`/api/meta/classes?locale=${locale}`),

  drawArchetypes: (input: { classId: string; locale: Locale; gender: Gender }) =>
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

  collection: () =>
    jfetch<{
      uniqueFactions: string[]
      uniqueEndings: string[]
      uniqueClasses: string[]
      uniqueAchievements: string[]
      totalRuns: number
      completion: {
        endings: { collected: number; total: number }
        factions: { collected: number; total: number }
        classes: { collected: number; total: number }
        achievements: { collected: number; total: number }
        overall: { collected: number; total: number; pct: number }
      }
    }>("/api/meta/collection"),
}

import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Locale,
  RichEpilogueData,
  RunType,
  ServedEvent,
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

  drawArchetypes: (input: { classId: string; locale: Locale }) =>
    jfetch<{ archetypes: ArchetypeView[] }>("/api/game/archetype-draw", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  newRun: (input: {
    name: string
    classId: string
    archetypeId?: string
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

  shop: (runId: string) => jfetch<ShopResponse>(`/api/game/shop?runId=${runId}`),

  buy: (input: { runId: string; itemId: string }) =>
    jfetch<BuyResponse>("/api/game/buy", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  leaderboard: (runType: RunType, locale: Locale) =>
    jfetch<{ runType: RunType; entries: LeaderboardEntryView[] }>(
      `/api/meta/leaderboard?runType=${runType}&locale=${locale}&limit=25`,
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
}

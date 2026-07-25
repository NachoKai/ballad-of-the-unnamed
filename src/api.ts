import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Locale,
  RunType,
  ServedEvent,
} from "@shared/types"

export interface ClassInfo {
  id: string
  name: string
  description: string
  base: Record<string, number>
  startingGold: number
  startingFaction: string | null
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
    jfetch<{ classes: ClassInfo[]; dailySeed: string }>(
      `/api/meta/classes?locale=${locale}`,
    ),

  newRun: (input: {
    name: string
    classId: string
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

  leaderboard: (runType: RunType, locale: Locale) =>
    jfetch<{ runType: RunType; entries: LeaderboardEntryView[] }>(
      `/api/meta/leaderboard?runType=${runType}&locale=${locale}&limit=25`,
    ),
}

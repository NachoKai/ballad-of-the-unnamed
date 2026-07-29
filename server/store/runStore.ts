import { randomUUID } from "node:crypto"
import { query } from "../db/client.js"
import type {
  CharacterState,
  EndingType,
  EventContent,
  Locale,
  RunType,
} from "../../shared/types.js"

// A persisted run: character snapshot + the rng state + the currently-offered
// event so a page reload resumes deterministically (spec: run-token approach).
export interface RunRecord {
  id: string
  runType: RunType
  seed: string
  rngState: number
  locale: Locale
  character: CharacterState
  pendingEvent: EventContent | null
  finished: boolean
}

interface RunRow {
  id: string
  run_type: RunType
  seed: string
  rng_state: string | number
  locale: Locale
  character: unknown
  pending_event: unknown
  finished: boolean
}

function rowToRecord(r: RunRow): RunRecord {
  return {
    id: r.id,
    runType: r.run_type,
    seed: r.seed,
    rngState: Number(r.rng_state),
    locale: r.locale,
    character:
      typeof r.character === "string"
        ? (JSON.parse(r.character) as CharacterState)
        : (r.character as CharacterState),
    pendingEvent:
      r.pending_event == null
        ? null
        : typeof r.pending_event === "string"
          ? (JSON.parse(r.pending_event) as EventContent)
          : (r.pending_event as EventContent),
    finished: r.finished,
  }
}

export async function createRun(input: {
  runType: RunType
  seed: string
  rngState: number
  locale: Locale
  character: CharacterState
}): Promise<RunRecord> {
  const id = randomUUID()
  await query(
    `INSERT INTO runs (id, run_type, seed, rng_state, locale, character, pending_event, finished)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, false)`,
    [id, input.runType, input.seed, input.rngState, input.locale, JSON.stringify(input.character)],
  )
  return {
    id,
    runType: input.runType,
    seed: input.seed,
    rngState: input.rngState,
    locale: input.locale,
    character: input.character,
    pendingEvent: null,
    finished: false,
  }
}

export async function getRun(id: string): Promise<RunRecord | null> {
  const rows = await query<RunRow>(`SELECT * FROM runs WHERE id = $1`, [id])
  return rows[0] ? rowToRecord(rows[0]) : null
}

export async function saveRun(run: RunRecord): Promise<void> {
  await query(
    `UPDATE runs
       SET rng_state = $2,
           character = $3,
           pending_event = $4,
           finished = $5,
           updated_at = now()
     WHERE id = $1`,
    [
      run.id,
      run.rngState,
      JSON.stringify(run.character),
      run.pendingEvent ? JSON.stringify(run.pendingEvent) : null,
      run.finished,
    ],
  )
}

// Whether this player (by seed) already has a daily run today.
export async function findDailyRun(seed: string): Promise<RunRecord | null> {
  const rows = await query<RunRow>(
    `SELECT * FROM runs WHERE run_type = 'daily' AND seed = $1 ORDER BY created_at DESC LIMIT 1`,
    [seed],
  )
  return rows[0] ? rowToRecord(rows[0]) : null
}

export async function insertLeaderboardEntry(input: {
  runId: string
  name: string
  characterClass: string
  finalPowerLevel: number
  netWorth: number
  achievementsCount: number
  battlesWon: number
  questsCompleted: number
  ageAtEnd: number
  reputationPeak: number
  endingType: EndingType
  score: number
  legacyScore?: number
  epilogue: string
  runType: RunType
  seed: string
}): Promise<void> {
  await query(
    `INSERT INTO leaderboard
      (id, run_id, name, character_class, final_power_level, net_worth,
       achievements_count, battles_won, quests_completed, age_at_end,
       reputation_peak, ending_type, score, legacy_score, epilogue, run_type, seed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      randomUUID(),
      input.runId,
      input.name,
      input.characterClass,
      input.finalPowerLevel,
      input.netWorth,
      input.achievementsCount,
      input.battlesWon,
      input.questsCompleted,
      input.ageAtEnd,
      input.reputationPeak,
      input.endingType,
      input.score,
      input.legacyScore ?? 0,
      input.epilogue,
      input.runType,
      input.seed,
    ],
  )
}

export interface LeaderboardRow {
  id: string
  name: string
  character_class: string
  final_power_level: number
  net_worth: number
  achievements_count: number
  battles_won: number
  quests_completed: number
  age_at_end: number
  reputation_peak: number
  ending_type: EndingType
  score: number
  epilogue: string
  created_at: string
}

export async function getLeaderboard(input: {
  runType: RunType
  seed?: string
  limit: number
}): Promise<LeaderboardRow[]> {
  if (input.runType === "daily" && input.seed) {
    return query<LeaderboardRow>(
      `SELECT * FROM leaderboard WHERE run_type = 'daily' AND seed = $1
       ORDER BY score DESC LIMIT $2`,
      [input.seed, input.limit],
    )
  }
  return query<LeaderboardRow>(
    `SELECT * FROM leaderboard WHERE run_type = 'standard'
     ORDER BY score DESC LIMIT $1`,
    [input.limit],
  )
}

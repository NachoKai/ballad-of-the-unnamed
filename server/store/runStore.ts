import { randomUUID } from "node:crypto"
import { query, queryOne } from "../db/client.js"
import { hashSeed, rivalRngFor } from "../../shared/rng.js"
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
  // The archrival's parallel RNG stream position (see rivalRngFor in
  // shared/rng.ts) — the rival advances on its own stream so its rolls never
  // consume the player's main stream. Persisted so reloads resume it.
  rivalRngState: number
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
  rival_rng_state: string | number | null
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
    // Legacy runs predate the parallel stream: default to the stream's initial
    // state derived from the seed so future advances stay deterministic.
    rivalRngState:
      r.rival_rng_state == null ? rivalRngFor(r.seed).getState() : Number(r.rival_rng_state),
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

// NOTE: the normalized `rivals` row is NOT written here — it is upserted by the
// first saveRun() (every createRun call site immediately saves). Keeping the
// write in one place avoids duplicating the rival→columns mapping.
export async function createRun(input: {
  runType: RunType
  seed: string
  rngState: number
  rivalRngState: number
  locale: Locale
  character: CharacterState
}): Promise<RunRecord> {
  const id = randomUUID()
  await query(
    `INSERT INTO runs (id, run_type, seed, rng_state, rival_rng_state, locale, character, pending_event, finished)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, false)`,
    [
      id,
      input.runType,
      input.seed,
      input.rngState,
      input.rivalRngState,
      input.locale,
      JSON.stringify(input.character),
    ],
  )
  return {
    id,
    runType: input.runType,
    seed: input.seed,
    rngState: input.rngState,
    rivalRngState: input.rivalRngState,
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

// Mirror the run's archrival into the normalized `rivals` table (upserted on
// every save so the row is always current). No-op when the run has no rival.
export async function upsertRival(run: RunRecord): Promise<void> {
  const rv = run.character.rival
  if (!rv) return
  await query(
    `INSERT INTO rivals
      (run_id, character_id, name, class, faction_id, focus_id, power_level,
       age, location, achievements_count, score, last_advanced_turn, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     ON CONFLICT (run_id) DO UPDATE SET
       character_id = EXCLUDED.character_id,
       name = EXCLUDED.name, class = EXCLUDED.class,
       faction_id = EXCLUDED.faction_id, focus_id = EXCLUDED.focus_id,
       power_level = EXCLUDED.power_level, age = EXCLUDED.age,
       location = EXCLUDED.location,
       achievements_count = EXCLUDED.achievements_count,
       score = EXCLUDED.score, last_advanced_turn = EXCLUDED.last_advanced_turn,
       updated_at = now()`,
    [
      run.id,
      run.character.id,
      rv.name,
      rv.class,
      rv.factionId,
      rv.focusId ?? null,
      rv.powerLevel,
      rv.age,
      rv.location,
      rv.achievementsCount,
      rv.score,
      rv.lastAdvancedTurn,
    ],
  )
}

export async function saveRun(run: RunRecord): Promise<void> {
  await query(
    `UPDATE runs
       SET rng_state = $2,
           rival_rng_state = $3,
           character = $4,
           pending_event = $5,
           finished = $6,
           updated_at = now()
     WHERE id = $1`,
    [
      run.id,
      run.rngState,
      run.rivalRngState,
      JSON.stringify(run.character),
      run.pendingEvent ? JSON.stringify(run.pendingEvent) : null,
      run.finished,
    ],
  )
  // Keep the normalized rivals row in sync on every save.
  await upsertRival(run)
}

// Whether this player (by seed) already has a daily run today.
export async function findDailyRun(seed: string): Promise<RunRecord | null> {
  const rows = await query<RunRow>(
    `SELECT * FROM runs WHERE run_type = 'daily' AND seed = $1 ORDER BY created_at DESC LIMIT 1`,
    [seed],
  )
  return rows[0] ? rowToRecord(rows[0]) : null
}

// Mirror a finished run into the normalized `characters` + `personality_log`
// tables (personality tags were tracked on the character JSONB but never
// persisted to the normalized table). Idempotent: upserts keyed on the
// character id, so re-finalizing or re-saving a run won't duplicate rows.
export async function persistCharacterSnapshot(run: RunRecord): Promise<void> {
  const c = run.character
  const now = Date.now()
  await query(
    `INSERT INTO characters (
       id, name, class, age, turn, strength, dexterity, constitution,
       intelligence, charisma, stamina, health, fame, gold, momentum, status,
       current_clan_id, hunted_by_clan_id, hunted_until_turn, locale,
       counters, seen_event_ids, run_type, daily_seed, rng_seed, rng_state,
       pending_event, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, class = EXCLUDED.class, age = EXCLUDED.age,
       turn = EXCLUDED.turn, strength = EXCLUDED.strength,
       dexterity = EXCLUDED.dexterity, constitution = EXCLUDED.constitution,
       intelligence = EXCLUDED.intelligence, charisma = EXCLUDED.charisma,
       stamina = EXCLUDED.stamina, health = EXCLUDED.health,
       fame = EXCLUDED.fame, gold = EXCLUDED.gold,
       momentum = EXCLUDED.momentum, status = EXCLUDED.status,
       current_clan_id = EXCLUDED.current_clan_id,
       hunted_by_clan_id = EXCLUDED.hunted_by_clan_id,
       hunted_until_turn = EXCLUDED.hunted_until_turn,
       locale = EXCLUDED.locale, counters = EXCLUDED.counters,
       seen_event_ids = EXCLUDED.seen_event_ids,
       run_type = EXCLUDED.run_type, daily_seed = EXCLUDED.daily_seed,
       rng_seed = EXCLUDED.rng_seed, rng_state = EXCLUDED.rng_state,
       pending_event = EXCLUDED.pending_event, updated_at = EXCLUDED.updated_at`,
    [
      c.id,
      c.name,
      c.class,
      c.age,
      c.turn,
      c.strength,
      c.dexterity,
      c.constitution,
      c.intelligence,
      c.charisma,
      c.stamina,
      c.health,
      c.fame,
      c.gold,
      c.momentum,
      c.status,
      c.currentClanId,
      c.huntedBy,
      c.huntedUntilTurn,
      c.locale,
      JSON.stringify(c.counters),
      JSON.stringify([]),
      run.runType,
      run.runType === "daily" ? run.seed : null,
      hashSeed(run.seed),
      run.rngState,
      run.pendingEvent ? JSON.stringify(run.pendingEvent) : null,
      now,
      now,
    ],
  )

  // Personality tags → normalized personality_log (upsert per tag).
  for (const [tag, count] of Object.entries(c.personality)) {
    await query(
      `INSERT INTO personality_log (character_id, tag, count)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, tag) DO UPDATE SET count = EXCLUDED.count`,
      [c.id, tag, count],
    )
  }
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
  epithet?: string
  epithetTitle?: string
  epilogue: string
  runType: RunType
  seed: string
}): Promise<void> {
  // Determine tier: runs above the 99.9th percentile become "legendary"
  let tier = "standard"
  if (input.runType === "standard") {
    const countRow = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM leaderboard WHERE run_type = 'standard'`,
    )
    const total = Number(countRow?.total ?? 0)
    if (total >= 100) {
      const cutoffIndex = Math.max(0, Math.floor(total * (1 - 0.999)))
      const cutoffRows = await query<{ score: number }>(
        `SELECT score FROM leaderboard WHERE run_type = 'standard' ORDER BY score DESC LIMIT 1 OFFSET $1`,
        [cutoffIndex],
      )
      if (cutoffRows.length > 0 && input.score >= cutoffRows[0].score) {
        tier = "legendary"
      }
    }
  }

  await query(
    `INSERT INTO leaderboard
      (id, run_id, name, character_class, final_power_level, net_worth,
       achievements_count, battles_won, quests_completed, age_at_end,
       reputation_peak, ending_type, score, legacy_score, epithet, epilogue, run_type, seed, leaderboard_tier)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
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
      input.epithet ?? null,
      input.epilogue,
      input.runType,
      input.seed,
      tier,
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
  epithet: string | null
  epilogue: string
  created_at: string
}

export async function getLeaderboard(input: {
  runType: RunType
  seed?: string
  limit: number
  tier?: string
}): Promise<LeaderboardRow[]> {
  if (input.runType === "daily" && input.seed) {
    return query<LeaderboardRow>(
      `SELECT * FROM leaderboard WHERE run_type = 'daily' AND seed = $1
       ORDER BY score DESC LIMIT $2`,
      [input.seed, input.limit],
    )
  }
  if (input.tier === "legendary") {
    return query<LeaderboardRow>(
      `SELECT * FROM leaderboard WHERE run_type = 'standard' AND leaderboard_tier = 'legendary'
       ORDER BY score DESC LIMIT $1`,
      [input.limit],
    )
  }
  return query<LeaderboardRow>(
    `SELECT * FROM leaderboard WHERE run_type = 'standard' AND leaderboard_tier = 'standard'
     ORDER BY score DESC LIMIT $1`,
    [input.limit],
  )
}

const CATEGORY_ORDER: Record<string, string> = {
  score: "score",
  net_worth: "net_worth",
  achievements_count: "achievements_count",
  age_at_end: "age_at_end",
  battles_won: "battles_won",
}

export async function getLeaderboardByCategory(input: {
  category: string
  runType: RunType
  seed?: string
  limit: number
}): Promise<LeaderboardRow[]> {
  const orderCol = CATEGORY_ORDER[input.category] ?? "score"
  if (input.runType === "daily" && input.seed) {
    return query<LeaderboardRow>(
      `SELECT * FROM leaderboard WHERE run_type = 'daily' AND seed = $1
       ORDER BY ${orderCol} DESC LIMIT $2`,
      [input.seed, input.limit],
    )
  }
  return query<LeaderboardRow>(
    `SELECT * FROM leaderboard WHERE run_type = 'standard'
     ORDER BY ${orderCol} DESC LIMIT $1`,
    [input.limit],
  )
}

export async function getCareerTotals(): Promise<{
  totalRuns: number
  totalScore: number
  totalAchievements: number
}> {
  const rows = await query<{
    total_runs: string
    total_score: string
    total_achievements: string
  }>(
    `SELECT
       COUNT(*)::text AS total_runs,
       COALESCE(SUM(score), 0)::text AS total_score,
       COALESCE(SUM(achievements_count), 0)::text AS total_achievements
     FROM leaderboard WHERE run_type = 'standard'`,
  )
  const row = rows[0] ?? { total_runs: "0", total_score: "0", total_achievements: "0" }
  return {
    totalRuns: Number(row.total_runs),
    totalScore: Number(row.total_score),
    totalAchievements: Number(row.total_achievements),
  }
}

export async function getPlayerRuns(name: string): Promise<LeaderboardRow[]> {
  return query<LeaderboardRow>(
    `SELECT * FROM leaderboard WHERE name = $1 ORDER BY created_at DESC LIMIT 10`,
    [name],
  )
}

export interface CollectionData {
  uniqueFactions: string[]
  uniqueEndings: string[]
  uniqueClasses: string[]
  uniqueAchievements: string[]
  totalRuns: number
}

export async function getCrossRunCollection(): Promise<CollectionData> {
  const factionRows = await query<{ faction: string }>(
    `SELECT DISTINCT jsonb_array_elements(character->'reputations')->>'faction' AS faction
     FROM runs WHERE finished = true AND jsonb_array_length(character->'reputations') > 0`,
  )
  const clanRows = await query<{ clan: string }>(
    `SELECT DISTINCT character->>'currentClanId' AS clan
     FROM runs WHERE finished = true AND character->>'currentClanId' IS NOT NULL`,
  )
  const endingRows = await query<{ ending_type: string }>(
    `SELECT DISTINCT ending_type FROM leaderboard`,
  )
  const classRows = await query<{ character_class: string }>(
    `SELECT DISTINCT character_class FROM leaderboard`,
  )
  const achievementRows = await query<{ achievement: string }>(
    `SELECT DISTINCT jsonb_array_elements_text(character->'achievements') AS achievement
     FROM runs WHERE finished = true AND jsonb_array_length(character->'achievements') > 0`,
  )
  const countRow = await queryOne<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM leaderboard`,
  )

  const factionsSet = new Set<string>()
  for (const r of factionRows) if (r.faction) factionsSet.add(r.faction)
  for (const r of clanRows) if (r.clan) factionsSet.add(r.clan)

  return {
    uniqueFactions: [...factionsSet].sort(),
    uniqueEndings: endingRows.map((r) => r.ending_type).sort(),
    uniqueClasses: classRows
      .map((r) => r.character_class)
      .filter(Boolean)
      .sort(),
    uniqueAchievements: achievementRows.map((r) => r.achievement).sort(),
    totalRuns: Number(countRow?.total ?? 0),
  }
}

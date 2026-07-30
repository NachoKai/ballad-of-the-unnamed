-- Fantasy CYOA RPG schema (Postgres / Neon adaptation of the spec's libSQL schema).
-- Timestamps are epoch-millisecond BIGINTs. JSON blobs use JSONB.
-- Clan columns are kept forward-compatible (nullable, no FK yet) for the v1 slice.

-- v1 SLICE STORAGE ----------------------------------------------------------
-- The playable vertical slice stores an entire run (character + rng + pending
-- event) as one row for simplicity and reload-resilience. The normalized
-- tables below remain for the fuller build-out (clans, inventory, turn_log).

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  run_type      TEXT NOT NULL DEFAULT 'standard',   -- standard | daily
  seed          TEXT NOT NULL,
  rng_state     BIGINT NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'en',
  character     JSONB NOT NULL,
  pending_event JSONB,
  finished      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_daily ON runs (run_type, seed);

CREATE TABLE IF NOT EXISTS leaderboard (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL,
  name                TEXT NOT NULL,
  character_class     TEXT NOT NULL,
  final_power_level   INTEGER NOT NULL,
  net_worth           INTEGER NOT NULL,
  achievements_count  INTEGER NOT NULL DEFAULT 0,
  battles_won         INTEGER NOT NULL DEFAULT 0,
  quests_completed    INTEGER NOT NULL DEFAULT 0,
  age_at_end          INTEGER NOT NULL,
  reputation_peak     INTEGER NOT NULL DEFAULT 0,
  ending_type         TEXT NOT NULL,
  score               INTEGER NOT NULL,
  legacy_score        INTEGER NOT NULL DEFAULT 0,
  epithet             TEXT,
  epilogue            TEXT NOT NULL,
  run_type            TEXT NOT NULL DEFAULT 'standard',
  seed                TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lb_score ON leaderboard (score DESC);
CREATE INDEX IF NOT EXISTS idx_lb_runtype ON leaderboard (run_type, seed, score DESC);

-- NORMALIZED TABLES (reserved for the fuller build-out) ---------------------

CREATE TABLE IF NOT EXISTS characters (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  class               TEXT NOT NULL,
  age                 INTEGER NOT NULL DEFAULT 16,
  turn                INTEGER NOT NULL DEFAULT 0,
  strength            INTEGER NOT NULL DEFAULT 0,
  dexterity           INTEGER NOT NULL DEFAULT 0,
  constitution        INTEGER NOT NULL DEFAULT 0,
  intelligence        INTEGER NOT NULL DEFAULT 0,
  charisma            INTEGER NOT NULL DEFAULT 0,
  stamina             INTEGER NOT NULL DEFAULT 50,
  health              INTEGER NOT NULL DEFAULT 100,
  fame                INTEGER NOT NULL DEFAULT 0,
  gold                INTEGER NOT NULL DEFAULT 0,
  momentum            TEXT NOT NULL DEFAULT 'normal',
  status              TEXT NOT NULL DEFAULT 'alive', -- alive | retired | dead
  current_clan_id     TEXT,                          -- forward-compatible (Clans system)
  hunted_by_clan_id   TEXT,
  hunted_until_turn   INTEGER,
  locale              TEXT NOT NULL DEFAULT 'en',
  counters            JSONB NOT NULL DEFAULT '{}'::jsonb,
  seen_event_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,
  run_type            TEXT NOT NULL DEFAULT 'standard',
  daily_seed          TEXT,
  rng_seed            BIGINT NOT NULL,
  rng_state           BIGINT NOT NULL,
  -- The event most recently served, so the server can validate the client's
  -- submitted choice against what it actually offered (anti-cheat).
  pending_event       JSONB,
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reputations (
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  faction       TEXT NOT NULL,
  value         INTEGER NOT NULL DEFAULT 0,
  peak_value    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, faction)
);

CREATE TABLE IF NOT EXISTS inventory (
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL,
  qty           INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (character_id, item_id)
);

CREATE TABLE IF NOT EXISTS personality_log (
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tag           TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, tag)
);

CREATE TABLE IF NOT EXISTS achievements_unlocked (
  character_id    TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL,
  unlocked_at     BIGINT NOT NULL,
  PRIMARY KEY (character_id, achievement_id)
);

-- turn_log stores a language-neutral recap reference (event/choice ids + vars),
-- not a baked sentence, so a run can be re-rendered in either locale later.
CREATE TABLE IF NOT EXISTS turn_log (
  id            TEXT PRIMARY KEY,
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  turn_number   INTEGER NOT NULL,
  event_id      TEXT NOT NULL,
  choice_id     TEXT NOT NULL,
  tag           TEXT,
  stat_deltas   JSONB,
  vars          JSONB,
  created_at    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id                  TEXT PRIMARY KEY,
  character_id        TEXT NOT NULL,
  name                TEXT NOT NULL,
  class               TEXT NOT NULL,
  final_power_level   INTEGER NOT NULL,
  net_worth           INTEGER NOT NULL,
  achievements_count  INTEGER NOT NULL DEFAULT 0,
  battles_won         INTEGER NOT NULL DEFAULT 0,
  quests_completed    INTEGER NOT NULL DEFAULT 0,
  age_at_end          INTEGER NOT NULL,
  reputation_peak     INTEGER NOT NULL DEFAULT 0,
  ending_type         TEXT NOT NULL,
  score               INTEGER NOT NULL,
  -- structured recap so the epilogue can render in the viewer's locale
  epilogue_recap      JSONB NOT NULL,
  run_type            TEXT NOT NULL DEFAULT 'standard',
  daily_seed          TEXT,
  created_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard_entries (score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_networth ON leaderboard_entries (net_worth DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_age ON leaderboard_entries (age_at_end DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_battles ON leaderboard_entries (battles_won DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_achievements ON leaderboard_entries (achievements_count DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_runtype ON leaderboard_entries (run_type, daily_seed);

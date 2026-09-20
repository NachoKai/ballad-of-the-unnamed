# Story Threads + Free-Text Dialogue — Implementation Plan

> **For the implementer:** Execute phase by phase. Each task is TDD: write the failing test, run it, implement, run it green, then run the phase verification. Do not skip the verification commands.

**Goal:** Make runs read as a coherent story via authored, chained "story threads", and add a free-text `dialogue` event type where a player-written answer is classified by the TypeSafe/Jev API against an authored rubric and produces an authored outcome — all while preserving the daily-seed determinism promise.

**Source of truth:** `docs/superpowers/specs/2026-09-17-story-threads-and-dialogue-design.md`

**Stack:** TypeScript, Express server (`server/`), React 19 + styled-components client (`src/`), shared types (`shared/`), Neon Postgres via `@neondatabase/serverless`. Two test suites: `src/**` (vitest root config) and `server/**` + `shared/**` (`vitest.server.config.ts`).

**Jev API (confirmed against https://docs.typesafe.ai/introduction/quickstart):**
- `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer <KEY>`, `Content-Type: application/json`.
- Request: `{ "state": string, "model": "jev-latest", "questions": { <id>: { type: "choice", instructions: string, criteria: { <option>: <desc|null> } } } }`.
- Response: `{ "model": string, "answers": { <id>: { type: "choice", choice: string, confidence: number, probabilities: Record<string, number> } }, "usage": {...} }`.

---

## Global invariants (enforce in every phase)

1. **Jev never decides numbers.** Only *which authored slot* / *which authored thread*. All stat/gold/fame deltas are authored and applied by existing code paths.
2. **Jev never generates prose.** All player-facing text is authored content. Player free text is *classified only* and is never interpolated into served narrative.
3. **Determinism:** every mechanical roll uses the per-run seeded `Rng` (`shared/rng.ts`). The open roll always consumes exactly one draw; when it opens, the which-thread roll always consumes a second draw — regardless of whether Jev later overrides the winner (see Task 1.6). Jev only *overrides the winner* with a daily-cached pick.
4. **Availability uniformity:** Jev is on for the whole deployment iff `TYPESAFE_API_KEY` is set. Server runs fully without it.
5. **Fallbacks are mandatory:** any Jev failure / missing key / low confidence → the authored fallback (rng pick for threads, `fallback` slot for dialogue).
6. **i18n:** every new `LocaleMap` needs non-empty `en` and `es`; registry throws otherwise. Run `pnpm i18n:check` after content edits (Phase 3).
7. **Explicit `.js` extensions** on ESM relative imports (server runs as native ESM on Vercel).

---

# Phase 1 — Threads core (no AI)

Outcome: authored threads open and chain beats deterministically, with zero AI involved. Game must remain fully playable if this phase ships alone.

## Task 1.1 — Shared types for threads

**Files:** modify `shared/types.ts`

1. Add to `CharacterState` (near the other optional legacy-safe fields — search for `seenEventIds`):

```ts
  // Story threads: the single active thread and its next beat, plus the ids of
  // threads already completed (never re-openable). Optional for legacy saves.
  activeThread?: { id: string; beatIndex: number } | null
  completedThreads?: string[]
  // Set at the season boundary when a thread opens; Phase 2's route-layer Jev
  // refinement may swap the rng fallbackPick, then clears this.
  threadPickPending?: boolean
  // Candidate thread ids persisted with the open plan so refinement does not
  // re-derive eligibility from a possibly-advanced state.
  threadCandidates?: string[]
  // Dialogue-event pacing (Phase 2): ids seen + the per-run cap/cooldown.
  dialogueEventsSeen?: string[]
```

Define all five now (all optional, legacy-safe) so later tasks don't each touch this interface.

2. Add a `ThreadContent` interface and a `DialogueInterpretation` interface (the latter is consumed in Phase 2 but defined here so `ThreadContent`'s `beats` typing and `EventContent` extensions are stable). Place near `EventContent` (around line 755).

```ts
export interface ThreadReward {
  goldDelta?: number
  fameDelta?: number
  reputationDelta?: number
  statDeltas?: StatDeltas
  setsFlag?: Record<string, boolean>
}

export interface ThreadContent {
  id: string
  // Localized title shown on the HUD storyline chip.
  title: LocaleMap
  minAge?: number
  maxAge?: number
  requiresArc?: string[]
  requiresRegion?: string | null
  requiresFlag?: string | null
  excludeIfFlag?: string | null
  weight?: number
  // Ordered event ids. Each must resolve in the registry.
  beats: string[]
  reward?: ThreadReward
}
```

3. Add `threadTitle?: string` to `ServedEvent` (after `flagLabel?`):

```ts
  // Active story thread title, localized, shown as a HUD chip.
  threadTitle?: string
```

4. Run typecheck/lint.

**Verify:** `pnpm lint` and `pnpm test:server` (should remain green; no behavior changed).

## Task 1.2 — Content registry: load and validate threads

**Files:** modify `server/content/registry.ts`, create `content/threads/` directory.

1. Read `server/content/registry.ts` to match the existing loader conventions (it currently reads `events/*.json`, `minigames/*.json`, etc. with `readdirSync` + `readFileSync`). Add thread loading mirroring that pattern:

```ts
// after events/minigames load
export interface ContentRegistry {
  // ...existing fields
  threads: ThreadContent[]
}
```

Loading logic (adapt names to the file's local structure):

```ts
function loadThreads(): ThreadContent[] {
  const dir = join(CONTENT_DIR, "threads")
  if (!existsSync(dir)) return []
  const out: ThreadContent[] = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as ThreadContent[]
    for (const t of raw) {
      validateThread(t)
      out.push(t)
    }
  }
  return out
}
```

Validation (throws — registry convention is throw-on-bad-data):

```ts
function validateThread(t: ThreadContent, eventsById: Map<string, EventContent>): void {
  if (!t.id) throw new Error("thread missing id")
  validateLocaleMap(t.title, `thread ${t.id} title`)
  if (!Array.isArray(t.beats) || t.beats.length < 2) {
    throw new Error(`thread ${t.id} must have at least 2 beats`)
  }
  for (const beatId of t.beats) {
    if (!eventsById.has(beatId)) {
      throw new Error(`thread ${t.id} references unknown event ${beatId}`)
    }
  }
}
```

**Ordering matters:** thread loading + validation must run **after** `eventsById` is built (`registry.ts:413`). Add `threads` to the `cached` object at line 418 and to the `ContentRegistry` interface (line 44). Use the existing `validateLocaleMap` and `readJson` helpers.

Also note: the current event loader asserts `ev.choices && ev.choices.length > 0` (`registry.ts:172`), which would reject Phase 2 `dialogue` events. Branch that assertion on `ev.type !== "dialogue"` (Phase 2, Task 2.4).

2. Create `content/threads/example_thread.json` with a minimal placeholder thread (one real existing event id repeated is fine for the smoke test; Phase 3 replaces it):

```json
[
  {
    "id": "smoke_thread",
    "title": { "en": "The Smoke Test", "es": "La Prueba de Humo" },
    "weight": 1,
    "beats": ["<existing_event_id>", "<existing_event_id2>"],
    "reward": { "fameDelta": 1, "setsFlag": { "smoke_thread_done": true } }
  }
]
```

Pick two existing event ids from `content/events/*.json`.

3. Add a registry test in `server/content/registry.test.ts` (create if absent):
   - valid thread loads
   - a thread with an unknown beat id throws
   - a thread with a missing locale throws

**Verify:** `pnpm test:server`.

## Task 1.3 — GAME_CONFIG knobs

**Files:** modify `shared/config.ts`

Add to `GAME_CONFIG`:

```ts
  // Story threads
  threadOpenChance: 0.5,       // probability an open roll succeeds at a season boundary
  threadPace: "every" as "every" | "every-n",
  threadPaceEveryTurns: 2,     // used only when threadPace === "every-n"
  maxThreadsPerRun: 3,
```

Pin `threadPace` semantics in a comment: `"every"` = the next normal event turn serves the next beat; `"every-n"` = a beat, then `threadPaceEveryTurns - 1` filler turns, then the next beat.

**Verify:** `pnpm lint`.

## Task 1.4 — `selectEvent` serves the active thread's next beat

**Files:** modify `server/engine/engine.ts` (`selectEvent` at line 367), `server/engine/helpers.ts` (if a helper is cleaner)

1. **Write the test first** in `server/engine/engine.test.ts` (the large suite). Test: a character with `activeThread: { id: "smoke_thread", beatIndex: 0 }` receives `smoke_thread.beats[0]` as the served event id on a normal turn, regardless of the random pool; and after that beat resolves, the next normal turn serves `beats[1]`.

2. In `selectEvent`, before the random-pool selection, add a thread-beat branch:

```ts
  // Active story thread: the next normal turn serves the next beat. Hard
  // interludes (season summary, capstone, finale, negotiation, tournament,
  // combat) are handled earlier in buildServedEvent and preempt this branch.
  const thread = c.activeThread
    ? registry.threads.find((t) => t.id === c.activeThread!.id)
    : undefined
  if (thread && c.activeThread) {
    const beatEventId = thread.beats[c.activeThread.beatIndex]
    const beatEvent = beatEventId ? registry.eventsById.get(beatEventId) : undefined
    // isEligible takes (event, character) only (helpers.ts:361).
    if (beatEvent && isEligible(beatEvent, c)) {
      // NOTE: markEventSeen is called later in buildServedEvent (engine.ts:1102);
      // do NOT call it here or the beat is recorded twice.
      return beatEvent
    }
    // Beat missing/ineligible: skip it (advance) rather than soft-lock the run.
    c.activeThread = null
  }
```

Confirm the return contract: `selectEvent` returns `EventContent` and the random path also sets `c.lastEventId = picked.id` (line 438). Do **not** set `lastEventId` for a thread beat — that field drives no-repeat in the random pool, and a beat jarringly suppressing a future random event is undesirable. `buildServedEvent` records `seenEventIds` itself.

3. Pacing: if `threadPace === "every-n"`, gate serving a beat behind a per-run counter (add `threadFillerCount` to `CharacterState`, optional). Default `"every"` — implement the branch so `every-n` is a documented extension but the shipped config uses `"every"`.

**Verify:** `pnpm test:server`.

## Task 1.5 — `advanceThread` + completion reward, wired into every resolution tail

**Files:** modify `server/engine/engine.ts`

1. **Write tests first:**
   - resolving beat N advances `beatIndex` by 1
   - resolving the final beat clears `activeThread`, pushes the id to `completedThreads`, and applies `reward` exactly once (gold/fame/flag)
   - a completed thread never re-opens (covered in Task 1.6)

2. Implement:

```ts
export function advanceThread(c: CharacterState, registry: ContentRegistry): void {
  if (!c.activeThread) return
  const thread = registry.threads.find((t) => t.id === c.activeThread!.id)
  if (!thread) {
    c.activeThread = null
    return
  }
  const next = c.activeThread.beatIndex + 1
  if (next >= thread.beats.length) {
    // Completion.
    c.completedThreads = [...(c.completedThreads ?? []), thread.id]
    c.activeThread = null
    applyThreadReward(c, thread.reward)
  } else {
    c.activeThread = { id: thread.id, beatIndex: next }
  }
}

function applyThreadReward(c: CharacterState, reward?: ThreadReward): void {
  if (!reward) return
  if (reward.goldDelta) c.gold += reward.goldDelta
  if (reward.fameDelta) c.fame += reward.fameDelta
  // Reputation is faction-scoped: mirror resolveChoice (engine.ts:1439).
  if (reward.reputationDelta) {
    adjustReputation(c, defaultFaction(c), reward.reputationDelta)
  }
  if (reward.statDeltas) applyStatDeltas(c, reward.statDeltas)
  if (reward.setsFlag) for (const [k, v] of Object.entries(reward.setsFlag)) setFlag(c, k, v)
}
```

`defaultFaction(c)` (`engine.ts:1667`) and `adjustReputation` (`helpers.ts:135`) already exist. `applyStatDeltas` is module-local to `engine.ts` (not exported) — fine, `applyThreadReward`/`resolveDialogue` live in the same file.

3. Call `advanceThread(c, registry)` at the **end of every resolution path**, immediately after the existing tail (goldPerTurn/stamina/ageUp/...):
   - `resolveChoice` (end, ~line 1473)
   - `resolveMinigame` (end, ~line 1493)
   - `endCombat` in `server/engine/combat/index.ts` (end of its resolution, ~lines 593–600)
   - `resolveDialogue` (Phase 2)
   The current-beat id must be captured *before* `advanceThread` mutates `beatIndex`, if needed for nextBeat branching.

**Verify:** `pnpm test:server`.

## Task 1.6 — Thread opening at season boundary (seeded rng, Jev-overridable)

**Files:** modify `server/engine/engine.ts` (`resolveSeasonSummary` ~line 1112 is the boundary hook), `shared/rng.ts` (no change expected), `shared/config.ts` (knobs added in 1.3)

**Decision pinned (design doc §2 open question):** the open roll *and* the which-thread roll each consume exactly one rng draw unconditionally. Jev (Phase 2) may override the *winner* but never changes how many draws are consumed. This keeps the rng stream identical across deployments regardless of whether Jev is enabled.

1. **Write tests first:**
   - same seed → same thread opens (repeat with fresh `Rng` from same seed, assert identical id)
   - no open when `activeThread` set
   - no open when `completedThreads` includes the only candidate
   - open count is capped by `maxThreadsPerRun`
   - the whether-roll and which-roll each consume one draw (assert via rng state/sequence in the test)

2. Implement an exported, pure-ish selector usable by both engine and route layer. Use the **real `Rng` API** (`shared/rng.ts`): `bool(p)` (one draw), `weighted(items, weightOf)` (one draw), `getState()`.

```ts
export interface ThreadOpenPlan {
  candidates: ThreadContent[]
  fallbackPick: ThreadContent
  rngStateAfter: number
}

// Decides WHETHER a thread opens and (deterministically) WHICH, consuming
// exactly two draws when an open happens (bool + weighted), zero otherwise.
export function planThreadOpen(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { open: false } | ({ open: true } & ThreadOpenPlan) {
  if (c.activeThread) return { open: false }
  const completed = new Set(c.completedThreads ?? [])
  if (completed.size >= GAME_CONFIG.maxThreadsPerRun) return { open: false }
  const candidates = registry.threads.filter((t) => threadEligible(t, c, completed))
  if (candidates.length === 0) return { open: false }
  // 1 draw: whether an open happens.
  if (!rng.bool(GAME_CONFIG.threadOpenChance)) return { open: false }
  // 1 draw: which thread. ALWAYS consumed; Jev may override the winner later.
  const fallbackPick = rng.weighted(candidates, (t) => t.weight ?? 1)
  return { open: true, candidates, fallbackPick, rngStateAfter: rng.getState() }
}

function threadEligible(t: ThreadContent, c: CharacterState, completed: Set<string>): boolean {
  if (completed.has(t.id)) return false
  if (t.minAge != null && c.age < t.minAge) return false
  if (t.maxAge != null && c.age > t.maxAge) return false
  if (t.requiresArc && !t.requiresArc.includes(c.currentArc)) return false
  if (t.requiresRegion && c.currentRegion !== t.requiresRegion) return false
  if (t.requiresFlag && !checkFlag(c, t.requiresFlag)) return false
  if (t.excludeIfFlag && checkFlag(c, t.excludeIfFlag)) return false
  return true
}
```

Note `checkFlag(c, flag)` takes the flag **name string** as its second arg (`helpers.ts:197`); `c.flags` is `Record<string, unknown>`.

3. `resolveSeasonSummary` currently takes `(c, registry)` (engine.ts:1112) with **one production caller** (engine.ts:1294, inside `resolveChoice`'s `__season_summary__` branch) and ~15 test callers. Add an **optional** third param to avoid churning the test suite:

```ts
export function resolveSeasonSummary(c: CharacterState, registry: ContentRegistry, rng?: Rng): void {
  // ...existing body...
  if (rng) {
    const plan = planThreadOpen(c, registry, rng)
    if (plan.open) {
      c.activeThread = { id: plan.fallbackPick.id, beatIndex: 0 }
      c.threadCandidates = plan.candidates.map((t) => t.id)
      c.threadPickPending = true   // Phase 2: route layer may refine via Jev cache
    }
  }
}
```

4. At the production caller (engine.ts:1294), pass the run's `rng` (it is in scope in `resolveChoice`). Confirm the `resolveChoice` signature exposes `rng`; it does (`resolveChoice(c, event, choiceId, registry, rng)` per `server/routes/game.ts:542`).

5. Surface `threadTitle` on the served summary event so the client can show it immediately: in `buildServedEvent`, when a thread is active, set `served.threadTitle = localize(thread.title, c.locale)`.

**Verify:** `pnpm test:server`.

## Task 1.7 — Client: HUD storyline chip + served type

**Files:** modify `src/api.ts` (`ServedEvent` client typing), `src/components/Hud.tsx`, `src/components/DetailsModal.tsx` (model for the chip: rival focus chip ~line 156), `src/i18n/strings.ts`

1. Ensure the client `ServedEvent` type (in `src/api.ts` or wherever imported from `@shared/types`) exposes `threadTitle?: string`. It likely re-exports the shared type; if so no change needed.
2. Add a storyline chip to `Hud.tsx`, mirroring the rival focus chip markup/styles from `DetailsModal.tsx:156`: render only when `threadTitle` is present. Use a distinct icon/label.
3. Add strings to `src/i18n/strings.ts` (en near line 160, es near line 697):

```ts
  storyline: { en: "Storyline", es: "Trama" },
```

**Verify:** `pnpm lint` and `pnpm test` (client suite).

## Task 1.8 — Phase 1 verification

Run all of:

```bash
pnpm lint
pnpm test
pnpm i18n:check
pnpm build
```

Then a manual smoke test: `pnpm dev`, force a season boundary (or temporarily raise `threadOpenChance` to 1 and lower `maxThreadsPerRun`), confirm a thread opens, beats chain, the chip renders, and the reward fires once. Revert any temporary knob changes.

---

# Phase 2 — Jev client + free-text dialogue

Outcome: `dialogue` events served; player free text classified by Jev (daily-cached), mapped to an authored outcome; graceful fallback everywhere.

## Task 2.1 — `jev_cache` table migration

**Files:** modify `server/db/schema.sql`, run migrate.

Append:

```sql
CREATE TABLE IF NOT EXISTS jev_cache (
  cache_key TEXT PRIMARY KEY,
  choice TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Add a store module `server/store/jevCache.ts`:

```ts
import { query, queryOne } from "../db/client.js"

export async function getJevCache(cacheKey: string): Promise<{ choice: string; payload: unknown } | null> {
  const row = await queryOne<{ choice: string; payload: unknown }>(
    "SELECT choice, payload FROM jev_cache WHERE cache_key = $1",
    [cacheKey],
  )
  return row ?? null
}

export async function putJevCache(cacheKey: string, choice: string, payload: unknown): Promise<void> {
  await query(
    `INSERT INTO jev_cache (cache_key, choice, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (cache_key) DO NOTHING`,
    [cacheKey, choice, JSON.stringify(payload)],
  )
}
```

Match the real `query`/`queryOne` signatures in `server/db/client.ts` (Neon HTTP driver, async).

**Verify:** `pnpm db:migrate` (against a dev `DATABASE_URL`), `pnpm test:server`.

## Task 2.2 — Jev client wrapper `server/engine/jev.ts`

**Files:** create `server/engine/jev.ts`, create `server/engine/jev.test.ts`.

Request/response shapes are confirmed (see header). Implement:

```ts
const JEV_URL = "https://api.typesafe.ai/v1/systemone"
const JEV_TIMEOUT_MS = 1200

export interface JevChoiceQuestion {
  id: string
  instructions: string
  criteria: Record<string, string | null>
}

export interface JevChoiceAnswer {
  id: string
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY)
}

// Returns null on: missing key, timeout, non-2xx, malformed/invalid shape.
// Never throws. Never retries.
export async function askJevChoice(
  state: string,
  questions: JevChoiceQuestion[],
  timeoutMs = JEV_TIMEOUT_MS,
): Promise<JevChoiceAnswer[] | null> {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const body = {
      state,
      model: "jev-latest",
      questions: Object.fromEntries(
        questions.map((q) => [q.id, { type: "choice", instructions: q.instructions, criteria: q.criteria }]),
      ),
    }
    const res = await fetch(JEV_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { answers?: Record<string, unknown> }
    if (!json.answers) return null
    const out: JevChoiceAnswer[] = []
    for (const q of questions) {
      const a = json.answers[q.id] as
        | { type?: string; choice?: unknown; confidence?: unknown; probabilities?: unknown }
        | undefined
      if (!a || a.type !== "choice") return null
      if (typeof a.choice !== "string") return null
      const criteriaKeys = Object.keys(q.criteria)
      if (!criteriaKeys.includes(a.choice)) return null
      if (typeof a.confidence !== "number" || a.confidence < 0 || a.confidence > 1) return null
      if (typeof a.probabilities !== "object" || a.probabilities === null) return null
      out.push({
        id: q.id,
        choice: a.choice,
        confidence: a.confidence,
        probabilities: a.probabilities as Record<string, number>,
      })
    }
    return out
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
```

Tests (mock global `fetch`, no network):
- success returns parsed answers
- timeout (fetch rejects with AbortError) → null
- non-2xx → null
- malformed body / unknown choice / bad confidence → null
- no `TYPESAFE_API_KEY` → null and `fetch` not called

**Verify:** `pnpm test:server`.

## Task 2.3 — Daily-cached thread-pick refinement (route layer)

**Files:** create `server/engine/threadPick.ts`, modify `server/routes/game.ts`.

Cache key must be stable across all players that day:

```ts
import { createHash } from "node:crypto"

export function threadPickCacheKey(coarseSignature: string, candidateIds: string[]): string {
  const day = new Date().toISOString().slice(0, 10) // UTC date
  const canonical = JSON.stringify([...candidateIds].sort())
  return createHash("sha256").update(`${day}|${coarseSignature}|${canonical}`).digest("hex")
}
```

Coarse signature builder — **no run id, no turn log, no free text**:

```ts
export function coarseSignature(c: CharacterState): string {
  const dominantTags = Object.entries(c.personality)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k)
  return JSON.stringify({
    class: c.class,
    archetype: c.archetype,
    arc: c.currentArc,
    region: c.currentRegion,
    fameTier: Math.floor(c.fame / 100),
    goldTier: Math.floor(c.gold / 250),
    tags: dominantTags,
    // flags is Record<string, unknown> (types.ts:947) — sort keys for stability.
    flags: Object.keys(c.flags).filter((f) => THREAD_RELEVANT_FLAGS.has(f)).sort(),
  })
}
```

Define `THREAD_RELEVANT_FLAGS` as the union of all `requiresFlag`/`excludeIfFlag` values across loaded threads (compute once from the registry).

`buildThreadRecap(c)` is the human-readable `state` string sent to Jev (never shown to the player). Build it from the same coarse data, e.g.:

```ts
function buildThreadRecap(c: CharacterState): string {
  return (
    `A ${c.age}-year-old ${c.class} (${c.archetype ?? "unproven"}) in the ${c.currentArc} arc ` +
    `of ${c.currentRegion}. Fame ${c.fame}, gold ${c.gold}. ` +
    `Dominant traits: ${Object.entries(c.personality).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k).join(", ") || "none"}.`
  )
}
```

Refinement (async, at the route layer, when `c.threadPickPending`):

```ts
export async function refineThreadPick(
  c: CharacterState,
  registry: ContentRegistry,
): Promise<void> {
  if (!c.threadPickPending || !c.activeThread || !jevEnabled()) return
  const ids = c.threadCandidates ?? [c.activeThread.id]
  const candidates = ids
    .map((id) => registry.threads.find((t) => t.id === id))
    .filter((t): t is ThreadContent => Boolean(t))
  if (candidates.length === 0) {
    c.threadPickPending = false
    return
  }
  const key = threadPickCacheKey(coarseSignature(c), candidates.map((t) => t.id))
  const cached = await getJevCache(key).catch(() => null)
  let choice = cached?.choice
  if (!choice) {
    const answers = await askJevChoice(
      buildThreadRecap(c),
      [{ id: "thread", instructions: "Which story thread best continues this character's saga?",
         criteria: Object.fromEntries(candidates.map((t) => [t.id, localize(t.title, "en")])) }],
    )
    if (answers && answers[0].confidence >= 0.3) {
      choice = answers[0].choice
      await putJevCache(key, choice, answers[0]).catch(() => {})
    }
  }
  if (choice && candidates.some((t) => t.id === choice)) {
    c.activeThread = { id: choice, beatIndex: 0 }
  }
  c.threadPickPending = false
}
```

**Note:** because `planThreadOpen` always consumed the "which" draw for `fallbackPick`, the rng stream is identical whether or not Jev overrides the winner. `/state` must call `refineThreadPick` (or skip it) consistently; since the draw was already consumed at the boundary, refinement does not touch rng at all.

Wire into `server/routes/game.ts`:
- `/state` and `/choose` handlers: `await refineThreadPick(run.character, registry)` **before** building the served event, then persist the run if changed.

**Tests** (mock `askJevChoice` and cache store):
- cache hit → uses cached choice
- cache miss + Jev success → stores + applies
- Jev null → keeps `fallbackPick`, clears pending
- Jev choice not in candidates → keeps fallback
- different days → different cache keys

**Verify:** `pnpm test:server`.

## Task 2.4 — Dialogue event type: shared types + registry validation + serving

**Files:** modify `shared/types.ts`, `server/content/registry.ts`, `server/engine/helpers.ts` (`serveEvent` at line 462), `server/engine/engine.ts` (`buildServedEvent`).

1. Types:

```ts
export interface DialogueInterpretation {
  id: string
  // Authored effects, reusing the ChoiceContent vocabulary.
  tag?: PersonalityTag
  statDeltas?: StatDeltas
  tradeoffDeltas?: StatDeltas
  goldDelta?: number
  fameDelta?: number
  reputationDelta?: number
  affinityDelta?: number
  setsFlag?: Record<string, boolean>
  // Optional thread branch: if present, overrides the linear next beat.
  nextBeat?: string
  // Localized flavor shown to the player describing the outcome.
  outcomeNarrative?: LocaleMap
}

export interface ServedDialogue {
  prompt: string
  maxLength: number
  // Canned shortcuts that skip Jev and behave like normal choices.
  shortcuts: { id: string; label: string }[]
  fallbackId: string
}

export interface ServedEvent {
  // ...existing
  dialogue?: ServedDialogue
}
```

Extend `EventContent`'s existing `type` union (types.ts:757 — currently `"event" | "minigame" | "destiny" | "world" | "combat"`) to include `"dialogue"`, and add the dialogue fields:

```ts
  type?: "event" | "minigame" | "destiny" | "world" | "combat" | "dialogue"
  // type: "dialogue"
  dialoguePrompt?: LocaleMap
  maxLength?: number
  interpretations?: DialogueInterpretation[]
  fallback?: string
  requiresThread?: string
  requiresRelationshipId?: string
  // Authored rubric instructions sent to Jev (not shown to the player).
  rubricInstructions?: LocaleMap
```

2. Registry validation for dialogue events (branch on `type === "dialogue"` inside the existing event validation):
   - `dialoguePrompt` present, locale-valid
   - `interpretations` is a non-empty array; every `id` unique; every `nextBeat` (if any) is a valid event id
   - `fallback` present and matches one of the interpretation ids
   - throw on violation

3. `serveEvent`: when `event.type === "dialogue"`, populate `served.dialogue` with the localized prompt, `maxLength` (default from `GAME_CONFIG.dialogueMaxLength`, e.g. 300), authored shortcuts, and `fallbackId`. `choices` remains empty.

4. `buildServedEvent` must not attempt to build choice cards for dialogue events — guard the existing choice-building block on `event.type !== "dialogue"`.

**Tests:** registry (valid dialogue loads; missing fallback throws; nextBeat to unknown event throws); `serveEvent` emits a `dialogue` payload with correct maxLength and localized prompt.

**Verify:** `pnpm test:server`.

## Task 2.5 — `resolveDialogue` (Jev classify → apply authored effects)

**Files:** modify `server/engine/engine.ts`, modify `server/routes/game.ts` (`/choose`).

Server flow in `/choose` when the served event is `dialogue` and `playerAnswer` is provided:
1. Validate `typeof playerAnswer === "string"`, `playerAnswer.length <= maxLength`, and the event is `type: "dialogue"`.
2. Call Jev with `state = JSON.stringify({ narrative, prompt, answer })` and one Choice question whose criteria are the interpretation ids (instructions authored per event, e.g. a localized `rubricInstructions` field; add it to `EventContent`).
3. Apply the picked interpretation via a new `resolveDialogue` (do **not** refactor the monolithic `resolveChoice`). Reuse the same effect helpers `resolveChoice` uses (`applyStatDeltas`, `adjustAffinity`, `setFlag`, `bumpCounter`, `logTurn`, `updateMomentum`, `deductStamina`, `updateMarketValue`, `recomputeDerived`, `ageUp`, `clearExpiredHunted`, death roll) and the same tail as `resolveChoice` after effects (goldPerTurn, stamina, etc.).
4. Then call `advanceThread(c, registry)` (with `nextBeat` handling: if the chosen interpretation has `nextBeat`, set `c.activeThread.beatIndex` to the index of that beat in the thread before advancing).
5. **Never** place `playerAnswer` into any served `narrative`/`outcomeNarrative`. Only the authored `outcomeNarrative` for the chosen slot is shown. Add a test asserting `playerAnswer` is absent from the response.

Fallbacks:
- no key / Jev null / confidence < 0.3 → use interpretation `event.fallback`.
- shortcuts (canned) → bypass Jev, resolve a named choice-like branch directly (e.g. shortcut id maps to an interpretation id or a direct effect block).

Enforce `GAME_CONFIG.maxDialogueEventsPerRun` + `dialogueCooldownTurns` in `selectEvent` eligibility for dialogue-type events (tracked via the `dialogueEventsSeen` field added in Task 1.1, plus a `counters["last_dialogue_turn"]` cooldown, mirroring the interactive-minigame budget at `engine.ts:400–404`).

**Tests:**
- Jev picks slot A → A's effects applied, tag awarded, thread advanced
- Jev null → fallback slot applied
- low confidence → fallback slot applied
- over-length answer rejected (400)
- player answer never appears in response
- shortcut path skips Jev
- `maxDialogueEventsPerRun` respected

**Verify:** `pnpm test:server`.

## Task 2.6 — Client: dialogue textarea UI

**Files:** modify `src/api.ts` (`ChooseResponse`, `choose` signature), `src/components/GameScreen.tsx` (choice render + `onChoose`), `src/i18n/strings.ts`.

1. `src/api.ts`: extend `choose` input to `{ runId: string; choiceId?: string; cardId?: string; playerAnswer?: string }` (line 279) and pass `playerAnswer` through. `ChooseResponse` (line 57) already carries the resolution — no new fields needed for the happy path.
2. `src/App.tsx`: extend `choose(choiceId: string)` (line 234) to `choose(choiceId: string, playerAnswer?: string)` and forward it in the `api.choose({ runId, choiceId, cardId: choiceId, playerAnswer })` call (line 239).
3. `src/components/GameScreen.tsx`: extend `onChoose` prop type (line 39) to `(choiceId: string, playerAnswer?: string) => Promise<void>`. When `event.dialogue` is present, render the prompt + `<textarea maxLength={dialogue.maxLength}>` with a live counter, a submit button, and the authored shortcut buttons. Submit calls `onChoose("", text)` — the server keys off `event.type === "dialogue"` + presence of `playerAnswer`, so `choiceId` is intentionally empty for typed answers. Shortcuts call `onChoose(shortcut.id)` with no answer (server resolves them without Jev). `event.choices` is empty for dialogue, so guard the card grid.
4. Localize: prompt comes from the server (already localized); add strings for the placeholder, counter, submit label, and shortcut section header (en + es).

**Verify:** `pnpm lint`, `pnpm test`, `pnpm build`.

## Task 2.7 — Phase 2 verification

```bash
pnpm lint
pnpm test
pnpm i18n:check
pnpm build
pnpm db:migrate
```

Manual smoke (with `TYPESAFE_API_KEY` set): serve a dialogue event, submit varied answers, confirm different authored outcomes; unset the key, confirm fallback slot and no crash. Confirm two runs of the same day/coarse state get the same Jev thread pick.

---

# Phase 3 — Authored content

Outcome: real threads + dialogue events with en/es parity and balanced effects.

## Task 3.1 — Author threads and beats

**Files:** create/modify `content/threads/*.json`, `content/events/*.json`.

- Replace `smoke_thread` with 2–4 real threads (3–6 beats each) tied to arcs/regions/flags.
- Beats may reuse existing events as connectors; add new connector/capstone events as needed.
- Every new event: full `en` + `es`, valid `type`, effects from the existing vocabulary.
- Add at least one thread that includes a `dialogue` beat with 3+ interpretations and a `fallback`.

## Task 3.2 — i18n + validation + balance pass

```bash
pnpm i18n:check
pnpm test:server
pnpm lint
```

- Fix any locale parity failures.
- Balance: verify thread rewards and dialogue interpretation deltas sit within existing event effect ranges (compare to `content/events/*.json`). Adjust `GAME_CONFIG` knobs (`threadOpenChance`, `maxThreadsPerRun`, `maxDialogueEventsPerRun`, `dialogueCooldownTurns`) after a playtest.
- Confirm `pnpm build` is green.

---

## Critical files (quick index)

- `shared/types.ts` — `ThreadContent`, `DialogueInterpretation`, `ServedDialogue`, `CharacterState` fields, `EventContent` dialogue fields, `ServedEvent.threadTitle`/`dialogue`.
- `shared/config.ts` — `threadOpenChance`, `threadPace`, `maxThreadsPerRun`, `maxDialogueEventsPerRun`, `dialogueCooldownTurns`, `dialogueMaxLength`.
- `server/content/registry.ts` — thread + dialogue validation.
- `server/engine/engine.ts` — `selectEvent:367`, `buildServedEvent:835`, `resolveSeasonSummary:1112`, `resolveChoice` tail:1437–1473, `advanceThread`, `planThreadOpen`, `resolveDialogue`.
- `server/engine/helpers.ts` — `isEligible:361`, `serveEvent:462`.
- `server/engine/combat/index.ts` — `endCombat` tail.
- `server/engine/jev.ts` (new) + `threadPick.ts` (new).
- `server/store/jevCache.ts` (new); `server/db/schema.sql`.
- `server/routes/game.ts` — `/choose` `playerAnswer`, refine hook on `/state` + `/choose`.
- `src/api.ts`, `src/components/GameScreen.tsx`, `src/components/Hud.tsx`, `src/i18n/strings.ts`.

## Determinism checklist (verify before declaring done)

- [ ] `planThreadOpen` consumes exactly two rng draws when opening, zero when not.
- [ ] The `"which"` draw is consumed even when Jev overrides the winner.
- [ ] Jev cache key excludes run id, turn log, and free text.
- [ ] Same UTC day + same coarse signature → same Jev thread pick.
- [ ] Dialogue resolution never writes `playerAnswer` into served narrative.
- [ ] Server boots and plays with `TYPESAFE_API_KEY` unset.

# Story Threads + Free-Text Dialogue — Design

Date: 2026-09-17

## Problem

Runs feel random: `selectEvent` picks from a large eligible pool via `rng.weighted`. The only continuity is authored `requiresFlag` gates and avoiding the same event twice. Nothing chains, so a run reads as disjoint encounters rather than a coherent storyline.

## Goals

1. Runs read like a story: a main storyline ("thread") with chained beats, plus a coherent arc across the run.
2. Free-text player answers to NPC prompts, where different answers produce different outcomes.
3. PRESERVE the daily-seed determinism promise ("same rolls for everyone that day").

## Non-goals / constraints

- Jev never generates prose. It is a System One model (Choice/Score/Noul + probabilities/confidence only). All text rendered to the player is authored content. Jev only *picks among authored slots*.
- Jev never decides numbers (stat deltas, gold, win/loss). Outcomes are authored and applied by existing code paths.
- All mechanical rolls continue through the per-run seeded `Rng` (`shared/rng.ts`).
- Daily-seed parity holds: any Jev call that could influence a run's content is cached per (UTC date + coarse character signature), so everyone reaching that coarse state that day sees the same result. Fallback to seeded rng on any failure/absence.
- Server keeps running without `TYPESAFE_API_KEY`; the AI layer degrades gracefully.

## Design decisions (agreed)

- Determinism stance: KEEP the promise (threads are authored; Jev is a daily-cached judgment layer off the critical roll path).
- Thread architecture: AUTHORED story threads (chains of beats), one main thread at a time.
- Jev integration depth: Approach 2 — Jev classifies free text AND picks which thread opens (daily-cached).
- Free-text placement: NEW event type `type: "dialogue"` (press_conference stays as-is).
- Rollout in 3 phases (below).

---

## 1. Story threads (authored, deterministic)

### Content

New content directory `content/threads/*.json` (or a single `content/threads.json` — choose whichever fits registry conventions). Each thread:

```jsonc
{
  "id": "ember_crown",
  "minAge": 0,
  "maxAge": 999,
  "requiresArc": ["adventurer", "mercenary"],
  "requiresRegion": null,
  "requiresFlag": null,           // optional gate
  "excludeIfFlag": null,
  "weight": 1,
  "beats": ["ember_whispers", "ember_blood", "ember_throne", "ember_outcome"],
  "reward": { "goldDelta": 0, "fameDelta": 0, "setsFlag": { "ember_crown_done": true } }
}
```

- `beats` is an ordered list of event ids. Events may be existing authored events or new connector/capstone events. The same event id may be reused across beats (e.g. a beat that is a dialogue event).
- Adding a beat event is REQUIRED to be valid: it must exist in the registry and pass the same eligibility checks (i18n parity, choices/dialogue present, etc.). Registry validation throws otherwise.
- `reward` applied when the final beat resolves. Optional.
- Optional per-thread pacing metadata if needed later (default: pacing knob from GAME_CONFIG).

### Character state

Extend `CharacterState` (`shared/types.ts`):

```
activeThread?: { id: string; beatIndex: number } | null
completedThreads?: string[]
```

Optional (legacy-safe, like `seenEventIds`/`turnLog`).

### selectEvent changes (`server/engine/engine.ts:367`)

- When `c.activeThread` is set and the current beat event is not yet resolved:
  - If the beat event is the thread's last beat and it resolves → grant `reward`, clear `activeThread`, push thread id into `completedThreads`.
  - Otherwise the next NORMAL event turn serves the next beat instead of the random pool.
- Scheduled interludes still fire: season summary (turn before season boundary), capstones, tournaments, destiny turns, combat draw (own stream). The story pauses, never corrupts.
- Pacing knob in `GAME_CONFIG`:
  - `threadPace`: "every" (next normal event turn is the beat) vs "every-n" (beat + filler). Default "every" for v1 — coherent back-to-back storyline; filler already exists via interludes. If "every-n": `threadPaceEveryTurns`.

### Thread opening

- Cadence roll on the seeded rng (e.g. `threadOpenChance` per eligible turn, or gated to arc boundaries at first — decide in plan; default: a roll per season boundary or per eligible normal turn).
- When none active, an open roll fires, and eligible threads exist → pick thread (see section 2 for the Jev path). If no eligible thread → no open.
- One main thread at a time. A run may open multiple threads across its life (sequentially).
- Threads can never re-open after completion.

---

## 2. Thread opening selection (Jev Choice, daily-cached)

- When a thread is eligible to open and multiple candidates exist, Jev picks which one fits the character's story so far.
- **State sent to Jev (coarse recap)**: class, archetype, currentArc, home region, fame tier, dominant personality tags, key flags, gold tier. NO run id, NO player free text, NO turn log (cache must be stable across all players that day).
- **Question**: Choice over candidate thread ids.
- **Cache**: key = `sha256(UTC date + canonical JSON of the coarse signature + sorted candidate thread ids)`. Stored in a new `jev_cache` table (see section 5). TTL = end of UTC day.
- **Behavior**: cache hit → use stored pick. Cache miss + key present + API up → call Jev, store, use. Any failure → `rng.weighted` among candidates (existing effectiveWeight logic).
- The seeded rng result is NOT consumed when Jev succeeds (keep run streams deterministic vs. roll consumption — careful: decide whether the rng draw for "open roll" remains the source of *whether* an open happens, and Jev only *which*. The plan must pin this down.)

---

## 3. Free-text dialogue (new `type: "dialogue"` event)

### Content

```jsonc
{
  "id": "ember_queen_answer",
  "type": "dialogue",
  "minAge": 16,
  "maxAge": 999,
  "weight": 1,
  "narrative": { "en": "...", "es": "..." },
  "requiresThread": "ember_crown",        // optional: only appears as a thread beat
  "requiresRelationshipId": "queen_maren",
  "dialoguePrompt": { "en": "The Queen leans in: 'Why should I trust you?'", "es": "..." },
  "maxLength": 300,
  "interpretations": [
    {
      "id": "oath_of_loyalty",
      "tag": "Loyal",
      "statDeltas": { "charisma": 2 },
      "goldDelta": 0,
      "fameDelta": 1,
      "affinityDelta": 5,
      "setsFlag": { "queen_said_oath": true },
      "nextBeat": "ember_throne"          // optional thread branch
    },
    // ... more slots
  ],
  "fallback": "neutral_slot_id"           // used on low confidence / API failure / no key
}
```

Interpretation slot fields reuse the existing effect vocabulary from `ChoiceContent` (statDeltas, tradeoffDeltas, goldDelta, fameDelta, setsFlag, unlocksEventPool, affinityDelta, introducesRelationshipId, joinClanId...). Reuse whatever `resolveChoice` already applies so we don't fork effect application.

### Client (`src/`)

- When served event has `type: "dialogue"`: render prompt + `<textarea>` (max `maxLength`, character counter) instead of (or alongside) choice cards. Provide canned shortcuts ("Say nothing", "Leave") for players who don't want to type — these behave like a normal choice (skip Jev).
- i18n: prompt + canned labels localized.

### Server /choose path (`server/routes/game.ts`)

- `POST /choose` gains optional `playerAnswer: string` for dialogue events (or a dedicated `POST /answer` — decide in plan; reuse /choose preferred).
- Server performs:
  1. Validate event is `type: "dialogue"`, validate input length ≤ `maxLength`.
  2. Call Jev Choice: state = { narrative, dialoguePrompt, playerAnswer }, options = interpretation ids.
  3. Apply outcome mapping from the picked slot via the same effect-application path used by choices.
     - Award the slot's `tag` to `c.personality` (the `choice.tag` mechanism).
     - Apply stat/gold/fame/affinity/flag effects.
     - If `nextBeat` → advance thread beatIndex accordingly.
     - Record in `turnLog`/counters as a normal resolution.
  4. **Never** interpolate player text into served narrative. Player text is only classified.
  5. Mark turn advance + tail (mirror resolveChoice tail: goldPerTurn, stamina, ageUp, etc. — reuse helper).

### Safety net (deterministic + availability)

- Jev disabled (no key) OR dialogue event served but API fails/timeouts → use the `fallback` slot. Turn still resolves.
- Low confidence → use `fallback` slot.
- Context: Jev client returns null on any failure (see section 4); callers decide fallback.

### Cost / trust knobs

- `GAME_CONFIG.maxDialogueEventsPerRun` and `dialogueCooldownTurns` (mirror interactive minigame caps) so free-text stays a treat and cost stays bounded.

---

## 4. Jev client (`server/engine/jev.ts`)

- Single wrapper: `askJev(input: { questions: [...] }): Promise<JevResult | null>`.
- Uses `TYPESAFE_API_KEY` env var. Base URL per docs. Timeout (e.g. 1200ms). No retries (fail fast, fall back).
- Runtime-validates the typed response (choice string, probabilities, confidence) before returning; any mismatch → null.
- All callers handle null → deterministic fallback.
- Fail-closed philosophy: if Jev is required for a *classification* (free text) it falls back to authored `fallback` slot; if used for a pick (thread opening) it falls back to rng.weighted.
- NOTE: exact API request/response shape must be confirmed against https://docs.typesafe.ai/introduction/quickstart during Phase 2 implementation (placeholders TBD in plan — resolve before coding).

---

## 5. Data model

- `characters.active_thread` JSON column (or reuse flags? prefer explicit column), `characters.completed_threads` TEXT[] or JSON.
- New table `jev_cache`:
  ```sql
  CREATE TABLE jev_cache (
    cache_key TEXT PRIMARY KEY,
    choice TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
- Migration in `server/db/schema.sql` + `pnpm db:migrate`.

---

## 6. Client HUD / narrative surface

- Storyline chip on the HUD (like rival focus chip) showing active thread title (localized) when a thread is active.
- Season summary / epilogue reference resolved threads (out of scope for v1 authoring depth — minimally: thread title recorded on the run, surfaced in epilogue "Your Story" if cheap).

---

## 7. Testing

- Registry validation: beats must reference existing events; dialogue rubrics complete (every slot has all required effect fields or a validator default); en/es parity enforced by existing registry + `pnpm i18n:check`.
- Engine: with same seed → same thread opens, same beats served, same completion; interludes don't corrupt; no thread re-open; reward applies once.
- Jev client: mocked (vitest) — success, timeout, invalid shape, missing key.
- Fallback paths: no key → rng.open + dialogue events never served OR fallback slot used; low confidence → fallback slot.
- Free text: never appears in served narrative (assert), length cap enforced, canned shortcut path.
- Two suites as today: `src/**` (vitest root) + `server/**`+`shared/**` (vitest.server.config.ts).

---

## Rollout phases

- **Phase 1 — Threads core (no AI)**: content/thread schema + registry validation, CharacterState fields, selectEvent thread serving, thread opening via seeded rng (no Jev), pacing knob, GAME_CONFIG, db migration (active_thread/completed_threads), client HUD chip, tests. Runnable with zero AI.
- **Phase 2 — Jev client + dialogue events**: jev.ts wrapper, TYPESAFE_API_KEY gating, dialogue event type in types + registry + /choose playerAnswer path, interpretations effect application, fallback slot, cache table, cost knobs, client textarea UI, tests. Confirm exact Jev API shape from docs first.
- **Phase 3 — Authored content**: author threads + dialogue events (en/es), add connector/capstone beats, i18n:check parity pass, balance pass.

Phase 1 must leave the game fully playable/deterministic without Jev (current behavior + threads). Phases 2/3 layer the AI and content on top. Each phase independently verifyable (pnpm lint, pnpm test, pnpm i18n:check, pnpm build).
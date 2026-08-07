# Press Conference Minigame — Design Spec

> Roadmap item 2 (`docs/roadmap.md` → "2. `press_conference` minigame subtype").
> Spec ref: `docs/fantasy-cyoa-rpg-spec.md` §Personality/response system.
> El Ídolo ref: `docs/el-idolo-reference-notes.md` §7 (press conference minigame).

## Goal

Ship the `press_conference` minigame: a press room where an interviewer asks 3
sequential questions, each offering 4 personality-tag answers. The "correct"
(read: favored) answer is a hidden target partially shaped by the player's
accumulated tag history (`computeTagSynergy`) and their fame / primary stat
(Charisma in the El Ídolo "Liderazgo" model). A graduated reveal scores each of
the 3 answers and maps to the standard tier pipeline. All draws deterministic
through the per-run seeded `Rng`.

## Scoping (per user)

- Multi-move interactive model (like memotest / rps), not a single-roll
  `MinigameSubtype` patch to `resolveMinigame()`.
- Stats **and** tag history co-shape the hidden target.
- Engine + 1–2 authored events.

## Architecture

**Model**: `press_conference` is an `InteractiveGameKind`, not a new
`MinigameSubtype`. It is served as an interactive game frame and resolved over
`/api/game/minigame-move` through the standard outcome pipeline. No change to
`resolveMinigame()`.

### Types (`shared/types.ts`)

- `InteractiveGameKind`: add `"press_conference"`.
- `InteractiveMove`: add `| { kind: "press_conference"; cardIndex: number }`.
- `PendingMinigameState`: add a press_conference branch:
  - `questions?: PressQuestion[]` (server-loaded authored questions),
  - `answers?: number[]` (player's chosen option index per question, 3 max),
  - `dimensions?: PressQuestionTarget[]` (the per-question hidden targets).
- New `PressQuestion` / `PressTagOption` / `PressTarget` types for authored
  content and served views (language-neutral keys; localized at serve time).

### Content shape (`content/minigames/press_conference.json`)

Each event is an `EventContent` with `type: "minigame"`, a new `subtype:
"press_conference"`, `primaryStat: "charisma"`, and `resolution`:

```json
{
  "type": "interactive",
  "game": "press_conference",
  "baseWinChance": 0.5,
  "statInfluence": { "charisma": 0.012 }
}
```

Plus a new authored field, `questions` (overridable per event, default 3):

```json
"questions": [
  {
    "id": "q1",
    "prompt": { "en": "...", "es": "..." },
    "options": [
      { "id": "opt_a", "icon": "trophy", "tag": "Humble",
        "wantedTags": { "Humble": 1 },     "punishedTags": { "Cocky": 0.5 } },
      { "id": "opt_b", "icon": "flame", "tag": "Cocky",
        "wantedTags": { "Cocky": 1 },      "punishedTags": { "Humble": 0.5 } },
      { "id": "opt_c", "icon": "gem",  "tag": "Confident",
        "wantedTags": { "Confident": 1 } },
      { "id": "opt_d", "icon": "scroll","tag": "Strategic",
        "wantedTags": { "Strategic": 1 } }
    ]
  },
  { "id": "q2", "prompt": {...}, "options": [...] },
  { "id": "q3", "prompt": {...}, "options": [...] }
]
```

- Options reuse the `wantedTags` / `punishedTags` `Partial<Record<PersonalityTag,
number>>` shape already on `ChoiceContent` (types.ts:259).
- Fracture pool is a dedicated small tag subset per question (El Ídolo §7:
  Humilde / Cocky / Confident / Formal-style) — authored, not a full-roster draw.
- `outcomes` uses the standard `OutcomeTier` map (`critical` / `success` /
  `partial` / `fail`), each with the usual delta set + `narrative`.

### Engine (`server/engine/minigames/pressConference.ts` — new)

Mirror the `rps.ts` / `memotest.ts` surface:

- `createPressState(eventId, questions)` → `PendingMinigameState`.
- `press$` helpers: `pressOver(state)`, `pressResult(state)`, `applyPressAnswer`
  `pressTarget(state)`.
- Hidden target per question is computed server-side with the run Rng:
  1. Per-option synergy from `computeTagSynergy(c, option)` (engine.ts:1070).
  2. Stat tilt: `c.fame` and `c[primaryStat]` weight the distribution (El Ídolo
     "tu liderazgo y tu fama pesan …")
  3. Normalize the 4-option weights → `Rng`-devised target.

Wire into the switch points in `server/engine/minigames/index.ts`:
`createInteractiveState`, `interactiveView`, `applyInteractiveMove`,
`interactiveTier`, and export the new helpers.

### Gating & serving

- Eligibility: press_conference rides the existing interactive per-run cap
  (`maxInteractiveMinigamesPerRun: 3`) + cooldown
  (`interactiveMinigameCooldownTurns: 20`, engine.ts:357-402). Treat
  `resolution.game === "press_conference"` as interactive there.
- `serveEvent` (helpers.ts:373) already branches on `resolution?.type ===
"interactive"`; the interactive branch builds the frame via
  `prepareInteractiveServe` → `createInteractiveState`. Extend
  `createInteractiveState` (minigames/index.ts:51) to return
  `createPressState` when `game === "press_conference"`.
- `/minigame-move` (routes/game.ts:489) already validates
  `resolution.type === "interactive"` + `pendingMinigame`, dispatches
  `applyInteractiveMove`, and on `over` runs `interactiveTier` +
  `applyMinigameOutcome`. press_conference rides this unchanged.

### Client (`src/components/minigames/PressConferenceGame.tsx` — new)

- Mirrors `RpsGame` / `MemotestGame`; renders the 3-question pager with 4
  tag-option buttons (localized via `personality_tag_<Tag>` + option prompt).
- After the last answer: a reveal marking each answer ✅/❌ against the hidden
  target, then graduated outcome → Continue.
- Wire into `MinigameFrame.tsx` for the `playing` and `finished` branches.

### i18n

- Add `personality_tag_*` re-use plus press-conference frame strings (question
  N of 3, result-once bar, etc.) to `src/i18n/strings.ts` — both `en` and `es`
  non-empty (registry throws otherwise). Run `pnpm i18n:check` after edits.

### Registry validation (`server/content/registry.ts`)

- Extend startup validation for press_conference events: exactly a `questions`
  array, every question has a `prompt` (bilingual) + exactly 4 `options`, each
  option has `id` / `tag` / `wantedTags` or `punishedTags`; throws on malformed
  data (same philosophy as repo's throw-on-bad-data).

## Determinism / verification

- Every draw through the per-run seeded `Rng`; never `Math.random`. Daily
  runs share the daily seed (spec §RNG & determinism).
- Every new `LocaleMap` needs non-empty `en` AND `es`.
- Tests: `engine.test.ts` + `pressConference.test.ts` cover
  determinism-as-invariant (same seed + same inputs → same tier), stat &
  tag-history target shifting, 0/1/2/3 correct → fail/partial/success/critical,
  the reveal, and a full `/minigame-move` round trip.
- `pnpm test:src` + `pnpm test:server` green; `pnpm i18n:check` passes.

## Out of scope (first cut)

- `Sin Filtro` 3/3 achievement wiring (future content).
- Capstone variant vs a regular interactive minigame.
- A `rivals` table + parallel RNG stream (roadmap item 4).

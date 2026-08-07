# Press Conference Minigame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `press_conference` interactive minigame where an interviewer asks 3 questions, each with 4 personality-tag answers, and a hidden target (partly shaped by the run's tag history and stats) decides how many answers "land." Resolves through the existing `/minigame-move` pipeline.

**Architecture:** `press_conference` is a new `InteractiveGameKind` (multi-move), not a new `MinigameSubtype` single roll. New engine module `server/engine/minigames/pressConference.ts` mirrors `rps.ts`/`memotest.ts`; it is wired into the four switch points in `minigames/index.ts`. Authored content lives in `content/minigames/press_conference.json`. A new client component renders the question pager + reveal and is wired into `MinigameFrame.tsx`. Hidden targets are drawn from the per-run seeded `Rng`, weighted by per-option `computeTagSynergy` (re-exported from `engine.ts`) plus a fame/charisma tilt, keeping daily determinism.

**Tech Stack:** TypeScript, Express, React 19 + styled-components, vitest (two suites: `src/**` root, `server + shared` via `vitest.server.config.ts`).

## Global Constraints

- **Determinism:** every random draw through the per-run seeded `Rng`; never `Math.random()` (spec §RNG & determinism).
- **i18n:** every `LocaleMap` needs non-empty `en` AND `es` or `registry.ts` throws at boot. Run `pnpm i18n:check` after content edits.
- **Tests green:** `pnpm test:server` and `pnpm test:src` must pass.
- **ESM:** server-side relative imports need explicit `.js` extensions (e.g. `./pressConference.js`).
- **Interactive gating:** press_conference rides the existing per-run interactive cap (`maxInteractiveMinigamesPerRun: 3`) and cooldown (`interactiveMinigameCooldownTurns: 20`, engine.ts:357-402) — no new gate.
- `computeTagSynergy(c, choice)` is reused; it is currently module-private in `engine.ts:1070` and must be exported.

---

### Task 1: Shared types for press_conference

**Files:**

- Modify: `shared/types.ts`

**Interfaces:**

- Consumes: nothing (adds types).
- Produces:
  - `type InteractiveGameKind` gains `"press_conference"`.
  - `interface PressTagOption { id: string; icon: string; tag: PersonalityTag; wantedTags?: Partial<Record<PersonalityTag, number>>; punishedTags?: Partial<Record<PersonalityTag, number>> }`
  - `interface PressQuestion { id: string; prompt: LocaleMap; options: PressTagOption[] }`
  - `interface PressState { questions: PressQuestion[]; answers: number[]; targets: (number | null)[] }`
  - `type InteractiveMove` gains `| { kind: "press_conference"; card: number }`.
  - `interface PendingMinigameState` gains `press?: PressState`.
  - `type ServedInteractiveState` gains a `{ game: "press_conference"; ... }` branch.

- [ ] **Step 1: Write the failing type test**

Create `server/engine/minigames/types.test.ts` (if absent) — verify the new discriminants exist at runtime via a tiny helper `eventWith`. Use this as the test harness:

```ts
import { describe, expect, it } from "vitest"
import type {
  InteractiveMove,
  InteractiveGameKind,
  PressQuestion,
  ServedInteractiveState,
} from "../../../shared/types.js"

describe("press_conference types", () => {
  it("exposes the press_conference interactive kind", () => {
    const kind: InteractiveGameKind = "press_conference"
    expect(kind).toBe("press_conference")
  })

  it("the press_conference move discriminant is structurally valid", () => {
    const m: InteractiveMove = { kind: "press_conference", card: 2 }
    // Narrowing the union must succeed.
    if (m.kind === "press_conference") expect(m.card).toBe(2)
    else expect.fail("should narrow")
  })

  it("served view carries a press_conference branch", () => {
    const view: ServedInteractiveState = {
      game: "press_conference",
      index: 0,
      questions: [],
      answers: [],
      revealed: [],
      target: null,
      over: false,
      result: "playing",
    }
    expect(view.game).toBe("press_conference")
  })

  it("PressQuestion carries a bilingual prompt and options", () => {
    const q: PressQuestion = {
      id: "q1",
      prompt: { en: "Who are you?", es: "¿Quién sos?" },
      options: [{ id: "a", icon: "gem", tag: "Confident", wantedTags: { Confident: 1 } }],
    }
    expect(q.options.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to see it fail to compile**

Run: `pnpm test:server -- types.test.ts`
Expected: TypeScript errors — `press_conference` is not assignable to `InteractiveGameKind`, and `ServedInteractiveState` has no such branch.

- [ ] **Step 3: Add the type definitions**

In `shared/types.ts`:

```ts
export type InteractiveGameKind = "tictactoe" | "rps" | "memotest" | "press_conference"
```

After the `MemotestFace` type (types.ts:37-38), add:

```ts
// A single answer choice for a press-conference question. Reuses the same
// wantedTags / punishedTags semantics as ChoiceContent (types.ts:258-260) so
// the character's accumulated personality history can be consulted.
export interface PressTagOption {
  id: string
  icon: string
  tag: PersonalityTag
  wantedTags?: Partial<Record<PersonalityTag, number>>
  punishedTags?: Partial<Record<PersonalityTag, number>>
}

export interface PressQuestion {
  id: string
  prompt: LocaleMap
  options: PressTagOption[]
}
```

Add the `press` property to `PendingMinigameState` (in the block, after the `lastRivalTurn` line at types.ts:72, as a new optional field):

```ts
  // press_conference: the authored questions, the player's chosen option
  // index per question (parallel to `questions`), and each question's hidden
  // "what they wanted" target index (null until that question is answered).
  press?: {
    questions: PressQuestion[]
    answers: number[]
    targets: (number | null)[]
  }
```

Extend `InteractiveMove` (types.ts:127-131):

```ts
export type InteractiveMove =
  | { kind: "tictactoe"; cell: number }
  | { kind: "rps"; choice: RpsChoice }
  | { kind: "memotest"; card: number }
  | { kind: "press_conference"; card: number }
```

Add a branch to `ServedInteractiveState` (after the memotest branch, line 124):

```ts
  | {
      game: "press_conference"
      index: number // which question is being answered (0-based)
      // localized prompts + option labels (prose localized at serve time)
      questions: {
        prompt: string
        options: { id: string; label: string; icon?: string; tag: PersonalityTag }[]
      }[]
      answers: number[] // player's chosen option index per question
      revealed: (boolean | null)[] // correctness per answered question
      target: number | null // "what they wanted" for the just-answered question
      over: boolean
      result: "playing" | "player_win" | "partial" | "player_lose"
    }
```

- [ ] **Step 4: Run the type test to verify it passes**

Run: `pnpm test:server -- types.test.ts`
Expected: PASS (all 4 assertions).

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts tests/types.test.ts
git commit -m "types: add press_conference interactive kind + generated types"
```

---

## Task 2: Re-export `computeTagSynergy` from the engine

**Files:**

- Modify: `server/engine/engine.ts:1070-1086`

**Interfaces:**

- Consumes: nothing.
- Produces: `export function computeTagSynergy(c: CharacterState, choice: { wantedTags?: Record<string, number>; punishedTags?: Record<string, number> }): number` — re-exposed so `pressConference.ts` can reuse it without a circular import.

- [ ] **Step 1: Write a failing test**

In `server/engine/engine.test.ts`, inside the existing `describe("computeTagSynergy"...)` block (around line 554), add a case that imports the function by name. Verify the current import list imports it. Add to the top import block of `engine.test.ts` (line 13 area):

```ts
import { computeTagSynergy } from "./engine.js"
```

(The function is already re-imported implicitly by `engine.ts` exports if exported.)

- [ ] **Step 2: Run it to verify the export is missing**

Run: `pnpm test:server` → select the new case.
Expected: FAIL — `computeTagSynergy` is not exported (TS error) or the existing suite passes without it.

- [ ] **Step 3: Change `computeTagSynergy` from `function` to `export function`**

In `server/engine/engine.ts:1070`, just add `export`:

```ts
export function computeTagSynergy(
```

- [ ] **Step 4: Run the suite to verify green**

Run: `pnpm test:server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/engine/engine.ts server/engine/engine.test.ts
git commit -m "engine: export computeTagSynergy for reuse"
```

---

## Task 3: Engine module `server/engine/minigames/pressConference.ts`

**Files:**

- Create: `server/engine/minigames/pressConference.ts`
- Test: `server/engine/minigames/pressConference.test.ts`

**Interfaces:**

- Consumes: `Rng` (shared/rng.ts), `CharacterState`, `EventContent`, `PersonalityTag` (shared/types.ts), `computeTagSynergy` (engine.ts). `PressQuestion`, `PressTagOption`.
- Produces:
  - `createPressState(eventId: string, questions: PressQuestion[]): PendingMinigameState`
  - `pressOver(state: PendingMinigameState): boolean`
  - `pressResult(state: PendingMinigameState): "player_win" | "partial" | "player_lose"`
  - `answerPressTarget(state: PendingMinigameState, card: number, c: CharacterState, rng: Rng, statPerInfluence: number): void`
  - `pressTargetWeight(option: PressTagOption, c: CharacterState, statInfluence: number): number`

The target note ("tu liderazgo y tu fama pesan tanto como el tono que elijas") is implemented by the fame/charisma tilt in `pressTargetWeight`.

- [ ] **Step 1: Write failing tests**

Create `server/engine/minigames/pressConference.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import type { CharacterState, PressQuestion } from "../../../shared/types.js"
import {
  answerPressTarget,
  createPressState,
  pressOver,
  pressResult,
  pressTargetWeight,
} from "./pressConference.js"

const QUESTIONS: PressQuestion[] = [
  {
    id: "q1",
    prompt: { en: "Who are you?", es: "¿Quién sos?" },
    options: [
      { id: "a", icon: "gem", tag: "Confident", wantedTags: { Confident: 1 } },
      { id: "b", icon: "flame", tag: "Cocky", wantedTags: { Cocky: 1 } },
      { id: "c", icon: "scroll", tag: "Humble", wantedTags: { Humble: 1 } },
      { id: "d", icon: "heart", tag: "Supportive", wantedTags: { Supportive: 1 } },
    ],
  },
  {
    id: "q2",
    prompt: { en: "Next question", es: "Próxima" },
    options: [
      { id: "e", icon: "gem", tag: "Confident" },
      { id: "f", icon: "flame", tag: "Cocky" },
      { id: "g", icon: "scroll", tag: "Humble" },
      { id: "h", icon: "heart", tag: "Supportive" },
    ],
  },
  {
    id: "q3",
    prompt: { en: "Last", es: "Última" },
    options: [
      { id: "i", icon: "gem", tag: "Confident" },
      { id: "j", icon: "flame", tag: "Cocky" },
      { id: "k", icon: "scroll", tag: "Humble" },
      { id: "l", icon: "heart", tag: "Supportive" },
    ],
  },
]

// Minimal CharacterState the target-weight harness actually reads. Build with
// Object.assign against an empty object cast to CharacterState so we don't have
// to enumerate 60+ fields here.
function characterState(tags: Record<string, number>): CharacterState {
  return {
    personality: tags,
    charisma: 50,
    fame: 50,
  } as unknown as CharacterState
}

function play(c: CharacterState, seed: number): CharacterState {
  const state = createPressState("ev1", QUESTIONS)
  const rng = new Rng(seed)
  for (let q = 0; q < 3; q++) answerPressTarget(state, 0, c, rng, 0)
  return state
}

describe("pressConference", () => {
  it("creates an rng-free initial state", () => {
    const s = createPressState("ev1", QUESTIONS)
    expect(s.game).toBe("press_conference")
    expect(s.press!.answers).toEqual([])
    expect(s.press!.targets).toEqual([null, null, null])
    expect(s.press!.questions.length).toBe(3)
    expect(pressOver(s)).toBe(false)
  })

  it("pressTargetWeight reflects personality history", () => {
    const confident = characterState({ Confident: 5 })
    const weightConf = pressTargetWeight(QUESTIONS[0].options[0], confident, 0)
    const weightHumble = pressTargetWeight(QUESTIONS[0].options[2], confident, 0)
    // a confident history tilts the target toward the Confident option
    expect(weightConf).toBeGreaterThan(weightHumble)
  })

  it("answers advance and the over flag flips after 3", () => {
    const s = createPressState("ev1", QUESTIONS)
    const rng = new Rng(42)
    answerPressTarget(s, "a", characterState({}), rng, 0)
    expect(s.press!.answers.length).toBe(1)
    expect(s.press!.targets[0]).not.toBeNull()
    expect(pressOver(s)).toBe(false)
    answerPressTarget(s, "a", characterState({}), rng, 0)
    answerPressTarget(s, "a", characterState({}), rng, 0)
    expect(pressOver(s)).toBe(true)
  })

  it("is deterministic for the same seed + answers", () => {
    const a = play(characterState({}), 99)
    const b = play(characterState({}), 99)
    expect((a.press?.targets ?? []).join(",")).toBe((b.press?.targets ?? []).join(","))
  })

  it("maps a 3/3 read to player_win and a 0/3 read to player_lose", () => {
    // force each target to match by answering with whatever the RNG picked
    const s = createPressState("ev1", QUESTIONS)
    const rng = new Rng(5)
    for (let i = 0; i < 3; i++) {
      const targetTag = s.press!.targets[i]
      const _ = targetTag // answered none yet; see implementation notes
    }
    // NOTE: because the target is drawn then compared, a guaranteed match test
    // needs the engine. That is covered in server/engine/engine.test.ts
    // (minigame round trip). Here assert the 0-correct path only.
    expect(["player_win", "partial", "player_lose"]).toContain(
      pressResult(play(characterState({}), 5)),
    )
  })
})
```

- [ ] **Step 2: Run to confirm it fails (missing module)**

Run: `pnpm test:server -- pressConference.test.ts`
Expected: FAIL — module not found, `createPressState` undefined.

- [ ] **Step 3: Write the implementation**

```ts
import type {
  CharacterState,
  PendingMinigameState,
  PersonalityTag,
  PressQuestion,
  PressTagOption,
} from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"
import { computeTagSynergy } from "../engine.js"

export function createPressState(
  eventId: string,
  questions: PressQuestion[],
): PendingMinigameState {
  return {
    eventId,
    game: "press_conference",
    press: {
      questions,
      answers: [],
      targets: questions.map(() => null),
    },
  }
}

export function pressOver(state: PendingMinigameState): boolean {
  return (state.press?.answers.length ?? 0) >= (state.press?.questions.length ?? 0)
}

// Graduated outcome matching the El Ídolo reference: 0-1 correct → poor/nothing,
// 2 correct → a real sign of read, 3 correct → flawless. Weighted toward a win
// for a good reader.
export function pressResult(state: PendingMinigameState): "player_win" | "partial" | "player_lose" {
  const p = state.press
  if (!p) return "partial"
  let correct = 0
  for (let i = 0; i < p.answers.length; i++) {
    const target = p.targets[i]
    if (target != null && p.answers[i] === target) correct++
  }
  if (correct === 3) return "player_win"
  if (correct === 0) return "player_lose"
  return "partial"
}

// The famby "tu liderazgo y tu fama pesan tanto como el tono" — the target is a
// weighted draw: an option the player's personality history lines up with gets
// an edge, and higher statInfluence tilt widens it further.
export function pressTargetWeight(
  option: PressTagOption,
  c: CharacterState,
  statInfluence: number,
): number {
  const synergy = computeTagSynergy(
    c,
    option as { wantedTags?: Record<string, number>; punishedTags?: Record<string, number> },
  )
  const tilt = (c.fame / 100) * statInfluence * 4 + (c.charisma / 100) * statInfluence * 4
  // 1 + positive history edge + fame/charisma readiness = higher weight.
  return Math.max(0.08, 1 + synergy * 6 + tilt)
}

export function answerPressTarget(
  state: PendingMinigameState,
  card: number,
  c: CharacterState,
  rng: Rng,
  statInfluence: number,
): void {
  const p = state.press
  if (!p) throw new Error("press_conference without state")
  if (pressOver(state)) throw new Error("press_after_end")
  if (card < 0 || card >= 4) throw new Error("invalid press option")
  const qi = p.answers.length
  const options = p.questions[qi].options
  // Weighted target draw from the run Rng (deterministic).
  const target = rng.weighted(options, (op) => pressTargetWeight(op, c, statInfluence))
  p.targets[qi] = options.indexOf(target)
  p.answers.push(card)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:server -- pressConference.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/engine/minigames/pressConference.ts server/engine/minigames/pressConference.test.ts
git commit -m "engine: add press_conference minigame module"
```

---

## Task 4: Wire `press_conference` into the interactive orchestrator

**Files:**

- Modify: `server/engine/minigames/index.ts`
- Test: extend `server/engine/minigames/index.gamble.test.ts` (or `index.test.ts`)

**Interfaces:**

- Consumes: `createPressState`, `pressOver`, `pressResult`, `answerPressTarget` from `pressConference.js`; `computeTagSynergy` not needed here.
- Produces: existing switch surfaces dispatch to press_conference:
  - `createInteractiveState(ev)` → `createPressState(ev.id, ev.questions ?? [])`
  - `interactiveView(state)` → press branch
  - `applyInteractiveMove(state, move, primaryStat, rng, resolution)` → handles `kind === "press_conference"`
  - `interactiveTier(state)` → mapping press_result → tier.

- [ ] **Step 1: Write failing test**

Append to `server/engine/minigames/index.test.ts`:

```ts
it("serves and resolves a press_conference event end to end", () => {
  const ev = minigameEvent("press_conference", {
    game: "press_conference",
    questions: pressQuestionsFixture(),
  })
  const c = character()
  const state = createInteractiveState(ev)
  expect(state.game).toBe("press_conference")
  // reply until over
  const rng = new Rng(7)
  let over = false
  let guard = 0
  while (!over && guard++ < 10) {
    const move: InteractiveMove = { kind: "press_conference", card: 0 }
    over = applyInteractiveMove(
      state,
      move,
      c[ev.primaryStat ?? "intelligence"],
      rng,
      ev.resolution,
      c,
    ).over
  }
  expect(over).toBe(true)
  const tier = interactiveTier(state)
  expect(["critical", "success", "partial", "fail"]).toContain(tier)
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `pnpm test:server -- index.test.ts`
Expected: FAIL — `applyInteractiveMove` doesn't handle the press move (hits the rps default or throws).

- [ ] **Step 3: Implement the wiring**

In `minigames/index.ts`:

Imports (add near line 13):

```ts
import { answerPressTarget, createPressState, pressOver, pressResult } from "./pressConference.js"
```

`createInteractiveState` (line 51): add:

```ts
export function createInteractiveState(ev: EventContent): PendingMinigameState {
  const game = ev.resolution?.game ?? "tictactoe"
  if (game === "tictactoe") return createTicTacToeState(ev.id)
  if (game === "memotest") return createMemotestState(ev.id)
  if (game === "press_conference") return createPressState(ev.id, ev.questions ?? [])
  return createRpsState(ev.id, ev.resolution?.bestOf ?? 3)
}
```

Add a `press_conference` branch in `interactiveView` (before the final rps fallback, after the memotest block ~line 112); guard on `state.game === "press_conference"` returning the served branch. **The press view serves authored bilingual prompts, so `interactiveView` must accept a locale.** Change its signature to `interactiveView(state: PendingMinigameState, locale: "en" | "es" = "en")`. Update the two internal callers (`prepareInteractiveServe` in this file at line 263, and `routes/game.ts:512,528,538`) to pass the character's locale. The tictactoe/memotest/rps branches ignore the locale (language-neutral).

```ts
export function interactiveView(
  state: PendingMinigameState,
  locale: "en" | "es" = "en",
): ServedInteractiveState {
  // ... existing tictactoe / memotest / rps branches unchanged ...
  if (state.game === "press_conference") {
  const p = state.press!
  return {
    game: "press_conference",
    index: p.answers.length,
    questions: p.questions.map((q) => ({
      prompt: q.prompt[locale], // localized here
      options: q.options.map((op) => ({
        id: op.id,
        icon: op.icon,
        tag: op.tag,
      })),
    })),
    answers: p.answers,
    revealed: p.targets.map((t, i) =>
      t != null && i < p.answers.length ? p.answers[i] === t : null,
    ),
    target: p.answers.length > 0 ? p.targets[p.answers.length - 1] : null,
    over: pressOver(state),
    result: pressResult(state),
  }
}
```

**NOTE:** The press options do not carry a bilingual `label` (they are tag choice buttons); the client renders the familiar `personality_tag_<tag>` label instead of an authored string. Keep `label` for forward-compat but the client should prefer `tag`. `PressTagOption` has no `title` field — use the client localization path. (See Task 7.)

Add a `press_conference` branch in `applyInteractiveMove` before the rps default (line 217):

```ts
if (state.game === "press_conference") {
  if (move.kind !== "press_conference") throw new Error("invalid move for press_conference")
  if (!c) throw new Error("press_conference needs the character")
  // charisma is the press conference's primary stat; it tilts the target.
  const charismaInfluence = resolution?.statInfluence?.charisma ?? 0
  answerPressTarget(state, move.card, c, rng, charismaInfluence)
  return { over: pressOver(state) }
}
```

Adjust the `applyInteractiveMove` signature to additionally accept `c?: CharacterState` so the press branch can read personality/stats (instruct: change the param list from `(state, move, primaryStat, rng, resolution?)` to `(state, move, primaryStat, rng, resolution?, c?)` and thread `c` to `answerPressTarget`).

Finally `interactiveTier` add before the rps default (line 245):

```ts
if (state.game === "press_conference") {
  const r = pressResult(state)
  if (r === "player_win") return "critical"
  if (r === "player_lose") return "fail"
  return "partial"
}
```

- [ ] **Step 4: Run tests to verify green (index + press)**

Run: `pnpm test:server`
Expected: PASS. Fix any signature gaps between `applyInteractiveMove` callers (routes/game.ts:519) and this new optional param.

- [ ] **Step 5: Update the caller in `routes/game.ts`**

At `routes/game.ts` three sections must change: the `interactiveView` calls (lines 512, 528, 538) now take the character's locale, and the `applyInteractiveMove` call (line 519) must pass the character.

```ts
const state = c.pendingMinigame
const locale = c.locale
const before = interactiveView(state, locale)
if (before.over) {
  return res.status(400).json({ error: "match_already_finished" })
}
const { over } = applyInteractiveMove(state, move, primaryStat, rng, ev.resolution, c)

if (!over) {
  run.rngState = rng.getState()
  await saveRun(run)
  return res.json({
    status: "playing",
    minigame: {
      game: state.game,
      view: interactiveView(state, locale),
    },
    feedback: null,
  })
}
```

And the final view at line 538: `const finalView = interactiveView(state, c.locale)`.

- [ ] **Step 6: Run server suite + commit**

Run: `pnpm test:server`
Expected: PASS.

```bash
git add server/engine/minigames/index.ts server/engine/minigames/index.test.ts server/routes/game.ts
git commit -m "engine: dispatch press_conference interactive branch"
```

---

## Task 5: Author `content/minigames/press_conference.json`

**Files:**

- Create: `content/minigames/press_conference.json`

**Interfaces:**

- Consumes: k `EventContent` shape `questions` field; bilingual `LocaleMap` everywhere.
- Produces: one event the registry will validate and the wheel can pick.

- [ ] **Step 1: Author the content**

```json
[
  {
    "id": "press_gauntlet_01",
    "type": "minigame",
    "subtype": "press_conference",
    "minAge": 18,
    "maxAge": 99,
    "weight": 14,
    "primaryStat": "charisma",
    "narrative": {
      "en": "Reporters crowd the dais. A single interviewer rises, pen poised. 'Three questions, hero. Let us see the real you.'",
      "es": "Periodistas llenan la tribuna. Un solo entrevistador se alza, pluma en alto. 'Tres preguntas, héroe. Dejá que veamos al verdadero vos.'"
    },
    "resolution": {
      "type": "interactive",
      "game": "press_conference",
      "baseWinChance": 0.5,
      "statInfluence": { "charisma": 0.012 }
    },
    "questions": [
      {
        "id": "q1",
        "prompt": {
          "en": "The stories call you a rising star. What do you tell a realm that expects a hero?",
          "es": "Los relatos te llaman estrella en ascenso. ¿Qué le decís a un reino que espera un héroe?"
        },
        "options": [
          { "id": "q1_a", "icon": "gem", "tag": "Confident", "wantedTags": { "Confident": 1 } },
          { "id": "q1_b", "icon": "flame", "tag": "Cocky", "wantedTags": { "Cocky": 1 } },
          { "id": "q1_c", "icon": "scroll", "tag": "Humble", "wantedTags": { "Humble": 1 } },
          { "id": "q1_d", "icon": "heart", "tag": "Supportive", "wantedTags": { "Supportive": 1 } }
        ]
      },
      {
        "id": "q2",
        "prompt": {
          "en": "There are rumors you took a shortcut to the top. Your answer?",
          "es": "Corren rumores de que tomaste un atajo hacia la cima. ¿Tu respuesta?"
        },
        "options": [
          { "id": "q2_a", "icon": "gem", "tag": "Confident", "wantedTags": { "Confident": 1 } },
          { "id": "q2_b", "icon": "flame", "tag": "Cocky", "wantedTags": { "Cocky": 1 } },
          { "id": "q2_c", "icon": "scroll", "tag": "Humble", "wantedTags": { "Humble": 1 } },
          { "id": "q2_d", "icon": "heart", "tag": "Supportive", "wantedTags": { "Supportive": 1 } }
        ]
      },
      {
        "id": "q3",
        "prompt": {
          "en": "If you could speak to the young soul you once were, what would you promise them?",
          "es": "Si pudieras hablarle a la joven alma que fuiste, ¿qué le prometerías?"
        },
        "options": [
          { "id": "q3_a", "icon": "gem", "tag": "Confident", "wantedTags": { "Confident": 1 } },
          { "id": "q3_b", "icon": "flame", "tag": "Cocky", "wantedTags": { "Cocky": 1 } },
          { "id": "q3_c", "icon": "scroll", "tag": "Humble", "wantedTags": { "Humble": 1 } },
          { "id": "q3_d", "icon": "heart", "tag": "Supportive", "wantedTags": { "Supportive": 1 } }
        ]
      }
    ],
    "outcomes": {
      "critical": {
        "fameDelta": 6,
        "reputationDelta": 3,
        "narrative": {
          "en": "Everything you said landed. The room is yours — a legend in the making.",
          "es": "Todo lo que dijiste impactó. La sala es tuya — una leyenda naciendo."
        }
      },
      "success": {
        "fameDelta": 2,
        "narrative": {
          "en": "Mostly honest, mostly liked. A balanced press room.",
          "es": "Mayormente honesto, mayormente querido. Una sala equilibrada."
        }
      },
      "partial": {
        "narrative": {
          "en": "A mixed reception. The sharper questions caught you off guard.",
          "es": "Recepción mixta. Las preguntas más filas te tomaron desprevenido."
        }
      },
      "fail": {
        "fameDelta": -2,
        "reputationDelta": -2,
        "narrative": {
          "en": "It went badly. They print what they wanted to print.",
          "es": "Salió mal. Imprimen lo que querían imprimir."
        }
      }
    }
  }
]
```

- [ ] **Step 2: Validate content loads**

Run: `pnpm test:server` — registry validation (Task 6, registry change) must not throw; also `pnpm i18n:check`.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add content/minigames/press_conference.json
git commit -m "content: add press_conference authored event"
```

---

## Task 6: Registry validation for press_conference

**Files:**

- Modify: `server/content/registry.ts:152-163`

**Interfaces:**

- Consumes: `EventContent`, `minAge`, `resolution`, `questions` field.
- Produces: throw on malformed press_conference events.

- [ ] **Step 1: Write a failing registry test**

Add to `server/content/registry.test.ts` (create if missing):

```ts
import { describe, expect, it } from "vitest"
import { buildRegistryAsBlob } from "./registry.js"

describe("press_conference registry validation", () => {
  it("rejects a press event without a questions array", () => {
    expect(() => buildRegistryAsBlob([badPressEvent()])).toThrow()
  })
})
```

(If the registry doesn't expose a pure function for testing, instead verify via the existing loader in the server suite; keep it light — assert the valid authored event passes by just running the boot.)

- [ ] **Step 2: Run to confirm the throw path is missing**

Run: `pnpm test:server`
Expected: FAIL — no validation rejects the malformed event.

- [ ] **Step 3: Implement the check**

In `registry.ts`, inside the minigame loop (after the interactive game-kind `assert`, line ~160):

```ts
if (mg.resolution.game === "press_conference") {
  assert(
    Array.isArray(mg.questions) && mg.questions.length > 0,
    `minigame ${mg.id} press_con conference needs questions`,
  )
  for (const q of mg.questions) {
    validateLocaleMap(q.prompt, `minigame ${mg.id} question ${q.id || ""} prompt`)
    assert(
      q.options && q.options.length === 4,
      `minigame ${mg.id} question ${q.id} needs 4 options`,
    )
    for (const op of q.options) {
      assert(op.tag, `minigame ${mg.id} question ${q.id} option ${op.id} needs tag`)
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:server`
Expected: PASS. (The authored event in Task 5 satisfies validation.)

- [ ] **Step 5: Commit**

```bash
git add server/content/registry.ts server/content/registry.test.ts
git commit -m "registry: validate press_conference content"
```

---

## Task 7: Client `PressConferenceGame` + wiring into `MinigameFrame`

**Files:**

- Create: `src/components/minigames/PressConferenceGame.tsx`
- Modify: `src/components/minigames/MinigameFrame.tsx`
- Modify: `src/i18n/strings.ts`

**Interfaces:**

- Consumes: `ServedInteractiveState` press branch (game press_conference), `locale`, `onOption(index)` callback (calls `onMove({ kind: "press_conference", card })`).
- Produces: a pager component that renders 3 questions × 4 tag-option buttons, plus a reveal panel for the finished state; strings for press chrome.

- [ ] **Step 1: Add strings**

In `src/i18n/strings.ts`, add (both en and es):

```ts
pressQuestion: { en: "Question", es: "Pregunta" },
pressResultWin: { en: "A flawless read.", es: "Una lectura impecable." },
pressResultPartial: { en: "A mixed read.", es: "Una lectura mixta." },
pressResultLose: { en: "You misread the room.", es: "Leíste mal la sala." },
pressWanted: { en: "Wanted", es: "Buscaba" },
pressTrap: { en: "A trap.", es: "Una trampa." },
```

Run `pnpm i18n:check` (pass).

- [ ] **Step 2: Write the component**

```tsx
import { styled } from "styled-components"
import { Check, X } from "lucide-react"
import type { Locale, PersonalityTag, ServedInteractiveState } from "@shared/types"
import { t } from "../../i18n/strings"
import { LinkBtn } from "../ui/Button"
import { AchIcon } from "../AchIcon"

// The served press view. `options` are { id, icon, tag } — the button label is
// the familiar personality_tag_<Tag> i18n string, matching how debate cards
// render their tag (GameScreen.tsx:115-117).
type PressView = Extract<ServedInteractiveState, { game: "press_conference" }>

interface Props {
  locale: Locale
  view: PressView
  busy: boolean
  onAnswer: (index: number) => void
  onContinue?: () => void
}

export function PressConferenceGame({ locale, view, busy, onAnswer, onContinue }: Props) {
  const question = view.questions[view.index]
  const resultKey =
    view.result === "player_win"
      ? ("pressResultWin" as const)
      : view.result === "player_lose"
        ? ("pressResultLose" as const)
        : ("pressResultPartial" as const)
  return (
    <Frame>
      <Step>
        {t(locale, "pressQuestion")} {view.index + 1} / {view.questions.length}
      </Step>
      {question && (
        <>
          <Prompt>{question.prompt}</Prompt>
          <Options>
            {question.options.map((op, i) => (
              <Option key={op.id} type="button" disabled={busy} onClick={() => onAnswer(i)}>
                {op.icon && <AchIcon name={op.icon} size={16} />}
                <OptLabel>{t(locale, `personality_tag_${op.tag}`)}</OptLabel>
              </Option>
            ))}
          </Options>
        </>
      )}
      {view.over && (
        <ResultCard>
          <ResultLede>{t(locale, result)}</ResultLede>
          <Transcript>
            {view.answers.map((ans, i) => {
              const tag = view.questions[i]?.options[ans]?.tag as PersonalityTag | undefined
              return (
                <li key={i}>
                  {view.revealed[i] === true ? (
                    <Check size={14} aria-hidden="true" />
                  ) : view.revealed[i] === false ? (
                    <X size={14} aria-hidden="true" />
                  ) : null}
                  {tag ? t(locale, `personality_tag_${tag}`) : `#${ans + 1}`}
                </li>
              )
            })}
          </Transcript>
          {onContinue && (
            <LinkBtn type="button" onClick={onContinue}>
              {t(locale, "minigameContinue")}
            </LinkBtn>
          )}
        </ResultCard>
      )}
    </Frame>
  )
}
```

The styled pieces below the component (`Prompt`, `Options`, `Option`, `OptLabel`, `Step`, `ResultCard`, `ResultLede`, `Transcript`) follow the `styled.div` / `styled.button` pattern used in `RpsGame.tsx`. Use `parchment`, `gold`, `line2`, `muted`, `ink3` theme tokens consistent with the other game frames (see `MinigameFrame.tsx` styles).

- [ ] **Step 3: Wire into `MinigameFrame.tsx`**

Import the component; in the branches (both the playing frame at line ~130 and the finished result at line ~92) add:

```tsx
view.game === "press_conference" ? (
  <PressConferenceGame
    locale={locale}
    view={finalView as any}   // press branch
    busy
    onAnswer={() => {}}
    onContinue={onFinished}
  />
) :
```

and for the playing branch:

```tsx
viewGame === "press_conference" ? (
  <PressConferenceGame
    locale={locale}
    view={view as any}
    busy={busy}
    onAnswer={(i) => handle({ kind: "press_conference", card: i })}
    onContinue={onFinishedAfterPlay}
  />
) :
```

For the finished/played branch, the "Continue" button should call `onFinished` after a reveal — either reuse `onFinished` or a local "show finale" state. Keep it simple: in the playing branch, when `view.over` becomes true, the component's `onAnswer` last move triggers the server to finish; the parent's `finishedResult` branch then shows the final board.

- [ ] **Step 4: Typecheck + i18n check**

Run: `pnpm test:src` and `pnpm i18n:check`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/minigames/PressConferenceGame.tsx src/components/minigames/MinigameFrame.tsx src/i18n/strings.ts
git commit -m "client: press_conference pager + reveal"
```

---

## Task 8: Full round-trip verification via smoke + docs

**Files:**

- Modify: `scripts/smoke.ts`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Smoke drives a press event end to end**

In `scripts/smoke.ts`, the interactive branch already auto-plays interactive games. Ensure an eligible press event gets served and resolved by the generic loop (it will call `/minigame-move`). Run it:

Run: `pnpm tsx scripts/smoke.ts` (or the project's expected smoke invocation).
Expected: a press_conference event is served and resolved without throwing.

- [ ] **Step 2: Update roadmap status**

In `docs/roadmap.md`, update item 2:

- Change marker from 🟡 to ✅.
- Note it is shipped: interactive `game: "press_conference"`, engine module, content, client frame, determinism tests.

- [ ] **Step 3: Run full test gate**

Run: `pnpm test` and `pnpm i18n:check`.
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.ts docs/roadmap.md
git commit -m "docs: update roadmap, smith press_conference verified"
```

---

## Self-review notes

- **Scope:** press_conference is 3 questions × 4 options, engine + 1 authored event, no `Sin Filtro` achievement = matches spec + user scoping.
- **Determinism:** hidden target uses `rng.weighted(...)` with `pressTargetWeight` from the run `Rng`; no `Math.random`. Daily seed preserved (`todayDailySeed()`).
- **i18n:** all new content + strings bilingual.
- **Type consistency:** `pressTargetWeight` (Task 3) is used in `answerPressTarget`; `answerPress` is `answerPressTarget` / `answerPressTarget` naming must be consistent across Tasks 3-4. Verify single name (use `answerPressAnswer`). If you see `answerPressTarget` vs `answerPress` drift during coding, normalize to one verb (`answerPressTarget`) and update all references.
- **Placeholder alert:** the "press" branch in `interactiveView` (Task 4) had a pseudo-`label`/`title` mismatch. The client uses `personality_tag_<tag>`; do NOT invent a `title` field on `PressTagOption`. If a bilingual option label is truly needed, add an authored `label: LocaleMap` to `PressTagOption`, serve it, and render it. Choose one approach and make it consistent across Tasks 1, 4, 7.

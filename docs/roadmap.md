# Ballad of the Unnamed — Roadmap

Single source of truth for **remaining / open** work. Everything flagged 🟡 or ⬜ in
`docs/improvement-plan.md` plus any backlog. Shipped items live in
`docs/improvement-plan.md` (the canonical status doc) and the git history; add
every new shipped line here too so the "what's next" list is always accurate.

> Last consolidated: 2026-08-06.

## Status Legend

| Marker | Meaning                             |
| ------ | ----------------------------------- |
| 🟡     | Partially implemented (notes below) |
| ⬜     | Not implemented / not started       |

---

## Open features

### 1. Skip-able New-Player Tutorial ✅ shipped 2026-08-06

> Originally implementation-plan **Step 17** (the only step never implemented).

**Status:** implemented (`src/components/TutorialModal.tsx` + `src/i18n/tutorial.ts`,
6 bilingual pages). Auto-opens on the first visit when the
`chronicle_tutorial_seen` localStorage flag is unset; closing it (×/Esc/backdrop)
persists the flag so it never auto-shows again. Always reopenable via the top-bar
`?` button and the "How to play" link on the creation screen.

Puntero ("example-puntero.md") opens with a numbered manual and an "OMITIR
TUTORIAL" skip; we have no onboarding at all — new players face the full HUD
cold. A short, skip-able tutorial shown before the first run.

| File                                | Change                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `content/tutorial.json`             | **New** — pages: Welcome / Everything is a Choice / Stats / Meters / Rival / Your Story (en+es)   |
| `src/components/TutorialScreen.tsx` | **New** — page pager with Next / Skip / Start buttons                                             |
| `src/App.tsx`                       | Show tutorial when no run exists and `chronicle_tutorial_seen` flag is unset; wire a re-open link |
| `src/i18n/strings.ts`               | "Skip tutorial", "Next", page-nav strings                                                         |

**Details**

- Content-driven pages (`{ id, title: LocaleMap, body: LocaleMap, icon }`) so it's editable without code.
- Skip persists a localStorage flag (`chronicle_tutorial_seen`), consistent with existing `chronicle_*` keys; a "How to play" link on the creation screen reopens it.
- 5-6 pages, one idea each, mirroring Puntero's structure.

---

### 2. `press_conference` minigame subtype ✅ shipped 2026-08-06

> improvement-plan.md §1.2 (part). The 5 personality-tag events using
> `wantedTags`/`punishedTags` were already authored; the engine synergy
> (`computeTagSynergy`) was done. The press-conference minigame itself is now
> shipped: an interactive `game: "press_conference"` (3 questions × 4
> personality-tag answers) with a hidden "what they wanted" target drawn per
> question from the run Rng, weighted by `computeTagSynergy` plus a
> fame/charisma tilt (the El Ídolo "tu liderazgo y tu fama pesan" model).

Shipped pieces:

- **Engine:** `server/engine/minigames/pressConference.ts` (`createPressState`,
  `pressOver`, `pressResult`, `answerPressTarget`, `pressTargetWeight`) wired
  into the four interactive switch points in `minigames/index.ts`; all draws
  through the per-run seeded `Rng` (determinism tests included).
- **Content:** `content/minigames/press_conference.json` — one authored event
  (`press_gauntlet_01`, primary stat charisma), bilingual prompts/outcomes.
- **Registry:** startup validation enforces `questions` (≥1, 4 options each,
  every option tagged, bilingual prompts).
- **Client:** `PressConferenceGame.tsx` question pager + ✓/✗ reveal, wired into
  `MinigameFrame.tsx` and `HowToModal`.

Rides the existing per-run interactive cap + cooldown; no `Sin Filtro`
achievement (future content).

---

### 3. More authored rest/recovery events ✅ shipped 2026-08-06

> improvement-plan.md §1.4 (part). Recovery content was thin — only the
> forced-recovery path (`__forced_recovery__`, restores 40) and the `camp_cook`
> shop item.

- **Shipped 2026-08-06:** 8 new recovery-focused rest events authored in
  `content/events/rest.json` (16 → 24): `rest_wayfarer_shelter`,
  `rest_midwife_soak`, `rest_lighthouse_room`, `rest_cold_spring`,
  `rest_windmill_loft`, `rest_orchard_nap`, `rest_ferryman_hut`,
  `rest_tollhouse_room` — each with stamina-restoring choices via
  `staminaDelta` (20-45) plus health/gold/reputation levers, and the familiar
  stat-gated "push on" volatile option. Bilingual en/es, validated by
  `pnpm i18n:check` + the server suite.

---

### 4. Separate `rivals` table + parallel RNG stream ✅ shipped 2026-08-06

> improvement-plan.md §3.2 (part). Rival generation, HUD widget, end-game
> comparison, and direct encounters were already done. This pass lands the last
> two pieces: the rival now lives in a normalized `rivals` table, and it
> advances on its own parallel RNG stream seeded from the same run seed — so
> its stat bumps are independent-but-deterministic and never perturb the
> player's event sequence.

- **Schema:** new `rivals` table in `server/db/schema.sql` (spec layout keyed by
  `run_id → runs(id)`, plus `focus_id` and a nullable `character_id`), and a
  `rival_rng_state` column on `runs` so the parallel stream resumes across
  reloads. Existing installs pick both up via the idempotent migration block.
- **Parallel stream:** `rivalRngFor(runSeed)` in `shared/rng.ts` derives a
  second deterministic stream from the same seed (`hashSeed(seed + ":rival")`).
  `generateRival` and `advanceRival` (via `generateSeasonSummary`/`buildServedEvent`)
  draw from it, so the rival's existence and advancement never consume the
  player's main stream — daily runs stay identical for everyone, and the rival
  is a pure function of the seed.
- **Persistence:** `saveRun` upserts the `rivals` row on every save
  (`upsertRival` in `server/store/runStore.ts`); legacy runs default the stream
  position from the seed on load.

- **Rival faction switches ✅ shipped 2026-08-07:** `advanceRival` now rolls a
  seeded faction switch per season (`GAME_CONFIG.rivalFactionSwitchChance`,
  0.15) on the parallel stream — the rival occasionally abandons its current
  faction for a different one, never the same one twice in a row. The previous
  faction + the switch turn are recorded on the rival (`lastFactionId` /
  `factionSwitchTurn`), so the season summary narrates the move exactly once
  ("Roderick has abandoned the Ironhold Guild for the Greywater Town!") before
  settling back into the plain "riding with X" clause. Rivals without a faction
  never switch.

- **Tests:** `server/engine/engine.test.ts` — "archrival parallel RNG stream"
  suite (stream determinism/independence, main-stream isolation, seed-identical
  advancement through the season-summary path) + "rival faction switches" suite
  (switch fires over many seeds, never lands on the same faction, no faction =
  no switch, per-seed determinism, one-shot season-summary narration naming
  both factions, plain clause returns after the switch season).

---

### 5. Content volume: NPC relationships (2 → 15+) ✅ shipped 2026-08-07

> improvement-plan.md §5.1. Events (136), minigames (72), archetypes (54 = 6×9),
> world events, and clans all exceed targets. **NPCs were the laggard: only 2
> recurring NPCs** (`ser_aldric`, `wanderer_of_the_homeland`) — now 15.

Shipped pieces:

- **Content:** `content/events/relationships.json` — 13 new recurring NPCs (2 → 15
  total): Sister Mira (healer), Lyra (bard), Fenwick (alchemist mentor), Captain
  Bram (guard mentor), Merra (innkeeper), Jorin (smith apprentice), Tess (orphan
  child), Elara (duelist love interest), Grimble (merchant), Velda (seer mentor),
  Thane Wulfric (nemesis), Lucian (court spy), Kade (warden). Each NPC ships a
  one-shot **intro event** (a `introducesRelationshipId` choice + `affinityDelta`
  opening) and a repeatable **follow-up event** gated by `requiresRelationshipId`
  whose choices carry `affinityDelta` on both sides — befriend up to Devoted or
  betray down to Nemesis, exactly the §3.1 loop the content was missing.
- **Achievements:** `bonded_for_life` (peak affinity ≥ 80) +
  `burned_that_bridge` (affinity ≤ -80) — the spec's "Bonded for Life" /
  "Burned That Bridge" pair, now actually reachable (nemesis intros open on the
  negative side so a feud is a real path, not just friend-betrayal).
- **Tests:** content-audit suite in `server/engine/engine.test.ts` (≥15 NPCs;
  every NPC has an intro + a gated follow-up; no orphan `requiresRelationshipId`
  gates; every follow-up can actually move affinity; the two achievements exist).

| File | Change |
| ----------------------------------- | ---------------------------------------------------------------------- || `content/events/relationships.json` | **New** — 28 events: 13 intros + 15 gated follow-ups (13 new NPCs + follow-ups for the 2 legacy NPCs, en+es) |
| `content/achievements.json` | +2 relationship achievements (`bonded_for_life`, `burned_that_bridge`) |
| `server/engine/engine.test.ts` | +content-audit suite for the NPC roster |
| `docs/improvement-plan.md` | §5.1 status line + table row updated (2 → 15) |

---

### 6. Per-encounter completion tracking 🟡

> improvement-plan.md §5.4 (part). Trophy Hall (`CollectionScreen`) + overall
> completion % are done. Missing: per-encounter completion breakdown.

- Extend `GET /api/meta/collection` to list which specific
  events/factions remain uncollected.

---

### 7. Analytics ⬜ (optional)

> improvement-plan.md §6.1. Not started. No telemetry, event tracking, or
> run-data analytics. Recognized as optional — the AI narration section was
> removed by decision; no LLM features planned.

---

## Implementation order notes

- Items 2 and 4 touch engine eligibility/resolution → land before content depends on them.
- Item 1 (tutorial) is pure UI + content, safe to parallelize.
- Duplicated content-driven items (3, 5) are independent and can precede their engine hooks.

---

## Verification

- Anything touching RNG must preserve determinism (`todayDailySeed()`, per-run seeded `Rng`, never `Math.random`) — see §RNG & determinism in `docs/fantasy-cyoa-rpg-spec.md`.
- Every new `LocaleMap` needs non-empty `en` AND `es` or `registry.ts` throws at boot; run `pnpm i18n:check` after content edits.
- Keep tests green: `pnpm test:src` + `pnpm test:server` (`engine.test.ts` is the large one).

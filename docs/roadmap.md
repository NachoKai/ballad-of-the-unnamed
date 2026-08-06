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

### 2. `press_conference` minigame subtype 🟡

> improvement-plan.md §1.2 (part). The 5 personality-tag events using
> `wantedTags`/`punishedTags` are authored; the engine synergy
> (`computeTagSynergy`) is done. The press-conference minigame itself is not.

A minigame where 3 questions each have 4 tag-options, and the "correct" read is
partly stat-gated (Charisma + Fame influence what the NPC wants to hear).

- Add `press_conference` to `MinigameSubtype`.
- Extend resolution in `resolveMinigame()`.
- Authored content: reuse the `wantedTags`/`punishedTags` mechanism.
- All draws through the per-run seeded `Rng`.

---

### 3. More authored rest/recovery events 🟡

> improvement-plan.md §1.4 (part). Recovery content remains thin — only the
> forced-recovery path (`__forced_recovery__`, restores 40) and the `camp_cook`
> shop item.

- Author rest events using `staminaDelta` in `content/events/rest.json` (that
  file exists with 8 events — expand with recovery-focused ones).

---

### 4. Separate `rivals` table + parallel RNG stream 🟡

> improvement-plan.md §3.2 (part). Rival generation, HUD widget, end-game
> comparison, and direct encounters are done. Remaining: the rival is stored
> inline in the run JSONB (no `rivals` table), and it shares the run's single RNG
> (no parallel stream).

- Add a `rivals` table to `server/db/schema.sql`.
- Advance the rival on a parallel RNG stream seeded from the same seed, so its
  stat bumps / faction switches are independent-but-deterministic.

---

### 5. Content volume: NPC relationships (2 → 15+) 🟡

> improvement-plan.md §5.1. Events (136), minigames (72), archetypes (54 = 6×9),
> world events, and clans all exceed targets. **NPCs are the laggard: only 2
> recurring NPCs** (`ser_aldric`, `wanderer_of_the_homeland`).

- Author more `introducesRelationshipId` NPCs → 15+ recurring NPCs.
- Wire `requiresRelationshipId` gates + `affinityDelta` choices.

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

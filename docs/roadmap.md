# Ballad of the Unnamed — Roadmap

Single source of truth for **remaining / open** work. Shipped items live in
`docs/improvement-plan.md` (the canonical status doc) and the git history.

> Last consolidated: 2026-08-08. Every previously-listed item (tutorial,
> `press_conference` minigame, rest events, `rivals` table + parallel RNG
> stream, NPC relationships, per-encounter completion tracking, "Your Story"
> scrollback, combat system) is shipped. Only Analytics remains open.

## Status Legend

| Marker | Meaning                             |
| ------ | ----------------------------------- |
| ⬜     | Not implemented / not started       |

---

## Open features

### 1. Analytics ⬜ (optional)

> improvement-plan.md §6.1. Not started. No telemetry, event tracking, or
> run-data analytics. Recognized as optional — the AI narration section was
> removed by decision; no LLM features planned.

- Track per-run metrics: average turn duration, most-picked personality tags, most common ending types, achievement completion rates.
- Content bank analytics: which events are never seen (weight tuning), which minigames are skipped most.
- Balance tuning: use real run-data distribution to set leaderboard thresholds and score weights.

---

## Verification (for any future work)

- Anything touching RNG must preserve determinism (`todayDailySeed()`, per-run seeded `Rng`, never `Math.random`) — see §RNG & determinism in `docs/fantasy-cyoa-rpg-spec.md`.
- Every new `LocaleMap` needs non-empty `en` AND `es` or `registry.ts` throws at boot; run `pnpm i18n:check` after content edits.
- Keep tests green: `pnpm test:src` + `pnpm test:server` (`engine.test.ts` is the large one).

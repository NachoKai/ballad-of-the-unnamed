# Task 3 report — Places & power (regions +6, court +6, foreign +5, dungeon +5)

Plan: `docs/superpowers/plans/2026-09-20-content-expansion.md` (Task 3, lines ~395-419)
Spec: `docs/superpowers/specs/2026-09-20-content-expansion-design.md`

## Delivered counts (validated `ConvertFrom-Json`)

| file | before | after |
|------|--------|-------|
| `content/events/regions.json` | 12 | **18** |
| `content/events/court.json` | 12 | **18** |
| `content/events/foreign.json` | 10 | **15** |
| `content/events/dungeon.json` | 10 | **15** |

22 new events, all with bilingual `en`/`es`, masculine-default Spanish (voseo).
Each event has 2-3 choices and at least one ungated choice (engine weak-character test stays safe).

## New event ids

- **regions(+6):** region_vale_pied_piper, region_coast_smuggler_cove, region_highlands_mine_collapse,
  region_capital_conspiracy_mural, region_wastelands_glass_storm, region_isles_siren_singers
- **court(+6):** court_hunting_party, court_spymaster_offer, court_prisoner_visit, court_sumptuary_law,
  court_ancestor_portrait, court_winter_feast
- **foreign(+5):** foreign_international_marriage, foreign_tourist_marking, foreign_deportation_scare,
  foreign_festival_crown, foreign_mercenary_contract_outsider
- **dungeon(+5):** dungeon_rat_king, dungeon_drowning_chamber, dungeon_echo_hall, dungeon_lost_altar,
  dungeon_guards_truce

## Fixes applied to existing content

- `regions.json` (coast event): `reputationFaction` `greywater` → `sandspear` (wrong-region faction id);
  prose `Greywater learns` → `Sandspear learns`; `Villa Aguagrís` → `la Lanza de las Arenas`.
- `court.json` prose hygiene: `golden_lotus clerks` → `The Lotus clerks` (leaked internal id);
  `guardía` → `guardia`; removed `Aventurero` vocative (not in the genderize table → would render wrong for female players).
- `court.json` court_hunting_party: added `reputationDelta -2 crownguard` to `press_him_yourself` to match its prose.

## Compliance checks

- Dup-id scan across `content/events` + `content/minigames`: **no duplicates**.
- Per-event choice ids unique; every event has ≥1 choice **without** `requiresStat`; every file has multiple
  gated choices (regions 7, court 16, foreign 10, dungeon 18).
- Stats/tags/rarities restricted to `shared/types.ts` sets; only volatile choices carry `tradeoffDeltas`
  (`sign_the_contract`, `take_the_letter`, `offer_your_name`).
- Factions are all from `content/factions.json` (crown: crownguard/golden_lotus; coasts: sandspear/meridian_company; noir: arcanum).
- Counters use existing keys only (`deeds_of_the_year`, `dark_pacts`, `lives_saved`, `monsters_killed`, etc.).
- Slot pools / `{rivalName}` used per `content/slots.json` + engine convention.
- Reward scale follows each file's sibling precedent (common +1/+2, uncommon +2, rare +2-3 totals; gold tens-to-hundreds;
  health/injury only on risky picks; liability on shady paths).

## Verification

- `pnpm test:server` — 534 passed
- `pnpm i18n:check` — clean (all en/es maps complete)
- `pnpm lint` — 0 errors (3 pre-existing warnings in `.superpowers/sdd` snapshots, untouched)

## Commit

```
1f14bf6 feat(content): expand places & power events 50% (regions/court/foreign/dungeon)
4 files changed, 1603 insertions(+)
```

Committed exactly the four event files. **Excluded from the commit** (user WIP left in working tree):

- `content/events/court.json` `baron_vex_insulted: true` in `court_insult_noble`/`insult_back` `setsFlag`
  (staged via clean-blob surgery: `git hash-object -w` + `git update-index --cacheinfo`, so the commit's
  court.json is byte-different only in that delta; verified 0 matches in `HEAD:content/events/court.json`).
- `server/engine/engine.test.ts` (modified), `content/threads/example_thread.json` (deleted),
  `content/events/story_threads.json` + `content/threads/story_threads.json` (untracked),
  plan/spec docs (untracked).

## Remaining

- Task 4: Batch D — Fates & arenas (destiny +3, duels +9, elections +6, debates +1, urns +1, relics +1, press_conference +1).
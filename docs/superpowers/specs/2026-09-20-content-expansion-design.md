# Story Content Expansion — Design

Date: 2026-09-20

## Problem

The content directory has healthy volume in some sections and thin coverage in others. The goal is a roughly uniform ~50% expansion of the story-bearing sections so players see more narrative variety per run, WITHOUT growing the system-facing surface (no new classes, factions, shop items, clans, guild names, archetypes, achievements, combat creatures, or story threads).

## Goals

1. Expand the 17 story-bearing content files (11 event families + 6 minigame families) by ~50% each.
2. Expand 5 slot pools (npcRole, npcName, locationName, worldLocation, creatureName) by ~50% each.
3. New material must load cleanly through the existing content registry, pass `pnpm i18n:check`, and ship bilingual (en + es).
4. Authoring rules stay deterministic: all rolls continue through the per-run seeded `Rng`; content adds zero runtime randomness.

## Non-goals / constraints

- NO new classes, factions, shop items, clans, guild names, archetypes, achievements, combat encounters/creatures, story threads, or new minigame subtypes/engine mechanics.
- NO engine or type changes. New content reuses existing fields and gates only (`requiresStat`, `requiresRegion`, `requiresFlag`, `requiresLiability`, `requiresHuntedBy`, `wantedTags`/`punishedTags`, `setsFlag`, `countersDelta`, affinity/reputation deltas, `minAge`/`maxAge`, `weight`, `trap`, `cardModifiers`, etc.).
- `guildName` (19) and `regionVariant` (12) slot pools stay frozen.
- Preserve the daily-seed determinism promise — nothing here touches `Math.random` or the RNG path.

## Design decisions (agreed)

- **Expansion means more items per file, not new systems.** Every addition is an authored JSON item conforming to an existing shape.
- **Approach A: batched authoring with verification checkpoints.** Bulk file additions are risky to review; batches let each chunk be registry-validated, i18n-checked, and linted before the next chunk begins, and let the user correct tone early.
- **Style sample first.** Two events (one multi-choice road event + one duel minigame) get authored and reviewed for voice before the main batches.
- **Reuse existing gates only.** No new gating vocabulary.

---

## 1. Expansion targets (exact numbers)

**Events — 79 new:**

| File | Now | +50% | Target |
|---|---|---|---|
| world | 23 | +12 | 35 |
| rest | 24 | +12 | 36 |
| relationships | 28 | +14 | 42 |
| regions | 12 | +6 | 18 |
| court | 12 | +6 | 18 |
| road | 12 | +6 | 18 |
| personality | 10 | +5 | 15 |
| foreign | 10 | +5 | 15 |
| dungeon | 10 | +5 | 15 |
| tavern | 10 | +5 | 15 |
| destiny | 6 | +3 | 9 |

**Minigames — 19 new:**

| File | Now | +50% | Target |
|---|---|---|---|
| duels | 18 | +9 | 27 |
| elections | 12 | +6 | 18 |
| debates | 2 | +1 | 3 |
| press_conference | 1 | +1 | 2 |
| relics | 2 | +1 | 3 |
| urns | 2 | +1 | 3 |

**Slot pools — 150 new entries:**

| Pool | Now | +50% | Target |
|---|---|---|---|
| npcRole | 75 | +38 | 113 |
| npcName | 79 | +40 | 119 |
| locationName | 59 | +30 | 89 |
| worldLocation | 23 | +12 | 35 |
| creatureName | 60 | +30 | 90 |

**Total: 248 new bilingual items.**

## 2. Authoring conventions

### 2.1 Bilingual + genderize rule (HARD)

- Every `LocaleMap` gets non-empty `en` + `es` (`registry.ts` throws otherwise).
- Spanish is authored in **standard masculine forms** for player-referential words (`viajero`, `solo`, `herido`, `cansado`, `abrigado`, …). `genderize()` (`shared/genderize.ts`) inflects user-referential words to feminine for female characters at render time (`server/engine/helpers.ts:43` — gendered BEFORE slot fill, so NPC/group text pulled from slot pools is never re-gendered).
- Prefer words already covered by `MASCULINE_TO_GENDERED`, or gender-neutral phrasing. Do NOT hardcode legacy feminine forms (e.g. the existing `forastera`, `vista`).
- Extend `MASCULINE_TO_GENDERED` only if a genuinely useful new user-referential word is introduced. Kept small and en/es-independent.

### 2.2 Standard event shape (road/tavern/rest/relationships/regions/court/personality/foreign/dungeon)

- 2–3 choices per event; **at least one choice without `requiresStat`** (engine/registry rejects fully-gated choice sets).
- Mix personality tags across the ten available (Humble, Cocky, Confident, Professional, Aggressive, Funny, Supportive, Strategic, Stoic, Leader); prefer behavioral variety over tag padding.
- Rarity spread: mostly `common`/`uncommon`, occasional `rare`/`volatile`. Volatile pairs a big upside with `tradeoffDeltas`.
- Reward scale mirrors each file's existing siblings:
  - stat deltas: common +1, uncommon +2, rare +3–4.
  - gold: tens (partial) to ~200 (rare).
  - health/injury only on risky picks; stamina deltas on rest events; liability on shady paths.
- Reuse existing hooks only: `wantedTags`/`punishedTags`, `setsFlag`/`removeFlag`, `countersDelta`, `introducesRelationshipId`/`NpcRole`/`NpcName`, `affinityDelta`, faction `reputationDelta`/`reputationFaction`, `requiresRegion`/`requiresFlag`/`requiresLiability`/`requiresHuntedBy`, `minAge`/`maxAge`, `weight`.
- Family flavor:
  - `rest`: bias to stamina/health recovery + quiet character beats.
  - `dungeon`: bias to health, injury risk, and dark/underworld arcs.
  - `relationships`: introduce NPCs or shift affinity with existing NPCs.
  - `regions`: use `requiresRegion` against the existing 6 regions.
  - `court`: reputation with the crown factions; no new factions.
  - personality: driven by `wantedTags`/`punishedTags` filters.

### 2.3 World events

- `type: "world"`, a `worldEventHeadline` map (en + es), and a single `acknowledge` common choice. Pure news/hooks — no choices with mechanical consequences.
- Placeholders `{slot:worldLocation}`, `{slot:guildName}` allowed in prose (guildName pool is frozen but still fillable).
- No `combatMenace` (combat is frozen).

### 2.4 Destiny events

- `type: "destiny"`, higher `minAge` (≥18 baseline), bigger stat swings than standard events.
- `locksEventPool`/`unlocksEventPool` only where cleanly reusable with existing pool semantics (event-id-based per `server/engine/helpers.ts:380-382`); otherwise omitted.

### 2.5 Minigame families

- **duels**: `resolution.type: "weighted_hidden_match"`, 4 cards (icon + label), resolution shaped to `primaryStat` (strength / dexterity / charisma / intelligence), ≤2 `cardModifiers`, 4-tier outcomes (critical/success/partial/fail) each with bilingual narrative and no verdict. Existing subtypes (duel_strike, brawl, street_fight, negotiation, arcane_duel, tournament) reused.
- **elections**: capstone (`isCapstone: true`, `capstoneKind: "election"`), 3 cards (one `trap`), 4-tier outcomes each with `verdict` + `gradeDelta` + narrative.
- **debates**: mirror the existing debate file shape (cards carry `tag`/`wantedTags`).
- **press_conference**: interactive (`game: "press_conference"`), 3 questions × 4 options, each option with `tag` + `wantedTags`; 4-tier outcomes with narrative.
- **urns**: `grid_gamble`, 3 cards (one `trap`), `baseWinChance` ~0.4, `statInfluence: {}` + 1–2 `cardModifiers`; fail tier carries liability; use `countersDelta: { urns_opened: 1 }` and reset streak on partial/fail, matching existing urns.
- **relics**: interactive `memotest` (`game: "memotest"`), `opponent`, `statThreshold` ~20, `rivalSkill` ~0.5; 4-tier outcomes; `reputationFaction: "arcanum"` deltas matching existing relics.

### 2.6 Slots

- Same narrative tone/quality as existing entries.
- `npcName`: keep culturally varied; avoid near-duplicates.
- `creatureName`: keep the existing raw → refined creature progression arc.
- `locationName`/`worldLocation`/`npcRole`: richer variety, no duplicates, plural/singular conventions matching existing entries.

### 2.7 IDs

- Unique across the WHOLE event registry (loader builds a Map — duplicates silently overwrite; would silently drop existing content).
- Follow each file's existing `prefix_` convention (`road_*`, `tavern_*`, `urn_*`, …). Verified against existing ids before each batch.

## 3. Batch plan

1. **Style sample (2 items):** one multi-choice road event + one duel minigame authored and reviewed for voice before the main batches.
2. **Batch A — Travels:** world (+12), road (+6), rest (+12).
3. **Batch B — People:** relationships (+14), tavern (+5), personality (+5).
4. **Batch C — Places & power:** regions (+6), court (+6), foreign (+5), dungeon (+5).
5. **Batch D — Fates & arenas:** destiny (+3), duels (+9), elections (+6), debates (+1), urns (+1), relics (+1), press_conference (+1).
6. **Batch E — Slots:** npcRole (+38), npcName (+40), locationName (+30), worldLocation (+12), creatureName (+30).

## 4. Verification

After each batch: `pnpm test:server` (content registry validates schema/parity) + `pnpm i18n:check` (en/es parity) + `pnpm lint`. Full test suite at the end. Existing tests are expected to keep passing since no engine/types change.
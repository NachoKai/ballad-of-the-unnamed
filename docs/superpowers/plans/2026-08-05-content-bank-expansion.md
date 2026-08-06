# Content Bank Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Approximately double the authored content in every file under `content/` except `achievements.json`, keeping both `en` and `es` locales complete so the server registry validates and the test suite stays green.

**Architecture:** Content is static JSON loaded into server memory at boot by `server/content/registry.ts` (throws on invalid data or a missing locale) and linted by `scripts/i18n-parity.ts`. The spec's "variety lever is composability" means we expand `content/slots.json` first (so every already-authored template produces more variants), then authored events/minigames that reference those pools, then shop / regions / archetypes / classes. Each task edits one file and is independently verified with `pnpm i18n:check` and `pnpm test:server` before committing.

**Tech Stack:** TypeScript, JSON author-as-data, Node v24, Vitest (`pnpm test:server` boot-loads the full registry and runs `server/engine/engine.test.ts`), deterministic per-run `Rng`.

## Global Constraints

These four rules are what keep the build green. They are non-negotiable and repeated implicitly in every task:

1. **Both locales required.** Every `LocaleMap` (`{ "en": "...", "es": "..." }`) needs a non-empty `en` AND `es`, otherwise `registry.ts` throws at boot and `pnpm i18n:check` exits 1. Spanish reads in the existing Rioplatense voice (e.g. `vos`); gender inflection happens client-side, so author neutral phrasing.
2. **Soft-lock guard (hard).** Any event whose choices resolve through `requiresStat` must keep at least one choice WITHOUT `requiresStat`. `registry.ts` asserts this and `engine.test.ts` plays 80 seeds against a 1-in-every-stat character. Interactive minigames are exempt (no card choices).
3. **Minigame contract.** Every minigame needs `resolution` + all four `outcomes` (`critical|success|partial|fail`), each with a `narrative`. Non-interactive minigames author `cards` (each `id` + `icon` + `label`). Interactive minigames (`resolution.type === "interactive"`) author `game: "tictactoe" | "rps" | "memotest"`, a `primaryStat`, and an `opponent`, with no `cards`.
4. **Reuse the existing counter keys.** Do not invent counters. Every achievement-backed counter must be bumped by some content; the "every authored counter is actually incremented" test (`engine.test.ts:1122`) catches a counter that is used but never bumped.

**Canonical counter keys (reuse these exactly):**
`alchemy_won, allies_found, allies_made, arcane_duels_won, archery_won, battles_won, board_games_won, brawls_won, chases_won, clans_betrayed, clans_joined, clans_left_amicably, clutch_duels, courtly_won, dark_pacts, declined_dark_offers, declined_offers, deeds_of_the_year, drinks_won, duels_won, fencing_won, fights_fled, fishing_won, gambles_won, goblin_games_won, heists_won, hunts_won, lives_saved, lore_exchanged, monsters_killed, negotiation_streak, negotiations_won, nights_pushed, quests_completed, relic_memotest_wins, smithing_won, storms_braved, street_fights_won, survivals_won, talked_down, temples_visited, tournaments_won, urns_opened, volatile_greed`

(Note: the exact key list above is illustrative of the theme; when authoring, open `content/events` and `content/minigames` and reuse the literal key strings already in use there — the source of truth is what compiles today.)

**Placeholders:** narrative may use `{npcRole}`, `{npcName}`, `{locationName}`, `{creatureName}`, `{slot:worldLocation}`, `{slot:guildName}`, `{rivalName}`. Every pool name must already exist in `slots.json`. Do not add new pool names.

**World events** (`type: "world"`): need `worldEventHeadline` (loc) plus a single binary `acknowledge` choice ("The world moves on"). **Destiny events** (`type: "destiny"`): ≥2 choices, a large permanent stat swing on the risky option, and `unlocksEventPool`/`locksEventPool`. Destiny must never grant literal invincibility — per spec, at most removal of death by old age.

**Icons:** reuse lucide names used in existing files (e.g. `flame`, `shield`, `sword`, `skull`, `crown`, `eye`) for events/archetypes; emoji (`🍲`, `🩹`, `🐎`) for shop items. No new icon asset work.

**Commit style:** one commit per file task: `feat(content): <verb> <file>`.

---

## Files and targets

| File                                           | Current → New     | Task |
| ---------------------------------------------- | ----------------- | ---- |
| `content/slots.json` (pools)                   | double            | 1    |
| `content/events/rest.json`                     | 8 → 16            | 2    |
| `content/events/road.json`                     | 6 → 13            | 3    |
| `content/events/tavern.json`                   | 5 → 11            | 4    |
| `content/events/dungeon.json`                  | 5 → 11            | 5    |
| `content/events/court.json`                    | 6 → 12            | 6    |
| `content/events/personality.json`              | 5 → 10            | 7    |
| `content/events/foreign.json`                  | 5 → 10            | 8    |
| `content/events/clans.json`                    | 9 → 18            | 9    |
| `content/events/world.json`                    | 10 → 19           | 10   |
| `content/events/destiny.json`                  | 3 → 6             | 11   |
| `content/regions.json` + `slot regionVariant`  | 6 → 10            | 12   |
| `content/events/regions.json` (region-gated)   | 6 → 12            | 13   |
| `content/minigames/relics.json`                | 1 → 2             | 14   |
| `content/minigames/urns.json`                  | 1 → 2             | 15   |
| `content/minigames/goblin_games.json`          | 2 → 4             | 16   |
| `content/minigames/debates.json`               | 1 → 2             | 17   |
| `content/minigames/elections.json`             | 6 → 12            | 18   |
| `content/minigames/duels.json`                 | 9 → 18            | 19   |
| `content/minigames/activities.json`            | 16 → 32           | 20   |
| `content/shop.json`                            | 16 → 32           | 21   |
| `content/archetypes.json`                      | 5/class → 8/class | 22   |
| `content/classes.json` (+ new archetype pools) | 6 → 9             | 23   |

**Execution order:** 1 → 2 → ... → 23, with two hard orderings:

- **Task 12 (regions) BEFORE Task 13 (region-gated events)** so new region ids exist before they are referenced.
- **Task 23 (new classes) LAST** because it also adds new `archetypes.json` pools.

Each task ends with its own verification (both checks) and commit.

---

## Task 1: Slots (`content/slots.json`)

**Files:** Modify `content/slots.json`

**Interfaces:** Produces the pool entries every later event references.

Double every pool EXCEPT `regionVariant` (handled in Task 12). Append new `{ en, es }` entries (proper-noun names are identical in both locales):

- `npcRole`: 38 → ~75. Adde.g. `master forger / maestro falsificador`, `dockside laborer / estibador`, `candle-maker / cerero`, `beggar king / rey de los mendigos` (if not present), `toll-taker`, `hedge alchemist`, `royal herald`, `disgraced champion`, `poisoner`, `fortune seeker`, etc.
- `npcName`: 40 → ~80. Add ~40 proper names with identical `en`/`es`: Ulrik, Amara, Cedric, Dana, Eorik, Freya, Garreth, Halvar, Ilya, Joren, Kestrel, Leoric, Maren, Nyle, Oberon, Pryce, Quillan, Rhea, Sorren, Tilda, Ulric, Vanya, Wilhelm, Xanthe, Yrsa, Zinnia, Aldric, Bramble, Corin, Drasa, Edda, Fenra, Godfrey, Helva, Jove, Lindell, Marisol, Nissa, Osgood, Pell.
- `locationName`: 30 → ~60. e.g. `a half-sunken bridge / un puente medio hundido`, `the last orchard / el último huerto`, `a silent churchyard`, `a chestnut grove`, `the toll-house`, `a stranded mill`, `the under-market`, `a meadow at dusk`, `the archive cellar`.
- `worldLocation`: 12 → ~24. e.g. `the Howling Plateau / la Meseta Aullante`, `the Mott Salt Wastes`, `the Silverwood`, `the Moon Cairn`, `the Cinder Rift`, `the Whispering Bog`, `the Sunken City`.
- `creatureName`: 30 → ~45. e.g. `a dire wolverine / un carnívolo`, `a stone golem`, `a wyvern's hatchling`, `a manticore kit`, `a necrotic hound`, `a miasma elemental`, `a frost salamander`, `a bone-bird phalanx`.
- `guildName`: 7 → ~20. e.g. `the Amber Vault / el Corralón del Ámbar`, `the Pale Ledger / el Libro de Nómina`, `the Saltweaver`, `the Cormorant Company`, `the Second Veil`.

- [ ] **Step 1:** `node -e "JSON.parse(require('fs').readFileSync('content/slots.json','utf8')); console.log('ok')"`
- [ ] **Step 2:** Edit `content/slots.json`, append new entries to `npcRole`, `npcName`, `locationName`, `worldLocation`, `creatureName`, `guildName`. Leave `regionVariant` for Task 12.
- [ ] **Step 3:** `pnpm i18n:check` → expect `[i18n] all locale maps complete`.
- [ ] **Step 4:** `pnpm test:server` → expect pass.
- [ ] **Step 5:** Commit: `git add content/slots.json && git commit -m "feat(content): expand slot pools"`.

---

## Task 2: Rest events (`content/events/rest.json`)

**Files:** Modify `content/events/rest.json` (8 → 16).

Author 8 new `rest_*` recovery beats (warm inns, shrines, hot springs, refuges). Each `minAge:16, maxAge:99`, `location:"road"` (or a matching reginging tag), `weight:4–8`. Heal via `staminaDelta` + `healthDelta`; put a `volatile` "push on" option that trades an export stat for `injuryRiskDelta`. Reuse `nights_pushed`, `temples_visited`, `lore_exchanged`.

A worked entry to the required shape (author the rest to the same depth as the file's existing prose):

```json
{
  "id": "rest_storm_refuge",
  "minAge": 16,
  "maxAge": 99,
  "weight": 4,
  "location": "road",
  "narrative": {
    "en": "At {locationName} a storm seals the pass. A {npcRole} shares a fire-tight lean-to, dry bracken, and dense bread.",
    "es": "En {locationName} una tormenta sella el paso. Un {npcRole} comparte un refugio contra el viento, helecho seco y pan recocido."
  },
  "choices": [
    {
      "id": "share_least",
      "label": { "en": "Share the fire and the road", "es": "Compartir el fuego y el camino" },
      "tag": "Supportive",
      "rarity": "uncommon",
      "staminaDelta": 30,
      "healthDelta": 5,
      "statDeltas": { "charisma": 2 },
      "narrative": {
        "en": "You talk the storm out of the night; dawn comes dry and kind.",
        "es": "Quitás la tormenta de la noche charlando; el amanecer llega seco y amable."
      }
    },
    {
      "id": "wait_quiet",
      "label": { "en": "Bed down and sleep through it", "es": "Recostarte y dormir esperando" },
      "tag": "Stoic",
      "rarity": "common",
      "staminaDelta": 40,
      "healthDelta": 8,
      "statDeltas": { "constitution": 1 },
      "narrative": {
        "en": "You rest where the wind cannot reach and wake under a clean sky.",
        "es": "Descansás donde el viento no alcanza y despertás ante un cielo limpio."
      }
    }
  ]
}
```

Full set to author: `rest_storm_refuge`, `rest_beggar_soup_kitchen`, `rest_campfire_sharpener`, `rest_orphanage_volunteer`, `rest_sleep_under_stars`, `rest_temple_garden`, `rest_pilgrim_share`, `rest_scavenger_feast`.

- [ ] **Step 1:** Open `content/events/rest.json`.
- [ ] **Step 2:** Append the 8 events. Enforce the four global constraints.
- [ ] **Step 3:** `pnpm i18n:check` → green.
- [ ] **Step 4:** `pnpm test:server` → green.
- [ ] **Step 5:** `git add content/events/rest.json && git commit -m "feat(content): double rest events"`.

---

## Task 3: Road events (`content/events/road.json`)

**Files:** Modify `content/events/road.json` (6 → 13).

Add 7 road/travel events: an ambushed caravan (use `creatureName`, offer `battles_won` vs `goldDelta` bribe), a toll-bridge sentinel (`negotiations_won`), a wyvern nest (danger, `monsters_killed`), a broken cart wheel (`allies_made`, `charisma`), a ghost on the old bridge (`talked_down` / `fights_fled`), a migrating stampede (`chases_won`), a dark roadside pact (`liability`, `gambles_won`). Include ≥1 `volatile` `requiresStat` option per event WITH a non-gated fallback. Use `{locationName}`/`{creatureName}`/`{slot:guildName}`.

Verify + commit (`feat(content): double road events`).

---

## Task 4: Tavern events (`content/events/tavern.json`)

**Files:** Modify (5 → 11). Add 6 tavern beats: dice table (`gambles_won`), a bard's verse duel (`courtly_won`), a thug shookdown (`street_fights_won`), rumor-monger (reputation), a barkeep's dry tip (charisma/fame), a barmaid's planted job (`quests_completed`). Each `location:"tavern"`. ≥1 non-gated per. Commit `feat(content): double tavern events`.

## Task 5: Dungeon events (`content/events/dungeon.json`)

**Files:** Modify (5 → 11). Add 6 dungeon scenarios — a sealed vault (`heists_won`), a mimic hole (trap, `injuryRiskDelta`), a hidden shrine (faction reputation), a flooded cavern contract, a guardian price (`monsters_killed`), a collapsing chamber (`survivals_won`). Keep `injuryRiskDelta` moderate (never ending fatal). Commit.

## Task 6: Court events (`content/events/court.json`)

**Files:** Modify (6 → 12). Add 6 court/political beats: debutante ball (`courtly_won`), patronage negotiation (`negotiations_won`), a scheming chancellor, a royal audience, a jester's freedom (a `Funny` viral beat), a challenge-for-favor duel-right. Use `Strategic`/`Funny`/`Humble` tags. Commit.

## Task 7: Personality / dialogue events (`content/events/personality.json`)

**Files:** Modify (5 → 10). Add 5 tag-driven negotiation/press events. Put `wantedTags`/`punishedTags` on the choices to reward/punish specific personality tags. Feed `negotiations`/`negotiation_streak`, and put `countersReset: ["negotiation_streak"]` on any social-failure option. Each must keep a neutral fallback choice. Commit.

## Task 8: Abroad/foreign events (`content/events/foreign.json`)

**Files:** Modify (5 → 10). Add 5 `requiresForeign: true` events — mercenary contract abroad, an exile's trade, a foreign offer, a consul route. Use `clans_joined`, `fameDelta`. Note these only surface while `currentRegion !== homeRegion`. Commit.

## Task 9: Clan events (`content/events/clans.json`)

**Files:** Modify (9 → 18). Add 7 clan-flavored events gated by `requiresClanId`, `requiresNoClan`, `requiresHuntedBy`, betrayal, and renewal. Use `joinClanId` / `leaveReason` / `stipend`. Include a rival-clan poach setup, a renewal, a `requiresHuntedBy` ambush window. Every event ≥1 non gated. Commit.

## Task 10: World events (`content/events/world.json`)

**Files:** Modify (10 → 19). Add 9 `type:"world"` entries with `worldEventHeadline` and a single `acknowledge` choice. Themes: a fallen lord's trial, a new guild's x, a volcano ash-storm, a sea-beast on a port, rival-guild bankruptcy, a frost winter, an observed starfall, a new isle surfacing, a cursed caravan. Use `{slot:worldLocation}` / `{slot:guildName}`. Commit.

## Task 11: Destiny events (`content/events/destiny.json`)

**Files:** Modify (3 → 6). Add 3 `type:"destiny"` events. Each has a risky long-term option (big permanent stat swing + `unlocksEventPool`/`locksEventPool`) and a safe modest option. Themes: a faerie-blood bargain, a glass-voyant curse, the reborn mirror (no death by age, still killable). `minAge` ~ 26–60, `weight:3`. Do NOT grant real invincibility. Commit.

## Task 12: Regions (`content/regions.json` + slot `regionVariant`)

**Files:** Modify `content/regions.json` (6 → 10) and `content/slots.json` `regionVariant` (grow in sync).

Append 4 new region keys (keep the existing 6):

```json
{ "marsh": { "en": "The Fetid Marsh", "es": "El Pantano de la Quema" } }
{ "steppe": { "en": "The Ember Steppe", "es": "La Estepa de Brasas" } }
{ "tundra": { "en": "The Frosthorn Range", "es": "La Cordillera del Cuerno Helado" } }
{ "caverns": { "en": "The Luminous Caverns", "es": "La Caverna Luminosa" } }
```

To slots, add `+1` `regionVariant` entry per new region matching the village festival pattern (e.g. `"the Marsh's frog fair"`, `"the Steppe's cinder games"`).

- [ ] **Steps:** edit both, `pnpm i18n:check` green, `pnpm test:server` green, commit `feat(content): add four regions`.
- Onboarding note: DONE — Task 13 runs straight after.

## Task 13: Region-flavored events (`content/events/regions.json`)

**Files:** Modify (6 → 12). MUST run AFTER Task 12. Add 6 region-gated events via `requiresRegion` on the now-existing/new region ids, or `requiresForeign`/`requiresHomeRegion`. Each is a local-color beat (a marsh harvest, a steppe caravan, a tundra feast, a cavern guild). Reward `quests_completed`, reputation. Commit.

## Task 14: Relics (`content/minigames/relics.json`)

**Files:** Modify (1 → 2). Copy the interactive `memotest` entry exactly (resolution.type `interactive`, `game:"memotest"`, `primaryStat:"intelligence"`, 4 outcomes), new `id`+`opponent`+`narrative`. Bump `relic_memotest_wins` in `countersDelta`. Commit.

## Task 15: Urns (`content/minigames/urns.json`)

**Files:** Modify (1 → 2). Copy the `grid` trap-urn game (`grid_gamble`, `cards` incl. a `trap`, 4 outcomes). New `id`, cards, narrative. Bump `survivals_won`/`urns_opened`. Commit.

## Task 16: Goblin interactive (`content/minigames/goblin_games.json`)

**Files:** Modify (2 → 4). Add a second `tictactoe` and a second `rps` interactive, following the existing interactive shape; new `opponent`/narrative; `goblin_games_won`. Commit.

## Task 17: Debate capstone (`content/minigames/debates.json`)

**Files:** Modify (1 → 2). Add a `weighted_hidden_match` debate with `isCapstone:true`, `capstoneKind:"debate"`, 4 `cards` each with a `tag` + wanted/punished, 4-outcome with `verdict` + `gradeDelta`. Theme: a new topic. Commit.

## Task 18: Elections (`content/minigames/elections.json`)

**Files:** Modify (6 → 12). Add 6 `isCapstone:true`, `capstoneKind:"election"` conflict wins by the weighted_hidden_match formula (mayoral, guild, clergy, sword-order, merchant, crown). 4-5 cards each, `verdict`/`gradeDelta`, 3 tiers. Reuse `courtly_won`/`negotiations_won`. Commit.

## Task 19: Duels (`content/minigames/duels.json`)

**Files:** Modify (9 → 18). Add 9 `weighted_hidden_match` duels, 4 weapon-grid cards, `statInfluence` (strength/dexterity), tuned `baseWinChance`, 4 outcome tiers. Reuse `duels_won`, `clutch_duels`, `battles_won`, `drinks_won`. Vary the setting (samurai, death-circle, dragon-voyeur, pugilist, veteran). Commit.

## Task 20: Activities (`content/minigames/activities.json`) — the big file

**Files:** Modify (16 → 32). Add ~16 activity minigames across `weighted_hidden_match` / `memory_match` / `timing_bar`, a few `grid_gamble`. Map each to a listed counter: `smithing_won`, `alchemy_won`, `fishing_won`, `board_games_won`, `hunts_won`, `survivals_won`, `chases_won`, `archery_won`, `drinks_won`. No new `game` kinds. Verify every counter exists in the canonical list. Commit.

## Task 21: Shop (`content/shop.json`)

**Files:** Modify (16 → 32). Add ~16 items across `retinue` (passive `effect`), `consumable` (`duration`), and `luxury` (`requiresArc`). Worked example:

```json
{
  "id": "quartermaster",
  "category": "retinue",
  "name": { "en": "Quartermaster", "es": "Furriel" },
  "cost": 2400,
  "effect": { "type": "fatigueModifier", "value": -0.2 },
  "icon": "📦",
  "flavor": {
    "en": "Your camp never runs lean.",
    "es": "Tu campamento nunca anda corto de recursos."
  }
}
```

Use valid `ShopEffectType` values (`injuryRiskModifier`, `fatigueModifier`, `momentumRecoveryModifier`, `ageDeclineDelay`, `offerQualityModifier`) or `null`. Lux full `the list` via `/buy` will handle them. Commit.

## Task 22: Archetypes (`content/archetypes.json`)

**Files:** Modify (5/class → 8/class). Append 3 archetypes per existing class (each permanent, mainly a flat +8 to one stat, or +4/+4 split, matching pool balance). Do not duplicate an existing `id`. Keep icons. Commit after `pnpm i18n:check` + `pnpm test:server`.

## Task 23: New classes (`content/classes.json` + `content/archetypes.json` pools)

**Files:** Modify `content/classes.json` (6 → 9) AND append a new key per new class in `content/archetypes.json` with ≥4 archetypes each.

Add 3 new classes (sum of `base` ≈ 27, description/name both locales, valid `startingFaction` pointing at an existing faction id): `monk` (str7 dex7 con6 int5 cha5, gold 110, icon `hand`), `warlock` (str4 dex6 int6 con5 cha6, gold 140, icon `orbit`), `shaper` (str4 dex6 con6 int8 cha6, gold 130, icon `sparkles`).

- [ ] **Step 1:** Edit `classes.json` append 3 classes.
- [ ] **Step 2:** Edit `archetypes.json` append a pool key per new class.
- [ ] **Step 3:** `pnpm i18n:check` → green.
- [ ] **Step 4:** `pnpm test:server` → green.
- [ ] **Step 5:** `git add content/classes.json content/archetypes.json && git commit -m "feat(content): add monk, warlock, shaper classes"`.

---

## Self-Review

- **Coverage:** every content file except `achievements.json` maps to exactly one task above. A deliberate exception: `factions.json` is NOT expanded here (it is a fixed 25-faction balance list whose `wealth` drives gold/stipend math and tests); expanding it mis-scopes into balance tuning, so it is the one authored file not doubled. If a doubled factions list is still desired, add a dedicated task routing every new faction through the roster test.
- **Placeholder scan:** zero `TBD`s; every task states exact files, current/new counts, the full entry set, and at least one worked JSON example for the file family.
- **Consistency:** all counters, `resolution.type`, `game` kinds, `rarity`, `tag`, `arc`, and `ShopEffectType` literal are pulled from `shared/types.ts`. `requiresRegion`/`requiresForeign` only reference region ids that exist after Task 12. `Task 3`–`5` each hand in ≥1 non-dep `requiresStat` so the weak-char test passes.

## Execution handoff

Plan saved. After rollout (recommended subagent-driven, one task per subagent with review between) each task ends both checks green and one commit. The two hard orderings to honor: **regions (Task 12) before region-gated events (Task 13)** and **new classes (Task 23) last**.

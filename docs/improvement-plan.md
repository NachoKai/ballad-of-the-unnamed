# Ballad of the Unnamed — Improvement Plan

> Based on: `docs/fantasy-cyoa-rpg-spec.md` (810 lines), `docs/el-idolo-reference-notes.md` (172 lines), and full codebase audit.
>
> Current state: core game loop works end-to-end (creation → events → death/retirement → leaderboard). 15 events, 14 minigames, 36 achievements, 6 classes, bilingual EN/ES, deterministic RNG, server-authoritative, deployed on Neon + Vite + Express.

## Status Legend

| Marker | Meaning                                   |
| ------ | ----------------------------------------- |
| ✅     | Implemented & verified (engine + content) |
| 🟡     | Partially implemented (see notes)         |
| ⬜     | Not implemented / not started             |
| ❌     | Removed / intentionally out of scope      |

> Last audit: 2026-07-30. Verified against the codebase (server engine, content files, routes, store, UI).

---

## Bugs & Immediate Fixes (do first)

| #   | Status | Issue                                                                                                                           | File                            | Fix                                                                                                |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| B1  | ✅     | `luminari` & `gildedtongue` factions referenced in `classes.json` but absent from `factions.json`                               | `content/classes.json:100,120`  | Add both factions to `content/factions.json` or remove them                                        |
| B2  | ✅     | `retired_hero` achievement condition `"value": "retired"` doesn't match engine's `"peaceful_retirement"` / `"other_retirement"` | `content/achievements.json:219` | Fix to `"peaceful_retirement"` or add a separate condition type that checks `status === "retired"` |
| B3  | ✅     | `legacy_score` excluded from `computeScore()` despite being in the spec formula                                                 | `shared/config.ts`              | Add parameter and weighting                                                                        |
| B4  | 🟡     | Lucide icons on minigame cards may not exist in `AchIcon.tsx` mapping (21 icons mapped, minigames use ~40+ unique icon names)   | `src/components/AchIcon.tsx`    | Audit minigame card icons and add missing Lucide mappings; or use a fallback icon                  |
| B5  | ✅     | No server-side tests at all                                                                                                     | —                               | Add engine unit tests for `resolveChoice`, `resolveMinigame`, `rollDeath`, `selectEvent`           |
| B6  | ✅     | `personality_log` table exists in schema but no code writes to it                                                               | `server/db/schema.sql`          | Personality tags are tracked in `c.personality` but never persisted to the normalized table        |

**Status notes:**

- B1/B2/B3/B5: implemented (verified via engine tests + content audit).
- B4: 58+ Lucide icons mapped + `Sparkles` fallback prevents crashes; **2026-07-30 audit added `arrow-right`, `book-open`, `circle`, `clock`, `door-open`, `heart` — all 54 minigame icon names now resolve**.
- B6: fixed 2026-07-30 — `persistCharacterSnapshot()` in `server/store/runStore.ts` upserts the `characters` row and `personality_log` rows when a run finishes (`/choose` end-of-run path).

---

## Phase 1: Character & Identity Depth

Goal: Make each character feel distinct at creation and throughout the run, not just a stat bundle.

### 1.1 Starting Archetype Roll ✅

**Spec ref**: §Starting archetype roll (p50-64), El Ídolo ref: §1 (3-card archetype roll)

Create `content/archetypes.json` — 5-8 archetypes per class, each giving a flat +8 to one stat:

```json
{
  "warrior": [
    {
      "id": "berserker",
      "icon": "🪓",
      "name": { "en": "Berserker", "es": "Berserker" },
      "flavor": { "en": "You live for the kill.", "es": "Vivís para el golpe final." },
      "statDeltas": { "strength": 8 }
    },
    { "id": "guardian", "icon": "🛡️", "statDeltas": { "constitution": 8 } },
    { "id": "duelist", "icon": "⚔️", "statDeltas": { "dexterity": 8 } }
  ],
  "wizard": [
    { "id": "pyromancer", "icon": "🔥", "statDeltas": { "intelligence": 8 } },
    { "id": "enchanter", "icon": "✨", "statDeltas": { "charisma": 8 } }
  ]
}
```

**Implementation**:

- Add `starting_archetype_id TEXT` to `CharacterState` (already in schema)
- In `createCharacter()`, after class init, draw 3 from the class pool via seeded RNG
- Send archetype cards to client, let player pick one
- Apply the +8 permanently, no respec ever

**UI**: New step in `CreationScreen` after class pick — show 3 cards, player clicks one, that's the final character creation step.

**Achievement tie-in**: "One True Blade" — already spec'd, auto-unlocked since no respec exists.

### 1.2 Personality-Tag Gameplay Effects 🟡

**Spec ref**: §Personality/response system (p67-76), El Ídolo ref: §7 (press conference minigame)

Status: engine support ✅ (`wantedTags`/`punishedTags` synergy, tag-based epithets) — `press_conference` minigame subtype ⬜ not implemented. **2026-07-30: authored `content/events/personality.json` — 5 social events (`court_bard_song`, `road_merchant_escort`, `tavern_knight_solicit`, `court_strategist_war`, `tavern_commander_advice`) using `wantedTags`/`punishedTags` to make past personality choices amplify or penalize outcomes.**

Tags are tracked but currently have zero gameplay effect. Wire them into:

1. **Event gating**: `requiresTags` already filters events — but tags should also affect _which choices_ in an event get bonuses/penalties. Each event choice can declare `wantedTags` (bonus) and `punishedTags` (malus).

   **Schema addition** to `ChoiceContent`:

   ```json
   {
     "id": "aggressive",
     "tag": "Aggressive",
     "wantedTags": { "Humble": 0.1, "Professional": 0.05 },
     "punishedTags": { "Cocky": -0.1 }
   }
   ```

2. **Negotiation Gambit minigame**: Already uses personality tags as cards — make the hidden "NPC disposition" partially determined by the player's own tag history (an NPC reacts better to someone who's consistently been Humble if that's what they value).

3. **Press conference event type**: A new minigame subtype `press_conference` where 3 questions each have 4 tag-options, and the "correct" read is partly stat-gated (Liderazgo model: Charisma + Fame influence what the NPC "wants" to hear).

4. **Epilogue flavor**: Tag history already feeds character personality — render a nicknames / reputation epithet based on most-used tags.

### 1.3 Market Value as Separate Stat ✅

**Spec ref**: §Character/stats (p38-39), El Ídolo ref: §2 (Valor vs Ganado)

`market_value` and `market_value_peak` already exist in `CharacterState` and schema but are never updated. Connect them:

- Start at `startingGold * 2`
- Every season, adjust based on: `(powerLevel * 50) + (fame * 10) + (achievements_count * 200) - (age_factor)`
- Age factor: after 35, deduct `(age - 35) * 100`
- Fluctuates independently of `gold` — a powerful old hero may have low gold but high market value

Surface in HUD as a separate number from gold.

### 1.4 Stamina Depletion/Recovery Loop ✅

**Spec ref**: §Character/stats (p35 — Stamina/Vigor)

Status: turn cost + fatigue penalty (<20 stamina) ✅. **2026-07-30: forced recovery implemented — `deductStamina()` tracks `staminaZeroStreak`; after `GAME_CONFIG.forcedRecoveryTurns` (3) consecutive turns at 0 stamina, `buildServedEvent()` serves a synthetic `__forced_recovery__` rest event that restores `forcedRecoveryRestore` (40) stamina.** Recovery content remains thin (only the forced-rest path + camp cook item) — see open items below.

`staminaDelta` exists on choices but nothing depletes/replenishes stamina systematically. Add:

- Each turn costs `1` stamina base + `staminaCost` from the chosen event type
- If stamina drops below 20, apply a `-0.1` to all stat gains (fatigue penalty)
- Recovery: shop items (camp cook = passive recovery), rest events in content bank
- If stamina stays at 0 for 3+ consecutive turns, force a recovery event that skips a turn

---

## Phase 2: Economy & Progression

Goal: Give gold a purpose beyond score, create meaningful spending decisions.

### 2.1 Full Shop System (3 Tiers) ✅

**Spec ref**: §Shop/economy (p662-735), El Ídolo ref: §10 (three shop tiers)

Build the complete shop from the spec:

**Backend**:

- Create `content/shop.json` with 5 Retinue + 5 Consumables + 6 Luxury items (already spec'd in tables)
- Add `POST /api/game/shop` route: returns items available at current arc/age
- Add `POST /api/game/buy` route: validates gold, adds to inventory, applies effect
- Add `expiresAtTurn` to inventory for consumables, cleanup at season boundary
- Effect types: `injuryRiskModifier`, `fatigueModifier`, `momentumRecoveryModifier`, `ageDeclineDelay`, `offerQualityModifier`

**Inventory persistence**:

- Add `inventory` to `CharacterState` with `{itemId, qty, expiresAtTurn?}`[]
- Persist in runs JSONB alongside character

**Frontend**:

- Shop button in HUD → modal/panel with 3 tabs (Retinue / Consumables / Luxury)
- Show owned items with active effects in HUD row (El Ídolo ref: §10 — persistent loadout icons)
- Chapter-gated: Adventurer items only, Kingdom Hero unlocks more, Legend unlocks top tier

### 2.2 Chapter-Gated Event Progression ✅

**Spec ref**: §Career arcs & chapters (p449-490)

`characters.current_arc` exists but is never set or used. Implement:

- After age thresholds, set `current_arc`: child → adventurer(16) → mercenary(26) → kingdom_hero(40) → legend(60) → old_hero(80)
- Each arc unlocks/locks event pools via `requiresArc` / `excludeIfArc` in event schema
- Arc gates shop items (2.1), world events (3.3), and Destiny cards (2.3)

**Schema addition** to `EventContent`:

```json
{
  "requiresArc": ["kingdom_hero", "legend"],
  "excludeIfArc": ["child", "adventurer"]
}
```

**Season loop** (structural change for engine.ts):

```
Preparation (preseason stat cards)
    ↓
World Event (ambient, see 3.3)
    ↓
Quest / narrative event (core content bank)
    ↓
Mini-game (sometimes)
    ↓
Season Summary (newspaper card, see 2.3)
    ↓
Offers / Shop (clan offers, shop access)
    ↓
Next season
```

Currently the engine does: event → choice → resolve → event. This phase restructures turns into seasons of ~5 turns with the full loop.

### 2.3 Season Summary / Newspaper Card ✅

**Spec ref**: §Season Summary (p490), El Ídolo ref: §3 (Potrero Deportivo recap cards)

After every season (every N turns), instead of a normal event, serve a summary card:

- **Headline**: dynamic all-caps based on the season's biggest event
- **Nota de la temporada**: season report grade (separate from Power Level)
- **Stat recap**: What changed this season (▲/▼ deltas)
- **Rival update**: what the archrival did this season (see 3.2)
- **World event digest**: this season's ambient events (see 3.3)
- **Achievement unlocks**: any achievements earned

**Implementation**: synthetic event type `season_summary` generated server-side, similar to `retirementOfferEvent()`. Single "Continuar" button.

### 2.4 Destiny Cards ✅

**Spec ref**: §Destiny cards (p400-407)

Rare standalone events (roughly every 8-10 in-game years) offering permanent, run-defining transformations:

- `type: "destiny"` in event schema
- Choices can lock/unlock entire event pools via `unlocksEventPool` / `locksEventPool`
- Cannot make character immortal — "no longer dies of old age" removes age-decline death, not violent death
- Gated by seeded RNG like everything else

---

## Phase 3: Social & World Systems

Goal: The world feels alive. The player has rivals, friends, and a wider world that moves without them.

### 3.1 NPC Relationships ✅

**Spec ref**: §Relationships (p638-660), El Ídolo ref: §4 (rival system)

**Schema** (already in spec: `relationships` table):

- `character_id`, `npc_id`, `npc_role`, `affinity` (-100 to 100), `peak_affinity`, `last_seen_turn`

**Implementation**:

- Events can `introducesRelationshipId` — creates a relationship row on first encounter
- Events can `requiresRelationshipId` — gates content on knowing that NPC
- Choices can have `affinityDelta` — modifies the relationship
- Affinity tiers: Stranger → Acquaintance → Friend/Ally → Devoted (positive) / Wary → Rival → Nemesis (negative)
- Events can have outcomes gated on relationship status (an ally helps you, a nemesis sabotages)
- Life events > combat events: content bank should skew toward personal/social content

**Achievements**: "Bonded for Life" (max affinity), "Burned That Bridge" (min affinity), "Silver Tongue" (talked out of fights via Charisma)

### 3.2 Archrival System 🟡

**Spec ref**: §Archrival (p562-589), El Ídolo ref: §4 (full detail)

Status: rival generation, parallel advancement, HUD widget, season updates, end-game comparison, and direct encounters ✅. `{rivalName}` slot rendering fixed 2026-07-30. ⬜ Not done: separate `rivals` table (rival is stored inline in the run JSONB) and a fully parallel RNG stream (rival shares the run's single deterministic RNG).

A rival is a second character running in parallel, fully simulated through the same deterministic RNG.

**Implementation**:

1. Generate rival at character creation (random name from name pool, same age, different class if possible)
2. Store `rivals` table (already spec'd in schema)
3. At each season boundary, advance rival using a parallel RNG stream from the same seed:
   - Roll random stat bumps for the rival
   - Check if the rival switches factions, gains achievements, etc.
4. **Persistent HUD widget**: "⚔️ Score vs [RivalName]" with running comparison
5. **Season summary update**: reports what the rival did this season
6. **Direct encounters**: rare events using the Duel/Negotiation minigame systems tagged `involvesRival: true`
7. **Per-chapter callback events**: the rival hits milestones reported in the newspaper even without player involvement
8. **Epilogue**: full side-by-side comparison across multiple metrics

**Comparison metric**: `counters.battles_won + counters.quests_completed` vs rival's equivalent

### 3.3 World Events ✅

**Spec ref**: §World events (p492-496), El Ídolo ref: §6 (event categories)

Once per season, roll 1-2 world events from their own content pool:

- A kingdom falls, a dragon is slain by someone else, a plague spreads, a volcano erupts, a rival guild collapses
- Some are conditioned on player state (a guild the player weakened is more likely to collapse)
- Surface in the Season Summary newspaper alongside the player's own recap

**Content file**: `content/events/world.json` with `type: "world"` events, mostly flavor text with small stat nudges to the world at large.

### 3.4 Clans / Faction Allegiance 🟡

**Spec ref**: §Clans (p591-633), El Ídolo ref: §11 (transfer/clan market)

Status: join/leave/betray engine, `hunted_by` system, clan offer/poach cards, and solo path (`requiresNoClan`) ✅. 🟡 No authored content events yet use `joinClanId` / `leaveReason` / `requiresNoClan` — the mechanics are engine-ready but not exercised by the content bank.

Already partially implemented (factions exist in content, starting faction per class). Extend:

**Schema** (already spec'd): `clans` table, `clan_memberships` table

**Implementation**:

- Player can join a clan (offer events at season boundaries)
- Can leave amicably (reputation preserved) or betray (reputation crash + hunted events)
- Betrayal triggers: reputation crash at old clan, `hunted_by` flag, ambush events pool unlocks
- Solo path stays viable (no perks, no obligations, "Wanderer" achievement)
- Clan offer cards render like shop items (specialty + signing gold + perk)
- Fame-gated offers: low fame = minor local clans, high fame = rival clans poaching

### 3.5 Long-Term Flags & Narrative Callbacks ✅

**Spec ref**: §Long-term flags (p409-417), El Ídolo ref: §6 (event callbacks)

`characters.flags` JSONB exists but is never used. Implement:

- Choices set flags via `setsFlag: {key: string, payload?: object}`
- Events gate on `requiresFlag: {key: string, payload?: object}`
- "The Duke still remembers, twenty years later" — a flag set at the player insulting a noble at age 16 gates a confrontation event at age 36

**Content examples**:

- Insult a noble → 20 years later, the noble is now in power and remembers
- Save a village → years later, they send a gift or a call for help
- Make a dark pact → it surfaces at the worst possible moment

---

## Phase 4: Endgame & Legacy

Goal: The ending is a narratively satisfying capstone, not a stat dump.

### 4.1 Scripted Two-Stage Retirement Finale ✅

**Spec ref**: El Ídolo ref: §13 (the single most reusable idea in the whole transcript)

Replace the current single-paragraph retirement epilogue with a two-stage final scene:

- **Stage 1** ("The Last Chapter"): Hand-authored scripted narration unique to the ending type — the old warrior's last stand, the wizard's final meditation, the rogue's last heist. Includes a risky vs. safe choice with stated rewards:
  - Risky: +more Fame/Reputation if it works
  - Safe: +moderate Fame/Reputation, guaranteed payoff

- **Stage 2** (outcome reveal): The choice resolves, always with a poignant full-circle moment regardless of outcome. A young apprentice mirrors the player's own start. Then transitions to the epilogue.

**Implementation**: `generateFinale()` in a new `server/engine/finale.ts`, replacing the current minigame-less retirement resolution. The risky/safe choice reuses the existing choice-resolution infrastructure.

### 4.2 Legacy Score & Auto-Generated Epithets ✅

**Spec ref**: §Legacy (p429-439), El Ídolo ref: §14 (epilogue screen)

**Legacy pass** at death/retirement (before final scoring):

- Track: statues (from Legend-tier reputation), students/children (from relationships), settlements saved (from achievement flags), enemies created (from negative relationships), artifacts left behind (legendary inventory items)
- Render as an epilogue block (not just stat table)
- Fold `legacy_score` into `computeScore()` — already defined in the formula, just not implemented

**Auto-generated epithet**: Nickname gated by behavior archetype + most-associated faction:

- Legendary: "El Salvador de Thornwood" / "The Hero of Ironhold"
- Mercenary: "El Vendido de Greywater" / "The Gilded Blade"
- Traitor: "El Judas de Arcanum"
- Based on which achievements triggered and most-used personality tags

Store as `leaderboard_entries.epithet` (already in schema).

### 4.3 Rich Epilogue Screen ✅

**Spec ref**: El Ídolo ref: §14 (full anatomy)

Extend `EndingScreen.tsx` with:

- **Auto-generated epithet** + card/sticker frame tier based on peak reputation
- **Stats block**: Power Level, Valor pico (peak market value), total gold earned
- **"Your story, faction by faction"**: per-faction history with peak reputation tier
- **Rival final comparison**: full side-by-side multi-metric block
- **"Distinciones individuales"**: repeatable counted awards (Team of the Season x3 etc.)
- **"Finales perdidas"**: heartbreak section listing every lost decisive encounter
- **Achievement gallery**: personalized descriptions with actual numbers filled in
- **Score/ranking feedback**: "268k puntos de Gloria" + ranking position

### 4.4 Leaderboard Expansion ✅

**Spec ref**: §Ranking (p130-167), El Ídolo ref: §16 (leaderboard structure)

1. **Category leaderboards**: Richest, Most Titled, Oldest, Most Battles Won — served from same `leaderboard_entries` rows, different `ORDER BY`. Add route `GET /api/meta/leaderboard/:category`
2. **Elite-tier split-off**: Once a run crosses top 0.1%, move it to "Legendary" board. Configurable threshold. Implement in `insertLeaderboardEntry()`.
3. **Cross-run progression display**: Show "Career totals" across all runs (total achievements, total score) from aggregated `leaderboard_entries` rows
4. **Personal run history**: "Your last runs" tab showing the player's own recent runs (stored locally via run tokens or aggregated across all runs with same name)

---

## Phase 5: Content Volume & Polish

Goal: Enough variety for 20+ runs before repetition sets in.

### 5.1 Content Expansion Targets 🟡

**Spec ref**: — (volume targets)

Status: current counts as of audit — Events **32**/60, Minigames **17**/25, Achievements **44**/50, Archetypes **30**/30+, World events **10**/20+, Clans 25 factions (few with joinable perks), NPC relationships system in place but <15 recurring authored NPCs. Target numbers in the table below are the Phase 5 goals, not yet reached.

| Category                           | Current       | Phase 5 Target          |
| ---------------------------------- | ------------- | ----------------------- |
| Events (tavern/road/dungeon/court) | 32            | 60+                     |
| Minigames (duels + activities)     | 17            | 25+                     |
| Achievements                       | 44            | 50+                     |
| Slot pool entries                  | ~140          | 300+                    |
| Archetypes                         | 30            | 30+ (5-8 per class)     |
| World events                       | 10            | 20+                     |
| Clans                              | 25 (factions) | 10+ joinable with perks |
| NPC relationships                  | <15           | 15+ recurring NPCs      |

**Key principle**: Composability over raw count. Each authored event template + slot pools + age/class/fame gating produces many distinct felt variants. A few hundred templates should produce thousands of unique-feeling runs.

### 5.2 Minigame Type Expansion ✅

**El Ídolo ref**: §8 (5 distinct minigame types, currently only 1 implemented)

Status: `timing_bar`, `grid_gamble`, and `memory_match` subtypes are implemented in the engine (`MinigameSubtype`) with authored content in `content/minigames/activities.json`. All three originally planned subtypes ✅.

Currently only `weighted_hidden_match` exists. Add these subtypes:

1. **Timing bar** (`subtype: "timing_bar"`): marker slides along bar, player taps to stop in green zone. Primary stat widens the green zone (makes it easier).
2. **Grid gamble** (`subtype: "grid_gamble"`): N goals hidden in a grid, pick M cells. No stat influence — pure luck for the highest-stakes moments. Losing narrowly still framed as achievement.
3. **Memory match** (`subtype: "memory_match"`): face-down tile board, flip pairs, limited lives. Stat-gated bonus life (e.g. `Intelligence >= 80 → +1 life`).

### 5.3 Achievement Families 🟡

**El Ídolo ref**: §15 (graduated tiers)

Status: tiered families exist (duels 1/5/10, gold 500/2000, fame 50/100/150, age 40/60, quests 5/10/20, battles 15/30/50, reputation 65/78/99). 🟡 Thresholds don't match the spec (gold isn't 1K/10K/100K, no age-80 tier, battles aren't 10/50/100).

Tiered achievement families on the same underlying stat:

- Gold: 1K / 10K / 100K (not just a single threshold)
- Age: 40 / 60 / 80 (not just "survive to old age")
- Battles won: 10 / 50 / 100
- Fame: 25 / 50 / 75 / 100

Each tier is its own unlockable, keeping the achievement dopamine loop alive longer.

### 5.4 Cross-Run Meta-Collection ✅

**El Ídolo ref**: §15 (Vitrina de copas — 54 collectible trophies across runs)

Status: Trophy Hall screen (`CollectionScreen.tsx`) + `GET /api/meta/collection` ✅. **2026-07-30: completion percentage added — the endpoint now also returns `uniqueClasses`, `uniqueAchievements`, and a `completion` block (`endings`/`factions`/`classes`/`achievements` + overall `collected/total/pct`) computed against the content catalog; `CollectionScreen` renders a progress-bar block plus Classes and Achievements tag sections.**

A "Trophy Hall" screen accessible from the main menu:

- Every unique encounter type completed, every faction joined, every ending type achieved across ALL runs
- Shows completion percentage (e.g. "42/70")
- Master collector achievement for 100%
- Data aggregated from all `leaderboard_entries` rows with matching metadata

---

## Phase 6: Analytics (Optional)

### 6.1 Analytics ⬜

**Spec ref**: §Do we need an LLM? (p23-25)

Status: not started. No telemetry, event tracking, or run-data analytics exist. The original AI Narration section (6.1) was removed by project decision — no LLM/AI features are planned.

- Track per-run metrics: average turn duration, most-picked personality tags, most common ending types, achievement completion rates
- Content bank analytics: which events are never seen (weight tuning), which minigames are skipped most
- Balance tuning: use real run-data distribution to set leaderboard thresholds and score weights

---

## Implementation Order Summary

```
Phase 0 (Bugs):    B1-B6 ✅ (B4 partially) — 1-2 days
Phase 1 (Identity): 1.1 ✅, 1.2 🟡, 1.3 ✅, 1.4 ✅ — 1 week
Phase 2 (Economy):  2.1 ✅, 2.2 ✅, 2.3 ✅, 2.4 ✅ — 1.5 weeks
Phase 3 (Social):   3.1 ✅, 3.2 🟡, 3.3 ✅, 3.4 🟡, 3.5 ✅ — 2 weeks
Phase 4 (Legacy):   4.1 ✅, 4.2 ✅, 4.3 ✅, 4.4 ✅ — 1 week
Phase 5 (Content):  5.1 🟡 (32/60 events etc.), 5.2 ✅, 5.3 🟡, 5.4 ✅ — ongoing
Phase 6 (Optional): 6.1 ⬜ Analytics — if/when needed
```

Each phase is self-contained and shippable. No phase blocks any other — content can be authored in parallel with systems work.

Remaining work by priority:

1. 🟡 **1.2 (part)** — add `press_conference` minigame subtype (5 personality-tag events with `wantedTags`/`punishedTags` authored ✅)
2. 🟡 **1.4 (part)** — more authored rest/recovery events using `staminaDelta` beyond the forced-recovery path
3. 🟡 **3.2** — separate `rivals` table + parallel rival RNG stream
4. 🟡 **3.4** — author events using `joinClanId` / `leaveReason` / `requiresNoClan`
5. 🟡 **5.1/5.3** — content volume targets + spec-aligned achievement tiers
6. 🟡 **5.4 (part)** — per-encounter completion tracking (overall % now implemented)
7. ⬜ **6.1** — analytics (optional)

Additional feature shipped 2026-07-30: **no consecutive event repeats** — `selectEvent` now tracks `CharacterState.lastEventId` and excludes it from the selection pool (falling back only when it's the sole eligible event), so the same event/minigame never appears two turns in a row.

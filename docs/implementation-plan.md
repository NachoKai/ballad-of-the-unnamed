# Ballad of the Unnamed — Implementation Plan

> **Based on**: audit of what's in the codebase vs. what's in `docs/fantasy-cyoa-rpg-spec.md` and `docs/el-idolo-reference-notes.md`.
>
> **Each step is**: self-contained, testable, ordered by dependency. Start at the top and work down.

---

## How to use this plan

Each block says exactly what files to touch, what to change, and how to verify. Work them in order — later steps assume earlier ones are merged.

---

## Step 1: Faction & Personality HUD

**Goal**: Show current faction reputation and top personality tags in the HUD during gameplay so the player can see their standing at a glance.

### Files to change

| File                     | Change                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/components/Hud.tsx` | Add `RepPill` showing primary faction name + tier + value. Add `TagPill` showing top 3 personality tags. |
| `src/i18n/strings.ts`    | No new strings needed (reuses existing `reputation` etc.)                                                |

### Hud.tsx — what to add

```tsx
// After import block, add REPUTATION_TIERS constant:
const REPUTATION_TIERS = [
  { min: 0, id: "outcast" },
  { min: 5, id: "stranger" },
  { min: 20, id: "known" },
  { min: 35, id: "acquaintance" },
  { min: 50, id: "respected" },
  { min: 65, id: "notable" },
  { min: 78, id: "renowned" },
  { min: 90, id: "legend" },
  { min: 99, id: "myth" },
]

// Helper: resolve tier from value
function reputationTier(value: number): string

// Helper: top 3 personality tags
function personalitySummary(p: Record<string, number>): string[]
```

**In the component body** — derive primary rep and top tags:

```tsx
const primaryRep =
  c.reputations.length > 0
    ? c.reputations.reduce((a, b) => (a.peakValue >= b.peakValue ? a : b))
    : null
const topTags = personalitySummary(c.personality)
```

**In the JSX** — add these two pills inside `<StatsStrip>`:

```tsx
{
  primaryRep && (
    <RepPill>
      {primaryRep.faction} · {reputationTier(primaryRep.value)} [{primaryRep.value}]
    </RepPill>
  )
}
{
  topTags.length > 0 && <TagPill>{topTags.join(" · ")}</TagPill>
}
```

**Styled components** to add at end-of-file:

- `RepPill` — gold border, gold text, uppercase
- `TagPill` — sage border, sage text

### Verification

1. Create a character, play a few turns, open the HUD
2. A gold pill should show your primary faction + tier + numeric value
3. A green pill should show up to 3 personality tags you've used

---

## Step 2: Wire Shop Item Effects into Engine

**Goal**: Purchased retinue and consumable items actually change gameplay math (fatigue, injury risk, momentum, age decline, offer quality).

### Files to change

| File                       | Change                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `server/engine/helpers.ts` | Add `getActiveModifier()`, update `deductStamina()`, add `applyAgeDecline()`                                |
| `server/engine/engine.ts`  | Use modifiers in `rollDeath()`, `ageUp()`, `updateMomentum()` (already uses helpers), `generateClanOffer()` |

### helpers.ts detail

**New function** `getActiveModifier(c, effectType)`:

- Hardcode a `MOD_MAP` from item id → `{ type, value }` for all shop items
- Loop over `c.inventory`, sum `value * qty` for matching items

**Modify** `deductStamina(c, extraCost)`:

```ts
const fatigueMod = getActiveModifier(c, "fatigueModifier")
const cost = Math.max(0, STAMINA_BASE_COST + extraCost + fatigueMod) // fatigueMod is negative
c.stamina = Math.max(0, c.stamina - cost)
```

**New function** `applyAgeDecline(c)`:

- `ageDeclineStart = GAME_CONFIG.ageRiskStart + getActiveModifier(c, "ageDeclineDelay")`
- If `c.age > declineStart`, every 3 years past that threshold, lose 1 from each physical stat (str/dex/con)

### engine.ts detail

**Modify** `rollDeath(c, pendingInjuryRisk, rng)`:

```ts
const shopMitigation = getActiveModifier(c, "injuryRiskModifier")
const conMitigation = Math.min(0.4, c.constitution * 0.01)
const injuryChance = Math.max(0, pendingInjuryRisk - conMitigation + shopMitigation)
// shopMitigation is negative so it reduces chance
```

**Modify** `ageUp(c)` — add `applyAgeDecline(c)` after age increment

**Modify** `updateMomentum(c, netStatGain)` (in helpers.ts):

```ts
const momentumMod = getActiveModifier(c, "momentumRecoveryModifier")
const adjusted = netStatGain + (c.momentum === "falling" ? Math.abs(momentumMod) : 0)
```

**Modify** `generateClanOffer` — multiply signing gold by `(1 + getActiveModifier(c, "offerQualityModifier"))`

### Verification

1. Buy a `camp_cook` from the shop
2. Play 3-4 turns — stamina should deplete slower
3. Buy a `battle_healer` — injury events should be less lethal
4. Buy a `weapon_master` — stat decline should start later

---

## Step 3: Fix Two-Stage Retirement Finale

**Goal**: `generateFinaleStage2()` is called and its narrative is shown to the player, making retirement a proper two-act capstone.

### Problem

`generateFinaleStage2()` exists in `server/engine/finale.ts` but is **never called**. The `resolveChoice` function sets `ended = true` immediately when the player picks a finale choice, skipping stage 2.

### Solution: Two-turn finale flow

**Add field to** `CharacterState` in `shared/types.ts`:

```ts
finaleStage2Choice?: { endingType: EndingType; risky: boolean }
```

**Initialize in** `createCharacter()` in `engine.ts`:

```ts
finaleStage2Choice: undefined,
```

**Modify** `resolveChoice()` in `engine.ts` — when `event.id === "__finale__"`:

```ts
// Instead of ended = true, set up stage 2
endingType = c.pendingFinaleType
c.pendingFinaleType = undefined
c.finaleStage2Choice = { endingType, risky: choice.id === "finale_risky" }
ended = false
```

**Modify** `buildServedEvent()` in `engine.ts` — BEFORE the `pendingFinaleType` check, add:

```ts
if (c.finaleStage2Choice) {
  const stage2 = generateFinaleStage2(c, ...)
  return { event: { id: "__finale_outcome__", ...single "continue" choice... }, served }
}
```

**Add handler in** `resolveChoice()` for `__finale_outcome__`:

```ts
if (event.id === "__finale_outcome__") {
  endingType = c.finaleStage2Choice?.endingType
  c.finaleStage2Choice = undefined
  ended = true
}
```

### Verification

1. Play a character to retirement age (40+)
2. Accept retirement offer
3. Stage 1: you should see the risky/safe finale choice
4. Pick one → Stage 2: outcome narrative appears with a "The end" button
5. Click continue → epilogue and score

---

## Step 4: Author Rival Confrontation Events

**Goal**: The rival isn't just background — they can appear in authored events.

### Files to change

| File                          | Change                                                         |
| ----------------------------- | -------------------------------------------------------------- |
| `content/events/dungeon.json` | Add `dungeon_rival_encounter` event with `involvesRival: true` |

### Event structure

```json
{
  "id": "dungeon_rival_encounter",
  "minAge": 16,
  "maxAge": 99,
  "weight": 4,
  "involvesRival": true,
  "location": "dungeon",
  "choices": [
    { "id": "challenge", "rarity": "rare", "countersDelta": { "battles_won": 1, "duels_won": 1 } },
    { "id": "parley", "rarity": "uncommon", "statDeltas": { "charisma": 2 } }
  ]
}
```

- `involvesRival: true` triggers the eligibility check in `isEligible()`
- The engine already checks this — just need authored content

### Verification

1. Play 10+ turns
2. Eventually the rival encounter event should fire
3. Narrative should mention the rival by name

---

## Step 5: Author NPC Relationship Events

**Goal**: Introduce recurring NPCs through gameplay with `introducesRelationshipId`.

### Files to change

| File                       | Change                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `content/events/road.json` | Add `road_traveling_mentor` event introducing `ser_aldric` |

### Event structure

```json
{
  "id": "road_traveling_mentor",
  "minAge": 16,
  "maxAge": 60,
  "weight": 5,
  "choices": [
    {
      "id": "accept",
      "introducesRelationshipId": "ser_aldric",
      "introducesNpcRole": "mentor",
      "introducesNpcName": { "en": "Ser Aldric", "es": "Ser Aldric" },
      "affinityDelta": 20
    }
  ]
}
```

### Verification

1. Play until this event fires
2. Accept — the relationship should appear in `c.relationships`
3. Future events can `requiresRelationshipId: "ser_aldric"` to gate on knowing him

---

## Step 6: Author Long-Term Flag Events

**Goal**: Choices that set flags and later events that read them, creating narrative callbacks across the run.

### Files to change

| File                        | Change                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `content/events/court.json` | Add `court_insult_noble` (sets `insulted_baron_vex` flag) + `court_noble_callback` (requires it) |

### Event structure

```json
// Sets the flag:
{ "id": "court_insult_noble", "minAge": 16, "maxAge": 40, "weight": 5,
  "choices": [{
    "id": "insult_back",
    "setsFlag": { "insulted_baron_vex": { "turn": 0, "severity": "grave" } }
  }]
}

// Reads the flag 20+ years later:
{ "id": "court_noble_callback", "minAge": 30, "maxAge": 99, "weight": 3,
  "requiresFlag": { "insulted_baron_vex": { "turn": 0, "severity": "grave" } },
  "choices": [...]
}
```

### Verification

1. Early in a run (age 16-25), pick the "insult" choice in `court_insult_noble`
2. Play until age 30+
3. The `court_noble_callback` event should become eligible and fire
4. If you chose "stay silent" instead, the callback never fires

---

## Step 7: New Minigame Types

**Goal**: Three additional minigame subtypes beyond `weighted_hidden_match`: `timing_bar`, `grid_gamble`, `memory_match`.

### Files to change

| File                                | Change                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| `shared/types.ts`                   | Add `MinigameSubtype` type, extend `MinigameResolution` |
| `content/minigames/activities.json` | Add 3 new minigames with new subtypes                   |
| `server/engine/engine.ts`           | Update `resolveMinigame()` to handle different subtypes |

### Type extension

```ts
export type MinigameSubtype = "weighted_hidden_match" | "timing_bar" | "grid_gamble" | "memory_match"

export interface MinigameResolution {
  type: MinigameSubtype
  baseWinChance: number
  statInfluence: ...
  cardModifiers?: ...
  statThreshold?: number   // For timing_bar green zone width, memory_match bonus lives
  bonusLives?: number      // For memory_match
}
```

### Content to add

| Minigame                 | Subtype        | Resolution behavior                                                                      |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------------- |
| `timing_waterfall_dodge` | `timing_bar`   | Higher dexterity → wider green zone (bigger statInfluence). statThreshold: 20 for bonus. |
| `gamble_dragon_den`      | `grid_gamble`  | Pure luck — empty `statInfluence`, fixed `baseWinChance: 0.33`. High variance.           |
| `memory_ancient_tablets` | `memory_match` | Intelligence widens success window. `statThreshold: 20` grants bonus life.               |

### Engine update

In `resolveMinigame()`, after computing winChance, apply subtype-specific adjustments:

```ts
// timing_bar: stat gating widens green zone
if (res.type === "timing_bar" && res.statThreshold) {
  const primaryStat = event.primaryStat
  if (primaryStat && c[primaryStat] >= res.statThreshold) {
    winChance += 0.08 // wider success window
  }
}

// grid_gamble: no stat influence, pure luck
if (res.type === "grid_gamble") {
  // statInfluence is ignored by design, baseWinChance is the only factor
  critChance = 0.05 // lower crit chance for pure luck
}

// memory_match: stat threshold grants bonus success rate
if (res.type === "memory_match" && res.statThreshold) {
  const primaryStat = event.primaryStat
  if (primaryStat && c[primaryStat] >= res.statThreshold) {
    winChance += 0.1 // bonus from sharp mind
  }
}
```

### Verification

1. Play until you hit the waterfall dodge (`timing_bar`) — high dex should make it noticeably easier
2. Play until you hit the gambling den (`grid_gamble`) — outcome should feel random regardless of stats
3. Play until you hit the memory tablets (`memory_match`) — high int should improve odds

---

## Step 8: Graduated Achievement Families

**Goal**: Convert single-threshold achievements into tiered chains (bronze/silver/gold).

### Files to change

| File                        | Change                                                 |
| --------------------------- | ------------------------------------------------------ |
| `content/achievements.json` | Add tiered achievements following the existing pattern |

### Current examples already tiered

The game already has some tiered achievements:

- `first_blood` (1 duel) → `duelist` (5 duels) → `untouchable` (10 duels)
- `deep_pockets` (500 gold) → `merchant_prince` (2000 gold)
- `renowned` (50 fame) → `beloved` (100 fame) → `legend` (150 fame)
- `survivor` (age 40) → `elder` (age 60)

### Additional families to add

| Family          | Tier 1                                         | Tier 2                                           | Tier 3                                  |
| --------------- | ---------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Quests          | `quest_complete_1` (3 quests, uncommon)        | `quest_complete_2` (10 quests, rare)             | `quest_complete_3` (20 quests, epic)    |
| Battles         | `battle_hardened_1` (15 battles, uncommon)     | `battle_hardened_2` (30 battles, rare)           | `battle_hardened_3` (50 battles, epic)  |
| Reputation      | `respected_figure` (notable, 65 rep, uncommon) | `faction_icon` (renowned, 78 rep, rare)          | `living_myth` (myth, 99 rep, legendary) |
| Stamina mastery | `energetic` (stamina > 75, uncommon)           | `unstoppable` (never fatigued a whole run, rare) |                                         |

New achievements to add to `content/achievements.json`:

```json
{ "id": "quest_complete_1", "condition": { "type": "counter_gte", "key": "quests_completed", "value": 10 } }
{ "id": "quest_complete_2", "condition": { "type": "counter_gte", "key": "quests_completed", "value": 20 } }
{ "id": "battle_hardened_1", "condition": { "type": "counter_gte", "key": "battles_won", "value": 15 } }
{ "id": "battle_hardened_2", "condition": { "type": "counter_gte", "key": "battles_won", "value": 30 } }
{ "id": "battle_hardened_3", "condition": { "type": "counter_gte", "key": "battles_won", "value": 50 } }
{ "id": "respected_figure", "condition": { "type": "reputation_gte", "value": 65 } }
{ "id": "faction_icon", "condition": { "type": "reputation_gte", "value": 78 } }
{ "id": "living_myth", "condition": { "type": "reputation_gte", "value": 99 } }
```

### Verification

1. Play a run, earn quests and battles
2. The tiered achievements should unlock as you cross each threshold
3. Each tier feels like progress — the first is easy, the last is aspirational

---

## Step 9: Cross-Run Trophy Hall

**Goal**: A permanent server-side collection tracker showing every unique event type, faction joined, ending type achieved across ALL runs. Completion percentage display.

### Files to change

| File                                  | Change                                          |
| ------------------------------------- | ----------------------------------------------- |
| `server/store/runStore.ts`            | Add `getCrossRunCollection()` query             |
| `server/routes/meta.ts`               | Add `GET /api/meta/collection` route            |
| `src/api.ts`                          | Add `api.collection()` call                     |
| `src/components/CollectionScreen.tsx` | **New file** — trophy hall UI                   |
| `src/App.tsx`                         | Add "Trophy Hall" nav button and screen routing |
| `src/i18n/strings.ts`                 | Add trophy hall strings                         |

### Database query

```sql
-- Aggregate distinct event types, factions, and ending types across all runs
SELECT
  COUNT(DISTINCT pending_event->>'id') AS unique_events,
  COUNT(DISTINCT character->>'currentClanId') AS unique_factions,
  COUNT(DISTINCT r.ending_type) AS unique_endings,
  (SELECT json_object_agg(ev, true) FROM (
    SELECT DISTINCT pending_event->>'id' AS ev FROM leaderboard WHERE pending_event IS NOT NULL
  )) AS event_types_completed
FROM leaderboard;
```

### Collection categories

| Category         | What counts                                   | Source                               |
| ---------------- | --------------------------------------------- | ------------------------------------ |
| Events completed | Unique `event.id` encountered across all runs | `turn_log` or `leaderboard` metadata |
| Factions joined  | Unique `clan_id` in `clan_memberships`        | Run data                             |
| Ending types     | Unique `ending_type` (max 4)                  | `leaderboard`                        |
| Achievements     | Already tracked via localStorage              | Current system                       |

### Screen layout

```
┌──────────────────────────────────┐
│         🏆 Trophy Hall           │
│    "42/70 collected"             │
│                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐     │
│  │ Event │ │Faction│ │Ending│     │
│  │  15/30│ │  8/25 │ │  3/4 │     │
│  └──────┘ └──────┘ └──────┘     │
│                                  │
│  Recent unlocks:                 │
│  ✓ road_ambush (2 min ago)       │
│  ✓ greywater (1 hour ago)        │
└──────────────────────────────────┘
```

### Verification

1. Complete a run
2. Navigate to "Trophy Hall" from main menu
3. See completion stats for events, factions, endings
4. Complete a second run with different events — numbers should increase

---

## Step 10: Elite Leaderboard Split

**Goal**: Runs above the top 0.1% threshold automatically move to a "Legendary" leaderboard so they don't permanently occupy the top of the main board.

### Files to change

| File                                   | Change                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `shared/config.ts`                     | Add `LEGENDARY_THRESHOLD_PERCENTILE = 0.999` and `COMPOSITE_SCORE_ELITE_CUTOFF`   |
| `server/store/runStore.ts`             | Add `leaderboard_tier` to `insertLeaderboardEntry()`, add `getEliteLeaderboard()` |
| `server/routes/meta.ts`                | Add `?tier=legendary` query param to leaderboard routes                           |
| `src/components/LeaderboardScreen.tsx` | Add "Legendary" tab alongside Standard/Daily                                      |

### Config addition

```ts
// Top 0.1% of all-time runs go to "legendary" tier
LEGENDARY_THRESHOLD_PERCENTILE: 0.999,
```

### Schema addition

```sql
ALTER TABLE leaderboard ADD COLUMN leaderboard_tier TEXT NOT NULL DEFAULT 'standard';
CREATE INDEX idx_leaderboard_tier ON leaderboard(leaderboard_tier);
```

### Runtime logic

In `insertLeaderboardEntry()`:

1. Query `SELECT COUNT(*) FROM leaderboard WHERE run_type = 'standard'` for total runs
2. Query `SELECT score FROM leaderboard ORDER BY score DESC LIMIT 1 OFFSET floor(total * 0.001)` for cutoff
3. If `newScore >= cutoffScore AND total > 1000`, set `leaderboard_tier = 'legendary'`

### Query for legendary board

```ts
getLeaderboard({ runType: "standard", tier: "legendary", limit })
// => SELECT * FROM leaderboard WHERE run_type = 'standard' AND leaderboard_tier = 'legendary'
//    ORDER BY score DESC LIMIT $1
```

### UI

In `LeaderboardScreen.tsx`, add a third tab "Legendary 🏆" alongside "All-Time" and "Today's Seed":

```tsx
const TIERS = ["standard", "daily", "legendary"] as const
// legendary tab calls GET /api/meta/leaderboard?tier=legendary
```

### Verification

1. Needs 1000+ runs in the database to trigger (or lower threshold for testing)
2. Set `LEGENDARY_THRESHOLD_PERCENTILE` to a lower value temporarily
3. Insert a high-scoring run — it should appear in the Legendary tab, not the Standard tab
4. The standard board's #1 slot should now be accessible to normal runs

---

# Part II — Ideas from Puntero (`docs/example-puntero.md`)

> **Source**: the Puntero political-career walkthrough. Same loop shape as ours (numbered decisions, a rival, yearly seasons) — so most of its systems already exist in some form here. This part maps what it does to what we have, then steals what's actually new. Everything below must keep determinism: any new random draw goes through the per-run seeded `Rng` (§RNG & determinism), never `Math.random()`.

## Already covered — no work needed

| Puntero system | Ballad equivalent (exists) |
| -------------- | -------------------------- |
| Last-move recap ("ÚLTIMO MOVIMIENTO") | `SceneEcho` / `turnNarrative` in `GameScreen.tsx` |
| Rival score widget ("TU CARRERA VS") | `RivalBadge` in `Hud.tsx` + `advanceRival()` |
| Starting reputation pick ("TU PRIMERA REPUTACIÓN") | `ArchetypeStep` (3-card draw) |
| Season recap card w/ grade + headline | `generateSeasonSummary()` (headline, grade, world events) |
| Energy meter ("ENERGÍA") | `stamina` + `deductStamina()` |
| Media / average stat | `powerLevel` |
| Epilogue rival block | `RivalComparison` in `epilogue.ts` |
| Money that grows each turn | Per-season clan `stipend` (members only — the universal per-turn trickle is **new**, Step 19) |

---

## Step 11: Stat-Gated Choices

**Goal**: Some choices demand a minimum stat, shown as a requirement chip on the card (Puntero's "Imagen 30" / "Gestión 33"). Below the threshold the choice renders locked; meeting it unlocks a new path. This gives stats identity beyond numbers — a high-charisma character genuinely *sees different options*.

### Files to change

| File                     | Change                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `shared/types.ts`        | Add `requiresStat` to `ChoiceContent` and `ServedChoice`                                 |
| `server/engine/engine.ts`| Filter/lock choices in `buildServedEvent()`; reject locked picks in `resolveChoice()`    |
| `content/events/*.json`  | Add `requiresStat` to a few existing choices so the mechanic is actually in content      |
| `src/components/GameScreen.tsx` | Render requirement chip + locked state on choice cards                            |
| `src/i18n/strings.ts`    | "Requires" label (en/es)                                                                |

### Type additions

```ts
// ChoiceContent
requiresStat?: { stat: StatKey; min: number }

// ServedChoice (client-visible)
requiresStat?: { stat: StatKey; min: number }
statMet?: boolean
```

### Engine behavior

In `buildServedEvent()`: for each choice, set `statMet = c[choice.requiresStat.stat] >= choice.requiresStat.min`. Keep unmet choices **visible but locked** (dimmed, not selectable) rather than hiding them — Puntero shows the requirement on every card, and a locked card tells the player "this path exists, you're just not there yet." For determinism the choice list stays stable; only `statMet` changes.

In `resolveChoice()`: if the chosen `choiceId` maps to a choice whose `requiresStat` is unmet, return a validation error — never trust the client.

### Example content

```json
{
  "id": "intimidate_guard",
  "requiresStat": { "stat": "strength", "min": 25 },
  "statDeltas": { "fame": 2 }
}
```

### Verification

1. Author a choice with `requiresStat: { charisma: 40 }`; play a low-charisma character — card shows "Requires Charisma 40" and is locked
2. Raise charisma past 40 (trainer, events) — same event now offers the unlocked choice
3. Attempt to POST a locked `choiceId` directly via the API — server rejects it

---

## Step 12: Choice Before→After Previews (I dont like this one, dont implement it)

**Goal**: On every choice card show the projected effect as "current → after (+delta)" (Puntero's "Imagen 30 → 33 (+3)"), so the player sees exactly what each pick does to their sheet before committing.

### Files to change

| File                     | Change                                                                    |
| ------------------------ | ------------------------------------------------------------------------- |
| `src/components/GameScreen.tsx` | Compute projected values from `character` + `statDeltas`/`tradeoffDeltas` |
| `src/components/StatTag.tsx` | Extend to render `12 → 15 (+3)` form when current values are passed      |

### Implementation

Client-side only — the client already holds `CharacterState`, so no engine change:

```tsx
// For each stat delta, resolve against current character value
// statDeltas: { strength: 3 } with c.strength = 12  →  "STR 12 → 15 (+3)"
// tradeoffDeltas: { constitution: -2 } with c.constitution = 14 → "CON 14 → 12 (−2)"
```

Render the delta row inside each `ChoiceCard` (next to the existing `BonusTag`s), with gains in the standard gold tint and costs in blood tint. Tooltip on hover explains the change. Only show stats that actually change — don't list the whole sheet.

**Scope note**: `ServedChoice` carries `statDeltas` / `tradeoffDeltas` / `fameDelta` / `reputationDelta` / `goldDelta` but **not** `staminaDelta` / `healthDelta` (those exist only on `ChoiceContent`). Previews therefore cover the served deltas only — stamina/health changes would be silently invisible unless you also add those fields to `ServedChoice`. Decide which and note it here.

### Verification

1. Play any event with stat deltas — each changed stat shows "current → after (+delta)"
2. Volatile cards show both gains and costs as before→after pairs
3. Values match the engine after the turn resolves (spot-check a few)

---

## Step 13: Liability Meter ("Expediente")

**Goal**: A new meter that *accumulates* — shady choices, scandals, and failed coercion add to it, and it rarely drains. A high liability opens grim options and closes clean ones, and feeds the epilogue. Puntero's "Expediente" ("what the justice system knows about you") is exactly this; ours is a liability/notoriety meter in fantasy dress (rumors, warrants, witnesses).

### Files to change

| File                       | Change                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `shared/types.ts`          | Add `liability` to `CharacterState`; `liabilityDelta` to `ChoiceContent`; `requiresLiability` to `EventContent` |
| `shared/config.ts`         | `liabilityMax`, thresholds that open/close content                                    |
| `server/engine/engine.ts`  | Apply `liabilityDelta` in `resolveChoice()`; clamp 0..max                             |
| `server/engine/helpers.ts` | Gate events on `requiresLiability` in `isEligible()`                                  |
| `src/components/Hud.tsx`   | Add liability meter pill (blood-tinted when high)                                     |
| `content/events/*.json`    | Author choices with `liabilityDelta`; events with `requiresLiability`                 |
| `content/achievements.json`| Add clean-run and corrupted-run achievements                                          |

### Balance approach

- Start at 0; gains from events (blackmail choices, grave outcomes, failed rolls), slow natural decay (config, e.g. −1 per season) so it's not a death spiral.
- `requiresLiability: { min: N }` gates a small pool of "dark path" events ("A hooded figure knows what you did").
- Achievements: finish a run with `liability === 0` ("A Clean Conscience") and with liability ≥ threshold ("Known in the Underworld"). Note `AchievementCondition` has no liability type today — either add a `liability_gte` / `liability_lte` condition, or track liability as a counter key so the existing `counter_gte` condition works with no engine change. Pick one and say so in the step.

### Verification

1. Pick a shady choice — liability rises in the HUD and persists across turns
2. Below-threshold events never fire for a clean character; a dirty one sees them
3. Clean-run achievement unlocks on a 0-liability retirement

---

## Step 14: Rival Focus Label

**Goal**: The rival isn't just a score — each season they're "about" something (Puntero: Escándalo / Comunidad / Pasillos / Seguridad / Tecnología / Conflicto / Solidaridad). The focus shows in the HUD and flavors `rivalUpdate`; it can bias their score growth.

### Files to change

| File                       | Change                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| `shared/config.ts`         | Add `RIVAL_FOCUSES` pool (en/es labels)                             |
| `shared/types.ts`          | Add `focusId` to `RivalState`                                       |
| `server/engine/engine.ts`  | `generateRival()` picks a start focus; `advanceRival()` rotates it via the seeded rng |
| `server/routes/game.ts`    | Include focus in `rivalUpdate` text                                 |
| `src/components/Hud.tsx`   | Show focus chip inside `RivalBadge`                                 |
| `src/i18n/strings.ts`      | Localize focus labels                                               |

### Example focus pool (fantasy flavor)

```ts
export const RIVAL_FOCUSES = [
  { id: "conquest", label: { en: "Conquest", es: "Conquista" } },
  { id: "treasure", label: { en: "Treasure", es: "Tesoro" } },
  { id: "court", label: { en: "Court Intrigue", es: "Intriga de Corte" } },
  { id: "war", label: { en: "Open War", es: "Guerra Abierta" } },
  { id: "lore", label: { en: "Lost Lore", es: "Saber Perdido" } },
  { id: "crown", label: { en: "The Crown", es: "La Corona" } },
]
```

Optional depth: a focus grants the rival a small score bonus on seasons where it matches their faction specialty (e.g. a war-clan rival pushing "Open War" grows faster).

### Verification

1. Create a character — rival has a focus label in the HUD
2. Play through a season boundary — focus rotates (seeded, deterministic per daily seed)
3. `rivalUpdate` on the season summary mentions the current focus

---

## Step 15: Minigame Trap Cards (Urn Mechanic)

**Goal**: Puntero's "ELEGÍ UNA URNA" — three closed urns, you open one, and one was a trap ("ANULADA −4"). Generalize: a minigame can mark one or more cards as traps. Picking a trap forces the fail tier regardless of the hidden variable — risk made visible, outcome hidden.

### Files to change

| File                                | Change                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| `shared/types.ts`                   | Add `trap?: boolean` to `MinigameCard`; add `trapCardId` to `MinigameResolution` (optional) |
| `server/engine/engine.ts`           | In `resolveMinigame()`: if picked card has `trap: true`, resolve as `fail` tier before the hidden-variable roll |
| `content/minigames/*.json`          | Add at least one trap-card minigame (e.g. `trap_chest`, `haunted_urn`) |
| `src/components/GameScreen.tsx`     | Card visual hint for traps (subtle skull/mark) and suspense beat before reveal |

### Engine note

```ts
// Illustrative — inside resolveMinigame(c, event, cardId, reg, rng), before rolling the hidden variable:
const card = event.cards?.find((c) => c.id === cardId)
if (card?.trap) {
  return /* resolve the "fail" outcome tier for this event */
}
```

Trap placement must be authored (fixed per event), not rolled per player — deterministic and reviewable. Keep the trap *hinted* but not labeled (iconography only), so it stays a decision.

### Verification

1. Play the trap minigame — picking the trapped card always lands the fail tier
2. Non-trap cards resolve via the normal hidden-variable path (win still possible)
3. Daily runs stay deterministic: same card set, same outcomes for the same seed

---

## Step 16: Season-End Capstone + Rival Debate (content)

**Goal**: Puntero closes each year with a set-piece — an election ("ELEGÍ UNA URNA") or a debate vs the rival ("DEBATE CARA A CARA", verdict after: "MALA −4"). Add a season-end capstone beat and a debate minigame, authored as content on top of Step 15 + the existing tag-synergy mechanism (`wantedTags` / `punishedTags` on `ChoiceContent`, already used by the Negotiation Gambit-style events in `content/events/personality.json`).

### Files to change

| File                        | Change                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `content/minigames/elections.json` | **New** — "Election of the Year" capstone minigames (urn mechanic, uses Step 15 traps) |
| `content/minigames/debates.json`   | **New** — "Debate face to face": 3 responses, hidden verdict, quality after            |
| `server/engine/engine.ts`  | Serve a capstone minigame on the turn *before* the season summary; include result in the summary |
| `shared/types.ts`          | Optional `isCapstone` flag on `ServedEvent` so the client renders the showdown frame     |
| `src/components/GameScreen.tsx` | Capstone frame + suspense "scrutinizing…" beat (reuse existing minigame reveal)        |

### Debate design (reuses what exists)

- The rival makes a claim; three responses map to personality tags (e.g. `Humble` / `Strategic` / `Aggressive`).
- Hidden variable = the crowd's mood; verdict quality surfaced *after* picking ("MALA −4" / "BUENA +3"), driven by `wantedTags`-style scoring — no new systems, just authored content + the existing minigame resolution.
- Outcome moves the season's `seasonGrade` and the rival comparison.

### Verification

1. At the season boundary, the capstone fires before the summary and its result appears in the summary
2. The debate picks resolve with a verdict beat and tag-consistent rewards
3. Daily seed determinism holds across both new minigame types

---

## Step 17: New-Player Tutorial (skip-able)

**Goal**: Puntero opens with a numbered manual ("01 BIENVENIDO… 06 TU HISTORIA EMPIEZA AHORA") and an "OMITIR TUTORIAL" skip. Ours has no onboarding — new players face the full HUD cold. Add a short skip-able tutorial shown before the first run.

### Files to change

| File                        | Change                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| `content/tutorial.json`     | **New** — pages: Welcome / Everything is a Choice / Stats / Meters / Rival / Your Story (en+es) |
| `src/components/TutorialScreen.tsx` | **New** — page pager with Next / Skip / Start buttons                 |
| `src/App.tsx`               | Show tutorial when no run exists and `chronicle_tutorial_seen` flag is unset; wire re-open link |
| `src/i18n/strings.ts`       | "Skip tutorial", "Next", page nav strings                               |

### Details

- Content-driven pages (`{ id, title: LocaleMap, body: LocaleMap, icon }`) so it's editable without code.
- Skip persists a localStorage flag (`chronicle_tutorial_seen`) — consistent with the existing `chronicle_*` client keys; a "How to play" link on the creation screen reopens it.
- Keep it to 5-6 pages, one idea each, mirroring Puntero's structure.

### Verification

1. Fresh visitor sees the tutorial before creation; "Skip" jumps straight in and doesn't re-show
2. "How to play" reopens the manual from creation
3. Locale switch renders the tutorial fully in en/es

---

## Step 18: Career Titles & Path HUD

**Goal**: Puntero's title evolves with your career ("MILITANTE ESTUDIANTIL" → "REFERENTE DESDE EL LLANO") and the HUD shows "RUTA AL PODER" — where you are on the path to the top. Give our character a mid-run career title derived from arc + power level, and show the arc path in the HUD.

### Files to change

| File                     | Change                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `src/components/Hud.tsx` | Derive + render a career title chip; render the arc path (current arc lit, future arcs dimmed) |
| `src/i18n/strings.ts`    | Title table per arc × power tier (en/es); arc path labels                              |
| `src/lib/careerTitle.ts` | **New** helper: `careerTitle(arc, powerLevel)` → localized title                        |

### Title table (example)

```ts
// adventurer arc, 3 power tiers
{ en: "Wanderer", es: "Errante" }
{ en: "Adventurer", es: "Aventurero" }
{ en: "Rising Star", es: "Estrella en Ascenso" }
// kingdom_hero arc …
{ en: "Knight of the Realm", es: "Caballero del Reino" }
// legend arc …
{ en: "Living Legend", es: "Leyenda Viva" }
```

Titles are derived client-side from `c.currentArc` (already on `CharacterState`; `Hud.tsx` already reads it for the arc pill) + `powerLevel` buckets — pure UI, no persistence, no engine change. The path row shows `Adventurer → Mercenary → Kingdom Hero → Legend → Old Hero` with the current one highlighted.

### Verification

1. HUD shows a career title that changes as power level crosses tiers
2. Arc path renders with the current arc lit and future arcs dimmed
3. Title + path localize in both languages

---

## Step 19: Quick Wins (Random Creation + Passive Gold)

**Goal**: Two small Puntero touches: an "AL AZAR" random creation button and a trickle of gold each turn (Puntero's capital grows $0→$3→$6). Low effort, high polish.

### Files to change

| File                         | Change                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `src/components/CreationScreen.tsx` | Add "🎲 Random" button that randomizes name/class/origin/gender client-side |
| `shared/config.ts`           | Add `goldPerTurn: 3`                                                         |
| `server/engine/engine.ts`    | In `resolveChoice()`, apply `goldPerTurn` each turn (before/after deltas)    |
| `src/i18n/strings.ts`        | "Random" label                                                              |

### Details

- Random button: pick a name from a small fantasy name pool (client-side constant), a random loaded class, random origin, random gender, then proceed through the normal archetype draw. No new server surface.
- `goldPerTurn`: a flat income so a character who never lands gold-delta events still accumulates capital (keeps the shop reachable). Applied deterministically on every turn resolution.

### Verification

1. "🎲 Random" produces a valid, startable character in one click
2. Gold increases by `goldPerTurn` every turn regardless of event choice
3. Daily runs remain deterministic (flat income, no rng involved)

---

## Implementation Order

```
Step 1: Faction & Personality HUD        → 1-2 hours (pure UI, no backend)
Step 2: Wire Shop Item Effects            → 2-3 hours (engine math changes)
Step 3: Fix Two-Stage Finale              → 1-2 hours (wire existing code)
Step 4: Rival Events                      → 30 min (pure content)
Step 5: NPC Relationship Events           → 30 min (pure content)
Step 6: Long-Term Flag Events             → 30 min (pure content)
Step 7: New Minigame Types                → 2-3 hours (content + engine)
Step 8: Graduated Achievements            → 1 hour (content only)
Step 9: Cross-Run Trophy Hall             → 3-4 hours (full stack)
Step 10: Elite Leaderboard Split          → 2-3 hours (backend + frontend)
Step 11: Stat-Gated Choices               → 2-3 hours (engine + content + UI)
Step 12: Choice Before→After Previews     → 1 hour (pure UI)  (I dont like this one, dont implement it)
Step 13: Liability Meter (Expediente)     → 2-3 hours (engine + content + UI)
Step 14: Rival Focus Label                → 1 hour (config + engine + UI)
Step 15: Minigame Trap Cards              → 1-2 hours (engine + content)
Step 16: Season-End Capstone + Debates    → 2-3 hours (engine + content + UI)
Step 17: New-Player Tutorial              → 1-2 hours (content + UI)
Step 18: Career Titles & Path HUD         → 1 hour (pure UI)
Step 19: Quick Wins (Random + Gold)       → 1 hour (UI + small engine)
```

Steps 4-6, 8 and the content portions of 11/13/15/16/17 are JSON additions and can be done in any order or in parallel. Steps 11 and 13 touch engine eligibility/resolution and should land before authored content depends on them. Step 12 and 18 are near-pure UI and safe to parallelize; Step 14 touches `generateRival()` / `advanceRival()` (engine) and `routes/game.ts`, so treat it as engine-adjacent. All new rng use in 14-16 must go through the per-run seeded `Rng` to preserve daily-mode determinism.

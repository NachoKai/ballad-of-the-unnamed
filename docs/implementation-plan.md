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
```

Steps 4-6 and 8 are pure content additions (JSON files). They can be done in any order or in parallel. Steps 1-3 touch engine/UI code and should be done before minigame/content work if possible.

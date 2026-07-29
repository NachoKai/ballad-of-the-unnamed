# Fantasy CYOA RPG — Build Spec

Paste this to the code agent as the project brief.

## Concept

Choose-your-own-adventure life-sim RPG. Player names a character, picks a class, then plays turn-by-turn from youth to death/retirement. Each turn presents one event with 2-4 choices. Choices move stats, gold, reputation, relationships. Age increments every N turns. Run ends in death or retirement, producing a life summary. Runs post to a global leaderboard.

Reference model: the attached "El Ídolo" (futbol career sim). Same shape, fantasy skin: dice-driven weighted content bank + stat math + narrative flavor text, not live-generated game logic.

## Stack

- Frontend: React + TypeScript (Vite)
- Backend: Node + TypeScript (Express or Fastify — check what's idiomatic for the agent's default, don't introduce a second framework)
- DB: libSQL (Turso-compatible), accessed via `@libsql/client`
- No ORM required unless the agent already has one in mind — raw SQL with typed query wrappers is fine at this scale
- No localStorage/sessionStorage. Client holds only in-memory session state (transient UI, refetched from server on load). The run token persists via an HTTP cookie (not a JS storage API) so a page reload survives automatically — this resolves the auth open question below in favor of "cookie."

## Do we need an LLM?

No, not for game logic. Recommended split:

- **Deterministic core (no AI):** stats, gold, RNG, event selection, achievement checks, ranking math, turn/age progression. This must be fully reproducible and testable without any network call.
- **Optional AI layer (Claude API, server-side, off the critical path):** generates *prose variation* on top of authored templates — e.g. rephrasing a flavor-text template with the character's name/class/history baked in, or writing the final life-summary narrative from a structured JSON recap. If the API call fails or is disabled, fall back to the authored template string. Never let an LLM call decide stat changes, gold amounts, win/loss, or achievement unlocks — those must come from code so the game stays balanced and cheatable-testable.
- Ship v1 with AI *off* (pure template bank). Add the AI narration layer as a toggleable enhancement once the deterministic game is solid.

## Data model

### Character / stats

```
Stats: Strength, Dexterity, Constitution, Intelligence, Charisma
Derived: Power Level (avg of 5 stats, 0-99, like "Media")
Non-stat meters:
  - Stamina/Vigor (doesn't count toward Power Level; reduces fatigue as it rises)
  - Health (0-100, separate from Stamina — see Health, injury & death conditions; reaching 0 ends the run)
  - Momentum ("Forma"): trending up/down/stable, affects outcome rolls this arc
  - Fame (Global): 0-100+, unlocks better offers/recruiters — see Reputation categories & cross-effects
  - Market Value: "how sought-after," separate from Gold on hand — see Legacy
  - Reputation per location ("Idolatría" equivalent): 0-100 per town/guild/faction, categorized
    (village/kingdom/guild/noble/criminal), tiers: Stranger -> Known -> Respected -> Renowned -> Legend
  - Gold
  - Age (increments once per season, a fixed number of turns — see Career arcs & chapters)
  - Flags: arbitrary narrative markers for long-term callbacks — see Long-term flags & narrative callbacks
Class: Warrior | Wizard | Rogue | Ranger (extensible list, not hardcoded enum in DB — store as string, validate in app layer)
```

### Starting archetype roll

After picking a class, the player is offered 3 randomly-drawn archetype cards specific to that class — same shape as the reference game's "¿Qué clase de delantero sos?" (three permanent destinies, dice-picked, one chosen forever). Unlike normal Rare/Volatile cards these are flat, no-tradeoff bonuses, but the choice is permanent and colors the whole run's identity — no respec exists.

Content file `content/archetypes.json`, keyed by class:

```json
{
  "warrior": [
    { "id": "berserker", "icon": "🪓", "name": {"en":"Berserker","es":"Berserker"}, "flavor": {"en":"You live for the kill. Nothing stops your swing.","es":"Vivís para el golpe final. Nada frena tu hacha."}, "statDeltas": {"strength": 8} },
    { "id": "guardian", "icon": "🛡️", "name": {"en":"Guardian","es":"Guardián"}, "flavor": {...}, "statDeltas": {"constitution": 8} },
    { "id": "duelist", "icon": "⚔️", "name": {"en":"Duelist","es":"Duelista"}, "flavor": {...}, "statDeltas": {"dexterity": 8} }
  ]
}
```

3 are drawn from the class's pool via the seeded per-run RNG (see RNG & determinism) at creation. Store the pick on `characters.starting_archetype_id TEXT` — feeds the epilogue nickname/flavor generation (see Legacy) and the "One True Blade" achievement (no respec exists, so this is automatically satisfied by never adding one).

### Personality/response system

Every dialogue-flavored choice tags the player's reply with one of:
`Humble, Cocky, Confident, Professional, Aggressive, Funny, Supportive, Strategic, Stoic, Leader`

Each event that uses this system defines:
- which tag(s) it "wants" (bonus outcome)
- which tag(s) it "punishes" (bad outcome)
- neutral tags = neutral/minor outcome

Track a running personality profile (counts per tag) on the character — used later for: matching NPC reactions, unlocking tag-specific achievements ("Sin Filtro" = 3/3 correct press-conference answers), and epilogue flavor ("known across the realm as blunt and aggressive").

### Reputation categories & cross-effects

`reputations` (per-faction, 0-100, already spec'd) gets an explicit `faction_type` for UI grouping and cross-effect rules: `village | kingdom | guild | noble | criminal`. `characters.fame` (already spec'd, character-level not per-faction) is the "Global Fame" meter — this already exists distinct from per-faction reputation, no change needed there.

What's new: some reputation gains cost reputation elsewhere. A choice/event can declare a `reputationDelta` touching more than one faction type at once, including negative entries — e.g. currying favor with the Noble court costs standing with the Criminal underworld:

```json
{ "reputationDelta": { "noble_court": 6, "criminal_underworld": -4 } }
```

This is the same pattern as `tradeoffDeltas` on stat cards (Choice rarity system) — gains and costs in the same declared effect, applied generically, no bespoke code per event.

### Achievements

Fantasy-adapted list (mirror the structure of the reference doc — locked/unlocked, one-line unlock condition):

- Legend with a statue (reputation 95+ in one place)
- Local hero (reputation 75+)
- One True Blade (finish with a single weapon/class specialization, no respec)
- Wanderer (5+ factions/guilds, no lasting loyalty)
- Turncoat (join the enemy faction)
- Eternal (survive to old age, e.g. 70+)
- The One Who Said No (decline a tempting offer — e.g. dark power, betrayal)
- Fought While Broken (win a decisive fight while wounded/cursed)
- The Savior (save your home settlement from destruction)
- Retired Rich (finish with X gold)
- Body Count / Spell Count equivalents (N monsters killed, N spells cast)
- Multi-tag achievements: "Silver Tongue" (talked your way out of 3 dangerous fights via Charisma choices), "Iron Will" (never fled a fight)
- Marked by Destiny (accept a Destiny card)
- Bonded for Life / Burned That Bridge (max / min affinity with any NPC — Relationships)
- Best Your Rival (finish ahead of the Archrival on the comparison metric)
- A Life Remembered (Legacy score above a threshold — statues, students, and settlements saved outweigh raw combat stats)
- Old Grudges (an event resolves off a Long-term flag set 10+ seasons earlier)
- Keep list at 30-50 entries, mix of guaranteed-early ones and rare/hidden ones (don't reveal condition until close)

### Run counters

Scoring (Ranking criteria & score formula) and several achievements need running totals during an active run — `battles_won`, `quests_completed`, `monsters_killed`, `spells_cast`, `volatile_picks_survived`, and streak counters like `negotiation_streak` for "N in a row" achievements. This also matters for the live UI: the reference doc shows running totals (goals/assists/matches) on screen throughout the career, not just at the end.

Rather than a fixed column per counter — constant migrations every time a new achievement type needs a new number — store `characters.counters` as a JSON blob of named integers (schema addition above). Events/choices/outcomes declare their effect on counters the same way they declare `statDeltas`:

```json
{
  "countersDelta": { "battles_won": 1 },
  "countersReset": ["negotiation_streak"]
}
```

`countersDelta` increments a key; `countersReset` zeroes one. The reset is what makes streak achievements possible — a plain incrementing counter can't express "consecutive," it needs to drop to zero on a miss and rebuild from there. Applied generically at turn-resolution time, same code path as `statDeltas` — no bespoke per-achievement logic.

At run end, flatten the relevant keys from `counters` into the typed columns on `leaderboard_entries` (`battles_won`, `quests_completed`) so the category boards can `ORDER BY` a real column instead of parsing JSON per row.

### Ranking (global leaderboard)

See dedicated "Ranking criteria & score formula" section below for the scoring model — summary: one composite score for the main board, individual raw metrics stored per entry so category boards (Richest, Most Titled, Oldest Ever, Most Battles Won) can be served from the same rows with no recomputation.

## Ranking criteria & score formula

Raw gold or raw years-lived as the top sort metric both reward the wrong thing — hoarding/grinding, or passive turtling instead of the risk-taking the Volatile-card system is built to encourage. Use one composite score, weighted toward the hardest-to-fake signals, plus separately-stored raw metrics so category boards can exist without recomputation.

**Weighting, highest to lowest:**

1. **Achievements/titles** — hardest to fake, each already gated by real in-run difficulty.
2. **Battles won / quests completed** — direct skill/engagement signal.
3. **Age at end** — real signal, but capped so pure passive survival can't out-rank an active shorter life.
4. **Final power level** — build quality.
5. **Reputation peak** — social/fame signal.
6. **Net worth** — gold *plus* the value of owned retinue/luxury items, not raw held gold. Smallest weight: it's mostly a means (spent on the shop), not an accomplishment.
7. **Legacy score** — from the post-mortem Legacy pass (statues, students, settlements saved, artifacts left behind). Rewards a run that built something lasting, distinct from raw combat/survival metrics.
8. **Ending type bonus** — death is not a penalty in this game; a heroic last stand and a clean retirement should both score well, an anticlimactic random-mishap death should not.

```
score =
    achievements_count       * 500
  + battles_won              * 50
  + quests_completed         * 40
  + min(age_at_end, 80)      * 20
  + final_power_level        * 15
  + reputation_peak          * 5
  + legacy_score             * 25
  + net_worth / 100
  + ending_bonus   -- heroic_death: 200, peaceful_retirement: 100, other: 0
```

Treat these numbers as a starting balance pass, not final — expect to tune weights after seeing real run data (e.g. if achievements turn out too easy/hard to get relative to their weight).

**Category leaderboards** (served from the same `leaderboard_entries` rows, just different `ORDER BY`): Richest (net_worth), Most Titled (achievements_count), Oldest Ever Lived (age_at_end), Most Battles Won (battles_won), plus the main composite board. Multiple boards matter for retention in a replay-driven game — a player who'll never top the composite score can still chase a category record, which is a real reason to run another 15-minute life.

**Elite tier split-off**: once a run's score crosses a very high percentile threshold (config, e.g. top 0.1% of all-time runs), move it to a separate "Legendary" leaderboard rather than letting it permanently occupy the top of the main board — outlier mega-runs otherwise crowd out everyone else indefinitely. The main board and the elite board never mix; a run scores into exactly one.

**Daily vs all-time**: both use the identical formula/columns, filtered by `run_type`/`daily_seed` — no separate scoring logic needed.

## libSQL schema (starting point)

```sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  starting_archetype_id TEXT, -- see Starting archetype roll
  age INTEGER NOT NULL DEFAULT 16,
  current_arc TEXT NOT NULL DEFAULT 'child', -- see Career arcs & chapters
  strength INTEGER NOT NULL DEFAULT 0,
  dexterity INTEGER NOT NULL DEFAULT 0,
  constitution INTEGER NOT NULL DEFAULT 0,
  intelligence INTEGER NOT NULL DEFAULT 0,
  charisma INTEGER NOT NULL DEFAULT 0,
  stamina INTEGER NOT NULL DEFAULT 50,
  health INTEGER NOT NULL DEFAULT 100, -- see Health, injury & death conditions; separate from stamina
  fame INTEGER NOT NULL DEFAULT 0, -- Global Fame, see Reputation categories & cross-effects
  market_value INTEGER NOT NULL DEFAULT 0, -- "how sought-after", distinct from gold on hand, see Legacy
  market_value_peak INTEGER NOT NULL DEFAULT 0,
  gold INTEGER NOT NULL DEFAULT 0,
  momentum TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'alive', -- alive | retired | dead
  current_clan_id TEXT REFERENCES clans(id), -- null = solo, see Clans / allegiance system
  hunted_by_clan_id TEXT REFERENCES clans(id), -- set on betrayal, cleared after hunted_until_turn
  hunted_until_turn INTEGER,
  locale TEXT NOT NULL DEFAULT 'en', -- 'en' | 'es', see Internationalization
  counters TEXT NOT NULL DEFAULT '{}', -- JSON blob of named run counters, see Run counters
  flags TEXT NOT NULL DEFAULT '{}', -- JSON blob of narrative flags for long-term callbacks, see Long-term flags & narrative callbacks
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE reputations (
  character_id TEXT NOT NULL REFERENCES characters(id),
  faction TEXT NOT NULL,
  faction_type TEXT NOT NULL, -- village | kingdom | guild | noble | criminal, see Reputation categories & cross-effects
  value INTEGER NOT NULL DEFAULT 0,
  peak_value INTEGER NOT NULL DEFAULT 0, -- highest value ever reached; reputation can fall, this can't. reputation_peak in scoring = MAX(peak_value) across a character's factions
  PRIMARY KEY (character_id, faction)
);

CREATE TABLE inventory (
  character_id TEXT NOT NULL REFERENCES characters(id),
  item_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (character_id, item_id)
);

CREATE TABLE personality_log (
  character_id TEXT NOT NULL REFERENCES characters(id),
  tag TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, tag)
);

CREATE TABLE achievements_unlocked (
  character_id TEXT NOT NULL REFERENCES characters(id),
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, achievement_id)
);

CREATE TABLE turn_log (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  turn_number INTEGER NOT NULL,
  event_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  tag TEXT, -- personality tag if applicable
  stat_deltas TEXT, -- JSON blob
  narrative TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE leaderboard_entries (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  name TEXT NOT NULL,
  epithet TEXT, -- auto-generated nickname, see Legacy
  class TEXT NOT NULL,
  final_power_level INTEGER NOT NULL,
  net_worth INTEGER NOT NULL, -- gold + estimated value of owned luxury/retinue items, not raw gold alone
  achievements_count INTEGER NOT NULL DEFAULT 0,
  battles_won INTEGER NOT NULL DEFAULT 0,
  quests_completed INTEGER NOT NULL DEFAULT 0,
  age_at_end INTEGER NOT NULL,
  reputation_peak INTEGER NOT NULL DEFAULT 0,
  legacy_score INTEGER NOT NULL DEFAULT 0, -- see Legacy (post-mortem accounting)
  ending_type TEXT NOT NULL, -- 'heroic_death' | 'peaceful_retirement' | 'other_death' | 'other_retirement'
  score INTEGER NOT NULL, -- computed composite, see Ranking criteria & score formula
  leaderboard_tier TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'legendary', see elite tier split-off
  epilogue TEXT NOT NULL,
  run_type TEXT NOT NULL DEFAULT 'standard', -- standard | daily
  daily_seed TEXT,
  created_at INTEGER NOT NULL
);
```

Quote all identifiers per your usual convention if you add schema names later.

Note: `characters.current_clan_id`/`hunted_by_clan_id` reference `clans(id)`, defined in the Clans / allegiance system section below — create `clans` before `characters` in actual migration order, or defer FK enforcement.

## Event/content bank format

Author events as data, not code, so non-engineers can add content and the bank can grow without touching game logic.

```json
{
  "id": "press_gauntlet_01",
  "minAge": 16,
  "maxAge": 99,
  "requiresClass": null,
  "requiresTags": [],
  "excludeIfCompletedIds": [],
  "weight": 10,
  "narrative": "A hooded stranger blocks your path out of the tavern...",
  "choices": [
    {
      "id": "humble",
      "label": "Ask what they want, politely",
      "tag": "Humble",
      "outcome": "good",
      "statDeltas": { "charisma": 1 },
      "goldDelta": 0,
      "narrative": "The stranger nods, respect flickers in their eyes..."
    },
    {
      "id": "aggressive",
      "label": "Draw your weapon",
      "tag": "Aggressive",
      "outcome": "risky",
      "statDeltas": { "strength": 1 },
      "goldDelta": -10,
      "narrative": "Steel rings out..."
    }
  ]
}
```

Event selection: filter by age/class/prereqs/exclusions -> weighted random pick -> resolve choice -> apply deltas -> log turn -> check achievement conditions -> advance age if threshold hit.

## Content storage & scale strategy

**Format**: JSON, loaded into server memory at boot. Content is static data shipped with the app — never queried from the DB per turn; the DB is for player/run state only.

**File organization**: one file per content type, split further by theme once a type grows past ~50-100 entries:

```
content/
  events/
    tavern.json
    dungeon.json
    court.json
    road.json
  minigames/
    duels.json
    negotiation.json
  shop.json
  clans.json
  achievements.json
```

One giant JSON file per type doesn't scale past a few dozen entries (unreviewable diffs, merge conflicts). Many small themed files do.

**Validation**: JSON Schema per content type, run in CI. Fails the build on malformed entries or (per Internationalization) missing `en`/`es` keys — catch this before merge, not at runtime.

**The variety lever is composability, not raw entry count.** A few hundred hand-authored events will feel repetitive by run 20 regardless of file format. Make each authored entry produce many felt variants instead:

- **Slot-filling**: narrative strings hold placeholders resolved from small pools at runtime — e.g. `"A {npcRole} named {npcName} corners you in {locationName}"` with `npcRole`/`npcName`/`locationName` as separate arrays (15-30 entries each). Combined with the existing filter/rarity/tag systems, a few hundred templates produce thousands of distinct-feeling beats.
- **Condition-gated pools** (age/class/clan/`hunted_by` filters, already in the Event/content bank format and Clans sections) mean two players rarely draw from the same eligible pool at the same point in a run.
- **Rarity + tradeoff cards** (Choice rarity system) vary the stat-shape of the same event per pick.
- **Personality-tag history** shifts which later events/NPC reactions become eligible, branching the same early event differently downstream.

Slot pool schema addition:

```json
{
  "npcRole": {
    "en": ["merchant", "guard captain", "hooded stranger", "traveling bard"],
    "es": ["mercader", "capitán de la guardia", "desconocido encapuchado", "bardo viajero"]
  },
  "locationName": {
    "en": ["the tavern's back room", "the old bridge", "the market square"],
    "es": ["el reservado de la taberna", "el puente viejo", "la plaza del mercado"]
  }
}
```

Authoring effort goes into templates + slot pools + tags, not into raw scenario count.

## Choice rarity system

Every choice ("card") on an event carries a `rarity`. Rarity controls both how often the card is offered and how much it moves stats. This is the same pattern as the reference doc's "Rara" tag on standout options.

**Rarity tiers**

| Rarity | Weight (how often offered) | Typical effect |
|---|---|---|
| Common | high | +1 to one stat, no downside |
| Uncommon | medium | +2 to +3 to one stat, no downside |
| Rare | low | +3 to +5 to one stat, no downside |
| Volatile | lowest | +5 to +8 to one stat, **but** −2 to −4 on one or two other stats |

Volatile cards are the ones that "give more than Rare" — they're the highest-ceiling option but always cost something elsewhere. They are not simply "Rare but bigger"; they're a distinct build-defining choice (e.g. a glass-cannon Strength card that drains Constitution and Charisma). Never let Volatile be strictly better than Rare with no cost — the tradeoff must always net out to a real loss on at least one other stat.

Turn generation should typically offer a mix — e.g. one Common, one Uncommon/Rare, one Volatile — same shape as the reference doc's 3-option pretemporada screens. Not every turn needs a Volatile option; gate its appearance rate (e.g. ~15-20% of turns) so it stays a meaningful moment, not the default.

**Schema addition** (extends the choice object from Event/content bank format):

```json
{
  "id": "berserker_frenzy",
  "label": "Fight in a blind rage",
  "tag": "Aggressive",
  "rarity": "volatile",
  "statDeltas": { "strength": 7 },
  "tradeoffDeltas": { "constitution": -3, "charisma": -2 },
  "goldDelta": 0,
  "narrative": "You black out and come to standing over the wreckage..."
}
```

`statDeltas` = gains, always positive. `tradeoffDeltas` = costs, always negative, only present on Volatile (and optionally some Rare) cards. Common/Uncommon cards omit `tradeoffDeltas` entirely.

**UI**: badge the card with rarity (color + label, e.g. gold border + "Volatile") the same way the reference doc flags "Rara" — the player should be able to tell at a glance that a card is high-risk/high-reward before picking it.

**Achievements**: tie a few unlocks to rarity choices — e.g. "picked Volatile 10 times and survived", "finished a run without ever picking a Volatile card" (opposite playstyles, both worth rewarding).

## Destiny cards

A fifth tier, above Volatile, but structurally different — not one of the 3-4 cards offered on a normal turn. A rare standalone event type, roughly once every 8-10 in-game years, offering a permanent, run-defining transformation rather than a stat bump. Reference examples: becoming half-dragon, an immortality ritual, being marked as chosen by a god.

Mechanically: a Destiny event's chosen option can (a) apply a large permanent stat/trait change, and (b) **lock or unlock entire event pools** for the rest of the run (`unlocksEventPool` / `locksEventPool` tags on the choice, filtering the same way `requiresClanId` etc. already do). This is what makes it bigger than a Volatile card — Volatile changes your numbers, Destiny changes what life is even available to you afterward.

**Design tension worth flagging explicitly**: an immortality-flavored Destiny card cannot make a character literally unkillable — the whole game's premise is a run ending in death or retirement (Health, injury & death conditions). Author these as "no longer dies of old age" (removes natural age-decline death, doesn't remove violent death or player-chosen retirement), not literal invincibility. Flag this constraint in the content-authoring guide so nobody builds an unendable run by accident.

Gated by the seeded per-run RNG like everything else (RNG & determinism) — a Destiny event either fires on schedule or doesn't; not player-triggered.

## Long-term flags & narrative callbacks

`characters.flags` (schema above) — a JSON blob of arbitrary keyed markers with contextual payload, distinct from `counters` (which are numeric tallies). A flag records that something specific happened, often naming who/what, so a much later event can reference it:

```json
{ "insulted_duke_reinhart": { "turn": 12, "severity": "grave" } }
```

Content bank support: `setsFlag` on a choice's outcome (writes the entry), `requiresFlag` on an event's filter predicate (only eligible if present, optionally matching payload conditions like `severity`). This is what makes "the Duke still remembers, twenty years later" possible — it's not scripted per-character, it's a normal content-bank event gated on a flag that may or may not exist, same mechanism as every other filter already in the spec (age/class/clan/hunted-by).

## Health, injury & death conditions

Referenced throughout (`injuryRiskModifier` in Shop, `injuryRiskDelta` in Mini-games, `ending_type` in Ranking) but never actually specified — without this, nothing in the doc explains what ends a run. Filling the gap:

- `characters.health` (0-100, schema above), separate from `stamina`. Stamina is fatigue/burnout (recoverable, affects performance); health is mortal risk (also recoverable, but hitting 0 ends the run).
- Outcomes tagged with `injuryRiskDelta` (mini-game fail tiers, some Volatile cards, specific events) roll against that probability server-side; a hit reduces health by a template-defined amount.
- Health reaching 0 → death. `ending_type` is assigned from context at that moment: dying mid-duel or at a decisive/final-moment beat → `heroic_death`; dying to an unrelated event (illness, ambush, accident) → `other_death`.
- Retirement becomes available once `age >= retirementEligibleAge` (config, e.g. 40): a dedicated "retire" choice is offered periodically in that age range. Player-chosen retirement → `peaceful_retirement`. A narrative event that forces retirement without killing (e.g. a career-ending injury) → `other_retirement`.
- On death or retirement: freeze `characters.status`, generate the epilogue, write `leaderboard_entries` (the `ending_type` feeds the scoring bonus already defined in Ranking criteria & score formula).

## Legacy (post-mortem accounting)

At death or retirement, run a legacy-accounting pass before the final score/epilogue — the ending should feel like the culmination of a life, not an immediate stat dump. Mostly derived from data already tracked elsewhere, not a new parallel tracking system:

- **Statues/monuments** — from reputation tiers reached (Legend tier per faction, already in `reputations.peak_value`).
- **Students / children** — from Relationships (mentored NPCs, or life-event flags like a child being born).
- **Settlements saved** — from specific quest/event completions, tracked as flags (Long-term flags & narrative callbacks).
- **Enemies created** — from Relationships at negative affinity, and the Archrival if the run ends adversarially.
- **Artifacts left behind** — unique items in `inventory` flagged as legendary-tier, or unique quest rewards.

Render this as its own epilogue block (a life-summary paragraph, not just a stat table) and fold a `legacy_score` component into the composite score (Ranking criteria & score formula) — e.g. a fixed point value per legacy category present, small relative to achievements/combat but enough to reward a run that built something lasting over one that just survived. Auto-generate a nickname/epithet at this point too (a pool gated by which achievement/behavior archetype the run actually hit — loyal vs. mercenary vs. legendary — combined with the faction most associated with it), same pattern as the reference game's "El Campeón de Europa de Inter" style epithets.

## RNG & determinism

The daily-mode promise ("same event rolls for everyone that day," Ranking criteria & score formula) only holds if *every* random draw in a run comes from one seeded source — not just the top-level event pick. As specced so far it doesn't: slot-filling (Content storage & scale strategy), mini-game hidden variables (Mini-games), and injury rolls (above) are all separate randomness introduced in later sections, none of them wired to the daily seed.

- Seed one PRNG per run (small deterministic generator, e.g. mulberry32) — `daily_seed` for daily-mode runs (same seed reused across every player that day), a fresh random seed for standard runs.
- Thread that single generator instance through every random draw in the turn-resolution pipeline: event selection weight roll, slot-fill pool picks, choice-rarity offer generation, mini-game hidden-variable roll, injury-risk rolls, clan-offer generation.
- Never call the platform's raw random function directly inside game logic once this is in place — every draw goes through the seeded generator, or daily mode silently breaks the moment someone adds a new random touchpoint.

## Career arcs & chapters

The spec so far treats every turn as a homogeneous event→choice cycle. That's the wrong shape — the reference game feels like a career, not a sequence of disconnected events, because it wraps everything in an explicit season structure with real chapters. Restructuring around that:

**Chapters** — `characters.current_arc` (schema above), age-gated, each unlocking a **different event pool**, not just harder versions of the same one:

| Arc | Age range | Character |
|---|---|---|
| Child | 0-15 | pre-adventure, sets up starting flags/relationships |
| Adventurer | 16-25 | Starting archetype roll happens here; low-stakes local events, first clan offers |
| Mercenary | 26-39 | Clan/betrayal mechanics, Volatile cards more common, first Destiny-card window |
| Kingdom Hero | 40-59 | High-fame clan offers, "the Far Reaches" foreign-kingdom offers unlock (fame-gated, reuses Clans' `isForeign` tag), political/noble-reputation content becomes available |
| Legend | 60-79 | Retirement becomes available (Health, injury & death conditions), Legacy-building content (mentoring, founding things) |
| Old Hero | 80+ | Rare survivors only; mostly Legacy/farewell content, the scripted retirement finale becomes likely |

This resolves the earlier open question about turn-vs-age pacing: age increments once per **season** (a fixed number of turns, e.g. 5), not once per turn.

**Season loop** (replaces the flat turn loop below):

```
Preparation (preseason cards, see Choice rarity system)
    │
    ▼
World Event (ambient, see World events below)
    │
    ▼
Quest / narrative event (the core content-bank event)
    │
    ▼
Mini-game (sometimes — gated by event type, not every season)
    │
    ▼
Season Summary ("Kingdom Herald" newspaper, see below)
    │
    ▼
Offers / Guild / Shop (clan offers, shop, relationship check-ins)
    │
    ▼
Next season
```

**Season Summary as a newspaper**: present the recap (already spec'd: season headline, stat deltas, rival update, achievement unlocks) framed as a short in-world gazette rather than a bare stat card — same underlying structured recap data (Internationalization), just a "Kingdom Herald"-style presentation combining the season's stat recap + the World Event(s) that fired + the rival update into one digest, the same unifying trick the reference game's season card uses.

## World events (ambient, player-independent)

The rival already advances off-screen between encounters (Archrival system) — generalize that same technique to the wider world. Once per season, roll (via the seeded per-run RNG) a small number of **world events** from their own content pool: a kingdom falls, a dragon is slain by someone else, a plague spreads, a volcano erupts, a rival guild collapses. Most fire independent of anything the player did; some are conditioned on player state (a guild the player weakened is more likely to collapse) via the same flag/filter mechanism as everything else.

These surface in the Season Summary newspaper alongside the player's own recap — the point is making the world feel like it's moving whether or not the player is watching, not building a full world simulation. Keep this cheap: a handful of flavor lines per season, not a system that needs balancing against player choices.

## Turn loop (server-authoritative)

1. Client requests next event for character (server picks via content bank rules + character state + daily seed if applicable) — event may be a World Event, a quest/narrative event, or (at season boundary) the Season Summary.
2. Client submits chosen `choiceId`.
3. Server validates choice belongs to the served event (anti-cheat: don't trust client-picked outcomes), applies deltas, updates reputation/personality/momentum, checks death/retirement conditions, checks achievement unlocks, writes `turn_log`, returns updated character + narrative.
4. At season boundary (every N turns): advance age, roll World Events, generate the Season Summary, advance `current_arc` if the new age crosses a threshold.
5. On death/retirement: run Legacy accounting, generate epilogue, write `leaderboard_entries`, freeze character.

## Mini-games (card-pick moments)

Periodic special beats where the player picks one of several cards and a hidden server-side variable determines the outcome — same shape as the reference doc's penalty-kick direction pick. These are a subtype of the normal event, not a separate system: `type: 'minigame'` on the event record, resolved through the same server-authoritative turn loop.

**Generic framework**

- Event presents 3-6 cards (icon + label), each representing a target/tactic/argument.
- Server also rolls a hidden opposing variable (defender's guess, ward type, ambusher's position, NPC's mood) *before* showing the result — never influenced by which card the player picked, to keep it fair.
- Win chance = `baseWinChance + (relevant stat × small coefficient, capped)` — stat matters, but variance stays real so it's never a solved/deterministic pick.
- Outcome tiers: Critical success / Success / Partial / Fail — matches the tone of existing systems (reputation tiers, shop item tiers). Partial outcomes should exist, not just binary win/lose (e.g. lockpick jams the alarm but still opens; negotiation gets a worse deal but avoids a fight).
- Resolve server-side, return result + narrative + deltas. Client never computes or claims the outcome.

**Fantasy adaptations**

| Mini-game | Cards shown | Hidden variable | Primary stat |
|---|---|---|---|
| Duel — Final Blow | Strike zones (high-left, high-right, low/disarm, feint-center) | Opponent's guard read | Strength + Dexterity |
| Arcane Clash | Spell school (Fire, Frost, Arcane, Nature) | Opponent's ward type | Intelligence |
| Lockpick / Trap Disarm | Pin/wire sequence options | Trap's actual mechanism | Dexterity |
| Negotiation Gambit | Argument type (reuses the personality tag set: Humble, Cocky, Strategic, etc.) | NPC's hidden disposition | Charisma |
| Ambush Escape | Escape route (left alley, rooftop, bluff-and-fight, call for help) | Ambusher's blocked route | Dexterity + Constitution |

Negotiation Gambit deliberately reuses the existing personality-tag system rather than inventing new cards — same tags, same tracking, one more place they matter.

**Schema**

```json
{
  "id": "duel_final_blow",
  "type": "minigame",
  "subtype": "duel_strike",
  "cards": [
    { "id": "high_left", "icon": "⚔️", "label": { "en": "Strike high-left", "es": "Golpe arriba a la izquierda" } },
    { "id": "high_right", "icon": "⚔️", "label": { "en": "Strike high-right", "es": "Golpe arriba a la derecha" } },
    { "id": "low_disarm", "icon": "🗡️", "label": { "en": "Aim low, disarm", "es": "Bajo, para desarmar" } },
    { "id": "feint_center", "icon": "🌀", "label": { "en": "Feint to center", "es": "Amague al medio" } }
  ],
  "resolution": {
    "type": "weighted_hidden_match",
    "baseWinChance": 0.45,
    "statInfluence": { "strength": 0.01, "dexterity": 0.005 },
    "cardModifiers": { "feint_center": { "winChanceDelta": 0.1, "critChanceDelta": 0.05 } }
  },
  "outcomes": {
    "critical": { "statDeltas": { "fame": 3 }, "goldDelta": 200 },
    "success": { "statDeltas": { "fame": 1 } },
    "partial": { "statDeltas": {}, "injuryRiskDelta": 0.1 },
    "fail": { "statDeltas": {}, "injuryRiskDelta": 0.3, "reputationDelta": -2 }
  }
}
```

**UI**: reveal cards, player clicks one, then a short resolution beat (reveal the hidden variable + result), then the normal narrative/outcome card. Same rarity-badge visual language as regular choices where relevant (e.g. a "risky" mini-game card can be flagged the same way a Volatile stat card is).

**Achievements tie-in**: clutch win in a decisive/final-moment mini-game ("El de la final"), flawless run through a specific mini-game type across the whole career, 3-for-3 correct Negotiation Gambit reads ("Sin Filtro" — already in the achievements list, this is where it actually triggers from).

## Archrival system

Already flagged as a gap and now built properly, with the richer profile: a rival isn't just a comparison number, it's effectively a second character running in parallel.

**Schema**:

```sql
CREATE TABLE rivals (
  character_id TEXT PRIMARY KEY REFERENCES characters(id),
  name TEXT NOT NULL, -- generated from the name pool at creation, not translated
  class TEXT NOT NULL,
  faction_id TEXT, -- clan/faction the rival currently belongs to, can change over the run
  power_level INTEGER NOT NULL DEFAULT 0, -- rival's own advancing "Media"-equivalent
  age INTEGER NOT NULL,
  location TEXT, -- flavor text, shown on every comparison widget
  achievements_count INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0, -- the head-to-head comparison metric, see below
  last_advanced_turn INTEGER NOT NULL DEFAULT 0
);
```

**Ambient advancement**: each season boundary, advance the rival's `power_level` and `score` via the seeded per-run RNG (RNG & determinism) — a small deterministic increment, not a full shadow simulation. This is the same technique World events uses, applied to one specific NPC instead of the whole world.

**Per-chapter callback events**: rather than only an occasional duel encounter, the rival should hit their own milestones that get reported to the player regardless of whether the player was involved — "he killed the dragon first," "he became a kingdom hero," "he betrayed his own clan." These are World Events scoped to the rival specifically (same content-bank mechanism, filtered by `involvesRival: true`), surfaced in the Season Summary newspaper. Direct encounters (a duel, trading barbs, a chance meeting) remain rarer, weight-gated special events using the existing Mini-games (Duel Final Blow) and Negotiation Gambit systems.

**Comparison metric**: `rivals.score` vs. the player's own equivalent tally (`counters.battles_won + counters.quests_completed`, matching the reference game's G+A pairing) — persistent HUD widget shows the running comparison every screen, same as the reference's "⚔️ G+A vs Medina." Achievement ties to finishing ahead on this metric (already in the achievements list).

**Epilogue**: full side-by-side final comparison across multiple metrics (not just the combined score) — battles won, achievements, factions led — same pattern as the reference game's end-of-career rival block.

## Clans / allegiance system

Player can go solo, join a clan, or later leave one clan for another — leaving is either amicable (contract ended, retirement offer) or a betrayal (jump to a rival/better-paying clan while still bound), and betrayal has teeth: reputation crash at the old clan, possible retaliation events, achievement/reputation consequences. This reuses the existing per-faction `reputations` table — a clan is just a faction with extra state (membership, rank, perks).

**Character state addition**: `characters.current_clan_id TEXT NULL REFERENCES clans(id)` — null = solo.

**Schema**

```sql
CREATE TABLE clans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL, -- locale map at content-authoring layer, see Internationalization
  specialty TEXT NOT NULL, -- e.g. 'gold', 'protection', 'fame', 'combat_training'
  perk_effect TEXT, -- JSON, same effect-type system as shop items
  rival_clan_id TEXT REFERENCES clans(id) -- optional hardcoded or generated rivalry
);

CREATE TABLE clan_memberships (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  clan_id TEXT NOT NULL REFERENCES clans(id),
  rank TEXT NOT NULL DEFAULT 'recruit', -- recruit | trusted | elder | leader
  joined_at_turn INTEGER NOT NULL,
  left_at_turn INTEGER,
  left_reason TEXT -- null while active; else 'retired' | 'betrayed' | 'expelled' | 'clan_dissolved' | 'died'
);
```

**Offer flow**: a `clan_offer` event type presents 2-4 clan cards (name, specialty, signing gold, perk) the same shape as the reference doc's job-offer screens ("Bombazo" cards). Offer frequency and gold size scale with Fame — low-fame characters get minor local clans, high-fame characters get rival clans actively poaching them. Solo characters get offers too; existing clan members get *rival* offers (the betrayal path).

**Joining (from solo)**: create `clan_memberships` row, set `current_clan_id`, apply signing bonus gold, initialize reputation at 0 in that faction ("Uno más", matching the tier system already in the achievements list).

**Leaving amicably**: contract-end event (fixed duration, or player-initiated at a natural break point) — closes membership with `left_reason='retired'`, reputation at that clan is preserved/frozen (can still hit "One Clan Man" / statue achievements later if they resocialize, design call for the agent), no penalty.

**Betraying (switching mid-contract for a better offer)**:
1. Close old membership, `left_reason='betrayed'`.
2. Crash reputation at old clan (e.g. hard floor or steep drop, not just a small dip — betrayal should read as irreversible).
3. Flag character `hunted_by = old_clan_id` for N turns — gate a small pool of "old clan sends someone after you" ambush/confrontation events into the content bank during that window (Strength/Dexterity/Charisma choices to escape/fight/talk down), tag `requiresHuntedBy`.
4. New clan membership opens at a *higher* starting rank/reputation than a cold join, reflecting that the new clan sought you out (design call: e.g. start at "Known" instead of "Stranger").
5. Unlock "Turncoat" achievement (already in the achievements list) if the new clan is the flagged `rival_clan_id` of the old one — that's the maximum-heel version of this move.

**Solo path stays viable**: no clan perks, but no obligations, no betrayal risk, no hunted events — ties into "Wanderer"/"Lone path" style achievements (finish with zero clan memberships, or the opposite: 5+ clans and no lasting loyalty, already listed as "Mercenario").

**Content bank tags needed**: `requiresClanId`, `requiresNoClan`, `requiresHuntedBy`, `excludesIfClanId` — same filter mechanism as age/class filters in the base event schema, just new predicates.

**UI**: clan offer cards render like the shop's retinue cards (icon, name, perk, cost/reward), with a clear "this will break your current contract" warning state when the player already has `current_clan_id` set — don't let betrayal happen by accidental click.

## Relationships

Named in the Concept section from the start ("choices affect stats, gold, reputation, relationships") but never actually designed — filling the gap, and pulling weight from the "more life, less combat" note: the reference game's most memorable beats are personal-life events (a dog on the pitch, a child born, a locker-room culture clash), not matches. The content bank should skew the same way — life/social events as the majority of volume, combat/quest events as the rest, not the other way around.

**Schema**:

```sql
CREATE TABLE relationships (
  character_id TEXT NOT NULL REFERENCES characters(id),
  npc_id TEXT NOT NULL, -- content-bank id, e.g. 'mentor_old_blacksmith'
  npc_role TEXT NOT NULL, -- 'mentor' | 'friend' | 'love_interest' | 'nemesis' | 'child' | 'apprentice'
  affinity INTEGER NOT NULL DEFAULT 0, -- -100 to 100
  peak_affinity INTEGER NOT NULL DEFAULT 0,
  last_seen_turn INTEGER NOT NULL,
  PRIMARY KEY (character_id, npc_id)
);
```

Recurring NPCs via content bank tags (`introducesRelationshipId` creates the row on first encounter, `requiresRelationshipId` gates later events on that NPC already existing) — same filter mechanism as everything else. Affinity tiers reuse the reputation-tier pattern (Stranger → Acquaintance → Friend/Ally → Devoted, or the negative mirror Wary → Rival → Nemesis).

**Content examples** (life events, not combat) — a mentor's apprentice disappears, a child wants to pursue a different path than the parent, a sick horse, an accidental insult to a noble that becomes a Long-term flag, a bard writing songs about the player, a village informally adopting the character. These feed the Legacy system directly (mentored NPCs, children, "settlements saved" flags) and give the personality-tag system more surface area beyond negotiation/press-style events.

**Achievements**: max affinity with any NPC ("Bonded for Life"), lowest affinity with any NPC ("Burned That Bridge" — betrayed a friend).

## Shop / economy

Gold sinks: healer, trainer (stat boosts), gear (combat modifiers), luxuries (cosmetic/flavor only, don't let luxuries affect stats — keep "gold spent" and "power progression" separate currencies conceptually, same as the reference doc's "la plata no cuenta para la gloria").

### Shop items

Three categories — Retinue and Luxury as already spec'd, plus a Consumables tier caught in later reference notes and not yet added:

**Retinue — functional, gameplay effects, permanent once bought**

| Icon | Item | Cost | Effect |
|---|---|---|---|
| 🍲 | Camp Cook | 8,000g | Less fatigue, steadier stats all season |
| 🩹 | Battle Healer | 11,000g | Lower injury risk |
| 🔮 | Camp Seer | 9,000g | Bad momentum streaks end sooner |
| 🗡️ | Weapon Master | 14,000g | Stat decline from age hits later |
| 📜 | Guild Herald | 12,000g | Better contract/quest offers and rewards |

**Consumables — temporary, 1-2 seasons, repurchasable**

| Icon | Item | Cost | Duration | Effect |
|---|---|---|---|---|
| 🥾 | Enchanted boots | 1,800g | 1 season | More battle wins this season |
| 🩹 | Season healer's contract | 2,500g | 2 seasons | Stamina + lower injury risk |
| ⚡ | Alchemical draught | 1,400g | 1 season | More stamina/appearances |
| 🎯 | Scout's dossier | 1,400g | 1 season | More quests completed |
| 🍀 | Lucky charm | 2,100g | 1 season | Luck boost in title/rank pushes |

**Luxury — cosmetic only, no stat effect**

| Icon | Item | Cost |
|---|---|---|
| 🐎 | Warhorse | 500g |
| 🏡 | Cottage | 1,500g |
| 🏰 | Manor with training grounds | 6,000g |
| 🗼 | Fortified tower | 12,000g |
| 🦅 | Personal griffon | 28,000g |
| 🏝️ | Floating pocket realm | 48,000g |

Rule: luxury spend never touches stats — gold sink for flavor/bragging rights/achievements only. Retinue and Consumable effects apply as passive modifiers on top of the deterministic stat math (Turn loop), never as a separate RNG source. Consumables need an `expiresAtTurn` (or season count) on the `inventory` row and a cleanup check at season boundary.

### Chapter-gated shop progression

The shop should read as career progression, not a flat catalog available from turn one — gate items by `current_arc` (Career arcs & chapters) so what's on offer visibly changes with the character's life stage:

- **Adventurer/Mercenary arcs**: Warhorse, Cottage, Camp Cook, Battle Healer — humble, early-career items.
- **Kingdom Hero arc**: Manor, Fortified tower, Guild Herald, foreign-kingdom-flavored consumables.
- **Legend arc**: Personal griffon, Floating pocket realm, a "Court Wizard" retinue slot, a "Private army" luxury tier — the grandest items simply aren't purchasable earlier, so reaching them *feels* like arrival rather than just having saved enough gold.

### Shop item schema

```json
{
  "id": "camp_healer",
  "category": "retinue",
  "name": "Battle Healer",
  "cost": 11000,
  "effect": { "type": "injuryRiskModifier", "value": -0.15 },
  "icon": "🩹",
  "flavor": "Steel and stitches, always at hand."
}
```

```json
{
  "id": "floating_realm",
  "category": "luxury",
  "name": "Floating pocket realm",
  "cost": 48000,
  "effect": null,
  "icon": "🏝️",
  "flavor": "A shard of sky you call your own.",
  "achievementTrigger": "jetset_life"
}
```

Effect types to support at minimum: `injuryRiskModifier`, `fatigueModifier`, `momentumRecoveryModifier`, `ageDeclineDelay`, `offerQualityModifier`. Add a new item by adding a JSON row + (if it's a new effect type) one modifier handler — never bespoke per-item code paths.

### Shop-driven achievements

- Buy all 5 retinue items (completionist)
- Own the top-tier luxury item (e.g. floating pocket realm)
- Finish a run having bought zero luxury items (frugal / "no lo tocó ni un peso" style)

## Internationalization (Spanish / English)

Ship both locales from day one — every player-facing string is translatable, none hardcoded in components or content files.

**Content authoring**: every text field in the event/choice/shop/achievement schema becomes a locale map instead of a plain string.

```json
{
  "id": "berserker_frenzy",
  "label": { "en": "Fight in a blind rage", "es": "Pelear con furia ciega" },
  "narrative": {
    "en": "You black out and come to standing over the wreckage...",
    "es": "Todo se vuelve negro y despertás parado sobre los restos..."
  },
  "rarity": "volatile",
  "statDeltas": { "strength": 7 },
  "tradeoffDeltas": { "constitution": -3, "charisma": -2 }
}
```

Apply the same `{ en, es }` shape to: event narrative, choice labels, shop item name/flavor, achievement name/description, UI chrome strings, class names/descriptions, faction/reputation tier names, class-flavor tags (Humble/Cocky/etc — these need natural translations, not literal ones, e.g. "Cocky" → "Canchero" not "Presumido").

**Parity tooling**: a build-time script that walks every content JSON file and fails the build if any entry is missing an `en` or `es` key. Don't let missing translations ship silently as blank strings or English fallback without flagging it.

**Persisted data stays language-neutral**: `stat_deltas`, `event_id`, `choice_id`, `rarity`, gold amounts — all ids/numbers, no baked text. Store the *reference*, not the resolved sentence.

**`turn_log.narrative`**: change from a resolved string to a recap reference (`event_id` + `choice_id` + interpolation vars, e.g. character name/class) — resolve to display text at render time in whatever locale the viewer has selected. This is what makes a leaderboard entry viewable in either language regardless of what locale the original player used. Add a `locale` column only if you want to record which locale the player actually played in (useful for analytics), but rendering should not depend on it.

**Epilogue / leaderboard**: same approach — store structured recap data (final stats, key event ids hit, achievement ids, cause of death/retirement reason code), not a baked paragraph. Render the epilogue text in the viewer's locale on read. If the optional AI narration layer (see "Do we need an LLM?") is enabled, pass the target locale into that prompt explicitly.

**Frontend**: react-i18next (or equivalent) for UI chrome; a locale switcher in settings; persist the player's locale choice server-side on the character/session so a resumed run opens in the same language, but rendering must support switching locale mid-view without re-fetching game logic.

**Player-entered text (character name) is never translated** — pass through as-is in both locales.

## Storage strategy: why a database, not localStorage

Ephemeral runs (15-30 min, then reset) is a *retention* property, not a reason to skip a database.

**Why not localStorage as source of truth**: breaks the server-authoritative turn resolution already decided above (client-editable state can't be trusted), doesn't survive a different device/browser, and there's no such thing as a shared leaderboard in per-browser storage.

**Write volume reality check**: one DB write per player choice (a click every few seconds to a minute) is normal request/response load, not a tick-based firehose — libSQL/Turso handles this fine at scale without a caching layer in v1.

**What "ephemeral" actually buys you — retention policy, not storage choice**:
- Active run: normal rows in `characters` + `turn_log`, refetched by run token on page load (reload-resilience comes from this, not from localStorage).
- Finished run: write one `leaderboard_entries` row (small, permanent).
- Scheduled cleanup job purges `turn_log` detail rows after a window (e.g. 30-90 days, or immediately post-finish if turn-by-turn replay isn't a feature) — keep only the tiny `leaderboard_entries` row forever.

**Client-side storage's only legitimate role**: a run-token cookie/param so the client knows which server-side run to refetch. Not a source of truth for stats, gold, or outcomes.

**Scaling path if needed later**: add a cache (Redis) in front of active-run reads/writes, libSQL stays the durable backing store. Don't build this until there's a measured reason to — v1 ships on libSQL alone.

## Non-goals for v1

- No live multiplayer/PvP
- No LLM in the critical path
- No client-side game-state authority (server always recomputes/validates)

## Open questions for the agent to resolve before scaffolding

- Express vs Fastify — pick based on what's fastest to wire with libSQL client + TS
- Daily leaderboard seed strategy: server cron reseeds at UTC midnight, or per-timezone?
- Auth: anonymous run token, resolved to an HTTP cookie (see Stack) vs real accounts for cross-device resume — cookie covers reload-resilience; add real accounts only if cross-device resume becomes a requirement
- Season length in turns (config, e.g. 5) — needs a real balance pass once content volume is known, since it also sets the pace of Career arcs and World events
- Elite-tier leaderboard split-off threshold (top 0.1%? top 1%?) — needs real run-score distribution data before it can be set sensibly
- Destiny card frequency/count for v1 content — "roughly once every 8-10 years" is a placeholder, not tuned

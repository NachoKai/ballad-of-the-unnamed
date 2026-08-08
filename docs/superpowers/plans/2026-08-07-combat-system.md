# Combat System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-authoritative, deterministic, class-differentiated turn-based combat system (Attack / class ability menu / Defend / Flee) to Ballad of the Unnamed — content-bank encounters, per-round persistence via inline `pendingCombat` state, rewards/death routed through the existing turn pipeline.

**Architecture:** Combat reuses the project's interactive-minigame blueprint exactly: encounter events are authored as a new content bank (`content/combat/`), served through the normal event rotation (a `wantCombat` rng branch in `selectEvent`), multi-round state persisted inline on the character JSONB (`c.pendingCombat`, no SQL table), one new route `POST /api/game/combat-move` (mirrors `/minigame-move`), and end-of-fight resolution reuses `finishResolvedTurn` (achievements / score / epilogue / next-event serving). All randomness threads the single per-run `Rng`. Class kits are authored data (`content/combat/class-kits.json`) — the client never hardcodes "Magic".

**Tech Stack:** TypeScript, Express, styled-components (client), vitest (two suites: `vitest.server.config.ts` for server+shared, root vitest for src), Postgres/Neon (no schema change — character JSONB).

## Global Constraints

- **Determinism:** every combat draw (creature pick, crit, damage variance, creature move pick, flee roll, loot roll) goes through the run's `Rng`. NEVER `Math.random()`. Same seed ⇒ same fight.
- **i18n:** every `LocaleMap` needs non-empty `en` AND `es`; `registry.ts` throws otherwise. Run `pnpm i18n:check` after any content edit. Spanish uses `genderize()` where prose references the player.
- **No prose in persisted state:** `PendingCombatState` stores structured, language-neutral data only. Localize at serve time (content LocaleMaps server-side; UI verbs client-side via `src/i18n/strings.ts`).
- **ESM `.js` extensions** on all relative imports (e.g. `./combat.js`).
- **Rarity ladder:** creature rarity is its own 5-tier scale — `common | uncommon | rare | elite | boss` (distinct from Choice rarity's 4 tiers).
- **`canKillPlayer: false`** (common/uncommon): creature damage is floored so `c.health` never drops below `GAME_CONFIG.combatSafetyFloor` (5). `rare+` can kill.
- **Death reuse:** combat loss is health-based; hitting 0 health routes through `rollDeath`/`heroicOrPeaceful` — the exact same mortality path as everything else. No second death system.
- **End-of-turn bookkeeping tail** (must run on combat end, mirroring `applyMinigameOutcome`): `updateMomentum → deductStamina → updateMarketValue → recomputeDerived → ageUp → clearExpiredHunted → rollDeath/maxAge`.
- **Resource refills per encounter** (never persists across fights): `resourceMax = floor(c[resourceStat] * kit.resourceMultiplier)` computed at combat start.
- **Encounter events never enter the regular event/minigame pools** — they live in `registry.combats` only.
- **`battles_won`** is the score-heavy counter; combat wins bump it (never double-bump).
- **Menu actions:** `attack | ability | defend | flee` only. **No Item action in v1** (the shop has no combat-usable items).
- **Run ownership / anti-cheat:** the server validates every move (pending combat matches the pending event, ability exists in the class kit, unlocked by age, resource sufficient, fight not over). A client can submit only an action, never a result.

## Design decisions (adaptations from the companion design doc)

1. **No `combat_sessions` SQL table.** This project persists each run as one JSONB `character` row with inline multi-round state (`pendingMinigame`, `pendingTournament`). Combat uses `c.pendingCombat` — zero migration, resume-safe via `/state`, deterministic. Confirmed with the user.
2. **Defend is a 5th basic action** (halves incoming damage this round). Confirmed with the user.
3. **Item action deferred** — the shop's consumables are all injury/fatigue/momentum modifiers; nothing combat-usable exists. Healing comes from abilities. Confirmed with the user.
4. **6 class kits** — the game has warrior, wizard, rogue, ranger, cleric, bard (not 4). Every class MUST have a kit; registry validation enforces it.
5. **Combat encounters are authored events** in `content/combat/encounters.json` with a `combat.creatures` pool (creature picked weighted-by-rarity at first serve). Age/arc/location/weight gating is free via the existing `isEligible` machinery.
6. **Creature "phase logic" is just move gating**: a move carries `minHealthFraction`/`maxHealthFraction`; it only enters the AI pool while the creature's health fraction is in that range. Enrage/heal/flee-if-low-hp are all expressed this way — no special boss code.
7. **Scope: Phases 1–5 of the doc** (content → engine → routes → rewards/achievements → client UI). Skipped: Phase 4 "World Event ↔ creature weights" stretch and Phase 6 balance pass.
8. **Turn accounting:** the fight plays out within one turn; `c.turn` advances exactly once at combat end (like `applyMinigameOutcome`). Rewards/counters land in the end handler. Flee does NOT mark the encounter complete (`event_<id>` not bumped), so recurring road encounters stay repeatable; wins DO complete the encounter.

---

### Task 1: Shared combat types + config knobs

**Files:**
- Modify: `shared/types.ts` (append combat types; add `combat?` to `EventContent`; add `pendingCombat?` to `CharacterState`)
- Modify: `shared/config.ts` (append combat knobs to `GAME_CONFIG`)
- Test: `shared/config.test.ts` (create — small sanity test)

**Interfaces:**
- Produces (consumed by every later task — copy EXACTLY):
  - `CombatMove`, `CombatSchool`, `CreatureRarity`, `CombatAbilityEffect`, `CombatAbility`, `ClassKit`, `CreatureMoveEffect`, `CreatureMove`, `CreatureLoot`, `CreatureContent`, `CombatStatus`, `PendingCombatState`, `CombatLogEntry`, `ServedCombatState`
  - `EventContent.combat?: { creatures: string[] }`
  - `CharacterState.pendingCombat?: PendingCombatState | null`
  - `GAME_CONFIG.combatEncounterChance | combatCritMultiplier | combatVariance | combatSafetyFloor | combatFleeBase | combatFleeDexCoeff | combatConMitigation | combatGuardFactor | combatPoisonPerTurn`

- [ ] **Step 1: Write the failing test**

```ts
// shared/config.test.ts
import { describe, expect, it } from "vitest"
import { GAME_CONFIG } from "./config.js"

describe("GAME_CONFIG combat knobs", () => {
  it("defines every combat knob with sane ranges", () => {
    const c = GAME_CONFIG
    expect(c.combatEncounterChance).toBeGreaterThan(0)
    expect(c.combatEncounterChance).toBeLessThan(0.5)
    expect(c.combatCritMultiplier).toBeGreaterThan(1)
    expect(c.combatVariance).toBeGreaterThan(0)
    expect(c.combatVariance).toBeLessThan(0.5)
    expect(c.combatSafetyFloor).toBeGreaterThan(0)
    expect(c.combatFleeBase).toBeGreaterThan(0)
    expect(c.combatFleeBase).toBeLessThan(1)
    expect(c.combatFleeDexCoeff).toBeGreaterThan(0)
    expect(c.combatConMitigation).toBeGreaterThan(0)
    expect(c.combatGuardFactor).toBeLessThan(1)
    expect(c.combatPoisonPerTurn).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails** — `pnpm exec vitest run --config vitest.server.config.ts shared/config.test.ts` → FAIL (knobs undefined).

- [ ] **Step 3: Append the types** to `shared/types.ts` (after the `CircusWheelConfig` block, before `TicTacToeMark`):

```ts
// ---- Combat system (multi-round, server-authoritative) ----

// Creature difficulty ladder — its OWN 5-tier scale, distinct from Choice rarity.
export type CreatureRarity = "common" | "uncommon" | "rare" | "elite" | "boss"

export type CombatSchool = "physical" | "magic"

// Player ability effects. `school` decides which creature resistance applies
// (physical → defense, magic → magicResistance).
export type CombatAbilityEffect =
  | "damage"            // school-scaled damage
  | "damage_and_debuff" // damage + creature slowed (attack x0.6, statusTurns)
  | "damage_over_time"  // poison: dotPerTurn dmg each round for statusTurns
  | "heal"              // heal = base + floor(stat * healCoefficient)
  | "buff_attack"       // player +attack for the fight (stacks; amount = base + stat*coeff)
  | "buff_defense"      // player damage mitigation +N for the fight (stacks)
  | "stun"              // creature skips its next action (chance = stunChance)
  | "flee_boost"        // flee auto-succeeds this round
  | "steal"             // small damage + gold equal to the damage dealt

export interface CombatAbility {
  id: string
  label: LocaleMap
  icon?: string
  cost: number          // resource cost (>= 1)
  effect: CombatAbilityEffect
  school: CombatSchool
  stat: StatKey
  coefficient: number
  base: number
  unlockAge?: number    // ability locked until the character reaches this age
  critChance?: number   // default 0.05 for damage abilities
  statusTurns?: number  // damage_and_debuff / damage_over_time duration
  dotPerTurn?: number   // damage_over_time per-round damage
  healCoefficient?: number // heal: default = coefficient
  stunChance?: number   // stun: default 1
}

// Per-class combat identity — authored as data, NEVER hardcoded in the UI.
export interface ClassKit {
  basicAttack: {
    label: LocaleMap
    stat: StatKey
    coefficient: number
    base: number
    critChance: number
  }
  abilityMenuLabel: LocaleMap
  resourceLabel: LocaleMap
  resourceStat: StatKey
  resourceMultiplier: number
  fleeModifier: number
  abilities: CombatAbility[]
}

export type CreatureMoveEffect =
  | "damage"             // damage = round((attack * damageMultiplier) * variance)
  | "self_buff_attack"   // creature attack x1.5 (enrage)
  | "debuff_player_attack" // player attack -debuffAmount (min 1)
  | "heal"               // self heal = healAmount (clamped to max health)
  | "flee_if_low_hp"     // creature flees (no rewards)

export interface CreatureMove {
  id: string
  name?: LocaleMap
  weight: number         // AI weighted pick
  effect: CreatureMoveEffect
  damageMultiplier?: number // damage: default 1
  healAmount?: number
  debuffAmount?: number  // debuff_player_attack: default 3
  // Phase gating: the move only enters the AI pool while the creature's health
  // fraction (current/max) is within [minHealthFraction, maxHealthFraction].
  minHealthFraction?: number
  maxHealthFraction?: number
}

export interface CreatureLoot {
  goldMin: number
  goldMax: number
  fameMin: number
  fameMax: number
  reputationDelta?: number
  reputationFaction?: string
  // item drop ids MUST reference existing shop.json item ids.
  items?: { itemId: string; chance: number }[]
}

export interface CreatureContent {
  id: string
  name: LocaleMap
  icon: string
  rarity: CreatureRarity
  arcs?: Arc[]           // creature only served during these arcs; absent = all
  canKillPlayer: boolean
  health: number
  attack: number
  defense: number        // reduces physical damage
  magicResistance: number // reduces magic damage
  moves: CreatureMove[]
  loot: CreatureLoot
  fleeDifficulty: number // 0..1; higher = harder to flee
}

// A status on one side of the fight. Language-neutral id; client localizes.
// turns: rounds remaining (0 = permanent until cleared).
export type CombatStatusId =
  | "poisoned"
  | "slowed"        // creature attack x0.6
  | "enraged"       // creature attack x1.5
  | "stunned"       // creature skips next action
  | "guarding"      // player: incoming damage x combatGuardFactor this round
  | "attack_up"     // player +attack
  | "attack_down"   // player -attack
  | "defense_up"    // player +defense
  | "smoke"         // player: flee auto-succeeds

export interface CombatStatus {
  id: CombatStatusId
  turns: number
  amount?: number        // poisoned dot / attack_up / attack_down / defense_up amount
}

// One round of the fight, language-neutral (client builds the prose lines).
export interface CombatLogEntry {
  round: number
  playerAction: "attack" | "ability" | "defend" | "flee"
  playerAbilityId?: string
  playerDamage?: number
  playerCrit?: boolean
  playerHeal?: number
  playerGold?: number
  playerFled?: boolean
  creatureMoveId?: string
  creatureDamage?: number
  creatureHeal?: number
  creatureFled?: boolean
  creatureSkipped?: boolean
  poisonedTick?: number   // poison damage applied to creature this round
}

// Server-persisted in-progress fight (stored in character.pendingCombat).
// The creature is SNAPSHOTTED at encounter start so content edits mid-run
// can't corrupt an active fight.
export interface PendingCombatState {
  eventId: string
  creature: CreatureContent
  creatureHealth: number
  creatureStatuses: CombatStatus[]
  playerBaseAttack: number   // kit basicAttack base + floor(stat * coeff)
  playerBaseDefense: number  // floor(constitution * combatConMitigation)
  playerStatuses: CombatStatus[]
  resource: number
  resourceMax: number
  round: number
  log: CombatLogEntry[]
  over: boolean
  result: "won" | "lost" | "fled" | null
}

// The fight as served to the client (localized labels only).
export interface ServedCombatState {
  creature: {
    id: string
    name: string
    icon: string
    rarity: CreatureRarity
    currentHealth: number
    maxHealth: number
    attack: number          // effective (x1.5 enraged, x0.6 slowed)
    defense: number
    magicResistance: number
    statuses: CombatStatus[]
  }
  player: {
    health: number
    maxHealth: number
    resource: number
    resourceMax: number
    resourceLabel: string
    attack: number          // effective
    defense: number         // effective
    statuses: CombatStatus[]
  }
  kit: {
    basicAttackLabel: string
    abilityMenuLabel: string
    abilities: { id: string; label: string; icon?: string; cost: number; unlocked: boolean }[]
  }
  round: number
  log: CombatLogEntry[]
  creatureMoveNames: Record<string, string>
  over: boolean
  result: "won" | "lost" | "fled" | null
}

// One action the client submits to /api/game/combat-move.
export type CombatMove =
  | { kind: "attack" }
  | { kind: "ability"; abilityId: string }
  | { kind: "defend" }
  | { kind: "flee" }
```

- [ ] **Step 4: Add `combat?` to `EventContent`** (near the `wheel?` field):

```ts
  // combat encounter: creature pool (ids into content/combat/creatures.json).
  // Served as a combat frame instead of a card grid (like interactive minigames).
  combat?: { creatures: string[] }
```

- [ ] **Step 5: Add `pendingCombat?` to `CharacterState`** (near `pendingMinigame`):

```ts
  // in-progress combat encounter state, persisted across moves/reloads.
  pendingCombat?: PendingCombatState | null
```

- [ ] **Step 6: Append the knobs** to `GAME_CONFIG` in `shared/config.ts` (inside the `as const` object, before `legendaryThresholdPercentile`):

```ts
  // Combat system. Encounters replace a regular turn with this probability
  // (rolled in selectEvent on its own draw). Resource refills every fight.
  combatEncounterChance: 0.12,
  combatCritMultiplier: 1.5,
  combatVariance: 0.15,      // +/-15% damage variance
  combatSafetyFloor: 5,      // canKillPlayer:false creatures can't drop health below this
  combatFleeBase: 0.6,
  combatFleeDexCoeff: 0.02,  // +0.02 per dexterity point
  combatConMitigation: 0.4,  // player defense = floor(constitution * this)
  combatGuardFactor: 0.5,    // defend halves incoming damage this round
  combatPoisonPerTurn: 3,    // fallback dot for damage_over_time without dotPerTurn
```

- [ ] **Step 7: Run the test to verify it passes** — `pnpm exec vitest run --config vitest.server.config.ts shared/config.test.ts` → PASS.

- [ ] **Step 8: Typecheck** — `pnpm exec tsc --noEmit` (or the repo's typecheck) → clean.

- [ ] **Step 9: Commit**

```bash
git add shared/types.ts shared/config.ts shared/config.test.ts
git commit -m "feat(combat): shared combat types and config knobs"
```

---

### Task 2: Combat content banks

**Files:**
- Create: `content/combat/class-kits.json`
- Create: `content/combat/creatures.json`
- Create: `content/combat/encounters.json`
- Test: run `pnpm i18n:check` (manual verification step)

**Interfaces:**
- Consumes: `ClassKit`, `CreatureContent`, `EventContent.combat` from Task 1.
- Produces: the three content files (validated in Task 3). Creature ids must match pool references in encounters.

- [ ] **Step 1: Write `content/combat/class-kits.json`** — all 6 classes. `class-kits.json` is a flat object keyed by class id:

```json
{
  "warrior": {
    "basicAttack": { "label": { "en": "Strike", "es": "Golpe" }, "stat": "strength", "coefficient": 1.2, "base": 4, "critChance": 0.1 },
    "abilityMenuLabel": { "en": "Shout", "es": "Grito" },
    "resourceLabel": { "en": "Rage", "es": "Furia" },
    "resourceStat": "strength",
    "resourceMultiplier": 2,
    "fleeModifier": -0.1,
    "abilities": [
      { "id": "rally_cry", "label": { "en": "Rally Cry", "es": "Grito de Guerra" }, "icon": "flag", "cost": 6, "effect": "buff_attack", "school": "physical", "stat": "strength", "coefficient": 0.3, "base": 3, "unlockAge": 18 },
      { "id": "battle_roar", "label": { "en": "Battle Roar", "es": "Rugido de Batalla" }, "icon": "zap", "cost": 10, "effect": "stun", "school": "physical", "stat": "strength", "coefficient": 0, "base": 0, "stunChance": 0.6, "unlockAge": 24 },
      { "id": "cleave", "label": { "en": "Cleave", "es": "Tajar" }, "icon": "swords", "cost": 8, "effect": "damage", "school": "physical", "stat": "strength", "coefficient": 1.6, "base": 2, "unlockAge": 20 }
    ]
  },
  "wizard": {
    "basicAttack": { "label": { "en": "Bonk", "es": "Golpe" }, "stat": "strength", "coefficient": 0.5, "base": 1, "critChance": 0.05 },
    "abilityMenuLabel": { "en": "Magic", "es": "Magia" },
    "resourceLabel": { "en": "Mana", "es": "Maná" },
    "resourceStat": "intelligence",
    "resourceMultiplier": 3.5,
    "fleeModifier": 0,
    "abilities": [
      { "id": "arcane_bolt", "label": { "en": "Arcane Bolt", "es": "Dardo Arcano" }, "icon": "sparkles", "cost": 6, "effect": "damage", "school": "magic", "stat": "intelligence", "coefficient": 0.9, "base": 1, "unlockAge": 16 },
      { "id": "firebolt", "label": { "en": "Firebolt", "es": "Bola de Fuego" }, "icon": "flame", "cost": 8, "effect": "damage", "school": "magic", "stat": "intelligence", "coefficient": 1.5, "base": 3, "unlockAge": 16 },
      { "id": "heal", "label": { "en": "Mending", "es": "Remedio" }, "icon": "heart-pulse", "cost": 12, "effect": "heal", "school": "magic", "stat": "intelligence", "coefficient": 0, "base": 6, "healCoefficient": 1.5, "unlockAge": 18 },
      { "id": "ice_shard", "label": { "en": "Ice Shard", "es": "Esquirla de Hielo" }, "icon": "snowflake", "cost": 10, "effect": "damage_and_debuff", "school": "magic", "stat": "intelligence", "coefficient": 1.2, "base": 2, "statusTurns": 2, "unlockAge": 22 },
      { "id": "firestorm", "label": { "en": "Firestorm", "es": "Tormenta de Fuego" }, "icon": "flame", "cost": 18, "effect": "damage", "school": "magic", "stat": "intelligence", "coefficient": 2.2, "base": 5, "unlockAge": 30 }
    ]
  },
  "rogue": {
    "basicAttack": { "label": { "en": "Stab", "es": "Puñalada" }, "stat": "dexterity", "coefficient": 1.0, "base": 3, "critChance": 0.25 },
    "abilityMenuLabel": { "en": "Tricks", "es": "Trucos" },
    "resourceLabel": { "en": "Focus", "es": "Enfoque" },
    "resourceStat": "dexterity",
    "resourceMultiplier": 2.5,
    "fleeModifier": 0.2,
    "abilities": [
      { "id": "poison_blade", "label": { "en": "Poison Blade", "es": "Hoja Envenenada" }, "icon": "skull", "cost": 7, "effect": "damage_over_time", "school": "physical", "stat": "dexterity", "coefficient": 0.6, "base": 2, "dotPerTurn": 3, "statusTurns": 3, "unlockAge": 16 },
      { "id": "smoke_bomb", "label": { "en": "Smoke Bomb", "es": "Bomba de Humo" }, "icon": "cloud-fog", "cost": 6, "effect": "flee_boost", "school": "physical", "stat": "dexterity", "coefficient": 0, "base": 0, "unlockAge": 18 },
      { "id": "steal", "label": { "en": "Pilfer", "es": "Sustraer" }, "icon": "coins", "cost": 8, "effect": "steal", "school": "physical", "stat": "dexterity", "coefficient": 0.8, "base": 4, "unlockAge": 20 },
      { "id": "cheap_shot", "label": { "en": "Cheap Shot", "es": "Golpe Bajo" }, "icon": "zap", "cost": 9, "effect": "stun", "school": "physical", "stat": "dexterity", "coefficient": 0, "base": 0, "stunChance": 0.7, "unlockAge": 24 }
    ]
  },
  "ranger": {
    "basicAttack": { "label": { "en": "Shoot", "es": "Disparar" }, "stat": "dexterity", "coefficient": 1.05, "base": 3, "critChance": 0.15 },
    "abilityMenuLabel": { "en": "Nature", "es": "Naturaleza" },
    "resourceLabel": { "en": "Focus", "es": "Enfoque" },
    "resourceStat": "dexterity",
    "resourceMultiplier": 2.5,
    "fleeModifier": 0.15,
    "abilities": [
      { "id": "companion_strike", "label": { "en": "Companion Strike", "es": "Golpe del Compañero" }, "icon": "paw-print", "cost": 8, "effect": "damage", "school": "physical", "stat": "dexterity", "coefficient": 1.3, "base": 3, "unlockAge": 16 },
      { "id": "herb_poultice", "label": { "en": "Herb Poultice", "es": "Cataplasma" }, "icon": "leaf", "cost": 10, "effect": "heal", "school": "magic", "stat": "dexterity", "coefficient": 0, "base": 5, "healCoefficient": 1.2, "unlockAge": 18 },
      { "id": "entangle", "label": { "en": "Entangle", "es": "Enredar" }, "icon": "vines", "cost": 9, "effect": "stun", "school": "magic", "stat": "dexterity", "coefficient": 0, "base": 0, "stunChance": 0.65, "unlockAge": 20 }
    ]
  },
  "cleric": {
    "basicAttack": { "label": { "en": "Mace", "es": "Mazo" }, "stat": "strength", "coefficient": 0.7, "base": 2, "critChance": 0.05 },
    "abilityMenuLabel": { "en": "Miracles", "es": "Milagros" },
    "resourceLabel": { "en": "Faith", "es": "Fe" },
    "resourceStat": "charisma",
    "resourceMultiplier": 2.5,
    "fleeModifier": 0,
    "abilities": [
      { "id": "smite", "label": { "en": "Smite", "es": "Castigar" }, "icon": "sun", "cost": 8, "effect": "damage", "school": "magic", "stat": "intelligence", "coefficient": 1.3, "base": 2, "unlockAge": 16 },
      { "id": "mend", "label": { "en": "Mend", "es": "Sanar" }, "icon": "heart-pulse", "cost": 10, "effect": "heal", "school": "magic", "stat": "charisma", "coefficient": 0, "base": 8, "healCoefficient": 1.8, "unlockAge": 16 },
      { "id": "bulwark", "label": { "en": "Bulwark", "es": "Baluarte" }, "icon": "shield", "cost": 12, "effect": "buff_defense", "school": "magic", "stat": "charisma", "coefficient": 0.4, "base": 3, "unlockAge": 20 },
      { "id": "holy_word", "label": { "en": "Holy Word", "es": "Palabra Sagrada" }, "icon": "sun", "cost": 14, "effect": "stun", "school": "magic", "stat": "charisma", "coefficient": 0, "base": 0, "stunChance": 0.5, "unlockAge": 26 }
    ]
  },
  "bard": {
    "basicAttack": { "label": { "en": "Dagger", "es": "Daga" }, "stat": "dexterity", "coefficient": 0.6, "base": 2, "critChance": 0.08 },
    "abilityMenuLabel": { "en": "Verse", "es": "Versos" },
    "resourceLabel": { "en": "Inspiration", "es": "Inspiración" },
    "resourceStat": "charisma",
    "resourceMultiplier": 2.5,
    "fleeModifier": 0.1,
    "abilities": [
      { "id": "cutting_verse", "label": { "en": "Cutting Verse", "es": "Verso Cortante" }, "icon": "scroll-text", "cost": 8, "effect": "damage", "school": "magic", "stat": "charisma", "coefficient": 1.4, "base": 2, "unlockAge": 16 },
      { "id": "inspiring_ballad", "label": { "en": "Inspiring Ballad", "es": "Balada Inspiradora" }, "icon": "music", "cost": 12, "effect": "buff_attack", "school": "magic", "stat": "charisma", "coefficient": 0.5, "base": 3, "unlockAge": 18 },
      { "id": "lullaby", "label": { "en": "Lullaby", "es": "Canción de Cuna" }, "icon": "moon", "cost": 10, "effect": "stun", "school": "magic", "stat": "charisma", "coefficient": 0, "base": 0, "stunChance": 0.55, "unlockAge": 20 }
    ]
  }
}
```

- [ ] **Step 2: Write `content/combat/creatures.json`** — 15 creatures. Every `name` is a LocaleMap; every move gets a `name` LocaleMap. `canKillPlayer` is false for common/uncommon and true for rare+. Icon names are lucide icon names (see `src/components/AchIcon.tsx` for the registry). Author the full file with EXACTLY these entries (stats are tuned to the Task 4 formulas: player damage = base + floor(stat*coeff) − resistance; adventurer warrior ≈ 13 per hit vs wolf defense 3):

| id | rarity | arcs | canKill | hp | atk | def | mres | fleeDiff | loot (gold/fame) | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| rat_swarm | common | adventurer | false | 18 | 4 | 0 | 0 | 0.1 | 3-8 / 0-1 | moves: swarm_bite(dmg 1.0 w75), scatter(flee_if_low_hp max0.2 w25) |
| bandit | common | adventurer | false | 30 | 6 | 2 | 1 | 0.25 | 10-25 / 0-1 | moves: strike(1.0 w70), dirty_trick(debuff 2 w20), run(flee max0.25 w10) |
| wild_boar | common | adventurer | false | 35 | 7 | 2 | 0 | 0.2 | 5-15 / 1 | moves: gore(1.0 w80), charge(1.3 w10), retreat(flee max0.2 w10) |
| dire_wolf | uncommon | adventurer..mercenary | false | 40 | 8 | 3 | 1 | 0.3 | 8-20 / 0-2 | moves: bite(1.0 w70), howl(self_buff max0.6 w20), retreat(flee max0.15 w10) |
| cave_troll | uncommon | adventurer..mercenary | false | 55 | 9 | 4 | 3 | 0.35 | 15-30 / 1-2 | moves: club(1.0 w75), regenerate(heal 8 max0.5 w15), enrage(self_buff max0.5 w10) |
| harpy | uncommon | adventurer..mercenary | false | 30 | 7 | 1 | 2 | 0.3 | 10-20 / 1-2 | moves: talons(1.0 w75), screech(debuff 3 w20), swoop(1.3 min0.5 w5) |
| werewolf | rare | adventurer..mercenary | true | 55 | 11 | 3 | 2 | 0.35 | 20-40 / 2-4 | moves: rend(1.1 w70), howl(self_buff max0.5 w20), retreat(flee max0.2 w10) |
| phantom | rare | adventurer..mercenary | true | 45 | 10 | 0 | 5 | 0.3 | 15-35 / 2-3 | moves: chill_touch(1.0 w80), wail(debuff 3 w15), vanish(flee max0.2 w5) |
| ogre_chief | rare | mercenary..kingdom_hero | true | 70 | 12 | 4 | 1 | 0.4 | 30-60 / 3-5 | moves: smash(1.1 w70), bellow(self_buff max0.5 w20), intimidate(debuff 4 w10) |
| stone_golem | elite | mercenary..kingdom_hero | true | 90 | 12 | 8 | 4 | 0.5 | 40-80 / 4-6 | moves: slam(1.1 w80), mend(heal 12 max0.6 w20) |
| frost_wyrm | elite | mercenary..kingdom_hero | true | 85 | 13 | 5 | 6 | 0.45 | 50-90 / 5-8 | moves: frost_bite(1.1 w75), freezing_breath(1.3 w20), ice_armor(heal 15 max0.6 w5) |
| shadow_knight | elite | kingdom_hero..legend | true | 100 | 14 | 5 | 5 | 0.5 | 60-100 / 5-8 | moves: cursed_blade(1.1 w80), dark_aegis(heal 18 max0.5 w20) |
| young_dragon | boss | kingdom_hero..legend | true | 130 | 15 | 6 | 7 | 0.6 | 100-180 / 10-15 | moves: claw(1.0 w70), fire_breath(1.4 min0.5 w20), enrage(self_buff max0.5 w5), brood(heal 20 max0.4 w5) |
| elder_dragon | boss | legend..old_hero | true | 200 | 18 | 8 | 9 | 0.7 | 200-350 / 20-30 | moves: claw(1.1 w70), inferno(1.5 min0.5 w20), ancient_fury(self_buff max0.5 w5), regenerate(heal 30 max0.35 w5) |
| lich_king | boss | legend..old_hero | true | 180 | 17 | 7 | 12 | 0.7 | 180-300 / 20-30 | moves: soul_drain(1.2 w80), bone_shield(heal 25 max0.5 w15), lich_curse(debuff 6 w5) |

`arcs` is an array of the arcs the creature may appear in (e.g. `["adventurer","mercenary"]`). Give every creature a `name` LocaleMap (en/es) and every move a `name` LocaleMap. Give each creature a fitting lucide `icon` (e.g. rat_swarm → "rat", dire_wolf → "wolf", cave_troll → "monster", werewolf → "moon", phantom → "ghost", ogre_chief → "beef", stone_golem → "mountain", frost_wyrm → "snowflake", shadow_knight → "knight", young_dragon → "flame", elder_dragon → "dragon", lich_king → "skull").

- [ ] **Step 3: Write `content/combat/encounters.json`** — 10 encounter events, `EventContent[]` shape with `type: "combat"`. They have NO `choices` and NO `cards`/`resolution`/`outcomes` — just age/arc/location gates, `weight`, a `narrative` LocaleMap, and `combat: { creatures: [...] }`. Recurring encounters do NOT set `excludeIfCompletedIds`; the one-shot set-pieces do (e.g. `"excludeIfCompletedIds": ["__self__"]` is NOT a thing — one-shots use the event's own id via the `event_<id>` counter: set `"excludeIfCompletedIds": ["dragon_hoard"]` where the id matches the event's own id). Encounter ids: `road_ambush`, `wolf_territory`, `cave_den`, `swamp_horrors`, `ogre_raids`, `golem_awakening`, `shadow_haunts`, `dragon_hoard`, `elder_dragon_wake`, `lich_tower`. Author full en/es narratives (2-3 sentences each) using `{slot:...}` pools from `content/slots.json` where natural. Example:

```json
[
  {
    "id": "road_ambush",
    "type": "combat",
    "minAge": 16,
    "maxAge": 99,
    "weight": 3,
    "location": "road",
    "narrative": {
      "en": "Brambles claw at the {slot:road} as figures step onto the path ahead. The leader twirls a blade and grins. 'The road takes its toll, traveler. Hand it over, or we take it from your bones.'",
      "es": "Las zarzas arañan el {slot:road} mientras unas figuras se plantan en el sendero. El líder hace girar una hoja y sonríe. 'El camino cobra su peaje, viajera. Entrégalo, o lo sacamos de tus huesos.'"
    },
    "combat": { "creatures": ["bandit", "wild_boar", "dire_wolf"] }
  }
]
```

Encounter table (weights, arcs via minAge, locations, pools):
1. `road_ambush` — 16-99, road, w3, recurring — [bandit, wild_boar, dire_wolf]
2. `wolf_territory` — 18-45, road, w2, recurring — [dire_wolf, harpy, werewolf]
3. `cave_den` — 20-99, dungeon, w2, recurring — [cave_troll, werewolf, rat_swarm]
4. `swamp_horrors` — 16-99, foreign, w2, recurring — [phantom, cave_troll, ogre_chief]
5. `ogre_raids` — 24-99, road, w2, recurring — [ogre_chief, stone_golem]
6. `golem_awakening` — 26-99, dungeon, w1, ONE-SHOT (excludeIfCompletedIds: ["golem_awakening"]) — [stone_golem]
7. `shadow_haunts` — 40-99, court, w1, recurring — [shadow_knight, phantom]
8. `dragon_hoard` — 35-99, foreign, w1, ONE-SHOT — [young_dragon]
9. `elder_dragon_wake` — 60-99, foreign, w1, ONE-SHOT — [elder_dragon]
10. `lich_tower` — 60-99, dungeon, w1, ONE-SHOT — [lich_king]

Note: `hasPlayableChoice` returns false for these (no choices), so they can never leak into the normal event rotation — `selectEvent` picks them only through its combat branch.

- [ ] **Step 4: Verify locale parity** — `pnpm i18n:check` → PASS (all new LocaleMaps have en + es).

- [ ] **Step 5: Commit**

```bash
git add content/combat
git commit -m "feat(combat): class kits, creatures, and encounter content"
```

---

### Task 3: Content registry — load + validate combat banks

**Files:**
- Modify: `server/content/registry.ts`
- Test: `server/engine/engine.test.ts` (append a `describe("combat content validation")` block) or a new `server/content/registry.test.ts` — prefer a new focused test file: `server/content/registry.test.ts` (create).

**Interfaces:**
- Consumes: `ClassKit`, `CreatureContent`, `CreatureRarity`, `CombatAbilityEffect`, `CreatureMoveEffect` from Task 1; the content files from Task 2.
- Produces (consumed by Tasks 4-7):
  - `ContentRegistry.combats: EventContent[]`
  - `ContentRegistry.combatsById: Map<string, EventContent>`
  - `ContentRegistry.classKits: Record<string, ClassKit>`
  - `ContentRegistry.creatures: CreatureContent[]`
  - `ContentRegistry.creaturesById: Map<string, CreatureContent>`
  - `export function isCreatureRarity(r: string): r is CreatureRarity`

- [ ] **Step 1: Write the failing test** — `server/content/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { loadContent } from "./registry.js"

describe("combat content", () => {
  const reg = loadContent()

  it("loads a class kit for every class", () => {
    for (const cls of reg.classes) {
      const kit = reg.classKits[cls.id]
      expect(kit, `missing kit for ${cls.id}`).toBeDefined()
      expect(kit.abilities.length).toBeGreaterThan(0)
    }
  })

  it("loads combat encounters with creature pools that resolve", () => {
    expect(reg.combats.length).toBeGreaterThan(0)
    for (const ev of reg.combats) {
      expect(ev.type).toBe("combat")
      expect(ev.combat?.creatures.length).toBeGreaterThan(0)
      for (const cid of ev.combat!.creatures) {
        expect(reg.creaturesById.has(cid), `encounter ${ev.id} unknown creature ${cid}`).toBe(true)
      }
    }
  })

  it("every creature is well-formed", () => {
    for (const cr of reg.creatures) {
      expect(cr.health).toBeGreaterThan(0)
      expect(cr.attack).toBeGreaterThan(0)
      expect(cr.moves.length).toBeGreaterThan(0)
      expect(cr.loot.goldMax).toBeGreaterThanOrEqual(cr.loot.goldMin)
      expect(cr.loot.fameMax).toBeGreaterThanOrEqual(cr.loot.fameMin)
      for (const mv of cr.moves) expect(mv.weight).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run --config vitest.server.config.ts server/content/registry.test.ts` → FAIL (combats/classKits undefined).

- [ ] **Step 3: Implement loading + validation** in `server/content/registry.ts`:

- Add to the imports: `ClassKit, CreatureContent, CreatureRarity, CombatAbilityEffect, CreatureMoveEffect, CombatMove` types (as needed) and extend the `ContentRegistry` interface with the five new members.
- Add a helper:
```ts
const CREATURE_RARITIES = ["common", "uncommon", "rare", "elite", "boss"] as const
export function isCreatureRarity(r: string): r is CreatureRarity {
  return (CREATURE_RARITIES as readonly string[]).includes(r)
}
const ABILITY_EFFECTS = [
  "damage", "damage_and_debuff", "damage_over_time", "heal",
  "buff_attack", "buff_defense", "stun", "flee_boost", "steal",
] as const
const MOVE_EFFECTS = [
  "damage", "self_buff_attack", "debuff_player_attack", "heal", "flee_if_low_hp",
] as const
```
- Load `content/combat/class-kits.json` as `Record<string, ClassKit>`; validate: every `registry.classes` id has a kit; each kit's basicAttack has a LocaleMap label; `resourceStat` is in `STAT_KEYS`; `resourceMultiplier > 0`; every ability has a LocaleMap label, `cost >= 1`, a valid `effect` (in `ABILITY_EFFECTS`), a valid `school` ("physical"|"magic"), a stat in `STAT_KEYS`; `unlockAge` if present >= 0. Build `classKits: Record<string, ClassKit>`.
- Load `content/combat/creatures.json` as `CreatureContent[]`; validate per creature: `name` LocaleMap; `rarity` via `isCreatureRarity`; `health/attack/defense/magicResistance >= 0`, `health >= 1`; `moves` non-empty, each with `weight > 0` and valid `effect` (in `MOVE_EFFECTS`); damage moves may carry `damageMultiplier` (default 1); `loot.goldMin/goldMax/fameMin/fameMax` integers with max >= min; item drop `itemId`s must exist in the shop bank (`shop.some((s) => s.id === itemId)`); `fleeDifficulty` in 0..1. Build `creaturesById` map. Note: a handful of creatures may legitimately have empty `items` — the shop-id check only runs for declared drops.
- Load `content/combat/encounters.json` as `EventContent[]`; validate like events: `narrative` LocaleMap; `weight > 0`; `type === "combat"`; `combat?.creatures` non-empty; every creature id resolves via `creaturesById`; age/arc sanity via the standard `assert` calls. Skip the `hasPlayableChoice`-style checks (no choices). Push to `combats`; build `combatsById`.
- Add all five members to the returned `cached` object.

- [ ] **Step 4: Run to verify it passes** — same command → PASS. Also run `pnpm exec vitest run --config vitest.server.config.ts` (whole server suite) to confirm the existing content-validation loop in `engine.test.ts` still passes with the new banks.

- [ ] **Step 5: Commit**

```bash
git add server/content/registry.ts server/content/registry.test.ts
git commit -m "feat(combat): registry loading and validation for combat content"
```

---

### Task 4: Combat engine — formulas and round resolution (pure)

**Files:**
- Create: `server/engine/combat/index.ts` (pure logic; NO imports from `../helpers.js` or `../engine.js` — inline a tiny `loc(m, locale)` for LocaleMaps to avoid import cycles)
- Create: `server/engine/combat/combat.test.ts`

**Interfaces:**
- Consumes: types from Task 1, `Rng`, `GAME_CONFIG`.
- Produces (consumed by Tasks 5-7):
  - `export function playerBaseAttack(c: CharacterState, kit: ClassKit): number` → `kit.basicAttack.base + Math.floor(c[kit.basicAttack.stat] * kit.basicAttack.coefficient)`
  - `export function playerBaseDefense(c: CharacterState): number` → `Math.floor(c.constitution * GAME_CONFIG.combatConMitigation)`
  - `export function effectiveAttack(side: { attack: number; statuses: CombatStatus[] }): number` (applies attack_up/attack_down on player side; creature enrage/slowed handled via multipliers below)
  - `export function physicalDamage(dmg: number, defense: number): number` → `Math.max(1, dmg - defense)`
  - `export function rollVariance(rng: Rng): number` → `1 - GAME_CONFIG.combatVariance + rng.next() * GAME_CONFIG.combatVariance * 2`
  - `export function fleeChance(c: CharacterState, kit: ClassKit, creature: CreatureContent): number` → `clamp(combatFleeBase + kit.fleeModifier + c.dexterity * combatFleeDexCoeff - creature.fleeDifficulty, 0.1, 0.95)`
  - `export function pickCreatureMove(creature: CreatureContent, healthFrac: number, rng: Rng): CreatureMove` (weighted pick among moves whose min/maxHealthFraction gates pass)
  - `export function applyStatusesTick(state: PendingCombatState, c: CharacterState): void` — decrement `turns`; tick `poisoned` (creature loses `amount ?? combatPoisonPerTurn`); clear expired; remove `guarding` from the player at round end.
  - `export function resolveCombatRound(state: PendingCombatState, c: CharacterState, kit: ClassKit, move: CombatMove, rng: Rng): { over: boolean }` — the full player-action + creature-reaction + end-of-round tick. Mutates `state` and `c.health`. Sets `state.over`/`state.result` when the fight ends. The kit comes from the caller (`registry.classKits[c.class]`), used for ability lookup/cost and the basic-attack crit chance.

- [ ] **Step 1: Write the failing tests** — `server/engine/combat/combat.test.ts`. Build a `makeChar` helper (mirror `engine.test.ts`'s): a `CharacterState` with class `warrior` (or param), `strength: 8, dexterity: 5, constitution: 7, intelligence: 3, charisma: 4`, `health: 100`, `turn: 0`, empty counters. Build a `makeKit` helper returning a minimal `ClassKit` with one basic attack and the abilities under test. Build `makeCreature(overrides)` returning a minimal `CreatureContent` with default `{ health: 40, attack: 8, defense: 3, magicResistance: 1, canKillPlayer: false, fleeDifficulty: 0.3, moves: [{ id: "bite", name: {en:"Bite",es:"Mordisco"}, weight: 100, effect: "damage", damageMultiplier: 1 }], loot: {...} }`.

Tests (all deterministic — assert exact numbers from a fixed seed only where the draw sequence is pinned; otherwise assert invariants):
1. **damage clamps at minimum 1** — a basic attack against defense > damage deals 1.
2. **physical vs magic resistance** — a magic ability against a creature with high `magicResistance` and low `defense` deals less than a physical one with equal raw damage; assert `physicalDamage`/`magicDamage` paths land correctly.
3. **crit applies combatCritMultiplier** — force a crit (set `critChance: 1`) and assert damage is scaled by `GAME_CONFIG.combatCritMultiplier`.
4. **variance stays within bounds** — over 50 rounds, observed player damage to a 0-defense creature is always within `base * (1 ± combatVariance + crit)` of expected.
5. **`canKillPlayer: false` floor** — a creature with `attack: 99` never drops player health below `combatSafetyFloor` after a full round (run enough rounds with a guard: assert `c.health >= 5` at every step).
6. **`canKillPlayer: true` can kill** — same creature with `canKillPlayer: true` can drive health to 0; assert `state.over && state.result === "lost"` and `c.health === 0`.
7. **creature dies → won** — creature with `health: 1`; a single attack ends the fight with `result === "won"`.
8. **resource deduction + rejection** — using an ability deducts its cost; a second use when resource is insufficient throws `"insufficient resource"` (the caller rejects before resolution).
9. **ability unlock gate** — an ability with `unlockAge: 99` on a 16-year-old throws `"locked ability"`.
10. **flee semantics** — a `flee_boost` status makes flee always succeed; a normal flee with `fleeChance` forced to 1 succeeds and ends the fight `result === "fled"`; a failed flee (chance forced 0) lets the creature act and the fight continues.
11. **creature AI phase gating** — a creature with moves `bite` (always), `enrage` (maxHealthFraction 0.5) and `flee` (maxHealthFraction 0.2): at full health the pool is only bite; below 50% enrage can be picked; below 20% flee can be picked. Drive with a seeded rng and assert the picked move sets.
12. **stun skips creature action** — a stun ability with `stunChance: 1` results in `creatureSkipped` on the round log and no `creatureDamage`.
13. **poison ticks** — `damage_over_time` applies `poisoned`; on subsequent rounds the creature loses `dotPerTurn` health from `poisonedTick`, and the status expires after `statusTurns`.
14. **slowed debuff** — `damage_and_debuff` reduces creature attack while the status is active.
15. **heal ability** — heals player health, clamped to 100.
16. **buff_attack stacks** — two rally cries increase effective player attack; `buff_defense` increases effective player defense.
17. **steal** — deals damage and grants gold equal to the damage dealt.

- [ ] **Step 2: Run to verify they fail** — `pnpm exec vitest run --config vitest.server.config.ts server/engine/combat/combat.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `server/engine/combat/index.ts`** — the pure functions + `resolveCombatRound`. Exact contracts:

```ts
import type {
  CharacterState,
  ClassKit,
  CombatMove,
  CombatStatus,
  CreatureContent,
  CreatureMove,
  Locale,
  LocaleMap,
  PendingCombatState,
} from "../../../shared/types.js"
import type { Rng } from "../../../shared/rng.js"
import { GAME_CONFIG } from "../../../shared/config.js"

// Tiny inline locale lookup — do NOT import from helpers.js (import cycle:
// helpers imports this module for the serve path).
function loc(m: LocaleMap, locale: Locale): string {
  return m[locale] ?? m.en
}
export { loc }

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function playerBaseAttack(c: CharacterState, kit: ClassKit): number {
  const b = kit.basicAttack
  return b.base + Math.floor(c[b.stat] * b.coefficient)
}

export function playerBaseDefense(c: CharacterState): number {
  return Math.floor(c.constitution * GAME_CONFIG.combatConMitigation)
}

export function rollVariance(rng: Rng): number {
  return 1 - GAME_CONFIG.combatVariance + rng.next() * GAME_CONFIG.combatVariance * 2
}

// Physical damage to a creature: defense subtracts; magic uses magicResistance.
export function physicalDamage(raw: number, defense: number): number {
  return Math.max(1, raw - defense)
}
export function magicDamage(raw: number, resistance: number): number {
  return Math.max(1, raw - resistance)
}

// Effective creature attack: enraged x1.5, slowed x0.6 (statuses on the creature).
export function creatureEffectiveAttack(creature: CreatureContent, statuses: CombatStatus[]): number {
  let atk = creature.attack
  if (statuses.some((s) => s.id === "enraged")) atk *= 1.5
  if (statuses.some((s) => s.id === "slowed")) atk *= 0.6
  return Math.max(1, Math.round(atk))
}

// Effective player attack: base + attack_up − attack_down (min 1).
export function playerEffectiveAttack(state: PendingCombatState): number {
  let atk = state.playerBaseAttack
  for (const s of state.playerStatuses) {
    if (s.id === "attack_up") atk += s.amount ?? 0
    if (s.id === "attack_down") atk -= s.amount ?? 0
  }
  return Math.max(1, Math.round(atk))
}

export function playerEffectiveDefense(state: PendingCombatState): number {
  let def = state.playerBaseDefense
  for (const s of state.playerStatuses) {
    if (s.id === "defense_up") def += s.amount ?? 0
  }
  return def
}

export function fleeChance(c: CharacterState, kit: ClassKit, creature: CreatureContent): number {
  return clamp(
    GAME_CONFIG.combatFleeBase + kit.fleeModifier + c.dexterity * GAME_CONFIG.combatFleeDexCoeff - creature.fleeDifficulty,
    0.1,
    0.95,
  )
}

// Weighted pick among the moves whose health-fraction gates pass.
export function pickCreatureMove(
  creature: CreatureContent,
  healthFrac: number,
  rng: Rng,
): CreatureMove {
  const pool = creature.moves.filter((m) => {
    if (m.minHealthFraction != null && healthFrac < m.minHealthFraction) return false
    if (m.maxHealthFraction != null && healthFrac > m.maxHealthFraction) return false
    return true
  })
  const list = pool.length > 0 ? pool : creature.moves
  return rng.weighted(list, (m) => m.weight)
}

export function hasStatus(statuses: CombatStatus[], id: CombatStatusId): boolean {
  return statuses.some((s) => s.id === id)
}
```

Then `resolveCombatRound(state, c, move, rng)` — the meat. Behavior spec (implement exactly):

1. **Guards (throw):** `state.over` already true → `"combat already finished"`. `move.kind === "ability"`:
   - ability must exist in the kit → else `"unknown ability"`.
   - `c.age >= (ability.unlockAge ?? 0)` → else `"locked ability"`.
   - `state.resource >= ability.cost` → else `"insufficient resource"`.
2. **Round ++**, push a `CombatLogEntry` (round = current).
3. **Player action:**
   - `attack`: raw = `playerEffectiveAttack`; roll crit `rng.bool(kit.basicAttack.critChance)` → × `combatCritMultiplier`; apply `rollVariance`; damage = physical vs `creature.defense`. Log `playerDamage`, `playerCrit`. `state.creatureHealth -= damage`.
   - `ability` (dispatch on `effect`):
     - `damage` / `damage_and_debuff`: school-based resistance; crit via `ability.critChance ?? 0.05`; log damage; `damage_and_debuff` also pushes creature `slowed` (statusTurns ?? 2). `damage_and_debuff`'s damage uses the ability's school.
     - `damage_over_time`: initial hit `base + floor(stat*coeff)` (physical, vs defense) + creature status `poisoned` { turns: statusTurns ?? 3, amount: dotPerTurn ?? combatPoisonPerTurn }.
     - `heal`: `amount = base + floor(c[stat] * (healCoefficient ?? coefficient))`; `c.health = min(100, c.health + amount)`; log `playerHeal`.
     - `buff_attack`: push player `attack_up` { turns: 0, amount: base + floor(stat*coeff) }.
     - `buff_defense`: push player `defense_up` { turns: 0, amount: base + floor(stat*coeff) }.
     - `stun`: if `rng.bool(stunChance ?? 1)` push creature `stunned` { turns: 1 }.
     - `flee_boost`: push player `smoke` { turns: 0 }.
     - `steal`: damage (physical, vs defense) + `c.gold += damage`; log `playerDamage` + `playerGold`.
     - deduct `ability.cost` from `state.resource`.
   - `defend`: push player `guarding` { turns: 1 }.
   - `flee`: success = `hasStatus(playerStatuses, "smoke")` → true, else `rng.bool(fleeChance(c, kit, creature))`. On success → `state.over = true; state.result = "fled"`; log `playerFled`; return. On failure → log nothing extra; the creature still acts.
4. **Check creature death:** if `state.creatureHealth <= 0` → `over = true; result = "won"`; return (creature does NOT act).
5. **Creature reaction** (skip if creature `stunned`): pick move via `pickCreatureMove` with `healthFrac = creatureHealth / creature.health`; dispatch:
   - `damage`: `dmg = round(creatureEffectiveAttack * (damageMultiplier ?? 1) * rollVariance(rng))`; `mitigation = playerEffectiveDefense(state)`; if player `guarding` → `dmg = round(dmg * combatGuardFactor)`; `dmg = max(1, dmg - mitigation)`; then floor: `if (!creature.canKillPlayer) dmg = max(dmg, ... )` — apply as: `const next = c.health - dmg; if (!creature.canKillPlayer) c.health = Math.max(GAME_CONFIG.combatSafetyFloor, next); else c.health = next`. Log `creatureDamage`.
   - `self_buff_attack`: push creature `enraged` { turns: 0 }.
   - `debuff_player_attack`: push player `attack_down` { turns: 2, amount: debuffAmount ?? 3 }.
   - `heal`: `creatureHealth = min(max, creatureHealth + (healAmount ?? 0))`; log `creatureHeal`.
   - `flee_if_low_hp`: `over = true; result = "fled"`... NO — creature fleeing is NOT the player winning: set `over = true; result = "fled"` but with a `creatureFled` log flag so the client can render "the creature fled" (player gets no rewards — the end handler treats `result === "fled"` as no rewards regardless of who fled; the log line distinguishes flavor).
   - If `stunned`, log `creatureSkipped` and skip.
6. **Player death check:** if `c.health <= 0` → `over = true; result = "lost"`; return.
7. **End of round:** clear player `guarding`; tick statuses (`applyStatusesTick`): decrement each status `turns` (skip turns===0 permanents), drop those ≤ 0; poison: `creatureHealth -= poisoned.amount`; if that kills the creature → `over = true; result = "won"` (log `poisonedTick`). Log `poisonedTick` on the round entry.

- [ ] **Step 4: Run to verify they pass** — the combat.test.ts suite → PASS.

- [ ] **Step 5: Typecheck** — `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add server/engine/combat
git commit -m "feat(combat): deterministic round-resolution engine"
```

---

### Task 5: Combat session — init, serve view, resume

**Files:**
- Modify: `server/engine/combat/index.ts` (append session lifecycle)
- Modify: `server/engine/combat/combat.test.ts` (append session tests)

**Interfaces:**
- Consumes: Task 4's exports; `ContentRegistry` (for `classKits` and `creaturesById`).
- Produces (consumed by Tasks 6-7):
  - `export function startCombatState(ev: EventContent, c: CharacterState, registry: ContentRegistry, rng: Rng): PendingCombatState` — picks the creature and initializes the fight.
  - `export function prepareCombatServe(ev: EventContent, c: CharacterState, locale: Locale, registry: ContentRegistry, rng: Rng): ServedCombatState` — initializes state once per event (Rng draw only on first serve), then returns `combatView`.
  - `export function combatView(state: PendingCombatState, c: CharacterState, locale: Locale, registry: ContentRegistry): ServedCombatState` — Rng-FREE (safe on the resume path).

- [ ] **Step 1: Write the failing tests** (append to `combat.test.ts`):
1. **creature pick is weighted and arc-gated** — an encounter with a pool of `[rat_swarm, dire_wolf]` on a character in the `adventurer` arc: seeded rng picks deterministically; a creature whose `arcs` excludes the current arc is never picked (assert by seeding two identical runs and comparing, and by removing eligible creatures → only eligible ones appear).
2. **resource computed from kit** — a wizard (`intelligence: 9`, multiplier 3.5) starts with `resourceMax === 31` (`floor(9 * 3.5)`).
3. **state snapshot matches served view** — after `startCombatState`, `combatView` reflects creature health/max, player health, resource, kit labels, `creatureMoveNames` localized, and `over === false`.
4. **prepareCombatServe is idempotent on resume** — after one call, a second call with a DIFFERENT rng does not change `state.creature.id` or consume draws (assert the rng state is unchanged after the second call).
5. **log round numbers increment** — after two `resolveCombatRound` calls, `state.log.map(l => l.round)` equals `[1, 2]`.

- [ ] **Step 2: Run to verify they fail** → FAIL (functions missing).

- [ ] **Step 3: Implement** (append to `server/engine/combat/index.ts`):

```ts
// Weight for the rarity-weighted creature pick (higher rarity = rarer).
const CREATURE_WEIGHT: Record<CreatureRarity, number> = {
  common: 5, uncommon: 3, rare: 1.5, elite: 0.6, boss: 0.2,
}

export function startCombatState(
  ev: EventContent,
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): PendingCombatState {
  const pool = (ev.combat?.creatures ?? [])
    .map((id) => registry.creaturesById.get(id))
    .filter((cr): cr is CreatureContent => Boolean(cr))
    .filter((cr) => !cr.arcs || cr.arcs.includes(c.currentArc))
  const creature = rng.weighted(pool, (cr) => CREATURE_WEIGHT[cr.rarity])
  const kit = registry.classKits[c.class]
  const resourceMax = Math.floor(c[kit.resourceStat] * kit.resourceMultiplier)
  return {
    eventId: ev.id,
    creature,
    creatureHealth: creature.health,
    creatureStatuses: [],
    playerBaseAttack: playerBaseAttack(c, kit),
    playerBaseDefense: playerBaseDefense(c),
    playerStatuses: [],
    resource: resourceMax,
    resourceMax,
    round: 0,
    log: [],
    over: false,
    result: null,
  }
}

export function combatView(
  state: PendingCombatState,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
): ServedCombatState {
  const kit = registry.classKits[c.class]
  const moveNames: Record<string, string> = {}
  for (const mv of state.creature.moves) {
    moveNames[mv.id] = loc(mv.name ?? { en: mv.id, es: mv.id }, locale)
  }
  return {
    creature: {
      id: state.creature.id,
      name: loc(state.creature.name, locale),
      icon: state.creature.icon,
      rarity: state.creature.rarity,
      currentHealth: state.creatureHealth,
      maxHealth: state.creature.health,
      attack: creatureEffectiveAttack(state.creature, state.creatureStatuses),
      defense: state.creature.defense,
      magicResistance: state.creature.magicResistance,
      statuses: state.creatureStatuses,
    },
    player: {
      health: c.health,
      maxHealth: 100,
      resource: state.resource,
      resourceMax: state.resourceMax,
      resourceLabel: loc(kit.resourceLabel, locale),
      attack: playerEffectiveAttack(state),
      defense: playerEffectiveDefense(state),
      statuses: state.playerStatuses,
    },
    kit: {
      basicAttackLabel: loc(kit.basicAttack.label, locale),
      abilityMenuLabel: loc(kit.abilityMenuLabel, locale),
      abilities: kit.abilities.map((a) => ({
        id: a.id,
        label: loc(a.label, locale),
        icon: a.icon,
        cost: a.cost,
        unlocked: c.age >= (a.unlockAge ?? 0),
      })),
    },
    round: state.round,
    log: state.log,
    creatureMoveNames: moveNames,
    over: state.over,
    result: state.result,
  }
}

// Mirrors prepareInteractiveServe: init the persisted state once per event.
// The first call draws the creature from the run Rng; later calls (resume)
// are Rng-free and reuse the persisted state.
export function prepareCombatServe(
  ev: EventContent,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
): ServedCombatState {
  if (!c.pendingCombat || c.pendingCombat.eventId !== ev.id) {
    c.pendingCombat = startCombatState(ev, c, registry, rng)
  }
  return combatView(c.pendingCombat, c, locale, registry)
}
```

- [ ] **Step 4: Run to verify they pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/engine/combat
git commit -m "feat(combat): combat session init, serve view, and resume"
```

---

### Task 6: End-of-combat + engine integration

**Files:**
- Modify: `server/engine/engine.ts` (export `bumpCounter`, `defaultFaction`, `rollDeath`, `heroicOrPeaceful`; add the combat branch to `selectEvent`)
- Modify: `server/engine/helpers.ts` (import `prepareCombatServe`; add the combat branch to `serveEvent`)
- Modify: `server/engine/combat/index.ts` (append `endCombat`)
- Modify: `server/engine/combat/combat.test.ts` (append endCombat tests)
- Modify: `server/routes/game.ts` (the `/choose` guard — reject combat events like interactive minigames)
- Modify: `server/engine/engine.test.ts` (fix any selection tests broken by the new rng draw; add combat selection/serve tests)

**Interfaces:**
- Consumes: Task 4-5 exports; `rollDeath`/`heroicOrPeaceful`/`defaultFaction`/`bumpCounter` (now exported).
- Produces:
  - `export function endCombat(c: CharacterState, ev: EventContent, state: PendingCombatState, registry: ContentRegistry, rng: Rng): ResolveOutput` — rewards, counters, turn bookkeeping tail, death routing. Clears `c.pendingCombat`.
  - `selectEvent` picks combat encounters (`rng.bool(GAME_CONFIG.combatEncounterChance)` branch).
  - `serveEvent` serves `combat: { view }` for combat events.
  - `/choose` returns 400 `"combat_event"` for combat events.

- [ ] **Step 1: Write the failing tests** (append to `combat.test.ts`):
1. **win grants loot + counters** — after a fight resolves as won (drive creature to 0 via `resolveCombatRound`), `endCombat` grants gold within `[goldMin, goldMax]`, fame within `[fameMin, fameMax]`, bumps `battles_won`, `monsters_killed`, and `event_<id>`; an elite kill bumps `elite_kills`; a boss kill bumps `boss_kills`.
2. **item drops grant inventory** — a creature with `items: [{ itemId: "camp_cook", chance: 1 }]` grants the item (verify the shop id exists in `loadContent()`).
3. **flee grants no rewards** — `result === "fled"` bumps `flees_count`, grants no gold/fame, does NOT bump `event_<id>`.
4. **loss routes to death** — `result === "lost"` with `c.health === 0` ends with `ended: true` and `endingType: "heroic_death"` (character renowned via fame) or `"other_death"`; `c.status === "dead"`.
5. **turn advances once** — `endCombat` leaves `c.turn` incremented by exactly 1.
6. **pendingCombat cleared** — after `endCombat`, `c.pendingCombat === null`.

Also in `engine.test.ts`:
7. **selectEvent can serve a combat encounter** — seed a character in the adventurer arc whose `lastEventId` is null; call `selectEvent` across many seeds (or with `combatEncounterChance` content-controlled) and assert that when a combat event is returned it has `type === "combat"` and its creature pool is non-empty. (Property test — do not assert exact ids.)
8. **serveEvent initializes pendingCombat for combat events** — `serveEvent(combatEv, c, "en", registry, rng, false)` returns `served.combat.view` with `over === false` and sets `c.pendingCombat.eventId === combatEv.id`.

- [ ] **Step 2: Run to verify they fail** → FAIL.

- [ ] **Step 3: Implement `endCombat`** in `server/engine/combat/index.ts` (append):

```ts
// Import the engine's private-but-now-exported helpers. This creates the same
// deliberate cycle as minigames/pressConference.ts (engine -> helpers -> combat
// -> engine); safe because these are referenced inside function bodies only.
import {
  bumpCounter,
  defaultFaction,
  heroicOrPeaceful,
  rollDeath,
} from "../engine.js"
import { adjustReputation, ageUp, clearExpiredHunted, deductStamina, recomputeDerived, updateMarketValue, updateMomentum } from "../helpers.js"

export function endCombat(
  c: CharacterState,
  ev: EventContent,
  state: PendingCombatState,
  registry: ContentRegistry,
  rng: Rng,
): ResolveOutput {
  c.turn += 1
  const creature = state.creature
  const loot = creature.loot
  let narrative: string

  if (state.result === "won") {
    const gold = rng.int(loot.goldMin, loot.goldMax)
    const fame = rng.int(loot.fameMin, loot.fameMax)
    c.gold += gold
    c.fame += fame
    if (loot.reputationDelta) {
      adjustReputation(c, loot.reputationFaction ?? defaultFaction(c), loot.reputationDelta)
    }
    for (const drop of loot.items ?? []) {
      if (rng.bool(drop.chance)) {
        const existing = c.inventory.find((inv) => inv.itemId === drop.itemId)
        if (existing) existing.qty += 1
        else c.inventory.push({ itemId: drop.itemId, qty: 1, expiresAtTurn: null })
      }
    }
    bumpCounter(c, "battles_won")
    bumpCounter(c, "monsters_killed")
    if (creature.rarity === "elite") bumpCounter(c, "elite_kills")
    if (creature.rarity === "boss") bumpCounter(c, "boss_kills")
    bumpCounter(c, `event_${ev.id}`)
    narrative =
      c.locale === "en"
        ? `The ${loc(creature.name, c.locale)} falls. You stand over the spoils: ${gold} gold${fame > 0 ? `, ${fame} fame` : ""}.`
        : `El ${loc(creature.name, c.locale)} cae. Te quedas con el botín: ${gold} de oro${fame > 0 ? `, ${fame} de fama` : ""}.`
  } else if (state.result === "fled") {
    bumpCounter(c, "flees_count")
    narrative =
      c.locale === "en"
        ? "You break away and slip out of reach. The fight ends — no spoils, no glory, but you live."
        : "Te zafás y escapás. El combate termina — sin botín, sin gloria, pero vivís."
  } else {
    // lost — health already 0 (or the player was never able to continue).
    bumpCounter(c, "lost_encounters")
    narrative =
      c.locale === "en"
        ? `Darkness takes you. The ${loc(creature.name, c.locale)} is the last thing you see.`
        : `La oscuridad te envuelve. El ${loc(creature.name, c.locale)} es lo último que ves.`
  }

  // Turn bookkeeping tail — mirrors applyMinigameOutcome exactly.
  updateMomentum(c, 0)
  deductStamina(c)
  updateMarketValue(c)
  recomputeDerived(c)
  ageUp(c)
  clearExpiredHunted(c)

  let ended = false
  let endingType: EndingType | undefined
  if (state.result !== "won" && (rollDeath(c, 0, rng) || c.age >= GAME_CONFIG.maxAge)) {
    // rollDeath already returns true when c.health <= 0 (combat loss).
    c.status = "dead"
    ended = true
    endingType = heroicOrPeaceful(c, "death")
  }

  c.pendingCombat = null
  return {
    narrative,
    ended,
    endingType,
    chosenRarity: "uncommon",
    wonBattle: state.result === "won",
    completedQuest: false,
  }
}
```

Wait — the death branch above must NOT roll for wins/flees? `applyMinigameOutcome` runs `rollDeath` for every outcome (age risk applies even after a minigame win — the game's mortality model). But a combat WIN that triggers an age-risk death would feel wrong ("you win, then you die of old age?") — actually age risk at 55+ is exactly what the rest of the game does, and it's consistent (minigame wins can also death-roll). Keep `rollDeath` for all results (except that a won fight at 100 health with no injury risk only rolls age risk — same as minigames). The condition above excludes won fights from `rollDeath` — instead, mirror `applyMinigameOutcome` EXACTLY:

```ts
  let ended = false
  let endingType: EndingType | undefined
  if (rollDeath(c, 0, rng) || c.age >= GAME_CONFIG.maxAge) {
    c.status = "dead"
    ended = true
    endingType = heroicOrPeaceful(c, "death")
  }
```

(`rollDeath` with `pendingInjuryRisk = 0` returns true only on age risk or `health <= 0` — the latter is exactly a combat loss.) Use this version. `GAME_CONFIG` must be imported into the combat module.

- [ ] **Step 4: Export the four engine privates** — add `export` to `bumpCounter`, `defaultFaction`, `rollDeath`, `heroicOrPeaceful` in `server/engine/engine.ts`. (No other code changes — the exports are additive.)

- [ ] **Step 5: Add the combat branch to `selectEvent`** in `server/engine/engine.ts` — immediately after the destiny-card block, before the `wantMinigame` logic:

```ts
  // Combat encounters: a rare, separate rotation. The roll is its own draw so
  // daily runs stay deterministic; the pool only ever contains combat events.
  if (rng.bool(GAME_CONFIG.combatEncounterChance)) {
    const combatPool = registry.combats.filter((ev) => isEligible(ev, c))
    if (combatPool.length > 0) {
      const noRepeat = combatPool.filter((ev) => ev.id !== c.lastEventId)
      const picked = rng.weighted(noRepeat.length > 0 ? noRepeat : combatPool, (ev) => effectiveWeight(ev, c))
      c.lastEventId = picked.id
      return picked
    }
  }
```

- [ ] **Step 6: Add the combat branch to `serveEvent`** in `server/engine/helpers.ts` — import `prepareCombatServe` alongside `prepareInteractiveServe`, and insert BEFORE the interactive-minigame branch:

```ts
  // Combat encounters are multi-round fights served as a combat frame. The
  // initial view initializes the persisted state once (creature pick from the
  // run Rng); resume re-serves from the persisted state, Rng-free.
  if (ev.combat) {
    const view = prepareCombatServe(ev, c, locale, registry, rng)
    return {
      eventId: ev.id,
      narrative,
      choices: [],
      isRetirementOffer,
      flagLabel,
      hasTraps: false,
      combat: { view },
    }
  }
```

- [ ] **Step 7: Add `combat?: { view: ServedCombatState }` to `ServedEvent`** in `shared/types.ts` (near `interactive?`).

- [ ] **Step 8: Guard `/choose`** in `server/routes/game.ts` — next to the interactive guard:

```ts
    // Combat events resolve through /combat-move, never a single card-pick.
    if (event.combat) return res.status(400).json({ error: "combat_event" })
```

- [ ] **Step 9: Run the full server suite** — `pnpm exec vitest run --config vitest.server.config.ts`. Fix every existing test broken by the new `rng.bool(combatEncounterChance)` draw inside `selectEvent`: re-roll the failing fixed seeds (assertions should be property-based where possible — see Step 1 test 7). All pass.

- [ ] **Step 10: Commit**

```bash
git add server shared
git commit -m "feat(combat): end-of-combat rewards and engine integration"
```

---

### Task 7: POST /api/game/combat-move route

**Files:**
- Modify: `server/routes/game.ts` (add the route)
- Modify: `server/routes/game.test.ts` (route tests)
- Modify: `src/api.ts` (client types + `combatMove` — see Task 8's interfaces for the shared shape; this task only needs the route to respond, so add the `CombatMoveResponse` interface + `combatMove` method here and use it in Task 8 wiring)

**Interfaces:**
- Consumes: `resolveCombatRound`, `combatView`, `endCombat`, `prepareCombatServe`-produced state; `finishResolvedTurn` (already in game.ts).
- Produces: `POST /api/game/combat-move { runId, move: CombatMove }` →
  - `{ status: "playing", combat: { game: "combat", view: ServedCombatState } }` on non-final moves (persists run).
  - `{ status: "finished", combat: { game: "combat", view }, loot: { gold, fame, items } | null, ...ChooseResponse fields }` on the final move (via `finishResolvedTurn`).
  - Errors: `404 not_found`, `409 run_finished`, `400 no_pending_combat`, `400 combat_mismatch`, `400 invalid_move`, `400 combat_already_finished`.

- [ ] **Step 1: Write the failing tests** in `server/routes/game.test.ts` (study the existing `postMinigameMove` helper at the top of the file and mirror it with `postCombatMove(run, combatEvent, move)`; build a synthetic combat event via the real registry — `const wolf = reg.combats.find((e) => e.id === "road_ambush")!`):
1. **full fight to victory** — set `c.pendingCombat = startCombatState(...)` against `rat_swarm` (18 hp) with a warrior (`playerBaseAttack` ~13): loop `{ kind: "attack" }` moves until `status: "finished"`; assert the response has `ended: false`, `event` present, `character.counters["monsters_killed"] === 1`, and `loot.gold > 0`.
2. **flee** — force success by granting the `smoke` status on `c.pendingCombat.playerStatuses`; one `{ kind: "flee" }` move → finished, `result === "fled"`, `counters["flees_count"] === 1`, and the encounter is NOT completed (`event_road_ambush` undefined).
3. **death ending** — a `canKillPlayer: true` creature (e.g. `werewolf`), let the fight run until `c.health === 0` (drive with attack-only moves); final response has `ended: true` and an `endingType`; `run.finished === true`.
4. **guards** — `/combat-move` with no `pendingCombat` → `no_pending_combat`; with a mismatched `eventId` → `combat_mismatch`; an unknown ability id → `invalid_move`; an ability with insufficient resource → `invalid_move`; a move after `over` → `combat_already_finished`; `/choose` on a combat event → `combat_event`.

- [ ] **Step 2: Run to verify they fail** → FAIL (route missing).

- [ ] **Step 3: Implement the route** in `server/routes/game.ts` (mirror `/minigame-move` closely):

```ts
gameRouter.post("/combat-move", async (req: Request, res: Response) => {
  try {
    const run = await loadOwnedRun(req)
    if (!run) return res.status(404).json({ error: "not_found" })
    if (run.finished) return res.status(409).json({ error: "run_finished" })
    const ev = run.pendingEvent
    const c = run.character
    if (!ev || !ev.combat || !c.pendingCombat) {
      return res.status(400).json({ error: "no_pending_combat" })
    }
    if (c.pendingCombat.eventId !== ev.id) {
      return res.status(400).json({ error: "combat_mismatch" })
    }
    const move = req.body?.move as CombatMove
    if (!move || typeof move !== "object" || !["attack", "ability", "defend", "flee"].includes(move.kind)) {
      return res.status(400).json({ error: "invalid_move" })
    }
    const rng = new Rng(run.rngState)
    const rivalRng = new Rng(run.rivalRngState)
    const state = c.pendingCombat
    const locale = c.locale
    if (state.over) return res.status(400).json({ error: "combat_already_finished" })

    let over: boolean
    try {
      over = resolveCombatRound(state, c, registry.classKits[c.class], move, rng).over
    } catch (err) {
      const msg = (err as Error).message
      if (
        msg.startsWith("unknown ability") ||
        msg.startsWith("locked ability") ||
        msg.startsWith("insufficient resource")
      ) {
        return res.status(400).json({ error: "invalid_move" })
      }
      throw err
    }

    if (!over) {
      run.rngState = rng.getState()
      await saveRun(run)
      return res.json({
        status: "playing",
        combat: { game: "combat", view: combatView(state, c, locale, registry) },
        feedback: null,
      })
    }

    // Fight over: apply rewards/death and serve the next beat.
    const finalView = combatView(state, c, locale, registry)
    const outcome = endCombat(c, ev, state, registry, rng)
    const payload = await finishResolvedTurn(run, outcome, rng, rivalRng)
    // Loot breakdown for the result screen — endCombat returns the exact
    // amounts granted (CombatResolveOutput.rewards), null when nothing won.
    const loot = outcome.rewards ?? null
    return res.json({
      status: "finished",
      combat: { game: "combat", view: finalView },
      loot,
      ...payload,
    })
  } catch (err) {
    const msg = (err as Error).message
    console.log("[v0] /combat-move error", msg)
    return res.status(500).json({ error: "server_error", detail: msg })
  }
})
```

> `loot` shape: `{ gold: number; fame: number; items: { itemId: string; qty: number }[] }`. The route reads it from `outcome.rewards` — see Step 4.

- [ ] **Step 4: Add the rewards breakdown types + adjust `endCombat`** — in `shared/types.ts` add `export interface CombatRewards { gold: number; fame: number; items: { itemId: string; qty: number }[] }`. In the combat module add `export interface CombatResolveOutput extends ResolveOutput { rewards?: CombatRewards }` and change `endCombat`'s return type to `CombatResolveOutput`: collect `gold`/`fame` granted (and any granted item ids) into `rewards` on a win; `undefined` on flee/loss. `finishResolvedTurn` accepts the shape because `ResolveOutput` fields are all present.

- [ ] **Step 5: Run to verify they pass** — `pnpm exec vitest run --config vitest.server.config.ts server/routes/game.test.ts` → PASS; then the full server suite → PASS.

- [ ] **Step 6: Commit**

```bash
git add server shared
git commit -m "feat(combat): /combat-move route"
```

---

### Task 8: Client API + App wiring

**Files:**
- Modify: `src/api.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `CombatMove`, `ServedCombatState` from Task 1; the route contract from Task 7.
- Produces:
  - `CombatMoveResponse` in `src/api.ts` (mirrors `MinigameMoveResponse`):
    ```ts
    export interface CombatMoveResponse {
      status: "playing" | "finished"
      combat?: { game: "combat"; view: ServedCombatState }
      loot?: { gold: number; fame: number; items: { itemId: string; qty: number }[] } | null
      feedback?: string | null
      character?: CharacterState
      narrative?: string
      newAchievements?: AchievementContent[]
      ended?: boolean
      endingType?: EndingType
      epilogue?: string
      score?: number
      event?: ServedEvent
      richEpilogueData?: RichEpilogueData
    }
    ```
  - `api.combatMove: (input: { runId: string; move: CombatMove }) => jfetch<CombatMoveResponse>("/api/game/combat-move", { method: "POST", body: JSON.stringify(input) })`
  - `ServedEvent.combat` already in the shared types (Task 6 Step 7) — re-export surfaces through `@shared/types`.
  - In `App.tsx`: `pendingCombatResult` state, `combatMove(move)` handler (mirror `minigameMove`), `applyCombatResult(res)` (mirror `applyMinigameResult`), passed to `GameScreen` as `onCombatMove` / `onCombatFinished` / `combatFinishedResult`.

- [ ] **Step 1: Write the failing tests** — component-level tests for the wiring are impractical at the App level; instead the contract is verified by Task 9's component tests plus a typecheck. This task's "test" is: `pnpm exec tsc --noEmit` clean, and (after Task 9) a browser smoke run.

- [ ] **Step 2: Implement `src/api.ts`** — add the imports (`CombatMove`, `ServedCombatState`), the `CombatMoveResponse` interface, and the `combatMove` method.

- [ ] **Step 3: Implement `src/App.tsx`** — copy the `minigameMove`/`applyMinigameResult`/`pendingMinigameResult` pattern exactly:
  - state: `const [pendingCombatResult, setPendingCombatResult] = useState<CombatMoveResponse | null>(null)`
  - `async function combatMove(move: CombatMove): Promise<CombatMoveResponse>` — same recovery logic as `minigameMove`, but calling `api.combatMove({ runId, move })`; on `status === "finished"` set `setPendingCombatResult(res)`.
  - `function applyCombatResult(res: CombatMoveResponse)` — identical to `applyMinigameResult` (character, toasts, ending vs next-event handling).
  - Pass to `GameScreen`: `onCombatMove={combatMove}`, `onCombatFinished={() => { if (pendingCombatResult) applyCombatResult(pendingCombatResult) }}`, `combatFinishedResult={pendingCombatResult}`.

- [ ] **Step 4: Verify** — `pnpm exec tsc --noEmit` → clean. (GameScreen props are extended in Task 9; if typecheck fails because GameScreen doesn't accept the new props yet, note that Task 9 adds them — run the typecheck again after Task 9.)

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/App.tsx
git commit -m "feat(combat): client api and app wiring"
```

---

### Task 9: Client combat UI + i18n strings

**Files:**
- Create: `src/components/combat/CombatFrame.tsx`
- Create: `src/components/combat/CombatGame.tsx`
- Create: `src/components/combat/CombatGame.test.tsx`
- Modify: `src/components/GameScreen.tsx` (render the combat frame; extend props)
- Modify: `src/i18n/strings.ts` (en + es combat sections)
- Test: `pnpm i18n:check` + the component test

**Interfaces:**
- Consumes: `ServedCombatState`, `CombatMove`, `CombatMoveResponse`; GameScreen's `onMinigameMove`-style handlers.
- Produces:
  - `CombatFrame({ locale, event, onMove, onFinished, finishedResult })` — the container (mirrors `MinigameFrame`'s finished-result pattern: when `finishedResult` is set, render the result card + Continue; otherwise render the live `CombatGame`).
  - `CombatGame({ locale, view, busy, onAction })` — the live fight UI.
  - GameScreen renders `<CombatFrame>` when `event.combat` is present (before the `event.interactive` branch).

- [ ] **Step 1: Write the failing component test** — `src/components/combat/CombatGame.test.tsx` (study `src/components/minigames/CircusWheelGame.test.ts` for the harness — it renders with a theme provider and mocks i18n):

```tsx
// Minimum viable smoke test: the menu renders the class kit's dynamic labels
// (never the literal word "Magic" for non-wizards), costs show, and an action
// click fires onAction with the right CombatMove.
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ThemeProvider } from "styled-components"
import { theme } from "../../theme"
import type { ServedCombatState } from "@shared/types"
import { CombatGame } from "./CombatGame"

function makeView(overrides?: Partial<ServedCombatState>): ServedCombatState {
  return {
    creature: {
      id: "rat_swarm", name: "Rat Swarm", icon: "rat", rarity: "common",
      currentHealth: 18, maxHealth: 18, attack: 4, defense: 0, magicResistance: 0, statuses: [],
    },
    player: {
      health: 100, maxHealth: 100, resource: 20, resourceMax: 20, resourceLabel: "Focus",
      attack: 13, defense: 2, statuses: [],
    },
    kit: {
      basicAttackLabel: "Strike",
      abilityMenuLabel: "Shout",
      abilities: [
        { id: "rally_cry", label: "Rally Cry", icon: "flag", cost: 6, unlocked: true },
      ],
    },
    round: 1,
    log: [],
    creatureMoveNames: {},
    over: false,
    result: null,
    ...overrides,
  }
}

describe("CombatGame", () => {
  it("renders the class kit's ability menu label, not a hardcoded Magic", () => {
    render(<ThemeProvider theme={theme}><CombatGame locale="en" view={makeView()} busy={false} onAction={() => {}} /></ThemeProvider>)
    expect(screen.getByText("Shout")).toBeTruthy()
    expect(screen.queryByText(/magic/i)).toBeNull()
  })

  it("fires onAction with an ability move and shows costs", () => {
    const onAction = vi.fn()
    render(<ThemeProvider theme={theme}><CombatGame locale="en" view={makeView()} busy={false} onAction={onAction} /></ThemeProvider>)
    expect(screen.getByText("Rally Cry")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /rally cry/i }))
    expect(onAction).toHaveBeenCalledWith({ kind: "ability", abilityId: "rally_cry" })
  })

  it("renders creature health and player bars", () => {
    render(<ThemeProvider theme={theme}><CombatGame locale="en" view={makeView()} busy={false} onAction={() => {}} /></ThemeProvider>)
    expect(screen.getByText("Rat Swarm")).toBeTruthy()
    expect(screen.getByText("18/18")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Add the i18n strings** to `src/i18n/strings.ts` — insert a `combat` block in BOTH the en and es sections (each key must exist in both; `pnpm i18n:check` covers content files, but strings.ts is type-checked by the `makeT` typing — mirror the existing minigame block style). Required keys (with en values; author es equivalents):

```ts
combatDefend: "Defend",
combatFlee: "Flee",
combatRound: "Round",
combatVictory: "Victory",
combatDefeat: "Defeat",
combatFled: "You fled",
combatSpoils: "Spoils",
combatLog: "The fight",
combatYouStrike: "You strike {creature} for {dmg}",
combatYouCrit: "Critical hit for {dmg}!",
combatYouUse: "You use {ability}",
combatYouHeal: "You recover {n} health",
combatYouSteal: "You pilfer {n} gold",
combatYouDefend: "You brace for the blow",
combatYouFlee: "You try to flee",
combatYouFled: "You escape!",
combatCreatureUses: "{creature} uses {move} for {dmg}",
combatCreatureHeals: "{creature} recovers {n} health",
combatCreatureFled: "{creature} flees!",
combatCreatureSkipped: "{creature} is stunned and cannot act",
combatPoisonTick: "{creature} takes {n} from poison",
combatResultWin: "You defeated {creature}!",
combatResultLose: "You were defeated by {creature}",
combatResultFled: "You fled from {creature}",
combatStatus_poisoned: "Poisoned",
combatStatus_slowed: "Slowed",
combatStatus_enraged: "Enraged",
combatStatus_stunned: "Stunned",
combatStatus_guarding: "Guarding",
combatStatus_attack_up: "Attack Up",
combatStatus_attack_down: "Attack Down",
combatStatus_defense_up: "Defense Up",
combatStatus_smoke: "Smoke",
combatLocked: "Locked",
combatResource: "Resource",
```

- [ ] **Step 4: Implement `CombatGame.tsx`** — presentational, driven entirely by the served view:
  - Creature card: `view.creature.name`, rarity chip (color from rarity — define a local RARITY color map in the component or reuse `theme.colors.rarity`), icon via `AchIcon`, HP bar (`currentHealth/maxHealth`), status chips (localize via `combatStatus_<id>`).
  - Player card: HP bar (`player.health`), resource bar (`player.resource/resourceMax` labeled `resourceLabel`), attack/defense stats, status chips.
  - Round log: `view.log` newest-first, each entry rendered with the i18n line builders above (`view.creatureMoveNames[moveId]`, kit ability labels from `view.kit.abilities`). Only include non-null fields.
  - Action menu: Basic Attack button (label `view.kit.basicAttackLabel`), a "Defend" button, a "Flee" button, and the ability section headed by `view.kit.abilityMenuLabel` — one button per ability (label + cost, disabled when `!unlocked || resource < cost || busy`). All buttons call `onAction(move)`.
  - `busy` disables everything.

- [ ] **Step 5: Implement `CombatFrame.tsx`** — mirrors `MinigameFrame`:
  - Live state: `const [view, setView] = useState<ServedCombatState>(event.combat!.view)`.
  - `handle(move)` → `onMove(move)`; on `status === "playing"` update `view`; on `status === "finished"` the final view rides in the finished payload.
  - `finishedResult` branch: victory/defeat/fled result card (tone-colored, mirroring `MinigameFrame`'s `ResultCard`), reward breakdown from `finishedResult.loot` (gold/fame/items), the final combat view (bars at final values), the outcome `narrative`, and a Continue button calling `onFinished`.
  - Import `CombatGame` and render it in both branches.

- [ ] **Step 6: Wire `GameScreen.tsx`** — extend Props with `onCombatMove`, `onCombatFinished`, `combatFinishedResult` (types from `src/api.ts`), and render:

```tsx
{event.combat ? (
  <CombatFrame
    key={event.eventId}
    locale={locale}
    event={event}
    onMove={onCombatMove}
    onFinished={onCombatFinished}
    finishedResult={combatFinishedResult}
  />
) : event.interactive ? (
  <MinigameFrame ... />
) : ( <ChoiceGrid ...> )}
```

- [ ] **Step 7: Run to verify** — `pnpm exec vitest run src/components/combat/CombatGame.test.tsx` → PASS; `pnpm i18n:check` → PASS; `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(combat): combat UI and i18n strings"
```

---

### Task 10: Achievements + epilogue distinction

**Files:**
- Modify: `content/achievements.json` (add combat achievements)
- Modify: `server/engine/epilogue.ts` (add a `monsters_killed` distinction)
- Modify: `server/engine/engine.test.ts` (achievement evaluation tests)

**Interfaces:**
- Consumes: counters bumped by `endCombat` (`monsters_killed`, `elite_kills`, `boss_kills`).
- Produces: new `AchievementContent` entries; a `DistinctionEntry` in the rich epilogue.

- [ ] **Step 1: Write the failing tests** — in `engine.test.ts` (the existing counter-backed achievement tests around line 1184 are the model):
1. **first_kill** unlocks when `counters.monsters_killed >= 1`.
2. **giant_killer** unlocks when `counters.elite_kills >= 1`.
3. **boss_slayer** unlocks when `counters.boss_kills >= 1`.
4. **epilogue distinction** — `generateRichEpilogueData` for a character with `counters.monsters_killed: 12` includes a distinction with `count >= 12` (id `monsters_killed`).

- [ ] **Step 2: Run to verify they fail** → FAIL (achievements missing).

- [ ] **Step 3: Add the achievements** to `content/achievements.json` (append inside the `achievements` array):

```json
{
  "id": "first_kill",
  "icon": "skull",
  "rarity": "common",
  "condition": { "type": "counter_gte", "key": "monsters_killed", "value": 1 },
  "name": { "en": "First Kill", "es": "Primera Muerte" },
  "description": { "en": "Slay your first monster.", "es": "Abate tu primer monstruo." }
},
{
  "id": "giant_killer",
  "icon": "mountain",
  "rarity": "rare",
  "condition": { "type": "counter_gte", "key": "elite_kills", "value": 1 },
  "name": { "en": "Giant Killer", "es": "Matagigantes" },
  "description": { "en": "Defeat an elite monster.", "es": "Vence a un monstruo de élite." }
},
{
  "id": "boss_slayer",
  "icon": "dragon",
  "rarity": "epic",
  "condition": { "type": "counter_gte", "key": "boss_kills", "value": 1 },
  "name": { "en": "Dragon's Bane", "es": "Pesadilla de Dragones" },
  "description": { "en": "Slay a boss-tier monster.", "es": "Abate un monstruo de rango jefe." }
}
```

(The existing `monster_slayer` — `monsters_killed >= 5` — stays; the ladder is now First Kill → Monster Slayer → [future Beast Slayer tiers].)

- [ ] **Step 4: Add the epilogue distinction** in `server/engine/epilogue.ts` — inside `generateDistinctions`' counter list (the model is the `rare_cards` entry around line 175):

```ts
monsters_killed: { en: "Monsters Slain", es: "Monstruos Abatidos" },
```

- [ ] **Step 5: Run to verify they pass** — achievement tests PASS; `pnpm i18n:check` PASS (achievements.json locale maps complete); full server suite PASS.

- [ ] **Step 6: Commit**

```bash
git add content/achievements.json server/engine/epilogue.ts server/engine/engine.test.ts
git commit -m "feat(combat): combat achievements and epilogue distinction"
```

---

## Self-review

**Spec coverage (companion design doc):** §3 loop → Tasks 4-7; §4 class kits → Tasks 1-3, 9; §5 creature model + rarity → Tasks 2-3; §6 formulas → Task 4; §7 flee → Tasks 4, 7; §8 rewards → Tasks 6, 10; §9 loss/death → Task 6; §10 schema → replaced by inline `pendingCombat` (Task 1, user-confirmed); §11 integration points → Tasks 3 (content bank), 4-7 (RNG/determinism), 6 (arcs), 10 (achievements), 6 (counters). Open questions → resolved: refill-per-encounter (Task 5), Defend included (Task 9), Item deferred, cadence knob `combatEncounterChance`.

**Placeholder scan:** no TBDs; every task has concrete code or an exact data table. Task 2's narrative text is authored per entry by the implementer with the given example.

**Type consistency:** `ServedCombatState`/`PendingCombatState`/`CombatMove` are defined once (Task 1) and reused everywhere. `CombatResolveOutput` (Task 7) extends `ResolveOutput` without renaming it. `endCombat` returns rewards for the route's loot breakdown (Task 7 Step 4). `EventContent.combat` added in Task 1; `ServedEvent.combat` added in Task 6 Step 7 (used by the client in Task 8/9).

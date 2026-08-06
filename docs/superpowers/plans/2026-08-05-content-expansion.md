# Content Expansion (Double Volume) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double the authored content volume in every expandable file under `content/` (events, minigames, slots, archetypes, shop) — excluding `achievements.json` — while deepening existing structures only (no new classes, factions, or regions), then update the improvement-plan's count lines so docs stay accurate. (Slots were pre-expanded to 305 by an earlier commit on this branch and are topped up to 327, not re-doubled.)

**Architecture:** Pure content-authoring plan. No engine, route, type, or client changes — the game engine, registry validation, i18n parity check, and deterministic RNG all already support the target structures. Each task edits exactly one content JSON file (arrays keep their existing element order; new entries are appended), then validates through the same gates the engine enforces at startup: `server/content/registry.ts` throws on malformed entries, `scripts/i18n-parity.ts` fails on incomplete locale maps, and `scripts/smoke.ts` proves the whole graph loads and plays deterministically. Balance values stay inside the ranges already established by existing authored content (listed in Global Constraints). The final task refreshes the counts in `docs/improvement-plan.md`.

**Tech Stack:** TypeScript (tsx), JSON content registry (bilingual en/es), Vitest (server suite), Prettier (JSON formatting), existing `scripts/smoke.ts` + `scripts/i18n-parity.ts` validators.

## Global Constraints

- **Do NOT touch:** `content/achievements.json` (explicitly excluded by the user), `content/classes.json`, `content/factions.json`, `content/regions.json` (per the "deepen existing only" decision — no new classes/factions/regions). If a task appears to need a new class/faction/region, re-read the constraint and adapt the entry to an existing one.
- **Slots reconciliation:** `content/slots.json` is already at 305 entries (prior commit `c78a819` on this branch). Task 2 ONLY tops up `creatureName` and `regionVariant`; the other five pools stay exactly as committed. Do not re-run a full slots expansion.
- **Locale completeness:** every `LocaleMap` needs non-empty `en` AND `es` strings, or `pnpm i18n:check` fails. Spanish register is informal "vos" (Rioplatense), matching all existing content; default to masculine inflection (genderize inflects feminine at render time). Never leave a `{poolName}` placeholder, `«quote»`, or name inside a locale string untranslated.
- **Registry validation (server/content/registry.ts), verbatim:** events must have `choices.length > 0`; if any choice has `requiresStat`, at least one choice must NOT (`all choices stat-gated` throws — soft-locks the run); minigames need `resolution` AND `outcomes`; non-interactive minigames need `cards.length > 0`; interactive minigames need `resolution.game` (`tictactoe` | `rps` | `memotest`) and `primaryStat`; every one of the four outcome tiers (`critical`, `success`, `partial`, `fail`) needs a `narrative` LocaleMap.
- **Unique IDs:** event/minigame/archetype/shop IDs are globally unique across the whole content graph (`eventsById` is a Map — a duplicate silently overwrites). Never reuse an id from an existing file; the plan's `New ids` lists are the allowed set.
- **Reserved IDs:** never author `__retirement_offer__`, `__season_summary__`, `__forced_recovery__` — the engine synthesizes these.
- **Placeholders:** events may interpolate `{poolName}` (bare pool name) or `{slot:poolName}` — only for pools that exist in `content/slots.json` (npcRole, npcName, locationName, worldLocation, creatureName, guildName, regionVariant). `{rivalName}` is reserved for the run's rival. Do not invent new pools.
- **Balance ranges (copy from existing content, never exceed):** `goldDelta` −100..400 · `fameDelta` −3..8 · stat deltas +1..8 · `reputationDelta` −4..4 · `injuryRiskDelta` 0.05..0.3 · `liabilityDelta` 1..15 · `staminaDelta` −15..50 · `healthDelta` −20..10 · `baseWinChance` 0.33..0.45 · `statInfluence` values 0.004..0.015 · `cardModifiers.winChanceDelta` 0.05..0.1, `critChanceDelta` 0.03..0.05 · `weight` 2..12.
- **Counters:** new minigame counters follow `<activity>_wins` (+ `countersReset: ["<activity>_streak"]` on partial/fail), exactly as existing files do. Reuse established counters (`battles_won`, `quests_completed`, `urns_opened`, `board_games_won`, `goblin_games_won`, `relic_memotest_wins`) when the fiction supports it. Do not invent counters whose names collide with achievement condition keys unless the fiction genuinely matches.
- **Capstones (election/debate):** every entry needs `isCapstone: true`, `capstoneKind`, and each outcome tier needs `verdict` (exact formats `GREAT +3` / `GOOD +1` / `MIXED 0` / `BAD −4`) plus matching `gradeDelta` (3 / 1 / 0 / −4).
- **Interactive minigames:** need `opponent` (LocaleMap), `primaryStat`, and `resolution.game` (`rps` with `bestOf`, `tictactoe`, or `memotest`), `statInfluence`, `rivalSkill` 0.4..0.65, and all four outcome tiers.
- **Shop:** new items must use existing `ShopEffectType`s (`injuryRiskModifier`, `fatigueModifier`, `momentumRecoveryModifier`, `ageDeclineDelay`, `offerQualityModifier`) or `effect: null`; no new effect types. Do NOT add `achievementTrigger` (achievements are out of scope — a dangling trigger breaks `/buy`). Consumables carry `duration` (1..2); luxury items carry `requiresArc`.
- **Formatting:** 2-space indented JSON, no trailing commas, keys double-quoted. Run `pnpm exec prettier --write <edited file>` before committing. Do not reformat other files.
- **Determinism:** content only declares `weight`s — never randomness. The engine's single seeded `Rng` picks entries; nothing here changes that.
- Every task ends with: i18n check → registry load check → count check → commit. One commit per task.

---

### Task 1: Validation harness + baseline counts

**Files:**
- (None created) — uses existing tooling: `scripts/i18n-parity.ts`, `server/content/registry.ts`, `scripts/smoke.ts`, `node` one-liners.

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: the exact verification commands every later task reuses, and the baseline counts each task must beat.

- [ ] **Step 1: Record the baseline**

Run:

```bash
node -e "
const fs=require('fs');
const evs={}; for (const f of fs.readdirSync('content/events')) evs[f]=JSON.parse(fs.readFileSync('content/events/'+f,'utf8')).length;
console.log('events:', evs, 'total', Object.values(evs).reduce((a,b)=>a+b,0));
const mgs={}; for (const f of fs.readdirSync('content/minigames')) mgs[f]=JSON.parse(fs.readFileSync('content/minigames/'+f,'utf8')).length;
console.log('minigames:', mgs, 'total', Object.values(mgs).reduce((a,b)=>a+b,0));
const s=require('./content/slots.json'); for (const [k,v] of Object.entries(s)) console.log('slot', k, v.length);
const a=require('./content/archetypes.json'); for (const [k,v] of Object.entries(a)) console.log('archetypes', k, v.length);
const sh=require('./content/shop.json'); for (const c of ['retinue','consumable','luxury']) console.log('shop', c, sh.filter(i=>i.category===c).length);
"
```

> **Reconciliation note (execution-time):** a parallel plan already committed a slots expansion on this branch (`c78a819 feat(content): expand slot pools`) — `content/slots.json` currently holds **305** entries (npcRole 75, npcName 79, locationName 59, worldLocation 23, creatureName 44, guildName 19, regionVariant 6). Per user decision we KEEP that work; Task 2 below becomes a small top-up to the doubled target. All other files are at their original baselines.

Expected (baseline): events total **68** (tavern 5, road 6, dungeon 5, court 6, rest 8, clans 9, foreign 5, personality 5, regions 6, destiny 3, world 10); minigames total **36** (activities 16, duels 9, elections 6, debates 1, goblin_games 2, urns 1, relics 1); slots **305** (already expanded by prior commit — do not reset); archetypes 5 per class; shop retinue 5 / consumable 5 / luxury 6.

- [ ] **Step 2: Verify the two content validators pass on the untouched tree**

Run:

```bash
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; const r = loadContent(); console.log('registry OK:', r.events.length, 'events,', r.minigames.length, 'minigames');"
```

Expected: `[i18n] all locale maps complete for: en, es` and `registry OK: 68 events, 36 minigames`. If either fails, STOP — the tree is dirty; fix before proceeding.

- [ ] **Step 3: No commit needed (no changes).**

---

### Task 2: Expand `content/slots.json` (+163 entries across all 7 pools)

**Files:**
- Modify: `content/slots.json`

**Interfaces:**
- Consumes: the `SlotPools` shape — `Record<poolName, LocaleMap[]>`; every entry is a `{en, es}` pair; `LOCALES = ["en", "es"]`.
- Produces: new entries in every existing pool (no new pools). Later event tasks may interpolate any of these via `{poolName}` / `{slot:poolName}`.

- [ ] **Step 1: Top up the two pools below their doubled targets**

> **Reconciliation:** the prior commit already doubled npcRole (75), npcName (79), locationName (59), worldLocation (23), and guildName (19) — those pools are DONE, do not touch them. Only `creatureName` (44) and `regionVariant` (6) are below target. Append ONLY these two lists.

Follow the existing style exactly: English flavor noun-phrases; Spanish with the same meaning, using the informal "vos" register and masculine-default inflection. **Do not duplicate any existing string.** Append to the end of each pool's array (before the closing `]`), keeping 2-space indentation and a trailing comma on the previous last element:

`npcRole` (+38):

```json
{ "en": "wandering scholar", "es": "erudito errante" },
{ "en": "night watchman", "es": "sereno de la noche" },
{ "en": "sea captain", "es": "capitán de barco" },
{ "en": "master of the hunt", "es": "maestro de caza" },
{ "en": "smuggler", "es": "contrabandista" },
{ "en": "courtesan", "es": "cortesana" },
{ "en": "archivist", "es": "archivero" },
{ "en": "flagellant", "es": "flagelante" },
{ "en": "tinker", "es": "calderero" },
{ "en": "beekeeper", "es": "apicultor" },
{ "en": "dragon scholar", "es": "estudioso de dragones" },
{ "en": "gravedigger", "es": "enterrador" },
{ "en": "harbormaster", "es": "maestre de puerto" },
{ "en": "wandering minstrel", "es": "juglar errante" },
{ "en": "tax collector", "es": "cobrador de impuestos" },
{ "en": "holy pilgrim", "es": "peregrino santo" },
{ "en": "crown messenger", "es": "mensajero de la corona" },
{ "en": "weaponsmith", "es": "armero" },
{ "en": "herbalist", "es": "herborista" },
{ "en": "falconer", "es": "cetrero" },
{ "en": "retired adventurer", "es": "aventurero retirado" },
{ "en": "runaway princess", "es": "princesa fugitiva" },
{ "en": "caged beast-tamer", "es": "domador de bestias" },
{ "en": "kettle-thief", "es": "ladrón de calderos" },
{ "en": "village elder", "es": "anciano de la aldea" },
{ "en": "mapmaker", "es": "cartógrafo" },
{ "en": "executioner", "es": "verdugo" },
{ "en": "lamplighter", "es": "encendedor de faroles" },
{ "en": "half-mad prophet", "es": "profeta medio loco" },
{ "en": "knight errant", "es": "caballero andante" },
{ "en": "gladiator", "es": "gladiador" },
{ "en": "river ferryman", "es": "barquero del río" },
{ "en": "stargazer", "es": "observador de estrellas" },
{ "en": "ancient druid", "es": "druida anciano" },
{ "en": "wanted bandit", "es": "bandido buscado" },
{ "en": "ghost of a soldier", "es": "fantasma de un soldado" },
{ "en": "orphan pickpocket", "es": "carterista huérfano" },
{ "en": "mysterious benefactor", "es": "benefactor misterioso" }
```

`npcName` (+40):

```json
{ "en": "Aldous", "es": "Aldous" },
{ "en": "Bria", "es": "Bria" },
{ "en": "Caspian", "es": "Caspian" },
{ "en": "Dagny", "es": "Dagny" },
{ "en": "Emeric", "es": "Emeric" },
{ "en": "Fia", "es": "Fia" },
{ "en": "Goran", "es": "Goran" },
{ "en": "Helga", "es": "Helga" },
{ "en": "Ianto", "es": "Ianto" },
{ "en": "Jora", "es": "Jora" },
{ "en": "Kestrel", "es": "Kestrel" },
{ "en": "Liora", "es": "Liora" },
{ "en": "Marius", "es": "Marius" },
{ "en": "Nessa", "es": "Nessa" },
{ "en": "Oswin", "es": "Oswin" },
{ "en": "Piper", "es": "Piper" },
{ "en": "Quill", "es": "Quill" },
{ "en": "Rosalind", "es": "Rosalinda" },
{ "en": "Soren", "es": "Soren" },
{ "en": "Tamsin", "es": "Tamsin" },
{ "en": "Ursa", "es": "Ursa" },
{ "en": "Vance", "es": "Vance" },
{ "en": "Wren", "es": "Wren" },
{ "en": "Xander", "es": "Xander" },
{ "en": "Yara", "es": "Yara" },
{ "en": "Zeb", "es": "Zeb" },
{ "en": "Arden", "es": "Arden" },
{ "en": "Bramwell", "es": "Bramwell" },
{ "en": "Cerise", "es": "Cerise" },
{ "en": "Drake", "es": "Drake" },
{ "en": "Edda", "es": "Edda" },
{ "en": "Finnian", "es": "Finnian" },
{ "en": "Giselle", "es": "Gisela" },
{ "en": "Hart", "es": "Hart" },
{ "en": "Isabeau", "es": "Isabel" },
{ "en": "Juniper", "es": "Juniper" },
{ "en": "Kade", "es": "Kade" },
{ "en": "Lavinia", "es": "Lavinia" },
{ "en": "Magnus", "es": "Magnus" },
{ "en": "Norah", "es": "Nora" }
```

`locationName` (+30):

```json
{ "en": "the crooked bell tower", "es": "el campanario torcido" },
{ "en": "the flooded wine cellar", "es": "la bodega inundada" },
{ "en": "the abandoned mill", "es": "el molino abandonado" },
{ "en": "the contested border post", "es": "el puesto fronterizo disputado" },
{ "en": "the salt flats", "es": "las salinas" },
{ "en": "the hollow oak", "es": "el roble hueco" },
{ "en": "the ivory amphitheater", "es": "el anfiteatro de marfil" },
{ "en": "the plague quarantine", "es": "la cuarentena de la peste" },
{ "en": "the frozen marsh", "es": "el pantano congelado" },
{ "en": "the grand bazaar", "es": "el gran bazar" },
{ "en": "the thieves' court", "es": "el tribunal de los ladrones" },
{ "en": "the sunken garden", "es": "el jardín hundido" },
{ "en": "the bellfounder's yard", "es": "el patio del fundidor de campanas" },
{ "en": "the half-collapsed mine", "es": "la mina medio derrumbada" },
{ "en": "the lighthouse stairs", "es": "las escaleras del faro" },
{ "en": "the executioner's square", "es": "la plaza del verdugo" },
{ "en": "the caravan circle", "es": "el círculo de las caravanas" },
{ "en": "the glassblower's workshop", "es": "el taller del soplador de vidrio" },
{ "en": "the dragon bone market", "es": "el mercado de huesos de dragón" },
{ "en": "the tide caves", "es": "las cuevas de la marea" },
{ "en": "the burned chapel", "es": "la capilla quemada" },
{ "en": "the pigeon loft", "es": "el palomar" },
{ "en": "the dueling grounds", "es": "el campo de duelo" },
{ "en": "the tomb of a forgotten king", "es": "la tumba de un rey olvidado" },
{ "en": "the fairgrounds", "es": "los terrenos de la feria" },
{ "en": "the secret stair", "es": "la escalera secreta" },
{ "en": "the poison garden", "es": "el jardín de venenos" },
{ "en": "the watchmaker's shop", "es": "la relojería" },
{ "en": "the drowned village", "es": "el pueblo anegado" },
{ "en": "the arena's blood pit", "es": "el foso de sangre de la arena" }
```

`worldLocation` (+12):

```json
{ "en": "the Amber Steppes", "es": "las Estepas de Ámbar" },
{ "en": "the Shattered Crown", "es": "la Corona Destrozada" },
{ "en": "the Verdigris Sea", "es": "el Mar Verdín" },
{ "en": "the Hollow Reach", "es": "la Extensión Hueca" },
{ "en": "the Salt Kingdom", "es": "el Reino de la Sal" },
{ "en": "the Bone Road", "es": "el Camino de Huesos" },
{ "en": "the Twin Moons' Vale", "es": "el Valle de las Dos Lunas" },
{ "en": "the Ashen Throne", "es": "el Trono de Ceniza" },
{ "en": "the Singing Falls", "es": "las Cascadas Cantarinas" },
{ "en": "the Petal Fields", "es": "los Campos de Pétalos" },
{ "en": "the Red Dunes", "es": "las Dunas Rojas" },
{ "en": "the Glacier Gate", "es": "la Puerta de Glaciar" }
```

`creatureName` (+16 — top up 44 → 60):

```json
{ "en": "a rabid boar", "es": "un jabalí rabioso" },
{ "en": "a giant scorpion", "es": "un escorpión gigante" },
{ "en": "a flock of harpies", "es": "una bandada de arpías" },
{ "en": "a slumbering wyrm", "es": "una sierpe dormida" },
{ "en": "a pack of jackals", "es": "una manada de chacales" },
{ "en": "a tainted unicorn", "es": "un unicornio mancillado" },
{ "en": "a swarm of locusts", "es": "una plaga de langostas" },
{ "en": "a ghostly hound", "es": "un sabueso fantasmal" },
{ "en": "a man-eating vulture", "es": "un buitre devorador de hombres" },
{ "en": "a crystal serpent", "es": "una serpiente de cristal" },
{ "en": "a maddened war elephant", "es": "un elefante de guerra enloquecido" },
{ "en": "a thorned hydra", "es": "una hidra de espinas" },
{ "en": "a howling banshee", "es": "una banshee aullante" },
{ "en": "a colossal snapping turtle", "es": "una tortuga mordedora colosal" },
{ "en": "a venomous basilisk", "es": "un basilisco venenoso" },
{ "en": "a burning wicker giant", "es": "un gigante de mimbre en llamas" }
```

`guildName` (+7):

```json
{ "en": "The Gilded Quill", "es": "La Pluma Dorada" },
{ "en": "The Saltwrights", "es": "Los Escribas de la Sal" },
{ "en": "The Ember Lodge", "es": "El Refugio de la Brasa" },
{ "en": "The Crowfoot Syndicate", "es": "El Sindicato Pata de Cuervo" },
{ "en": "The North Star Company", "es": "La Compañía de la Estrella del Norte" },
{ "en": "The Pale Ledger", "es": "El Libro Mayor Pálido" },
{ "en": "The Harvest Union", "es": "El Sindicato de la Cosecha" }
```

`regionVariant` (+6 — top up 6 → 12):

```json
{ "en": "the Vale's shepherd's market", "es": "el mercado de pastores del Valle" },
{ "en": "the Coastlands' storm-caller rite", "es": "el rito del invocador de tormentas de las Tierras de la Costa" },
{ "en": "the Highlands' clan moot", "es": "la asamblea de clanes de las Tierras Altas" },
{ "en": "the Wastelands' ember pilgrimage", "es": "la peregrinación de la brasa de las Tierras Yermas" },
{ "en": "the Capital's lantern procession", "es": "la procesión de faroles de la Capital" },
{ "en": "the Isles' storm-watch feast", "es": "la fiesta de la vigía de tormentas de las Islas" }
```

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/slots.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "const s=require('./content/slots.json'); for (const [k,v] of Object.entries(s)) console.log(k, v.length);"
```

Expected: prettier formats cleanly, `all locale maps complete`, `registry OK`, and counts npcRole 75 / npcName 79 / locationName 59 / worldLocation 23 / creatureName **60** / guildName 19 / regionVariant **12** (total **327**).

- [ ] **Step 3: Commit**

```bash
git add content/slots.json
git commit -m "content(slots): double slot pool entries to 326"
```

---

### Task 3: Expand `content/archetypes.json` (+30 — 5 more per class)

**Files:**
- Modify: `content/archetypes.json`

**Interfaces:**
- Consumes: `ArchetypePool` — `Record<classId, ArchetypeContent[]>`; each has `id`, `icon` (a Lucide icon name — unknown names fall back to `Sparkles` via `AchIcon.tsx`, so reuse icons already used in the file where possible), `name`, `flavor`, `statDeltas` (1-2 stats, total ≈ 8).
- Produces: 10 archetypes per class (was 5). Later tasks don't depend on specific ids.

- [ ] **Step 1: Append 5 archetypes to each class pool**

Follow the existing distribution pattern (single-stat +8 for the class's core stats, split deltas like 4+4 / 6+2 for hybrids). Each needs unique `id`, `icon` (reuse icons already present in the file: flame, shield, wind, crown, brain, sparkles, skull, eye, swords, hand, sword, eye-off, message-circle, target, heart-handshake, footprints, crosshair, layers, heart-pulse, scroll-text — or `circle`), and full bilingual name + flavor. Append to each class array:

`warrior` (+5):

```json
{ "id": "juggernaut", "icon": "shield", "name": { "en": "Juggernaut", "es": "Ariete" }, "flavor": { "en": "A wall of steel that does not know the word 'retreat'.", "es": "Una muralla de acero que no conoce la palabra 'retirada'." }, "statDeltas": { "constitution": 5, "strength": 3 } },
{ "id": "warmaster", "icon": "swords", "name": { "en": "Warmaster", "es": "Señor de la Guerra" }, "flavor": { "en": "Battles are won before the first blow, by the one who plans them.", "es": "Las batallas se ganan antes del primer golpe, las gana quien las planea." }, "statDeltas": { "intelligence": 8 } },
{ "id": "gladiator", "icon": "target", "name": { "en": "Gladiator", "es": "Gladiador" }, "flavor": { "en": "The roar of the crowd is fuel for your blade.", "es": "El rugido de la multitud es el combustible de tu espada." }, "statDeltas": { "strength": 6, "charisma": 2 } },
{ "id": "wanderer", "icon": "wind", "name": { "en": "Wanderer", "es": "Errante" }, "flavor": { "en": "No home, no master — only the road and the fight.", "es": "Sin hogar, sin amo — solo el camino y la pelea." }, "statDeltas": { "dexterity": 5, "constitution": 3 } },
{ "id": "ironclad", "icon": "crown", "name": { "en": "Ironclad", "es": "Coraza de Hierro" }, "flavor": { "en": "Rumor says a blade has never drawn blood on you. You intend to keep it that way.", "es": "El rumor dice que una hoja jamás te sacó sangre. Pensás mantenerlo así." }, "statDeltas": { "constitution": 8 } }
```

`wizard` (+5):

```json
{ "id": "geomancer", "icon": "layers", "name": { "en": "Geomancer", "es": "Geomante" }, "flavor": { "en": "The stone remembers what flesh forgets. So do you.", "es": "La piedra recuerda lo que la carne olvida. Vos también." }, "statDeltas": { "intelligence": 6, "constitution": 2 } },
{ "id": "stormcaller", "icon": "wind", "name": { "en": "Stormcaller", "es": "Invocador de Tormentas" }, "flavor": { "en": "The sky answers when you raise your hand.", "es": "El cielo responde cuando alzás la mano." }, "statDeltas": { "intelligence": 8 } },
{ "id": "abjurer", "icon": "shield", "name": { "en": "Abjurer", "es": "Abjurador" }, "flavor": { "en": "Your magic does not attack. It denies — spells, blades, even time itself.", "es": "Tu magia no ataca. Niega — hechizos, espadas, hasta el tiempo mismo." }, "statDeltas": { "intelligence": 4, "constitution": 4 } },
{ "id": "chronomancer", "icon": "clock", "name": { "en": "Chronomancer", "es": "Cronomante" }, "flavor": { "en": "A stolen second is worth more than a kingdom.", "es": "Un segundo robado vale más que un reino." }, "statDeltas": { "dexterity": 4, "intelligence": 4 } },
{ "id": "charlatan", "icon": "message-circle", "name": { "en": "Charlatan", "es": "Charlatán" }, "flavor": { "en": "Half your spells are tricks. The other half work. Nobody can tell which is which.", "es": "La mitad de tus hechizos son trucos. La otra mitad funciona. Nadie sabe cuál es cuál." }, "statDeltas": { "charisma": 8 } }
```

`rogue` (+5):

```json
{ "id": "poisoner", "icon": "flask-conical", "name": { "en": "Poisoner", "es": "Envenenador" }, "flavor": { "en": "Death comes on a silver tray, and you are the caterer.", "es": "La muerte llega en bandeja de plata, y vos sos el anfitrión." }, "statDeltas": { "dexterity": 6, "intelligence": 2 } },
{ "id": "trapmaster", "icon": "layers", "name": { "en": "Trapmaster", "es": "Maestro de Trampas" }, "flavor": { "en": "Every room is a riddle you have already answered.", "es": "Cada sala es un acertijo que ya resolviste." }, "statDeltas": { "intelligence": 8 } },
{ "id": "acrobat", "icon": "person-running", "name": { "en": "Acrobat", "es": "Acróbata" }, "flavor": { "en": "Gravity is a suggestion, and you never take suggestions.", "es": "La gravedad es una sugerencia, y vos nunca seguís sugerencias." }, "statDeltas": { "dexterity": 8 } },
{ "id": "crime_lord", "icon": "crown", "name": { "en": "Crime Lord", "es": "Señor del Crimen" }, "flavor": { "en": "You do not pick pockets. You pick kingdoms.", "es": "No robás bolsillos. Robás reinos." }, "statDeltas": { "charisma": 6, "intelligence": 2 } },
{ "id": "double_agent", "icon": "eye", "name": { "en": "Double Agent", "es": "Agente Doble" }, "flavor": { "en": "Every master you serve thinks you serve only them.", "es": "Cada amo al que servís cree que solo lo servís a él." }, "statDeltas": { "intelligence": 5, "charisma": 3 } }
```

`ranger` (+5):

```json
{ "id": "pathfinder", "icon": "footprints", "name": { "en": "Pathfinder", "es": "Abridor de Caminos" }, "flavor": { "en": "There is no road you cannot find, and no road that finds you.", "es": "No hay camino que no encuentres, y ninguno que te encuentre a vos." }, "statDeltas": { "dexterity": 8 } },
{ "id": "warden", "icon": "shield", "name": { "en": "Warden", "es": "Guardián del Bosque" }, "flavor": { "en": "The forest keeps its own laws. You enforce them.", "es": "El bosque tiene sus propias leyes. Vos las hacés cumplir." }, "statDeltas": { "constitution": 6, "dexterity": 2 } },
{ "id": "skywatcher", "icon": "eye", "name": { "en": "Skywatcher", "es": "Vigía del Cielo" }, "flavor": { "en": "You read the weather the way priests read scripture.", "es": "Leés el clima como los sacerdotes leen las escrituras." }, "statDeltas": { "intelligence": 8 } },
{ "id": "beastcaller", "icon": "heart-handshake", "name": { "en": "Beastcaller", "es": "Llamador de Bestias" }, "flavor": { "en": "The wolves do not fear your spear. They follow it.", "es": "Los lobos no temen tu lanza. La siguen." }, "statDeltas": { "charisma": 5, "dexterity": 3 } },
{ "id": "stoneborn", "icon": "layers", "name": { "en": "Stoneborn", "es": "Nacido de la Piedra" }, "flavor": { "en": "Mountains raised you. The cold is an old friend.", "es": "Te criaron las montañas. El frío es un viejo amigo." }, "statDeltas": { "constitution": 8 } }
```

`cleric` (+5):

```json
{ "id": "exorcist", "icon": "flame", "name": { "en": "Exorcist", "es": "Exorcista" }, "flavor": { "en": "You have stared into the dark, and the dark looked away first.", "es": "Miraste a la oscuridad a los ojos, y la oscuridad desvió la mirada." }, "statDeltas": { "intelligence": 6, "charisma": 2 } },
{ "id": "crusader", "icon": "swords", "name": { "en": "Crusader", "es": "Cruzado" }, "flavor": { "en": "Your faith is a banner. Your blade is its shadow.", "es": "Tu fe es un estandarte. Tu espada, su sombra." }, "statDeltas": { "strength": 8 } },
{ "id": "prophet", "icon": "eye", "name": { "en": "Prophet", "es": "Profeta" }, "flavor": { "en": "You see the shape of what will be, and it troubles your sleep.", "es": "Ves la forma de lo que será, y eso perturba tu sueño." }, "statDeltas": { "intelligence": 8 } },
{ "id": "guardian_saint", "icon": "heart-pulse", "name": { "en": "Guardian Saint", "es": "Santo Guardián" }, "flavor": { "en": "Where you stand, the fallen rise again.", "es": "Donde vos te parás, los caídos vuelven a levantarse." }, "statDeltas": { "constitution": 5, "charisma": 3 } },
{ "id": "heretic", "icon": "sparkles", "name": { "en": "Heretic", "es": "Hereje" }, "flavor": { "en": "The temple calls it blasphemy. The village calls it miracle.", "es": "El templo lo llama blasfemia. La aldea lo llama milagro." }, "statDeltas": { "charisma": 6, "intelligence": 2 } }
```

`bard` (+5):

```json
{ "id": "griot", "icon": "book-open", "name": { "en": "Griot", "es": "Griot" }, "flavor": { "en": "You carry a people's memory in song and story.", "es": "Llevás la memoria de un pueblo en canciones e historias." }, "statDeltas": { "charisma": 6, "intelligence": 2 } },
{ "id": "swashbuckler", "icon": "swords", "name": { "en": "Swashbuckler", "es": "Espadachín" }, "flavor": { "en": "A duel is a conversation. You always get the last word.", "es": "Un duelo es una conversación. Vos siempre tenés la última palabra." }, "statDeltas": { "dexterity": 6, "charisma": 2 } },
{ "id": "dirgesinger", "icon": "heart-pulse", "name": { "en": "Dirgesinger", "es": "Cantor de Endechas" }, "flavor": { "en": "Your songs mourn the dead so loudly the living can't ignore them.", "es": "Tus canciones lloran a los muertos tan fuerte que los vivos no pueden ignorarlas." }, "statDeltas": { "charisma": 4, "constitution": 4 } },
{ "id": "trickster", "icon": "message-circle", "name": { "en": "Trickster", "es": "Tramposo" }, "flavor": { "en": "The truth is a stage prop. You're the director.", "es": "La verdad es un utilero de escenario. Vos sos el director." }, "statDeltas": { "dexterity": 4, "charisma": 4 } },
{ "id": "harbinger", "icon": "flame", "name": { "en": "Harbinger", "es": "Precursor" }, "flavor": { "en": "You sing of what is coming, and what is coming fears the song.", "es": "Cantás lo que se avecina, y lo que se avecina teme la canción." }, "statDeltas": { "intelligence": 5, "charisma": 3 } }
```

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/archetypes.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "const a=require('./content/archetypes.json'); for (const [k,v] of Object.entries(a)) console.log(k, v.length);"
```

Expected: `registry OK` and every class reports **10**.

- [ ] **Step 3: Commit**

```bash
git add content/archetypes.json
git commit -m "content(archetypes): double archetype pool to 10 per class"
```

---

### Task 4: Expand `content/shop.json` (+16 — 5 retinue, 5 consumable, 6 luxury)

**Files:**
- Modify: `content/shop.json`

**Interfaces:**
- Consumes: `ShopItem` shape — `id`, `category` (`retinue` | `consumable` | `luxury`), `name`, `cost`, `effect` (`{type: ShopEffectType, value}` or `null`), `icon` (emoji), `flavor`, optional `requiresArc`, optional `duration`. No `achievementTrigger` (out of scope).
- Produces: 10 retinue / 10 consumable / 12 luxury items total.

- [ ] **Step 1: Append the new items**

Follow existing cost tiers: retinue 2000-3000, consumable 500-800, luxury 400-12000 arc-gated. **Append 5 to `retinue`:**

```json
{
  "id": "armorer",
  "category": "retinue",
  "name": { "en": "Armorer", "es": "Armero" },
  "cost": 2400,
  "effect": { "type": "injuryRiskModifier", "value": -0.08 },
  "icon": "🛡️",
  "flavor": { "en": "Plates that turn a killing blow into a bruise.", "es": "Placas que convierten un golpe mortal en un moretón." }
},
{
  "id": "quartermaster",
  "category": "retinue",
  "name": { "en": "Quartermaster", "es": "Intendente" },
  "cost": 2700,
  "effect": { "type": "fatigueModifier", "value": -0.1 },
  "icon": "🎒",
  "flavor": { "en": "Supplies that never run out, boots that never wear through.", "es": "Vituallas que nunca se acaban, botas que nunca se gastan." }
},
{
  "id": "battle_surgeon",
  "category": "retinue",
  "name": { "en": "Battle Surgeon", "es": "Cirujano de guerra" },
  "cost": 2900,
  "effect": { "type": "injuryRiskModifier", "value": -0.12 },
  "icon": "🩺",
  "flavor": { "en": "He can patch a wound between two blows.", "es": "Puede curar una herida entre dos golpes." }
},
{
  "id": "taskmaster",
  "category": "retinue",
  "name": { "en": "Taskmaster", "es": "Capataz" },
  "cost": 2500,
  "effect": { "type": "momentumRecoveryModifier", "value": -0.15 },
  "icon": "⛓️",
  "flavor": { "en": "A bad streak ends the day he raises his voice.", "es": "Una racha mala termina el día que alza la voz." }
},
{
  "id": "royal_tutor",
  "category": "retinue",
  "name": { "en": "Royal Tutor", "es": "Tutor real" },
  "cost": 3100,
  "effect": { "type": "offerQualityModifier", "value": 0.12 },
  "icon": "📚",
  "flavor": { "en": "Teaches you which contracts to take and which to burn.", "es": "Te enseña qué contratos aceptar y cuáles quemar." }
}
```

**Append 5 to `consumable`:**

```json
{
  "id": "wound_salve",
  "category": "consumable",
  "name": { "en": "Wound Salve", "es": "Ungüento para heridas" },
  "cost": 550,
  "effect": null,
  "icon": "🧴",
  "flavor": { "en": "Faster recovery between battles.", "es": "Recuperación más rápida entre batallas." },
  "duration": 1
},
{
  "id": "iron_rations",
  "category": "consumable",
  "name": { "en": "Iron Rations", "es": "Raciones de hierro" },
  "cost": 450,
  "effect": null,
  "icon": "🍖",
  "flavor": { "en": "Endurance for the long road ahead.", "es": "Resistencia para el largo camino." },
  "duration": 1
},
{
  "id": "guild_recommendation",
  "category": "consumable",
  "name": { "en": "Guild Recommendation", "es": "Carta de recomendación gremial" },
  "cost": 750,
  "effect": null,
  "icon": "📜",
  "flavor": { "en": "Better offers and warmer welcomes this season.", "es": "Mejores ofertas y recibimientos más cálidos esta temporada." },
  "duration": 1
},
{
  "id": "bone_setter",
  "category": "consumable",
  "name": { "en": "Bone-Setter's Compact", "es": "Pacto del curandero de huesos" },
  "cost": 650,
  "effect": { "type": "injuryRiskModifier", "value": -0.08 },
  "icon": "🦴",
  "flavor": { "en": "Fewer broken bones, faster mends, for two seasons.", "es": "Menos huesos rotos, curaciones más rápidas, por dos temporadas." },
  "duration": 2
},
{
  "id": "elixir_of_vigor",
  "category": "consumable",
  "name": { "en": "Elixir of Vigor", "es": "Elixir de vigor" },
  "cost": 600,
  "effect": null,
  "icon": "⚗️",
  "flavor": { "en": "A season without fatigue catching up to you.", "es": "Una temporada sin que el cansancio te alcance." },
  "duration": 1
}
```

**Append 6 to `luxury`:**

```json
{
  "id": "hunting_lodge",
  "category": "luxury",
  "name": { "en": "Hunting Lodge", "es": "Cabaña de caza" },
  "cost": 900,
  "effect": null,
  "icon": "🏕️",
  "flavor": { "en": "A private stretch of forest, and a roof over your head.", "es": "Un tramo de bosque privado, y un techo sobre tu cabeza." },
  "requiresArc": ["adventurer", "mercenary"]
},
{
  "id": "vault_box",
  "category": "luxury",
  "name": { "en": "Vault Box", "es": "Caja de bóveda" },
  "cost": 1600,
  "effect": null,
  "icon": "🔒",
  "flavor": { "en": "Gold that thieves, armies, and taxmen cannot reach.", "es": "Oro al que ladrones, ejércitos y recaudadores no pueden llegar." },
  "requiresArc": ["adventurer", "mercenary"]
},
{
  "id": "dueling_hall",
  "category": "luxury",
  "name": { "en": "Dueling Hall", "es": "Sala de duelo" },
  "cost": 3500,
  "effect": null,
  "icon": "⚔️",
  "flavor": { "en": "Sparring partners who keep your edge honest.", "es": "Compañeros de esgrima que mantienen honesto tu filo." },
  "requiresArc": ["kingdom_hero", "legend"]
},
{
  "id": "observatory",
  "category": "luxury",
  "name": { "en": "Observatory", "es": "Observatorio" },
  "cost": 4200,
  "effect": null,
  "icon": "🔭",
  "flavor": { "en": "A tower where the stars write your fortunes nightly.", "es": "Una torre donde las estrellas escriben tus fortunas cada noche." },
  "requiresArc": ["kingdom_hero", "legend"]
},
{
  "id": "sky_garden",
  "category": "luxury",
  "name": { "en": "Sky Garden", "es": "Jardín del cielo" },
  "cost": 9000,
  "effect": null,
  "icon": "🌿",
  "flavor": { "en": "A private paradise suspended above the petty world.", "es": "Un paraíso privado suspendido sobre el mundo mezquino." },
  "requiresArc": ["legend", "old_hero"]
},
{
  "id": "trophy_wing",
  "category": "luxury",
  "name": { "en": "Trophy Wing", "es": "Ala de trofeos" },
  "cost": 11000,
  "effect": null,
  "icon": "🏆",
  "flavor": { "en": "Every victory memorialized in marble and gold.", "es": "Cada victoria inmortalizada en mármol y oro." },
  "requiresArc": ["legend", "old_hero"]
}
```

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/shop.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "const s=require('./content/shop.json'); for (const c of ['retinue','consumable','luxury']) console.log(c, s.filter(i=>i.category===c).length);"
```

Expected: `registry OK`, retinue 10 / consumable 10 / luxury 12 (total 32).

- [ ] **Step 3: Commit**

```bash
git add content/shop.json
git commit -m "content(shop): double shop catalog to 32 items"
```

---

### Task 5: Expand `content/events/tavern.json` (+5)

**Files:**
- Modify: `content/events/tavern.json`

**Interfaces:**
- Consumes: `EventContent` + `ChoiceContent` (see Global Constraints). `location` may be a faction id like `"greywater"` (display context). Choices interpolate `{npcRole}`, `{npcName}`, `{locationName}` (all exist after Task 2). Faction ids available for `reputationFaction`: the 25 in `factions.json` (greywater, ironhold, thornwood, arcanum, crownguard, ashwalkers, blacktide, bronzehammer, crimsonveil, deepfolk, embersworn, frostwood_tribe, golden_lotus, iron_covenant, ivy_circle, meridian_company, nightfall_order, rust_priests, sandspear, silver_mask, stonewardens, sunken_church, whispering_reed, luminari, gildedtongue).
- Produces: 10 tavern events (was 5). New ids below.

- [ ] **Step 1: Append 5 events**

**New ids (must not collide):** `tavern_bouncer_hand`, `tavern_war_tales`, `tavern_stray_coin`, `tavern_healer_surgeon`, `tavern_ghost_story`.

Full worked example (append as-is, then author the other 4 following this exact shape — always 2-4 choices, `tag` from the 10 personality tags, `rarity` from the 4 rarities, at least one non-stat-gated choice, and all deltas inside Global Constraints ranges):

```json
{
  "id": "tavern_bouncer_hand",
  "minAge": 16,
  "maxAge": 99,
  "weight": 8,
  "location": "greywater",
  "narrative": {
    "en": "The door of {locationName} swings shut behind you and a hand like a ham lands on your shoulder. A {npcRole} named {npcName} leans in, grinning. 'The house rule is you buy a round when you walk in. The house rule is also that I'm the one who collects.'",
    "es": "La puerta de {locationName} se cierra detrás de vos y una mano como un jamón aterriza en tu hombro. Un {npcRole} llamado {npcName} se acerca, sonriendo. 'La regla de la casa es que comprás una ronda al entrar. La regla de la casa también es que yo soy quien cobra.'"
  },
  "choices": [
    {
      "id": "buy_round",
      "label": { "en": "Buy the round and make a friend", "es": "Pagar la ronda y hacer un amigo" },
      "tag": "Professional",
      "rarity": "common",
      "goldDelta": -25,
      "statDeltas": { "charisma": 1 },
      "reputationDelta": 2,
      "reputationFaction": "greywater",
      "narrative": {
        "en": "{npcName} bellows for ale and the room drinks your health. For a night, you are the most popular stranger in Greywater.",
        "es": "{npcName} pide cerveza a gritos y la sala brinda por tu salud. Por una noche, sos la forastera más popular de Villa Aguagrís."
      }
    },
    {
      "id": "slip_the_coin",
      "label": { "en": "Slip a silver coin and walk past", "es": "Deslizar una moneda de plata y seguir de largo" },
      "tag": "Strategic",
      "rarity": "uncommon",
      "goldDelta": -10,
      "statDeltas": { "intelligence": 1 },
      "narrative": {
        "en": "The coin vanishes into {npcName}'s palm faster than a rumor. 'Smart one,' they murmur, and the way clears.",
        "es": "La moneda desaparece en la palma de {npcName} más rápido que un rumor. 'Listo', murmuran, y el paso se abre."
      }
    },
    {
      "id": "call_the_bluff",
      "label": { "en": "Call their bluff", "es": "Irte de farol" },
      "tag": "Aggressive",
      "rarity": "volatile",
      "requiresStat": { "stat": "strength", "min": 12 },
      "statDeltas": { "strength": 2 },
      "tradeoffDeltas": { "charisma": -1 },
      "injuryRiskDelta": 0.12,
      "narrative": {
        "en": "For a long second the room holds its breath. Then {npcName} laughs and claps you on the back hard enough to bruise. You bought no round — but the house remembers your spine.",
        "es": "Por un segundo largo la sala contiene la respiración. Entonces {npcName} ríe y te da una palmada en la espalda que deja moretón. No compraste ronda — pero la casa recuerda tu coraje."
      }
    }
  ]
}
```

Author the other 4 with these briefs (same JSON shape; all deltas in-range; unique choice ids; keep the `location` field off or reuse `"greywater"`):

- `tavern_war_tales` — veterans trade war stories; choices: tell your own (Funny, +fame), listen and learn (Strategic, +intelligence, +reputation ironhold), buy the liar a drink (Supportive, +charisma). Weight 7.
- `tavern_stray_coin` — a gutter child shadows you with a story of stolen wages; choices: hand over coin (Humble, −gold, +lives_saved counter), ignore (Stoic), find the thief yourself (Aggressive, requiresStat dexterity 12, risk). Weight 6. Use counter `lives_saved`.
- `tavern_healer_surgeon` — a travelling surgeon offers to treat an old wound for a price; choices: accept (Professional, −gold, +health), trade a story for the treatment (Funny, +charisma, −gold small), refuse (Stoic). Weight 5.
- `tavern_ghost_story` — a {npcRole} insists the tavern is haunted and dares you to prove it; choices: play along (Funny, +charisma, +fame), investigate the cellar (Strategic, requiresStat intelligence 10, +intelligence, small +gold find), laugh it off (Cocky). Weight 6.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/tavern.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('tavern', JSON.parse(require('fs').readFileSync('content/events/tavern.json','utf8')).length);"
```

Expected: `registry OK`, tavern **10**.

- [ ] **Step 3: Commit**

```bash
git add content/events/tavern.json
git commit -m "content(events): double tavern events to 10"
```

---

### Task 6: Expand `content/events/road.json` (+6)

**Files:**
- Modify: `content/events/road.json`

**Interfaces:**
- Consumes: same as Task 5; `{npcRole}`, `{npcName}`, `{locationName}`, `{creatureName}` available; `requiresForeign`/`requiresRegion` gates allowed.
- Produces: 12 road events (was 6).

- [ ] **Step 1: Append 6 events**

**New ids:** `road_caravan_ambush`, `road_waystation_merchant`, `road_broken_wagon`, `road_holy_procession`, `road_wildfire`, `road_riddle_stone`.

Worked example (the `requiresStat`-gated aggressive choice is optional per event, but never gate ALL choices):

```json
{
  "id": "road_caravan_ambush",
  "minAge": 16,
  "maxAge": 99,
  "weight": 8,
  "narrative": {
    "en": "Bows sing on the ridgeline and arrows rake the caravan ahead of you. A {npcRole} from the guard screams for help as {creatureName} and a dozen raiders pour down the slope.",
    "es": "Los arcos cantan en la cresta y las flechas barren la caravana frente a vos. Un {npcRole} de la guardia grita pidiendo ayuda mientras {creatureName} y una docena de asaltantes bajan por la ladera."
  },
  "choices": [
    {
      "id": "charge_in",
      "label": { "en": "Charge the flank", "es": "Cargar contra el flanco" },
      "tag": "Aggressive",
      "rarity": "rare",
      "requiresStat": { "stat": "strength", "min": 12 },
      "statDeltas": { "strength": 2, "constitution": 1 },
      "goldDelta": 80,
      "reputationDelta": 3,
      "reputationFaction": "greywater",
      "countersDelta": { "battles_won": 1, "lives_saved": 1 },
      "injuryRiskDelta": 0.15,
      "narrative": {
        "en": "You hit the raiders' line like a thrown stone. The caravan escapes whole, and the merchants press a purse into your bloodied hands. The road will speak of this.",
        "es": "Golpeás la línea de asaltantes como una piedra lanzada. La caravana escapa entera, y los mercaderes te meten una bolsa en las manos ensangrentadas. El camino hablará de esto."
      }
    },
    {
      "id": "loose_arrow",
      "label": { "en": "Pick them off from cover", "es": "Bajarlos desde la cobertura" },
      "tag": "Strategic",
      "rarity": "uncommon",
      "requiresStat": { "stat": "dexterity", "min": 12 },
      "statDeltas": { "dexterity": 2 },
      "goldDelta": 50,
      "countersDelta": { "battles_won": 1 },
      "narrative": {
        "en": "Three arrows, three raiders down. The rest break and run. A guard captain nods at you and tosses a coin purse — 'Worth every copper, stranger.'",
        "es": "Tres flechas, tres asaltantes caídos. El resto se da a la fuga. Un capitán de la guardia asiente hacia vos y te lanza una bolsa — 'Vale cada cobre, forastera.'"
      }
    },
    {
      "id": "drive_the_wagon",
      "label": { "en": "Drive the lead wagon to safety", "es": "Llevar la carreta delantera a un lugar seguro" },
      "tag": "Supportive",
      "rarity": "common",
      "statDeltas": { "constitution": 1 },
      "goldDelta": 30,
      "reputationDelta": 1,
      "reputationFaction": "greywater",
      "narrative": {
        "en": "Whip cracking, you thread the wagon through the chaos. Children safe, goods saved. The merchants' thanks follow you down the road.",
        "es": "Látigo restallando, enhebrás la carreta entre el caos. Niños a salvo, mercancía salvada. El agradecimiento de los mercaderes te sigue por el camino."
      }
    }
  ]
}
```

Author the other 5 per these briefs (same shape; vary `requiresForeign`/`requiresRegion` on one or two; keep all choices not-fully-gated):

- `road_waystation_merchant` — a merchant at a waystation overpays you to smuggle a sealed chest past the border post (requiresRegion `"vale"` optional); choices: take the job (Strategic, −liability small +gold 120), refuse (Professional), peek inside first (Cocky, +liability, risk). Weight 7.
- `road_broken_wagon` — a broken wagon, a stranded {npcRole}; choices: help fix it (Supportive, +reputation), trade for the cargo (Strategic, −gold small +gold bigger), keep walking (Stoic). Weight 7.
- `road_holy_procession` — a Luminari procession blocks the road; choices: kneel and pass blessed (Humble, +charisma, +health), walk past politely (Professional), mock the faith (Cocky, −reputation luminari). Weight 5.
- `road_wildfire` — wildfire racing toward a village (use `{creatureName}` = a herd of panicked deer as color); choices: raise the alarm (Supportive, +lives_saved), fight the fire line (Aggressive, requiresStat strength/constitution 12, +injuryRisk), take the shortcut around (Strategic, +dexterity). Weight 6.
- `road_riddle_stone` — a {npcRole} guards a standing stone that asks a riddle; choices: answer the riddle (Strategic, requiresStat intelligence 12, +intelligence +gold), offer gold instead (Cocky, −gold), walk around (Stoic). Weight 5.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/road.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('road', JSON.parse(require('fs').readFileSync('content/events/road.json','utf8')).length);"
```

Expected: `registry OK`, road **12**.

- [ ] **Step 3: Commit**

```bash
git add content/events/road.json
git commit -m "content(events): double road events to 12"
```

---

### Task 7: Expand `content/events/dungeon.json` (+5)

**Files:**
- Modify: `content/events/dungeon.json`

**Interfaces:**
- Consumes: same as Task 5; `{creatureName}`, `{locationName}` available; `involvesRival` optional.
- Produces: 10 dungeon events (was 5).

- [ ] **Step 1: Append 5 events**

**New ids:** `dungeon_bridge_guardian`, `dungeon_booby_trap_hall`, `dungeon_archivist_ghost`, `dungeon_old_treasure`, `dungeon_rival_ambush`.

Worked example:

```json
{
  "id": "dungeon_bridge_guardian",
  "minAge": 16,
  "maxAge": 99,
  "weight": 8,
  "narrative": {
    "en": "A chasm splits the crypt, spanned by a rope bridge that sags with age. On the far side, {creatureName} crouches over a pile of rusted arms — and it has already seen you.",
    "es": "Un abismo parte la cripta, cruzado por un puente de sogas que se comba con los años. Al otro lado, {creatureName} se agacha sobre una pila de armas oxidadas — y ya te vio."
  },
  "choices": [
    {
      "id": "cross_quietly",
      "label": { "en": "Cross the bridge quietly", "es": "Cruzar el puente en silencio" },
      "tag": "Strategic",
      "rarity": "uncommon",
      "requiresStat": { "stat": "dexterity", "min": 12 },
      "statDeltas": { "dexterity": 2 },
      "goldDelta": 60,
      "injuryRiskDelta": 0.08,
      "narrative": {
        "en": "You move like mist across the rotten planks. The creature never lifts its head. You slip past its hoard with a prize clutched to your chest.",
        "es": "Cruzáis las tablas podridas como niebla. La criatura nunca levanta la cabeza. Pasás junto a su tesoro con un premio apretado contra el pecho."
      }
    },
    {
      "id": "fight_for_passing",
      "label": { "en": "Cut it down", "es": "Tumbarlo a golpes" },
      "tag": "Aggressive",
      "rarity": "rare",
      "requiresStat": { "stat": "strength", "min": 14 },
      "statDeltas": { "strength": 2, "constitution": 1 },
      "goldDelta": 90,
      "reputationDelta": 2,
      "reputationFaction": "bronzehammer",
      "countersDelta": { "battles_won": 1, "monsters_killed": 1 },
      "injuryRiskDelta": 0.2,
      "narrative": {
        "en": "Steel sings in the dark. When the echoes die, the creature is still and the hoard is yours. The Bronzehammer clan will hear of this blade.",
        "es": "El acero canta en la oscuridad. Cuando mueren los ecos, la criatura está quieta y el tesoro es tuyo. El clan Martillobronce oirá hablar de esta espada."
      }
    },
    {
      "id": "retreat_and_map",
      "label": { "en": "Note the way and fall back", "es": "Anotar el paso y retroceder" },
      "tag": "Stoic",
      "rarity": "common",
      "statDeltas": { "intelligence": 1 },
      "narrative": {
        "en": "You memorize the bridge's weaknesses and melt back into the dark. Some doors open tomorrow. Some fights are not today's.",
        "es": "Memorizás las debilidades del puente y te fundís de vuelta en la oscuridad. Algunas puertas se abren mañana. Algunas peleas no son las de hoy."
      }
    }
  ]
}
```

Briefs for the other 4 (same shape; `involvesRival: true` on the ambush one):

- `dungeon_booby_trap_hall` — a corridor of pressure plates; choices: disarm methodically (Strategic, requiresStat intelligence 12, +intelligence +gold), sprint it (Aggressive, requiresStat dexterity 14, +injuryRisk high), crawl along the wall (Humble, +constitution). Weight 7.
- `dungeon_archivist_ghost` — a scholarly ghost offers the crypt's history for a memory; choices: listen (Strategic, +intelligence, +fame), bargain for its secret vault (Cocky, +gold risk), leave it to its dust (Stoic). Weight 5.
- `dungeon_old_treasure` — a sealed sarcophagus that could hold gold or a curse (trap flavor); choices: pry it open (Cocky, requiresStat strength 12, +gold, +liability small), read the warning runes (Strategic, requiresStat intelligence 12), walk away (Humble). Weight 6.
- `dungeon_rival_ambush` — `involvesRival: true`; your rival {rivalName} springs an ambush; choices: fight them head-on (Aggressive, requiresStat strength/dexterity 13, +fame +reputation, counter `battles_won`), talk them down (Humble, requiresStat charisma 13, +charisma), slip away (Strategic, requiresStat dexterity 13, +dexterity). Weight 5.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/dungeon.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('dungeon', JSON.parse(require('fs').readFileSync('content/events/dungeon.json','utf8')).length);"
```

Expected: `registry OK`, dungeon **10**.

- [ ] **Step 3: Commit**

```bash
git add content/events/dungeon.json
git commit -m "content(events): double dungeon events to 10"
```

---

### Task 8: Expand `content/events/court.json` (+6)

**Files:**
- Modify: `content/events/court.json`

**Interfaces:**
- Consumes: same as Task 5; `requiresArc: ["kingdom_hero", "legend"]` gates encouraged for high-stakes court events; `reputationFaction` should favor courtly factions (crownguard, golden_lotus, nightfall_order, luminari).
- Produces: 12 court events (was 6).

- [ ] **Step 1: Append 6 events**

**New ids:** `court_petition_line`, `court_scandal_letter`, `court_duel_of_honor`, `court_heir_tutor`, `court_masked_ball`, `court_royal_decree`.

Worked example:

```json
{
  "id": "court_petition_line",
  "minAge": 18,
  "maxAge": 99,
  "weight": 8,
  "narrative": {
    "en": "The antechamber of the Crownguard keep smells of wax and ambition. A {npcRole} in court dress studies you from the petition line. 'The seneschal sees one name a day. Today, that name will be mine — unless you have a better argument.'",
    "es": "La antesala de la fortaleza de la Guardia de la Corona huele a cera y ambición. Un {npcRole} ataviado para la corte te estudia desde la fila de peticiones. 'El senescal recibe un nombre por día. Hoy, ese nombre será el mío — salvo que tengas un mejor argumento.'"
  },
  "choices": [
    {
      "id": "speak_first",
      "label": { "en": "Argue your cause with the seneschal", "es": "Defender tu causa ante el senescal" },
      "tag": "Leader",
      "rarity": "rare",
      "requiresStat": { "stat": "charisma", "min": 12 },
      "statDeltas": { "charisma": 2 },
      "fameDelta": 3,
      "reputationDelta": 3,
      "reputationFaction": "crownguard",
      "narrative": {
        "en": "Your case lands like a thrown gauntlet and the seneschal takes it up. The nobleman's face curdles. The keep has a new name on its tongue.",
        "es": "Tu causa aterriza como un guante arrojado y el senescal la toma. La cara del noble se agria. La fortaleza tiene un nombre nuevo en la lengua."
      }
    },
    {
      "id": "defer_grace",
      "label": { "en": "Let them speak first — generosity pays", "es": "Dejar que hablen primero — la generosidad paga" },
      "tag": "Humble",
      "rarity": "common",
      "statDeltas": { "charisma": 1 },
      "reputationDelta": 1,
      "reputationFaction": "crownguard",
      "narrative": {
        "en": "You bow aside and the noble stumbles through their plea. The seneschal notices your courtesy — and remembers it when the doors close.",
        "es": "Te hacés a un lado con una reverencia y el noble tropieza con su súplica. El senescal nota tu cortesía — y la recuerda cuando se cierran las puertas."
      }
    },
    {
      "id": "bribe_the_clerk",
      "label": { "en": "Slip the clerk a purse to move your name up", "es": "Deslizar una bolsa al escribano para subir tu nombre" },
      "tag": "Cocky",
      "rarity": "volatile",
      "goldDelta": -50,
      "liabilityDelta": 6,
      "statDeltas": { "intelligence": 1 },
      "narrative": {
        "en": "The clerk's quill skips your place in line. Nobody saw the purse pass — but clerks have long memories, and so do the debts you buy with coin.",
        "es": "La pluma del escribano se saltea tu lugar en la fila. Nadie vio pasar la bolsa — pero los escribanos tienen memoria larga, y también las deudas que se compran con monedas."
      }
    }
  ]
}
```

Briefs for the other 5 (same shape):

- `court_scandal_letter` — a scandalous letter about a rival noble circulates; choices: burn it (Humble, +charisma, −liability), publish it (Cocky, +fame, +liability, −reputation target faction), sell it back (Strategic, +gold, +liability). Weight 7.
- `court_duel_of_honor` — a noble challenges you over a perceived slight (requiresArc kingdom_hero/legend); choices: accept (Aggressive, requiresStat strength 14, +fame +reputation, `battles_won`), deflect with wit (Humble, requiresStat charisma 14, +charisma), apologize publicly (Professional, −fame small, no risk). Weight 6.
- `court_heir_tutor` — the heir's tutor begs you to mentor the young prince for a season; choices: accept (Supportive, +charisma +intelligence, +reputation golden_lotus), decline gracefully (Stoic), write a syllabus for coin (Strategic, +gold). Weight 6.
- `court_masked_ball` — a masked ball where identity is a weapon; choices: dance with the mystery guest (Funny, requiresStat charisma 12, +fame), unmask the spymaster (Strategic, requiresStat intelligence 14, +intelligence +gold, +liability), watch from the gallery (Stoic, +intelligence). Weight 7.
- `court_royal_decree` — a royal decree taxes foreign adventurers (requiresForeign true); choices: pay the tax (Professional, −gold), appeal with eloquence (Humble, requiresStat charisma 13, +charisma), flee the capital (Strategic, requiresStat dexterity 12, +dexterity). Weight 5.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/court.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('court', JSON.parse(require('fs').readFileSync('content/events/court.json','utf8')).length);"
```

Expected: `registry OK`, court **12**.

- [ ] **Step 3: Commit**

```bash
git add content/events/court.json
git commit -m "content(events): double court events to 12"
```

---

### Task 9: Expand `content/events/rest.json` (+8)

**Files:**
- Modify: `content/events/rest.json`

**Interfaces:**
- Consumes: same as Task 5; rest events lean on `staminaDelta` (+15..+50) and `healthDelta`; `location` values in the existing file are `"road"`, `"dungeon"`, `"thornwood"` — reuse or omit.
- Produces: 16 rest events (was 8).

- [ ] **Step 1: Append 8 events**

**New ids:** `rest_night_shelter_orphanage`, `rest_bathhouse_soak`, `rest_herbalist_remedy`, `rest_monastery_meal`, `rest_fisherman_sunrise`, `rest_quiet_grove_meditation`, `rest_guard_post_nap`, `rest_storm_cellar`.

Worked example:

```json
{
  "id": "rest_night_shelter_orphanage",
  "minAge": 16,
  "maxAge": 99,
  "weight": 6,
  "narrative": {
    "en": "The orphanage's matron sizes you up at {locationName}. 'We have a straw pallet and a bowl of broth for anyone who tells the children a story that ends well. The pallet is yours either way.'",
    "es": "La directora del orfanato te mide en {locationName}. 'Tenemos un jergón de paja y un plato de caldo para cualquiera que les cuente a los niños una historia que termine bien. El jergón es tuyo igual.'"
  },
  "choices": [
    {
      "id": "tell_hero_tale",
      "label": { "en": "Tell a tale of your own road", "es": "Contar una historia de tu propio camino" },
      "tag": "Funny",
      "rarity": "uncommon",
      "staminaDelta": 35,
      "statDeltas": { "charisma": 2 },
      "fameDelta": 2,
      "countersDelta": { "lives_saved": 1 },
      "narrative": {
        "en": "The children hang on every word, and the matron's eyes soften. You sleep the sleep of the righteous, and a small hand has slipped a lucky stone into your pack.",
        "es": "Los niños se cuelgan de cada palabra, y los ojos de la directora se suavizan. Dormís el sueño de los justos, y una mano pequeña deslizó una piedra de la suerte en tu mochila."
      }
    },
    {
      "id": "help_with_chores",
      "label": { "en": "Mend the roof before resting", "es": "Arreglar el techo antes de descansar" },
      "tag": "Supportive",
      "rarity": "common",
      "staminaDelta": 22,
      "statDeltas": { "constitution": 1 },
      "reputationDelta": 2,
      "reputationFaction": "luminari",
      "narrative": {
        "en": "You patch the leaky roof by dusk. The matron feeds you twice and mutters a prayer over your sleeping form.",
        "es": "Remendás el techo con goteras al anochecer. La directora te da de comer dos veces y murmura una oración sobre tu forma dormida."
      }
    },
    {
      "id": "pay_for_the_pallet",
      "label": { "en": "Leave coin for the children's fund", "es": "Dejar monedas para el fondo de los niños" },
      "tag": "Humble",
      "rarity": "rare",
      "goldDelta": -40,
      "staminaDelta": 30,
      "statDeltas": { "charisma": 1 },
      "narrative": {
        "en": "The matron tries to refuse, then takes the coins with wet eyes. 'The Luminari keep a book of kind strangers,' she says. 'Your name goes in it twice.'",
        "es": "La directora intenta negarse, luego toma las monedas con los ojos llorosos. 'Los Luminari llevan un libro de desconocidos bondadosos', dice. 'Tu nombre entra dos veces.'"
      }
    }
  ]
}
```

Briefs for the other 7 (all rest-flavored, generous `staminaDelta`):

- `rest_bathhouse_soak` — a public bathhouse; choices: full soak (Humble, −gold 15, +stamina 45, +health), quick rinse (Stoic, +stamina 15), skip and keep coin (Professional, +gold small tradeoff... keep to −0 and +intelligence). Weight 6.
- `rest_herbalist_remedy` — a herbalist brews a restorative; choices: buy the remedy (Professional, −gold 25, +stamina 40 +health 6), trade labor (Supportive, +stamina 25, +reputation thornwood), share your own road lore (Strategic, +intelligence 2). Weight 6.
- `rest_monastery_meal` — monks offer a silent meal; choices: join the silence (Humble, +stamina 35 +charisma), donate and eat (Professional, −gold 20, +stamina 30), debate the abbot (Cocky, requiresStat intelligence 12, +intelligence 2, +stamina 15). Weight 5.
- `rest_fisherman_sunrise` — a fisherman shares his dawn catch; choices: help haul nets (Supportive, +stamina 28 +constitution), eat and rest (Humble, +stamina 40), trade a knot for a recipe (Strategic, +intelligence). Weight 5.
- `rest_quiet_grove_meditation` — a grove for meditation; choices: meditate till dusk (Stoic, +stamina 30 +intelligence), nap under a tree (Humble, +stamina 45), carve a ward into a tree (Supportive, +charisma). Weight 5.
- `rest_guard_post_nap` — a friendly guard offers a dry watch-post; choices: take the bunk (Professional, +stamina 35), keep them company on watch (Funny, +stamina 20 +charisma), press on (Aggressive, requiresStat constitution 12, +stamina −5, +dexterity). Weight 5.
- `rest_storm_cellar` — a storm forces you into a farmer's cellar; choices: share your rations (Supportive, +stamina 30, +reputation whispering_reed), sleep through it (Humble, +stamina 40), help shore up the door (Strategic, +stamina 25 +constitution). Weight 5.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/rest.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('rest', JSON.parse(require('fs').readFileSync('content/events/rest.json','utf8')).length);"
```

Expected: `registry OK`, rest **16**.

- [ ] **Step 3: Commit**

```bash
git add content/events/rest.json
git commit -m "content(events): double rest events to 16"
```

---

### Task 10: Expand `content/events/clans.json` (+9)

**Files:**
- Modify: `content/events/clans.json`

**Interfaces:**
- Consumes: clan mechanics on choices — `joinClanId`, `leaveReason` (`"amicable"`), `excludesIfClanId`, event gates `requiresNoClan`, `requiresClanId`, `requiresHuntedBy`. Joinable factions already used: ironhold, blacktide, arcanum, rust_priests (plus more exist in `factions.json` — use any of the 25).
- Produces: 18 clan events (was 9).

- [ ] **Step 1: Append 9 events**

**New ids:** `clan_oath_signing`, `clan_rivalry_patrol`, `clan_war_tribute`, `clan_poach_counter_offer`, `clan_elder_trial`, `clan_feast_rank`, `clan_hunted_duel`, `clan_solo_wanderer_blessing`, `clan_betrayal_aftermath`.

Worked example (join event — mirrors the existing `requiresNoClan` + `joinClanId` pattern):

```json
{
  "id": "clan_oath_signing",
  "minAge": 16,
  "maxAge": 99,
  "weight": 8,
  "requiresNoClan": true,
  "narrative": {
    "en": "A herald of the Bronzehammer clan finds you at {locationName}. 'The hammer falls for those who swear to it. Three coins of signing gold, a roof, and a name that opens doors — for an oath you can never take back.'",
    "es": "Un heraldo del clan Martillobronce te encuentra en {locationName}. 'El martillo cae por quienes le juran. Tres monedas de oro de entrada, un techo y un nombre que abre puertas — por un juramento que jamás se retracta.'"
  },
  "choices": [
    {
      "id": "swear_oath",
      "label": { "en": "Swear the oath and join Bronzehammer", "es": "Jurar el juramento y unirte a Martillobronce" },
      "tag": "Professional",
      "rarity": "uncommon",
      "joinClanId": "bronzehammer",
      "goldDelta": 60,
      "statDeltas": { "constitution": 1 },
      "countersDelta": { "clans_joined": 1 },
      "narrative": {
        "en": "The hammer strikes the anvil three times and the hall roars your name. You are Bronzehammer now — wealth 6, and a forge that never cools.",
        "es": "El martillo golpea el yunque tres veces y el salón ruge tu nombre. Sos Martillobronce ahora — riqueza 6, y una forja que nunca se enfría."
      }
    },
    {
      "id": "ask_for_more",
      "label": { "en": "Press for more signing gold", "es": "Exigir más oro de entrada" },
      "tag": "Cocky",
      "rarity": "volatile",
      "requiresStat": { "stat": "charisma", "min": 12 },
      "statDeltas": { "charisma": 1 },
      "liabilityDelta": 4,
      "narrative": {
        "en": "The herald's smile thins but the counter comes — smaller, and colder. The clan remembers who haggled at the door. They will collect the difference in loyalty, later.",
        "es": "La sonrisa del heraldo se afina pero llega la contraoferta — más pequeña, y más fría. El clan recuerda quién regateó en la puerta. Cobrarán la diferencia en lealtad, después."
      }
    },
    {
      "id": "stay_free",
      "label": { "en": "Thank them and stay free", "es": "Agradecer y seguir libre" },
      "tag": "Stoic",
      "rarity": "common",
      "statDeltas": { "intelligence": 1 },
      "narrative": {
        "en": "The herald bows. 'The road keeps its own,' they say, and the offer rides away. Freedom is its own kind of wealth — though it pays no stipend.",
        "es": "El heraldo se inclina. 'El camino conserva a los suyos', dice, y la oferta se aleja. La libertad es su propia clase de riqueza — aunque no paga estipendio."
      }
    }
  ]
}
```

Briefs for the other 8 (vary gates — at least one `requiresClanId` event, one `requiresHuntedBy`, one `leaveReason: "amicable"` on a choice, one `requiresNoClan`):

- `clan_rivalry_patrol` — `requiresClanId`; patrol contested border against a rival clan; choices: lead the patrol (Leader, +reputation own clan... use `reputationFaction` of the sworn clan, `battles_won`), negotiate the patrol (Humble, +charisma), volunteer for the night watch (Stoic, +constitution). Weight 7.
- `clan_war_tribute` — `requiresClanId`; the clan demands a tribute; choices: pay in gold (−gold 100, +reputation), pay in service (Supportive, +stamina −20, +reputation), argue against it (Cocky, requiresStat charisma 13, −reputation risk). Weight 6.
- `clan_poach_counter_offer` — `excludesIfClanId: "<current>"` — a rival clan poaches you; choices: hear the offer (Strategic), refuse loyalty (Professional, +reputation own clan), play both sides (Cocky, +liability, requiresStat charisma 13). Weight 6.
- `clan_elder_trial` — `requiresClanId`; the elders demand a trial of skill; choices: meet the challenge (Aggressive, requiresStat strength/dexterity 13, +reputation), solve it with wits (Strategic, requiresStat intelligence 13), bow out respectfully (Humble). Weight 6.
- `clan_feast_rank` — `requiresClanId`; feast seating reflects rank; choices: take the low seat (Humble, +charisma), claim your earned seat (Leader, +charisma +fame), toast the elders (Funny, +fame). Weight 5.
- `clan_hunted_duel` — `requiresHuntedBy: true`; an ambush by those hunting you; choices: duel the lead hunter (Aggressive, requiresStat strength 14, +fame, `battles_won`), lose them in the crowd (Strategic, requiresStat dexterity 13), surrender to the law (Professional, −reputation, +liability −small). Weight 5.
- `clan_solo_wanderer_blessing` — `requiresNoClan`; a wandering hermit blesses the free road; choices: accept the blessing (Humble, +charisma +health), ask for road wisdom (Strategic, +intelligence), decline politely (Stoic). Weight 5.
- `clan_betrayal_aftermath` — `requiresHuntedBy: true`; a clan you betrayed sends a formal denunciation; choices: face the accusation (Leader, requiresStat charisma 13, −reputation small), pay restitution (−gold 150, −liability), embrace the hunted life (Aggressive, +liability, +dexterity). Weight 6. (No `leaveReason` needed here — this is aftermath, not the leave itself.)

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/clans.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('clans', JSON.parse(require('fs').readFileSync('content/events/clans.json','utf8')).length);"
```

Expected: `registry OK`, clans **18**.

- [ ] **Step 3: Commit**

```bash
git add content/events/clans.json
git commit -m "content(events): double clan events to 18"
```

---

### Task 11: Expand `content/events/foreign.json` (+5)

**Files:**
- Modify: `content/events/foreign.json`

**Interfaces:**
- Consumes: every existing foreign event has `requiresForeign: true` (the character is abroad — `currentRegion !== homeRegion`). Keep that gate on all new events. `{npcRole}`, `{npcName}`, `{locationName}`, `{regionVariant}` available (regionVariant exists after Task 2).
- Produces: 10 foreign events (was 5).

- [ ] **Step 1: Append 5 events**

**New ids:** `foreign_local_champion_challenge`, `foreign_strange_customs`, `foreign_merchant_discount`, `foreign_ship_captain_berth`, `foreign_home_festival`.

Worked example:

```json
{
  "id": "foreign_local_champion_challenge",
  "minAge": 16,
  "maxAge": 99,
  "weight": 7,
  "requiresForeign": true,
  "narrative": {
    "en": "At {regionVariant}, a local champion spots your foreign blade and grins. 'A name for the arena, outlander! Beat me and the crowd forgets you're not from here — lose, and they'll never let you forget.'",
    "es": "En {regionVariant}, una campeona local ve tu hoja forastera y sonríe. '¡Un nombre para la arena, forastera! Ganame y la multitud olvida que no sos de aquí — perdé, y jamás te dejarán olvidarlo.'"
  },
  "choices": [
    {
      "id": "accept_challenge",
      "label": { "en": "Accept the challenge", "es": "Aceptar el desafío" },
      "tag": "Aggressive",
      "rarity": "rare",
      "requiresStat": { "stat": "strength", "min": 13 },
      "statDeltas": { "strength": 2 },
      "fameDelta": 4,
      "reputationDelta": 2,
      "reputationFaction": "greywater",
      "countersDelta": { "battles_won": 1 },
      "injuryRiskDelta": 0.15,
      "narrative": {
        "en": "The crowd's roar is a wall of sound. When the champion yields, they chant your name — foreign syllables and all. For one night, the outsider is a hero here.",
        "es": "El rugido de la multitud es un muro de sonido. Cuando la campeona cede, corean tu nombre — sílabas forasteras incluidas. Por una noche, la outsider es una héroe aquí."
      }
    },
    {
      "id": "buy_them_a_drink",
      "label": { "en": "Buy the champion a drink instead", "es": "Invitarle una bebida a la campeona" },
      "tag": "Funny",
      "rarity": "uncommon",
      "goldDelta": -20,
      "statDeltas": { "charisma": 2 },
      "fameDelta": 1,
      "narrative": {
        "en": "The champion laughs and claps your shoulder. 'Smart, for an outsider.' By the second round they're telling you which nobles to avoid — and the arena forgets your accent.",
        "es": "La campeona ríe y te palmea el hombro. 'Lista, para ser forastera.' Para la segunda ronda ya te está contando qué nobles evitar — y la arena olvida tu acento."
      }
    },
    {
      "id": "decline_gracefully",
      "label": { "en": "Decline and stay unknown", "es": "Declinar y seguir siendo desconocida" },
      "tag": "Stoic",
      "rarity": "common",
      "statDeltas": { "intelligence": 1 },
      "narrative": {
        "en": "You bow and step back into the crowd. Some fights buy glory; some silence buys peace. The champion shrugs and finds another name to chase.",
        "es": "Hacés una reverencia y volvés a fundirte en la multitud. Algunas peleas compran gloria; algunas, el silencio compra paz. La campeona se encoge de hombros y busca otro nombre que perseguir."
      }
    }
  ]
}
```

Briefs for the other 4 (all `requiresForeign: true`):

- `foreign_strange_customs` — you offend a local custom without knowing; choices: apologize sincerely (Humble, requiresStat charisma 12, +charisma +reputation), pay the customary fine (Professional, −gold), double down on your own customs (Cocky, −reputation, +fame small). Weight 6.
- `foreign_merchant_discount` — a merchant marks up prices for outsiders; choices: haggle hard (Cocky, requiresStat charisma 12, −gold 40 → +gold 40 net positive... keep simple: −gold small, +gold bigger), pay the outsider tax (Professional, −gold), trade a story for the difference (Funny, +charisma). Weight 6.
- `foreign_ship_captain_berth` — a captain offers a berth home at a price; choices: take the berth (Professional, −gold 60, +stamina 20, region-shift flavor), work the passage (Supportive, +stamina −15, +constitution), stay ashore (Stoic). Weight 5.
- `foreign_home_festival` — news of your home region's festival reaches you (requiresHomeRegion false here — you're abroad); choices: toast home from afar (Humble, +charisma, +fame), teach locals your festival (Funny, +fame, +reputation), mourn quietly (Stoic, +intelligence). Weight 5.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/foreign.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('foreign', JSON.parse(require('fs').readFileSync('content/events/foreign.json','utf8')).length);"
```

Expected: `registry OK`, foreign **10**.

- [ ] **Step 3: Commit**

```bash
git add content/events/foreign.json
git commit -m "content(events): double foreign events to 10"
```

---

### Task 12: Expand `content/events/personality.json` (+5)

**Files:**
- Modify: `content/events/personality.json`

**Interfaces:**
- Consumes: existing personality events use `wantedTags`/`punishedTags` on choices (synergy bonuses via `computeTagSynergy`) and `requiresTags` on events. Reuse the same mechanism — it needs no engine change.
- Produces: 10 personality events (was 5).

- [ ] **Step 1: Append 5 events**

**New ids:** `personality_trial_by_choice`, `personality_mentor_test`, `personality_crowd_judgment`, `personality_old_enemy_truce`, `personality_legacy_question`.

Worked example (note the `wantedTags`/`punishedTags` blocks — matching the player's accumulated personality tags multiplies the choice's stat gains):

```json
{
  "id": "personality_trial_by_choice",
  "minAge": 16,
  "maxAge": 99,
  "weight": 7,
  "narrative": {
    "en": "A {npcRole} blocks your path and drops a heavy pouch between you. 'Two roads, stranger. This pouch holds a season's wages — and behind me, a stranger who needs it more. The road you take tells me everything about you.'",
    "es": "Un {npcRole} te corta el paso y deja una bolsa pesada entre ustedes. 'Dos caminos, forastera. Esta bolsa tiene el salario de una temporada — y detrás de mí, una desconocida que lo necesita más. El camino que tomes me lo dice todo sobre vos.'"
  },
  "choices": [
    {
      "id": "take_the_pouch",
      "label": { "en": "Take the pouch", "es": "Quedarte con la bolsa" },
      "tag": "Aggressive",
      "rarity": "volatile",
      "wantedTags": { "Cocky": 0.1, "Aggressive": 0.08 },
      "punishedTags": { "Humble": -0.1 },
      "goldDelta": 100,
      "liabilityDelta": 8,
      "statDeltas": { "strength": 2 },
      "narrative": {
        "en": "The pouch is heavy and yours. The {npcRole} watches you go without a word — but the road behind you is suddenly full of eyes that have learned your measure.",
        "es": "La bolsa es pesada y es tuya. El {npcRole} te ve partir sin decir palabra — pero el camino detrás de vos se llena de ojos que aprendieron tu medida."
      }
    },
    {
      "id": "leave_the_pouch",
      "label": { "en": "Leave it for the stranger", "es": "Dejársela a la desconocida" },
      "tag": "Humble",
      "rarity": "rare",
      "wantedTags": { "Humble": 0.12, "Supportive": 0.08 },
      "punishedTags": { "Cocky": -0.08 },
      "goldDelta": -100,
      "statDeltas": { "charisma": 3 },
      "fameDelta": 3,
      "countersDelta": { "lives_saved": 1 },
      "narrative": {
        "en": "You set the pouch down and walk on. Behind you, a choked voice thanks the road itself. The {npcRole} bows — 'The world has few enough of your kind, and I will speak your name where it matters.'",
        "es": "Dejás la bolsa y seguís camino. Detrás de vos, una voz ahogada le agradece al camino mismo. El {npcRole} se inclina — 'El mundo tiene pocas de tu clase, y hablaré tu nombre donde importa.'"
      }
    },
    {
      "id": "split_the_difference",
      "label": { "en": "Offer the stranger half", "es": "Ofrecerle la mitad a la desconocida" },
      "tag": "Strategic",
      "rarity": "uncommon",
      "wantedTags": { "Strategic": 0.1 },
      "goldDelta": 50,
      "statDeltas": { "intelligence": 2 },
      "narrative": {
        "en": "You split the pouch — half for the road's luck, half for the stranger's need. The {npcRole} studies you like a riddle with an answer they didn't expect.",
        "es": "Partís la bolsa — mitad para la suerte del camino, mitad para la necesidad de la desconocida. El {npcRole} te estudia como un acertijo con una respuesta que no esperaba."
      }
    }
  ]
}
```

Briefs for the other 4 (every choice needs `wantedTags` and/or `punishedTags`):

- `personality_mentor_test` — an old mentor tests whether fame changed you; choices: answer with humility (Humble, wantedTags Humble +0.1), answer with pride (Cocky, wantedTags Cocky), answer with honesty (Stoic, wantedTags Stoic). Weight 6.
- `personality_crowd_judgment` — a crowd asks you to prove your reputation; choices: act the legend (Leader, wantedTags Leader/Confident), deflect with humor (Funny), stay silent (Stoic). Weight 6.
- `personality_old_enemy_truce` — an old enemy offers peace; choices: take the truce (Professional, wantedTags Professional/Strategic), forgive loudly (Supportive), keep the feud (Aggressive, wantedTags Aggressive). Weight 5.
- `personality_legacy_question` — a child asks what you'll be remembered for; choices: the battles (Aggressive/Confident), the people saved (Supportive/Humble), the story itself (Funny/Leader). Weight 5.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/personality.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('personality', JSON.parse(require('fs').readFileSync('content/events/personality.json','utf8')).length);"
```

Expected: `registry OK`, personality **10**.

- [ ] **Step 3: Commit**

```bash
git add content/events/personality.json
git commit -m "content(events): double personality events to 10"
```

---

### Task 13: Expand `content/events/regions.json` (+6)

**Files:**
- Modify: `content/events/regions.json`

**Interfaces:**
- Consumes: every existing entry gates on `requiresRegion` (one of vale, coast, highlands, wasteland, capital, isles — verify the exact strings used in the file and reuse them) and interpolates `{regionVariant}` (now 12 entries after Task 2). All six regions must stay covered.
- Produces: 12 region events (was 6), at least one new event per region.

- [ ] **Step 1: Append 6 events (one per region)**

**New ids:** `region_vale_flood`, `region_coast_pirate_raid`, `region_highlands_avalanche`, `region_wastelands_artifact`, `region_capital_festival`, `region_isles_tide_temple`.

Worked example (follow the existing `requiresRegion` pattern from the file):

```json
{
  "id": "region_vale_flood",
  "minAge": 16,
  "maxAge": 99,
  "weight": 7,
  "requiresRegion": "vale",
  "narrative": {
    "en": "Spring melts the snows early and the river forgets its banks. At {regionVariant}, the water is already lapping at the mill doors, and a {npcRole} calls for every able hand.",
    "es": "La primavera derrite las nieves temprano y el río olvida sus orillas. En {regionVariant}, el agua ya lame las puertas del molino, y un {npcRole} pide todas las manos disponibles."
  },
  "choices": [
    {
      "id": "sandbag_line",
      "label": { "en": "Join the sandbag line", "es": "Sumarte a la cadena de sacos de arena" },
      "tag": "Supportive",
      "rarity": "uncommon",
      "staminaDelta": -20,
      "statDeltas": { "constitution": 2 },
      "reputationDelta": 3,
      "reputationFaction": "greywater",
      "countersDelta": { "lives_saved": 1 },
      "narrative": {
        "en": "Mud to the elbows, backs against the water — and the mill holds. The village elder presses a token of the Vale's gratitude into your palm.",
        "es": "Barro hasta los codos, espaldas contra el agua — y el molino aguanta. El anciano de la aldea te mete un símbolo del agradecimiento del Valle en la palma."
      }
    },
    {
      "id": "ferry_people",
      "label": { "en": "Ferry the stranded to high ground", "es": "Llevar a los varados a terreno alto" },
      "tag": "Leader",
      "rarity": "rare",
      "requiresStat": { "stat": "strength", "min": 12 },
      "staminaDelta": -25,
      "statDeltas": { "strength": 2 },
      "fameDelta": 3,
      "reputationDelta": 2,
      "reputationFaction": "greywater",
      "narrative": {
        "en": "Boat after boat, until the last child is dry. The Vale will tell this story at every flood to come — and your name rides on the telling.",
        "es": "Bote tras bote, hasta que el último niño está a salvo. El Valle contará esta historia en cada inundación futura — y tu nombre cabalga en el relato."
      }
    },
    {
      "id": "save_your_own",
      "label": { "en": "Secure your own gear and keep dry", "es": "Asegurar tu propio equipo y quedarte seco" },
      "tag": "Stoic",
      "rarity": "common",
      "statDeltas": { "intelligence": 1 },
      "narrative": {
        "en": "You watch the flood from the ridge, dry and wise. The village remembers those who helped — and quietly, those who didn't.",
        "es": "Mirás la inundación desde la cresta, seco y sabio. La aldea recuerda a quienes ayudaron — y en silencio, a quienes no."
      }
    }
  ]
}
```

Briefs for the other 5 (one per region; keep `requiresRegion` values consistent with the file's existing usage — check the file first):

- `region_coast_pirate_raid` (`requiresRegion: "coast"`) — pirates raid the docks; choices: fight them off (Aggressive, requiresStat strength 13, `battles_won`), hide the merchants' goods (Strategic, requiresStat dexterity 12), sound the alarm and rally (Leader, requiresStat charisma 12). Weight 7.
- `region_highlands_avalanche` (`requiresRegion: "highlands"`) — an avalanche buries a pass; choices: dig for survivors (Supportive, +lives_saved, +constitution), take the long route (Strategic, +stamina −15, +intelligence), ski the debris field (Aggressive, requiresStat dexterity 14). Weight 6.
- `region_wastelands_artifact` (`requiresRegion: "wastelands"` — verify exact string, the file may use "wasteland") — a cinder-scorched artifact half-buried; choices: pry it free (Cocky, +gold, +liability small), study it safely (Strategic, requiresStat intelligence 12, +intelligence), leave it to the ash (Stoic). Weight 6.
- `region_capital_festival` (`requiresRegion: "capital"`) — the capital's grand festival; choices: join the parade (Funny, +fame), network in the grandstands (Strategic, +reputation golden_lotus), watch from a tavern (Stoic, +stamina). Weight 7.
- `region_isles_tide_temple` (`requiresRegion: "isles"`) — a tide temple opens at low water; choices: explore the sunken aisle (Strategic, requiresStat intelligence 12, +gold +intelligence), guard the entrance for the faithful (Supportive, +reputation ivy_circle), pray at the altar (Humble, +health +charisma). Weight 6.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/regions.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "const e=JSON.parse(require('fs').readFileSync('content/events/regions.json','utf8')); console.log('regions', e.length, new Set(e.map(x=>x.requiresRegion)));"
```

Expected: `registry OK`, regions **12**, all six region ids present in the Set.

- [ ] **Step 3: Commit**

```bash
git add content/events/regions.json
git commit -m "content(events): double region events to 12, all six regions covered"
```

---

### Task 14: Expand `content/events/destiny.json` (+3)

**Files:**
- Modify: `content/events/destiny.json`

**Interfaces:**
- Consumes: `type: "destiny"` events; choices may carry `unlocksEventPool` / `locksEventPool` with unique pool-name strings (never collide with existing `destiny_human_path`, `destiny_immortal_path`, `destiny_chosen_path` — new pool names must be distinct). `minAge`/`maxAge` windows are narrower (20-70).
- Produces: 6 destiny events (was 3).

- [ ] **Step 1: Append 3 events**

**New ids:** `destiny_witchs_gift`, `destiny_ancestral_blade`, `destiny_faerie_bargain`.

Worked example (destiny events give large permanent deltas — up to +8 flat stat or run-defining effects — and each destiny choice's `unlocksEventPool`/`locksEventPool` must be a NEW pool name if used):

```json
{
  "id": "destiny_witchs_gift",
  "type": "destiny",
  "minAge": 24,
  "maxAge": 65,
  "weight": 3,
  "narrative": {
    "en": "Deep in the {slot:worldLocation}, a witch older than the forest offers a single gift: 'Eyes that see through any lie, or a hand that never misses, or a name the spirits will answer. Choose one. The other two will forget you forever — and one of them will have been the safer road.'",
    "es": "En lo profundo de {slot:worldLocation}, una bruja más vieja que el bosque ofrece un único regalo: 'Ojos que ven a través de cualquier mentira, o una mano que nunca falla, o un nombre al que responderán los espíritus. Elegí uno. Los otros dos te olvidarán para siempre — y uno de ellos habrá sido el camino más seguro.'"
  },
  "choices": [
    {
      "id": "take_true_sight",
      "label": { "en": "Take the eyes that see through lies", "es": "Tomar los ojos que ven a través de las mentiras" },
      "tag": "Strategic",
      "rarity": "rare",
      "statDeltas": { "intelligence": 8 },
      "narrative": {
        "en": "The world sharpens until every falsehood glints like a loose thread. You will never be fooled again — but the truth is a heavy thing to carry daily.",
        "es": "El mundo se afila hasta que cada falsedad brilla como un hilo suelto. Nunca más te engañarán — pero la verdad es una carga pesada para llevar a diario."
      }
    },
    {
      "id": "take_steady_hand",
      "label": { "en": "Take the hand that never misses", "es": "Tomar la mano que nunca falla" },
      "tag": "Aggressive",
      "rarity": "rare",
      "statDeltas": { "dexterity": 8 },
      "narrative": {
        "en": "Every throw, every strike, every caught coin lands true. The world is suddenly full of marks — and the witch watches you test your new gift with a knowing smile.",
        "es": "Cada lanzamiento, cada golpe, cada moneda atrapada cae exacta. El mundo se llena de blancos de repente — y la bruja te observa probar tu nuevo don con una sonrisa sabia."
      }
    },
    {
      "id": "take_spirit_name",
      "label": { "en": "Take the name the spirits answer", "es": "Tomar el nombre al que responden los espíritus" },
      "tag": "Humble",
      "rarity": "rare",
      "statDeltas": { "charisma": 6, "intelligence": 2 },
      "unlocksEventPool": ["destiny_spirit_path"],
      "narrative": {
        "en": "The witch whispers your new name and the forest goes still, listening. Doors of the unseen will open for you now — though the spirits will also know where to find you.",
        "es": "La bruja susurra tu nuevo nombre y el bosque se queda quieto, escuchando. Las puertas de lo invisible se abrirán para vos — aunque los espíritus también sabrán dónde encontrarte."
      }
    }
  ]
}
```

Briefs for the other 2 (destiny-tier deltas, distinct new pool names if used):

- `destiny_ancestral_blade` (`minAge` 20, `maxAge` 55) — an ancestor's cursed-but-mighty blade calls to you; choices: draw it (Aggressive, `strength` +6 `constitution` +2, `locksEventPool: ["destiny_spirit_path"]` if taken — pick a NEW name), bind it to the earth (Humble, `charisma` +2, +health), sell the rumor to the highest bidder (Cocky, +gold 300, +liability). Weight 3.
- `destiny_faerie_bargain` (`minAge` 26, `maxAge` 60) — a faerie offers fortune for a future promise; choices: accept the bargain (Cocky, +gold 500, +liability 10, `unlocksEventPool: ["destiny_faerie_path"]` — NEW pool name), refuse the word-twister (Strategic, +intelligence 4), offer a different deal (Humble, requiresStat charisma 14, +charisma 4). Weight 3.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/destiny.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('destiny', JSON.parse(require('fs').readFileSync('content/events/destiny.json','utf8')).length);"
```

Expected: `registry OK`, destiny **6**.

- [ ] **Step 3: Commit**

```bash
git add content/events/destiny.json
git commit -m "content(events): double destiny events to 6"
```

---

### Task 15: Expand `content/events/world.json` (+10)

**Files:**
- Modify: `content/events/world.json`

**Interfaces:**
- Consumes: every entry has `type: "world"`, a `worldEventHeadline` (LocaleMap — may interpolate `{slot:worldLocation}` / `{slot:guildName}`), a narrative, and a SINGLE `acknowledge` choice (`rarity: "common"`, label "The world moves on" / "El mundo sigue" with its own narrative). No stat/gold deltas — world events are flavor with ambient weight.
- Produces: 20 world events (was 10).

- [ ] **Step 1: Append 10 events**

**New ids:** `world_comet`, `world_drought`, `world_refugee_caravan`, `world_crown_heir`, `world_dragon_sighting`, `world_plague_cure`, `world_guild_war`, `world_border_dispute`, `world_starfall`, `world_bridge_collapse`.

Worked example (exact shape — one choice, headline, `{slot:...}` placeholders only from the 7 existing pools):

```json
{
  "id": "world_comet",
  "type": "world",
  "minAge": 16,
  "maxAge": 99,
  "weight": 4,
  "narrative": {
    "en": "A green comet claws across the sky, visible for a week. Augurs argue its meaning; farmers plant by it; the superstitious bolt their doors. The world holds its breath.",
    "es": "Un cometa verde araña el cielo, visible durante una semana. Los augures discuten su significado; los granjeros siembran según él; los supersticiosos atrancan sus puertas. El mundo contiene la respiración."
  },
  "worldEventHeadline": {
    "en": "Comet Divides the Seers",
    "es": "Un Cometa Divide a los Videntes"
  },
  "choices": [
    {
      "id": "acknowledge",
      "rarity": "common",
      "label": {
        "en": "The world moves on",
        "es": "El mundo sigue"
      },
      "narrative": {
        "en": "Whatever it means, the sky does not wait for interpretation.",
        "es": "Sea lo que sea que signifique, el cielo no espera interpretaciones."
      }
    }
  ]
}
```

Author the other 9 with the identical single-choice shape (headline + narrative + acknowledge choice; vary `weight` 2-5; use `{slot:worldLocation}`/`{slot:guildName}` in at least 5 of them):

- `world_drought` — a three-year drought cracks the heartland; headline "Drought Grips the Heartland".
- `world_refugee_caravan` — a caravan of refugees from a fallen town; headline "Refugees Flood the Roads".
- `world_crown_heir` — the crown heir is born; headline "Heir Born to the Throne".
- `world_dragon_sighting` — `{slot:worldLocation}` dragon sighting; headline "Dragon Sighted over {slot:worldLocation}".
- `world_plague_cure` — a healer claims a plague cure; headline "Cure Claimed for the Plague".
- `world_guild_war` — `{slot:guildName}` and `{slot:guildName}` at war (note: two different slots pull two different entries — fine); headline "Guild War Erupts".
- `world_border_dispute` — two kingdoms bicker over a border pass; headline "Border Dispute Turns Hot".
- `world_starfall` — a star falls into `{slot:worldLocation}`; headline "Star Falls in {slot:worldLocation}".
- `world_bridge_collapse` — the great bridge collapses; headline "Great Bridge Collapses".

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/events/world.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "const w=JSON.parse(require('fs').readFileSync('content/events/world.json','utf8')); console.log('world', w.length, 'all-world-type:', w.every(x=>x.type==='world'));"
```

Expected: `registry OK`, world **20**, all `type: "world"`.

- [ ] **Step 3: Commit**

```bash
git add content/events/world.json
git commit -m "content(events): double world events to 20"
```

---

### Task 16: Expand `content/minigames/activities.json` (+16)

**Files:**
- Modify: `content/minigames/activities.json`

**Interfaces:**
- Consumes: the four classic resolution subtypes already authored in this file: `weighted_hidden_match` (4 cards, `baseWinChance` 0.4-0.45, `statInfluence`, `cardModifiers`), `timing_bar` (3 cards, `statThreshold`), `grid_gamble` (4 cards, `statInfluence: {}`, pure luck), `memory_match` (3 cards, `statThreshold`, `bonusLives`). Existing subtypes to extend: heist, drinking, chase, gambling, survival, court, smithing, archery, timing_bar, grid_gamble, fishing, memory_match, hunting.
- Produces: 32 activity minigames (was 16) — cover new subtypes too where natural, but NEVER create a new `resolution.type` (only the 5 in `MinigameSubtype`).

- [ ] **Step 1: Append 16 minigames**

**New ids (subtype in parens):** `treasure_hunt_map` (hunting), `wrestling_ring` (brawl-flavor → use `weighted_hidden_match` with subtype `brawl` — subtype is free-form string, keep consistent with duels.json's `brawl`), `thieves_market` (heist), `keg_race` (timing_bar), `card_shark_showdown` (gambling), `poison_tasting` (grid_gamble), `eagle_eye` (archery), `bridge_builder` (smithing), `royal_audience` (court), `desert_survival` (survival), `night_chase` (chase), `bard_duel_song` (court), `mushroom_foraging` (memory_match), `river_race` (timing_bar), `lockpicking_contest` (heist), `feast_of_strength` (drinking).

Worked example (grid_gamble — the pure-luck subtype; note `statInfluence: {}` and the `winChanceDelta: 0` safety card):

```json
{
  "id": "poison_tasting",
  "type": "minigame",
  "subtype": "grid_gamble",
  "minAge": 18,
  "maxAge": 99,
  "weight": 5,
  "primaryStat": "constitution",
  "narrative": {
    "en": "The feast master presents nine identical goblets. Three hold sweet wine; the rest hold something that bites. 'A toast to the guest of honor,' he says, sliding one toward you. 'Pick your cup — or the evening picks for you.'",
    "es": "El maestro de la fiesta presenta nueve copas idénticas. Tres contienen vino dulce; el resto, algo que muerde. 'Un brindis por la invitada de honor', dice, deslizando una hacia vos. 'Elegí tu copa — o que la noche elija por vos.'"
  },
  "cards": [
    {
      "id": "first_three",
      "icon": "hand",
      "label": { "en": "Take from the first three", "es": "Tomar de las tres primeras" }
    },
    {
      "id": "middle_row",
      "icon": "circle",
      "label": { "en": "Reach for the middle row", "es": "Alcanzar la fila del medio" }
    },
    {
      "id": "hosts_choice",
      "icon": "crown",
      "label": { "en": "Take the host's own cup", "es": "Tomar la copa del propio anfitrión" }
    },
    {
      "id": "decline_toast",
      "icon": "door-open",
      "label": { "en": "Politely decline the toast", "es": "Declinar el brindis con cortesía" }
    }
  ],
  "resolution": {
    "type": "grid_gamble",
    "baseWinChance": 0.33,
    "statInfluence": {},
    "cardModifiers": {
      "decline_toast": {
        "winChanceDelta": 0
      }
    }
  },
  "outcomes": {
    "critical": {
      "goldDelta": 350,
      "fameDelta": 6,
      "reputationDelta": 3,
      "reputationFaction": "golden_lotus",
      "countersDelta": { "gambles_won": 1 },
      "narrative": {
        "en": "Sweet wine, every drop. The feast master's smile freezes — then he bows. 'The fates favor bold guests.' A purse appears beside your cup, and the hall drinks to your nerve.",
        "es": "Vino dulce, hasta la última gota. La sonrisa del maestro de la fiesta se congela — luego se inclina. 'Los hados favorecen a los invitados audaces.' Una bolsa aparece junto a tu copa, y el salón brinda por tu coraje."
      }
    },
    "success": {
      "goldDelta": 120,
      "countersDelta": { "gambles_won": 1 },
      "narrative": {
        "en": "Your cup holds wine — thin, but drinkable. The feast master nods once, disappointed you survived his joke. You pocket the small prize.",
        "es": "Tu copa tiene vino — flojo, pero bebible. El maestro de la fiesta asiente una vez, decepcionado de que sobrevivieras a su broma. Guardás el premio pequeño."
      }
    },
    "partial": {
      "goldDelta": 20,
      "narrative": {
        "en": "The wine is vinegar-sweet and your throat burns politely. A consolation coin lands on the table with a sound like pity.",
        "es": "El vino es agridulce y tu garganta arde con cortesía. Una moneda de consolación aterriza en la mesa con un sonido parecido a la lástima."
      }
    },
    "fail": {
      "goldDelta": -60,
      "fameDelta": -2,
      "liabilityDelta": 5,
      "narrative": {
        "en": "Something bites, and hard. The hall's laughter rings in your ears as you're helped — gently, but publicly — to a chair. The feast master files your face away for next season.",
        "es": "Algo muerde, y fuerte. La risa del salón resuena en tus oídos mientras te ayudan — con suavidad, pero en público — a llegar a una silla. El maestro de la fiesta archiva tu cara para la próxima temporada."
      }
    }
  }
}
```

Author the other 15 following the same structure, choosing the right subtype per the list above, with these rules: `weighted_hidden_match` gets 4 cards + `cardModifiers` on 1-2; `timing_bar` gets 3 cards + `statThreshold: 20`; `memory_match` gets 3 cards + `statThreshold: 20` + `bonusLives: 1`; `grid_gamble` gets 4 cards + `statInfluence: {}` + a `winChanceDelta: 0` safety card. Counters: use the existing activity counters (`hunts_won`, `heists_won`, `drinks_won`, `gambles_won`, `chases_won`, `courtly_won`, `smithing_won`, `archery_won`, `survivals_won`, `fishing_won`, `alchemy_won`, `battles_won`) — do not invent new counter names.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/minigames/activities.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('activities', JSON.parse(require('fs').readFileSync('content/minigames/activities.json','utf8')).length);"
```

Expected: `registry OK`, activities **32**.

- [ ] **Step 3: Commit**

```bash
git add content/minigames/activities.json
git commit -m "content(minigames): double activities to 32"
```

---

### Task 17: Expand `content/minigames/duels.json` (+9)

**Files:**
- Modify: `content/minigames/duels.json`

**Interfaces:**
- Consumes: existing subtypes in the file: `duel_strike`, `negotiation`, `brawl`, `arcane_duel`, `street_fight`, `tournament`. All are `weighted_hidden_match` resolution with 3-4 cards. `counter` names in the file: `duels_won`, `negotiations_won`, `brawls_won`, `arcane_duels_won`, `street_fights_won`, `tournaments_won` (verify against the file and reuse).
- Produces: 18 duel minigames (was 9).

- [ ] **Step 1: Append 9 minigames**

**New ids (subtype in parens):** `duel_parade_of_blades` (duel_strike), `duel_frozen_pact` (negotiation), `brawl_dockyard` (brawl), `arcane_duel_mirror` (arcane_duel), `street_fight_alley` (street_fight), `duel_mountain_pass` (duel_strike), `negotiation_ransom` (negotiation), `brawl_harvest_squabble` (brawl), `tournament_qualifiers` (tournament).

Worked example (duel_strike — mirrors the existing `duel_strike` entries):

```json
{
  "id": "duel_parade_of_blades",
  "type": "minigame",
  "subtype": "duel_strike",
  "minAge": 16,
  "maxAge": 99,
  "weight": 7,
  "primaryStat": "strength",
  "narrative": {
    "en": "The parade halts and the champion of {locationName} plants a banner in the mud before you. 'A duel for the right of way, stranger. Blade to blade, no tricks — only steel and nerve.'",
    "es": "El desfile se detiene y la campeona de {locationName} clava un estandarte en el barro frente a vos. 'Un duelo por el derecho de paso, forastera. Hoja contra hoja, sin trucos — solo acero y coraje.'"
  },
  "cards": [
    {
      "id": "open_high",
      "icon": "sword",
      "label": { "en": "Open high and press hard", "es": "Abrir en alto y presionar fuerte" }
    },
    {
      "id": "feint_low",
      "icon": "wind",
      "label": { "en": "Feint low, strike high", "es": "Amagar bajo, golpear alto" }
    },
    {
      "id": "wait_for_open",
      "icon": "eye",
      "label": { "en": "Let them tire themselves", "es": "Dejar que se cansen solos" }
    },
    {
      "id": "banner_throw",
      "icon": "zap",
      "label": { "en": "Throw the banner to break their focus", "es": "Arrojar el estandarte para quebrar su concentración" }
    }
  ],
  "resolution": {
    "type": "weighted_hidden_match",
    "baseWinChance": 0.42,
    "statInfluence": {
      "strength": 0.012,
      "dexterity": 0.005
    },
    "cardModifiers": {
      "feint_low": {
        "winChanceDelta": 0.08,
        "critChanceDelta": 0.04
      }
    }
  },
  "outcomes": {
    "critical": {
      "statDeltas": { "strength": 2, "dexterity": 1 },
      "fameDelta": 6,
      "goldDelta": 160,
      "reputationDelta": 3,
      "reputationFaction": "crownguard",
      "countersDelta": { "duels_won": 1, "battles_won": 1 },
      "narrative": {
        "en": "Their banner falls and so does their guard. The crowd roars your name as the champion yields, first blood to you. The parade parts like a door — and you walk through it a legend.",
        "es": "Su estandarte cae y también su guardia. La multitud ruge tu nombre mientras la campeona se rinde, primera sangre para vos. El desfile se abre como una puerta — y la cruzás siendo una leyenda."
      }
    },
    "success": {
      "statDeltas": { "strength": 1 },
      "fameDelta": 3,
      "goldDelta": 60,
      "reputationDelta": 1,
      "reputationFaction": "crownguard",
      "countersDelta": { "duels_won": 1, "battles_won": 1 },
      "narrative": {
        "en": "You take the exchange on points and the champion yields with a grunt of respect. The right of way is yours — a clean duel, a fair win.",
        "es": "Ganás el intercambio por puntos y la campeona se rinde con un gruñido de respeto. El derecho de paso es tuyo — un duelo limpio, una victoria justa."
      }
    },
    "partial": {
      "goldDelta": 15,
      "injuryRiskDelta": 0.08,
      "countersReset": ["duel_streak"],
      "narrative": {
        "en": "A drawn duel, called by the marshals as the light fails. You keep your pride and split the stakes — but the crowd wanted a winner.",
        "es": "Un duelo empatado, detenido por los jueces cuando falla la luz. Conservás el orgullo y dividís las apuestas — pero la multitud quería una ganadora."
      }
    },
    "fail": {
      "goldDelta": -40,
      "fameDelta": -2,
      "reputationDelta": -2,
      "reputationFaction": "crownguard",
      "injuryRiskDelta": 0.15,
      "countersReset": ["duel_streak"],
      "narrative": {
        "en": "Their blade finds the gap you swore was closed. You hit the mud and the parade steps over you. The champion offers a hand up — and the crowd files your loss away with your name.",
        "es": "Su hoja encuentra el hueco que juraste cerrado. Caés al barro y el desfile pasa por encima de vos. La campeona te ofrece la mano para levantarte — y la multitud archiva tu derrota junto a tu nombre."
      }
    }
  }
}
```

Author the other 8 per the subtype list, reusing the file's counter names (verify exact strings first) and mirroring the negotiation/brawl/arcane_duel/street_fight/tournament shapes already in the file. Keep `duel_streak`, `brawl_streak`, etc. as the `countersReset` values the file already uses.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/minigames/duels.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "console.log('duels', JSON.parse(require('fs').readFileSync('content/minigames/duels.json','utf8')).length);"
```

Expected: `registry OK`, duels **18**.

- [ ] **Step 3: Commit**

```bash
git add content/minigames/duels.json
git commit -m "content(minigames): double duels to 18"
```

---

### Task 18: Expand `content/minigames/elections.json` (+6) and `content/minigames/debates.json` (+1)

**Files:**
- Modify: `content/minigames/elections.json`, `content/minigames/debates.json`

**Interfaces:**
- Consumes: the capstone pattern — every entry has `isCapstone: true`, `capstoneKind` (`"election"` | `"debate"`), 3 cards (exactly one `trap: true`), `weighted_hidden_match` resolution, and each outcome tier carries `verdict` (`GREAT +3`/`GOOD +1`/`MIXED 0`/`BAD −4`) + matching `gradeDelta` (3/1/0/−4). Cards may use `wantedTags`/`punishedTags` (see the debate card shape in `debates.json`).
- Produces: 12 elections + 2 debates.

- [ ] **Step 1: Append 6 election entries + 1 debate entry**

**New election ids:** `election_fishing_rights`, `election_sanction_reform`, `election_war_veterans`, `election_bridge_toll`, `election_harvest_lands`, `election_cleric_choir`.
**New debate id:** `debate_old_versus_new`.

Worked example (election — copy the existing election shape exactly, including `verdict`/`gradeDelta` on all four tiers):

```json
{
  "id": "election_fishing_rights",
  "type": "minigame",
  "subtype": "election",
  "minAge": 16,
  "maxAge": 99,
  "weight": 8,
  "isCapstone": true,
  "capstoneKind": "election",
  "primaryStat": "charisma",
  "narrative": {
    "en": "The coast towns are at each other's throats over the season's fishing rights, and the council wants a name to settle it. Every claimant has a fleet behind them — but one of these fleets sails under a flag that isn't theirs.",
    "es": "Los pueblos de la costa están a matarse por los derechos de pesca de la temporada, y el consejo quiere un nombre que lo resuelva. Cada pretendiente tiene una flota detrás — pero una de esas flotas navega bajo una bandera que no es suya."
  },
  "cards": [
    {
      "id": "rights_old_family",
      "icon": "anchor",
      "trap": true,
      "label": { "en": "Back the old family's claim", "es": "Respaldar el reclamo de la vieja familia" }
    },
    {
      "id": "rights_captains",
      "icon": "sailboat",
      "label": { "en": "Back the captains' guild", "es": "Respaldar al gremio de capitanes" }
    },
    {
      "id": "rights_commons",
      "icon": "fish",
      "label": { "en": "Open the waters to the commons", "es": "Abrir las aguas a la gente común" }
    }
  ],
  "resolution": {
    "type": "weighted_hidden_match",
    "baseWinChance": 0.42,
    "statInfluence": {
      "charisma": 0.012,
      "intelligence": 0.004
    },
    "cardModifiers": {
      "rights_captains": {
        "winChanceDelta": 0.05
      },
      "rights_commons": {
        "winChanceDelta": 0.1
      }
    }
  },
  "outcomes": {
    "critical": {
      "statDeltas": { "charisma": 2 },
      "fameDelta": 6,
      "reputationDelta": 3,
      "verdict": { "en": "GREAT +3", "es": "GRAN +3" },
      "gradeDelta": 3,
      "narrative": {
        "en": "The waters open and the season's catch is the fattest in a generation. Every coast town toasts the name that settled it — yours — and the fleets sail in your honor.",
        "es": "Las aguas se abren y la pesca de la temporada es la más abundante en una generación. Todos los pueblos de la costa brindan por el nombre que lo resolvió — el tuyo — y las flotas zarpan en tu honor."
      }
    },
    "success": {
      "fameDelta": 3,
      "reputationDelta": 1,
      "verdict": { "en": "GOOD +1", "es": "BUENA +1" },
      "gradeDelta": 1,
      "narrative": {
        "en": "A fair split, grudgingly accepted. The fishing season runs calm and the council credits your arbitration in the harbor-side chatter.",
        "es": "Una división justa, aceptada a regañadientes. La temporada de pesca transcurre tranquila y el consejo acredita tu arbitraje en las charlas del puerto."
      }
    },
    "partial": {
      "fameDelta": 1,
      "reputationDelta": -1,
      "verdict": { "en": "MIXED 0", "es": "MIXTA 0" },
      "gradeDelta": 0,
      "narrative": {
        "en": "The compromise pleases no fleet and empties the nets. Half the coast calls you fair, half calls you weak — and the season's catch is thin either way.",
        "es": "El compromiso no satisface a ninguna flota y vacía las redes. La mitad de la costa te llama justa, la mitad débil — y la pesca de la temporada es escasa de todos modos."
      }
    },
    "fail": {
      "fameDelta": -2,
      "reputationDelta": -3,
      "liabilityDelta": 2,
      "verdict": { "en": "BAD −4", "es": "MALA −4" },
      "gradeDelta": -4,
      "narrative": {
        "en": "The borrowed flag surfaces at the vote and the settlement collapses into open feuding. The council's ledger now records your name next to a season of ruined fleets.",
        "es": "La bandera prestada sale a la luz en la votación y el acuerdo se derrumba en disputas abiertas. El libro mayor del consejo ahora registra tu nombre junto a una temporada de flotas arruinadas."
      }
    }
  }
}
```

For the other 5 elections, keep the exact same skeleton (3 cards, one trap, `weighted_hidden_match`, all four `verdict`/`gradeDelta` pairs) and vary the setting per the ids. For the debate, read the existing `debates.json` entry first (it uses card `tag` + `wantedTags`/`punishedTags`) and author `debate_old_versus_new` as a mirror — two rival schools of thought, 3 stance cards, one trap, all four verdict tiers.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/minigames/elections.json content/minigames/debates.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "const e=JSON.parse(require('fs').readFileSync('content/minigames/elections.json','utf8')); const d=JSON.parse(require('fs').readFileSync('content/minigames/debates.json','utf8')); console.log('elections', e.length, 'debates', d.length);"
```

Expected: `registry OK`, elections **12**, debates **2**.

- [ ] **Step 3: Commit**

```bash
git add content/minigames/elections.json content/minigames/debates.json
git commit -m "content(minigames): double elections to 12 and debates to 2"
```

---

### Task 19: Expand `content/minigames/goblin_games.json` (+2), `content/minigames/urns.json` (+1), `content/minigames/relics.json` (+1)

**Files:**
- Modify: `content/minigames/goblin_games.json`, `content/minigames/urns.json`, `content/minigames/relics.json`

**Interfaces:**
- Consumes: interactive minigames need `resolution.type: "interactive"`, `resolution.game` (`rps`/`tictactoe`/`memotest`), `opponent` LocaleMap, `primaryStat`, `statInfluence`, `rivalSkill`, and all four outcome tiers (no cards). Urn minigames need `cards` with one `trap: true`, `resolution.type: "grid_gamble"`, `statInfluence: {}`, card `winChanceDelta`s, and `countersReset: ["urn_streak"]`.
- Produces: goblin_games 4, urns 2, relics 2.

- [ ] **Step 1: Append the new entries**

**New ids:** `goblin_coin_hunt` (interactive — `rps`, bestOf 5 for a longer grudge match), `goblin_shell_game` (interactive — `memotest`), `urn_two_sisters` (urn), `relic_dragon_hoard_altar` (interactive — `memotest`).

Worked example (rps interactive — mirrors `goblin_hand_game` with `bestOf: 5`):

```json
{
  "id": "goblin_coin_hunt",
  "type": "minigame",
  "subtype": "interactive",
  "minAge": 10,
  "maxAge": 99,
  "weight": 2,
  "primaryStat": "intelligence",
  "opponent": { "en": "Snaggle the goblin", "es": "Snaggle el goblin" },
  "narrative": {
    "en": "Snaggle the goblin produces five dented coins and a set of grubby hand-signs. 'Best of five, outlander. Every round you win, a coin leaves my pouch. Every round you lose, a coin leaves yours. First to three wins the whole pile — and Snaggle never loses best of five.'",
    "es": "Snaggle el goblin saca cinco monedas abolladas y un juego de señales mugrientas. 'Al mejor de cinco, forastera. Cada ronda que ganás, una moneda sale de mi bolsa. Cada ronda que perdés, una sale de la tuya. Primera en llegar a tres se lleva todo el montón — y Snaggle nunca pierde al mejor de cinco.'"
  },
  "resolution": {
    "type": "interactive",
    "game": "rps",
    "bestOf": 5,
    "baseWinChance": 0.5,
    "statInfluence": { "intelligence": 0.012 },
    "statThreshold": 20,
    "rivalSkill": 0.6
  },
  "outcomes": {
    "critical": {
      "goldDelta": 260,
      "fameDelta": 6,
      "countersDelta": { "goblin_games_won": 1, "battles_won": 1 },
      "narrative": {
        "en": "Three rounds to nothing, and Snaggle's face cycles through every shade of green a goblin can produce. He counts out the coins one by one, wailing softly.",
        "es": "Tres rondas a cero, y la cara de Snaggle pasa por todos los tonos de verde que un goblin puede producir. Cuenta las monedas una por una, gimiendo bajito."
      }
    },
    "success": {
      "goldDelta": 110,
      "fameDelta": 3,
      "countersDelta": { "goblin_games_won": 1, "battles_won": 1 },
      "narrative": {
        "en": "Three rounds to two, and Snaggle slaps the coins on the table like they burn. 'Luck,' he hisses. 'Pure, rotten luck.'",
        "es": "Tres rondas a dos, y Snaggle golpea las monedas sobre la mesa como si quemaran. 'Suerte', silba. 'Pura, podrida suerte.'"
      }
    },
    "partial": {
      "goldDelta": -40,
      "countersReset": ["goblin_games_streak"],
      "narrative": {
        "en": "Two rounds apiece, and the last one slips away. Snaggle scoops the pile with a grin that splits his face. 'Close, outlander. Close pays the toll same as far.'",
        "es": "Dos rondas cada una, y la última se te escapa. Snaggle barre el montón con una sonrisa que le parte la cara. 'Cerca, forastera. Cerca paga el peaje igual que lejos.'"
      }
    },
    "fail": {
      "goldDelta": -100,
      "reputationDelta": -1,
      "reputationFaction": "greywater",
      "countersReset": ["goblin_games_streak"],
      "narrative": {
        "en": "Snaggle runs the table to three, dancing a little jig that no creature should be able to do. You hand over the coins and swear the goblin saw your tells the whole time.",
        "es": "Snaggle barre la mesa hasta el tres, bailando un pasito que ninguna criatura debería poder hacer. Entregás las monedas y jurás que el goblin te vio las señales todo el tiempo."
      }
    }
  }
}
```

For the remaining three entries, mirror the existing shapes in their files:

- `goblin_shell_game` — interactive `memotest` (mirror `relic_memotest`'s resolution block, `rivalSkill: 0.55`), opponent `{ "en": "Fidget the goblin", "es": "Fidget el goblin" }`, outcomes with `goblin_games_won` counter.
- `urn_two_sisters` — urn: 3 cards (`urn_veiled`, `urn_laughing`, `urn_silent`) with one `trap: true`, `grid_gamble` resolution, `cardModifiers` on the safe cards, outcomes with `urns_opened` counter and `countersReset: ["urn_streak"]`.
- `relic_dragon_hoard_altar` — interactive `memotest`, opponent `{ "en": "Keeper Aldous", "es": "El guardián Aldous" }`, `primaryStat: "intelligence"`, outcomes with `relic_memotest_wins` counter.

- [ ] **Step 2: Format + validate**

Run:

```bash
pnpm exec prettier --write content/minigames/goblin_games.json content/minigames/urns.json content/minigames/relics.json
pnpm i18n:check
pnpm exec tsx -e "import { loadContent } from './server/content/registry.js'; loadContent(); console.log('registry OK');"
node -e "for (const f of ['goblin_games','urns','relics']) console.log(f, JSON.parse(require('fs').readFileSync('content/minigames/'+f+'.json','utf8')).length);"
```

Expected: `registry OK`, goblin_games **4**, urns **2**, relics **2**.

- [ ] **Step 3: Commit**

```bash
git add content/minigames/goblin_games.json content/minigames/urns.json content/minigames/relics.json
git commit -m "content(minigames): double goblin games, urns, and relics"
```

---

### Task 20: Update the count lines in `docs/improvement-plan.md`

**Files:**
- Modify: `docs/improvement-plan.md`

**Interfaces:**
- Consumes: the final counts produced by Tasks 2-19.
- Produces: accurate Phase 5 status table + summary lines.

- [ ] **Step 1: Verify the final counts**

Run:

```bash
node -e "
const fs=require('fs');
const evs={}; for (const f of fs.readdirSync('content/events')) evs[f]=JSON.parse(fs.readFileSync('content/events/'+f,'utf8')).length;
console.log('events total', Object.values(evs).reduce((a,b)=>a+b,0), evs);
const mgs={}; for (const f of fs.readdirSync('content/minigames')) mgs[f]=JSON.parse(fs.readFileSync('content/minigames/'+f,'utf8')).length;
console.log('minigames total', Object.values(mgs).reduce((a,b)=>a+b,0), mgs);
const s=require('./content/slots.json'); let total=0; for (const [k,v] of Object.entries(s)){ total+=v.length; console.log('slot', k, v.length); } console.log('slots total', total);
const a=require('./content/archetypes.json'); let at=0; for (const [k,v] of Object.entries(a)){ at+=v.length; console.log('archetypes', k, v.length); } console.log('archetypes total', at);
const sh=require('./content/shop.json'); let st=0; for (const c of ['retinue','consumable','luxury']){ const n=sh.filter(i=>i.category===c).length; st+=n; console.log('shop', c, n); } console.log('shop total', st);
"
```

Expected: events **136**, minigames **72**, slots **326**, archetypes **60** (10/class), shop **32**.

- [ ] **Step 2: Update the Phase 5 table and status lines**

In `docs/improvement-plan.md`, update the §5.1 "Status:" paragraph and the Phase 5 table to the new numbers, and append a dated changelog line to the same paragraph. The table rows become: Events **136**/80+, Minigames **72**/25+, Achievements unchanged (69), Slot pool entries **326**/300+, Archetypes **60**/30+, World events **20**/20+, Clans unchanged (25), NPC relationships unchanged (2). Add to the Status paragraph: **`2026-08-05: content expansion shipped — doubled all content volumes (events 68→136, minigames 36→72, slots 163→326, archetypes 30→60, shop 16→32) per docs/superpowers/plans/2026-08-05-content-expansion.md`.**

Also update the two summary lines that cite counts (search for `68/80` and `10/20+` and `2/15+` in the file — lines ~630 and ~644) to the new values.

- [ ] **Step 3: Validate**

Run:

```bash
grep -n "136\|72\|326\|60\|32" docs/improvement-plan.md
```

Expected: the new numbers appear in the Phase 5 table and status paragraph. No other file changed.

- [ ] **Step 4: Commit**

```bash
git add docs/improvement-plan.md
git commit -m "docs: refresh content volume counts after expansion"
```

---

### Task 21: Full-suite validation + review

**Files:**
- (None — validation only.)

**Interfaces:**
- Consumes: all of Tasks 2-20.
- Produces: proof the expanded content graph is healthy and deterministic.

- [ ] **Step 1: Run the full content + engine validation**

Run:

```bash
pnpm i18n:check
pnpm exec tsx scripts/smoke.ts
pnpm test:server
pnpm lint
pnpm exec prettier --check "content/**/*.json"
```

Expected: i18n all complete; smoke loads the registry and prints the new totals, completes 4 class runs + the determinism check with `determinism: PASS`; `test:server` green (engine tests load the full registry — a malformed entry would fail at load); lint clean; prettier check clean on all content files.

- [ ] **Step 2: Manual spot-check in the browser**

Run `pnpm dev`, open http://localhost:8080, start a run, and confirm: new shop items render in the shop modal; a new tavern/road/dungeon event appears within a few turns; a duel/activity minigame renders its cards; the season capstone (election/debate) still shows the verdict strip. Check the browser console for errors.

- [ ] **Step 3: Commit if anything was patched during validation**

```bash
git add -A
git commit -m "fix(content): validation fixes after expansion"
```

(Only commit if Step 1/2 produced fixes. Otherwise no commit.)

---

## Self-Review

**1. Spec coverage.** User asked to expand every file in `content/` except achievements, doubling volume, deepening existing structures only, plus doc count updates. Tasks 2-19 cover every expandable file: slots (T2), archetypes (T3), shop (T4), all 11 event files (T5-T15), all 7 minigame files (T16-T19). Exclusions honored: achievements/classes/factions/regions untouched (documented in Global Constraints). Doc updates: T20. Validation: T1 + T21.

**2. Placeholder scan.** No TBD/"similar to" steps — every task gives a complete worked JSON example and concrete per-entry briefs (ids, gates, deltas, counters). The few "author the other N" steps are backed by full examples of the exact shape plus the briefs list. No undefined types or ids are referenced.

**3. Type consistency.** All examples use existing `EventContent`/`ChoiceContent`/`MinigameOutcome`/`ShopItem`/`ArchetypeContent` fields verbatim from `shared/types.ts`; counter names (`duels_won`, `goblin_games_won`, `urn_streak`, etc.) match those already authored in the files; `verdict`/`gradeDelta` formats match `elections.json`; capstone fields match `debates.json`. `{slot:...}` pools referenced (worldLocation, guildName, regionVariant) all exist after Task 2. The one nuance flagged: `requiresRegion` strings must be verified against the file before use (Task 13 notes to check — the existing file's exact strings are the source of truth, not the spec).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-content-expansion.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?

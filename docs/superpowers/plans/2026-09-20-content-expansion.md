# Story Content Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand 17 story-bearing content files plus 5 slot pools by ~50% each (248 new bilingual en/es items) without touching classes, factions, shop, clans, archetypes, achievements, combat, or story threads.

**Architecture:** Pure content work. Every task appends JSON items to existing files under `content/`, conforming exactly to existing schemas. No engine or type changes. Verification is `pnpm test:server` (content registry validation) + `pnpm i18n:check` + `pnpm lint` after each batch, plus an explicit duplicate-id scan.

**Tech Stack:** JSON content, TypeScript validation via `server/content/registry.ts`, Node scripts for scans. No new dependencies.

## Global Constraints

- **Scope is fixed.** Never create/modify: `content/classes.json`, `content/factions.json`, `content/shop.json`, `content/events/clans.json`, `content/events/story_threads.json`, `content/threads/**`, `content/achievements.json`, `content/archetypes.json`, `content/combat/**`, `content/regions.json`, `content/minigames/activities.json`, `content/minigames/circus.json`, `content/minigames/goblin_games.json`. Also `guildName` and `regionVariant` slots stay frozen.
- **Bilingual every time:** every `LocaleMap` needs non-empty `en` AND `es`. `pnpm i18n:check` fails otherwise.
- **Spanish authoring rule (HARD):** write Spanish in standard **masculine forms** for player-referential words (`viajero`, `solo`, `herido`, `cansado`). `genderize()` inflects to feminine for female characters at render time (`server/engine/helpers.ts:43`, before slot fill). Never hardcode feminine forms (existing legacy strings like `forastera` are historical bugs, not a pattern to follow).
- **Ungated choice required:** any event whose choices include `requiresStat` must keep at least one choice without it (`registry.ts:272-279`).
- **Stats available:** `strength`, `dexterity`, `constitution`, `intelligence`, `charisma` ONLY (there is no `wisdom`). `shared/types.ts:14-19`.
- **Tags available:** Humble, Cocky, Confident, Professional, Aggressive, Funny, Supportive, Strategic, Stoic, Leader (`shared/types.ts:490-501`). Rarity: `common | uncommon | rare | volatile`.
- **Faction ids valid for `reputationFaction`:** greywater, ironhold, thornwood, arcanum, crownguard, ashwalkers, blacktide, bronzehammer, crimsonveil, deepfolk, embersworn, frostwood_tribe, golden_lotus, iron_covenant, ivy_circle, meridian_company, nightfall_order, rust_priests, sandspear, silver_mask, stonewardens, sunken_church, whispering_reed, luminari, gildedtongue.
- **Determinism:** no `Math.random`, no runtime picks authored into content — every value is hard-coded in JSON.
- **Icons:** every `icon` string must resolve in the client's `ICONS` map at `src/components/AchIcon.tsx` (the map at lines 69-137) — unknown strings render as the Sparkles fallback. See the implemented icons under the "Minigame activity icons" comment group. Do not invent new icon strings.
- **Duplicate ids silently overwrite** (registry loads into a Map). Run the dup scan before committing each batch.
- **Files use 2-space JSON indentation.** Commas: trailing commas are ILLEGAL in JSON — every item must be comma-separated correctly; the last item in an array has no trailing comma.
- **Reserved engine ids to never author:** `__retirement_offer__`, `__season_summary__`.

---

### Task 0: Style sample (2 items) + tone approval

**Files:**
- Modify: `content/events/road.json` (append 1 event)
- Modify: `content/minigames/duels.json` (append 1 minigame)

**Interfaces:**
- Consumes: nothing.
- Produces: the approved voice/tone reference (English personable second-person fantasy; Spanish in masculine-authored first-person voseo, `-ás` verb forms, quotes in single apostrophes) that every later task must match. Also locks the JSON append pattern: open the file, navigate to the end of the array, place a comma after the previous last item, then add the new item.

- [ ] **Step 1: Read the two target files fully** (`content/events/road.json`, `content/minigames/duels.json`) to absorb tone + exact schema. Note `duels.json` cards are `{ id, icon, label }` with `resolution: { type: "weighted_hidden_match", baseWinChance, statInfluence, cardModifiers }` and 4-tier `outcomes` (`critical`/`success`/`partial`/`fail`), using `countersDelta: { battles_won, duels_won }` / `countersReset: ["duel_streak"]`.

- [ ] **Step 2: Append `road_wandering_champion` to `content/events/road.json`**

```json
{
  "id": "road_wandering_champion",
  "type": "road",
  "minAge": 18,
  "maxAge": 99,
  "weight": 6,
  "narrative": {
    "en": "An old knight with a dented helm and a name placard from a hundred tourneys past blocks your path, sword angled in a playful formal salute. 'One bout. No blood, no glory game — I just want to remember what it felt like to be sharp.' They plant a purse of gold in the dirt between you. 'Win, and it's yours. Lose, and you buy the next round down the road.'",
    "es": "Un caballero anciano con el yelmo abollado y un cartel de nombres de cien torneos pasados te corta el paso, con la espada en un saludo formal juguetón. 'Un combate. Sin sangre, sin juego de gloria — solo quiero recordar lo que se siente estar afilado.' Clavó una bolsa de oro en la tierra entre los dos. 'Si ganás, es tuya. Si perdés, pagás la próxima ronda más adelante.'"
  },
  "choices": [
    {
      "id": "accept_bout",
      "label": {
        "en": "Accept — a duel for old memories",
        "es": "Aceptar — un duelo por viejos recuerdos"
      },
      "tag": "Confident",
      "rarity": "common",
      "requiresStat": { "stat": "strength", "min": 12 },
      "statDeltas": { "strength": 2 },
      "fameDelta": 3,
      "goldDelta": 150,
      "narrative": {
        "en": "Their form is ancient and perfect. You match it, measure for measure, and when the final exchange comes they drop their guard on purpose, laughing. They press the gold purse into your hands. 'Sharp as a winter knife. That's all I needed.' Their pride is intact; yours is richer.",
        "es": "Su forma es antigua y perfecta. La igualás, golpe por golpe, y en el intercambio final baja la guardia a propósito, riendo. Te meten la bolsa de oro en las manos. 'Filoso como un cuchillo de invierno. Eso era todo lo que necesitaba.' Su orgullo queda intacto; el tuyo, más rico."
      }
    },
    {
      "id": "drink_down_road",
      "label": {
        "en": "Refuse the blade, offer the road-wine",
        "es": "Rechazar la hoja, ofrecer el vino de camino"
      },
      "tag": "Supportive",
      "rarity": "common",
      "statDeltas": { "charisma": 1 },
      "goldDelta": -15,
      "narrative": {
        "en": "You pocket your sword and pull out the dark bottle you've been saving. They blink, then laugh until their ribs shake, and take a long pull. They tell you war stories until sundown, with no blood spilled and a friend gained where a scar might have been.",
        "es": "Guardás tu espada y sacás la botella oscura que venías ahorrando. Parpadean, y luego ríen hasta que les tiemblan las costillas, y dan un trago largo. Te cuentan historias de guerra hasta el atardecer, sin derramar sangre y con un amigo ganado donde podría haber quedado una cicatriz."
      }
    },
    {
      "id": "mock_the_champion",
      "label": {
        "en": "Aged blade, worn sheen — mock them",
        "es": "Hoja vieja, brillo gastado — burlarse"
      },
      "tag": "Cocky",
      "rarity": "volatile",
      "statDeltas": { "strength": 3 },
      "goldDelta": -40,
      "tradeoffDeltas": { "charisma": -2 },
      "injuryRiskDelta": 0.2,
      "narrative": {
        "en": "You point out that their placard last held a winner's name before you were born. Their face goes very calm. The 'one bout' becomes a hard twenty minutes, and you earn the purse — plus a split lip you'll feel for a week, and a name the retired circuit won't soon forget.",
        "es": "Señalás que su cartel tuvo un nombre ganador antes de que nacieras. Su cara se pone muy tranquila. El 'un combate' se vuelve veinte minutos duros, y ganás la bolsa — más un labio partido que vas a sentir durante una semana, y un nombre que el circuito retirado no va a olvidar pronto."
      }
    }
  ]
}
```

- [ ] **Step 3: Append `duel_blade_dance` to `content/minigames/duels.json`**

```json
{
  "id": "duel_blade_dance",
  "type": "minigame",
  "subtype": "duel_strike",
  "minAge": 16,
  "maxAge": 99,
  "weight": 7,
  "primaryStat": "dexterity",
  "narrative": {
    "en": "At the harvest fair, the Night-Switch Guild's blade-dancer challenges anyone to a lights-out duel: blades wrapped in ash and salt, a blindfold offered to you both. 'First to draw blood loses their coin purse to the other,' they call to the crowd. 'And the crowd decides who's the better liar with a sword.'",
    "es": "En la feria de la cosecha, la bailarina de cuchillos del Gremio del Cambio Nocturno desafía a cualquiera a un duelo a oscuras: hojas envueltas en ceniza y sal, con una venda ofrecida a ambos. 'El primero que saque sangre pierde su bolsa a manos del otro', grita a la multitud. 'Y la multitud decide quién miente mejor con una espada.'"
  },
  "cards": [
    {
      "id": "slip_forward",
      "icon": "footprints",
      "label": {
        "en": "Slip forward low",
        "es": "Deslizarse hacia adelante, bajo"
      }
    },
    {
      "id": "mirror_stance",
      "icon": "moon",
      "label": {
        "en": "Mirror their stance",
        "es": "Copiar su postura"
      }
    },
    {
      "id": "silent_circle",
      "icon": "wind",
      "label": {
        "en": "Circle in silence",
        "es": "Girar en silencio"
      }
    },
    {
      "id": "stamp_strike",
      "icon": "zap",
      "label": {
        "en": "Stamp and strike sudden",
        "es": "Pisar fuerte y golpear de repente"
      }
    }
  ],
  "resolution": {
    "type": "weighted_hidden_match",
    "baseWinChance": 0.45,
    "statInfluence": {
      "dexterity": 0.012,
      "strength": 0.004
    },
    "cardModifiers": {
      "silent_circle": {
        "winChanceDelta": 0.1,
        "critChanceDelta": 0.05
      }
    }
  },
  "outcomes": {
    "critical": {
      "statDeltas": { "dexterity": 2 },
      "fameDelta": 6,
      "goldDelta": 180,
      "countersDelta": { "battles_won": 1, "duels_won": 1, "clutch_duels": 1 },
      "narrative": {
        "en": "You read their breath before their blade — the blindfold is nothing when the crowd's hush tells you where they move. Your ash-tipped blade taps their wrist and the coin purse drops. The square erupts; the dancer bows with genuine delight.",
        "es": "Leés su respiración antes que su hoja — la venda no es nada cuando el silencio de la multitud te dice hacia dónde se mueven. Tu hoja con punta de ceniza toca su muñeca y la bolsa de monedas cae. La plaza estalla; la bailarina se inclina con genuino deleite."
      }
    },
    "success": {
      "fameDelta": 3,
      "goldDelta": 90,
      "countersDelta": { "battles_won": 1, "duels_won": 1 },
      "narrative": {
        "en": "A clean touch on their shoulder earns the purse and a roar from the crowd. The dancer shakes their head, laughing, and buys the whole fair a round with the change.",
        "es": "Un toque limpio en su hombro te da la bolsa y un rugido de la multitud. La bailarina niega con la cabeza, riendo, y convida a toda la feria con el cambio."
      }
    },
    "partial": {
      "goldDelta": -20,
      "injuryRiskDelta": 0.15,
      "countersReset": ["duel_streak"],
      "narrative": {
        "en": "You touch cloth, they touch skin — the dance is a draw and the crowd calls it so. You split the purse to buy ale for the square, and neither of you blinks first on the walk away.",
        "es": "Vos tocás la tela, ellos tocan la piel — el baile es un empate y la multitud lo decide así. Dividís la bolsa para comprar cerveza para la plaza, y ninguno de los dos parpadea primero al alejarse."
      }
    },
    "fail": {
      "goldDelta": -50,
      "injuryRiskDelta": 0.3,
      "reputationDelta": -2,
      "reputationFaction": "gildedtongue",
      "countersReset": ["duel_streak"],
      "narrative": {
        "en": "Their blindfold is pure theater — they move like they have eyes in their shoulder blades. Ash meets your collar, the purse changes hands, and the dancer's bow is a little too deep to be kind.",
        "es": "Su venda es puro teatro — se mueven como si tuvieran ojos en los omóplatos. La ceniza toca tu cuello, la bolsa cambia de manos, y la reverencia de la bailarina es un poco demasiado profunda para ser amable."
      }
    }
  }
}
```

- [ ] **Step 4: Run the dup-id scan (must print no duplicates):**

Run: `powershell -Command "$a=@(); Get-ChildItem content/events,content/minigames -Filter *.json | ForEach-Object { $j=Get-Content $_.FullName -Raw | ConvertFrom-Json; $a += $j | ForEach-Object { $_.id } }; $a | Group-Object | Where-Object Count -gt 1 | Format-Table"`
Expected: no rows.

- [ ] **Step 5: Run validation:**

Run: `pnpm test:server`
Expected: all pass (registry loads content successfully).
Run: `pnpm i18n:check`
Expected: en/es parity clean.
Run: `pnpm lint` on changed files.
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add content/events/road.json content/minigames/duels.json
git commit -m "feat(content): style-sample road event + blade-dance duel"
```

- [ ] **Step 7: Present the two items to the user for tone approval.** STOP here — do not start Task 1 until the user approves the voice (or requests changes you apply to these two items first).

---

### Task 1: Batch A — Travels (world +12, road +6, rest +12)

**Files:**
- Modify: `content/events/world.json` (append 12)
- Modify: `content/events/road.json` (append 6)
- Modify: `content/events/rest.json` (append 12)

**Interfaces:**
- Consumes: Task 0's approved tone and append pattern.
- Produces: 30 new events; each must load and i18n-check.

**World events** (`world.json`): `type: "world"`, a `worldEventHeadline` LocaleMap (short news-bold line, en+es), `narrative`, and exactly one choice with `id: "acknowledge"`, `label` ("Acknowledge"/"Enterado"), `tag`, `rarity: "common"`, and a narrative. Pure news — **no** `requiresStat`, no rewards on acknowledge (or at most a token `fameDelta: 1` — check the existing world.json choices and mirror their exact freedom level). Reuse `{slot:worldLocation}` / `{slot:guildName}` placeholders where natural. Append these 12 ids:

1. `world_heretic_burning` — a heretic's public trial on the pyre; purity vs. doubt sweeps the realm.
2. `world_market_crash` — the silver-leaf markets collapse; coin loses faith overnight.
3. `world_explorer_voyage` — a legendary explorer's ship returns with impossible news from beyond the rim.
4. `world_locust_plague` — locusts the color of brass eating entire provinces green by green.
5. `world_border_wall` — a neighboring king walls his border, trapping caravans and rumors.
6. `world_colossus_sighted` — a mountain-sized walker seen crossing the wastes, direction unknown.
7. `world_sea_monster` — sailors report a leviathan the size of a harbor mouthing off the coast.
8. `world_dwarven_dig` — deepfolk miners break into a titanic buried structure; ground trembles for leagues.
9. `world_royal_wedding` — a lavish royal wedding freezes every court's schedule; invitations go out.
10. `world_minstrel_frenzy` — one ballad catches the whole realm; inns pay double for any singer who knows it.
11. `world_cursed_relic_auction` — an ancient relic goes to auction; bidders and thieves converge on the capital.
12. `world_king_abdicates` — the old king abdicates to a monastery; succession fever begins.

**Road events** (`road.json`): standard multi-choice (see Task 0's `road_wandering_champion` as the template). 2–3 choices, at least one ungated, tags mix, rarity common/uncommon/volatile. Append:

1. `road_toll_bridge` — a toll bridgekeeper names a price, then a far higher one when he sees your coin.
2. `road_pilgrim_challenge` — pilgrims demand you prove the road's worth at the shrine fork.
3. `road_abandoned_wagon` — an abandoned wagon half-swallowed by mud; its cargo still intact and watched.
4. `road_mudslide` — a fresh mudslide buries the pass; locals dig, and argue about what started it.
5. `road_night_encampment` — strangers at the fire in a night encampment; one quietly means harm.
6. `road_river_ferry` — the ferryman quotes one price to cross, another to reach the far bank *before* sundown.

**Rest events** (`rest.json`): quiet recovery + character beats. Rewards lean on `staminaDelta`, `healthDelta`, small `statDeltas`; at least one calm, low-stakes choice. Append:

1. `rest_moonlit_lake` — swimming at midnight in a lake that hums cold and clean.
2. `rest_book_binding` — a reclusive binder restores torn tomes and teaches you a patient craft.
3. `rest_shepherd_hut` — a shepherd's hut, a low fire, and mutton broth after a wet day.
4. `rest_tea_house` — a thatched tea house that serves bitterness that tastes like remembering.
5. `rest_cemetery_silence` — you sit among the old graves and let the quiet press in.
6. `rest_ledge_hammock` — a sleeping ledge above a canyon; wind sings you down.
7. `rest_fog_valley_inn` — an inn in fog, warm bread, and a landlord who's seen too much and says nothing.
8. `rest_orphan_dinner` — the orphanage's long table; the children share their chairs with a stranger.
9. `rest_blacksmith_song` — a blacksmith hums an old work-song while you bank the coals.
10. `rest_stargazer_ridge` — stargazing from a ridge; the sky has more names than you do.
11. `rest_river_hum` — sleeping on a riverbank where the current sounds like a low chorus.
12. `rest_old_innkeeper` — an old innkeeper tells the story of the road that led them *here*.

- [ ] **Step 1:** Author the 30 events per the per-file guidance above. Mirror existing house style for these files: read ~4 existing events from each file first. Every event: `id`, `type` (`"road"`/`"rest"`; world uses `"world"`), `minAge`/`maxAge` matching siblings, `weight` inside each file's existing band (road 5–11, rest 3–9, world 3–5 — confirm by reading), `narrative`, and valid choices.
- [ ] **Step 2:** Run the dup-id scan (same command as Task 0 Step 4). Expected: no duplicates.
- [ ] **Step 3:** Run `pnpm test:server`. Expected: pass (registry validates all new events).
- [ ] **Step 4:** Run `pnpm i18n:check`. Expected: clean.
- [ ] **Step 5:** Run `pnpm lint`. Expected: clean.
- [ ] **Step 6:** Commit.

```bash
git add content/events/world.json content/events/road.json content/events/rest.json
git commit -m "feat(content): expand travels events 50% (world/road/rest)"
```

---

### Task 2: Batch B — People (relationships +14, tavern +5, personality +5)

**Files:**
- Modify: `content/events/relationships.json` (append 14)
- Modify: `content/events/tavern.json` (append 5)
- Modify: `content/events/personality.json` (append 5)

**Interfaces:**
- Consumes: Task 0 tone; existing NPC ids from `relationships.json` (used by the relationship events).
- Produces: 24 events. New relationship events must deepen EXISTING NPCs (never introduce new NPC ids unless the intro event itself is authored here — mirror how `rel_<name>_intro` works by reading it first).

**Relationships** (`relationships.json`): one intro event per new NPC would add NPCs — instead the plan deepens existing NPCs. Existing NPCs: mira, lyra, fenwick, bram, merra, jorin, tess, elara, grimble, velda, aldric (deceased — use memory beat `rel_aldric_last_lesson` style), wulfric, lucian, kade, wanderer (the mysterious `rel_wanderer_home`). Append 14 beat events (`affinityDelta` heavy, 1–2 new pieces of backstory or a shared turn):

1. `rel_mira_letter` — Mira needs a letter delivered where she can't be seen going.
2. `rel_lyra_duet_return` — Lyra is caught in a rival song-house's trap; a duet frees her.
3. `rel_fenwick_market` — Fenwick's 'discounted' goods turn out stolen; keep or return the haul.
4. `rel_bram_blacksmith` — Bram's forge is failing; a strange ore could save it or ruin the fire.
5. `rel_merra_sanctuary` — Merra shelters a defector; the hunter asks you about her.
6. `rel_jorin_foundry` — Jorin gambles the foundry's pay on one insane commission.
7. `rel_tess_clinic` — Tess's clinic overflows; you help, or turn your eyes away.
8. `rel_elara_reunion` — Elara finds a tune she half-remembers and needs a witness to finish it.
9. `rel_grimble_warehouse` — Grimble's warehouse is burning and his best crate is inside.
10. `rel_velda_seance` — Velda's séance summons something that knows your name.
11. `rel_wulfric_training` — Wulfric offers to train you for real; the price is a debt of honor.
12. `rel_lucian_second_chance` — Lucian is down on his luck and dangerous to be near.
13. `rel_kade_gift` — Kade left something behind for you and went quiet.
14. `rel_aldric_armory` — a memory of Aldric: his old armory yields one last lesson.

**Tavern** (`tavern.json`): warm loud rooms, social gambles. Append:

1. `tavern_card_game` — a marked deck and a player who doesn't know it yet.
2. `tavern_drunk_knight` — a disgraced knight buys you drinks until a truth slips.
3. `tavern_contract_board` — the board pins a job every table pretends not to see.
4. `tavern_fire_dancer` — the fire dancer's act ends with a coin in your hand and a question.
5. `tavern_cook_secret` — the cook guards a recipe and a much darker secret.

**Personality** (`personality.json`): tag-driven, uses `wantedTags`/`punishedTags`, presents a character-defining test. Append:

1. `personality_charity_sacrifice` — give a beggar something that costs you real comfort (Supportive/Strategic flex).
2. `personality_fame_chooses` — the crowd is wrong about you; correct it or ride it (Humble/Cocky).
3. `personality_honor_betrayal_choice` — a promise broken quietly buys safety (Stoic vs. Aggressive).
4. `personality_empty_promise` — the chance to promise something you can't deliver (Funny vs. Professional).
5. `personality_weigh_the_boast` — a room debates your best story to your face (Leader vs. Humble).

- [ ] **Step 1:** Read one intro + one beat for 2–3 NPCs in `relationships.json` to learn `introducesRelationshipId` vs. pure-affinity beats and existing `affinityDelta` scale; read the full `personality.json` to learn how `wantedTags`/`punishedTags` gates are authored; read `tavern.json`.
- [ ] **Step 2:** Author 24 events per guidance. Keep id lists exactly as above (no renames, no extra ids).
- [ ] **Step 3:** Dup-id scan (no duplicates).
- [ ] **Step 4:** `pnpm test:server` (pass).
- [ ] **Step 5:** `pnpm i18n:check` (clean).
- [ ] **Step 6:** `pnpm lint` (clean).
- [ ] **Step 7:** Commit.

```bash
git add content/events/relationships.json content/events/tavern.json content/events/personality.json
git commit -m "feat(content): expand people events 50% (relationships/tavern/personality)"
```

---

### Task 3: Batch C — Places & power (regions +6, court +6, foreign +5, dungeon +5)

**Files:**
- Modify: `content/events/regions.json` (append 6)
- Modify: `content/events/court.json` (append 6)
- Modify: `content/events/foreign.json` (append 5)
- Modify: `content/events/dungeon.json` (append 5)

**Interfaces:**
- Consumes: Task 0 tone. Need the exact `requiresRegion` string per region — READ `content/regions.json` first and copy region ids verbatim.
- Produces: 22 events.

**Regions** (`regions.json`): each event sets `requiresRegion` to one existing region id and is a regional flavor/conflict beat mirroring existing reward scale. Append 6 — one per… you be the judge: the 6 regions are vale, coast, highlands, capital, wastelands, isles (verify in `regions.json`), one event each:

1. `region_vale_pied_piper` — the vale's children follow a music only you can't hear.
2. `region_coast_smuggler_cove` — a smuggler's cove asks whether you're a harbor official or a tide.
3. `region_highlands_mine_collapse` — the highland mine collapses and the *foreman* might be the one who did it.
4. `region_capital_conspiracy_mural` — a fresco in the capital hides a newer, fresher face behind an older one.
5. `region_wastelands_glass_storm` — a glass storm in the wastelands; the locals have one rule about what it exposes.
6. `region_isles_siren_singers` — the isles' singers tune their voices to the tide; one tune is for the drowned.

**Court** (`court.json`): intrigue, reputation, factions (crownguard-heavy), non-combat power plays. Append:

1. `court_hunting_party` — a hunt where the 'boar' is a man who knows a secret.
2. `court_spymaster_offer` — the spymaster offers a seat at the quiet table, no strings (there are always strings).
3. `court_prisoner_visit` — a visit to a prisoner everyone insists is guilty; he claims you know the truth.
4. `court_sumptuary_law` — a law about what clothes are legal; someone dares you to break it in public.
5. `court_ancestor_portrait` — a portrait commission that requires the *family's* approved version of history.
6. `court_winter_feast` — seating at the winter feast (the arrangement is the real politics).

**Foreign** (`foreign.json`): outsider identity, home vs. here — mirror existing file's framing (read it first). Append:

1. `foreign_international_marriage` — a marriage offer that would bind you to a house, not a person.
2. `foreign_tourist_marking` — locals point you out as the *tourist* to emulate or to milk.
3. `foreign_deportation_scare` — a decree threatens every foreigner; the list is being made.
4. `foreign_festival_crown` — at the foreigners' festival, they crown the one who's 'least from here'.
5. `foreign_mercenary_contract_outsider` — a contract that only an outsider could honor — or break.

**Dungeon** (`dungeon.json`): dark places, health/injury stakes, traps, treasure with teeth. Append:

1. `dungeon_rat_king` — a pile of rats wearing a crown of meat and bone.
2. `dungeon_drowning_chamber` — the water is rising and the exit requires a choice underwater.
3. `dungeon_echo_hall` — a hall that repeats your words back wrong, and reveals what you almost said.
4. `dungeon_lost_altar` — an altar to a god the stones remember but no one names.
5. `dungeon_guards_truce` — two ancient guards on either side, neither alive, both still on duty.

- [ ] **Step 1:** Read `content/regions.json` (copy exact region ids), plus the full `court.json`, `foreign.json`, `dungeon.json` for gating syntax and reward scale.
- [ ] **Step 2:** Author 22 events per the file-specific guidance. Every event keeps at least one ungated choice.
- [ ] **Step 3:** Dup-id scan (no duplicates).
- [ ] **Step 4:** `pnpm test:server` (pass).
- [ ] **Step 5:** `pnpm i18n:check` (clean).
- [ ] **Step 6:** `pnpm lint` (clean).
- [ ] **Step 7:** Commit.

```bash
git add content/events/regions.json content/events/court.json content/events/foreign.json content/events/dungeon.json
git commit -m "feat(content): expand places & power events 50% (regions/court/foreign/dungeon)"
```

---

### Task 4: Batch D — Fates & arenas (destiny +3, duels +9, elections +6, debates +1, urns +1, relics +1, press_conference +1)

**Files:**
- Modify: `content/events/destiny.json` (append 3)
- Modify: `content/minigames/duels.json` (append 9)
- Modify: `content/minigames/elections.json` (append 6)
- Modify: `content/minigames/debates.json` (append 1)
- Modify: `content/minigames/urns.json` (append 1)
- Modify: `content/minigames/relics.json` (append 1)
- Modify: `content/minigames/press_conference.json` (append 1)
- Test: nothing new — validation only.

**Interfaces:**
- Consumes: Task 0 tone + the minigame schemas verified in the design (duel shorthand, election capstone, urn grid_gamble, relic memotest, press interactive).
- Produces: 22 items.

**Destiny** (`destiny.json`, `type: "destiny"`): high `minAge` (≥ 18), large stat swings, fated stakes. Possibly `locksEventPool`/`unlocksEventPool` — inspect how existing destiny events use them (read the file first); if they reference pool ids that are cleanly reusable, fine; otherwise omit. Append:

1. `destiny_midnight_oath` — at midnight, a being made of old words demands one oath you've never said aloud.
2. `destiny_shattered_omen` — a glass omen shatters in your hands; the fortune is whatever you now choose.
3. `destiny_first_thunder` — first thunder of the season: the sky seems to pick you out of the whole valley.

**Duels** (`duels.json`, `weighted_hidden_match`, 4 cards each, 4-tier outcomes, reuse subtitle strings `duel_strike`/`negotiation`/`brawl`/`arcane_duel`/`street_fight`/`tournament`). Append 9 — vary primaryStat and subtype:

1. `duel_watering_hole` (brawl, strength) — a water-hole dispute over who drinks first in drought.
2. `duel_river_boat` (duel_strike, dexterity) — a duel on a rocking river barge that can end in the drink.
3. `duel_snowfield` (duel_strike, dexterity) — a duel in thigh-deep snow where the footing is the real opponent.
4. `duel_bridge_champion` (tournament, strength) — the bridge champion defends their toll with steel, not law.
5. `negotiation_mine_treaty` (negotiation, charisma) — two mining captains bout over a vein with their fists and then their words.
6. `brawl_mud_wrestling` (brawl, strength) — a ritual mud-wrestle at a river festival; the crowd has favorites.
7. `arcane_duel_rune_theft` (arcane_duel, intelligence) — a mage accuses you of stealing a rune; settle it with light and noise.
8. `street_fight_market_scrub` (street_fight, dexterity) — a market 'accident' that's clearly a shakedown with an audience.
9. `tournament_royal_roster` (tournament, strength) — a royal roster bout where losing politely could win more than winning.

**Elections** (`elections.json`, capstones: `isCapstone: true`, `capstoneKind: "election"`, 3 cards one `trap`, verdict + gradeDelta tiers). Append 6:

1. `election_harbor_master` — the harbor guild elects who gets the leash on every ship.
2. `election_head_judge` — the benches elect a head judge; the brief is 'the one who won't be bought' (cartel disagrees).
3. `election_warming_bonfires` — the town elects whose winter birthright the bonfire festival honors.
4. `election_grain_supply` — the granary keepers elect who controls next year's bread.
5. `election_proclamation_scribe` — the crown's proclamation scribe is chosen; the wording of everything is on the line.
6. `election_watch_captain` — the city watch elects a captain; the martinet and the people's friend both have money on the card.

**Debate** (`debates.json`, `subtype: "debate"`, `capstoneKind: "debate"`, weighted_hidden_match — mirror `debate_rival_claim` exactly): append `debate_war_songs` — a war veteran and a bard debate whether songs that beautify war should be sung at all.

**Urn** (`urns.json`, `grid_gamble`, 3 cards one `trap`, `baseWinChance` ~0.4, `statInfluence: {}`, cardModifiers on the 2 safe cards, `countersDelta: { urns_opened: 1 }`, reset `urn_streak` on partial/fail, fail carries liability): append `urn_kings_food_vault` — three urns sealed in the old king's food vault: salt, saffron, or a curse that thinks it's a feast.

**Relic** (`relics.json`, interactive `memotest`): append `relic_sea_king_horde` — Keeper Orlun minds a table of sunken tithe: six treasures hidden twice, reef salt on every tile; `reputationFaction: "arcanum"` on win tiers, same payoffs/streak resets as existing relics.

**Press conference** (`press_conference.json`, interactive, `game: "press_conference"`, 3 questions × 4 options each with `tag` + `wantedTags`): append `press_gauntlet_02` — a follow-up press row about your rival's accusations, a scandal you're linked to, and a promise the room wants you to break.

- [ ] **Step 1:** Read `destiny.json`, `debates.json`, `press_conference.json` fully; skim 2–3 elections. Mirror existing reward spreads per file (duel critical ≈ +2 stat +150–200 gold; election critical ≈ fame +6, verdict "GREAT +3", gradeDelta 3; urn critical ≈ +300; relic critical ≈ +240 +arcanum).
- [ ] **Step 2:** Author all 22 items. Card ids per minigame must be unique within that file.
- [ ] **Step 3:** Dup-id scan (no duplicates across all event + minigame files).
- [ ] **Step 4:** `pnpm test:server` (pass).
- [ ] **Step 5:** `pnpm i18n:check` (clean).
- [ ] **Step 6:** `pnpm lint` (clean).
- [ ] **Step 7:** Commit.

```bash
git add content/events/destiny.json content/minigames/duels.json content/minigames/elections.json content/minigames/debates.json content/minigames/urns.json content/minigames/relics.json content/minigames/press_conference.json
git commit -m "feat(content): expand fates & arena content 50% (destiny + minigames)"
```

---

### Task 5: Batch E — Slot pools (npcRole +38, npcName +40, locationName +30, worldLocation +12, creatureName +30)

**Files:**
- Modify: `content/slots.json` (append 150 entries across 5 pools)

**Interfaces:**
- Consumes: Task 0 tone; existing pool entry style (READ `slots.json` first).
- Produces: 150 new `{ en, es }` entries.

- [ ] **Step 1:** Read `content/slots.json` and count each pool. Record existing entries per pool so new ones are clearly different in meaning (near-duplicate *text* is the failure mode the scan below catches per-pool).
- [ ] **Step 2:** Append entries. Requirements per pool:
  - `npcRole` (+38): occupations/relationships people have, from the mundane to the mythic. **Important:** these roles may be pulled by the engine's slot fill into narrative that can be gender-inflected contexts? NO — slots are always substituted post-genderize (`helpers.ts:43`), so slots should be written WITHOUT player-referential gender inflection — write roles like "herbolario" (masculine noun) as the language neutral-authoring convention for NPC/group text. Match existing entries' phrasing style. No near-duplicates.
  - `npcName` (+40): first-name style names, culturally varied like existing.
  - `locationName` (+30): places of low density (an inn titled, a crossroads, an alley) — feminine or masculine article-optional short names as the existing file does (copy its pattern of whether entries include articles).
  - `worldLocation` (+12): big geography — regions, ruins, seas with descriptors, matching existing tone ("The Sunken Steps", "Ashen Road", style).
  - `creatureName` (+30): keep the raw → refined progression arc angle the existing creatures use; distinct from existing names.
- [ ] **Step 3:** Run the per-pool dup scan — publish counts:

Run: `powershell -Command "$s=Get-Content content/slots.json -Raw | ConvertFrom-Json; foreach($p in 'npcRole','npcName','locationName','worldLocation','creatureName'){ $arr=$s.$p | ForEach-Object { $_.en }; $dups=$arr | Group-Object | Where-Object Count -gt 1; Write-Output \"$p duplicates: $($dups.Count)\" }"`
Expected: `duplicates: 0` for all five pools. (If the existing file already contains a small number, add a note; do NOT remove existing entries — flag it to the user instead.)

- [ ] **Step 4:** Verify final pool sizes via a count command:

Run: `powershell -Command "$s=Get-Content content/slots.json -Raw | ConvertFrom-Json; foreach($p in 'npcRole','npcName','locationName','worldLocation','creatureName'){ Write-Output \"$p : $($s.$p.Count)\" }"`
Expected: npcRole 113, npcName 119, locationName 89, worldLocation 35, creatureName 90.

- [ ] **Step 5:** `pnpm test:server` (pass — registry loads slots).
- [ ] **Step 6:** `pnpm i18n:check` (clean).
- [ ] **Step 7:** `pnpm lint` (clean).
- [ ] **Step 8:** Commit.

```bash
git add content/slots.json
git commit -m "feat(content): expand slot pools 50% (roles/names/locations/creatures)"
```

---

### Task 6: Final verification

**Files:** none (read-only).

**Interfaces:**
- Consumes: completed Tasks 0–5.

- [ ] **Step 1:** Run the full suite:

Run: `pnpm test` (both suites).
Expected: all pass.

- [ ] **Step 2:** Run `pnpm i18n:check`.
Expected: clean.

- [ ] **Step 3:** Run `pnpm lint`.
Expected: clean.

- [ ] **Step 4:** Re-run the global dup-id scan (Task 0 Step 4 command). Expected: no duplicates.

- [ ] **Step 5:** Re-run the per-pool slot dup scan + count command (Task 5 Steps 3–4). Expected: no duplicates and the exact target sizes.

- [ ] **Step 6:** Report totals to the user (248 new items; 79 events, 19 minigames, 150 slot entries), and note that daily-seed determinism is untouched (no engine or RNG changes).
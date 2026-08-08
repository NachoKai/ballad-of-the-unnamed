import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import type {
  AchievementContent,
  ArchetypePool,
  ClassContent,
  ClassKit,
  CombatAbilityEffect,
  CreatureContent,
  CreatureMoveEffect,
  CreatureRarity,
  EventContent,
  FactionContent,
  LocaleMap,
  ShopItem,
  SlotPools,
} from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import { LOCALES } from "../../shared/i18n.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTENT_ROOT = join(__dirname, "..", "..", "content")

function readJson<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(CONTENT_ROOT, relPath), "utf8")) as T
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[content] ${msg}`)
}

// Validate every LocaleMap has all supported locales so nothing renders blank.
function validateLocaleMap(map: LocaleMap | undefined, where: string) {
  assert(map, `missing locale map at ${where}`)
  for (const loc of LOCALES) {
    assert(
      typeof map[loc] === "string" && map[loc].length > 0,
      `missing '${loc}' string at ${where}`,
    )
  }
}

export interface ContentRegistry {
  classes: ClassContent[]
  classesById: Map<string, ClassContent>
  archetypes: ArchetypePool
  events: EventContent[]
  eventsById: Map<string, EventContent>
  minigames: EventContent[]
  achievements: AchievementContent[]
  slots: SlotPools
  factions: FactionContent[]
  factionsById: Map<string, FactionContent>
  regions: Record<string, LocaleMap>
  reputationTiers: Record<string, LocaleMap>
  shop: ShopItem[]
  // Combat system: class kits keyed by class id, the creature roster, and the
  // combat encounter events (separate from the event/minigame banks).
  combats: EventContent[]
  combatsById: Map<string, EventContent>
  classKits: Record<string, ClassKit>
  creatures: CreatureContent[]
  creaturesById: Map<string, CreatureContent>
}

const CREATURE_RARITIES = ["common", "uncommon", "rare", "elite", "boss"] as const

export function isCreatureRarity(r: string): r is CreatureRarity {
  return (CREATURE_RARITIES as readonly string[]).includes(r)
}

const ABILITY_EFFECTS: CombatAbilityEffect[] = [
  "damage",
  "damage_and_debuff",
  "damage_over_time",
  "heal",
  "buff_attack",
  "buff_defense",
  "stun",
  "flee_boost",
  "steal",
]

const MOVE_EFFECTS: CreatureMoveEffect[] = [
  "damage",
  "self_buff_attack",
  "debuff_player_attack",
  "heal",
  "flee_if_low_hp",
]

const COMBAT_SCHOOLS = ["physical", "magic"] as const

const ARC_VALUES = [
  "child",
  "adventurer",
  "mercenary",
  "kingdom_hero",
  "legend",
  "old_hero",
] as const

let cached: ContentRegistry | null = null

export function loadContent(): ContentRegistry {
  if (cached) return cached

  const classes = readJson<ClassContent[]>("classes.json")
  for (const c of classes) {
    validateLocaleMap(c.name, `class ${c.id} name`)
    validateLocaleMap(c.description, `class ${c.id} description`)
  }

  const archetypes = readJson<ArchetypePool>("archetypes.json")
  for (const arr of Object.values(archetypes)) {
    for (const a of arr) {
      validateLocaleMap(a.name, `archetype ${a.id} name`)
      validateLocaleMap(a.flavor, `archetype ${a.id} flavor`)
    }
  }

  const slots = readJson<SlotPools>("slots.json")
  for (const [pool, entries] of Object.entries(slots)) {
    entries.forEach((e, i) => validateLocaleMap(e, `slot ${pool}[${i}]`))
  }

  const factionsRaw = readJson<{
    tiers: Record<string, LocaleMap>
    factions: Record<string, { name: LocaleMap; wealth: number; region?: string }>
  }>("factions.json")
  const factions = Object.entries(factionsRaw.factions).map(([id, f]) => ({
    id,
    name: f.name,
    wealth: f.wealth,
    region: f.region ?? "vale",
  }))
  for (const f of factions) validateLocaleMap(f.name, `faction ${f.id}`)
  const reputationTiers = factionsRaw.tiers
  for (const [id, name] of Object.entries(reputationTiers)) {
    validateLocaleMap(name, `tier ${id}`)
  }

  //  region names (bilingual), keyed by region id.
  const regions = readJson<Record<string, LocaleMap>>("regions.json")
  for (const [id, name] of Object.entries(regions)) {
    validateLocaleMap(name, `region ${id}`)
  }

  const achievements = readJson<{ achievements: AchievementContent[] }>(
    "achievements.json",
  ).achievements
  for (const a of achievements) {
    validateLocaleMap(a.name, `achievement ${a.id} name`)
    validateLocaleMap(a.description, `achievement ${a.id} description`)
  }

  // Load shop items.
  const shop = readJson<ShopItem[]>("shop.json")
  for (const item of shop) {
    validateLocaleMap(item.name, `shop ${item.id} name`)
    validateLocaleMap(item.flavor, `shop ${item.id} flavor`)
  }

  // Load every event JSON file in content/events (array per file).
  const events: EventContent[] = []
  for (const file of readdirSync(join(CONTENT_ROOT, "events"))) {
    if (!file.endsWith(".json")) continue
    const arr = readJson<EventContent[]>(join("events", file))
    for (const ev of arr) {
      validateLocaleMap(ev.narrative, `event ${ev.id} narrative`)
      assert(ev.choices && ev.choices.length > 0, `event ${ev.id} has no choices`)
      for (const ch of ev.choices) {
        validateLocaleMap(ch.label, `event ${ev.id} choice ${ch.id} label`)
        validateLocaleMap(ch.narrative, `event ${ev.id} choice ${ch.id} narrative`)
      }
      // Stat gating: an event whose choices are ALL stat-gated would
      // soft-lock the run (no selectable option, resolveChoice throws). Every
      // event with a gated choice must keep at least one ungated fallback.
      const gated = ev.choices.filter((ch) => ch.requiresStat).length
      if (gated > 0) {
        assert(
          gated < ev.choices.length,
          `event ${ev.id} gates all choices; keep at least one choice without requiresStat`,
        )
      }
      events.push(ev)
    }
  }

  // Load every minigame JSON file in content/minigames.
  const minigames: EventContent[] = []
  for (const file of readdirSync(join(CONTENT_ROOT, "minigames"))) {
    if (!file.endsWith(".json")) continue
    const arr = readJson<EventContent[]>(join("minigames", file))
    for (const mg of arr) {
      validateLocaleMap(mg.narrative, `minigame ${mg.id} narrative`)
      assert(mg.resolution, `minigame ${mg.id} has no resolution`)
      assert(mg.outcomes, `minigame ${mg.id} has no outcomes`)
      // Interactive minigames are multi-move games with no card grid; classic
      // minigames are a hidden-roll card pick and must author cards.
      const interactive = mg.resolution.type === "interactive"
      if (!interactive) {
        assert(mg.cards && mg.cards.length > 0, `minigame ${mg.id} has no cards`)
      } else {
        assert(
          mg.resolution.game === "tictactoe" ||
            mg.resolution.game === "rps" ||
            mg.resolution.game === "memotest" ||
            mg.resolution.game === "press_conference" ||
            mg.resolution.game === "circus_wheel",
          `minigame ${mg.id} invalid interactive game`,
        )
        assert(mg.primaryStat, `minigame ${mg.id} interactive needs primaryStat`)
        if (mg.resolution.game === "circus_wheel") {
          assert(
            mg.wheel && mg.wheel.segments.length >= 2,
            `minigame ${mg.id} circus_wheel needs wheel segments`,
          )
          assert(mg.wheel.cost > 0, `minigame ${mg.id} circus_wheel needs a positive cost`)
          for (const seg of mg.wheel.segments) {
            validateLocaleMap(seg.label, `minigame ${mg.id} wheel segment ${seg.id} label`)
            assert(
              ["gold", "jackpot", "nothing", "freespin", "item", "fame", "mystery"].includes(
                seg.kind,
              ),
              `minigame ${mg.id} wheel segment ${seg.id} invalid kind`,
            )
            if (seg.kind === "item") {
              assert(seg.itemId, `minigame ${mg.id} wheel segment ${seg.id} item needs itemId`)
            }
            if (["gold", "jackpot", "fame"].includes(seg.kind)) {
              assert(
                typeof seg.amount === "number" && seg.amount > 0,
                `minigame ${mg.id} wheel segment ${seg.id} needs amount`,
              )
            }
            if (seg.kind === "mystery") {
              assert(
                typeof seg.amount === "number" && seg.amount > 0,
                `minigame ${mg.id} wheel segment ${seg.id} mystery needs amount`,
              )
              assert(
                typeof seg.healthCost === "number" && seg.healthCost > 0,
                `minigame ${mg.id} wheel segment ${seg.id} mystery needs healthCost`,
              )
              if (seg.chance !== undefined) {
                assert(
                  typeof seg.chance === "number" && seg.chance >= 0 && seg.chance <= 1,
                  `minigame ${mg.id} wheel segment ${seg.id} mystery chance must be 0..1`,
                )
              }
            }
          }
        }
        if (mg.resolution.game === "press_conference") {
          assert(
            Array.isArray(mg.questions) && mg.questions.length > 0,
            `minigame ${mg.id} press_conference needs questions`,
          )
          for (const q of mg.questions) {
            validateLocaleMap(q.prompt, `minigame ${mg.id} question ${q.id || ""} prompt`)
            assert(
              q.options && q.options.length === 4,
              `minigame ${mg.id} question ${q.id} needs 4 options`,
            )
            for (const op of q.options) {
              assert(op.tag, `minigame ${mg.id} question ${q.id} option ${op.id} needs tag`)
            }
          }
        }
      }
      for (const card of mg.cards ?? []) {
        validateLocaleMap(card.label, `minigame ${mg.id} card ${card.id} label`)
      }
      for (const tier of ["critical", "success", "partial", "fail"] as const) {
        validateLocaleMap(mg.outcomes[tier]?.narrative, `minigame ${mg.id} outcome ${tier}`)
      }
      minigames.push(mg)
    }
  }

  // Load combat class kits (keyed by class id) — every class must have one.
  const classKits = readJson<Record<string, ClassKit>>("combat/class-kits.json")
  for (const cls of classes) {
    const kit = classKits[cls.id]
    assert(kit, `class ${cls.id} has no combat kit`)
    validateLocaleMap(kit.basicAttack.label, `kit ${cls.id} basicAttack label`)
    validateLocaleMap(kit.abilityMenuLabel, `kit ${cls.id} abilityMenuLabel`)
    validateLocaleMap(kit.resourceLabel, `kit ${cls.id} resourceLabel`)
    assert(
      (STAT_KEYS as readonly string[]).includes(kit.resourceStat),
      `kit ${cls.id} invalid resourceStat`,
    )
    assert(kit.resourceMultiplier > 0, `kit ${cls.id} needs a positive resourceMultiplier`)
    assert(kit.abilities.length > 0, `kit ${cls.id} has no abilities`)
    for (const ab of kit.abilities) {
      validateLocaleMap(ab.label, `kit ${cls.id} ability ${ab.id} label`)
      assert(ab.cost >= 1, `kit ${cls.id} ability ${ab.id} needs a positive cost`)
      assert(ABILITY_EFFECTS.includes(ab.effect), `kit ${cls.id} ability ${ab.id} invalid effect`)
      assert(COMBAT_SCHOOLS.includes(ab.school), `kit ${cls.id} ability ${ab.id} invalid school`)
      assert(
        (STAT_KEYS as readonly string[]).includes(ab.stat),
        `kit ${cls.id} ability ${ab.id} invalid stat`,
      )
      if (ab.unlockAge != null)
        assert(ab.unlockAge >= 0, `kit ${cls.id} ability ${ab.id} bad unlockAge`)
      if (ab.stunChance != null) {
        assert(
          ab.stunChance >= 0 && ab.stunChance <= 1,
          `kit ${cls.id} ability ${ab.id} stunChance must be 0..1`,
        )
      }
      if (ab.statusTurns != null)
        assert(ab.statusTurns >= 1, `kit ${cls.id} ability ${ab.id} bad statusTurns`)
    }
  }

  // Load the creature roster.
  const creatures = readJson<CreatureContent[]>("combat/creatures.json")
  for (const cr of creatures) {
    validateLocaleMap(cr.name, `creature ${cr.id} name`)
    assert(isCreatureRarity(cr.rarity), `creature ${cr.id} invalid rarity`)
    assert(cr.health >= 1, `creature ${cr.id} needs health`)
    assert(cr.attack >= 0, `creature ${cr.id} needs attack`)
    assert(cr.defense >= 0, `creature ${cr.id} needs defense`)
    assert(cr.magicResistance >= 0, `creature ${cr.id} needs magicResistance`)
    assert(cr.moves.length > 0, `creature ${cr.id} has no moves`)
    for (const mv of cr.moves) {
      assert(mv.weight > 0, `creature ${cr.id} move ${mv.id} needs a positive weight`)
      assert(MOVE_EFFECTS.includes(mv.effect), `creature ${cr.id} move ${mv.id} invalid effect`)
      if (mv.name) validateLocaleMap(mv.name, `creature ${cr.id} move ${mv.id} name`)
      if (mv.minHealthFraction != null) {
        assert(
          mv.minHealthFraction >= 0 && mv.minHealthFraction <= 1,
          `creature ${cr.id} move ${mv.id} minHealthFraction must be 0..1`,
        )
      }
      if (mv.maxHealthFraction != null) {
        assert(
          mv.maxHealthFraction >= 0 && mv.maxHealthFraction <= 1,
          `creature ${cr.id} move ${mv.id} maxHealthFraction must be 0..1`,
        )
      }
      if (mv.minHealthFraction != null && mv.maxHealthFraction != null) {
        assert(
          mv.minHealthFraction <= mv.maxHealthFraction,
          `creature ${cr.id} move ${mv.id} minHealthFraction exceeds maxHealthFraction`,
        )
      }
    }
    for (const arc of cr.arcs ?? []) {
      assert(
        (ARC_VALUES as readonly string[]).includes(arc),
        `creature ${cr.id} invalid arc ${arc}`,
      )
    }
    assert(cr.loot.goldMax >= cr.loot.goldMin, `creature ${cr.id} loot gold range inverted`)
    assert(cr.loot.fameMax >= cr.loot.fameMin, `creature ${cr.id} loot fame range inverted`)
    for (const drop of cr.loot.items ?? []) {
      assert(
        shop.some((s) => s.id === drop.itemId),
        `creature ${cr.id} item drop ${drop.itemId} not in shop`,
      )
      assert(
        drop.chance >= 0 && drop.chance <= 1,
        `creature ${cr.id} item drop ${drop.itemId} chance must be 0..1`,
      )
    }
    assert(
      cr.fleeDifficulty >= 0 && cr.fleeDifficulty <= 1,
      `creature ${cr.id} fleeDifficulty must be 0..1`,
    )
  }
  const creaturesById = new Map(creatures.map((cr) => [cr.id, cr]))

  // World-event combat menaces must target real creatures with sane knobs.
  // (Validated after the roster loads — events load earlier in this file.)
  for (const ev of events) {
    const menace = ev.combatMenace
    if (!menace) continue
    assert(menace.creatureIds.length > 0, `event ${ev.id} combatMenace needs creatureIds`)
    for (const cid of menace.creatureIds) {
      assert(creaturesById.has(cid), `event ${ev.id} combatMenace unknown creature ${cid}`)
    }
    assert(menace.weightMultiplier > 1, `event ${ev.id} combatMenace weightMultiplier must be > 1`)
    assert(menace.durationSeasons >= 1, `event ${ev.id} combatMenace needs durationSeasons >= 1`)
    assert(menace.killTarget >= 1, `event ${ev.id} combatMenace needs killTarget >= 1`)
  }

  // Load combat encounters — separate bank, never part of the event rotation.
  const combats: EventContent[] = []
  for (const file of readdirSync(join(CONTENT_ROOT, "combat"))) {
    if (!file.endsWith(".json") || file === "class-kits.json" || file === "creatures.json") {
      continue
    }
    const arr = readJson<EventContent[]>(join("combat", file))
    for (const ev of arr) {
      validateLocaleMap(ev.narrative, `combat encounter ${ev.id} narrative`)
      assert(ev.type === "combat", `combat encounter ${ev.id} must have type "combat"`)
      assert(ev.weight > 0, `combat encounter ${ev.id} needs a positive weight`)
      assert(
        ev.combat && ev.combat.creatures.length > 0,
        `combat encounter ${ev.id} has no creatures`,
      )
      for (const cid of ev.combat.creatures) {
        assert(creaturesById.has(cid), `combat encounter ${ev.id} unknown creature ${cid}`)
      }
      combats.push(ev)
    }
  }

  const eventsById = new Map(events.map((e) => [e.id, e]))
  const classesById = new Map(classes.map((c) => [c.id, c]))
  const factionsById = new Map(factions.map((f) => [f.id, f]))
  const combatsById = new Map(combats.map((e) => [e.id, e]))

  cached = {
    classes,
    classesById,
    archetypes,
    events,
    eventsById,
    minigames,
    achievements,
    slots,
    factions,
    factionsById,
    regions,
    reputationTiers,
    shop,
    combats,
    combatsById,
    classKits,
    creatures,
    creaturesById,
  }
  return cached
}

import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import type {
  AchievementContent,
  ClassContent,
  EventContent,
  LocaleMap,
  SlotPools,
} from "../../shared/types.js"
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
  events: EventContent[]
  eventsById: Map<string, EventContent>
  minigames: EventContent[]
  achievements: AchievementContent[]
  slots: SlotPools
  factions: { id: string; name: LocaleMap }[]
  reputationTiers: Record<string, LocaleMap>
}

let cached: ContentRegistry | null = null

export function loadContent(): ContentRegistry {
  if (cached) return cached

  const classes = readJson<ClassContent[]>("classes.json")
  for (const c of classes) {
    validateLocaleMap(c.name, `class ${c.id} name`)
    validateLocaleMap(c.description, `class ${c.id} description`)
  }

  const slots = readJson<SlotPools>("slots.json")
  for (const [pool, entries] of Object.entries(slots)) {
    entries.forEach((e, i) => validateLocaleMap(e, `slot ${pool}[${i}]`))
  }

  const factionsRaw = readJson<{
    tiers: Record<string, LocaleMap>
    factions: Record<string, LocaleMap>
  }>("factions.json")
  const factions = Object.entries(factionsRaw.factions).map(([id, name]) => ({
    id,
    name,
  }))
  for (const f of factions) validateLocaleMap(f.name, `faction ${f.id}`)
  const reputationTiers = factionsRaw.tiers
  for (const [id, name] of Object.entries(reputationTiers)) {
    validateLocaleMap(name, `tier ${id}`)
  }

  const achievements =
    readJson<{ achievements: AchievementContent[] }>("achievements.json")
      .achievements
  for (const a of achievements) {
    validateLocaleMap(a.name, `achievement ${a.id} name`)
    validateLocaleMap(a.description, `achievement ${a.id} description`)
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
      assert(mg.cards && mg.cards.length > 0, `minigame ${mg.id} has no cards`)
      assert(mg.resolution, `minigame ${mg.id} has no resolution`)
      assert(mg.outcomes, `minigame ${mg.id} has no outcomes`)
      for (const card of mg.cards) {
        validateLocaleMap(card.label, `minigame ${mg.id} card ${card.id} label`)
      }
      for (const tier of ["critical", "success", "partial", "fail"] as const) {
        validateLocaleMap(
          mg.outcomes[tier]?.narrative,
          `minigame ${mg.id} outcome ${tier}`,
        )
      }
      minigames.push(mg)
    }
  }

  const eventsById = new Map(events.map((e) => [e.id, e]))
  const classesById = new Map(classes.map((c) => [c.id, c]))

  cached = {
    classes,
    classesById,
    events,
    eventsById,
    minigames,
    achievements,
    slots,
    factions,
    reputationTiers,
  }
  return cached
}

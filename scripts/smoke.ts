import { Rng, hashSeed } from "../shared/rng.js"
import { loadContent } from "../server/content/registry.js"
import {
  buildServedEvent,
  createCharacter,
  resolveChoice,
  resolveMinigame,
} from "../server/engine/engine.js"
import { evaluateAchievements } from "../server/engine/achievements.js"

const reg = loadContent()
console.log(
  "content loaded:",
  reg.events.length,
  "events,",
  reg.minigames.length,
  "minigames,",
  reg.achievements.length,
  "achievements,",
  reg.classes.length,
  "classes",
)

for (const classId of ["warrior", "wizard", "rogue", "ranger"]) {
  const rng = new Rng(hashSeed(`smoke-${classId}`))
  const c = createCharacter({
    id: "t",
    name: "Test",
    classId,
    locale: "en",
    registry: reg,
  })
  let turns = 0
  while (c.status === "alive" && turns < 300) {
    const { event, served } = buildServedEvent(c, reg, rng)
    const isMini = event.type === "minigame" || Boolean(event.cards)
    const out = isMini
      ? resolveMinigame(c, event, event.cards![0].id, reg, rng)
      : resolveChoice(c, event, served.choices[0].id, reg, rng)
    evaluateAchievements(c, reg, { endingType: out.endingType })
    turns++
    if (out.ended) {
      console.log(
        `[${classId}] ENDED turn ${turns}: ${out.endingType} @ age ${c.age}, ach ${c.achievements.length}, gold ${c.gold}, power ${c.powerLevel}`,
      )
      break
    }
  }
  if (c.status === "alive") {
    console.log(`[${classId}] still alive after ${turns} turns, age ${c.age}`)
  }
}

// Determinism check: same seed must produce identical ending.
function run(seed: string): string {
  const rng = new Rng(hashSeed(seed))
  const c = createCharacter({
    id: "d",
    name: "D",
    classId: "rogue",
    locale: "en",
    registry: reg,
  })
  let turns = 0

  while (c.status === "alive" && turns < 300) {
    const { event, served } = buildServedEvent(c, reg, rng)
    const isMini = event.type === "minigame" || Boolean(event.cards)
    const out = isMini
      ? resolveMinigame(c, event, event.cards![0].id, reg, rng)
      : resolveChoice(c, event, served.choices[0].id, reg, rng)
    turns++
    if (out.ended) return `${out.endingType}:${c.age}:${c.gold}:${turns}`
  }

  return `alive:${c.age}`
}

const a = run("daily-2026-07-25")
const b = run("daily-2026-07-25")

console.log("determinism:", a === b ? "PASS" : "FAIL", `(${a} vs ${b})`)

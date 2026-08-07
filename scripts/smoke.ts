import { Rng, hashSeed } from "../shared/rng.js"
import { loadContent } from "../server/content/registry.js"
import {
  applyMinigameOutcome,
  buildServedEvent,
  createCharacter,
  resolveChoice,
  resolveMinigame,
} from "../server/engine/engine.js"
import {
  applyInteractiveMove,
  createInteractiveState,
  interactiveTier,
} from "../server/engine/minigames/index.js"
import { evaluateAchievements } from "../server/engine/achievements.js"
import type {
  CharacterState,
  EventContent,
  InteractiveMove,
  PendingMinigameState,
} from "../shared/types.js"
import type { ServedEvent } from "../shared/types.js"
import type { ResolveOutput } from "../server/engine/engine.js"

// Simulated player for the memotest: once the deck is known it always flips a
// matching pair, so the smoke sim resolves the altar quickly and deterministically.
function memotestSmokeCard(state: PendingMinigameState): number {
  const revealed = state.revealed ?? []
  const matched = state.matched ?? []
  const deck = state.deck
  if (revealed.length === 1) {
    const first = revealed[0]
    if (deck) {
      for (let i = 0; i < deck.length; i++) {
        if (i !== first && deck[i] === deck[first] && !matched.includes(i)) return i
      }
    }
  }
  for (let i = 0; i < 16; i++) {
    if (!matched.includes(i) && !revealed.includes(i)) return i
  }
  return 0
}

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

// Resolve one served event, driving interactive minigames to completion through
// the move engine (they have no cards and never go through the card-pick roll).
function resolveServed(
  c: CharacterState,
  event: EventContent,
  served: ServedEvent,
  rng: Rng,
): ResolveOutput {
  if (event.resolution?.type === "interactive") {
    if (!c.pendingMinigame) c.pendingMinigame = createInteractiveState(event)
    const state = c.pendingMinigame
    const primaryStat = c[event.primaryStat ?? "intelligence"] as number
    let over = false
    while (!over) {
      const move: InteractiveMove =
        state.game === "tictactoe"
          ? { kind: "tictactoe", cell: (state.board ?? []).findIndex((x) => x === null) }
          : state.game === "memotest"
            ? { kind: "memotest", card: memotestSmokeCard(state) }
            : state.game === "press_conference"
              ? { kind: "press_conference", card: 0 }
              : { kind: "rps", choice: "rock" }
      over = applyInteractiveMove(state, move, primaryStat, rng, event.resolution, c).over
    }
    c.pendingMinigame = null
    return applyMinigameOutcome(c, event, interactiveTier(state), reg, rng)
  }
  const isMini = event.type === "minigame" || Boolean(event.cards)
  if (isMini) return resolveMinigame(c, event, event.cards![0].id, reg, rng)
  // A simulated player can't pick a stat-locked choice — filter them out.
  const playable = served.choices.filter((ch) => ch.statMet !== false)
  const choiceId = (playable[0] ?? served.choices[0])?.id
  return resolveChoice(c, event, choiceId, reg, rng)
}

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
    const out = resolveServed(c, event, served, rng)
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
    const out = resolveServed(c, event, served, rng)
    turns++
    if (out.ended) return `${out.endingType}:${c.age}:${c.gold}:${turns}`
  }

  return `alive:${c.age}`
}

const a = run("daily-2026-07-25")
const b = run("daily-2026-07-25")

console.log("determinism:", a === b ? "PASS" : "FAIL", `(${a} vs ${b})`)

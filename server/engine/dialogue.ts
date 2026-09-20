import { createHash } from "node:crypto"
import type { CharacterState, EventContent } from "../../shared/types.js"
import { localize } from "./helpers.js"
import { buildThreadRecap } from "./threadPick.js"
import { askJevChoice, jevEnabled } from "./jev.js"
import { getJevCache, putJevCache } from "../store/jevCache.js"

// ---------------------------------------------------------------------------
// Free-text dialogue: classify the player's answer into one of the event's
// authored interpretations. Jev only ever picks an id; all prose, numbers, and
// flags are authored. Any failure (no key, timeout, low confidence, bad shape)
// degrades to the event's authored fallback so the run is never blocked.
// ---------------------------------------------------------------------------

const CONFIDENCE_FLOOR = 0.3

function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// Cache is keyed on the UTC day + event + normalized answer, so every player
// who types the same reply to the same event shares one Jev call and outcome.
export function dialogueCacheKey(eventId: string, answer: string, day = utcDay()): string {
  const normalized = answer.trim().toLowerCase().replace(/\s+/g, " ")
  return createHash("sha256").update(`${day}|${eventId}|${normalized}`).digest("hex")
}

// A canned shortcut bypasses Jev entirely: its id is an interpretation id that
// carries a shortcutLabel. Returns the interpretation id, or null.
export function resolveDialogueShortcut(event: EventContent, choiceId: string): string | null {
  const interp = (event.interpretations ?? []).find(
    (i) => i.id === choiceId && Boolean(i.shortcutLabel),
  )
  return interp ? interp.id : null
}

// Returns the authored interpretation id to resolve against. Never throws.
export async function classifyDialogue(
  c: CharacterState,
  event: EventContent,
  answer: string,
): Promise<string> {
  const interpretations = event.interpretations ?? []
  const fallback = event.fallback!
  if (!jevEnabled() || interpretations.length === 0) return fallback

  const key = dialogueCacheKey(event.id, answer)
  const cached = await getJevCache(key).catch(() => null)
  if (cached && interpretations.some((i) => i.id === cached.choice)) return cached.choice

  const instructions =
    (event.rubricInstructions && localize(event.rubricInstructions, "en")) ||
    "Classify the player's reply by the closest matching intent."
  const criteria = Object.fromEntries(interpretations.map((i) => [i.id, localize(i.intent, "en")]))

  const answers = await askJevChoice(buildThreadRecap(c), [{ id: "reply", instructions, criteria }])
  const answer_ = answers?.[0]
  if (
    answer_ &&
    answer_.confidence >= CONFIDENCE_FLOOR &&
    interpretations.some((i) => i.id === answer_.choice)
  ) {
    await putJevCache(key, answer_.choice, answer_).catch(() => {})
    return answer_.choice
  }
  return fallback
}

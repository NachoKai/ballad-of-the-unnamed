import { createHash } from "node:crypto"
import type { CharacterState, ThreadContent } from "../../shared/types.js"
import type { ContentRegistry } from "../content/registry.js"
import { localize } from "./helpers.js"
import { askJevChoice, jevEnabled } from "./jev.js"
import { getJevCache, putJevCache } from "../store/jevCache.js"

// ---------------------------------------------------------------------------
// Coarse, PII-free signature for the daily Jev thread pick.
//
// The signature deliberately excludes the run id, the turn log, and any free
// text: every player who reaches the same decision that day shares one cache
// entry (and therefore one Jev call and one outcome). Determinism (same UTC day
// + same coarse state → same pick) depends on this being stable and sorted.
// ---------------------------------------------------------------------------

// The flags that can actually gate a thread, unioned once per registry. Only
// these appear in the signature so unrelated flags don't fragment the cache.
const flagsCache = new WeakMap<ContentRegistry, Set<string>>()

export function threadRelevantFlags(registry: ContentRegistry): Set<string> {
  const cached = flagsCache.get(registry)
  if (cached) return cached
  const set = new Set<string>()
  for (const t of registry.threads) {
    for (const k of Object.keys(t.requiresFlag ?? {})) set.add(k)
    for (const k of Object.keys(t.excludeIfFlag ?? {})) set.add(k)
  }
  flagsCache.set(registry, set)
  return set
}

function dominantTags(c: CharacterState): string[] {
  return Object.entries(c.personality)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k)
}

export function coarseSignature(c: CharacterState, relevantFlags: Set<string>): string {
  return JSON.stringify({
    class: c.class,
    archetype: c.archetype,
    arc: c.currentArc,
    region: c.currentRegion,
    fameTier: Math.floor(c.fame / 100),
    goldTier: Math.floor(c.gold / 250),
    tags: dominantTags(c),
    flags: Object.keys(c.flags)
      .filter((f) => relevantFlags.has(f))
      .sort(),
  })
}

// Human-readable recap sent to Jev as `state`. Never shown to the player and
// never persisted.
export function buildThreadRecap(c: CharacterState): string {
  const tags = dominantTags(c)
  return (
    `A ${c.age}-year-old ${c.class} (${c.archetype ?? "unproven"}) in the ${c.currentArc} arc ` +
    `of ${c.currentRegion}. Fame ${c.fame}, gold ${c.gold}. ` +
    `Dominant traits: ${tags.join(", ") || "none"}.`
  )
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

export function threadPickCacheKey(
  coarseSignature: string,
  candidateIds: string[],
  day = utcDay(),
): string {
  const canonical = JSON.stringify([...candidateIds].sort())
  return createHash("sha256").update(`${day}|${coarseSignature}|${canonical}`).digest("hex")
}

// Refine a just-opened thread to the Jev-chosen candidate (daily-cached). Runs
// at the route layer because it touches the network; the engine already picked a
// deterministic fallback, so every failure path here leaves the run playable.
// Returns true when the character was mutated (caller should persist).
export async function refineThreadPick(
  c: CharacterState,
  registry: ContentRegistry,
): Promise<boolean> {
  if (!c.threadPickPending || !c.activeThread || !jevEnabled()) return false
  const ids = c.threadCandidates ?? [c.activeThread.id]
  const candidates = ids
    .map((id) => registry.threads.find((t) => t.id === id))
    .filter((t): t is ThreadContent => Boolean(t))
  if (candidates.length === 0) {
    c.threadPickPending = false
    return true
  }

  const key = threadPickCacheKey(
    coarseSignature(c, threadRelevantFlags(registry)),
    candidates.map((t) => t.id),
  )
  const cached = await getJevCache(key).catch(() => null)
  let choice = cached?.choice
  if (!choice) {
    const answers = await askJevChoice(buildThreadRecap(c), [
      {
        id: "thread",
        instructions: "Which story thread best continues this character's saga?",
        criteria: Object.fromEntries(candidates.map((t) => [t.id, localize(t.title, "en")])),
      },
    ])
    const answer = answers?.[0]
    if (answer && answer.confidence >= 0.3) {
      choice = answer.choice
      await putJevCache(key, choice, answer).catch(() => {})
    }
  }

  if (choice && candidates.some((t) => t.id === choice) && c.activeThread.id !== choice) {
    c.activeThread = { id: choice, beatIndex: 0 }
  }
  c.threadPickPending = false
  return true
}

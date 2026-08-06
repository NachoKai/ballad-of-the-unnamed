// Hidden \"master\" archetype unlocks (Phase 8.1). The game has no accounts —
// runs are owned by possession of the run id — so the unlock set (classes with
// at least one finished run) lives in localStorage per browser. The server
// never persists it: `/archetype-draw` and `/new` trust the `unlockedClasses`
// array the client sends, consistent with the run-token ownership model.

const UNLOCKED_KEY = "botu_unlocked_archetypes"

// Classes the player has finished a run with (unlocked master archetypes).
export function readUnlockedClasses(): string[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : []
  } catch {
    return []
  }
}

// Marks a class as unlocked after a finished run. Returns true when the class
// was NOT already unlocked (the caller can fire a \"new archetype unlocked\"
// toast only on first unlock).
export function stampUnlockedClass(classId: string): boolean {
  const current = readUnlockedClasses()
  if (current.includes(classId)) return false
  const next = [...current, classId]
  try {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify(next))
  } catch {
    // Storage full/blocked — the unlock is cosmetic; the run already counts.
  }
  return true
}

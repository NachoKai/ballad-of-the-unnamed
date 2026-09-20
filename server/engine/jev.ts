// Thin, dependency-free client for the TypeSafe/Jev classification API.
//
// Jev is used ONLY to classify free text into one of a set of authored options;
// it never decides numbers and never writes prose. The server must run fully
// without a key, so every failure path degrades to `null` and callers fall back
// to authored content. We never retry and never throw.

const JEV_URL = "https://api.typesafe.ai/v1/systemone"
const JEV_TIMEOUT_MS = 1200

export interface JevChoiceQuestion {
  id: string
  instructions: string
  criteria: Record<string, string | null>
}

export interface JevChoiceAnswer {
  id: string
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

// Jev is on for the whole deployment iff the key is set; availability is never
// per-player.
export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY)
}

// Returns null on: missing key, timeout, non-2xx, or any malformed/invalid
// shape. Never throws. Never retries.
export async function askJevChoice(
  state: string,
  questions: JevChoiceQuestion[],
  timeoutMs = JEV_TIMEOUT_MS,
): Promise<JevChoiceAnswer[] | null> {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const body = {
      state,
      model: "jev-latest",
      questions: Object.fromEntries(
        questions.map((q) => [
          q.id,
          { type: "choice", instructions: q.instructions, criteria: q.criteria },
        ]),
      ),
    }
    const res = await fetch(JEV_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { answers?: Record<string, unknown> }
    if (!json.answers) return null
    const out: JevChoiceAnswer[] = []
    for (const q of questions) {
      const a = json.answers[q.id] as
        | { type?: string; choice?: unknown; confidence?: unknown; probabilities?: unknown }
        | undefined
      if (!a || a.type !== "choice") return null
      if (typeof a.choice !== "string") return null
      if (!Object.keys(q.criteria).includes(a.choice)) return null
      if (typeof a.confidence !== "number" || a.confidence < 0 || a.confidence > 1) return null
      if (typeof a.probabilities !== "object" || a.probabilities === null) return null
      out.push({
        id: q.id,
        choice: a.choice,
        confidence: a.confidence,
        probabilities: a.probabilities as Record<string, number>,
      })
    }
    return out
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

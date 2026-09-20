import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { askJevChoice, jevEnabled, type JevChoiceQuestion } from "./jev.js"

const QUESTIONS: JevChoiceQuestion[] = [
  {
    id: "thread",
    instructions: "Which thread fits?",
    criteria: { smoke_thread: "The Smoke Test", other: "Other" },
  },
]

function okBody(choice = "smoke_thread", confidence = 0.5): string {
  return JSON.stringify({
    answers: {
      thread: {
        type: "choice",
        choice,
        confidence,
        probabilities: { smoke_thread: confidence, other: 1 - confidence },
      },
    },
  })
}

function jsonResponse(body: string | unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response
}

describe("jev client", () => {
  const originalKey = process.env.TYPESAFE_API_KEY

  beforeEach(() => {
    process.env.TYPESAFE_API_KEY = "test-key"
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.TYPESAFE_API_KEY
    else process.env.TYPESAFE_API_KEY = originalKey
    vi.unstubAllGlobals()
  })

  it("reports enabled iff the key is set", () => {
    expect(jevEnabled()).toBe(true)
    delete process.env.TYPESAFE_API_KEY
    expect(jevEnabled()).toBe(false)
  })

  it("returns parsed answers on success", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(okBody()))
    vi.stubGlobal("fetch", fetchMock)

    const out = await askJevChoice("state", QUESTIONS)
    expect(out).toEqual([
      {
        id: "thread",
        choice: "smoke_thread",
        confidence: 0.5,
        probabilities: { smoke_thread: 0.5, other: 0.5 },
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key")
  })

  it("returns null (and does not call fetch) without a key", async () => {
    delete process.env.TYPESAFE_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await askJevChoice("state", QUESTIONS)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns null when the request aborts (timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          })
        }),
    )

    expect(await askJevChoice("state", QUESTIONS, 10)).toBeNull()
  })

  it("returns null when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network"))),
    )
    expect(await askJevChoice("state", QUESTIONS)).toBeNull()
  })

  it("returns null on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse("{}", 500)),
    )
    expect(await askJevChoice("state", QUESTIONS)).toBeNull()
  })

  it("returns null on a malformed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ nope: true })),
    )
    expect(await askJevChoice("state", QUESTIONS)).toBeNull()
  })

  it("returns null when the chosen option is not in the criteria", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(okBody("unknown_option"))),
    )
    expect(await askJevChoice("state", QUESTIONS)).toBeNull()
  })

  it("returns null on an invalid confidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(okBody("smoke_thread", 5))),
    )
    expect(await askJevChoice("state", QUESTIONS)).toBeNull()
  })
})

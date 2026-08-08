import { describe, expect, it, vi } from "vitest"
import { hoistErr, renderJson, renderPretty } from "./logger.js"

describe("structured logger rendering", () => {
  it("renderJson emits a single parseable line with ts/level/msg + fields", () => {
    const line = renderJson(new Date("2026-08-08T10:00:00.000Z"), "info", "request", {
      reqId: "abc123",
      method: "POST",
      path: "/api/game/new",
      status: 200,
    })
    expect(line.split("\n")).toHaveLength(1)
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed.ts).toBe("2026-08-08T10:00:00.000Z")
    expect(parsed.level).toBe("info")
    expect(parsed.msg).toBe("request")
    expect(parsed.reqId).toBe("abc123")
    expect(parsed.status).toBe(200)
  })

  it("hoists an err field into a serializable name/message/code/stack object", () => {
    const boom = new Error("boom") as Error & { code?: string }
    boom.code = "E_TEST"
    const line = renderJson(new Date(), "error", "request failed", { err: boom })
    const parsed = JSON.parse(line) as {
      err: { name: string; message: string; code?: string; stack: string }
    }
    expect(parsed.err.name).toBe("Error")
    expect(parsed.err.message).toBe("boom")
    expect(parsed.err.code).toBe("E_TEST")
    expect(parsed.err.stack).toContain("Error: boom")
  })

  it("renderPretty prints key=value pairs and the error stack as an indented block", () => {
    const boom = new Error("boom")
    const line = renderPretty(new Date("2026-08-08T10:00:00.000Z"), "error", "request failed", {
      reqId: "abc123",
      err: boom,
    })
    expect(line).toContain("ERROR request failed")
    expect(line).toContain("reqId=abc123")
    expect(line).toContain("\n    Error: boom")
  })

  it("pretty keeps safe values bare and quotes values containing spaces", () => {
    const line = renderPretty(new Date(), "info", "x", {
      path: "/api/game/new",
      name: "the Grand Melee",
      count: 3,
    })
    expect(line).toContain("path=/api/game/new")
    expect(line).toContain('name="the Grand Melee"')
    expect(line).toContain("count=3")
  })

  it("hoistErr leaves non-Error err fields untouched", () => {
    const out = hoistErr({ err: "plain string" })
    expect(out.err).toBe("plain string")
  })
})

// The emit path reads LOG_FORMAT / LOG_LEVEL / NODE_ENV at module load — these
// tests re-import the module with a controlled env to lock that behavior.
describe("structured logger env plumbing", () => {
  it("honors LOG_FORMAT=json and LOG_LEVEL=debug", async () => {
    vi.resetModules()
    const prevFormat = process.env.LOG_FORMAT
    const prevLevel = process.env.LOG_LEVEL
    process.env.LOG_FORMAT = "json"
    process.env.LOG_LEVEL = "debug"
    const mod = await import("./logger.js")
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    try {
      mod.log.info("request", { reqId: "abc" })
      mod.log.debug("trace", {})
      // debug floor is 10 — both info and debug are above it.
      expect(write).toHaveBeenCalledTimes(2)
      const [first, second] = write.mock.calls.map((c) => String(c[0]))
      const parsed = JSON.parse(first) as { msg: string; level: string; reqId: string }
      expect(parsed.msg).toBe("request")
      expect(parsed.level).toBe("info")
      expect(parsed.reqId).toBe("abc")
      expect((JSON.parse(second) as { msg: string }).msg).toBe("trace")
    } finally {
      vi.restoreAllMocks()
      if (prevFormat === undefined) delete process.env.LOG_FORMAT
      else process.env.LOG_FORMAT = prevFormat
      if (prevLevel === undefined) delete process.env.LOG_LEVEL
      else process.env.LOG_LEVEL = prevLevel
    }
  })

  it("defaults the floor to warn under test — info suppressed, errors still logged", async () => {
    vi.resetModules()
    delete process.env.LOG_LEVEL
    delete process.env.LOG_FORMAT
    const mod = await import("./logger.js")
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    const errStream = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      mod.log.info("request", {})
      expect(out).not.toHaveBeenCalled()
      mod.log.error("request failed", { err: new Error("boom") })
      // Errors go to stderr and carry the hoisted stack.
      const line = String(errStream.mock.calls[0]?.[0] ?? "")
      expect(line).toContain("request failed")
      expect(line).toContain("boom")
    } finally {
      vi.restoreAllMocks()
    }
  })
})

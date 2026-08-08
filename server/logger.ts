// ---------------------------------------------------------------------------
// Structured logger.
//
// Every line carries a timestamp, a level, a short `msg` (a stable event
// name, e.g. "request", "shop.purchase", "leaderboard.fetch"), and a flat
// field bag — so logs can be grepped by key (runId=..., itemId=...) or piped
// to a JSON log aggregator as-is.
//
// Formats:
//   - default (dev):   human-readable key=value lines, colors on TTY, the
//     error stack as an indented block. Same fields, just readable.
//   - LOG_FORMAT=json: one JSON object per line
//     {"ts":"2026-08-08T…","level":"info","msg":"request","reqId":"…",…}
//     (also the default when NODE_ENV=production).
//   - LOG_LEVEL=debug|info|warn|error controls the floor (defaults to warn
//     under test so suites stay quiet, info elsewhere).
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogFields = Record<string, unknown>

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

// NOTE: LOG_FORMAT / LOG_LEVEL / NODE_ENV are read once at module load and
// frozen for the process lifetime — fine for a single-process server, but
// tests that want to flip them must vi.resetModules() before re-importing.
const DEFAULT_FORMAT = process.env.NODE_ENV === "production" ? "json" : "pretty"
const PRETTY = (process.env.LOG_FORMAT ?? DEFAULT_FORMAT) !== "json"

const configuredLevel = (process.env.LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === "test" ? "warn" : "info")
const MIN_LEVEL = LEVEL_ORDER[configuredLevel] ?? LEVEL_ORDER.info

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
}
const RESET = "\x1b[0m"
// Color only when a real terminal is attached — log files and CI stay clean.
const USE_COLOR = PRETTY && Boolean(process.stdout.isTTY || process.stderr.isTTY)

// Normalize an `err` field (an Error instance) into a plain, serializable
// object so consumers get name/message/code/stack without the prototype. The
// pretty renderer uses it to print the stack as an indented block.
export function hoistErr(fields: LogFields): LogFields {
  const out: LogFields = { ...fields }
  const err = out["err"]
  if (err instanceof Error) {
    const e = err as Error & { code?: unknown }
    out["err"] = {
      name: e.name,
      message: e.message,
      ...(e.code != null ? { code: e.code } : {}),
      stack: e.stack ?? "",
    }
  }
  return out
}

// One JSON object per line — the machine-readable form.
export function renderJson(ts: Date, level: LogLevel, msg: string, fields: LogFields): string {
  return JSON.stringify({ ts: ts.toISOString(), level, msg, ...hoistErr(fields) })
}

function indentBlock(text: string, pad = "    "): string {
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n")
}

// Safe values render bare (path=/api/game/shop?runId=…), anything with
// whitespace or quotes is JSON-escaped (name="the Grand Melee").
function prettyValue(v: unknown): string {
  if (typeof v === "string") return /[\s"]/.test(v) ? JSON.stringify(v) : v
  if (v === null || typeof v === "number" || typeof v === "boolean" || v === undefined) return String(v)
  return JSON.stringify(v)
}

// Human-readable key=value line with the error stack as a follow-up block.
export function renderPretty(
  ts: Date,
  level: LogLevel,
  msg: string,
  fields: LogFields,
  useColor: boolean = USE_COLOR,
): string {
  const time = ts.toISOString().slice(11, 23)
  const color = useColor ? (COLORS[level] ?? "") : ""
  const reset = color ? RESET : ""
  const f = hoistErr(fields)
  const parts = [`${time} ${color}${level.toUpperCase().padEnd(5)}${reset} ${msg}`]
  for (const [k, v] of Object.entries(f)) {
    if (k === "err" && typeof v === "object" && v !== null) continue // rendered as the block below
    parts.push(`${k}=${prettyValue(v)}`)
  }
  let line = parts.join(" ")
  const err = f["err"] as { stack?: string; name?: string; message?: string } | undefined
  if (err) {
    line += `\n${indentBlock(err.stack ?? `${err.name}: ${err.message}`)}`
  }
  return line
}

function emit(level: LogLevel, msg: string, fields: LogFields = {}): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return
  const ts = new Date()
  const line = PRETTY ? renderPretty(ts, level, msg, fields) : renderJson(ts, level, msg, fields)
  // Errors to stderr so stdout stays clean for piping; everything else stdout.
  const stream = level === "warn" || level === "error" ? process.stderr : process.stdout
  stream.write(line + "\n")
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
}

import type { NextFunction, Request, RequestHandler, Response } from "express"
import { log } from "./logger.js"

// ---------------------------------------------------------------------------
// Centralized request logging + error handling.
//
// Every request gets a short `reqId` (also sent back as the X-Request-Id
// header). Successful requests log one structured "request" line; failures
// log a structured block carrying the same reqId + stack trace — so an error
// code a player pastes from the UI can be grepped straight to the log line.
// ---------------------------------------------------------------------------

// Short, URL-safe correlation id (no crypto needed — uniqueness within a
// request window is all we need, collisions just blur two logs together).
export function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

// An error with a client-facing status + machine-readable code. Route handlers
// throw these for expected failures (e.g. HttpError(400, "invalid_choice"));
// the error middleware turns them into { error: code } without logging a stack.
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string

  constructor(status: number, code: string, detail?: string) {
    super(detail ?? code)
    this.name = "HttpError"
    this.status = status
    this.code = code
    this.detail = detail
  }
}

// Express 4 does NOT catch rejections from async route handlers — an unhandled
// rejection leaves the request hanging (and often crashes the process in
// Node >= 15). Wrap every async handler so rejections flow to next(err) and
// reach the error middleware like any other error.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

// Stable structured request context used by both the summary line and the
// failure block — the `runId` is the run the request operates on (when one is
// sent), so logs can be traced per run.
function reqMeta(req: Request): { method: string; path: string; runId: string } {
  const runId = (req.body?.runId as string) || (req.query.runId as string) || ""
  const path = req.originalUrl ?? req.url ?? req.path ?? "/"
  return { method: req.method, path, runId }
}

// Assign the request id, echo it in the response header, and log one summary
// line per request when it finishes (status + duration).
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  res.locals.reqId = shortId()
  res.setHeader("X-Request-Id", res.locals.reqId)
  const started = Date.now()
  res.on("finish", () => {
    // Failures the error middleware already reported (it sets res.locals
    // errorLogged) get their summary downgraded to debug so they don't print
    // twice — the dedicated failure block is the visible line. Inline 4xx
    // responses (invalid_class, not_enough_gold, …) never reach that
    // middleware, so their summary stays at info and keeps them visible.
    const fields = {
      reqId: res.locals.reqId,
      ...reqMeta(req),
      status: res.statusCode,
      durationMs: Date.now() - started,
    }
    if (res.statusCode >= 400 && res.locals?.errorLogged) {
      log.debug("request", fields)
    } else {
      log.info("request", fields)
    }
  })
  next()
}

// Errors already logged once (router-level middleware forwards a headersSent
// error to the app-level middleware — without this, the same failure prints
// twice). Keyed by the error object so each failure logs exactly once.
const loggedErrors = new WeakSet<object>()

// Log the full failure (stack + request context) so a 500 is diagnosable from
// the terminal alone. The reqId is a first-class field so it is easy to grep.
function logFailure(err: unknown, req: Request, reqId: string): void {
  if (typeof err === "object" && err !== null && loggedErrors.has(err)) return
  if (typeof err === "object" && err !== null) loggedErrors.add(err)
  const meta = { reqId, ...reqMeta(req) }
  if (err instanceof HttpError) {
    // Expected client error — no stack, just the request + code.
    log.warn("request rejected", { ...meta, status: err.status, code: err.code })
    return
  }
  log.error("request failed", { ...meta, err })
}

// Turn an error into a JSON response. The body always carries `error` (the
// machine code) and `errorId` (the correlation key the player can quote).
// `detail` (the raw message) is only sent outside production so internals
// never leak to players on the live site.
function errorResponse(err: unknown, res: Response, reqId: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, errorId: reqId })
    return
  }

  // Body-parser failures (malformed JSON) arrive as plain errors carrying a
  // 4xx status; honor those instead of treating them as 500s.
  const e = err as { status?: number }
  const isClientError = typeof e?.status === "number" && e.status >= 400 && e.status < 500
  if (isClientError) {
    res.status(e.status!).json({ error: "invalid_request", errorId: reqId })
    return
  }

  const message = err instanceof Error ? err.message : String(err)
  const body: Record<string, string> = {
    error: "server_error",
    errorId: reqId,
  }
  if (process.env.NODE_ENV !== "production") body.detail = message
  res.status(500).json(body)
}

// Global error middleware: logs, then responds. Mounted at the router level
// (so routers are self-contained, and route tests can exercise error shapes)
// and again at the app level as the final safety net.
export function errorMiddleware(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // One id for the whole failure — the log line and the response's errorId
  // always match, even when the request logger never ran (e.g. body-parser
  // rejected the body before requestLogger was reached).
  const reqId: string = res.locals?.reqId ?? shortId()
  logFailure(err, req, reqId)
  // Tell the request logger this failure already has its own line, so the
  // per-request summary can drop to debug instead of printing a duplicate.
  // Guarded: route tests drive the router with a minimal fake res that has no
  // locals (and real Express responses always have it).
  if (res.locals) res.locals.errorLogged = true
  if (res.headersSent) {
    // Response already committed — nothing to send; hand the error up (the
    // WeakSet guard keeps this from being logged a second time up there).
    next(err)
    return
  }
  errorResponse(err, res, reqId)
}

// JSON 404 for unknown API routes (non-API paths pass through so the SPA
// fallback / Vite middleware can still serve the client).
export function apiNotFound(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "not_found", path: req.path, errorId: res.locals?.reqId ?? shortId() })
    return
  }
  next()
}

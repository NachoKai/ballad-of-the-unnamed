import "dotenv/config"
import express from "express"
import cookieParser from "cookie-parser"
import { gameRouter } from "./routes/game.js"
import { metaRouter } from "./routes/meta.js"
import { apiNotFound, errorMiddleware, requestLogger } from "./errors.js"

const app = express()
app.use(express.json())
app.use(cookieParser())

// Per-request id + summary line (also sets the X-Request-Id response header,
// so a player-reported errorId maps 1:1 to a log line).
app.use(requestLogger)

app.use("/api/game", gameRouter)
app.use("/api/meta", metaRouter)
app.get("/api/health", (_req, res) => res.json({ ok: true }))

// JSON 404 for unknown API routes (SPA paths fall through to the client).
app.use(apiNotFound)

// Last-resort error handling: full stack to the terminal, structured
// { error, errorId } JSON to the client.
app.use(errorMiddleware)

export default app

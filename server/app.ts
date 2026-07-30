import "dotenv/config"
import express from "express"
import cookieParser from "cookie-parser"
import { gameRouter } from "./routes/game.js"
import { metaRouter } from "./routes/meta.js"

const app = express()
app.use(express.json())
app.use(cookieParser())

app.use("/api/game", gameRouter)
app.use("/api/meta", metaRouter)
app.get("/api/health", (_req, res) => res.json({ ok: true }))

export default app

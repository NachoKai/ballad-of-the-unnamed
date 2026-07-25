import "dotenv/config"
import express from "express"
import cookieParser from "cookie-parser"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { gameRouter } from "../server/routes/game.js"
import { metaRouter } from "../server/routes/meta.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json())
app.use(cookieParser())

app.use("/api/game", gameRouter)
app.use("/api/meta", metaRouter)
app.get("/api/health", (_req, res) => res.json({ ok: true }))

const clientDir = join(__dirname, "..", "dist", "client")
app.use(express.static(clientDir))
app.get("*", (_req, res) => {
  res.sendFile(join(clientDir, "index.html"))
})

export default app

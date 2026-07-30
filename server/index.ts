import express from "express"
import { createServer as createHttpServer } from "node:http"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import app from "./app.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === "production"
const PORT = Number(process.env.PORT) || 8080

async function main() {
  // Explicit HTTP server so Vite's HMR WebSocket can ride the same port
  // (the preview proxy only routes one port; a separate WS port is unreachable).
  const httpServer = createHttpServer(app)

  if (!isProd) {
    // Dev: run Vite in middleware mode so client + API share one port (HMR).
    const projectRoot = join(__dirname, "..")
    const { createServer: createViteServer } = await import("vite")
    const vite = await createViteServer({
      // Load vite.config.ts so the @/@shared aliases apply in dev.
      configFile: join(projectRoot, "vite.config.ts"),
      root: join(projectRoot, "src"),
      publicDir: join(projectRoot, "public"),
      server: {
        middlewareMode: true,
        // Attach HMR to our HTTP server so the WS upgrade rides the same port.
        // Use wss + 443 when behind an HTTPS preview proxy, otherwise ws + same port.
        hmr: {
          server: httpServer,
          protocol: process.env.HMR_PROTOCOL || "ws",
          clientPort: process.env.HMR_CLIENT_PORT ? Number(process.env.HMR_CLIENT_PORT) : undefined,
        },
        // The shared/ folder lives outside the Vite root; allow it to be served.
        fs: { allow: [projectRoot] },
      },
      appType: "spa",
    })
    app.use(vite.middlewares)
  } else {
    // Prod: serve the built client.
    const clientDir = join(__dirname, "..", "dist", "client")
    app.use(express.static(clientDir))
    app.get("*", (_req, res) => {
      res.sendFile(join(clientDir, "index.html"))
    })
  }

  httpServer.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT} (prod=${isProd})`)
  })
}

main().catch((err) => {
  console.error("[server] fatal", err)
  process.exit(1)
})

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

// Vite is used in middleware mode by the Express server in dev (see server/index.ts),
// and to produce the static client build for production.
export default defineConfig({
  plugins: [react()],
  root: "src",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
})

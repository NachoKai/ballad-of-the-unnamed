import "dotenv/config"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { sql } from "./client.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Split the schema on statement boundaries and run each. The HTTP driver runs
// one statement per call, so we can't send the whole file at once.
export async function migrate(): Promise<void> {
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8")
  // Strip full-line SQL comments first, then split on statement boundaries.
  const withoutComments = schema
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const statement of statements) {
    await sql(statement)
  }
  console.log(`[db] migration complete (${statements.length} statements)`)
}

// Allow running directly: `pnpm db:migrate`
if (process.argv[1]?.replace(/\\/g, "/").includes("migrate")) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[db] migration failed:", err)
      process.exit(1)
    })
}

import { migrate } from "./migrate.js"
import { log } from "../logger.js"

// The Neon HTTP driver lets the server boot without DATABASE_URL (only DB
// routes throw), so an absent env var must never block app startup — but if it
// IS set, the schema must be current before the app serves requests. This gates
// first run of the idempotent migration on boot and collapses concurrent
// cold-start calls into one; a failed attempt is retried on the next boot so a
// transient exception can't permanently wedge the function.
let migrating: Promise<void> | null = null

export function ensureMigrated(): Promise<void> {
  if (!migrating) {
    migrating = migrate()
      .catch((err) => {
        log.error("boot migration failed", { err })
        migrating = null
      })
      .then(() => undefined)
  }
  return migrating
}

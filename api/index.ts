import app from "../server/app.js"
import { ensureMigrated } from "../server/db/boot.js"

// Gate boot on the idempotent schema migration so the first request a cold
// start serves can't race ahead of a pending: schema change. ensureMigrated
// swallows failures (server may run without DATABASE_URL), so a missing or
// unreachable DB can't block the app from serving non-DB routes.
await ensureMigrated()

export default app

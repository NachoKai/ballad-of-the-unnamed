import app from "../server/app.js"
import { migrate } from "../server/db/migrate.js"

migrate().catch((err) => {
  console.error("[api] migration failed", err)
})

export default app

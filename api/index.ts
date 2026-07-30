import app from "../server/app.js"
import { migrate } from "../server/db/migrate.js"

migrate()

export default app

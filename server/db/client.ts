import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

let _sql: NeonQueryFunction<false, false> | null = null

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Connect the Neon integration so the game can store runs and the leaderboard.",
      )
    }
    // HTTP driver: perfect for the request/response write volume this game produces
    // (one write per player choice), no connection pool to manage.
    _sql = neon(connectionString)
  }
  return _sql
}

// Parameterized query helper. NEVER interpolate user input into SQL strings.
// In this driver version the query function is invoked directly: sql(text, params).
export const sql: NeonQueryFunction<false, false> = ((
  ...args: Parameters<NeonQueryFunction<false, false>>
) => {
  return getSql()(args[0], args[1])
}) as NeonQueryFunction<false, false>

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await getSql()(text, params)) as T[]
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

import { query, queryOne } from "../db/client.js"

// Daily cache for Jev classifications (see server/db/schema.sql `jev_cache`).
// The key is derived from the UTC date plus coarse, PII-free run data, so the
// same decision for the same coarse state reuses one Jev call across all players.
export interface JevCacheRow {
  choice: string
  payload: unknown
}

export async function getJevCache(cacheKey: string): Promise<JevCacheRow | null> {
  return queryOne<JevCacheRow>("SELECT choice, payload FROM jev_cache WHERE cache_key = $1", [
    cacheKey,
  ])
}

export async function putJevCache(
  cacheKey: string,
  choice: string,
  payload: unknown,
): Promise<void> {
  await query(
    `INSERT INTO jev_cache (cache_key, choice, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (cache_key) DO NOTHING`,
    [cacheKey, choice, JSON.stringify(payload)],
  )
}

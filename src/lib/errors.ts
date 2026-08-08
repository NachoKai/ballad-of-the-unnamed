import type { Locale } from "@shared/types"
import { interpolate } from "@shared/i18n"
import { ApiError } from "../api"
import { t } from "../i18n/strings"

// Build a player-facing error line from any thrown value: a friendly
// "try again" hint, plus the server's correlation id as a memorable "omen"
// the player can quote when reporting the bug (it matches the terminal log
// line exactly — the server logs the same id for that request).
export function errorMessage(err: unknown, locale: Locale): string {
  const apiErr = err instanceof ApiError ? err : null
  const raw = apiErr?.detail || apiErr?.code || (err instanceof Error ? err.message : String(err))
  const id = apiErr?.errorId
  const parts = [t(locale, "errorTryAgain")]
  if (id) parts.push(interpolate(t(locale, "errorOmen"), { id }))
  return `${parts.join(" ")}${raw ? ` (${raw})` : ""}`
}

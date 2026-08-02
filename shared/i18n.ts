import type { Locale, LocaleMap } from "./types"
import { fmtInt } from "./format"

export const LOCALES: Locale[] = ["en", "es"]
export const DEFAULT_LOCALE: Locale = "en"

// Resolve a locale map to a string, falling back to English then any available.
export function t(map: LocaleMap | undefined, locale: Locale): string {
  if (!map) return ""
  return map[locale] ?? map.en ?? Object.values(map)[0] ?? ""
}

// Fill {placeholders} in a resolved string from a vars bag. Numbers are
// integer-rounded so narrative text never surfaces a decimal point.
export function interpolate(text: string, vars: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars
      ? typeof vars[key] === "number"
        ? String(fmtInt(vars[key] as number))
        : String(vars[key])
      : `{${key}}`,
  )
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "es"
}

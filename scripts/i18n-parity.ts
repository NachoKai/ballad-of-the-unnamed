// Fails if any authored LocaleMap is missing a supported locale. Run this in CI
// before adding Spanish so the content stays translation-complete.
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { LOCALES } from "../shared/i18n.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTENT = join(__dirname, "..", "content")

let problems = 0

function isLocaleMap(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    "en" in (v as Record<string, unknown>)
  )
}

function walk(node: unknown, path: string) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walk(n, `${path}[${i}]`))
    return
  }
  if (isLocaleMap(node)) {
    for (const loc of LOCALES) {
      const val = (node as Record<string, unknown>)[loc]
      if (typeof val !== "string" || val.length === 0) {
        console.log(`[i18n] MISSING '${loc}' at ${path}`)
        problems++
      }
    }
    return
  }
  if (typeof node === "object" && node !== null) {
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
  }
}

function walkFile(rel: string) {
  const data = JSON.parse(readFileSync(join(CONTENT, rel), "utf8"))
  walk(data, rel)
}

function collect(dir = ""): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(CONTENT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...collect(rel))
    else if (entry.name.endsWith(".json")) out.push(rel)
  }
  return out
}

for (const file of collect()) walkFile(file)

if (problems > 0) {
  console.log(`[i18n] ${problems} locale problem(s) found`)
  process.exit(1)
}
console.log("[i18n] all locale maps complete for:", LOCALES.join(", "))

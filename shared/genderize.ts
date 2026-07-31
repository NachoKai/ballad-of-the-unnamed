import type { Gender } from "./types.js"

// Spanish gender inflection for gendered text. Spanish content is authored once
// in gender-neutral "e" forms (bienvenide, todes, une). At render time the
// protagonist's chosen gender inflects the player-referential words.
//
// Design constraints:
// - Only PLAYER-referential words are inflected. Group/NPC-referential neutral
//   forms (todes, otres, les, une herrera, l'anciane...) stay neutral so the
//   world's other characters don't silently change gender with the player.
// - Deterministic and case-preserving so it composes with daily-mode seeding.
// - Unknown words are left untouched (safe fallback).

// Neutral "e" form as authored in content -> masculine / feminine pair.
// Only words that describe the player character belong here.
const NEUTRAL_TO_GENDERED: Record<string, { m: string; f: string }> = {
  abrigade: { m: "abrigado", f: "abrigada" },
  alimentade: { m: "alimentado", f: "alimentada" },
  congelade: { m: "congelado", f: "congelada" },
  cuidada: { m: "cuidado", f: "cuidada" },
  descansade: { m: "descansado", f: "descansada" },
  empapade: { m: "empapado", f: "empapada" },
  entero: { m: "entero", f: "entera" },
  erguido: { m: "erguido", f: "erguida" },
  extrañe: { m: "extraño", f: "extraña" },
  liste: { m: "listo", f: "lista" },
  renacide: { m: "renacido", f: "renacida" },
  solitaire: { m: "solitario", f: "solitaria" },
  tieso: { m: "tieso", f: "tiesa" },
  viajere: { m: "viajero", f: "viajera" },
}

// Masculine UI labels authored in the client string tables -> feminine forms.
// Only used for female characters; male keeps the authored label and nonbinary
// keeps it too (client chrome, out of the narrative's neutral style).
const MASCULINE_TO_FEMININE: Record<string, string> = {
  agresivo: "agresiva",
  cercano: "cercana",
  conocido: "conocida",
  desconocido: "desconocida",
  divertido: "divertida",
  estratégico: "estratégica",
  estoico: "estoica",
  marginado: "marginada",
  presumido: "presumida",
  renombrado: "renombrada",
  respetado: "respetada",
  seguro: "segura",
  solidario: "solidaria",
}

// Preserve the original token's capitalization pattern (title case in vocatives
// or sentence-initial position).
function matchCase(source: string, replacement: string): string {
  if (
    source.length > 0 &&
    source[0] === source[0].toUpperCase() &&
    source[0] !== source[0].toLowerCase()
  ) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

// Inflect player-referential Spanish words in `text` for the given gender.
// `null`/`undefined` and "nonbinary" keep the authored neutral "e" forms.
export function genderize(text: string, gender: Gender | null | undefined): string {
  if (gender !== "male" && gender !== "female") return text
  const key = gender === "male" ? "m" : "f"
  return text.replace(/\p{L}+/gu, (tok) => {
    const lower = tok.toLowerCase()
    const neutral = NEUTRAL_TO_GENDERED[lower]
    if (neutral) return matchCase(tok, neutral[key])
    if (gender === "female") {
      const feminine = MASCULINE_TO_FEMININE[lower]
      if (feminine) return matchCase(tok, feminine)
    }
    return tok
  })
}

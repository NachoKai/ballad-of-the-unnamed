import type { Gender } from "./types.js"

// Spanish gender inflection for gendered text. Spanish content is authored once
// in standard masculine forms (bienvenido, todos, un herrero). At render time
// the protagonist defaults to masculine inflection unless the player explicitly
// chose female; female characters get feminine forms for player-referential
// words only.
//
// Design constraints:
// - Only PLAYER-referential words are inflected. Group/NPC-referential words
//   (el herrero, los ancianos, el Maestre del Gremio...) are authored masculine
//   and are never in the tables, so the world's other characters don't silently
//   change gender with the player.
// - Masculine authored text is left untouched (male is the default). Only
//   female inflects.
// - Deterministic and case-preserving so it composes with daily-mode seeding.
// - Unknown words are left untouched (safe fallback).

// Masculine-authored player-referential words (narrative + archetype titles)
// -> feminine forms. Used for served narratives and archetype draw names.
const MASCULINE_TO_GENDERED: Record<string, string> = {
  abrigado: "abrigada",
  alimentado: "alimentada",
  asesino: "asesina",
  caballero: "caballera",
  cazador: "cazadora",
  congelado: "congelada",
  cómico: "cómica",
  cuidado: "cuidada",
  descansado: "descansada",
  empapado: "empapada",
  encantador: "encantadora",
  entero: "entera",
  erguido: "erguida",
  escaldo: "escalda",
  explorador: "exploradora",
  extraño: "extraña",
  francotirador: "francotiradora",
  guardian: "guardiana",
  infiltrador: "infiltradora",
  inquisidor: "inquisidora",
  ladrón: "ladrona",
  listo: "lista",
  maestro: "maestra",
  paladín: "paladina",
  renacido: "renacida",
  sacerdote: "sacerdotisa",
  sanador: "sanadora",
  silencioso: "silenciosa",
  solitario: "solitaria",
  táctico: "táctica",
  tieso: "tiesa",
  trampero: "trampera",
  viajero: "viajera",
}

// Masculine UI labels authored in the client string tables -> feminine forms.
// Used by gt() for reputation tiers and personality tags (chrome labels). Only
// applied to female characters; male keeps the authored label.
const CHROME_TO_FEMININE: Record<string, string> = {
  agresivo: "agresiva",
  anciano: "anciana",
  aventurero: "aventurera",
  caballero: "caballera",
  campeón: "campeona",
  capitán: "capitana",
  cercano: "cercana",
  conocido: "conocida",
  desconocido: "desconocida",
  divertido: "divertida",
  elegido: "elegida",
  espadachín: "espadachina",
  estratégico: "estratégica",
  estoico: "estoica",
  guardián: "guardiana",
  héroe: "heroína",
  marginado: "marginada",
  mercenario: "mercenaria",
  mítico: "mítica",
  niño: "niña",
  oculto: "oculta",
  presumido: "presumida",
  renombrado: "renombrada",
  respetado: "respetada",
  sabio: "sabia",
  seguro: "segura",
  solidario: "solidaria",
  veterano: "veterana",
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

// Replace masculine-authored tokens with their feminine forms. When a token is
// inflected, an immediately preceding article "un" is also flipped to "una" so
// player noun phrases agree ("un viajero solitario" -> "una viajera solitaria").
function inflect(text: string, table: Record<string, string>): string {
  const parts = text.split(/(\p{L}+)/u)
  const out = [...parts]
  for (let i = 1; i < parts.length; i += 2) {
    const part = parts[i]
    const feminine = table[part.toLowerCase()]
    if (!feminine) continue
    if (i >= 2 && parts[i - 2].toLowerCase() === "un") {
      out[i - 2] = matchCase(parts[i - 2], "una")
    }
    out[i] = matchCase(part, feminine)
  }
  return out.join("")
}

// Inflect player-referential Spanish words in narrative/archetype text for the
// given gender. Authored text is masculine; only "female" inflects.
export function genderize(text: string, gender: Gender | null | undefined): string {
  if (gender !== "female") return text
  return inflect(text, MASCULINE_TO_GENDERED)
}

// Inflect Spanish client chrome labels (reputation tiers, personality tags).
// Authored text is masculine; only "female" inflects.
export function genderizeChrome(text: string, gender: Gender | null | undefined): string {
  if (gender !== "female") return text
  return inflect(text, CHROME_TO_FEMININE)
}

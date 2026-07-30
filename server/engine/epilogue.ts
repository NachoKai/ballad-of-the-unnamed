import type { CharacterState, EndingType, Locale } from "../../shared/types.js"
import type { ContentRegistry } from "../content/registry.js"
import { localize, peakReputation } from "./helpers.js"
import { reputationTierId } from "../../shared/config.js"

// Deterministic, template-based epilogue. AI narration is intentionally OFF for
// now; this function is the single seam where an AI call would slot in later
// (same inputs, returns a string) without touching the rest of the engine.
export function generateEpilogue(
  c: CharacterState,
  endingType: EndingType,
  registry: ContentRegistry,
  locale: Locale,
): string {
  const cls = registry.classesById.get(c.class)
  const className = cls ? localize(cls.name, locale) : c.class
  const repTier = reputationTierId(peakReputation(c))
  const battles = c.counters["battles_won"] ?? 0
  const quests = c.counters["quests_completed"] ?? 0

  // Tail clause for a middling death, kept grammatical when deeds are sparse.
  const modestDeedsTail = {
    en:
      battles > 0
        ? `but ${battles} won ${battles === 1 ? "battle is" : "battles are"} not nothing.`
        : quests > 0
          ? `but ${quests} ${quests === 1 ? "quest" : "quests"} seen through is not nothing.`
          : `few will remember the name, and that is its own kind of peace.`,
    es:
      battles > 0
        ? `pero ${battles} ${battles === 1 ? "batalla ganada no es" : "batallas ganadas no son"} poca cosa.`
        : quests > 0
          ? `pero ${quests} ${quests === 1 ? "misión cumplida no es" : "misiones cumplidas no son"} poca cosa.`
          : `pocos recordarán el nombre, y eso también es una forma de paz.`,
  }

  // Rival epilogue block.
  const rivalBlock: Record<Locale, string> = { en: "", es: "" }
  if (c.rival) {
    const rv = c.rival
    const playerScore = (c.counters["battles_won"] ?? 0) + (c.counters["quests_completed"] ?? 0)
    const outcome = playerScore >= rv.score ? "ahead" : "behind"
    rivalBlock.en = `\n\nYour rival ${rv.name} (${rv.class}) ended with ${rv.powerLevel} power and ${rv.score} points. You finished ${outcome} — ${playerScore} to ${rv.score}.`
    rivalBlock.es = `\n\nTu rival ${rv.name} (${rv.class}) terminó con ${rv.powerLevel} de poder y ${rv.score} puntos. Terminaste ${outcome === "ahead" ? "por delante" : "por detrás"} — ${playerScore} a ${rv.score}.`
  }

  // Relationship epilogue block.
  const relBlock: Record<Locale, string> = { en: "", es: "" }
  const meaningfulRels = c.relationships.filter((r) => r.peakAffinity >= 50 || r.affinity <= -50)
  if (meaningfulRels.length > 0) {
    const allies = meaningfulRels.filter((r) => r.affinity >= 50).length
    const enemies = meaningfulRels.filter((r) => r.affinity <= -50).length
    relBlock.en = `\nAlong the way, ${allies} ${allies === 1 ? "soul" : "souls"} stood by you`
    relBlock.es = `\nEn el camino, ${allies} ${allies === 1 ? "alma" : "almas"} te acompañaron`
    if (enemies > 0) {
      relBlock.en += ` and ${enemies} ${enemies === 1 ? "enemy" : "enemies"} stood against.`
      relBlock.es += ` y ${enemies} ${enemies === 1 ? "enemigo" : "enemigos"} se te opusieron.`
    } else {
      relBlock.en += "."
      relBlock.es += "."
    }
  }

  const templates: Record<EndingType, Record<Locale, string>> = {
    heroic_death: {
      en: `${c.name} the ${className} fell at ${c.age}, blade in hand, name already a song. ${battles} battles won, ${quests} quests closed, and a reputation ${repTier} enough that the taverns will not soon go quiet.${relBlock.en}${rivalBlock.en}`,
      es: `${c.name}, ${className}, cayó a los ${c.age}, espada en mano, con el nombre ya vuelto canción. ${battles} batallas ganadas, ${quests} misiones cerradas, y una fama ${repTier} que las tabernas no callarán pronto.${relBlock.es}${rivalBlock.es}`,
    },
    peaceful_retirement: {
      en: `${c.name} the ${className} hung up the blade at ${c.age}, coffers heavy with ${c.gold} gold and a reputation ${repTier}. The road remembers those who knew when to leave it.${relBlock.en}${rivalBlock.en}`,
      es: `${c.name}, ${className}, colgó la espada a los ${c.age}, con ${c.gold} de oro y una fama ${repTier}. El camino recuerda a quienes supieron cuándo dejarlo.${relBlock.es}${rivalBlock.es}`,
    },
    other_death: {
      en: `${c.name} the ${className} died at ${c.age}. Not every legend gets a clean ending, ${modestDeedsTail.en}${relBlock.en}${rivalBlock.en}`,
      es: `${c.name}, ${className}, murió a los ${c.age}. No toda leyenda tiene un final limpio, ${modestDeedsTail.es}${relBlock.es}${rivalBlock.es}`,
    },
    other_retirement: {
      en: `${c.name} the ${className} walked away at ${c.age} with ${c.gold} gold. Quieter than a saga, but the story is theirs to keep.${relBlock.en}${rivalBlock.en}`,
      es: `${c.name}, ${className}, se retiró a los ${c.age} con ${c.gold} de oro. Más callado que una saga, pero la historia es suya.${relBlock.es}${rivalBlock.es}`,
    },
  }

  return templates[endingType][locale] ?? templates[endingType].en
}

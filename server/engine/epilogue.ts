import type {
  CharacterState,
  EndingType,
  Locale,
} from "../../shared/types.js"
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

  const templates: Record<EndingType, Record<Locale, string>> = {
    heroic_death: {
      en: `${c.name} the ${className} fell at ${c.age}, blade in hand, name already a song. ${battles} battles won, ${quests} quests closed, and a reputation ${repTier} enough that the taverns will not soon go quiet.`,
      es: `${c.name}, ${className}, cayó a los ${c.age}, espada en mano, con el nombre ya vuelto canción. ${battles} batallas ganadas, ${quests} misiones cerradas, y una fama ${repTier} que las tabernas no callarán pronto.`,
    },
    peaceful_retirement: {
      en: `${c.name} the ${className} hung up the blade at ${c.age}, coffers heavy with ${c.gold} gold and a reputation ${repTier}. The road remembers those who knew when to leave it.`,
      es: `${c.name}, ${className}, colgó la espada a los ${c.age}, con ${c.gold} de oro y una fama ${repTier}. El camino recuerda a quienes supieron cuándo dejarlo.`,
    },
    other_death: {
      en: `${c.name} the ${className} died at ${c.age}. Not every legend gets a clean ending, ${modestDeedsTail.en}`,
      es: `${c.name}, ${className}, murió a los ${c.age}. No toda leyenda tiene un final limpio, ${modestDeedsTail.es}`,
    },
    other_retirement: {
      en: `${c.name} the ${className} walked away at ${c.age} with ${c.gold} gold. Quieter than a saga, but the story is theirs to keep.`,
      es: `${c.name}, ${className}, se retiró a los ${c.age} con ${c.gold} de oro. Más callado que una saga, pero la historia es suya.`,
    },
  }

  return templates[endingType][locale] ?? templates[endingType].en
}

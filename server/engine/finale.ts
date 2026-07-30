import type { ContentRegistry } from "../content/registry.js"
import type {
  CharacterState,
  EndingType,
  Locale,
  FinaleStage,
  FinaleChoice,
} from "../../shared/types.js"
import type { Rng } from "../../shared/rng.js"
import { localize, fillSlots } from "./helpers.js"

export function generateFinaleStage1(
  c: CharacterState,
  endingType: EndingType,
  registry: ContentRegistry,
  rng: Rng,
  locale: Locale,
): FinaleStage {
  const classId = c.class
  const narrative = stage1Narrative(endingType, classId, c, registry, rng, locale)
  const choices = stage1Choices(endingType, locale)

  return { stage: "last_chapter", narrative: { en: narrative, es: narrative }, choices }
}

function stage1Narrative(
  endingType: EndingType,
  classId: string,
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
  locale: Locale,
): string {
  const isDeath = endingType === "heroic_death" || endingType === "other_death"
  const cls = registry.classesById.get(classId)
  const className = cls ? localize(cls.name, locale) : classId
  const age = c.age
  const battles = c.counters["battles_won"] ?? 0

  if (isDeath) {
    return fillSlots(
      `The end comes for every {slot:creature}, and today it comes for ${c.name} the ${className}. At ${age}, after ${battles} ${battles === 1 ? "battle" : "battles"}, the final {slot:weather} breaks over the horizon. There is no running from this — only the choice of how to meet it.

Do you charge forward, risking everything for one last moment of {slot:glory}? Or do you stand firm, steady, and sell your life at a price the world will not soon forget?`,
      locale,
      registry,
      rng,
    )
  }

  return fillSlots(
    `The road has been long for ${c.name} the ${className}. ${age} years, ${battles} ${battles === 1 ? "battle" : "battles"}, a life carved in {slot:substance} and scar tissue. The {slot:weapon} feels heavier now. The {slot:tavern_name} songs have already been written.

But one last {slot:adventure} stirs on the horizon. A final chance to shape how the story ends.

Do you take the risky path — uncertain, but ablaze with {slot:glory}? Or the safe road — reliable, quiet, and honored?`,
    locale,
    registry,
    rng,
  )
}

function stage1Choices(endingType: EndingType, _locale: Locale): FinaleChoice[] {
  const isDeath = endingType === "heroic_death" || endingType === "other_death"

  if (isDeath) {
    return [
      {
        id: "finale_risky",
        label: { en: "Charge into the storm", es: "Cargar contra la tormenta" },
        narrative: {
          en: "One last blaze of glory. The bards will sing of this.",
          es: "Un último destello de gloria. Los bardos cantarán sobre esto.",
        },
        statDeltas: { strength: 2, dexterity: 2 },
        fameDelta: 15,
        reputationDelta: 10,
      },
      {
        id: "finale_safe",
        label: { en: "Stand your ground", es: "Mantener tu posición" },
        narrative: {
          en: "Steady. Unbroken. They will remember you stood tall.",
          es: "Firme. Imbatible. Recordarán que te mantuviste erguido.",
        },
        statDeltas: { constitution: 2, charisma: 1 },
        fameDelta: 5,
        healthDelta: 10,
      },
    ]
  }

  return [
    {
      id: "finale_risky",
      label: { en: "The dangerous path", es: "El camino peligroso" },
      narrative: {
        en: "Risk everything for one last legendary deed.",
        es: "Arriesgarlo todo por una última hazaña legendaria.",
      },
      statDeltas: { strength: 1, dexterity: 1, charisma: 1 },
      fameDelta: 20,
      reputationDelta: 15,
      goldDelta: 200,
    },
    {
      id: "finale_safe",
      label: { en: "The quiet road", es: "El camino tranquilo" },
      narrative: {
        en: "Walk away with dignity. Your legend is secure.",
        es: "Retirarte con dignidad. Tu leyenda está asegurada.",
      },
      statDeltas: { constitution: 2, charisma: 1 },
      fameDelta: 5,
      goldDelta: 100,
      healthDelta: 15,
    },
  ]
}

export function generateFinaleStage2(
  c: CharacterState,
  endingType: EndingType,
  choice: FinaleChoice,
  registry: ContentRegistry,
  rng: Rng,
  locale: Locale,
): FinaleStage {
  const isRisky = choice.id === "finale_risky"
  const classId = c.class
  const cls = registry.classesById.get(classId)
  const className = cls ? localize(cls.name, locale) : classId
  const name = c.name

  const narrative = isRisky
    ? fillSlots(
        `The gamble pays off. ${name} the ${className} etches their name into the {slot:substance} of history. When the dust settles, a young {slot:creature} approaches — wide-eyed, holding a battered {slot:weapon}. "Teach me," they say. And in that moment, the story does not end. It passes on.`,
        locale,
        registry,
        rng,
      )
    : fillSlots(
        `${name} the ${className} chooses wisely. Not every ending needs fire — some need the quiet {slot:weather} of a morning after. A young {slot:creature} watches from the crowd, gripping a {slot:weapon} for the first time. They do not know it yet, but they carry what comes next.`,
        locale,
        registry,
        rng,
      )

  return { stage: "outcome", narrative: { en: narrative, es: narrative } }
}

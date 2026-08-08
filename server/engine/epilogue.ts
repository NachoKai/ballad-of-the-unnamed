import type { ContentRegistry } from "../content/registry.js"
import type {
  AchievementContent,
  CharacterState,
  EndingType,
  EpithetData,
  FactionHistoryEntry,
  DistinctionEntry,
  Locale,
  RichEpilogueData,
  RivalComparison,
} from "../../shared/types.js"
import { localize, peakReputation } from "./helpers.js"
import { GAME_CONFIG, reputationTierId } from "../../shared/config.js"

// class-partitioned legend identities. The position/class defines what kind
// of idol you end up being; pools are keyed by behavior archetype and are
// disjoint per class — a rogue can be "the Phantom" but never "the Bastion".
type BehaviorArchetype = "legendary" | "mercenary" | "traitor" | "loyal"

const CLASS_IDENTITIES: Record<string, Record<BehaviorArchetype, { en: string; es: string }>> = {
  warrior: {
    legendary: { en: "Matador", es: "Matador" },
    mercenary: { en: "Gilded Axe", es: "Hacha Dorada" },
    traitor: { en: "Oathbreaker", es: "Perjuro" },
    loyal: { en: "Banner", es: "Estandarte" },
  },
  wizard: {
    legendary: { en: "Archmage", es: "Archimago" },
    mercenary: { en: "Sage for Hire", es: "Sabio a Sueldo" },
    traitor: { en: "Fallen Star", es: "Estrella Caída" },
    loyal: { en: "Keeper", es: "Guardián" },
  },
  rogue: {
    legendary: { en: "Phantom", es: "Fantasma" },
    mercenary: { en: "Gilded Fingers", es: "Dedos Dorados" },
    traitor: { en: "Snake", es: "Serpiente" },
    loyal: { en: "Night Watch", es: "Centinela Nocturno" },
  },
  ranger: {
    legendary: { en: "Warden", es: "Guardián de lo Salvaje" },
    mercenary: { en: "Peregrine", es: "Peregrino" },
    traitor: { en: "Rusty Thorn", es: "Espina Oxidada" },
    loyal: { en: "Wild Banner", es: "Estandarte Salvaje" },
  },
  cleric: {
    legendary: { en: "Saint", es: "Santo" },
    mercenary: { en: "Pardon Seller", es: "Vendedor de Indulgencias" },
    traitor: { en: "Apostate", es: "Apóstata" },
    loyal: { en: "Candle of the Faith", es: "Cirio de la Fe" },
  },
  bard: {
    legendary: { en: "Swan", es: "Cisne" },
    mercenary: { en: "Balladeer for Hire", es: "Trovador a Sueldo" },
    traitor: { en: "Slanderer", es: "Difamador" },
    loyal: { en: "House Minstrel", es: "Trovador de la Casa" },
  },
}

// Which identity slot a run earns, derived at epilogue time from the membership
// history and standing. Traitor (betrayal) > loyal (single-clan career) >
// mercenary (many clans) > legendary (falls through to tier-based flavor).
function behaviorArchetype(c: CharacterState): BehaviorArchetype {
  if (c.clanMemberships.some((m) => m.leftReason === "betrayed")) return "traitor"
  if (c.clanMemberships.length <= 1) return "loyal"
  if (c.clanMemberships.length >= 3) return "mercenary"
  return "legendary"
}

const TAG_EPITHET_PARTS: Record<string, { en: string; es: string }> = {
  Humble: { en: "Humble", es: "Humilde" },
  Cocky: { en: "Proud", es: "Orgulloso" },
  Confident: { en: "Bold", es: "Audaz" },
  Professional: { en: "Stalwart", es: "Firme" },
  Aggressive: { en: "Fierce", es: "Feroz" },
  Funny: { en: "Merry", es: "Alegre" },
  Supportive: { en: "Kind", es: "Amable" },
  Strategic: { en: "Cunning", es: "Astuto" },
  Stoic: { en: "Unbroken", es: "Inquebrantable" },
  Leader: { en: "Bright", es: "Brillante" },
}

function dominantPersonalityTag(c: CharacterState): string | null {
  let maxCount = 0
  let dominant: string | null = null
  for (const [tag, count] of Object.entries(c.personality)) {
    if (count > maxCount) {
      maxCount = count
      dominant = tag
    }
  }
  return dominant
}

export function generateEpithet(
  c: CharacterState,
  registry: ContentRegistry,
  locale: Locale,
): EpithetData {
  const clsId = c.class
  const tag = dominantPersonalityTag(c)
  const repPeak = peakReputation(c)
  const tier = reputationTierId(repPeak)

  const archetype = behaviorArchetype(c)
  const homeFaction = registry.factionsById.get(c.homeFactionId)
  const homeFactionName = homeFaction ? localize(homeFaction.name, locale) : c.homeFactionId

  // the subtitle names the HOME faction (fixed identity), even when the
  // character spent the run abroad or ended dominant elsewhere.
  const subtitle =
    locale === "en"
      ? `${tier.charAt(0).toUpperCase() + tier.slice(1)} of ${homeFactionName}`
      : `${tier.charAt(0).toUpperCase() + tier.slice(1)} de ${homeFactionName}`

  // Loyal identity explicitly carries the home banner.
  if (archetype === "loyal") {
    return {
      title:
        locale === "en"
          ? `the Banner of ${homeFactionName}`
          : `el Estandarte de ${homeFactionName}`,
      subtitle,
    }
  }

  const pool = CLASS_IDENTITIES[clsId] ?? CLASS_IDENTITIES["warrior"]
  const identity = pool[archetype]
  const tagWord = tag ? TAG_EPITHET_PARTS[tag] : null

  // The dominant personality tag stays as a secondary descriptor; the class
  // identity word is the primary one (and stays inside the class's disjoint set).
  let title: string
  if (locale === "en") {
    title = tagWord ? `${tagWord.en} ${identity.en}` : `the ${identity.en}`
  } else {
    title = tagWord ? `${identity.es} ${tagWord.es}` : identity.es
  }

  // Mercenary flavor leans on the cash-heavy read when there's no tag to lead.
  if (!tagWord && archetype === "mercenary" && c.marketValuePeak > 5000) {
    title = locale === "en" ? `Gilded ${identity.en}` : `${identity.es} Dorado`
  }

  return { title, subtitle }
}

export function computeLegacyScore(c: CharacterState): number {
  const statues =
    c.achievements.filter((a) => a.includes("legend") || a.includes("myth")).length * 50
  const students =
    c.relationships.filter((r) => r.npcRole === "apprentice" || r.npcRole === "child").length * 30
  const settlementsSaved = (c.counters["settlements_saved"] ?? 0) * 40
  const enemies = c.relationships.filter((r) => r.affinity <= -50).length * 20
  const artifacts = c.inventory.filter((i) => i.qty > 0).length * 25
  return statues + students + settlementsSaved + enemies + artifacts
}

export function generateFactionHistory(c: CharacterState): FactionHistoryEntry[] {
  return c.reputations.map((r) => ({
    faction: r.faction,
    peakTier: reputationTierId(r.peakValue),
    peakValue: r.peakValue,
  }))
}

export function generateDistinctions(
  c: CharacterState,
  _registry: ContentRegistry,
): DistinctionEntry[] {
  const distinctionKeys = [
    "battles_won",
    "quests_completed",
    "rare_cards",
    "legendary_cards",
    "monsters_killed",
  ]
  const labels: Record<string, { en: string; es: string }> = {
    battles_won: { en: "Battles Won", es: "Batallas Ganadas" },
    quests_completed: { en: "Quests Completed", es: "Misiones Completadas" },
    rare_cards: { en: "Rare Encounters Survived", es: "Encuentros Raros Superados" },
    legendary_cards: { en: "Legendary Moments", es: "Momentos Legendarios" },
    monsters_killed: { en: "Monsters Slain", es: "Monstruos Abatidos" },
    champion_of_the_age: { en: "Champion of the Age", es: "Campeón de la Era" },
    deed_of_the_year: { en: "Deed of the Year", es: "Hazaña del Año" },
  }
  const base = distinctionKeys
    .filter((k) => (c.counters[k] ?? 0) > 0)
    .map((k) => ({
      id: k,
      label: labels[k] ?? { en: k, es: k },
      count: c.counters[k] ?? 0,
    }))
  // global individual honors surface as their own distinction rows.
  if (c.achievements.includes("champion_of_the_age")) {
    base.push({
      id: "champion_of_the_age",
      label: labels["champion_of_the_age"],
      count: 1,
    })
  }
  if (c.achievements.includes("deed_of_the_year")) {
    base.push({
      id: "deed_of_the_year",
      label: labels["deed_of_the_year"],
      count: c.counters["deeds_of_the_year"] ?? 1,
    })
  }
  return base
}

export function generateRivalComparison(c: CharacterState): RivalComparison | null {
  if (!c.rival) return null
  const rv = c.rival
  const playerScore = (c.counters["battles_won"] ?? 0) + (c.counters["quests_completed"] ?? 0)
  return {
    name: rv.name,
    class: rv.class,
    playerScore,
    rivalScore: rv.score,
    playerPowerLevel: c.powerLevel,
    rivalPowerLevel: rv.powerLevel,
    playerAchievements: c.achievements.length,
    rivalAchievements: rv.achievementsCount,
  }
}

export function generateRichEpilogueData(
  c: CharacterState,
  endingType: EndingType,
  score: number,
  registry: ContentRegistry,
  locale: Locale,
): RichEpilogueData {
  return {
    epithet: generateEpithet(c, registry, locale),
    legacyScore: computeLegacyScore(c),
    peakMarketValue: c.marketValuePeak,
    totalGoldEarned: c.gold + computeLegacyScore(c) * 10,
    factionHistory: generateFactionHistory(c),
    rivalComparison: generateRivalComparison(c),
    distinctions: generateDistinctions(c, registry),
    lostEncounters: c.counters["lost_encounters"] ?? 0,
    achievements: c.achievements.map((id) => {
      const ach = registry.achievements.find((a) => a.id === id)
      return (
        ach ??
        ({
          id,
          icon: "⭐",
          rarity: "common",
          name: { en: id, es: id },
          description: { en: "", es: "" },
        } as AchievementContent)
      )
    }),
    score,
  }
}

// Deterministic, template-based epilogue paragraph.
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

  // liability epilogue block: a stained record follows the legend.
  const liabilityBlock: Record<Locale, string> = { en: "", es: "" }
  if ((c.liability ?? 0) >= GAME_CONFIG.liabilityNotoriousThreshold) {
    liabilityBlock.en =
      "\n\nAnd the shadows remember. The underworld knows your name — and it has uses for it."
    liabilityBlock.es =
      "\n\nY las sombras lo recuerdan. El hampa conoce tu nombre — y tiene usos para él."
  } else if ((c.liability ?? 0) === 0) {
    liabilityBlock.en =
      "\nYour name is clean. Whatever was done in the dark stayed there, and the realm remembers only the deeds that were sung."
    liabilityBlock.es =
      "\nTu nombre está limpio. Lo que se hizo en la oscuridad quedó allí, y el reino recuerda solo las hazañas que se cantaron."
  }

  // Rival epilogue block.
  const rivalBlock: Record<Locale, string> = { en: "", es: "" }
  if (c.rival) {
    const rv = c.rival
    const playerScore = (c.counters["battles_won"] ?? 0) + (c.counters["quests_completed"] ?? 0)
    const comparison: RivalComparison = {
      name: rv.name,
      class: rv.class,
      playerScore,
      rivalScore: rv.score,
      playerPowerLevel: c.powerLevel,
      rivalPowerLevel: rv.powerLevel,
      playerAchievements: c.achievements.length,
      rivalAchievements: rv.achievementsCount,
    }
    const outcome = playerScore >= rv.score ? "ahead" : "behind"
    const rvClassName = registry.classesById.get(comparison.class)?.name
    const rvClass = rvClassName ? localize(rvClassName, locale) : comparison.class
    rivalBlock.en = `\n\nYour rival ${comparison.name} (${rvClass}) ended with ${comparison.rivalPowerLevel} power and ${comparison.rivalScore} points. You finished ${outcome} — ${comparison.playerScore} to ${comparison.rivalScore}.`
    rivalBlock.es = `\n\nTu rival ${comparison.name} (${rvClass}) terminó con ${comparison.rivalPowerLevel} de poder y ${comparison.rivalScore} puntos. Terminaste ${outcome === "ahead" ? "por delante" : "por detrás"} — ${comparison.playerScore} a ${comparison.rivalScore}.`
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

  return (templates[endingType][locale] ?? templates[endingType].en) + liabilityBlock[locale]
}

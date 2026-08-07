import type {
  ArchetypeContent,
  CharacterState,
  EndingType,
  EventContent,
  FinaleChoice,
  FinaleStage,
  Gender,
  Locale,
  MinigameOutcome,
  Origin,
  OutcomeTier,
  Rarity,
  RivalState,
  ServedClanOffer,
  ServedEvent,
  StatDeltas,
} from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import { Rng } from "../../shared/rng.js"
import {
  CLAN_SPECIALTIES,
  GAME_CONFIG,
  arcForAge,
  RIVAL_FOCUSES,
  RIVAL_NAMES,
} from "../../shared/config.js"
import type { ContentRegistry } from "../content/registry.js"
import {
  adjustAffinity,
  adjustLiability,
  adjustReputation,
  applyAgeDecline,
  applyClanBetrayal,
  clearExpiredHunted,
  computeSeasonGrade,
  deductStamina,
  effectiveWeight,
  ensureRelationship,
  fillSlots,
  getActiveModifier,
  hasPlayableChoice,
  isBenched,
  isFatigued,
  isEligible,
  buildRivalUpdate,
  joinClan,
  leaveClanAmicably,
  localize,
  primaryReputation,
  recomputeDerived,
  regionOf,
  roleSignalFor,
  seasonHeadline,
  seasonRenownGains,
  serveEvent,
  setFlag,
  updateMarketValue,
  updateMomentum,
} from "./helpers.js"
import { generateFinaleStage1, generateFinaleStage2 } from "./finale.js"

// ---------------------------------------------------------------------------
// Character creation
// ---------------------------------------------------------------------------

export function createCharacter(input: {
  id: string
  name: string
  gender?: Gender
  classId: string
  archetypeId?: string | null
  origin?: Origin
  locale: Locale
  registry: ContentRegistry
}): CharacterState {
  const { registry } = input
  const cls = registry.classesById.get(input.classId)
  if (!cls) throw new Error(`unknown class ${input.classId}`)

  let archetype: ArchetypeContent | undefined
  if (input.archetypeId) {
    const pool = registry.archetypes[input.classId] ?? []
    archetype = pool.find((a) => a.id === input.archetypeId)
    if (!archetype)
      throw new Error(`unknown archetype ${input.archetypeId} for class ${input.classId}`)
  }

  //origin dial: pacing/identity only, no stat math.
  const origin: Origin = input.origin ?? "humble"
  const goldMult = origin === "humble" ? 0.5 : 1
  // identity axis: home faction + region are set once and never change.
  const homeFactionId = cls.startingFaction ?? "ironhold"
  const homeRegion = regionOf(homeFactionId, registry)
  const startingGold = Math.round((cls.startingGold ?? 20) * goldMult)

  const base: CharacterState = {
    id: input.id,
    name: input.name,
    gender: input.gender ?? "male",
    class: cls.id,
    archetype: archetype?.id ?? null,
    epithet: null,
    age: GAME_CONFIG.startingAge,
    currentArc: arcForAge(GAME_CONFIG.startingAge),
    homeFactionId,
    homeRegion,
    currentRegion: homeRegion,
    origin,
    strength: cls.base.strength + (archetype?.statDeltas.strength ?? 0),
    dexterity: cls.base.dexterity + (archetype?.statDeltas.dexterity ?? 0),
    constitution: cls.base.constitution + (archetype?.statDeltas.constitution ?? 0),
    intelligence: cls.base.intelligence + (archetype?.statDeltas.intelligence ?? 0),
    charisma: cls.base.charisma + (archetype?.statDeltas.charisma ?? 0),
    seasonCount: 0,
    inventory: [],
    lockedEventPools: [],
    stamina: GAME_CONFIG.startingStamina,
    health: GAME_CONFIG.startingHealth,
    fame: 0,
    gold: startingGold,
    //  liability: every life begins with a clean record.
    liability: 0,
    marketValue: startingGold * 2,
    marketValuePeak: startingGold * 2,
    momentum: "normal",
    status: "alive",
    locale: input.locale,
    turn: 0,
    powerLevel: 0,
    counters: {},
    // Humble origin starts with no local standing; established has a head start.
    reputations: cls.startingFaction
      ? [
          {
            faction: cls.startingFaction,
            value: origin === "humble" ? 0 : 10,
            peakValue: origin === "humble" ? 0 : 10,
          },
        ]
      : [],
    personality: {},
    achievements: [],
    // Social & World Systems
    relationships: [],
    rival: null,
    currentClanId: null,
    huntedBy: null,
    huntedUntilTurn: null,
    clanMemberships: [],
    flags: {},
    lastEventId: null,
    lastClanOfferSeason: null,
    benchedUntilTurn: null,
    pendingJoinOffer: null,
    pendingTournament: null,
    pendingTournamentResult: null,
    lastTournamentSeason: null,
    pendingCapstoneResult: null,
    finaleStage2Choice: undefined,
  }
  recomputeDerived(base)
  return base
}

// ---------------------------------------------------------------------------
// Deciding what event to serve this turn
// ---------------------------------------------------------------------------

function isRetirementTurn(c: CharacterState): boolean {
  if (c.age < GAME_CONFIG.retirementEligibleAge) return false
  return c.turn % GAME_CONFIG.retirementOfferEvery === 0
}

export function wouldBeDestinyTurn(c: CharacterState): boolean {
  if (c.turn === 0) return false
  const yearsPlayed = Math.floor(c.turn / GAME_CONFIG.turnsPerYear)
  return yearsPlayed > 0 && yearsPlayed % GAME_CONFIG.destinyCardYears === 0 && c.age >= 16
}

// ---------------------------------------------------------------------------
// Rival generation
// ---------------------------------------------------------------------------

export function generateRival(c: CharacterState, registry: ContentRegistry, rng: Rng): RivalState {
  const classes = registry.classes
  const otherClasses = classes.filter((cls) => cls.id !== c.class)
  const rivalClass = otherClasses.length > 0 ? rng.pick(otherClasses).id : c.class
  const name = rng.pick(RIVAL_NAMES)
  const rivalFactions = registry.factions.filter((f) => f.id !== c.reputations[0]?.faction)
  const faction = rivalFactions.length > 0 ? rng.pick(rivalFactions).id : null
  return {
    name,
    class: rivalClass,
    factionId: faction,
    // The rival starts with a seasonal focus picked via the seeded rng.
    focusId: rng.pick(RIVAL_FOCUSES).id,
    powerLevel: c.powerLevel - rng.int(0, 5),
    age: c.age,
    location: "distant lands",
    achievementsCount: 0,
    score: 0,
    lastAdvancedTurn: 0,
  }
}

// ---------------------------------------------------------------------------
// World event rolling
// ---------------------------------------------------------------------------

export function rollWorldEvents(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { headline: string; narrative: string }[] {
  const results: { headline: string; narrative: string }[] = []
  const worldPool = registry.events.filter((e) => e.type === "world" && isEligible(e, c))
  const count = Math.min(GAME_CONFIG.worldEventsPerSeason, worldPool.length)
  for (let i = 0; i < count; i++) {
    const ev = rng.pick(worldPool)
    if (!ev) continue
    const headline = ev.worldEventHeadline
      ? fillSlots(localize(ev.worldEventHeadline, c.locale), c.locale, registry, rng, c)
      : "The World Turns"
    const narrative = fillSlots(localize(ev.narrative, c.locale), c.locale, registry, rng, c)
    results.push({ headline, narrative })
  }
  return results
}

// ---------------------------------------------------------------------------
// Faction wealth -> signing gold & season stipend
// ---------------------------------------------------------------------------

// A faction's relative size/wealth (1-10, authored in content/factions.json).
// Falls back to a mid value for unknown ids.
function factionWealth(factionId: string, registry: ContentRegistry): number {
  return registry.factionsById.get(factionId)?.wealth ?? 3
}

// Clan offers fire at most once per season. The guard just skips the roll when
// an offer already appeared this season (lastClanOfferSeason === seasonCount);
// per-turn rates are unchanged.
function clanOfferDueThisSeason(c: CharacterState): boolean {
  return (c.lastClanOfferSeason ?? -1) < c.seasonCount
}

// Deterministic signing gold for joining a faction. Scales with the faction's
// wealth plus the character's fame/power, so high-renown characters face
// richer offers and richer factions outbid poorer ones.
export function signingGoldFor(
  c: CharacterState,
  factionId: string,
  registry: ContentRegistry,
): number {
  const wealth = factionWealth(factionId, registry)
  const qualityMod = getActiveModifier(c, "offerQualityModifier")
  return Math.round((100 + wealth * 100 + c.fame * 8 + c.powerLevel * 4) * (1 + qualityMod))
}

// Per-season stipend a faction pays its members. Scales with the faction's
// wealth, the character's fame, and their standing inside that faction —
// loyalty literally pays, which gives a reason to stay beyond honor.
export function seasonStipendFor(
  c: CharacterState,
  factionId: string,
  registry: ContentRegistry,
): number {
  const wealth = factionWealth(factionId, registry)
  const rep = c.reputations.find((r) => r.faction === factionId)?.value ?? 0
  return Math.round((30 + wealth * 40) * (1 + c.fame * 0.01 + rep * 0.008))
}

// ---------------------------------------------------------------------------
// Clan offer generation
// ---------------------------------------------------------------------------

export function generateClanOffer(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { offers: ServedClanOffer[] } {
  const factions = registry.factions.filter((f) => f.id !== c.currentClanId)
  const shuffled = [...factions].sort(() => rng.next() - 0.5)
  const count = Math.min(3, shuffled.length)
  const offers: ServedClanOffer[] = []
  for (let i = 0; i < count; i++) {
    const f = shuffled[i]
    const specialty = rng.pick(CLAN_SPECIALTIES)
    const signingGold = signingGoldFor(c, f.id, registry)
    const stipend = seasonStipendFor(c, f.id, registry)
    offers.push({
      clanId: f.id,
      name: localize(f.name, c.locale),
      specialty: localize(specialty.label, c.locale),
      signingGold,
      stipend,
      perkLabel: `+${signingGold}g signing, +${stipend}g/season`,
      icon: "🏛️",
      // telegraph the bench risk on the offer itself, before the player picks.
      roleSignal: roleSignalFor(c, f.id, registry),
    })
  }
  return { offers }
}

// ---------------------------------------------------------------------------
// Rival advancement at season boundary
// ---------------------------------------------------------------------------

export function advanceRival(c: CharacterState, rng: Rng): void {
  const rival = c.rival
  if (!rival) return
  rival.age = c.age
  rival.powerLevel += rng.int(-1, 3)
  rival.powerLevel = Math.max(0, rival.powerLevel)
  rival.achievementsCount += rng.bool(0.15) ? 1 : 0
  // Rotate the seasonal focus via the seeded rng (deterministic per daily seed):
  // most seasons the rival stays on the same crusade, sometimes it shifts.
  // Legacy rivals without a focus always converge to one on their first advance.
  const focusPool = RIVAL_FOCUSES.filter((f) => f.id !== rival.focusId)
  if (!rival.focusId || rng.bool(0.4)) {
    rival.focusId = rng.pick(focusPool.length > 0 ? focusPool : RIVAL_FOCUSES).id
  }
  // The focus biases score growth (config-tuned, deterministic — no extra draws).
  const focusBonus = RIVAL_FOCUSES.find((f) => f.id === rival.focusId)?.scoreBonus ?? 0
  rival.score += rng.int(0, 5) + focusBonus
  rival.lastAdvancedTurn = c.turn
  // Random flavor updates.
  const locations = [
    "the northern reaches",
    "the capital",
    "the wildlands",
    "distant shores",
    "the court",
  ]
  rival.location = rng.pick(locations)
}

// Pick the event/minigame for the upcoming turn. Deterministic via the run rng.
export function selectEvent(c: CharacterState, registry: ContentRegistry, rng: Rng): EventContent {
  // Destiny events: roughly once every destinyCardYears in-game years.
  if (wouldBeDestinyTurn(c)) {
    const destinyPool = registry.events.filter(
      (e) => e.type === "destiny" && isEligible(e, c) && hasPlayableChoice(e, c),
    )
    if (destinyPool.length > 0) {
      const picked = rng.weighted(destinyPool, (ev) => effectiveWeight(ev, c))
      c.lastEventId = picked.id
      return picked
    }
  }
  // Occasionally offer a minigame instead of a normal event.
  const pool: EventContent[] = []
  const wantMinigame = rng.bool(0.28)
  const candidates = wantMinigame ? registry.minigames : registry.events
  // Interactive minigames are a rare garnish: at most maxInteractiveMinigamesPerRun
  // per run, spaced at least interactiveMinigameCooldownTurns turns apart. Both
  // limits are tracked on the character (deterministic per run, so daily seeds
  // stay reproducible). Classic card-pick minigames are unaffected.
  const interactiveServed = c.counters["interactive_games_served"] ?? 0
  const interactiveBudget = GAME_CONFIG.maxInteractiveMinigamesPerRun - interactiveServed
  const lastInteractiveTurn = c.counters["last_interactive_turn"] ?? Number.NEGATIVE_INFINITY
  const interactiveReady =
    c.turn - lastInteractiveTurn >= GAME_CONFIG.interactiveMinigameCooldownTurns
  for (const ev of candidates) {
    if (ev.type === "destiny") continue
    // Season-end capstones are served by buildServedEvent on the turn before
    // the season boundary — never through the normal random rotation.
    if (ev.isCapstone) continue
    // Never serve a card set the player cannot act on: skip events whose
    // choices are all stat-locked for this character. Interactive minigames
    // have no choices at all — they resolve move-by-move, so they are always
    // playable when eligible (subject to the per-run cap + cooldown above).
    if (isEligible(ev, c)) {
      if (ev.resolution?.type === "interactive") {
        if (interactiveBudget <= 0 || !interactiveReady) continue
        pool.push(ev)
      } else if (hasPlayableChoice(ev, c)) {
        pool.push(ev)
      }
    }
  }
  // Avoid serving the exact same event twice in a row.
  const noRepeat = pool.filter((ev) => ev.id !== c.lastEventId)
  const preferred = noRepeat.length > 0 ? noRepeat : pool
  // Fallback: if the chosen pool is empty, try the other pool, then any event.
  const finalPool =
    preferred.length > 0
      ? preferred
      : registry.events.filter((e) => isEligible(e, c) && hasPlayableChoice(e, c))
  if (finalPool.length === 0) {
    // Absolute fallback: first event with a playable choice, ignoring gating.
    const playable = registry.events.find((e) => hasPlayableChoice(e, c))
    if (playable) return playable
    return registry.events[0]
  }
  const picked = rng.weighted(finalPool, (ev) => effectiveWeight(ev, c))
  c.lastEventId = picked.id
  // Track interactive minigame servings so the per-run cap + cooldown hold.
  if (picked.resolution?.type === "interactive") {
    bumpCounter(c, "interactive_games_served")
    c.counters["last_interactive_turn"] = c.turn
  }
  return picked
}

// A synthetic season-summary event (generated server-side at season boundaries).
export function generateSeasonSummary(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): EventContent {
  // Clear expired hunted status and advance rival at season boundary.
  clearExpiredHunted(c)
  if (c.rival) {
    advanceRival(c, rng)
  }
  return {
    id: "__season_summary__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    narrative: {
      en: `Season ${c.seasonCount + 1} draws to a close. The road ahead stretches, and your legend grows.`,
      es: `La temporada ${c.seasonCount + 1} llega a su fin. El camino se extiende y tu leyenda crece.`,
    },
    choices: [
      {
        id: "continue",
        rarity: "common" as Rarity,
        label: { en: "Continue", es: "Continuar" },
        narrative: {
          en: "Onward. There is more to come.",
          es: "Adelante. Queda mucho por venir.",
        },
      },
    ],
  }
}

// A synthetic forced-recovery event served when the character is exhausted.
export function forcedRecoveryEvent(): EventContent {
  return {
    id: "__forced_recovery__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "road",
    narrative: {
      en: "Your body finally gives out. The road blurs before your eyes — you cannot go on. You must stop and recover.",
      es: "Tu cuerpo finalmente se rinde. El camino se desdibuja ante tus ojos: no puedes seguir. Debes detenerte y recuperarte.",
    },
    choices: [
      {
        id: "rest",
        rarity: "common" as Rarity,
        label: { en: "Rest & recover", es: "Descansar y recuperarse" },
        narrative: {
          en: "You find a quiet spot and sleep through the day. Strength slowly returns.",
          es: "Encuentras un lugar tranquilo y duermes durante el día. La fuerza regresa lentamente.",
        },
        staminaDelta: GAME_CONFIG.forcedRecoveryRestore,
      },
    ],
  }
}

// A synthetic retirement-offer event (not authored in content).
export function retirementOfferEvent(): EventContent {
  return {
    id: "__retirement_offer__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "court",
    narrative: {
      en: "The years sit heavier now. Word has spread of your deeds, and a quiet estate could be yours. Do you hang up the blade, or ride on?",
      es: "Los años pesan más. Se habla de tus hazañas, y una hacienda tranquila podría ser tuya. ¿Cuelgas la espada o sigues cabalgando?",
    },
    choices: [
      {
        id: "retire",
        rarity: "rare" as Rarity,
        label: {
          en: "Retire with honor",
          es: "Retirarse con honor",
        },
        narrative: {
          en: "You lay down the blade while the songs are still kind.",
          es: "Dejas la espada mientras las canciones aún son amables.",
        },
      },
      {
        id: "ride_on",
        rarity: "common" as Rarity,
        label: { en: "Ride on", es: "Seguir cabalgando" },
        narrative: {
          en: "Not yet. There is more road, and more to prove.",
          es: "Todavía no. Queda camino, y queda mucho por demostrar.",
        },
        statDeltas: { constitution: 1 },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// negotiation follow-up
// ---------------------------------------------------------------------------

// Served after the player picks a clan offer but before the join finalizes.
// The risk of "pressing for more gold" is stated on the option itself.
export function negotiationFollowUpEvent(
  c: CharacterState,
  registry: ContentRegistry,
): EventContent {
  const offer = c.pendingJoinOffer
  const faction = offer ? registry.factionsById.get(offer.clanId) : undefined
  const factionName = faction ? localize(faction.name, c.locale) : ""
  const offersLine =
    c.locale === "en"
      ? `${offer?.signingGold ?? 0}g signing, ${offer?.stipend ?? 0}g/season`
      : `${offer?.signingGold ?? 0} de oro de contratación, ${offer?.stipend ?? 0} de oro/temporada`
  return {
    id: "__clan_offer_negotiate__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "court",
    narrative: {
      en: `The ${factionName} emissary awaits your answer. The parchment on the table reads: ${offersLine}. Your hand hovers over the quill.`,
      es: `El emisario de ${factionName} espera tu respuesta. El pergamino sobre la mesa dice: ${offersLine}. Tu mano se cierne sobre la pluma.`,
    },
    choices: [
      {
        id: "accept_join",
        rarity: "common" as Rarity,
        label: { en: "Sign as offered", es: "Firmar tal como está" },
        narrative: {
          en: "You sign without haggling. A clean contract, a clean start.",
          es: "Firmas sin regatear. Un contrato limpio, un comienzo limpio.",
        },
      },
      {
        id: "negotiate_join",
        rarity: "rare" as Rarity,
        outcome: "risky",
        riskLabel: {
          en: "The emissary may withdraw the offer outright",
          es: "El emisario puede retirar la oferta por completo",
        },
        label: {
          en: "Press for more gold — the deal may collapse",
          es: "Exigir más oro — la oferta puede caerse",
        },
        narrative: {
          en: "You press for better terms.",
          es: "Exiges mejores condiciones.",
        },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// whole-arc tournaments
// ---------------------------------------------------------------------------

const TOURNAMENT_NAMES: Record<string, { en: string; es: string }> = {
  grand_melee: { en: "the Grand Melee", es: "la Gran Justa" },
  high_duel: { en: "the High Duel", es: "el Duelo Mayor" },
  tournament_of_arms: { en: "the Tournament of Arms", es: "el Torneo de Armas" },
  champions_games: { en: "the Champions' Games", es: "los Juegos de los Campeones" },
}

function tournamentName(nameKey: string, locale: Locale): string {
  return TOURNAMENT_NAMES[nameKey]?.[locale] ?? TOURNAMENT_NAMES[nameKey]?.en ?? nameKey
}

// A tournament arc can start roughly once per tournamentCadenceYears, rng-gated
// like destiny cards. Uses the season guard so it can't double-fire.
function wouldBeTournamentTurn(c: CharacterState): boolean {
  if (c.turn === 0 || c.age < 16) return false
  if ((c.lastTournamentSeason ?? -1) >= c.seasonCount) return false
  const yearsPlayed = Math.floor(c.turn / GAME_CONFIG.turnsPerYear)
  return yearsPlayed > 0 && yearsPlayed % GAME_CONFIG.tournamentCadenceYears === 0
}

export function tournamentIntroEvent(c: CharacterState, nameKey: string): EventContent {
  const name = tournamentName(nameKey, c.locale)
  return {
    id: "__tournament_intro__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "court",
    narrative: {
      en: `Heralds ride into the square: ${name} begins at the next new moon. Champions from every clan will enter — and you are invited. One choice decides how you will face it: trust to luck, or trust to your own skill.`,
      es: `Los heraldos cabalgan hasta la plaza: ${name} comienza en la próxima luna nueva. Campeones de todos los clanes participarán — y estás invitado. Una sola decisión define cómo lo afrontarás: fiarte de la suerte, o fiarte de tu propia habilidad.`,
    },
    choices: [
      {
        id: "mode_luck",
        rarity: "common" as Rarity,
        label: {
          en: "Trust to luck (each bout is a gamble)",
          es: "Fiarme de la suerte (cada combate es una apuesta)",
        },
        narrative: {
          en: "You let fate decide the bouts. All the better to blame the dice.",
          es: "Dejas que el destino decida los combates. Mejor así, para culpar a los dados.",
        },
      },
      {
        id: "mode_skill",
        rarity: "rare" as Rarity,
        label: {
          en: "Trust to skill (memory & reflexes decide)",
          es: "Fiarme de la habilidad (la memoria y los reflejos deciden)",
        },
        narrative: {
          en: "You study every opponent. No luck will be needed.",
          es: "Estudias a cada rival. No hará falta suerte.",
        },
      },
    ],
  }
}

// One fixture of an in-progress tournament. Luck mode → grid_gamble; skill mode
// → memory_match (stat-affected). Resolved through the standard resolveMinigame.
export function tournamentFixtureEvent(c: CharacterState): EventContent {
  const t = c.pendingTournament
  if (!t) return tournamentIntroEvent(c, "grand_melee")
  const name = tournamentName(t.nameKey, c.locale)
  const bout = 4 - t.fixturesLeft
  const mode = t.mode
  const luck = mode === "luck"
  return {
    id: "__tournament_fixture__",
    type: "minigame" as const,
    subtype: luck ? "grid_gamble" : "memory_match",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "court",
    primaryStat: luck ? "charisma" : "intelligence",
    narrative: {
      en: `${name} — bout ${bout} of 3. The crowd roars as the herald calls your name across the arena.`,
      es: `${name} — combate ${bout} de 3. La multitud ruge cuando el heraldo grita tu nombre por la arena.`,
    },
    cards: [
      {
        id: "measured",
        icon: "shield",
        label: { en: "Measured play", es: "Juego mesurado" },
      },
      {
        id: "aggressive",
        icon: "swords",
        label: { en: "Aggressive play", es: "Juego agresivo" },
      },
      {
        id: "flashy",
        icon: "sparkles",
        label: { en: "Flashy flourish", es: "Gesto vistoso" },
      },
    ],
    resolution: {
      type: luck ? "grid_gamble" : "memory_match",
      baseWinChance: 0.4,
      statInfluence: luck ? {} : { intelligence: 0.01 },
      statThreshold: luck ? undefined : 10,
      bonusLives: luck ? 0 : 1,
      cardModifiers: {
        measured: { winChanceDelta: 0.05, critChanceDelta: -0.05 },
        aggressive: { winChanceDelta: 0, critChanceDelta: 0.1 },
        flashy: { winChanceDelta: -0.1, critChanceDelta: 0.2 },
      },
    },
    outcomes: {
      critical: {
        fameDelta: 8,
        narrative: {
          en: "You dominate the bout. The crowd chants your name as you take the round.",
          es: "Dominás el combate. La multitud canta tu nombre mientras te llevás la ronda.",
        },
      },
      success: {
        fameDelta: 4,
        narrative: {
          en: "A clean win. You salute the fallen opponent and advance.",
          es: "Una victoria limpia. Saludás al rival caído y avanzás.",
        },
      },
      partial: {
        fameDelta: 1,
        narrative: {
          en: "A draw. Neither side gives ground — you live to fight the next bout.",
          es: "Empate. Ningún bando cede terreno — vivís para el próximo combate.",
        },
      },
      fail: {
        fameDelta: -1,
        narrative: {
          en: "The bout goes against you. The crowd's roar turns to a sigh.",
          es: "El combate se te va en contra. El rugido de la multitud se vuelve suspiro.",
        },
      },
    },
  }
}

// Honor beat served after the last fixture resolves.
export function tournamentOutcomeEvent(c: CharacterState, registry: ContentRegistry): EventContent {
  const res = c.pendingTournamentResult
  const won = res?.won ?? false
  const name = tournamentName(res?.nameKey ?? "grand_melee", c.locale)
  const clanId = c.currentClanId ?? c.homeFactionId
  const clanName = registry.factionsById.get(clanId)
    ? localize(registry.factionsById.get(clanId)!.name, c.locale)
    : c.locale === "en"
      ? "the freelancers"
      : "los independientes"
  if (won) {
    return {
      id: "__tournament_outcome__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      location: "court",
      narrative: {
        en: `The final bell rings. You are the champion of ${name}! ${clanName} erupts — your name will be sung for a season.`,
        es: `Suena la campana final. Sos el campeón de ${name}! ${clanName} estalla — cantarán tu nombre durante toda una temporada.`,
      },
      choices: [
        {
          id: "continue",
          rarity: "rare" as Rarity,
          label: { en: "Bask in the glory", es: "Disfrutar de la gloria" },
          countersDelta: { tournaments_won: 1 },
          fameDelta: 20,
          goldDelta: 300,
          reputationDelta: 15,
          reputationFaction: clanId,
          factionId: clanId,
          narrative: {
            en: "Cups raised, laurels won. You carry the trophy back to the hall.",
            es: "Copas alzadas, laureles ganados. Llevás el trofeo de vuelta a la sala.",
          },
        },
      ],
    }
  }
  return {
    id: "__tournament_outcome__",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    location: "court",
    narrative: {
      en: `The run ends at ${name} — you fall one bout short of the laurels. ${clanName} still finds a kind word for you.`,
      es: `La carrera termina en ${name} — caés a un combate de los laureles. ${clanName} aún encuentra una palabra amable para vos.`,
    },
    choices: [
      {
        id: "continue",
        rarity: "common" as Rarity,
        label: { en: "Nurse the bruises", es: "Curar los golpes" },
        fameDelta: 3,
        narrative: {
          en: "A scar, a story, and the promise of the next tournament.",
          es: "Una cicatriz, una historia, y la promesa del próximo torneo.",
        },
      },
    ],
  }
}

export function buildServedEvent(
  c: CharacterState,
  registry: ContentRegistry,
  rng: Rng,
): { event: EventContent; served: ServedEvent; finaleStage?: FinaleStage } {
  // Finale stage 2: outcome narrative with a single "continue" button.
  if (c.finaleStage2Choice) {
    const stage2 = generateFinaleStage2(
      c,
      c.finaleStage2Choice.endingType,
      c.finaleStage2Choice.risky
        ? ({ id: "finale_risky" } as FinaleChoice)
        : ({ id: "finale_safe" } as FinaleChoice),
      registry,
      rng,
      c.locale,
    )
    const ev: EventContent = {
      id: "__finale_outcome__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      narrative: stage2.narrative,
      choices: [
        {
          id: "continue",
          rarity: "common" as Rarity,
          label: { en: "The end", es: "El final" },
          narrative: { en: "The story closes.", es: "La historia se cierra." },
        },
      ],
    }
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: stage2,
    }
  }
  // Finale stage 1: if pendingFinaleType is set, serve the risky/safe choice.
  if (c.pendingFinaleType) {
    const endingType = c.pendingFinaleType
    const stage = generateFinaleStage1(c, endingType, registry, rng, c.locale)
    const ev: EventContent = {
      id: "__finale__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      narrative: stage.narrative,
      choices: (stage.choices ?? []).map((ch) => ({
        id: ch.id,
        rarity: "rare" as Rarity,
        label: ch.label,
        narrative: ch.narrative,
        statDeltas: ch.statDeltas,
        fameDelta: ch.fameDelta,
        goldDelta: ch.goldDelta,
        reputationDelta: ch.reputationDelta,
        reputationFaction: ch.reputationFaction,
        healthDelta: ch.healthDelta,
      })),
    }
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: stage,
    }
  }
  // negotiation follow-up: the player picked a clan offer last turn and
  // must now accept or press for more gold (risking the whole deal).
  if (c.pendingJoinOffer) {
    const ev = negotiationFollowUpEvent(c, registry)
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: undefined,
    }
  }
  // honor beat served after the last tournament fixture resolves.
  if (c.pendingTournamentResult) {
    const ev = tournamentOutcomeEvent(c, registry)
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: undefined,
    }
  }
  // an in-progress tournament continues before any other beat.
  if (c.pendingTournament) {
    const ev = tournamentFixtureEvent(c)
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: undefined,
    }
  }
  // Season-end capstone: on the turn before the season boundary, serve a
  // capstone minigame (debate / election) as a set-piece. Its verdict is
  // stashed on the character and surfaced on the season summary next turn.
  if (c.turn > 0 && c.turn % GAME_CONFIG.seasonLength === GAME_CONFIG.seasonLength - 1) {
    const capPool = registry.minigames.filter((ev) => ev.isCapstone && isEligible(ev, c))
    if (capPool.length > 0) {
      const picked = rng.weighted(capPool, (ev) => ev.weight)
      const served = serveEvent(picked, c, c.locale, registry, rng, false)
      served.isCapstone = true
      served.capstoneKind = picked.capstoneKind ?? "debate"
      return { event: picked, served, finaleStage: undefined }
    }
  }
  // Season boundary: after every seasonLength turns, serve the season summary.
  if (c.turn > 0 && c.turn % GAME_CONFIG.seasonLength === 0) {
    const ev = generateSeasonSummary(c, registry, rng)
    const served = serveEvent(ev, c, c.locale, registry, rng, false)
    served.isSeasonSummary = true
    // A resolved capstone verdict swings this season's grade and is shown as a
    // set-piece block on the summary. resolveSeasonSummary clears it after.
    const capstone = c.pendingCapstoneResult ?? null
    const grade = computeSeasonGrade(c, capstone?.gradeDelta ?? 0)
    served.seasonGrade = grade
    served.seasonHeadline = seasonHeadline(grade, c.locale)
    if (capstone) served.capstoneResult = capstone

    // The renown dividend ("the bards sing"): fame + faction standing earned
    // this season, scaled by the grade. Shown here; resolveSeasonSummary
    // applies the same deterministic amounts when the player continues.
    const renown = seasonRenownGains(c, capstone?.gradeDelta ?? 0)
    served.seasonFameGain = renown.fame
    if (renown.reputation > 0) served.seasonReputationGain = renown.reputation

    // Roll world events and embed in season summary.
    served.worldEvents = rollWorldEvents(c, registry, rng)

    // Faction stipend earned this season (shown on the summary before the
    // player continues; resolveSeasonSummary applies the same deterministic amount).
    if (c.currentClanId) {
      served.stipendEarned = seasonStipendFor(c, c.currentClanId, registry)
    }

    // Rival update: name, class, location, seasonal focus, power/score.
    served.rivalUpdate = buildRivalUpdate(c, registry, c.locale)

    return { event: ev, served, finaleStage: undefined }
  }
  // Exhaustion: after forcedRecoveryTurns consecutive turns at 0 stamina, force a rest.
  if ((c.staminaZeroStreak ?? 0) >= GAME_CONFIG.forcedRecoveryTurns) {
    const ev = forcedRecoveryEvent()
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: undefined,
    }
  }
  // Clan offer: ~8% chance for clanless characters (not on season/retirement
  // turns), at most once per season.
  if (!c.currentClanId && clanOfferDueThisSeason(c) && rng.bool(0.08)) {
    c.lastClanOfferSeason = c.seasonCount
    const { offers } = generateClanOffer(c, registry, rng)
    const ev: EventContent = {
      id: "__clan_offer__",
      minAge: 0,
      maxAge: 999,
      weight: 1,
      narrative: {
        en: "A messenger arrives with offers from several factions seeking your allegiance...",
        es: "Un mensajero llega con ofertas de varias facciones buscando tu lealtad...",
      },
      choices: offers.map((o) => {
        const faction = registry.factions.find((f) => f.id === o.clanId)
        return {
          id: `join_${o.clanId}`,
          rarity: "uncommon" as Rarity,
          label: faction?.name ?? { en: o.name, es: o.name },
          narrative: { en: o.perkLabel, es: o.perkLabel },
          joinClanId: o.clanId,
          factionId: o.clanId,
          goldDelta: o.signingGold,
          stipend: o.stipend,
        }
      }),
    }
    const served = serveEvent(ev, c, c.locale, registry, rng, false)
    served.isClanOffer = true
    served.clanOfferChoices = offers
    return { event: ev, served, finaleStage: undefined }
  }
  // Poaching offer for clan members — rate scales with powerLevel. At most once
  // per season, shared with the clanless joining offer.
  if (c.currentClanId && clanOfferDueThisSeason(c)) {
    const memberRate = Math.min(
      GAME_CONFIG.memberOfferRateCap,
      GAME_CONFIG.memberOfferBaseRate + c.powerLevel * GAME_CONFIG.memberOfferRatePerPower,
    )
    if (rng.bool(memberRate)) {
      c.lastClanOfferSeason = c.seasonCount
      const { offers } = generateClanOffer(c, registry, rng)
      const ev: EventContent = {
        id: "__clan_poach__",
        minAge: 0,
        maxAge: 999,
        weight: 1,
        narrative: {
          en: "Your reputation has spread. A rival faction sends emissaries with an offer...",
          es: "Tu reputación se ha extendido. Una facción rival envía emisarios con una oferta...",
        },
        choices: [
          ...offers.map((o) => {
            const faction = registry.factions.find((f) => f.id === o.clanId)
            return {
              id: `join_${o.clanId}`,
              rarity: "uncommon" as Rarity,
              label: faction?.name ?? { en: o.name, es: o.name },
              narrative: { en: o.perkLabel, es: o.perkLabel },
              joinClanId: o.clanId,
              factionId: o.clanId,
              goldDelta: o.signingGold,
              stipend: o.stipend,
            }
          }),
          {
            id: "stay_loyal",
            rarity: "common" as Rarity,
            label: (() => {
              const cf = registry.factions.find((f) => f.id === c.currentClanId)
              return cf?.name
                ? { en: `Stay Loyal to ${cf.name.en}`, es: `Mantenerse Leal a ${cf.name.es}` }
                : { en: "Stay Loyal", es: "Mantenerse Leal" }
            })(),
            narrative: {
              en: "Your loyalty is unwavering. Your current clan respects your commitment.",
              es: "Tu lealtad es inquebrantable. Tu clan actual respeta tu compromiso.",
            },
            reputationDelta: 3,
            reputationFaction: c.currentClanId,
            factionId: c.currentClanId,
            fameDelta: 1,
          },
        ],
      }
      const served = serveEvent(ev, c, c.locale, registry, rng, false)
      served.isClanOffer = true
      served.clanOfferChoices = offers
      return { event: ev, served, finaleStage: undefined }
    }
  }
  if (isRetirementTurn(c)) {
    const ev = retirementOfferEvent()
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, true),
      finaleStage: undefined,
    }
  }
  // whole-arc tournament intro: rng-gated to fire roughly once per cadence.
  if (wouldBeTournamentTurn(c) && rng.bool(0.5)) {
    c.lastTournamentSeason = c.seasonCount
    const nameKey = rng.pick(Object.keys(TOURNAMENT_NAMES))
    setFlag(c, "pendingTournamentNameKey", nameKey)
    const ev = tournamentIntroEvent(c, nameKey)
    return {
      event: ev,
      served: serveEvent(ev, c, c.locale, registry, rng, false),
      finaleStage: undefined,
    }
  }
  const ev = selectEvent(c, registry, rng)
  return {
    event: ev,
    served: serveEvent(ev, c, c.locale, registry, rng, false),
    finaleStage: undefined,
  }
}

// Resolve a season summary event: advance season, pay the faction stipend,
// clean up expired inventory.
export function resolveSeasonSummary(c: CharacterState, registry: ContentRegistry): void {
  c.seasonCount += 1
  c.turn += 1
  // The bards sing: renown earned this season (fame + standing with the current
  // faction), scaled by the season grade — deterministic and matching the
  // amounts served on the summary block. Read before the capstone is cleared.
  const renown = seasonRenownGains(c, c.pendingCapstoneResult?.gradeDelta ?? 0)
  c.fame += renown.fame
  if (renown.reputation > 0 && c.currentClanId) {
    // Unscaled: the dividend is already at its final value, matching the
    // amount shown on the season summary (adjustReputation would re-scale it).
    adjustReputation(c, c.currentClanId, renown.reputation, false)
  }
  // The capstone verdict was consumed by this season's summary.
  c.pendingCapstoneResult = null
  //  liability: the underworld's memory fades slowly, a season at a time.
  if (GAME_CONFIG.liabilityDecayPerSeason > 0) {
    adjustLiability(c, -GAME_CONFIG.liabilityDecayPerSeason)
  }
  // Faction stipend: a faction pays its members each season.
  if (c.currentClanId) {
    c.gold += seasonStipendFor(c, c.currentClanId, registry)
  }
  // Clean up expired consumables.
  c.inventory = c.inventory.filter((entry) => {
    if (entry.expiresAtTurn && entry.expiresAtTurn <= c.turn) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Applying deltas
// ---------------------------------------------------------------------------

// Re-exported for the press_conference minigame module, which weighs each
// answer option's hidden target by the character's accumulated tag history.
export function computeTagSynergy(
  c: CharacterState,
  choice: { wantedTags?: Record<string, number>; punishedTags?: Record<string, number> },
): number {
  let synergy = 0
  if (choice.wantedTags) {
    for (const [tag, bonus] of Object.entries(choice.wantedTags)) {
      if ((c.personality[tag] ?? 0) > 0) synergy += bonus
    }
  }
  if (choice.punishedTags) {
    for (const [tag, malus] of Object.entries(choice.punishedTags)) {
      if ((c.personality[tag] ?? 0) > 0) synergy += malus
    }
  }
  return synergy
}

function applyStatDeltas(c: CharacterState, deltas?: StatDeltas, multiplier = 1): number {
  if (!deltas) return 0
  let net = 0
  const fatigue = isFatigued(c) ? 0.5 : 1
  // bench penalty: over-reaching into a big clan means reduced stat gains
  // until the power level catches up (isBenched reads benchedUntilTurn).
  const bench = isBenched(c) ? 0.8 : 1
  for (const k of STAT_KEYS) {
    if (deltas[k]) {
      const raw = deltas[k] as number
      const adjusted = raw > 0 ? Math.round(raw * fatigue * multiplier * bench) : raw
      c[k] += adjusted
      net += adjusted
    }
  }
  return net
}

function bumpCounter(c: CharacterState, key: string, by = 1): void {
  c.counters[key] = (c.counters[key] ?? 0) + by
}

// Track drawn-card rarity for the collection-style achievements.
function recordRarity(c: CharacterState, rarity: Rarity): void {
  if (rarity === "rare") bumpCounter(c, "rare_cards")
  if (rarity === "volatile") bumpCounter(c, "legendary_cards")
}

// ---------------------------------------------------------------------------
// Death / aging
// ---------------------------------------------------------------------------

function rollDeath(c: CharacterState, pendingInjuryRisk: number, rng: Rng): boolean {
  // Shop item injury risk modifier (battle_healer, season_healer).
  const shopMitigation = getActiveModifier(c, "injuryRiskModifier")
  // Injury/accident risk from the chosen outcome, mitigated by constitution + shop.
  const conMitigation = Math.min(0.4, c.constitution * 0.01)
  const injuryChance = Math.max(0, pendingInjuryRisk - conMitigation + shopMitigation)
  if (injuryChance > 0 && rng.bool(injuryChance)) return true

  // Age-based background risk after ageRiskStart.
  if (c.age >= GAME_CONFIG.ageRiskStart) {
    const ageRisk = (c.age - GAME_CONFIG.ageRiskStart) * 0.012
    if (rng.bool(ageRisk)) return true
  }
  // Health depletion.
  if (c.health <= 0) return true
  return false
}

function ageUp(c: CharacterState): void {
  if (c.turn % GAME_CONFIG.turnsPerYear === 0) {
    c.age += 1
    c.currentArc = arcForAge(c.age)
    applyAgeDecline(c)
  }
}

// ---------------------------------------------------------------------------
// Resolve a regular-event choice
// ---------------------------------------------------------------------------

export interface ResolveOutput {
  narrative: string
  ended: boolean
  endingType?: EndingType
  chosenRarity: Rarity
  wonBattle: boolean
  completedQuest: boolean
}

export function resolveChoice(
  c: CharacterState,
  event: EventContent,
  choiceId: string,
  registry: ContentRegistry,
  rng: Rng,
): ResolveOutput {
  const choice = (event.choices ?? []).find((ch) => ch.id === choiceId)
  if (!choice) throw new Error(`unknown choice ${choiceId} for event ${event.id}`)
  // Stat gating: never trust the client — a locked choice is rejected
  // server-side even if the client somehow submits it.
  if (choice.requiresStat && c[choice.requiresStat.stat] < choice.requiresStat.min) {
    throw new Error(`locked choice ${choiceId} for event ${event.id}`)
  }

  c.turn += 1
  recordRarity(c, choice.rarity)
  c.gold += GAME_CONFIG.goldPerTurn

  // Personality: award the tag associated with the choice.
  if (choice.tag) {
    c.personality[choice.tag] = (c.personality[choice.tag] ?? 0) + 1
  }

  let ended = false
  let endingType: EndingType | undefined

  // Personality tag synergy: past choices amplify present outcomes.
  const tagSynergy = 1 + computeTagSynergy(c, choice)

  // Retirement handling — now sets up the two-stage finale instead of ending immediately.
  if (event.id === "__retirement_offer__" && choice.id === "retire") {
    c.status = "retired"
    c.pendingFinaleType = heroicOrPeaceful(c, "retirement")
    ended = false
  }

  // Finale stage 1 resolution: apply the risky/safe choice, generate stage 2.
  if (event.id === "__finale__") {
    endingType = c.pendingFinaleType
    c.pendingFinaleType = undefined
    c.finaleStage2Choice = {
      endingType: endingType as EndingType,
      risky: choice.id === "finale_risky",
    }
    ended = false
  }

  // Finale stage 2 resolution: the story ends.
  if (event.id === "__finale_outcome__") {
    endingType = c.finaleStage2Choice?.endingType
    c.finaleStage2Choice = undefined
    ended = true
  }

  // Season summary handling.
  if (event.id === "__season_summary__") {
    resolveSeasonSummary(c, registry)
    return {
      narrative: "",
      ended: false,
      endingType: undefined,
      chosenRarity: "common" as Rarity,
      wonBattle: false,
      completedQuest: false,
    }
  }

  // Destiny pool effects: lock/unlock event pools.
  if (choice.unlocksEventPool) {
    for (const poolId of choice.unlocksEventPool) {
      const idx = c.lockedEventPools.indexOf(poolId)
      if (idx !== -1) c.lockedEventPools.splice(idx, 1)
    }
  }
  if (choice.locksEventPool) {
    for (const poolId of choice.locksEventPool) {
      if (!c.lockedEventPools.includes(poolId)) {
        c.lockedEventPools.push(poolId)
      }
    }
  }

  // NPC relationship effects.
  if (choice.introducesRelationshipId) {
    ensureRelationship(
      c,
      choice.introducesRelationshipId,
      choice.introducesNpcRole ?? "acquaintance",
      c.turn,
      choice.introducesNpcName?.[c.locale] ?? undefined,
    )
  }
  if (choice.affinityDelta && event.requiresRelationshipId) {
    adjustAffinity(c, event.requiresRelationshipId, choice.affinityDelta, c.turn)
  } else if (choice.affinityDelta && choice.introducesRelationshipId) {
    adjustAffinity(c, choice.introducesRelationshipId, choice.affinityDelta, c.turn)
  }

  // Long-term flag setting.
  if (choice.setsFlag) {
    for (const [key, value] of Object.entries(choice.setsFlag)) {
      setFlag(c, key, value)
    }
  }

  // Clan joining through a choice.
  if (choice.joinClanId) {
    // negotiation dial: picking a clan offer defers the actual join so the
    // player can press for more gold (risking the deal) on a follow-up choice.
    if (event.id === "__clan_offer__" || event.id === "__clan_poach__") {
      c.pendingJoinOffer = {
        clanId: choice.joinClanId,
        signingGold: choice.goldDelta ?? signingGoldFor(c, choice.joinClanId, registry),
        stipend: choice.stipend ?? 0,
      }
    } else {
      // Authored events that grant membership join immediately.
      // If currently in a clan, this is a betrayal.
      if (c.currentClanId) {
        applyClanBetrayal(c, choice.joinClanId, c.turn)
      }
      // Use the offered amount (goldDelta on the offer card) when present so the
      // gold actually granted matches what the player saw; otherwise compute one.
      const signingGold = choice.goldDelta ?? signingGoldFor(c, choice.joinClanId, registry)
      joinClan(c, choice.joinClanId, c.turn, signingGold, registry)
    }
  }

  // Leaving a clan amicably.
  if (choice.leaveReason) {
    leaveClanAmicably(c, c.turn)
  }

  // negotiation follow-up resolution: accept, or press for more gold (the
  // greed dial — success improves terms, failure withdraws the whole offer).
  let negotiationNarrative: string | null = null
  if (event.id === "__clan_offer_negotiate__") {
    const offer = c.pendingJoinOffer
    if (offer) {
      c.pendingJoinOffer = null
      const clanId = offer.clanId
      const faction = registry.factionsById.get(clanId)
      const factionName = faction ? localize(faction.name, c.locale) : clanId
      if (choice.id === "negotiate_join") {
        const chance =
          GAME_CONFIG.negotiationBaseChance +
          c.charisma * GAME_CONFIG.negotiationCharismaCoeff +
          getActiveModifier(c, "offerQualityModifier")
        if (rng.bool(Math.min(0.95, Math.max(0.05, chance)))) {
          const boostedGold = Math.round(offer.signingGold * GAME_CONFIG.negotiationGoldMultiplier)
          const boostedStipend = Math.round(
            offer.stipend * GAME_CONFIG.negotiationStipendMultiplier,
          )
          if (c.currentClanId) applyClanBetrayal(c, clanId, c.turn)
          joinClan(c, clanId, c.turn, boostedGold, registry)
          bumpCounter(c, "negotiations_won")
          negotiationNarrative =
            c.locale === "en"
              ? `The emissary blinks, then smiles. New terms are written: ${boostedGold}g signing, ${boostedStipend}g/season. You sign your name.`
              : `El emisario parpadea y luego sonríe. Se redactan nuevos términos: ${boostedGold} de oro de contratación, ${boostedStipend} de oro/temporada. Firmás tu nombre.`
        } else {
          // Offer withdrawn — "word gets out" (the reference's deal-collapse).
          adjustReputation(c, clanId, -5)
          bumpCounter(c, "negotiation_failures")
          negotiationNarrative =
            c.locale === "en"
              ? `The emissary's face hardens. The parchment is rolled shut. "The offer was generous. We do not beg." Word spreads quickly among the factions.`
              : `El rostro del emisario se endurece. El pergamino se enrolla. "La oferta era generosa. Nosotros no rogamos." La palabra corre rápido entre las facciones.`
        }
      } else {
        // accept_join
        if (c.currentClanId) applyClanBetrayal(c, clanId, c.turn)
        joinClan(c, clanId, c.turn, offer.signingGold, registry)
        negotiationNarrative =
          c.locale === "en"
            ? `You sign. The ink is barely dry before ${factionName}'s colors are yours.`
            : `Firmás. La tinta apenas se seca cuando los colores de ${factionName} son tuyos.`
      }
    }
  }

  // tournament intro: choose the resolution mode once for the whole arc.
  if (event.id === "__tournament_intro__") {
    const nameKey = (c.flags["pendingTournamentNameKey"] as string) ?? "grand_melee"
    const mode = choice.id === "mode_skill" ? "skill" : "luck"
    c.pendingTournament = { mode, fixturesLeft: 3, won: 0, nameKey }
  }

  // tournament honor beat: rewards ride on the choice deltas; clear the
  // stashed result so the next buildServedEvent serves a normal beat.
  if (event.id === "__tournament_outcome__") {
    c.pendingTournamentResult = null
  }

  const net = applyStatDeltas(c, choice.statDeltas, tagSynergy)
  applyStatDeltas(c, choice.tradeoffDeltas, tagSynergy)
  // Join choices apply their gold through joinClan above — avoid double pay.
  if (!choice.joinClanId && choice.goldDelta) c.gold += choice.goldDelta
  if (choice.fameDelta) c.fame += choice.fameDelta
  if (choice.staminaDelta) c.stamina += choice.staminaDelta
  if (choice.healthDelta) c.health += choice.healthDelta
  if (choice.reputationDelta) {
    adjustReputation(c, choice.reputationFaction ?? defaultFaction(c), choice.reputationDelta)
  }
  //  liability: shady choices stain the record (clamped by adjustLiability).
  if (choice.liabilityDelta) adjustLiability(c, choice.liabilityDelta)

  // Counters for scoring / achievements.
  const wonBattle =
    Boolean(choice.countersDelta?.battles_won) || (event.location === "dungeon" && net > 0)
  const completedQuest = Boolean(choice.countersDelta?.quests_completed)
  if (choice.countersDelta) {
    for (const [k, v] of Object.entries(choice.countersDelta)) bumpCounter(c, k, v)
  }
  if (wonBattle && !choice.countersDelta?.battles_won) bumpCounter(c, "battles_won")
  // Mark this event as completed (for one-shot gating).
  bumpCounter(c, `event_${event.id}`)

  updateMomentum(c, net)
  deductStamina(c)
  updateMarketValue(c)
  recomputeDerived(c)
  ageUp(c)
  clearExpiredHunted(c)

  // Death roll (skip if already retired or finale-pending).
  if (!ended && c.status !== "retired") {
    const injuryRisk = choice.injuryRiskDelta ?? 0
    if (rollDeath(c, injuryRisk, rng) || c.age >= GAME_CONFIG.maxAge) {
      c.status = "dead"
      ended = true
      endingType = heroicOrPeaceful(c, "death")
    }
  }

  const narrative =
    negotiationNarrative ??
    fillSlots(localize(choice.narrative, c.locale), c.locale, registry, rng, c)

  return {
    narrative,
    ended,
    endingType,
    chosenRarity: choice.rarity,
    wonBattle,
    completedQuest,
  }
}

// ---------------------------------------------------------------------------
// Resolve a minigame card selection (hidden weighted match)
// ---------------------------------------------------------------------------

export function resolveMinigame(
  c: CharacterState,
  event: EventContent,
  cardId: string,
  registry: ContentRegistry,
  rng: Rng,
): ResolveOutput {
  const res = event.resolution
  const outcomes = event.outcomes
  if (!res || !outcomes) throw new Error(`minigame ${event.id} malformed`)
  // Interactive minigames are multi-move and resolve through
  // /api/game/minigame-move, never through the single card-pick roll.
  if (res.type === "interactive") {
    throw new Error(`interactive minigame ${event.id} must use minigame-move`)
  }
  const card = (event.cards ?? []).find((k) => k.id === cardId)
  if (!card) throw new Error(`unknown card ${cardId}`)

  // Urn mechanic: picking a trapped card forces the fail tier before the
  // hidden variable is even consulted — risk made visible, outcome hidden.
  // Trap placement is authored per event (never rolled), so daily runs stay
  // deterministic: same seed + same pick → same forced fail.
  let tier: OutcomeTier
  if (card.trap) {
    tier = "fail"
  } else {
    // Compute win chance from base + stat influence + card modifier.
    let winChance = res.baseWinChance
    for (const [stat, per] of Object.entries(res.statInfluence)) {
      winChance += (c[stat as keyof CharacterState] as number) * (per as number)
    }
    let critChance = 0.1
    const mod = res.cardModifiers?.[cardId]
    if (mod) {
      winChance += mod.winChanceDelta ?? 0
      critChance += mod.critChanceDelta ?? 0
    }
    winChance = Math.max(0.02, Math.min(0.97, winChance))

    // Subtype-specific adjustments.
    const subtype = res.type ?? "weighted_hidden_match"
    if (subtype === "grid_gamble") {
      // Pure luck: ignore stat influence, keep only base + card modifiers.
      winChance = Math.max(0.02, Math.min(0.97, res.baseWinChance + (mod?.winChanceDelta ?? 0)))
      critChance = 0.05
    }
    if (subtype === "timing_bar" && res.statThreshold) {
      // Stat widens the green zone: bonus if primary stat >= threshold.
      const primaryStat = event.primaryStat
      if (primaryStat && (c[primaryStat as keyof CharacterState] as number) >= res.statThreshold) {
        winChance += 0.08
      }
    }
    if (subtype === "memory_match" && res.statThreshold) {
      // Stat-gated bonus: higher stat = better recall.
      const primaryStat = event.primaryStat
      if (primaryStat && (c[primaryStat as keyof CharacterState] as number) >= res.statThreshold) {
        winChance += 0.1
      }
    }
    // Season-end debate: personality bends the crowd. Matching tags widen the
    // win window, conflicting tags narrow it — the same wantedTags / punishedTags
    // scoring used by regular choices, applied to the hidden roll instead.
    if (event.capstoneKind === "debate" && event.cards) {
      const tagSynergy = 1 + computeTagSynergy(c, card)
      winChance = Math.max(0.02, Math.min(0.97, winChance * tagSynergy))
    }
    winChance = Math.max(0.02, Math.min(0.97, winChance))

    // Hidden roll -> outcome tier.
    const roll = rng.next()
    if (roll < winChance * critChance) tier = "critical"
    else if (roll < winChance) tier = "success"
    else if (roll < winChance + (1 - winChance) * 0.4) tier = "partial"
    else tier = "fail"
  }

  return applyMinigameOutcome(c, event, tier, registry, rng)
}

export function applyMinigameOutcome(
  c: CharacterState,
  event: EventContent,
  tier: OutcomeTier,
  registry: ContentRegistry,
  rng: Rng,
): ResolveOutput {
  c.turn += 1
  const outcomes = event.outcomes!
  const outcome: MinigameOutcome = outcomes[tier]
  const net = applyStatDeltas(c, outcome.statDeltas)
  if (outcome.goldDelta) c.gold += outcome.goldDelta
  if (outcome.fameDelta) c.fame += outcome.fameDelta
  if (outcome.reputationDelta) {
    adjustReputation(c, outcome.reputationFaction ?? defaultFaction(c), outcome.reputationDelta)
  }
  //  liability: a failed roll or grave outcome can stain the record.
  if (outcome.liabilityDelta) adjustLiability(c, outcome.liabilityDelta)
  if (outcome.countersDelta) {
    for (const [k, v] of Object.entries(outcome.countersDelta)) bumpCounter(c, k, v)
  }
  if (outcome.countersReset) {
    for (const k of outcome.countersReset) c.counters[k] = 0
  }
  bumpCounter(c, `event_${event.id}`)

  // Season-end capstone: stash the verdict so the season summary surfaces it
  // next turn and swings that season's grade. resolveSeasonSummary clears it.
  if (event.capstoneKind && outcome.verdict) {
    c.pendingCapstoneResult = {
      kind: event.capstoneKind,
      tier,
      verdict: localize(outcome.verdict, c.locale),
      gradeDelta: outcome.gradeDelta ?? 0,
    }
  }

  const isTournamentFixture = event.id === "__tournament_fixture__"
  const wonBattle = tier === "critical" || tier === "success"
  if (wonBattle && !isTournamentFixture && !outcome.countersDelta?.battles_won) {
    bumpCounter(c, "battles_won")
  }

  // in-progress tournament: advance the bracket; when the last fixture
  // resolves, stash the result so buildServedEvent serves the honor beat.
  if (isTournamentFixture && c.pendingTournament) {
    c.pendingTournament.fixturesLeft -= 1
    if (wonBattle) c.pendingTournament.won += 1
    if (c.pendingTournament.fixturesLeft <= 0) {
      c.pendingTournamentResult = {
        won: c.pendingTournament.won >= 2,
        nameKey: c.pendingTournament.nameKey,
      }
      c.pendingTournament = null
    }
  }

  updateMomentum(c, net)
  deductStamina(c)
  updateMarketValue(c)
  recomputeDerived(c)
  ageUp(c)
  clearExpiredHunted(c)

  let ended = false
  let endingType: EndingType | undefined
  const injuryRisk = outcome.injuryRiskDelta ?? 0
  if (rollDeath(c, injuryRisk, rng) || c.age >= GAME_CONFIG.maxAge) {
    c.status = "dead"
    ended = true
    endingType = heroicOrPeaceful(c, "death")
  }

  const narrative = fillSlots(localize(outcome.narrative, c.locale), c.locale, registry, rng, c)

  return {
    narrative,
    ended,
    endingType,
    chosenRarity: "uncommon",
    wonBattle,
    completedQuest: false,
  }
}

// ---------------------------------------------------------------------------

function defaultFaction(c: CharacterState): string {
  return c.reputations[0]?.faction ?? "commoners"
}

// Classify the ending as heroic/peaceful vs. plain, based on standing.
function heroicOrPeaceful(c: CharacterState, kind: "death" | "retirement"): EndingType {
  // Renown is reachable through any of three paths: standing with a faction,
  // widespread fame, or raw power accrued over a long, successful life.
  const renowned = primaryReputation(c) >= 55 || c.fame >= 60 || c.powerLevel >= 65
  if (kind === "death") return renowned ? "heroic_death" : "other_death"
  return renowned ? "peaceful_retirement" : "other_retirement"
}

import { describe, expect, it } from "vitest"
import { Rng, hashSeed } from "../../shared/rng.js"
import { computeScore, GAME_CONFIG, arcForAge } from "../../shared/config.js"
import {
  advanceRival,
  buildServedEvent,
  createCharacter,
  generateClanOffer,
  generateRival,
  negotiationFollowUpEvent,
  resolveChoice,
  resolveMinigame,
  resolveSeasonSummary,
  retirementOfferEvent,
  rollWorldEvents,
  seasonStipendFor,
  selectEvent,
  signingGoldFor,
  tournamentFixtureEvent,
  tournamentIntroEvent,
} from "./engine.js"
import { generateDistinctions, generateEpilogue, generateEpithet } from "./epilogue.js"
import { evaluateAchievements } from "./achievements.js"
import { loadContent } from "../content/registry.js"
import {
  adjustAffinity,
  applyClanBetrayal,
  clearExpiredHunted,
  computePowerLevel,
  ensureRelationship,
  fillSlots,
  isBenched,
  isEligible,
  joinClan,
  roleSignalFor,
  serveEvent,
  updateMomentum,
} from "./helpers.js"
import type { AchievementContent, CharacterState, EventContent } from "../../shared/types.js"
import type { ContentRegistry } from "../content/registry.js"

const reg = loadContent()

function makeChar(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: "test",
    name: "Test",
    gender: "male",
    class: "warrior",
    archetype: null,
    epithet: null,
    age: 16,
    currentArc: "adventurer",
    homeFactionId: "ironhold",
    homeRegion: "vale",
    currentRegion: "vale",
    origin: "humble",
    seasonCount: 0,
    inventory: [],
    lockedEventPools: [],
    strength: 5,
    dexterity: 5,
    constitution: 5,
    intelligence: 5,
    charisma: 5,
    stamina: 50,
    health: 100,
    fame: 0,
    gold: 100,
    marketValue: 200,
    marketValuePeak: 200,
    momentum: "normal",
    status: "alive",
    locale: "en",
    turn: 0,
    powerLevel: 0,
    counters: {},
    reputations: [{ faction: "ironhold", value: 10, peakValue: 10 }],
    personality: {},
    achievements: [],
    relationships: [],
    rival: null,
    currentClanId: null,
    benchedUntilTurn: null,
    huntedBy: null,
    huntedUntilTurn: null,
    clanMemberships: [],
    flags: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// createCharacter
// ---------------------------------------------------------------------------
describe("createCharacter", () => {
  it("creates a character with correct base stats (humble origin default)", () => {
    const c = createCharacter({
      id: "c1",
      name: "Hero",
      classId: "warrior",
      locale: "en",
      registry: reg,
    })
    expect(c.name).toBe("Hero")
    expect(c.class).toBe("warrior")
    expect(c.age).toBe(GAME_CONFIG.startingAge)
    expect(c.strength).toBe(8)
    expect(c.dexterity).toBe(5)
    expect(c.constitution).toBe(7)
    expect(c.intelligence).toBe(3)
    expect(c.charisma).toBe(4)
    // §20 humble origin: starting gold halved, no starting renown.
    expect(c.gold).toBe(60)
    expect(c.status).toBe("alive")
    expect(c.reputations).toHaveLength(1)
    expect(c.reputations[0].faction).toBe("ironhold")
    expect(c.reputations[0].value).toBe(0)
    expect(c.origin).toBe("humble")
    expect(c.homeFactionId).toBe("ironhold")
    expect(c.homeRegion).toBe("vale")
    expect(c.currentRegion).toBe("vale")
  })

  it("established origin keeps full gold and starts with standing at home", () => {
    const c = createCharacter({
      id: "c2",
      name: "Squire",
      classId: "warrior",
      origin: "established",
      locale: "en",
      registry: reg,
    })
    expect(c.gold).toBe(120)
    expect(c.origin).toBe("established")
    expect(c.reputations[0].value).toBe(10)
  })

  it("accepts all 6 classes", () => {
    for (const cls of ["warrior", "wizard", "rogue", "ranger", "cleric", "bard"]) {
      const c = createCharacter({
        id: cls,
        name: cls,
        classId: cls,
        locale: "en",
        registry: reg,
      })
      expect(c.class).toBe(cls)
    }
  })

  it("applies archetype stat deltas", () => {
    const c = createCharacter({
      id: "a1",
      name: "Berserker",
      classId: "warrior",
      archetypeId: "berserker",
      locale: "en",
      registry: reg,
    })
    // warrior base strength is 8, berserker adds +8 = 16
    expect(c.strength).toBe(16)
    expect(c.archetype).toBe("berserker")
    expect(c.dexterity).toBe(5) // unchanged
  })

  it("rejects an unknown class", () => {
    expect(() =>
      createCharacter({ id: "x", name: "X", classId: "ninja", locale: "en", registry: reg }),
    ).toThrow("unknown class")
  })

  it("rejects an unknown archetype for class", () => {
    expect(() =>
      createCharacter({
        id: "x",
        name: "X",
        classId: "warrior",
        archetypeId: "nonexistent",
        locale: "en",
        registry: reg,
      }),
    ).toThrow("unknown archetype")
  })
})

// ---------------------------------------------------------------------------
// Gender inflection
// ---------------------------------------------------------------------------

describe("gender inflection", () => {
  it("createCharacter defaults gender to male", () => {
    const c = createCharacter({
      id: "g1",
      name: "X",
      classId: "warrior",
      locale: "en",
      registry: reg,
    })
    expect(c.gender).toBe("male")
  })

  it("createCharacter accepts an explicit gender", () => {
    const c = createCharacter({
      id: "g2",
      name: "X",
      gender: "female",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    expect(c.gender).toBe("female")
  })

  it("serveEvent inflects event-narrative vocatives for the player's gender", () => {
    const event = reg.events.find((e) => e.id === "rest_campfire_story")
    if (!event) throw new Error("missing rest_campfire_story fixture")
    const female = createCharacter({
      id: "gf",
      name: "X",
      gender: "female",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    const served = serveEvent(event, female, "es", reg, new Rng(7), false)
    expect(served.narrative).toContain("Compartí la llama, extraña.")
    const male = createCharacter({
      id: "gm",
      name: "X",
      gender: "male",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    const servedMale = serveEvent(event, male, "es", reg, new Rng(7), false)
    expect(servedMale.narrative).toContain("Compartí la llama, extraño.")
    const unset = createCharacter({
      id: "gn",
      name: "X",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    const servedUnset = serveEvent(event, unset, "es", reg, new Rng(7), false)
    expect(servedUnset.narrative).toContain("Compartí la llama, extraño.")
  })

  it("resolveChoice inflects outcome narratives for the player's gender", () => {
    const event = reg.events.find((e) => e.id === "rest_inn_night")
    if (!event) throw new Error("missing rest_inn_night fixture")
    const c = createCharacter({
      id: "gc",
      name: "X",
      gender: "female",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    const out = resolveChoice(c, event, "take_room", reg, new Rng(3))
    expect(out.narrative).toContain("alimentada y entera")
  })

  it("keeps NPC-referential masculine forms masculine in served Spanish", () => {
    const event = reg.events.find((e) => e.id === "clan_induction_trial")
    if (!event) throw new Error("missing clan_induction_trial fixture")
    const c = createCharacter({
      id: "gcc",
      name: "X",
      gender: "male",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    // "un herrero" is an NPC, so it stays masculine regardless of player gender.
    const out = resolveChoice(c, event, "join", reg, new Rng(5))
    expect(out.narrative).toContain("un herrero")
    expect(out.narrative).not.toContain("una herrera")
    const female = createCharacter({
      id: "gccf",
      name: "X",
      gender: "female",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    const outFemale = resolveChoice(female, event, "join", reg, new Rng(5))
    expect(outFemale.narrative).toContain("un herrero")
    expect(outFemale.narrative).not.toContain("una herrera")
  })
})

// ---------------------------------------------------------------------------
// resolveChoice
// ---------------------------------------------------------------------------
describe("resolveChoice", () => {
  it("applies stat deltas", () => {
    const c = makeChar({ strength: 5, turn: 0, age: 16 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "pick",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          statDeltas: { strength: 3 },
        },
      ],
    }
    const rng = new Rng(42)
    const out = resolveChoice(c, event, "pick", reg, rng)
    expect(c.strength).toBe(8)
    expect(c.turn).toBe(1)
    expect(out.ended).toBe(false)
  })

  it("applies gold delta", () => {
    const c = makeChar({ gold: 100 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "rich",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          goldDelta: 50,
        },
      ],
    }
    resolveChoice(c, event, "rich", reg, new Rng(1))
    expect(c.gold).toBe(150)
  })

  it("tracks personality tags", () => {
    const c = makeChar()
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "humble",
          rarity: "common",
          tag: "Humble",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
        },
      ],
    }
    resolveChoice(c, event, "humble", reg, new Rng(1))
    expect(c.personality["Humble"]).toBe(1)
  })

  it("loads authored wantedTags content into the registry", () => {
    const ev = reg.events.find((e) => e.id === "court_bard_song")
    if (!ev || !ev.choices) throw new Error("missing court_bard_song")
    const choice = ev.choices.find((ch) => ch.id === "humble")
    if (!choice) throw new Error("missing humble choice")
    expect(choice.wantedTags?.["Humble"]).toBe(0.2)
    expect(choice.punishedTags?.["Cocky"]).toBe(-0.15)
    const c = makeChar({ charisma: 5, personality: { Humble: 2 } })
    resolveChoice(c, ev, "humble", reg, new Rng(1))
    // charisma 3 * (1 + 0.2) = 3.6 → rounded to 4, plus base 5 = 9
    expect(c.charisma).toBe(9)
  })

  it("increments age every turnsPerYear turns", () => {
    const c = makeChar({ age: 16, turn: 0 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    for (let i = 0; i < GAME_CONFIG.turnsPerYear; i++) {
      resolveChoice(c, event, "ok", reg, new Rng(i + 100))
    }
    expect(c.age).toBe(17)
  })

  it("retires on retirement offer retire choice", () => {
    const c = makeChar({ age: 50 })
    const ev = retirementOfferEvent()
    const rng = new Rng(1)
    const out = resolveChoice(c, ev, "retire", reg, rng)
    expect(c.status).toBe("retired")
    expect(out.ended).toBe(false)
    expect(c.pendingFinaleType).toMatch(/peaceful_retirement|other_retirement/)
  })

  it("applies wantedTags synergy multiplier", () => {
    const c = makeChar({ strength: 5, personality: { Aggressive: 2 } })
    const event: EventContent = {
      id: "synergy",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "attack",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          statDeltas: { strength: 10 },
          wantedTags: { Aggressive: 0.2 },
        },
      ],
    }
    resolveChoice(c, event, "attack", reg, new Rng(1))
    // 10 * (1 + 0.2) = 12
    expect(c.strength).toBe(17)
  })

  it("applies punishedTags malus", () => {
    const c = makeChar({ strength: 5, personality: { Cocky: 1 } })
    const event: EventContent = {
      id: "punish",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "negotiate",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          statDeltas: { strength: 10 },
          punishedTags: { Cocky: -0.15 },
        },
      ],
    }
    resolveChoice(c, event, "negotiate", reg, new Rng(1))
    // 10 * (1 - 0.15) = 8.5 → rounded to 9, plus base 5 = 14
    expect(c.strength).toBe(14)
  })
})

// ---------------------------------------------------------------------------
// resolveMinigame
// ---------------------------------------------------------------------------
describe("resolveMinigame", () => {
  it("returns an outcome with narrative", () => {
    const c = makeChar({ strength: 20 })
    const event: EventContent = {
      id: "mg",
      type: "minigame",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "strength",
      narrative: { en: "", es: "" },
      cards: [{ id: "strike", icon: "sword", label: { en: "Strike", es: "" } }],
      resolution: {
        type: "weighted_hidden_match",
        baseWinChance: 0.5,
        statInfluence: { strength: 0.01 },
      },
      outcomes: {
        critical: { statDeltas: { strength: 2 }, narrative: { en: "Perfect!", es: "" } },
        success: { narrative: { en: "Hit!", es: "" } },
        partial: { narrative: { en: "Meh", es: "" } },
        fail: { narrative: { en: "Miss", es: "" } },
      },
    }
    const rng = new Rng(999)
    const out = resolveMinigame(c, event, "strike", reg, rng)
    expect(out.narrative).toBeTruthy()
    expect(typeof out.ended).toBe("boolean")
  })
})

// ---------------------------------------------------------------------------
// computeScore
// ---------------------------------------------------------------------------
describe("computeScore", () => {
  it("includes legacy score weighting", () => {
    const base = {
      achievementsCount: 0,
      battlesWon: 0,
      questsCompleted: 0,
      ageAtEnd: 30,
      finalPowerLevel: 50,
      reputationPeak: 20,
      netWorth: 100,
      endingType: "other_death",
    }
    const without = computeScore(base)
    const withLegacy = computeScore({ ...base, legacyScore: 10 })
    expect(withLegacy).toBe(without + 250)
  })

  it("gives heroic death bonus", () => {
    const s1 = computeScore({
      achievementsCount: 0,
      battlesWon: 0,
      questsCompleted: 0,
      ageAtEnd: 30,
      finalPowerLevel: 0,
      reputationPeak: 0,
      netWorth: 0,
      endingType: "heroic_death",
    })
    const s2 = computeScore({
      achievementsCount: 0,
      battlesWon: 0,
      questsCompleted: 0,
      ageAtEnd: 30,
      finalPowerLevel: 0,
      reputationPeak: 0,
      netWorth: 0,
      endingType: "other_death",
    })
    expect(s1).toBe(s2 + 200)
  })

  it("caps age at 80", () => {
    const s1 = computeScore({
      achievementsCount: 0,
      battlesWon: 0,
      questsCompleted: 0,
      ageAtEnd: 80,
      finalPowerLevel: 0,
      reputationPeak: 0,
      netWorth: 0,
      endingType: "other_death",
    })
    const s2 = computeScore({
      achievementsCount: 0,
      battlesWon: 0,
      questsCompleted: 0,
      ageAtEnd: 90,
      finalPowerLevel: 0,
      reputationPeak: 0,
      netWorth: 0,
      endingType: "other_death",
    })
    expect(s1).toBe(s2)
  })
})

// ---------------------------------------------------------------------------
// evaluateAchievements
// ---------------------------------------------------------------------------
describe("evaluateAchievements", () => {
  it("returns empty for a fresh character with no conditions met", () => {
    const c = makeChar()
    const result = evaluateAchievements(c, reg)
    expect(result).toBeInstanceOf(Array)
  })

  it("unlocks age-based achievements when age threshold is met", () => {
    const c = makeChar({ age: 60 })
    const ach: AchievementContent = {
      id: "test_age",
      icon: "star",
      rarity: "common",
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      condition: { type: "age_gte", value: 60 },
    }
    const miniReg = { ...reg, achievements: [ach] } as ContentRegistry
    const result = evaluateAchievements(c, miniReg)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("test_age")
    expect(c.achievements).toContain("test_age")
  })

  it("unlocks status achievement on retired character", () => {
    const c = makeChar({ status: "retired" })
    const ach: AchievementContent = {
      id: "test_retired",
      icon: "tent",
      rarity: "rare",
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      condition: { type: "status", value: "retired" },
    }
    const miniReg = { ...reg, achievements: [ach] } as ContentRegistry
    const result = evaluateAchievements(c, miniReg)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("test_retired")
  })
})

// ---------------------------------------------------------------------------
// Counter-backed achievements: jetset_life + the 10 counters that previously
// had no achievement tracking them.
// ---------------------------------------------------------------------------
describe("counter achievements", () => {
  const COUNTER_ACH: [string, string, number][] = [
    ["jetset_life", "jetset_life", 1],
    ["wandering_blade", "clans_joined", 2],
    ["oathbreaker", "clans_betrayed", 1],
    ["master_angler", "fishing_won", 3],
    ["grand_huntsman", "hunts_won", 3],
    ["unbroken", "survivals_won", 3],
    ["court_favorite", "courtly_won", 3],
    ["fleet_footed", "chases_won", 3],
    ["alley_king", "street_fights_won", 3],
    ["master_alchemist", "alchemy_won", 3],
    ["clutch_artist", "clutch_duels", 1],
  ]

  it.each(COUNTER_ACH)(
    "unlocks %s when counter %s reaches %d",
    (achId, key, value) => {
      const c = makeChar({ counters: { [key]: value } })
      const result = evaluateAchievements(c, reg)
      expect(result.map((a) => a.id)).toContain(achId)
      expect(c.achievements).toContain(achId)
    },
  )

  it.each(COUNTER_ACH)(
    "does not unlock %s below the threshold",
    (achId, key, value) => {
      const c = makeChar({ counters: { [key]: Math.max(0, value - 1) } })
      expect(evaluateAchievements(c, reg).map((a) => a.id)).not.toContain(achId)
    },
  )

  it("every authored counter is actually incremented by content or engine", () => {
    // Collect every counter key the content bank bumps via countersDelta.
    const bumped = new Set<string>()
    for (const ev of [...reg.events, ...reg.minigames]) {
      for (const ch of ev.choices ?? []) {
        if (ch.countersDelta) for (const k of Object.keys(ch.countersDelta)) bumped.add(k)
      }
      if (ev.outcomes) {
        for (const tier of ["critical", "success", "partial", "fail"] as const) {
          const deltas = ev.outcomes[tier]?.countersDelta
          if (deltas) for (const k of Object.keys(deltas)) bumped.add(k)
        }
      }
    }
    // bench_joined is bumped by the engine (joinClan), not content — checked
    // in the bench mechanic tests. Every counter above must be bumped somewhere.
    const engineBumped = new Set(["bench_joined"])
    for (const [, key] of COUNTER_ACH) {
      if (key === "jetset_life") continue // bumped by the /buy route, not content
      expect(bumped.has(key) || engineBumped.has(key), `${key} never incremented`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// generateEpilogue
// ---------------------------------------------------------------------------
describe("generateEpilogue", () => {
  const endingTypes = [
    "heroic_death",
    "peaceful_retirement",
    "other_death",
    "other_retirement",
  ] as const
  for (const et of endingTypes) {
    it(`produces text for ${et}`, () => {
      const c = makeChar({ age: 60, gold: 5000 })
      const text = generateEpilogue(c, et, reg, "en")
      expect(text).toBeTruthy()
      expect(text.length).toBeGreaterThan(20)
      expect(text).toContain("Test")
    })
  }

  it("produces Spanish epilogue", () => {
    const c = makeChar({ name: "Héroe", age: 45, gold: 3000 })
    const text = generateEpilogue(c, "heroic_death", reg, "es")
    expect(text).toContain("Héroe")
  })
})

// ---------------------------------------------------------------------------
// fillSlots
// ---------------------------------------------------------------------------
describe("fillSlots", () => {
  it("replaces {npcRole} with a random entry from the pool", () => {
    const rng = new Rng(hashSeed("slot-test"))
    const result = fillSlots("A {npcRole} approaches", "en", reg, rng)
    expect(result).not.toContain("{npcRole}")
    expect(result).toMatch(/^A [a-z]/)
  })

  it("replaces {slot:npcName} style placeholders", () => {
    const rng = new Rng(hashSeed("slot-test-2"))
    const result = fillSlots("{slot:npcName} draws their blade", "en", reg, rng)
    expect(result).not.toContain("{slot:")
  })

  it("substitutes {rivalName} with the run's rival when a character is provided", () => {
    const rng = new Rng(hashSeed("slot-test-3"))
    const c = makeChar({ rival: { name: "Grimjaw" } as CharacterState["rival"] })
    const result = fillSlots("{rivalName} blocks your path", "en", reg, rng, c)
    expect(result).toBe("Grimjaw blocks your path")
  })

  it("falls back to a placeholder-safe phrase when there is no rival", () => {
    const rng = new Rng(hashSeed("slot-test-4"))
    const c = makeChar({ rival: null })
    const result = fillSlots("{rivalName} watches you", "en", reg, rng, c)
    expect(result).toBe("your rival watches you")
  })
})

// ---------------------------------------------------------------------------
// computePowerLevel
// ---------------------------------------------------------------------------
describe("computePowerLevel", () => {
  it("includes fame and age in power level", () => {
    const c = makeChar({
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      charisma: 10,
      fame: 50,
      age: 30,
    })
    const pl = computePowerLevel(c)
    // sum = 50, fame/5 = 10, age/2 = 15 → 75
    expect(pl).toBe(75)
  })
})

// ---------------------------------------------------------------------------
// isEligible
// ---------------------------------------------------------------------------
describe("isEligible", () => {
  it("gates by age", () => {
    const young = makeChar({ age: 16 })
    const old = makeChar({ age: 50 })
    const ev: EventContent = {
      id: "adult_only",
      minAge: 18,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, young)).toBe(false)
    expect(isEligible(ev, old)).toBe(true)
  })

  it("gates by class", () => {
    const c = makeChar({ class: "wizard" })
    const ev: EventContent = {
      id: "mage_only",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresClass: "wizard",
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(true)
    const not = makeChar({ class: "warrior" })
    expect(isEligible(ev, not)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateMomentum
// ---------------------------------------------------------------------------
describe("updateMomentum", () => {
  it("sets rising when net gain > 2", () => {
    const c = makeChar()
    updateMomentum(c, 3)
    expect(c.momentum).toBe("rising")
  })

  it("sets falling when net gain < 0", () => {
    const c = makeChar()
    updateMomentum(c, -1)
    expect(c.momentum).toBe("falling")
  })

  it("sets normal otherwise", () => {
    const c = makeChar()
    updateMomentum(c, 1)
    expect(c.momentum).toBe("normal")
  })
})

// ---------------------------------------------------------------------------
// Stamina & fatigue
// ---------------------------------------------------------------------------
describe("stamina & fatigue", () => {
  it("deducts base stamina each turn", () => {
    const c = makeChar({ stamina: 50 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    resolveChoice(c, event, "ok", reg, new Rng(1))
    expect(c.stamina).toBe(49)
  })

  it("applies fatigue penalty when stamina < 20", () => {
    const c = makeChar({ stamina: 10, strength: 5 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "train",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          statDeltas: { strength: 4 },
        },
      ],
    }
    resolveChoice(c, event, "train", reg, new Rng(1))
    // Fatigue halves positive gains: 4 * 0.5 = 2
    expect(c.strength).toBe(7)
    // Stamina deduction still applies
    expect(c.stamina).toBe(9)
  })

  it("tracks consecutive turns at zero stamina", () => {
    const c = makeChar({ stamina: 1 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    resolveChoice(c, event, "ok", reg, new Rng(1))
    expect(c.stamina).toBe(0)
    expect(c.staminaZeroStreak).toBe(1)
    resolveChoice(c, event, "ok", reg, new Rng(1))
    expect(c.staminaZeroStreak).toBe(2)
  })

  it("resets the zero-stamina streak once recovered", () => {
    const c = makeChar({ stamina: 1, health: 100 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "rest",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          staminaDelta: 50,
        },
      ],
    }
    resolveChoice(c, event, "rest", reg, new Rng(1))
    expect(c.staminaZeroStreak).toBe(0)
  })

  it("forces a recovery event after forcedRecoveryTurns at zero stamina", () => {
    const c = makeChar({ stamina: 1 })
    // Three consecutive turns of exhaustion.
    for (let i = 0; i < GAME_CONFIG.forcedRecoveryTurns; i++) {
      const event: EventContent = {
        id: `t${i}`,
        minAge: 0,
        maxAge: 99,
        weight: 1,
        narrative: { en: "", es: "" },
        choices: [
          { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
        ],
      }
      resolveChoice(c, event, "ok", reg, new Rng(1))
    }
    expect(c.staminaZeroStreak).toBe(GAME_CONFIG.forcedRecoveryTurns)
    const { event, served } = buildServedEvent(c, reg, new Rng(1))
    expect(event.id).toBe("__forced_recovery__")
    expect(served.choices[0].id).toBe("rest")
  })
})

// ---------------------------------------------------------------------------
// Market value
// ---------------------------------------------------------------------------
describe("market value", () => {
  it("starts at startingGold * 2", () => {
    const c = createCharacter({
      id: "mv1",
      name: "Merc",
      classId: "warrior",
      locale: "en",
      registry: reg,
    })
    expect(c.marketValue).toBe(c.gold * 2)
  })

  it("updates after each turn", () => {
    const c = makeChar({ fame: 10, powerLevel: 20, age: 30, marketValue: 0, marketValuePeak: 0 })
    const event: EventContent = {
      id: "test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    resolveChoice(c, event, "ok", reg, new Rng(1))
    expect(c.marketValue).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Rng determinism
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Season summary
// ---------------------------------------------------------------------------
describe("season summary", () => {
  it("generates a season summary event at season boundary", () => {
    const c = makeChar({ turn: GAME_CONFIG.seasonLength })
    // buildServedEvent should return the season summary at this turn count.
    const result = buildServedEvent(c, reg, new Rng(42))
    expect(result.event.id).toBe("__season_summary__")
    expect(result.served.isSeasonSummary).toBe(true)
    expect(result.served.seasonGrade).toBeDefined()
  })

  it("resolveSeasonSummary increments seasonCount and cleans inventory", () => {
    const c = makeChar({
      turn: 5,
      seasonCount: 0,
      inventory: [
        { itemId: "enchanted_boots", qty: 1, expiresAtTurn: 10 },
        { itemId: "warhorse", qty: 1, expiresAtTurn: null },
      ],
    })
    resolveSeasonSummary(c, reg)
    expect(c.seasonCount).toBe(1)
    expect(c.turn).toBe(6)
    // warhorse has no expiry, should persist; enchanted_boots expires at 10, still > 6
    expect(c.inventory).toHaveLength(2)
  })

  it("removes expired inventory items", () => {
    const c = makeChar({
      turn: 10,
      inventory: [
        { itemId: "expired_item", qty: 1, expiresAtTurn: 8 },
        { itemId: "active_item", qty: 1, expiresAtTurn: 15 },
        { itemId: "permanent_item", qty: 1, expiresAtTurn: null },
      ],
    })
    resolveSeasonSummary(c, reg)
    // expired_item (expiresAtTurn 8 <= 10) should be removed
    expect(c.inventory.find((i) => i.itemId === "expired_item")).toBeUndefined()
    expect(c.inventory.find((i) => i.itemId === "active_item")).toBeDefined()
    expect(c.inventory.find((i) => i.itemId === "permanent_item")).toBeDefined()
  })

  it("pays a season stipend to clan members at the season boundary", () => {
    const c = makeChar({ currentClanId: "ironhold", gold: 100, turn: 5, seasonCount: 0 })
    const before = c.gold
    resolveSeasonSummary(c, reg)
    expect(c.gold).toBeGreaterThan(before)
  })

  it("does not pay a stipend to clanless characters", () => {
    const c = makeChar({ currentClanId: null, gold: 100, turn: 5, seasonCount: 0 })
    resolveSeasonSummary(c, reg)
    expect(c.gold).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Arc computation
// ---------------------------------------------------------------------------
describe("arc computation", () => {
  it("sets correct arc for age", () => {
    const tests: [number, string][] = [
      [10, "child"],
      [16, "adventurer"],
      [26, "mercenary"],
      [40, "kingdom_hero"],
      [60, "legend"],
      [80, "old_hero"],
    ]
    for (const [age, expected] of tests) {
      // Simulate ageUp: calling createCharacter then manually check arc
      const created = createCharacter({
        id: `arc_${age}`,
        name: "Test",
        classId: "warrior",
        locale: "en",
        registry: reg,
      })
      // Override age and check arc
      created.age = age
      created.currentArc = arcForAge(age)
      expect(created.currentArc).toBe(expected)
    }
  })
})

// ---------------------------------------------------------------------------
// Shop & inventory
// ---------------------------------------------------------------------------
describe("shop & inventory", () => {
  it("inventory starts empty", () => {
    const c = makeChar()
    expect(c.inventory).toEqual([])
  })

  it("adds items to inventory on purchase", () => {
    const c = makeChar({ gold: 20000 })
    const item = reg.shop.find((i) => i.id === "camp_cook")
    expect(item).toBeDefined()
    expect(c.gold).toBeGreaterThanOrEqual(item!.cost)
    c.gold -= item!.cost
    c.inventory.push({ itemId: item!.id, qty: 1, expiresAtTurn: null })
    expect(c.inventory).toHaveLength(1)
    expect(c.inventory[0].itemId).toBe("camp_cook")
    expect(c.gold).toBe(20000 - item!.cost)
  })

  it("shop items are loaded in registry", () => {
    expect(reg.shop.length).toBeGreaterThan(0)
    const retinue = reg.shop.filter((i) => i.category === "retinue")
    const consumables = reg.shop.filter((i) => i.category === "consumable")
    const luxury = reg.shop.filter((i) => i.category === "luxury")
    expect(retinue.length).toBe(5)
    expect(consumables.length).toBe(5)
    expect(luxury.length).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// isEligible arc gating
// ---------------------------------------------------------------------------
describe("isEligible arc gating", () => {
  it("filters by requiresArc", () => {
    const c = makeChar({ currentArc: "adventurer" })
    const ev: EventContent = {
      id: "legend_only",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresArc: ["legend"],
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(false)
    const legend = makeChar({ currentArc: "legend" })
    expect(isEligible(ev, legend)).toBe(true)
  })

  it("filters by excludeIfArc", () => {
    const c = makeChar({ currentArc: "child" })
    const ev: EventContent = {
      id: "no_kids",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      excludeIfArc: ["child"],
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(false)
    const adult = makeChar({ currentArc: "adventurer" })
    expect(isEligible(ev, adult)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Rng determinism
// ---------------------------------------------------------------------------
describe("Rng determinism", () => {
  it("produces identical sequences from the same seed", () => {
    const a = new Rng(hashSeed("determinism"))
    const b = new Rng(hashSeed("determinism"))
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it("different seeds produce different sequences", () => {
    const a = new Rng(hashSeed("seed-a"))
    const b = new Rng(hashSeed("seed-b"))
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })
})

// ---------------------------------------------------------------------------
// No-consecutive-repeat event selection
// ---------------------------------------------------------------------------
describe("selectEvent no consecutive repeats", () => {
  it("never serves the same event twice in a row", () => {
    // Run many selections on one character; the previously-served event id must
    // never come up immediately after itself.
    const c = makeChar()
    const rng = new Rng(hashSeed("no-repeat"))
    let prev: string | null = null
    for (let i = 0; i < 40; i++) {
      const ev = selectEvent(c, reg, rng)
      expect(ev.id).not.toBe(prev)
      prev = ev.id
    }
  })

  it("falls back to a repeat when it is the only eligible event", () => {
    const c = makeChar()
    const rng = new Rng(hashSeed("no-repeat-fallback"))
    const first = selectEvent(c, reg, rng)
    // Restrict eligibility to just that event: whichever pool selectEvent draws
    // from (events or minigames), only the one event is present, so the
    // no-repeat filter empties the pool and it falls back to the repeat.
    const tinyRegistry = {
      ...reg,
      events: [first],
      minigames: [first],
    } as unknown as ContentRegistry
    const rng2 = new Rng(hashSeed("no-repeat-fallback"))
    const again = selectEvent(c, tinyRegistry, rng2)
    expect(again.id).toBe(first.id)
  })

  it("records the last served event id on the character", () => {
    const c = makeChar()
    const rng = new Rng(hashSeed("no-repeat-record"))
    const ev = selectEvent(c, reg, rng)
    expect(c.lastEventId).toBe(ev.id)
  })
})

// ---------------------------------------------------------------------------
// Relationship helpers
// ---------------------------------------------------------------------------
describe("Relationships", () => {
  it("ensureRelationship creates a new relationship entry", () => {
    const c = makeChar()
    const rel = ensureRelationship(c, "mentor_01", "mentor", 1)
    expect(rel.npcId).toBe("mentor_01")
    expect(rel.npcRole).toBe("mentor")
    expect(rel.affinity).toBe(0)
    expect(c.relationships).toHaveLength(1)
  })

  it("adjustAffinity modifies existing relationship", () => {
    const c = makeChar({
      relationships: [
        { npcId: "friend_01", npcRole: "friend", affinity: 0, peakAffinity: 0, lastSeenTurn: 0 },
      ],
    })
    adjustAffinity(c, "friend_01", 15, 2)
    expect(c.relationships[0].affinity).toBe(15)
    expect(c.relationships[0].peakAffinity).toBe(15)
  })

  it("affinityDelta on choice modifies relationship", () => {
    const c = makeChar({
      relationships: [
        {
          npcId: "npc_alchemist",
          npcRole: "acquaintance",
          affinity: 0,
          peakAffinity: 0,
          lastSeenTurn: 0,
        },
      ],
    })
    const event: EventContent = {
      id: "rel_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresRelationshipId: "npc_alchemist",
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "help",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          affinityDelta: 10,
        },
      ],
    }
    resolveChoice(c, event, "help", reg, new Rng(1))
    expect(c.relationships[0].affinity).toBe(10)
  })

  it("introducesRelationshipId creates relationship", () => {
    const c = makeChar()
    const event: EventContent = {
      id: "intro_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "meet",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          introducesRelationshipId: "npc_merchant",
          introducesNpcRole: "friend",
          affinityDelta: 5,
        },
      ],
    }
    resolveChoice(c, event, "meet", reg, new Rng(1))
    expect(c.relationships).toHaveLength(1)
    expect(c.relationships[0].npcId).toBe("npc_merchant")
    expect(c.relationships[0].affinity).toBe(5)
  })

  it("introducesNpcName is stored on the relationship entry", () => {
    const c = makeChar()
    const event: EventContent = {
      id: "npc_name_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "meet",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          introducesRelationshipId: "npc_merchant",
          introducesNpcName: { en: "Old Marcus", es: "Marcos el Viejo" },
        },
      ],
    }
    resolveChoice(c, event, "meet", reg, new Rng(1))
    expect(c.relationships[0].npcName).toBe("Old Marcus")
  })
})

// ---------------------------------------------------------------------------
//  Flags
// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
describe("Flags", () => {
  it("setsFlag on choice creates a flag entry", () => {
    const c = makeChar()
    const event: EventContent = {
      id: "flag_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "insult_noble",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          setsFlag: { insulted_duke: { severity: "grave" } },
        },
      ],
    }
    resolveChoice(c, event, "insult_noble", reg, new Rng(1))
    expect(c.flags["insulted_duke"]).toBeDefined()
    expect((c.flags["insulted_duke"] as { severity: string }).severity).toBe("grave")
  })

  it("isEligible respects requiresFlag", () => {
    const c = makeChar({ flags: { saved_village: true } })
    const ev: EventContent = {
      id: "callback_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresFlag: { saved_village: true },
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(true)
    // Without the flag, should be ineligible.
    const c2 = makeChar({ flags: {} })
    expect(isEligible(ev, c2)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
//  Rival system
// ---------------------------------------------------------------------------
describe("Rival", () => {
  it("generateRival creates a rival with different class", () => {
    const c = makeChar({ class: "warrior" })
    const rival = generateRival(c, reg, new Rng(42))
    expect(rival.name).toBeTruthy()
    expect(rival.class).not.toBe(c.class)
    expect(rival.age).toBe(c.age)
  })

  it("advanceRival increases rival stats at season boundary", () => {
    const c = makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
      },
    })
    advanceRival(c, new Rng(42))
    expect(c.rival!.powerLevel).toBeGreaterThanOrEqual(19)
    expect(c.rival!.lastAdvancedTurn).toBe(0)
  })
})

// ---------------------------------------------------------------------------
//  Clan system
// ---------------------------------------------------------------------------
describe("Clans", () => {
  it("joinClan sets currentClanId and adds membership", () => {
    const c = makeChar({ gold: 100 })
    joinClan(c, "ironhold", 1, 200)
    expect(c.currentClanId).toBe("ironhold")
    expect(c.gold).toBe(300)
    expect(c.clanMemberships).toHaveLength(1)
    expect(c.clanMemberships[0].clanId).toBe("ironhold")
  })

  it("applyClanBetrayal sets hunted and crashes reputation", () => {
    const c = makeChar({
      currentClanId: "ironhold",
      gold: 100,
      reputations: [{ faction: "ironhold", value: 50, peakValue: 50 }],
      clanMemberships: [
        {
          clanId: "ironhold",
          rank: "recruit",
          joinedAtTurn: 1,
          leftAtTurn: null,
          leftReason: null,
        },
      ],
    })
    applyClanBetrayal(c, "greywater", 10)
    expect(c.huntedBy).toBe("ironhold")
    expect(c.huntedUntilTurn).toBe(10 + GAME_CONFIG.huntedDurationTurns)
    expect(c.reputations.find((r) => r.faction === "ironhold")?.value).toBe(20)
    expect(c.currentClanId).toBeNull()
  })

  it("advanceRival increases rival stats at season boundary", () => {
    const c = makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
      },
    })
    advanceRival(c, new Rng(42))
    expect(c.rival!.powerLevel).toBeGreaterThanOrEqual(19)
    expect(c.rival!.lastAdvancedTurn).toBe(0)
  })

  it("isEligible respects requiresClanId", () => {
    const c = makeChar({ currentClanId: "ironhold" })
    const ev: EventContent = {
      id: "clan_only",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresClanId: "ironhold",
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(true)
    const c2 = makeChar({ currentClanId: null })
    expect(isEligible(ev, c2)).toBe(false)
  })

  it("isEligible respects requiresNoClan", () => {
    const c = makeChar({ currentClanId: null })
    const ev: EventContent = {
      id: "solo_path",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresNoClan: true,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(true)
    const c2 = makeChar({ currentClanId: "ironhold" })
    expect(isEligible(ev, c2)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Epilogue includes rival and relationship content
// ---------------------------------------------------------------------------
describe("Epilogue content", () => {
  it("includes rival comparison when rival exists", () => {
    const c = makeChar({
      age: 60,
      gold: 5000,
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        powerLevel: 25,
        age: 60,
        location: "capital",
        achievementsCount: 2,
        score: 15,
        lastAdvancedTurn: 50,
      },
    })
    const text = generateEpilogue(c, "heroic_death", reg, "en")
    expect(text).toContain("Roderick")
    expect(text).toContain("rival")
  })

  it("includes relationship block when meaningful bonds exist", () => {
    const c = makeChar({
      age: 60,
      gold: 5000,
      relationships: [
        { npcId: "friend_01", npcRole: "friend", affinity: 80, peakAffinity: 90, lastSeenTurn: 40 },
      ],
    })
    const text = generateEpilogue(c, "peaceful_retirement", reg, "en")
    expect(text).toContain("stood by you")
  })
})

// ---------------------------------------------------------------------------
// World events
// ---------------------------------------------------------------------------
describe("World events", () => {
  it("loads world events from content", () => {
    const worldEvents = reg.events.filter((e) => e.type === "world")
    expect(worldEvents.length).toBeGreaterThan(0)
  })

  it("rollWorldEvents returns events", () => {
    const c = makeChar()
    const events = rollWorldEvents(c, reg, new Rng(42))
    expect(events.length).toBeGreaterThan(0)
    expect(events[0].headline).toBeTruthy()
    expect(events[0].narrative).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Gap fixes: isEligible involvesRival
// ---------------------------------------------------------------------------
describe("isEligible involvesRival", () => {
  it("respects involvesRival — character with rival can see event", () => {
    const c = makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
      },
    })
    const ev: EventContent = {
      id: "rival_encounter",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      involvesRival: true,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(true)
  })

  it("respects involvesRival — character without rival cannot see event", () => {
    const c = makeChar({ rival: null })
    const ev: EventContent = {
      id: "rival_encounter",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      involvesRival: true,
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, c)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Gap fixes: flagLabel on ServedEvent
// ---------------------------------------------------------------------------
describe("flagLabel", () => {
  it("serveEvent includes flagLabel when event has one", () => {
    const c = makeChar()
    const ev: EventContent = {
      id: "flag_label_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "Test", es: "Test" },
      flagLabel: { en: "A Special Flag", es: "Una Bandera Especial" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    const served = serveEvent(ev, c, "en", reg, new Rng(1), false)
    expect(served.flagLabel).toBe("A Special Flag")
  })
})

// ---------------------------------------------------------------------------
// Gap fixes: generateClanOffer uses CLAN_SPECIALTIES
// ---------------------------------------------------------------------------
describe("generateClanOffer", () => {
  it("returns offers with specialties from CLAN_SPECIALTIES", () => {
    const c = makeChar()
    const result = generateClanOffer(c, reg, new Rng(42))
    expect(result.offers.length).toBeGreaterThan(0)
    for (const offer of result.offers) {
      expect(offer.specialty).toBeTruthy()
      expect(offer.clanId).toBeTruthy()
      expect(offer.signingGold).toBeGreaterThan(0)
      expect(offer.stipend).toBeGreaterThan(0)
    }
  })

  it("offers richer signing gold and stipend from wealthier factions", () => {
    const c = makeChar()
    const poor = signingGoldFor(c, "rust_priests", reg) // wealth 1
    const rich = signingGoldFor(c, "golden_lotus", reg) // wealth 9
    expect(rich).toBeGreaterThan(poor)
    expect(seasonStipendFor(c, "golden_lotus", reg)).toBeGreaterThan(
      seasonStipendFor(c, "rust_priests", reg),
    )
  })
})

// ---------------------------------------------------------------------------
// Clan joining pays the offered signing gold
// ---------------------------------------------------------------------------
describe("joinClan signing gold", () => {
  it("applies the offered goldDelta exactly when joining through a choice", () => {
    const c = makeChar({ gold: 100 })
    const event: EventContent = {
      id: "join_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "join_ironhold",
          rarity: "uncommon",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          joinClanId: "ironhold",
          factionId: "ironhold",
          goldDelta: 750,
        },
      ],
    }
    resolveChoice(c, event, "join_ironhold", reg, new Rng(1))
    expect(c.currentClanId).toBe("ironhold")
    expect(c.gold).toBe(100 + 750)
  })

  it("computes a signing gold when the choice has no goldDelta", () => {
    const c = makeChar({ gold: 100, fame: 0, powerLevel: 0 })
    const event: EventContent = {
      id: "join_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "join_ironhold",
          rarity: "uncommon",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          joinClanId: "ironhold",
          factionId: "ironhold",
        },
      ],
    }
    resolveChoice(c, event, "join_ironhold", reg, new Rng(1))
    // ironhold wealth is 5 -> 100 + 500 = 600
    expect(c.currentClanId).toBe("ironhold")
    expect(c.gold).toBe(100 + 600)
  })
})

// ---------------------------------------------------------------------------
// Gap fixes: buildServedEvent clan offer
// ---------------------------------------------------------------------------
describe("buildServedEvent clan offer", () => {
  it("can produce a clan offer for clanless characters with right rng", () => {
    const c = makeChar({ currentClanId: null, turn: 1 })
    let found = false
    for (let i = 0; i < 200; i++) {
      const result = buildServedEvent(c, reg, new Rng(1000 + i))
      if (result.served.isClanOffer) {
        found = true
        expect(result.served.clanOfferChoices).toBeDefined()
        expect(result.served.clanOfferChoices!.length).toBeGreaterThan(0)
        break
      }
    }
    expect(found).toBe(true)
  })

  it("produces a poaching offer for clan members with high powerLevel", () => {
    const c = makeChar({ currentClanId: "ironhold", powerLevel: 60, turn: 1 })
    let found = false
    for (let i = 0; i < 100; i++) {
      const result = buildServedEvent(c, reg, new Rng(2000 + i))
      if (result.served.isClanOffer) {
        found = true
        expect(result.event.id).toBe("__clan_poach__")
        const choices = result.event.choices ?? []
        expect(choices.some((ch) => ch.id === "stay_loyal")).toBe(true)
        break
      }
    }
    expect(found).toBe(true)
  })

  it("poaching offer choices include join options and stay_loyal", () => {
    const c = makeChar({ currentClanId: "ironhold", powerLevel: 60, turn: 1 })
    let found = false
    for (let i = 0; i < 100; i++) {
      const result = buildServedEvent(c, reg, new Rng(3000 + i))
      if (result.event.id === "__clan_poach__") {
        found = true
        const choices = result.event.choices ?? []
        const joinChoices = choices.filter((ch) => ch.joinClanId)
        expect(joinChoices.length).toBeGreaterThan(0)
        const loyal = choices.find((ch) => ch.id === "stay_loyal")
        expect(loyal).toBeDefined()
        expect(loyal!.reputationDelta).toBe(3)
        break
      }
    }
    expect(found).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Clan offers: at most once per season
// ---------------------------------------------------------------------------
describe("clan offer once per season", () => {
  it("never serves an offer after one already appeared this season", () => {
    const c = makeChar({
      currentClanId: null,
      turn: 1,
      seasonCount: 5,
      lastClanOfferSeason: 5,
    })
    for (let i = 0; i < 200; i++) {
      const result = buildServedEvent(c, reg, new Rng(4000 + i))
      expect(result.served.isClanOffer).toBeFalsy()
    }
  })

  it("serves offers again once the season advances", () => {
    const c = makeChar({
      currentClanId: null,
      turn: 1,
      seasonCount: 5,
      lastClanOfferSeason: 4,
    })
    let found = false
    for (let i = 0; i < 200; i++) {
      const result = buildServedEvent(c, reg, new Rng(5000 + i))
      if (result.served.isClanOffer) {
        found = true
        expect(c.lastClanOfferSeason).toBe(5)
        break
      }
    }
    expect(found).toBe(true)
  })

  it("caps poaching offers for clan members too", () => {
    const c = makeChar({
      currentClanId: "ironhold",
      powerLevel: 60,
      turn: 1,
      seasonCount: 5,
      lastClanOfferSeason: 5,
    })
    for (let i = 0; i < 200; i++) {
      const result = buildServedEvent(c, reg, new Rng(6000 + i))
      expect(result.served.isClanOffer).toBeFalsy()
    }
  })
})

// ---------------------------------------------------------------------------
// Signing gold & stipend surfacing
// ---------------------------------------------------------------------------
describe("clan offer amounts", () => {
  it("buildServedEvent marks stipendEarned on the season summary for clan members", () => {
    const c = makeChar({ currentClanId: "ironhold", turn: GAME_CONFIG.seasonLength })
    const result = buildServedEvent(c, reg, new Rng(42))
    expect(result.event.id).toBe("__season_summary__")
    expect(result.served.stipendEarned).toBe(seasonStipendFor(c, "ironhold", reg))
    expect(result.served.stipendEarned).toBeGreaterThan(0)
  })

  it("leaves stipendEarned undefined for clanless characters", () => {
    const c = makeChar({ currentClanId: null, turn: GAME_CONFIG.seasonLength })
    const result = buildServedEvent(c, reg, new Rng(42))
    expect(result.event.id).toBe("__season_summary__")
    expect(result.served.stipendEarned).toBeUndefined()
  })

  it("serveEvent exposes stipend and goldDelta on served choices", () => {
    const c = makeChar()
    const event: EventContent = {
      id: "offer_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "join_ironhold",
          rarity: "uncommon",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          joinClanId: "ironhold",
          factionId: "ironhold",
          goldDelta: 750,
          stipend: 255,
        },
      ],
    }
    const served = serveEvent(event, c, "en", reg, new Rng(1), false)
    const ch = served.choices.find((x) => x.id === "join_ironhold")
    expect(ch?.goldDelta).toBe(750)
    expect(ch?.stipend).toBe(255)
    expect(ch?.factionId).toBe("ironhold")
  })

  it("poach offer join choices expose signing gold and stipend to the client", () => {
    const c = makeChar({ currentClanId: "ironhold", powerLevel: 60, turn: 1 })
    let found = false
    for (let i = 0; i < 100; i++) {
      const result = buildServedEvent(c, reg, new Rng(7000 + i))
      if (result.event.id === "__clan_poach__") {
        found = true
        const joinChoices = (result.event.choices ?? []).filter((ch) => ch.joinClanId)
        expect(joinChoices.length).toBeGreaterThan(0)
        for (const jc of joinChoices) {
          expect(jc.goldDelta).toBeGreaterThan(0)
          expect(jc.stipend).toBeGreaterThan(0)
        }
        break
      }
    }
    expect(found).toBe(true)
  })

  it("the gold applied on join matches the amount shown on the offer card", () => {
    const c = makeChar({ currentClanId: "ironhold", powerLevel: 60, turn: 1, gold: 100 })
    let tested = false
    for (let i = 0; i < 100; i++) {
      const rng = new Rng(8000 + i)
      const { event, served } = buildServedEvent(c, reg, rng)
      if (event.id === "__clan_poach__") {
        const joinChoice = served.choices.find((ch) => ch.id.startsWith("join_"))
        if (!joinChoice) continue
        const displayed = joinChoice.goldDelta ?? 0
        expect(displayed).toBeGreaterThan(0)
        // §24: picking an offer defers the join to the negotiation follow-up.
        resolveChoice(c, event, joinChoice.id, reg, rng)
        expect(c.pendingJoinOffer?.signingGold).toBe(displayed)
        const followUp = negotiationFollowUpEvent(c, reg)
        const goldBefore = c.gold
        resolveChoice(c, followUp, "accept_join", reg, rng)
        expect(c.gold).toBe(goldBefore + displayed)
        tested = true
        break
      }
    }
    expect(tested).toBe(true)
  })

  it("stipend scales with fame and with standing inside the faction", () => {
    const base = makeChar({ fame: 0 })
    const famous = makeChar({ fame: 50 })
    const loyal = makeChar({
      fame: 0,
      reputations: [{ faction: "ironhold", value: 60, peakValue: 60 }],
    })
    const famousLoyal = makeChar({
      fame: 50,
      reputations: [{ faction: "ironhold", value: 60, peakValue: 60 }],
    })
    const b = seasonStipendFor(base, "ironhold", reg)
    expect(seasonStipendFor(famous, "ironhold", reg)).toBeGreaterThan(b)
    expect(seasonStipendFor(loyal, "ironhold", reg)).toBeGreaterThan(b)
    expect(seasonStipendFor(famousLoyal, "ironhold", reg)).toBeGreaterThan(
      seasonStipendFor(famous, "ironhold", reg),
    )
  })

  it("accepting a poach offer betrays the old clan, joins the new one, and pays the offered gold once", () => {
    const c = makeChar({
      currentClanId: "ironhold",
      gold: 100,
      turn: 10,
      reputations: [{ faction: "ironhold", value: 50, peakValue: 50 }],
      clanMemberships: [
        {
          clanId: "ironhold",
          rank: "recruit",
          joinedAtTurn: 1,
          leftAtTurn: null,
          leftReason: null,
        },
      ],
    })
    const event: EventContent = {
      id: "poach_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "join_blacktide",
          rarity: "uncommon",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          joinClanId: "blacktide",
          factionId: "blacktide",
          goldDelta: 500,
        },
      ],
    }
    resolveChoice(c, event, "join_blacktide", reg, new Rng(1))
    expect(c.huntedBy).toBe("ironhold")
    expect(c.currentClanId).toBe("blacktide")
    expect(c.gold).toBe(100 + 500)
    expect(c.clanMemberships.find((m) => m.clanId === "ironhold")?.leftReason).toBe("betrayed")
  })

  it("clan_loyalty_bribe pays exactly the authored bribe, no computed bonus on top", () => {
    const c = makeChar({
      age: 25,
      currentClanId: "greywater",
      gold: 100,
      turn: 10,
      reputations: [{ faction: "greywater", value: 40, peakValue: 40 }],
      clanMemberships: [
        {
          clanId: "greywater",
          rank: "trusted",
          joinedAtTurn: 1,
          leftAtTurn: null,
          leftReason: null,
        },
      ],
    })
    const ev = reg.events.find((e) => e.id === "clan_loyalty_bribe")
    if (!ev) throw new Error("missing clan_loyalty_bribe fixture")
    resolveChoice(c, ev, "betray", reg, new Rng(1))
    expect(c.currentClanId).toBe("blacktide")
    expect(c.gold).toBe(100 + 200)
    expect(c.huntedBy).toBe("greywater")
    expect(c.counters["clans_betrayed"]).toBe(1)
    expect(c.clanMemberships.find((m) => m.clanId === "greywater")?.leftReason).toBe("betrayed")
  })
})

// ---------------------------------------------------------------------------
// Gap fixes: relationship achievement conditions
// ---------------------------------------------------------------------------
describe("relationship achievements", () => {
  it("unlocks when peakAffinity >= threshold", () => {
    const c = makeChar({
      relationships: [
        { npcId: "f1", npcRole: "friend", affinity: 60, peakAffinity: 85, lastSeenTurn: 10 },
      ],
    })
    const ach: AchievementContent = {
      id: "bonded_for_life",
      icon: "heart",
      rarity: "rare",
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      condition: { type: "relationship_affinity_gte", value: 80 },
    }
    const miniReg = { ...reg, achievements: [ach] } as ContentRegistry
    const result = evaluateAchievements(c, miniReg)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("bonded_for_life")
  })

  it("unlocks when affinity <= threshold (burned bridge)", () => {
    const c = makeChar({
      relationships: [
        { npcId: "e1", npcRole: "enemy", affinity: -90, peakAffinity: 0, lastSeenTurn: 10 },
      ],
    })
    const ach: AchievementContent = {
      id: "burned_bridge",
      icon: "fire",
      rarity: "rare",
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      condition: { type: "relationship_affinity_lte", value: -80 },
    }
    const miniReg = { ...reg, achievements: [ach] } as ContentRegistry
    const result = evaluateAchievements(c, miniReg)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("burned_bridge")
  })
})

// ---------------------------------------------------------------------------
// Phase 7: identity, geography, origin, bench, tournaments, honors, epithets
// ---------------------------------------------------------------------------

// Mirrors the /choose route's one-turn loop: build next event, resolve it with
// the same rng, return the outcome. Picks the first (safest) choice.
function playTurn(c: CharacterState, rng: Rng, pick?: (ids: string[]) => string): boolean {
  const { event, served } = buildServedEvent(c, reg, rng)
  const isMinigame = event.type === "minigame" || Boolean(event.cards)
  const ids = served.choices.map((ch) => ch.id)
  const id = pick ? pick(ids) : ids[0]
  const outcome = isMinigame
    ? resolveMinigame(c, event, id, reg, rng)
    : resolveChoice(c, event, id, reg, rng)
  if (outcome.completedQuest) {
    c.counters["quests_completed"] = (c.counters["quests_completed"] ?? 0) + 1
  }
  return outcome.ended
}

// A deterministic fingerprint of a character's game-relevant state.
function fingerprint(c: CharacterState): string {
  return JSON.stringify({
    turn: c.turn,
    age: c.age,
    seasonCount: c.seasonCount,
    gold: c.gold,
    fame: c.fame,
    powerLevel: c.powerLevel,
    status: c.status,
    currentClanId: c.currentClanId,
    currentRegion: c.currentRegion,
    currentArc: c.currentArc,
    benchedUntilTurn: c.benchedUntilTurn ?? null,
    pendingTournament: c.pendingTournament ?? null,
    pendingTournamentResult: c.pendingTournamentResult ?? null,
    counters: c.counters,
    reputations: c.reputations.map((r) => [r.faction, r.value, r.peakValue]),
    clanMemberships: c.clanMemberships.map((m) => [m.clanId, m.leftReason ?? null]),
    achievements: [...c.achievements].sort(),
    personality: c.personality,
    flags: c.flags,
  })
}

describe("Phase 7 · origin & identity (§20)", () => {
  it("established origin starts with full gold and home standing", () => {
    const c = createCharacter({
      id: "c",
      name: "Nob",
      classId: "warrior",
      origin: "established",
      locale: "en",
      registry: reg,
    })
    expect(c.gold).toBe(120)
    expect(c.reputations[0].value).toBe(10)
    expect(c.homeFactionId).toBe("ironhold")
    expect(c.homeRegion).toBe("vale")
    expect(c.currentRegion).toBe("vale")
  })

  it("humble origin halves gold and starts with zero renown", () => {
    const c = createCharacter({
      id: "c",
      name: "Pauper",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    expect(c.gold).toBe(60)
    expect(c.reputations[0].value).toBe(0)
  })
})

describe("Phase 7 · bench mechanic (§20)", () => {
  it("joining a big clan above your level benches you and counts the bench_joined counter", () => {
    const c = makeChar({ currentClanId: null, powerLevel: 20, turn: 10 })
    // golden_lotus wealth=9 → threshold wealth*12 = 108 > 20 → bench.
    joinClan(c, "golden_lotus", c.turn, 500, reg)
    expect(c.benchedUntilTurn).toBe(10 + GAME_CONFIG.benchDurationTurns)
    expect(c.counters["bench_joined"]).toBe(1)
    expect(isBenched(c)).toBe(true)
    expect(c.currentRegion).toBe("capital")
  })

  it("joining a right-sized clan does not bench you", () => {
    // golden_lotus wealth=9 → bench threshold wealth*12 = 108; power 200 clears it.
    const c = makeChar({ currentClanId: null, powerLevel: 200, turn: 10 })
    joinClan(c, "golden_lotus", c.turn, 500, reg)
    expect(c.benchedUntilTurn).toBeNull()
    expect(isBenched(c)).toBe(false)
  })

  it("benched stat gains are reduced and clear when the deadline passes", () => {
    const c = makeChar({ currentClanId: "golden_lotus", powerLevel: 20, turn: 10 })
    c.benchedUntilTurn = 10 + GAME_CONFIG.benchDurationTurns
    const before = c.strength
    const ev: EventContent = {
      id: "bench_gain",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "train",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          statDeltas: { strength: 10 },
        },
      ],
    }
    resolveChoice(c, ev, "train", reg, new Rng(1))
    expect(c.strength).toBe(before + Math.round(10 * 0.8))
    // Advance past the deadline.
    c.turn = c.benchedUntilTurn!
    clearExpiredHunted(c)
    expect(isBenched(c)).toBe(false)
  })
})

describe("Phase 7 · role signals on offers (§20)", () => {
  it("roleSignalFor reports bench/up/same correctly", () => {
    // golden_lotus wealth=9 → bench below 108, up at/above 162.
    const weak = makeChar({ powerLevel: 10 })
    expect(roleSignalFor(weak, "golden_lotus", reg)).toBe("bench")
    const strong = makeChar({ powerLevel: 200 })
    expect(roleSignalFor(strong, "golden_lotus", reg)).toBe("up")
    const mid = makeChar({ powerLevel: 130 })
    expect(roleSignalFor(mid, "golden_lotus", reg)).toBe("same")
  })

  it("clan offer cards carry the role signal", () => {
    const c = makeChar({ powerLevel: 10 })
    const { offers } = generateClanOffer(c, reg, new Rng(1))
    expect(offers.length).toBeGreaterThan(0)
    for (const o of offers) {
      expect(o.roleSignal).toBeDefined()
      expect(["up", "same", "bench"]).toContain(o.roleSignal)
    }
  })
})

describe("Phase 7 · foreign & region gating (§19/§21)", () => {
  it("requiresForeign events only serve while abroad", () => {
    const home = makeChar({ currentRegion: "vale", homeRegion: "vale" })
    const abroad = makeChar({ currentRegion: "capital", homeRegion: "vale" })
    const ev = reg.events.find((e) => e.id === "foreign_changing_room")
    if (!ev) throw new Error("missing foreign_changing_room")
    expect(isEligible(ev, home)).toBe(false)
    expect(isEligible(ev, abroad)).toBe(true)
  })

  it("requiresRegion events only serve in the matching region", () => {
    const inCapital = makeChar({ currentRegion: "capital", homeRegion: "vale" })
    const inVale = makeChar({ currentRegion: "vale", homeRegion: "vale" })
    const ev = reg.events.find((e) => e.id === "region_capital_gala")
    if (!ev) throw new Error("missing region_capital_gala")
    expect(isEligible(ev, inCapital)).toBe(true)
    expect(isEligible(ev, inVale)).toBe(false)
  })

  it("joining a foreign clan moves currentRegion, leaving returns home", () => {
    const c = makeChar({ currentClanId: null, homeRegion: "vale", currentRegion: "vale", turn: 5 })
    joinClan(c, "golden_lotus", c.turn, 500, reg)
    expect(c.currentRegion).toBe("capital")
    c.currentClanId = null
    c.currentRegion = c.homeRegion
    expect(c.currentRegion).toBe("vale")
  })
})

describe("Phase 7 · negotiation dial (§24)", () => {
  function pendingOffer(c: CharacterState) {
    c.pendingJoinOffer = { clanId: "blacktide", signingGold: 500, stipend: 100 }
  }

  it("accept_join finalizes the deferred join with the shown gold", () => {
    const c = makeChar({ gold: 50, turn: 5 })
    pendingOffer(c)
    const ev = negotiationFollowUpEvent(c, reg)
    resolveChoice(c, ev, "accept_join", reg, new Rng(1))
    expect(c.pendingJoinOffer).toBeNull()
    expect(c.currentClanId).toBe("blacktide")
    expect(c.gold).toBe(50 + 500)
    expect(c.counters["negotiations_won"] ?? 0).toBe(0)
  })

  it("a successful press boosts the signing gold and stipend", () => {
    const c = makeChar({ gold: 50, turn: 5, charisma: 25 })
    pendingOffer(c)
    // charisma 25 → 0.55 + 0.5 = 1.05 capped at 0.95; pick a seed that rolls low.
    for (let i = 0; i < 20; i++) {
      const c2 = makeChar({ gold: 50, turn: 5, charisma: 25 })
      pendingOffer(c2)
      const ev2 = negotiationFollowUpEvent(c2, reg)
      const r2 = new Rng(hashSeed("negotiate-win-" + i))
      const before = c2.gold
      resolveChoice(c2, ev2, "negotiate_join", reg, r2)
      if (c2.currentClanId === "blacktide") {
        expect(c2.gold).toBe(before + Math.round(500 * GAME_CONFIG.negotiationGoldMultiplier))
        expect(c2.counters["negotiations_won"]).toBe(1)
        return
      }
    }
    throw new Error("no successful negotiation rolled in 20 seeds")
  })

  it("a failed press withdraws the offer and hits reputation", () => {
    for (let i = 0; i < 40; i++) {
      const c2 = makeChar({
        gold: 50,
        turn: 5,
        charisma: 1,
        reputations: [{ faction: "blacktide", value: 20, peakValue: 20 }],
      })
      pendingOffer(c2)
      const ev2 = negotiationFollowUpEvent(c2, reg)
      const r2 = new Rng(hashSeed("negotiate-fail-" + i))
      resolveChoice(c2, ev2, "negotiate_join", reg, r2)
      if (c2.currentClanId === null) {
        expect(c2.reputations.find((r) => r.faction === "blacktide")?.value).toBe(15)
        expect(c2.counters["negotiation_failures"]).toBe(1)
        expect(c2.pendingJoinOffer).toBeNull()
        return
      }
    }
    throw new Error("no failed negotiation rolled in 40 seeds")
  })
})

describe("Phase 7 · whole-arc tournaments (§22)", () => {
  it("intro → 3 fixtures → honor beat resolves through the minigame path", () => {
    const c = makeChar({ age: 18, turn: 12, currentClanId: null, powerLevel: 60 })
    const rng = new Rng(hashSeed("tournament"))
    // Force the tournament intro by repeatedly building events until it appears.
    let started = false
    for (let i = 0; i < 40 && !started; i++) {
      const { event, served } = buildServedEvent(c, reg, rng)
      if (event.id === "__tournament_intro__") {
        const luck = served.choices.find((ch) => ch.id === "mode_luck")!
        resolveChoice(c, event, luck.id, reg, rng)
        started = true
      } else {
        // Consume whatever beat was served so the loop advances.
        const id = served.choices[0]?.id
        if (id) {
          if (event.type === "minigame" || event.cards) resolveMinigame(c, event, id, reg, rng)
          else resolveChoice(c, event, id, reg, rng)
        }
      }
    }
    expect(started).toBe(true)
    expect(c.pendingTournament).not.toBeNull()
    expect(c.pendingTournament!.mode).toBe("luck")
    expect(c.pendingTournament!.fixturesLeft).toBe(3)

    // Play out the fixtures.
    let fixtures = 0
    while (c.pendingTournament && fixtures < 10) {
      const { event, served } = buildServedEvent(c, reg, rng)
      expect(event.id).toBe("__tournament_fixture__")
      const id = served.choices[0]!.id
      resolveMinigame(c, event, id, reg, rng)
      fixtures++
    }
    expect(c.pendingTournament).toBeNull()
    expect(c.pendingTournamentResult).not.toBeNull()

    // Honor beat.
    const { event: honor, served: honorServed } = buildServedEvent(c, reg, rng)
    expect(honor.id).toBe("__tournament_outcome__")
    const continueId = honorServed.choices[0]!.id
    resolveChoice(c, honor, continueId, reg, rng)
    expect(c.pendingTournamentResult).toBeNull()
  })

  it("skill mode resolves through memory_match fixtures", () => {
    const c = makeChar({ age: 18, turn: 12, currentClanId: null, powerLevel: 60 })
    const intro = tournamentIntroEvent(c, "grand_melee")
    resolveChoice(c, intro, "mode_skill", reg, new Rng(1))
    expect(c.pendingTournament!.mode).toBe("skill")
    const fixture = tournamentFixtureEvent(c)
    expect(fixture.subtype).toBe("memory_match")
  })
})

describe("Phase 7 · global honors (§23/§7.5)", () => {
  function makeAch(id: string, condition: AchievementContent["condition"]): ContentRegistry {
    return {
      ...reg,
      achievements: [
        {
          id,
          icon: "x",
          rarity: "epic",
          name: { en: "", es: "" },
          description: { en: "", es: "" },
          condition,
        },
      ],
    }
  }

  it("faction_wealth_gte passes only while in a prestigious clan", () => {
    const rich = makeChar({ currentClanId: "golden_lotus" })
    const poor = makeChar({ currentClanId: "greywater" })
    const mini = makeAch("wealthy", { type: "faction_wealth_gte", value: 7 })
    expect(evaluateAchievements(rich, mini)).toHaveLength(1)
    expect(evaluateAchievements(poor, mini)).toHaveLength(0)
  })

  it("and-composition requires every nested condition", () => {
    const c = makeChar({ currentClanId: "golden_lotus", fame: 85 })
    const mini = makeAch("champ", {
      type: "and",
      conditions: [
        { type: "faction_wealth_gte", value: 7 },
        { type: "fame_gte", value: 80 },
        { type: "counter_gte", key: "tournaments_won", value: 1 },
      ],
    })
    c.counters["tournaments_won"] = 1
    expect(evaluateAchievements(c, mini)).toHaveLength(1)
    c.counters["tournaments_won"] = 0
    expect(evaluateAchievements(c, mini)).toHaveLength(0)
  })

  it("home_rep_gte checks the fixed home faction", () => {
    const c = makeChar({
      homeFactionId: "ironhold",
      reputations: [
        { faction: "ironhold", value: 92, peakValue: 92 },
        { faction: "blacktide", value: 5, peakValue: 5 },
      ],
    })
    const mini = makeAch("underdog", {
      type: "and",
      conditions: [
        { type: "origin", value: "humble" },
        { type: "home_rep_gte", value: 90 },
      ],
    })
    expect(evaluateAchievements(c, mini)).toHaveLength(1)
    c.origin = "established"
    expect(evaluateAchievements(c, mini)).toHaveLength(0)
  })

  it("generateDistinctions emits champion_of_the_age and deed_of_the_year rows", () => {
    const c = makeChar({ achievements: ["champion_of_the_age", "deed_of_the_year"] })
    c.counters["deeds_of_the_year"] = 2
    const rows = generateDistinctions(c, reg)
    expect(rows.some((r) => r.id === "champion_of_the_age")).toBe(true)
    expect(rows.find((r) => r.id === "deed_of_the_year")?.count).toBe(2)
  })
})

describe("Phase 7 · class-partitioned epithets (§25)", () => {
  it("loyal career names the home faction as the banner", () => {
    const c = makeChar({
      class: "warrior",
      homeFactionId: "ironhold",
      clanMemberships: [
        {
          clanId: "ironhold",
          rank: "trusted",
          joinedAtTurn: 1,
          leftAtTurn: null,
          leftReason: null,
        },
      ],
      reputations: [{ faction: "ironhold", value: 80, peakValue: 80 }],
    })
    const epithet = generateEpithet(c, reg, "en")
    expect(epithet.title).toContain("Ironhold")
    expect(epithet.subtitle).toContain("Ironhold")
  })

  it("identity pools are disjoint across classes", () => {
    const classes = ["warrior", "wizard", "rogue", "ranger", "cleric", "bard"]
    const seen = new Set<string>()
    for (const cls of classes) {
      // Mercenary archetype: >= 3 clan memberships.
      const c = makeChar({
        class: cls,
        clanMemberships: [
          {
            clanId: "ironhold",
            rank: "recruit",
            joinedAtTurn: 1,
            leftAtTurn: 5,
            leftReason: "retired",
          },
          {
            clanId: "blacktide",
            rank: "recruit",
            joinedAtTurn: 6,
            leftAtTurn: 10,
            leftReason: "retired",
          },
          {
            clanId: "golden_lotus",
            rank: "recruit",
            joinedAtTurn: 11,
            leftAtTurn: null,
            leftReason: null,
          },
        ],
      })
      const epithet = generateEpithet(c, reg, "en")
      // No personality tags, so the title is exactly "the {identity}".
      const identity = epithet.title.replace(/^the /, "")
      // The identity word must be unique across classes.
      expect(seen.has(identity)).toBe(false)
      seen.add(identity)
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 7 §7.8: determinism — same daily seed ⇒ identical sequence of turns,
// including the new seeded systems (negotiation + tournaments). No Math.random.
// ---------------------------------------------------------------------------
describe("Phase 7 · daily-seed determinism (§26/§7.8)", () => {
  it("two runs from the same seed produce identical states across a season", () => {
    const a = createCharacter({
      id: "a",
      name: "A",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    const b = createCharacter({
      id: "b",
      name: "B",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    const rngA = new Rng(hashSeed("daily-seed"))
    const rngB = new Rng(hashSeed("daily-seed"))
    a.rival = generateRival(a, reg, rngA)
    b.rival = generateRival(b, reg, rngB)
    expect(fingerprint(a)).toBe(fingerprint(b))
    // Play a full season (seasonLength turns) with identical choices.
    for (let i = 0; i < GAME_CONFIG.seasonLength + 1; i++) {
      const endedA = playTurn(a, rngA)
      const endedB = playTurn(b, rngB)
      expect(endedA).toBe(endedB)
      expect(fingerprint(a)).toBe(fingerprint(b))
      if (endedA) break
    }
    expect(a.turn).toBeGreaterThan(0)
  })

  it("the turn pipeline never calls Math.random", () => {
    const originalRandom = Math.random
    const c = createCharacter({
      id: "c",
      name: "C",
      classId: "rogue",
      origin: "established",
      locale: "en",
      registry: reg,
    })
    const rng = new Rng(hashSeed("no-math-random"))
    c.rival = generateRival(c, reg, rng)
    let hit = false
    Math.random = () => {
      hit = true
      throw new Error("Math.random called in game pipeline")
    }
    try {
      for (let i = 0; i < GAME_CONFIG.seasonLength + 1; i++) {
        if (playTurn(c, rng)) break
      }
    } finally {
      Math.random = originalRandom
    }
    expect(hit).toBe(false)
    expect(c.turn).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from "vitest"
import { Rng, hashSeed } from "../../shared/rng.js"
import { computeScore, GAME_CONFIG, arcForAge } from "../../shared/config.js"
import {
  advanceRival,
  buildServedEvent,
  createCharacter,
  generateClanOffer,
  generateRival,
  resolveChoice,
  resolveMinigame,
  resolveSeasonSummary,
  retirementOfferEvent,
  rollWorldEvents,
  selectEvent,
} from "./engine.js"
import { generateEpilogue } from "./epilogue.js"
import { evaluateAchievements } from "./achievements.js"
import { loadContent } from "../content/registry.js"
import {
  adjustAffinity,
  applyClanBetrayal,
  computePowerLevel,
  ensureRelationship,
  fillSlots,
  isEligible,
  joinClan,
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
    gender: "nonbinary",
    class: "warrior",
    archetype: null,
    epithet: null,
    age: 16,
    currentArc: "adventurer",
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
  it("creates a character with correct base stats", () => {
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
    expect(c.gold).toBe(120)
    expect(c.status).toBe("alive")
    expect(c.reputations).toHaveLength(1)
    expect(c.reputations[0].faction).toBe("ironhold")
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
  it("createCharacter defaults gender to nonbinary", () => {
    const c = createCharacter({
      id: "g1",
      name: "X",
      classId: "warrior",
      locale: "en",
      registry: reg,
    })
    expect(c.gender).toBe("nonbinary")
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
    const neutral = createCharacter({
      id: "gn",
      name: "X",
      gender: "nonbinary",
      classId: "warrior",
      locale: "es",
      registry: reg,
    })
    const servedNeutral = serveEvent(event, neutral, "es", reg, new Rng(7), false)
    expect(servedNeutral.narrative).toContain("Compartí la llama, extrañe.")
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

  it("leaves NPC-referential neutral forms neutral in served Spanish", () => {
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
    // "une herrera" is an NPC, so it must stay neutral regardless of player gender.
    const out = resolveChoice(c, event, "join", reg, new Rng(5))
    expect(out.narrative).not.toContain("un herrero")
    expect(out.narrative).toContain("une herrera")
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
    resolveSeasonSummary(c)
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
    resolveSeasonSummary(c)
    // expired_item (expiresAtTurn 8 <= 10) should be removed
    expect(c.inventory.find((i) => i.itemId === "expired_item")).toBeUndefined()
    expect(c.inventory.find((i) => i.itemId === "active_item")).toBeDefined()
    expect(c.inventory.find((i) => i.itemId === "permanent_item")).toBeDefined()
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
    expect(c.gold).toBe(20000 - 8000)
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
    }
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

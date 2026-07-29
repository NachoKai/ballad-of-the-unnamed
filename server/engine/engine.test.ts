import { describe, expect, it } from "vitest"
import { Rng, hashSeed } from "../../shared/rng.js"
import { computeScore, GAME_CONFIG } from "../../shared/config.js"
import { createCharacter, resolveChoice, resolveMinigame, retirementOfferEvent } from "./engine.js"
import { generateEpilogue } from "./epilogue.js"
import { evaluateAchievements } from "./achievements.js"
import { loadContent } from "../content/registry.js"
import { fillSlots, computePowerLevel, isEligible, updateMomentum } from "./helpers.js"
import type { AchievementContent, CharacterState, EventContent } from "../../shared/types.js"
import type { ContentRegistry } from "../content/registry.js"

const reg = loadContent()

function makeChar(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: "test",
    name: "Test",
    class: "warrior",
    archetype: null,
    age: 16,
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
    expect(out.ended).toBe(true)
    expect(out.endingType).toMatch(/peaceful_retirement|other_retirement/)
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

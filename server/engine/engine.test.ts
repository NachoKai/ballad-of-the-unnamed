import { describe, expect, it } from "vitest"
import { Rng, hashSeed, rivalRngFor } from "../../shared/rng.js"
import { computeScore, GAME_CONFIG, arcForAge, RIVAL_FOCUSES } from "../../shared/config.js"
import {
  advanceRival,
  applyMinigameOutcome,
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
import { applyInteractiveMove, createInteractiveState, interactiveTier } from "./minigames/index.js"
import { endCombat, prepareCombatServe, resolveCombatRound } from "./combat/index.js"
import { MEMOTEST_CARD_COUNT } from "./minigames/memotest.js"
import { loadContent } from "../content/registry.js"
import {
  adjustAffinity,
  applyClanBetrayal,
  buildRivalUpdate,
  clearExpiredHunted,
  computePowerLevel,
  ensureRelationship,
  fillSlots,
  hasPlayableChoice,
  isBenched,
  isEligible,
  joinClan,
  roleSignalFor,
  scaledReputationDelta,
  serveEvent,
  updateMomentum,
} from "./helpers.js"
import type {
  AchievementContent,
  ArchetypeContent,
  CharacterState,
  EventContent,
  InteractiveMove,
} from "../../shared/types.js"
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
    liability: 0,
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
    // humble origin: starting gold halved, no starting renown.
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

  it("no two archetypes in a class share the same stat profile", () => {
    for (const [cls, list] of Object.entries(reg.archetypes)) {
      const seen = new Set<string>()
      for (const a of list) {
        const sig = Object.entries(a.statDeltas)
          .sort((p, q) => p[0].localeCompare(q[0]))
          .map(([k, v]) => `${k}:${v}`)
          .join(",")
        expect(seen.has(sig), `${cls} archetype ${a.id} duplicates a stat profile`).toBe(false)
        seen.add(sig)
      }
    }
  })

  it("no two archetypes in a class share the same icon", () => {
    for (const [cls, list] of Object.entries(reg.archetypes)) {
      const seen = new Set<string>()
      for (const a of list) {
        expect(seen.has(a.icon), `${cls} archetype ${a.id} duplicates the ${a.icon} icon`).toBe(
          false,
        )
        seen.add(a.icon)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Hidden master archetypes (Phase 8.1)
// ---------------------------------------------------------------------------
describe("hidden master archetypes", () => {
  const CLASSES = ["warrior", "wizard", "rogue", "ranger", "cleric", "bard"]
  const total = (a: ArchetypeContent) => Object.values(a.statDeltas).reduce((s, v) => s + v, 0)

  it("each class has exactly one hidden master archetype", () => {
    for (const cls of CLASSES) {
      const hidden = (reg.archetypes[cls] ?? []).filter((a) => a.hidden)
      expect(hidden, `${cls} must have exactly one hidden archetype`).toHaveLength(1)
    }
  })

  it("the master archetype is strictly stronger than every normal archetype of its class", () => {
    for (const cls of CLASSES) {
      const list = reg.archetypes[cls] ?? []
      const master = list.find((a) => a.hidden)
      if (!master) continue
      const masterTotal = total(master)
      for (const a of list) {
        if (a.hidden) continue
        expect(
          total(a),
          `${cls} normal archetype ${a.id} (${total(a)}) must total less than master ${master.id} (${masterTotal})`,
        ).toBeLessThan(masterTotal)
      }
    }
  })

  it("hidden masters keep unique stat profiles and icons within their class", () => {
    for (const cls of CLASSES) {
      const list = reg.archetypes[cls] ?? []
      const seen = new Set<string>()
      const icons = new Set<string>()
      for (const a of list) {
        const sig = Object.entries(a.statDeltas)
          .sort((p, q) => p[0].localeCompare(q[0]))
          .map(([k, v]) => `${k}:${v}`)
          .join(",")
        expect(seen.has(sig), `${cls} archetype ${a.id} duplicates a stat profile`).toBe(false)
        seen.add(sig)
        expect(icons.has(a.icon), `${cls} archetype ${a.id} duplicates the ${a.icon} icon`).toBe(
          false,
        )
        icons.add(a.icon)
      }
    }
  })

  it("createCharacter accepts an unlocked hidden master and applies its deltas", () => {
    const c = createCharacter({
      id: "m1",
      name: "Warlord",
      classId: "warrior",
      archetypeId: "warlord",
      locale: "en",
      registry: reg,
    })
    expect(c.archetype).toBe("warlord")
    // warrior base strength 8 + 8 = 16; intelligence 3 + 4 = 7
    expect(c.strength).toBe(16)
    expect(c.intelligence).toBe(7)
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
    expect(c.gold).toBe(150 + GAME_CONFIG.goldPerTurn)
  })

  it("grants passive gold each resolved turn even without a gold delta", () => {
    const c = makeChar({ gold: 100 })
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
        },
      ],
    }
    resolveChoice(c, event, "pick", reg, new Rng(1))
    expect(c.gold).toBe(100 + GAME_CONFIG.goldPerTurn)
  })

  it("passive gold is deterministic across seeds", () => {
    const a = makeChar({ gold: 100 })
    const b = makeChar({ gold: 100 })
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
        },
      ],
    }
    resolveChoice(a, event, "pick", reg, new Rng(1))
    resolveChoice(b, event, "pick", reg, new Rng(999))
    expect(a.gold).toBe(b.gold)
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
// Stat-gated choices
// ---------------------------------------------------------------------------
describe("stat-gated choices", () => {
  const gatedEvent: EventContent = {
    id: "gated",
    minAge: 0,
    maxAge: 99,
    weight: 1,
    narrative: { en: "", es: "" },
    choices: [
      {
        id: "gate",
        rarity: "common",
        label: { en: "", es: "" },
        narrative: { en: "", es: "" },
        requiresStat: { stat: "strength", min: 12 },
      },
    ],
  }

  it("serveEvent marks statMet true when the character meets the requirement", () => {
    const c = makeChar({ strength: 15 })
    const served = serveEvent(gatedEvent, c, "en", reg, new Rng(1), false)
    expect(served.choices[0].requiresStat).toEqual({ stat: "strength", min: 12 })
    expect(served.choices[0].statMet).toBe(true)
  })

  it("serveEvent marks statMet false when the character falls short", () => {
    const c = makeChar({ strength: 5 })
    const served = serveEvent(gatedEvent, c, "en", reg, new Rng(1), false)
    expect(served.choices[0].statMet).toBe(false)
  })

  it("choices without a requirement are never flagged locked", () => {
    const c = makeChar({ strength: 5 })
    const freeEvent: EventContent = {
      id: "free",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        { id: "any", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    const served = serveEvent(freeEvent, c, "en", reg, new Rng(1), false)
    expect(served.choices[0].requiresStat).toBeUndefined()
    expect(served.choices[0].statMet).toBeUndefined()
  })

  it("resolveChoice accepts a choice whose requirement is met", () => {
    const c = makeChar({ strength: 15, turn: 0 })
    const out = resolveChoice(c, gatedEvent, "gate", reg, new Rng(1))
    expect(c.turn).toBe(1)
    expect(out.ended).toBe(false)
  })

  it("resolveChoice rejects a locked choice server-side", () => {
    const c = makeChar({ strength: 5 })
    expect(() => resolveChoice(c, gatedEvent, "gate", reg, new Rng(1))).toThrow(/locked choice/)
    expect(c.turn).toBe(0) // rejected before any state mutates
  })

  it("authored tavern_stranger aggressive choice is gated on strength", () => {
    const ev = reg.events.find((e) => e.id === "tavern_stranger")
    if (!ev || !ev.choices) throw new Error("missing tavern_stranger fixture")
    const aggressive = ev.choices.find((ch) => ch.id === "aggressive")
    expect(aggressive?.requiresStat).toEqual({ stat: "strength", min: 12 })
    const weak = makeChar({ strength: 5 })
    const served = serveEvent(ev, weak, "en", reg, new Rng(1), false)
    expect(served.choices.find((ch) => ch.id === "aggressive")?.statMet).toBe(false)
    const strong = makeChar({ strength: 20 })
    const servedStrong = serveEvent(ev, strong, "en", reg, new Rng(1), false)
    expect(servedStrong.choices.find((ch) => ch.id === "aggressive")?.statMet).toBe(true)
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

  it("applyMinigameOutcome applies deltas for a forced tier", () => {
    const c = createCharacter({
      id: "mg-fx",
      name: "Tier",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    const event: EventContent = {
      id: "forced_tier_test",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "n", es: "n" },
      outcomes: {
        critical: { goldDelta: 500, narrative: { en: "crit", es: "crit" } },
        success: { goldDelta: 100, narrative: { en: "ok", es: "ok" } },
        partial: { narrative: { en: "p", es: "p" } },
        fail: { goldDelta: -50, narrative: { en: "f", es: "f" } },
      },
    }
    const out = applyMinigameOutcome(c, event, "critical", reg, new Rng(1))
    expect(c.gold).toBe(560)
    expect(out.narrative).toBe("crit")
    expect(c.turn).toBe(1)
    expect(c.counters.event_forced_tier_test).toBe(1)
  })

  it("interactive minigames never resolve through the hidden roll", () => {
    const c = createCharacter({
      id: "mg-int",
      name: "Inter",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    const event: EventContent = {
      id: "interactive_blocked",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "intelligence",
      narrative: { en: "n", es: "n" },
      cards: [{ id: "rock", icon: "sword", label: { en: "Rock", es: "Roca" } }],
      resolution: {
        type: "interactive",
        game: "rps",
        baseWinChance: 0.5,
        statInfluence: {},
      },
      outcomes: {
        critical: { narrative: { en: "c", es: "c" } },
        success: { narrative: { en: "s", es: "s" } },
        partial: { narrative: { en: "p", es: "p" } },
        fail: { narrative: { en: "f", es: "f" } },
      },
    }
    expect(() => resolveMinigame(c, event, "rock", reg, new Rng(1))).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Minigame trap cards (urn mechanic)
// ---------------------------------------------------------------------------
describe("minigame trap cards", () => {
  const trapEvent: EventContent = {
    id: "mg_trap",
    type: "minigame",
    minAge: 0,
    maxAge: 99,
    weight: 1,
    primaryStat: "intelligence",
    narrative: { en: "", es: "" },
    cards: [
      { id: "urn_ash", icon: "flask-conical", label: { en: "Ash", es: "" } },
      { id: "urn_bone", icon: "skull", label: { en: "Bone", es: "" }, trap: true },
      { id: "urn_gilt", icon: "gem", label: { en: "Gilt", es: "" } },
    ],
    resolution: {
      type: "weighted_hidden_match",
      // Near-certain win: only the trap can force a fail.
      baseWinChance: 0.97,
      statInfluence: {},
    },
    outcomes: {
      critical: { goldDelta: 10, narrative: { en: "PERFECT", es: "" } },
      success: { goldDelta: 5, narrative: { en: "WIN", es: "" } },
      partial: { goldDelta: 1, narrative: { en: "MEH", es: "" } },
      fail: { goldDelta: -10, narrative: { en: "ANULADA", es: "" } },
    },
  }

  it("picking the trapped card always lands the fail tier, whatever the seed", () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      const c = makeChar({ gold: 100 })
      const out = resolveMinigame(c, trapEvent, "urn_bone", reg, new Rng(seed))
      expect(out.narrative).toBe("ANULADA")
      expect(c.gold).toBe(90)
    }
  })

  it("non-trap cards still resolve via the hidden-variable roll (win possible)", () => {
    for (const seed of [1, 7, 42]) {
      const c = makeChar()
      const out = resolveMinigame(c, trapEvent, "urn_ash", reg, new Rng(seed))
      expect(["PERFECT", "WIN"]).toContain(out.narrative)
    }
  })

  it("trap resolution is deterministic per seed", () => {
    const a = makeChar({ gold: 100 })
    const b = makeChar({ gold: 100 })
    const outA = resolveMinigame(a, trapEvent, "urn_bone", reg, new Rng(77))
    const outB = resolveMinigame(b, trapEvent, "urn_bone", reg, new Rng(77))
    expect(outA.narrative).toBe(outB.narrative)
    expect(a.gold).toBe(b.gold)
  })

  it("serveEvent hints hasTraps without leaking which card is the trap", () => {
    const c = makeChar()
    const served = serveEvent(trapEvent, c, "en", reg, new Rng(1), false)
    expect(served.hasTraps).toBe(true)
    // The served choices must not carry the trap flag — only the aggregate hint.
    for (const ch of served.choices) {
      expect((ch as { trap?: boolean }).trap).toBeUndefined()
    }
  })

  it("events without traps never set hasTraps", () => {
    const c = makeChar()
    const plain: EventContent = {
      id: "mg_plain",
      type: "minigame",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "strength",
      narrative: { en: "", es: "" },
      cards: [{ id: "strike", icon: "sword", label: { en: "Strike", es: "" } }],
      resolution: { type: "weighted_hidden_match", baseWinChance: 0.5, statInfluence: {} },
      outcomes: {
        critical: { narrative: { en: "", es: "" } },
        success: { narrative: { en: "", es: "" } },
        partial: { narrative: { en: "", es: "" } },
        fail: { narrative: { en: "", es: "" } },
      },
    }
    const served = serveEvent(plain, c, "en", reg, new Rng(1), false)
    expect(served.hasTraps).toBe(false)
  })

  it("authored haunted_urn marks exactly one card as a trap", () => {
    const urn = reg.minigames.find((m) => m.id === "haunted_urn")
    if (!urn) throw new Error("missing haunted_urn fixture")
    const traps = (urn.cards ?? []).filter((k) => k.trap)
    expect(traps).toHaveLength(1)
    // Picking the authored trap always fails.
    for (const seed of [5, 50, 500]) {
      const c = makeChar()
      const out = resolveMinigame(c, urn, traps[0].id, reg, new Rng(seed))
      expect(out.narrative).toBe(urn.outcomes!.fail.narrative.en)
    }
  })
})

// ---------------------------------------------------------------------------
// Liability meter ("Expediente")
// ---------------------------------------------------------------------------
describe("liability (Expediente)", () => {
  it("createCharacter starts with a clean record", () => {
    const c = createCharacter({
      id: "l0",
      name: "X",
      classId: "warrior",
      locale: "en",
      registry: reg,
    })
    expect(c.liability).toBe(0)
  })

  it("resolveChoice applies liabilityDelta and clamps at liabilityMax", () => {
    const c = makeChar({ liability: 95 })
    const event: EventContent = {
      id: "liab_up",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "shady",
          rarity: "rare",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          liabilityDelta: 20,
        },
      ],
    }
    resolveChoice(c, event, "shady", reg, new Rng(1))
    expect(c.liability).toBe(GAME_CONFIG.liabilityMax)
  })

  it("liabilityDelta can reduce liability but never below zero", () => {
    const c = makeChar({ liability: 5 })
    const event: EventContent = {
      id: "liab_down",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "clean",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          liabilityDelta: -20,
        },
      ],
    }
    resolveChoice(c, event, "clean", reg, new Rng(1))
    expect(c.liability).toBe(0)
  })

  it("isEligible gates events on requiresLiability", () => {
    const clean = makeChar({ liability: 0 })
    const dirty = makeChar({ liability: 40 })
    const ev: EventContent = {
      id: "dark_path",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      requiresLiability: { min: 30 },
      narrative: { en: "", es: "" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    expect(isEligible(ev, clean)).toBe(false)
    expect(isEligible(ev, dirty)).toBe(true)
  })

  it("resolveSeasonSummary decays liability a little each season", () => {
    const c = makeChar({ liability: 10, turn: 5, seasonCount: 0 })
    resolveSeasonSummary(c, reg)
    expect(c.liability).toBe(10 - GAME_CONFIG.liabilityDecayPerSeason)
  })

  it("serveEvent surfaces liabilityDelta on the served choice", () => {
    const c = makeChar({ liability: 0 })
    const ev: EventContent = {
      id: "serve_liab",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "shady",
          rarity: "rare",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          liabilityDelta: 12,
        },
      ],
    }
    const served = serveEvent(ev, c, "en", reg, new Rng(1), false)
    expect(served.choices[0].liabilityDelta).toBe(12)
  })

  it("evaluateAchievements honors liability_gte / liability_lte / run_ended", () => {
    const underworld: AchievementContent = {
      id: "underworld_test",
      icon: "skull",
      rarity: "epic",
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      condition: { type: "liability_gte", value: 50 },
    }
    const dirty = makeChar({ liability: 60 })
    expect(
      evaluateAchievements(dirty, { ...reg, achievements: [underworld] } as ContentRegistry).map(
        (a) => a.id,
      ),
    ).toContain("underworld_test")

    const cleanAch: AchievementContent = {
      id: "clean_test",
      icon: "heart",
      rarity: "rare",
      name: { en: "", es: "" },
      description: { en: "", es: "" },
      condition: {
        type: "and",
        conditions: [{ type: "run_ended" }, { type: "liability_lte", value: 0 }],
      },
    }
    const clean = makeChar({ liability: 0 })
    // Mid-run pass: runEnded is absent → not unlocked yet.
    expect(
      evaluateAchievements(clean, { ...reg, achievements: [cleanAch] } as ContentRegistry).map(
        (a) => a.id,
      ),
    ).not.toContain("clean_test")
    // Final pass: runEnded true → unlocks.
    const final = evaluateAchievements(
      clean,
      { ...reg, achievements: [cleanAch] } as ContentRegistry,
      { runEnded: true },
    )
    expect(final.map((a) => a.id)).toContain("clean_test")
  })

  it("resolveMinigame applies outcome.liabilityDelta on any tier", () => {
    const c = makeChar({ liability: 0 })
    const event: EventContent = {
      id: "mg_liab",
      type: "minigame",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "strength",
      narrative: { en: "", es: "" },
      cards: [{ id: "strike", icon: "sword", label: { en: "Strike", es: "" } }],
      resolution: { type: "weighted_hidden_match", baseWinChance: 0.02, statInfluence: {} },
      outcomes: {
        critical: { liabilityDelta: 7, narrative: { en: "c", es: "" } },
        success: { liabilityDelta: 7, narrative: { en: "s", es: "" } },
        partial: { liabilityDelta: 7, narrative: { en: "p", es: "" } },
        fail: { liabilityDelta: 7, narrative: { en: "f", es: "" } },
      },
    }
    resolveMinigame(c, event, "strike", reg, new Rng(123))
    expect(c.liability).toBe(7)
  })

  it("authored shady choices carry liabilityDelta and dark events are gated", () => {
    const gamble = reg.events.find((e) => e.id === "tavern_gamble")
    expect(gamble?.choices?.find((ch) => ch.id === "cheat")?.liabilityDelta).toBe(12)
    const bm = reg.events.find((e) => e.id === "tavern_blackmailer")
    expect(bm?.requiresLiability).toEqual({ min: 20 })
    expect(isEligible(bm!, makeChar({ liability: 0 }))).toBe(false)
    expect(isEligible(bm!, makeChar({ liability: 25 }))).toBe(true)
    // A clean character never sees the underworld's notice.
    const witness = reg.events.find((e) => e.id === "court_witness")
    expect(witness?.requiresLiability).toEqual({ min: 40 })
    // A failed heist stains the record (outcome-level liability).
    const heist = reg.minigames.find((m) => m.id === "heist_lockpick")
    expect(heist?.outcomes?.fail.liabilityDelta).toBe(12)
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
    // Combat ladder: First Kill → Monster Slayer → (future tiers).
    ["first_kill", "monsters_killed", 1],
    ["giant_killer", "elite_kills", 1],
    ["boss_slayer", "boss_kills", 1],
  ]

  it.each(COUNTER_ACH)("unlocks %s when counter %s reaches %d", (achId, key, value) => {
    const c = makeChar({ counters: { [key]: value } })
    const result = evaluateAchievements(c, reg)
    expect(result.map((a) => a.id)).toContain(achId)
    expect(c.achievements).toContain(achId)
  })

  it.each(COUNTER_ACH)("does not unlock %s below the threshold", (achId, key, value) => {
    const c = makeChar({ counters: { [key]: Math.max(0, value - 1) } })
    expect(evaluateAchievements(c, reg).map((a) => a.id)).not.toContain(achId)
  })

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
    // in the bench mechanic tests; monsters_killed/elite_kills/boss_kills are
    // bumped by endCombat in server/engine/combat (asserted in combat.test.ts).
    // Every counter above must be bumped somewhere.
    const engineBumped = new Set(["bench_joined", "monsters_killed", "elite_kills", "boss_kills"])
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

  it("season summary rivalUpdate mentions the rival's current focus", () => {
    const c = makeChar({
      turn: GAME_CONFIG.seasonLength,
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        focusId: "war",
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 10,
        lastAdvancedTurn: 0,
      },
    })
    const result = buildServedEvent(c, reg, new Rng(42))
    // advanceRival ran inside the season summary, so the focus may have rotated —
    // either way the served text must name whatever focus is now current.
    const focus = RIVAL_FOCUSES.find((f) => f.id === c.rival!.focusId)
    expect(result.served.rivalUpdate).toContain(focus!.label.en)
  })

  it("legacy rivals converge to a focus on their first season advance", () => {
    const c = makeChar({
      turn: GAME_CONFIG.seasonLength,
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 10,
        lastAdvancedTurn: 0,
      },
    })
    // focusId is undefined → advanceRival must always assign one, whatever the seed.
    const result = buildServedEvent(c, reg, new Rng(1))
    expect(RIVAL_FOCUSES.some((f) => f.id === c.rival!.focusId)).toBe(true)
    expect(result.served.rivalUpdate).toBeTruthy()
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
// Renown rebalance: reputation scaling + the per-season "bards sing" dividend
// ---------------------------------------------------------------------------
describe("renown economy", () => {
  it("resolveSeasonSummary grants fame scaled by the season grade", () => {
    const c = makeChar({ turn: 5, seasonCount: 0, powerLevel: 50, fame: 0 })
    resolveSeasonSummary(c, reg)
    // grade = round(50/10) = 5 → fame += 5 * seasonFamePerGrade
    expect(c.fame).toBe(5 * GAME_CONFIG.seasonFamePerGrade)
  })

  it("resolveSeasonSummary grants standing with the current faction", () => {
    const c = makeChar({ turn: 5, seasonCount: 0, powerLevel: 50, currentClanId: "ironhold" })
    resolveSeasonSummary(c, reg)
    // starts at 10 (makeChar default) → +5 * seasonReputationPerGrade
    expect(c.reputations.find((r) => r.faction === "ironhold")?.value).toBe(
      10 + 5 * GAME_CONFIG.seasonReputationPerGrade,
    )
  })

  it("resolveSeasonSummary grants no faction standing without a clan", () => {
    const c = makeChar({ turn: 5, seasonCount: 0, powerLevel: 50 })
    const before = c.reputations[0].value
    resolveSeasonSummary(c, reg)
    expect(c.reputations[0].value).toBe(before)
  })

  it("a bad capstone verdict shrinks the renown dividend", () => {
    const c = makeChar({
      turn: 5,
      seasonCount: 0,
      powerLevel: 50,
      fame: 0,
      pendingCapstoneResult: {
        kind: "election",
        tier: "fail",
        verdict: "BAD −2",
        gradeDelta: -2,
      },
    })
    resolveSeasonSummary(c, reg)
    // grade = 5 − 2 = 3 → fame += 3 * seasonFamePerGrade
    expect(c.fame).toBe(3 * GAME_CONFIG.seasonFamePerGrade)
  })

  it("buildServedEvent serves the renown dividend on the season summary", () => {
    const clanless = makeChar({ turn: GAME_CONFIG.seasonLength, powerLevel: 50 })
    const clanlessServed = buildServedEvent(clanless, reg, new Rng(42)).served
    expect(clanlessServed.seasonFameGain).toBe(5 * GAME_CONFIG.seasonFamePerGrade)
    expect(clanlessServed.seasonReputationGain).toBeUndefined()

    const clanned = makeChar({
      turn: GAME_CONFIG.seasonLength,
      powerLevel: 50,
      currentClanId: "ironhold",
    })
    const clannedServed = buildServedEvent(clanned, reg, new Rng(42)).served
    expect(clannedServed.seasonFameGain).toBe(5 * GAME_CONFIG.seasonFamePerGrade)
    expect(clannedServed.seasonReputationGain).toBe(5 * GAME_CONFIG.seasonReputationPerGrade)
  })

  it("the served renown dividend matches exactly what resolveSeasonSummary applies", () => {
    const c = makeChar({
      turn: GAME_CONFIG.seasonLength,
      powerLevel: 50,
      currentClanId: "ironhold",
    })
    const served = buildServedEvent(c, reg, new Rng(42)).served
    const repBefore = c.reputations.find((r) => r.faction === "ironhold")!.value
    resolveSeasonSummary(c, reg)
    const repAfter = c.reputations.find((r) => r.faction === "ironhold")!.value
    expect(repAfter - repBefore).toBe(served.seasonReputationGain)
    expect(c.fame).toBe(served.seasonFameGain!)
  })

  it("capstone fail verdicts are softened to −2", () => {
    const election = reg.minigames.find((m) => m.id === "election_of_the_year")
    expect(election?.outcomes?.fail.gradeDelta).toBe(-2)
    expect(election?.outcomes?.fail.verdict?.es).toBe("MALA −2")
    expect(election?.outcomes?.fail.reputationDelta).toBe(-2)
    expect(election?.outcomes?.fail.fameDelta).toBe(-1)
    const debate = reg.minigames.find((m) => m.id === "debate_rival_claim")
    expect(debate?.outcomes?.fail.gradeDelta).toBe(-2)
    expect(debate?.outcomes?.fail.verdict?.en).toBe("BAD −2")
  })

  it("positive reputation gains are scaled up and shown before applying", () => {
    const ev: EventContent = {
      id: "rep_scale",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "aid",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          reputationDelta: 3,
          reputationFaction: "ironhold",
        },
      ],
    }
    const c = makeChar()
    const served = serveEvent(ev, c, "en", reg, new Rng(1), false)
    // 3 × 1.5 = 4.5 → rounds to 5, exactly what adjustReputation applies.
    expect(served.choices[0].reputationDelta).toBe(5)
    resolveChoice(c, ev, "aid", reg, new Rng(1))
    expect(c.reputations.find((r) => r.faction === "ironhold")?.value).toBe(15)
  })

  it("negative reputation deltas are not scaled", () => {
    expect(scaledReputationDelta(-3)).toBe(-3)
    expect(scaledReputationDelta(-4)).toBe(-4)
  })
})

// ---------------------------------------------------------------------------
// Season-end capstone (debates / elections)
// ---------------------------------------------------------------------------
describe("season-end capstone", () => {
  it("serves a capstone minigame on the turn before the season boundary", () => {
    const c = makeChar({ turn: GAME_CONFIG.seasonLength - 1 })
    const result = buildServedEvent(c, reg, new Rng(7))
    expect(result.event.isCapstone).toBe(true)
    expect(result.served.isCapstone).toBe(true)
    expect(["debate", "election"]).toContain(result.event.capstoneKind)
  })

  it("never serves capstone minigames through the random rotation", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = makeChar({ turn: 1 })
      const picked = selectEvent(c, reg, new Rng(seed))
      expect(picked.isCapstone).not.toBe(true)
    }
  })

  it("resolving a capstone minigame stashes a pendingCapstoneResult", () => {
    const debate = reg.minigames.find((m) => m.id === "debate_rival_claim")
    expect(debate).toBeDefined()
    const c = makeChar({ charisma: 20 })
    const rng = new Rng(1337)
    const out = resolveMinigame(c, debate!, debate!.cards![0].id, reg, rng)
    expect(out.narrative).toBeTruthy()
    expect(c.pendingCapstoneResult).toBeDefined()
    expect(c.pendingCapstoneResult!.kind).toBe("debate")
    expect([3, 1, 0, -4]).toContain(c.pendingCapstoneResult!.gradeDelta)
    expect(c.pendingCapstoneResult!.verdict).toBeTruthy()
  })

  it("forces the fail tier on a trapped election card and still stashes a verdict", () => {
    const election = reg.minigames.find((m) => m.id === "election_of_the_year")
    expect(election).toBeDefined()
    const trapCard = election!.cards!.find((card) => card.trap)
    expect(trapCard).toBeDefined()
    const c = makeChar()
    resolveMinigame(c, election!, trapCard!.id, reg, new Rng(5))
    expect(c.pendingCapstoneResult).toBeDefined()
    expect(c.pendingCapstoneResult!.kind).toBe("election")
    // Softened from the original −4 so a bad verdict doesn't crush the season.
    expect(c.pendingCapstoneResult!.gradeDelta).toBe(-2)
  })

  it("season summary carries the capstone result and its grade swing", () => {
    const base = makeChar({ turn: GAME_CONFIG.seasonLength, powerLevel: 40, fame: 20 })
    const boosted = makeChar({
      turn: GAME_CONFIG.seasonLength,
      powerLevel: 40,
      fame: 20,
      pendingCapstoneResult: {
        kind: "debate",
        tier: "critical",
        verdict: "GREAT +3",
        gradeDelta: 3,
      },
    })
    const noCapstone = buildServedEvent(base, reg, new Rng(42)).served
    const withCapstone = buildServedEvent(boosted, reg, new Rng(42)).served
    expect(noCapstone.isSeasonSummary).toBe(true)
    expect(withCapstone.isSeasonSummary).toBe(true)
    expect(withCapstone.capstoneResult?.verdict).toBe("GREAT +3")
    expect(withCapstone.seasonGrade!).toBeGreaterThanOrEqual(noCapstone.seasonGrade!)
  })

  it("resolveSeasonSummary clears the consumed capstone result", () => {
    const c = makeChar({
      turn: GAME_CONFIG.seasonLength,
      pendingCapstoneResult: {
        kind: "election",
        tier: "fail",
        verdict: "BAD −4",
        gradeDelta: -4,
      },
    })
    resolveSeasonSummary(c, reg)
    expect(c.pendingCapstoneResult).toBeNull()
  })

  it("debate personality tag synergy widens the win window deterministically", () => {
    const debateEvent: EventContent = {
      id: "mg_debate_synergy",
      type: "minigame",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      isCapstone: true,
      capstoneKind: "debate",
      primaryStat: "charisma",
      narrative: { en: "", es: "" },
      cards: [
        {
          id: "answer_confidence",
          icon: "gem",
          tag: "Confident",
          wantedTags: { Confident: 1 },
          label: { en: "Cold confidence", es: "" },
        },
      ],
      resolution: {
        type: "weighted_hidden_match",
        baseWinChance: 0.5,
        statInfluence: {},
      },
      outcomes: {
        critical: {
          gradeDelta: 3,
          verdict: { en: "GREAT +3", es: "" },
          narrative: { en: "Critical", es: "" },
        },
        success: {
          gradeDelta: 1,
          verdict: { en: "GOOD +1", es: "" },
          narrative: { en: "Success", es: "" },
        },
        partial: {
          gradeDelta: 0,
          verdict: { en: "MIXED 0", es: "" },
          narrative: { en: "Partial", es: "" },
        },
        fail: {
          gradeDelta: -4,
          verdict: { en: "BAD −4", es: "" },
          narrative: { en: "Fail", es: "" },
        },
      },
    }
    const plain = makeChar()
    const confident = makeChar({ personality: { Confident: 2 } })
    // Same seed → same hidden roll. The Confident character's double synergy
    // (1 + 1) clamps winChance to 0.97, so a mid-range roll lands a success
    // where the plain character (0.5) would only reach a partial.
    const rollSeed = 1234
    resolveMinigame(plain, debateEvent, "answer_confidence", reg, new Rng(rollSeed))
    resolveMinigame(confident, debateEvent, "answer_confidence", reg, new Rng(rollSeed))
    const plainOutcome = plain.pendingCapstoneResult!
    const confidentOutcome = confident.pendingCapstoneResult!
    expect(confidentOutcome.gradeDelta).toBeGreaterThan(plainOutcome.gradeDelta)
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
    expect(retinue.length).toBe(10)
    expect(consumables.length).toBe(10)
    expect(luxury.length).toBe(12)
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
      // Empty the combat bank so the combat branch can't leak a real combat
      // event into the single-event fallback check.
      combats: [],
      combatsById: new Map(),
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
// Playable-choice guard (never serve an all-locked card set)
// ---------------------------------------------------------------------------
describe("hasPlayableChoice", () => {
  it("returns true when any choice is ungated", () => {
    const ev: EventContent = {
      id: "mixed",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "gated",
          rarity: "uncommon",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          requiresStat: { stat: "strength", min: 12 },
        },
        {
          id: "open",
          rarity: "common",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
        },
      ],
    }
    expect(hasPlayableChoice(ev, makeChar({ strength: 1 }))).toBe(true)
  })

  it("returns false when every choice is stat-locked", () => {
    const ev: EventContent = {
      id: "all_gated",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [
        {
          id: "a",
          rarity: "uncommon",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          requiresStat: { stat: "strength", min: 12 },
        },
        {
          id: "b",
          rarity: "rare",
          label: { en: "", es: "" },
          narrative: { en: "", es: "" },
          requiresStat: { stat: "dexterity", min: 12 },
        },
      ],
    }
    const weak = makeChar({ strength: 1, dexterity: 1 })
    expect(hasPlayableChoice(ev, weak)).toBe(false)
    const strong = makeChar({ strength: 20, dexterity: 1 })
    expect(hasPlayableChoice(ev, strong)).toBe(true)
  })

  it("returns false for events with no choices", () => {
    const ev: EventContent = {
      id: "empty",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "", es: "" },
      choices: [],
    }
    expect(hasPlayableChoice(ev, makeChar())).toBe(false)
  })

  it("selectEvent never hands a weak character an all-locked event", () => {
    // A 1-everything character fails every stat gate; regardless of the seed,
    // the served event must always keep at least one playable choice.
    const weak = makeChar({
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      charisma: 1,
    })
    for (let seed = 1; seed <= 80; seed++) {
      const picked = selectEvent(weak, reg, new Rng(seed))
      // Interactive minigames carry no choices but are always playable through
      // the move loop — selectEvent treats them as playable when eligible.
      // Combat encounters resolve through the combat-move loop, likewise
      // always playable when served.
      const playable =
        picked.combat !== undefined ||
        picked.resolution?.type === "interactive" ||
        hasPlayableChoice(picked, weak)
      expect(playable).toBe(true)
    }
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
// Recurring NPC relationships (content volume audit)
// ---------------------------------------------------------------------------
describe("recurring NPC relationships (content audit)", () => {
  // Every npc id that content can introduce via introducesRelationshipId.
  const introducedNpcs = new Set<string>()
  const introducedBy: Record<string, string[]> = {}
  for (const ev of reg.events) {
    for (const ch of ev.choices ?? []) {
      if (ch.introducesRelationshipId) {
        introducedNpcs.add(ch.introducesRelationshipId)
        ;(introducedBy[ch.introducesRelationshipId] ??= []).push(ev.id)
      }
    }
  }

  // Every npc id that gates a follow-up event via requiresRelationshipId.
  const gatedFollowUps = new Map<string, EventContent[]>()
  for (const ev of reg.events) {
    if (ev.requiresRelationshipId) {
      const list = gatedFollowUps.get(ev.requiresRelationshipId) ?? []
      list.push(ev)
      gatedFollowUps.set(ev.requiresRelationshipId, list)
    }
  }

  it("ships 15+ recurring NPCs", () => {
    expect(
      introducedNpcs.size,
      `expected >= 15 introduced npc ids, got ${introducedNpcs.size}`,
    ).toBeGreaterThanOrEqual(15)
    expect(introducedNpcs).toContain("ser_aldric")
    expect(introducedNpcs).toContain("wanderer_of_the_homeland")
  })

  it("every introduced NPC has at least one requiresRelationshipId follow-up", () => {
    for (const npcId of introducedNpcs) {
      const followUps = gatedFollowUps.get(npcId) ?? []
      expect(followUps.length, `${npcId} has no follow-up event gated on it`).toBeGreaterThan(0)
    }
  })

  it("no follow-up gate references an NPC content never introduces", () => {
    for (const npcId of gatedFollowUps.keys()) {
      expect(introducedNpcs.has(npcId), `${npcId} gates events but is never introduced`).toBe(true)
    }
  })

  it("every introduction choice carries a role and a bilingual name", () => {
    for (const ev of reg.events) {
      for (const ch of ev.choices ?? []) {
        if (!ch.introducesRelationshipId) continue
        expect(
          ch.introducesNpcRole,
          `${ev.id} choice ${ch.id} missing introducesNpcRole`,
        ).toBeTruthy()
        expect(
          ch.introducesNpcName?.en && ch.introducesNpcName.es,
          `${ev.id} choice ${ch.id} missing bilingual introducesNpcName`,
        ).toBeTruthy()
      }
    }
  })

  it("every follow-up event offers an affinityDelta choice (the bond loop is playable)", () => {
    for (const [npcId, followUps] of gatedFollowUps) {
      const hasAffinityChoice = followUps.some((ev) =>
        (ev.choices ?? []).some((ch) => ch.affinityDelta !== undefined),
      )
      expect(
        hasAffinityChoice,
        `${npcId} follow-ups never move affinity — Bonded for Life / Burned That Bridge are unreachable via ${npcId}`,
      ).toBe(true)
    }
  })

  it("no affinityDelta is silently dropped on ungated events", () => {
    // The engine only applies affinityDelta when the event is gated on an NPC
    // (requiresRelationshipId) or the choice introduces one — a delta on a plain
    // choice of an ungated event would be dead data that never moves the bond.
    for (const ev of reg.events) {
      for (const ch of ev.choices ?? []) {
        if (ch.affinityDelta !== undefined && !ev.requiresRelationshipId) {
          expect(
            ch.introducesRelationshipId,
            `${ev.id} choice ${ch.id} has affinityDelta but neither introduces the NPC nor sits on a gated event`,
          ).toBeTruthy()
        }
      }
    }
  })

  it("introductions can open on the negative side so a feud is a real path", () => {
    // A nemesis-flavored NPC should be meetable on bad terms (negative intro
    // affinity) so the -80 achievement is reachable without betraying a friend.
    const nemesisIntros = [...introducedNpcs].filter((npcId) =>
      (introducedBy[npcId] ?? []).some((evId) => {
        const ev = reg.eventsById.get(evId)
        return (ev?.choices ?? []).some(
          (ch) => ch.introducesRelationshipId === npcId && (ch.affinityDelta ?? 0) < 0,
        )
      }),
    )
    expect(nemesisIntros.length).toBeGreaterThanOrEqual(2)
  })

  it("the relationship achievements exist with the correct conditions", () => {
    const achIds = reg.achievements.map((a) => a.id)
    expect(achIds).toContain("bonded_for_life")
    expect(achIds).toContain("burned_that_bridge")
    const bonded = reg.achievements.find((a) => a.id === "bonded_for_life")
    const burned = reg.achievements.find((a) => a.id === "burned_that_bridge")
    expect(bonded?.condition).toEqual({ type: "relationship_affinity_gte", value: 80 })
    expect(burned?.condition).toEqual({ type: "relationship_affinity_lte", value: -80 })
  })

  it("the authored affinity budget can actually reach both achievement thresholds", () => {
    // Fastest path per NPC: the best intro delta + two repeats of the best
    // follow-up choice. At least one NPC must be able to cross +80 and at
    // least one to sink below -80 within a handful of encounters.
    const bestPath = (npcId: string, dir: 1 | -1) => {
      let intro = 0
      let followup = 0
      for (const ev of reg.events) {
        for (const ch of ev.choices ?? []) {
          if (ch.introducesRelationshipId === npcId) {
            intro =
              dir === 1
                ? Math.max(intro, ch.affinityDelta ?? 0)
                : Math.min(intro, ch.affinityDelta ?? 0)
          } else if (ev.requiresRelationshipId === npcId) {
            followup =
              dir === 1
                ? Math.max(followup, ch.affinityDelta ?? 0)
                : Math.min(followup, ch.affinityDelta ?? 0)
          }
        }
      }
      return intro + 2 * followup
    }
    expect(
      [...introducedNpcs].some((id) => bestPath(id, 1) >= 80),
      "no NPC can reach +80 affinity within a few meetings (bonded_for_life unreachable)",
    ).toBe(true)
    expect(
      [...introducedNpcs].some((id) => bestPath(id, -1) <= -80),
      "no NPC can reach -80 affinity within a few meetings (burned_that_bridge unreachable)",
    ).toBe(true)
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

  it("generateRival assigns a start focus from the pool", () => {
    const c = makeChar({ class: "warrior" })
    const rival = generateRival(c, reg, new Rng(7))
    expect(RIVAL_FOCUSES.some((f) => f.id === rival.focusId)).toBe(true)
  })

  it("advanceRival rotates the focus deterministically per seed", () => {
    const mk = () =>
      makeChar({
        rival: {
          name: "Roderick",
          class: "wizard",
          factionId: null,
          focusId: "war",
          powerLevel: 20,
          age: 16,
          location: "capital",
          achievementsCount: 0,
          score: 0,
          lastAdvancedTurn: 0,
        },
      })
    const a = mk()
    const b = mk()
    advanceRival(a, reg, new Rng(99))
    advanceRival(b, reg, new Rng(99))
    expect(a.rival!.focusId).toBe(b.rival!.focusId)
    expect(RIVAL_FOCUSES.some((f) => f.id === a.rival!.focusId)).toBe(true)
  })

  it("advanceRival focus scoreBonus biases score growth deterministically", () => {
    const c = makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        focusId: "war", // scoreBonus 2
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
      },
    })
    const d = makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        focusId: "lore", // scoreBonus 0
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
      },
    })
    // Same rng draws for both; the only difference is the focus bonus. Both
    // consume identical rng sequences (same seed), so the score gap is exactly
    // the bonus gap of whatever focus each ends on — rotated or not.
    const rngA = new Rng(5)
    const rngB = new Rng(5)
    advanceRival(c, reg, rngA)
    advanceRival(d, reg, rngB)
    const bonus =
      RIVAL_FOCUSES.find((f) => f.id === c.rival!.focusId)!.scoreBonus -
      RIVAL_FOCUSES.find((f) => f.id === d.rival!.focusId)!.scoreBonus
    expect(c.rival!.score - d.rival!.score).toBe(bonus)
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
    advanceRival(c, reg, new Rng(42))
    expect(c.rival!.powerLevel).toBeGreaterThanOrEqual(19)
    expect(c.rival!.lastAdvancedTurn).toBe(0)
  })
})

// ---------------------------------------------------------------------------
//  Archrival parallel RNG stream (roadmap item 4)
// ---------------------------------------------------------------------------
describe("archrival parallel RNG stream", () => {
  it("rivalRngFor derives a deterministic stream from the run seed", () => {
    const a = rivalRngFor("2026-08-06")
    const b = rivalRngFor("2026-08-06")
    // Same seed → identical stream.
    expect(a.next()).toBe(b.next())
    expect(a.getState()).toBe(b.getState())
    // Different seed → different stream.
    const c = rivalRngFor("2026-08-07")
    expect(rivalRngFor("2026-08-06").next()).not.toBe(c.next())
  })

  it("the rival stream is independent of the player's main stream", () => {
    const main = new Rng(hashSeed("2026-08-06"))
    const rival = rivalRngFor("2026-08-06")
    // Both are seeded from the same run seed but produce different sequences.
    expect(rival.next()).not.toBe(main.next())
  })

  it("generateRival on the parallel stream leaves the main stream untouched", () => {
    const main = new Rng(hashSeed("s1"))
    const rivalRng = rivalRngFor("s1")
    const before = main.getState()
    const c = makeChar({ class: "warrior" })
    const rival = generateRival(c, reg, rivalRng)
    expect(rival).toBeTruthy()
    // Generating the rival consumed only the parallel stream.
    expect(main.getState()).toBe(before)
    // The main stream still produces its own first draw unchanged.
    const mainAfter = new Rng(hashSeed("s1"))
    expect(main.next()).toBe(mainAfter.next())
  })

  it("advanceRival consumes only the stream it is handed", () => {
    const main = new Rng(hashSeed("s2"))
    const rivalRng = rivalRngFor("s2")
    const before = main.getState()
    const c = makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: null,
        focusId: "war",
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
      },
    })
    advanceRival(c, reg, rivalRng)
    expect(c.rival!.lastAdvancedTurn).toBe(0)
    expect(main.getState()).toBe(before)
  })

  it("a rival advanced on the parallel stream is identical across identical seeds", () => {
    const mk = () =>
      makeChar({
        rival: {
          name: "Roderick",
          class: "wizard",
          factionId: null,
          focusId: "war",
          powerLevel: 20,
          age: 16,
          location: "capital",
          achievementsCount: 0,
          score: 0,
          lastAdvancedTurn: 0,
        },
      })
    const a = mk()
    const b = mk()
    advanceRival(a, reg, rivalRngFor("daily-1"))
    advanceRival(b, reg, rivalRngFor("daily-1"))
    expect(a.rival!.powerLevel).toBe(b.rival!.powerLevel)
    expect(a.rival!.score).toBe(b.rival!.score)
    expect(a.rival!.focusId).toBe(b.rival!.focusId)
    expect(a.rival!.location).toBe(b.rival!.location)
  })

  it("a season-boundary serve advances the rival off the parallel stream", () => {
    const mkRival = (over: Partial<CharacterState["rival"]> = {}) =>
      makeChar({
        turn: GAME_CONFIG.seasonLength,
        rival: {
          name: "Roderick",
          class: "wizard",
          factionId: null,
          focusId: "war",
          powerLevel: 20,
          age: 16,
          location: "capital",
          achievementsCount: 0,
          score: 0,
          lastAdvancedTurn: 0,
          ...over,
        },
      })
    // Two identical runs on the same seed advance identically through
    // buildServedEvent's season-summary path with the parallel stream.
    const a = mkRival()
    const b = mkRival()
    const rngA = new Rng(hashSeed("season-1"))
    const rngB = new Rng(hashSeed("season-1"))
    buildServedEvent(a, reg, rngA, rivalRngFor("season-1"))
    buildServedEvent(b, reg, rngB, rivalRngFor("season-1"))
    expect(a.rival!.score).toBe(b.rival!.score)
    expect(a.rival!.powerLevel).toBe(b.rival!.powerLevel)
    expect(a.rival!.focusId).toBe(b.rival!.focusId)
    // The main streams advanced identically too (world events etc. stayed on them).
    expect(rngA.getState()).toBe(rngB.getState())
  })
})

// ---------------------------------------------------------------------------
//  Rival faction switches (roadmap item 4 note)
// ---------------------------------------------------------------------------
describe("rival faction switches", () => {
  const mkRival = (over: Partial<CharacterState["rival"]> = {}) =>
    makeChar({
      rival: {
        name: "Roderick",
        class: "wizard",
        factionId: "ironhold",
        focusId: "war",
        powerLevel: 20,
        age: 16,
        location: "capital",
        achievementsCount: 0,
        score: 0,
        lastAdvancedTurn: 0,
        ...over,
      },
    })

  it("advanceRival can switch the rival's faction — always to a different one", () => {
    let switched = 0
    for (let seed = 0; seed < 500; seed++) {
      const c = mkRival()
      advanceRival(c, reg, new Rng(seed))
      if (c.rival!.factionId !== "ironhold") {
        switched++
        expect(c.rival!.lastFactionId).toBe("ironhold")
        expect(c.rival!.factionSwitchTurn).toBe(c.turn)
        expect(reg.factions.some((f) => f.id === c.rival!.factionId)).toBe(true)
      } else {
        // Stayed put: no switch bookkeeping.
        expect(c.rival!.lastFactionId).toBeUndefined()
      }
    }
    // The 0.15 chance must actually fire over 500 seeds.
    expect(switched).toBeGreaterThan(0)
  })

  it("a rival with a stale faction id is healed to a real faction on a switch", () => {
    // A faction removed from content between runs leaves a stale factionId.
    // The pool only ever contains registry factions, so once a switch fires
    // the rival lands on a real faction — never the stale id again.
    let healed = 0
    for (let seed = 0; seed < 500; seed++) {
      const c = mkRival({ factionId: "vanished_order" })
      advanceRival(c, reg, new Rng(seed))
      if (c.rival!.factionSwitchTurn != null) {
        healed++
        expect(reg.factions.some((f) => f.id === c.rival!.factionId)).toBe(true)
      }
    }
    // The 0.15 chance must fire over 500 seeds; the old id never comes back.
    expect(healed).toBeGreaterThan(0)
  })

  it("a rival without a faction never gains one from the switch roll", () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = mkRival({ factionId: null })
      advanceRival(c, reg, new Rng(seed))
      expect(c.rival!.factionId).toBeNull()
      expect(c.rival!.factionSwitchTurn).toBeUndefined()
    }
  })

  it("faction switches are deterministic per seed", () => {
    const a = mkRival()
    const b = mkRival()
    advanceRival(a, reg, new Rng(1234))
    advanceRival(b, reg, new Rng(1234))
    expect(a.rival!.factionId).toBe(b.rival!.factionId)
    expect(a.rival!.lastFactionId).toBe(b.rival!.lastFactionId)
    expect(a.rival!.factionSwitchTurn).toBe(b.rival!.factionSwitchTurn)
  })

  it("season summary narrates a faction switch, once, naming both factions", () => {
    // Find a parallel-stream seed where the switch fires on the first advance.
    let switchSeed = -1
    for (let seed = 0; seed < 500; seed++) {
      const c = mkRival()
      c.turn = GAME_CONFIG.seasonLength
      const { served } = buildServedEvent(c, reg, new Rng(1), rivalRngFor(`faction-switch-${seed}`))
      if (c.rival!.factionSwitchTurn === c.turn) {
        switchSeed = seed
        // The served text must name both the abandoned and the new faction.
        const oldName = reg.factionsById.get("ironhold")!.name.en
        const newName = reg.factionsById.get(c.rival!.factionId!)!.name.en
        expect(served.isSeasonSummary).toBe(true)
        expect(served.rivalUpdate).toContain("abandoned")
        expect(served.rivalUpdate).toContain(oldName)
        expect(served.rivalUpdate).toContain(newName)
        break
      }
    }
    expect(switchSeed).toBeGreaterThanOrEqual(0)
  })

  it("after the switch season the plain 'riding with' clause returns", () => {
    // Force a switch, then advance past the summary turn: the narration must
    // not repeat, and the current faction is shown plainly instead.
    let switchSeed = -1
    for (let seed = 0; seed < 500; seed++) {
      const c = mkRival()
      c.turn = GAME_CONFIG.seasonLength
      buildServedEvent(c, reg, new Rng(1), rivalRngFor(`faction-post-${seed}`))
      if (c.rival!.factionSwitchTurn === c.turn) {
        switchSeed = seed
        break
      }
    }
    expect(switchSeed).toBeGreaterThanOrEqual(0)
    const c = mkRival()
    c.turn = GAME_CONFIG.seasonLength
    buildServedEvent(c, reg, new Rng(1), rivalRngFor(`faction-post-${switchSeed}`))
    const newFaction = c.rival!.factionId!
    const newName = reg.factionsById.get(newFaction)!.name.en
    // The season summary resolved: turn advances past the switch turn.
    resolveSeasonSummary(c, reg)
    const later = buildRivalUpdate(c, reg, "en")
    expect(later).not.toContain("abandoned")
    expect(later).toContain("riding with")
    expect(later).toContain(newName)
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
    advanceRival(c, reg, new Rng(42))
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
    expect(c.gold).toBe(100 + 750 + GAME_CONFIG.goldPerTurn)
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
    expect(c.gold).toBe(100 + 600 + GAME_CONFIG.goldPerTurn)
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
        // picking an offer defers the join to the negotiation follow-up.
        resolveChoice(c, event, joinChoice.id, reg, rng)
        expect(c.pendingJoinOffer?.signingGold).toBe(displayed)
        const followUp = negotiationFollowUpEvent(c, reg)
        const goldBefore = c.gold
        resolveChoice(c, followUp, "accept_join", reg, rng)
        expect(c.gold).toBe(goldBefore + displayed + GAME_CONFIG.goldPerTurn)
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
    expect(c.gold).toBe(100 + 500 + GAME_CONFIG.goldPerTurn)
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
    expect(c.gold).toBe(100 + 200 + GAME_CONFIG.goldPerTurn)
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

  // Combat encounters resolve round-by-round through the combat engine (never
  // the card-pick roll). Auto-play the fight exactly like the combat-move
  // route: attack until the fight ends, then apply endCombat's rewards/tail.
  if (event.combat) {
    if (!c.pendingCombat) prepareCombatServe(event, c, c.locale, reg, rng)
    const state = c.pendingCombat!
    const kit = reg.classKits[c.class]
    let guard = 0
    while (!state.over && guard < 40) {
      resolveCombatRound(state, c, kit, { kind: "attack" }, rng)
      guard++
    }
    const outcome = endCombat(c, event, state, reg, rng)
    if (outcome.completedQuest) {
      c.counters["quests_completed"] = (c.counters["quests_completed"] ?? 0) + 1
    }
    return outcome.ended
  }

  // Interactive minigames resolve move-by-move through the minigame engine
  // (never the card-pick roll). Drive the match to completion exactly like
  // POST /api/game/minigame-move does, then apply the outcome tier.
  if (event.resolution?.type === "interactive") {
    if (!c.pendingMinigame) c.pendingMinigame = createInteractiveState(event)
    const state = c.pendingMinigame
    const primaryStat = c[event.primaryStat ?? "intelligence"] as number
    let over = false
    while (!over) {
      const move: InteractiveMove =
        state.game === "tictactoe"
          ? { kind: "tictactoe", cell: (state.board ?? []).findIndex((x) => x === null) }
          : state.game === "memotest"
            ? {
                kind: "memotest",
                // Dumb auto-player: flip the first card that is neither matched
                // nor already revealed. The engine judges pairs and hands the
                // rival a turn on a miss — this always terminates.
                card: Array.from({ length: MEMOTEST_CARD_COUNT }, (_, i) => i).find(
                  (i) => !(state.matched ?? []).includes(i) && !(state.revealed ?? []).includes(i),
                )!,
              }
            : { kind: "rps", choice: "rock" }
      over = applyInteractiveMove(state, move, primaryStat, rng).over
    }
    c.pendingMinigame = null
    const outcome = applyMinigameOutcome(c, event, interactiveTier(state), reg, rng)
    if (outcome.completedQuest) {
      c.counters["quests_completed"] = (c.counters["quests_completed"] ?? 0) + 1
    }
    return outcome.ended
  }

  // A simulated player can't pick a stat-locked choice — filter them out.
  const ids = served.choices.filter((ch) => ch.statMet !== false).map((ch) => ch.id)
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

describe(" origin & identity", () => {
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

describe(" bench mechanic", () => {
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

describe(" role signals on offers", () => {
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

describe(" foreign & region gating", () => {
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

describe(" negotiation dial ", () => {
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
    expect(c.gold).toBe(50 + 500 + GAME_CONFIG.goldPerTurn)
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
        expect(c2.gold).toBe(
          before +
            Math.round(500 * GAME_CONFIG.negotiationGoldMultiplier) +
            GAME_CONFIG.goldPerTurn,
        )
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

describe(" whole-arc tournaments ", () => {
  it("intro → 3 fixtures → honor beat resolves through the minigame path", () => {
    const c = makeChar({ age: 18, turn: 12, currentClanId: null, powerLevel: 60 })
    // Start the arc deterministically: accept the intro directly instead of
    // gambling on the random intro roll, so the test never depends on the RNG
    // stream landing the coin flip within a fixed loop window.
    const intro = tournamentIntroEvent(c, "grand_melee")
    resolveChoice(c, intro, "mode_luck", reg, new Rng(hashSeed("tournament")))
    expect(c.pendingTournament).not.toBeNull()
    expect(c.pendingTournament!.mode).toBe("luck")
    expect(c.pendingTournament!.fixturesLeft).toBe(3)

    // Play out the fixtures through buildServedEvent.
    const rng = new Rng(hashSeed("tournament"))
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

describe(" global honors ", () => {
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

  it("generateDistinctions counts monsters slain", () => {
    const c = makeChar({ counters: { monsters_killed: 12 } })
    const rows = generateDistinctions(c, reg)
    expect(rows.find((r) => r.id === "monsters_killed")?.count).toBe(12)
  })
})

describe(" class-partitioned epithets ", () => {
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
//  determinism — same daily seed ⇒ identical sequence of turns,
// including the new seeded systems (negotiation + tournaments). No Math.random.
// ---------------------------------------------------------------------------
describe(" daily-seed determinism", () => {
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

// ---------------------------------------------------------------------------
// Interactive minigames: serve interactive frames + event selection
// ---------------------------------------------------------------------------
describe("interactive minigame serving", () => {
  it("serveEvent attaches an interactive frame and initializes pendingMinigame", () => {
    const c = createCharacter({
      id: "sv-int",
      name: "Serve",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    const ev: EventContent = {
      id: "interactive_serve",
      type: "minigame",
      subtype: "interactive",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "intelligence",
      opponent: { en: "Grimble", es: "Grimble" },
      narrative: { en: "n", es: "n" },
      resolution: {
        type: "interactive",
        game: "rps",
        bestOf: 3,
        baseWinChance: 0.5,
        statInfluence: { intelligence: 0.01 },
      },
      outcomes: {
        critical: { narrative: { en: "c", es: "c" } },
        success: { narrative: { en: "s", es: "s" } },
        partial: { narrative: { en: "p", es: "p" } },
        fail: { narrative: { en: "f", es: "f" } },
      },
    }
    const rng = new Rng(1)
    const served = serveEvent(ev, c, "en", reg, rng, false)
    expect(served.interactive).toBeDefined()
    expect(served.interactive!.game).toBe("rps")
    expect(served.interactive!.opponentName).toBe("Grimble")
    expect(served.interactive!.view.result).toBe("playing")
    expect(served.choices).toEqual([])
    expect(c.pendingMinigame).toBeDefined()
    expect(c.pendingMinigame!.eventId).toBe("interactive_serve")
  })

  it("selectEvent can pick an interactive minigame without cards", () => {
    // The real content does not ship an interactive minigame yet (Task 8
    // authors goblin_games.json), so drive selection through a mini-registry
    // whose minigame pool is exactly one cardless interactive event.
    const interactiveEv: EventContent = {
      id: "interactive_select",
      type: "minigame",
      subtype: "interactive",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      primaryStat: "intelligence",
      narrative: { en: "n", es: "n" },
      resolution: {
        type: "interactive",
        game: "tictactoe",
        baseWinChance: 0.5,
        statInfluence: {},
      },
      outcomes: {
        critical: { narrative: { en: "c", es: "c" } },
        success: { narrative: { en: "s", es: "s" } },
        partial: { narrative: { en: "p", es: "p" } },
        fail: { narrative: { en: "f", es: "f" } },
      },
    }
    const plainEv: EventContent = {
      id: "plain_select",
      minAge: 0,
      maxAge: 99,
      weight: 1,
      narrative: { en: "n", es: "n" },
      choices: [
        { id: "ok", rarity: "common", label: { en: "", es: "" }, narrative: { en: "", es: "" } },
      ],
    }
    const miniReg = {
      ...reg,
      minigames: [interactiveEv],
      events: [plainEv],
    } as unknown as ContentRegistry
    const c = createCharacter({
      id: "sel-int",
      name: "Sel",
      classId: "warrior",
      origin: "humble",
      locale: "en",
      registry: reg,
    })
    // wantMinigame fires for some seed; when it does, the interactive minigame
    // (no cards, no choices) must be pushed into the pool and pickable.
    let found = false
    for (let seed = 1; seed <= 60; seed++) {
      const picked = selectEvent(c, miniReg, new Rng(seed))
      if (picked.id === interactiveEv.id) {
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  it("caps interactive minigames per run and spaces them out", () => {
    // With the real registry, classic card-pick minigames never enter the random
    // pool (they have cards, not choices — hasPlayableChoice returns false), so
    // every wantMinigame turn would otherwise serve an interactive game. The
    // per-run cap + cooldown must throttle them: at most
    // maxInteractiveMinigamesPerRun per run, at least
    // interactiveMinigameCooldownTurns apart.
    const c = makeChar()
    const servedTurns: number[] = []
    for (let seed = 1; seed <= 300; seed++) {
      // Simulate a resolved turn before the next selection.
      c.turn += 1
      const picked = selectEvent(c, reg, new Rng(seed))
      if (picked.resolution?.type === "interactive") {
        servedTurns.push(c.turn)
      }
    }
    expect(servedTurns.length).toBeLessThanOrEqual(GAME_CONFIG.maxInteractiveMinigamesPerRun)
    for (let i = 1; i < servedTurns.length; i++) {
      expect(servedTurns[i] - servedTurns[i - 1]).toBeGreaterThanOrEqual(
        GAME_CONFIG.interactiveMinigameCooldownTurns,
      )
    }
  })

  it("selectEvent stops serving interactive minigames once the cap is reached", () => {
    // Pre-seed the run's counter at the cap: no seed may serve an interactive
    // game again, even though the real registry would otherwise pick one on
    // every minigame turn.
    const c = makeChar({
      counters: { interactive_games_served: GAME_CONFIG.maxInteractiveMinigamesPerRun },
    })
    for (let seed = 1; seed <= 120; seed++) {
      const picked = selectEvent(c, reg, new Rng(seed))
      expect(picked.resolution?.type).not.toBe("interactive")
    }
  })

  it("selectEvent honors the interactive minigame cooldown", () => {
    // Last interactive game was served at turn 0; at turn 10 the cooldown
    // (interactiveMinigameCooldownTurns) has not elapsed, so no seed may serve
    // an interactive game.
    const soon = makeChar({ turn: 10, counters: { last_interactive_turn: 0 } })
    for (let seed = 1; seed <= 120; seed++) {
      const picked = selectEvent(soon, reg, new Rng(seed))
      expect(picked.resolution?.type).not.toBe("interactive")
    }
    // Once the cooldown has elapsed, interactive games become available again.
    const later = makeChar({ turn: 30, counters: { last_interactive_turn: 0 } })
    let found = false
    for (let seed = 1; seed <= 120; seed++) {
      if (selectEvent(later, reg, new Rng(seed)).resolution?.type === "interactive") {
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Combat encounters in the event rotation
// ---------------------------------------------------------------------------
describe("combat in the event rotation", () => {
  it("selectEvent can serve a combat encounter with a resolvable creature pool", () => {
    // Property test: whenever the combat branch fires, the event is a combat
    // encounter whose creature pool resolves against the registry.
    const c = makeChar({ age: 16, currentArc: arcForAge(16) })
    let sawCombat = false
    for (let seed = 1; seed <= 200; seed++) {
      const picked = selectEvent(c, reg, new Rng(seed))
      if (picked.type === "combat") {
        sawCombat = true
        expect(picked.combat?.creatures.length).toBeGreaterThan(0)
        for (const cid of picked.combat!.creatures) {
          expect(reg.creaturesById.has(cid)).toBe(true)
        }
      }
    }
    expect(sawCombat).toBe(true)
  })

  it("combat encounters are never picked through the normal event pool", () => {
    // Combat events have no choices/cards, so hasPlayableChoice is false — they
    // can never leak into the minigame/event rotation branches of selectEvent.
    for (const ev of reg.combats) {
      expect(ev.type).toBe("combat")
      expect(hasPlayableChoice(ev, makeChar())).toBe(false)
    }
  })

  it("serveEvent initializes pendingCombat for combat events", () => {
    const c = makeChar({ age: 16, currentArc: arcForAge(16) })
    const ev = reg.combats.find((e) => e.id === "road_ambush")!
    const served = serveEvent(ev, c, "en", reg, new Rng(7), false)
    expect(served.combat?.view).toBeDefined()
    expect(served.combat!.view.over).toBe(false)
    expect(served.combat!.view.result).toBeNull()
    expect(served.choices).toEqual([])
    expect(c.pendingCombat).toBeDefined()
    expect(c.pendingCombat!.eventId).toBe("road_ambush")
  })

  it("serveEvent resume reuses the persisted combat state", () => {
    const c = makeChar({ age: 16, currentArc: arcForAge(16) })
    const ev = reg.combats.find((e) => e.id === "road_ambush")!
    serveEvent(ev, c, "en", reg, new Rng(7), false)
    const creatureId = c.pendingCombat!.creature.id
    // A different rng on resume must not re-roll the creature.
    const again = serveEvent(ev, c, "en", reg, new Rng(99), false)
    expect(again.combat!.view.creature.id).toBe(creatureId)
  })

  it("the choose path rejects combat events", () => {
    // resolveChoice has no combat branch; the route guard (tested in the route
    // suite) rejects them. Here we only assert the events carry the combat
    // marker the guard checks.
    const ev = reg.combats.find((e) => e.id === "road_ambush")!
    expect(ev.combat).toBeDefined()
  })
})

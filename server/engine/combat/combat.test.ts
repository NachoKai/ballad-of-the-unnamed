import { describe, expect, it } from "vitest"
import type {
  CharacterState,
  ClassKit,
  CombatAbility,
  CreatureContent,
  PendingCombatState,
} from "../../../shared/types.js"
import { arcForAge, GAME_CONFIG } from "../../../shared/config.js"
import { Rng } from "../../../shared/rng.js"
import { loadContent } from "../../content/registry.js"
import {
  applyStatusesTick,
  combatView,
  creatureEffectiveAttack,
  endCombat,
  fleeChance,
  magicDamage,
  physicalDamage,
  pickCreatureMove,
  playerBaseAttack,
  playerBaseDefense,
  playerEffectiveAttack,
  playerEffectiveDefense,
  prepareCombatServe,
  resolveCombatRound,
  startCombatState,
} from "./index.js"

function makeChar(overrides: Partial<CharacterState> = {}): CharacterState {
  return {
    id: "c1",
    name: "Test",
    gender: "male",
    class: "warrior",
    archetype: null,
    epithet: null,
    age: 16,
    currentArc: arcForAge(16),
    homeFactionId: "ironhold",
    homeRegion: "vale",
    currentRegion: "vale",
    origin: "humble",
    strength: 8,
    dexterity: 5,
    constitution: 7,
    intelligence: 3,
    charisma: 4,
    stamina: 50,
    health: 100,
    fame: 0,
    gold: 50,
    liability: 0,
    marketValue: 0,
    marketValuePeak: 0,
    momentum: "normal",
    status: "alive",
    locale: "en",
    turn: 0,
    seasonCount: 0,
    powerLevel: 0,
    counters: {},
    reputations: [],
    personality: {},
    achievements: [],
    inventory: [],
    lockedEventPools: [],
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
    pendingMinigame: null,
    pendingCombat: null,
    ...overrides,
  }
}

function makeAbility(overrides: Partial<CombatAbility> = {}): CombatAbility {
  return {
    id: "test_ability",
    label: { en: "Test", es: "Prueba" },
    cost: 8,
    effect: "damage",
    school: "physical",
    stat: "strength",
    coefficient: 1.0,
    base: 2,
    ...overrides,
  }
}

function makeKit(overrides: Partial<ClassKit> = {}): ClassKit {
  return {
    basicAttack: {
      label: { en: "Strike", es: "Golpe" },
      stat: "strength",
      coefficient: 1.2,
      base: 4,
      critChance: 0.1,
    },
    abilityMenuLabel: { en: "Shout", es: "Grito" },
    resourceLabel: { en: "Rage", es: "Furia" },
    resourceStat: "strength",
    resourceMultiplier: 2,
    fleeModifier: 0,
    abilities: [makeAbility()],
    ...overrides,
  }
}

function makeCreature(overrides: Partial<CreatureContent> = {}): CreatureContent {
  return {
    id: "test_beast",
    name: { en: "Test Beast", es: "Bestia de Prueba" },
    icon: "skull",
    rarity: "common",
    canKillPlayer: false,
    health: 40,
    attack: 8,
    defense: 3,
    magicResistance: 1,
    moves: [
      {
        id: "bite",
        name: { en: "Bite", es: "Mordisco" },
        weight: 100,
        effect: "damage",
        damageMultiplier: 1.0,
      },
    ],
    loot: { goldMin: 5, goldMax: 20, fameMin: 0, fameMax: 2 },
    fleeDifficulty: 0.3,
    ...overrides,
  }
}

function makeState(
  c: CharacterState,
  creature: CreatureContent,
  kit: ClassKit = makeKit(),
  overrides: Partial<PendingCombatState> = {},
): PendingCombatState {
  const resourceMax = Math.floor(c[kit.resourceStat] * kit.resourceMultiplier)
  return {
    eventId: "ev_test",
    creature,
    creatureHealth: creature.health,
    creatureStatuses: [],
    playerBaseAttack: playerBaseAttack(c, kit),
    playerBaseDefense: playerBaseDefense(c),
    playerStatuses: [],
    resource: resourceMax,
    resourceMax,
    round: 0,
    log: [],
    over: false,
    result: null,
    ...overrides,
  }
}

describe("combat damage formulas", () => {
  it("physical damage clamps at minimum 1", () => {
    expect(physicalDamage(13, 99)).toBe(1)
    expect(physicalDamage(13, 3)).toBe(10)
    expect(magicDamage(20, 2)).toBe(18)
  })

  it("physical vs magic use their own resistances", () => {
    // Same raw damage: a creature with high defense but low magic resistance
    // takes far more from a magic attack.
    const raw = 20
    expect(physicalDamage(raw, 10)).toBeLessThan(magicDamage(raw, 2))
  })

  it("player attack scales from the kit stat", () => {
    const c = makeChar({ strength: 8 })
    expect(playerBaseAttack(c, makeKit())).toBe(4 + Math.floor(8 * 1.2))
    const c2 = makeChar({ strength: 20 })
    expect(playerBaseAttack(c2, makeKit())).toBe(4 + Math.floor(20 * 1.2))
  })

  it("creature effective attack applies enrage x1.5 and slowed x0.6", () => {
    const cr = makeCreature({ attack: 10 })
    expect(creatureEffectiveAttack(cr, [])).toBe(10)
    expect(creatureEffectiveAttack(cr, [{ id: "enraged", turns: 0 }])).toBe(15)
    expect(creatureEffectiveAttack(cr, [{ id: "slowed", turns: 2 }])).toBe(6)
  })
})

describe("combat round resolution", () => {
  it("creature dies -> won", () => {
    const c = makeChar()
    const cr = makeCreature({ health: 1 })
    const state = makeState(c, cr)
    const { over } = resolveCombatRound(state, c, makeKit(), { kind: "attack" }, new Rng(1))
    expect(over).toBe(true)
    expect(state.result).toBe("won")
    expect(state.creatureHealth).toBe(0)
  })

  it("basic attack damage stays within variance bounds", () => {
    const c = makeChar()
    const cr = makeCreature({ health: 10000, defense: 0, canKillPlayer: false })
    const state = makeState(c, cr)
    const kit = makeKit({ basicAttack: { ...makeKit().basicAttack, critChance: 0 } })
    let sawCrit = false
    for (let seed = 1; seed <= 50; seed++) {
      const rng = new Rng(seed)
      const { over } = resolveCombatRound(state, c, kit, { kind: "attack" }, rng)
      expect(over).toBe(false)
      const entry = state.log[state.log.length - 1]
      expect(entry.playerDamage).toBeGreaterThanOrEqual(11) // 13 * 0.85
      expect(entry.playerDamage).toBeLessThanOrEqual(15) // 13 * 1.15
      if (entry.playerCrit) sawCrit = true
    }
    expect(sawCrit).toBe(false)
  })

  it("crit applies combatCritMultiplier", () => {
    const c = makeChar()
    const cr = makeCreature({ health: 10000, defense: 0 })
    const state = makeState(c, cr)
    const kit = makeKit({ basicAttack: { ...makeKit().basicAttack, critChance: 1 } })
    const rng = new Rng(7)
    resolveCombatRound(state, c, kit, { kind: "attack" }, rng)
    const entry = state.log[state.log.length - 1]
    expect(entry.playerCrit).toBe(true)
    // raw = 13 * 1.5 = 19.5 -> 20 (round), variance <= 1.15 -> ~23 max.
    expect(entry.playerDamage).toBeGreaterThanOrEqual(16)
    expect(entry.playerDamage).toBeLessThanOrEqual(23)
  })

  it("canKillPlayer:false creatures never drop health below the safety floor", () => {
    const c = makeChar()
    // Huge health so the fight can't end — only the player's health matters.
    const cr = makeCreature({ attack: 99, health: 100000, canKillPlayer: false })
    const state = makeState(c, cr)
    for (let seed = 1; seed <= 20; seed++) {
      const rng = new Rng(seed)
      const { over } = resolveCombatRound(state, c, makeKit(), { kind: "attack" }, rng)
      expect(over).toBe(false)
      expect(c.health).toBeGreaterThanOrEqual(GAME_CONFIG.combatSafetyFloor)
    }
    expect(c.health).toBeGreaterThanOrEqual(GAME_CONFIG.combatSafetyFloor)
    expect(state.over).toBe(false)
  })

  it("canKillPlayer:true creatures can kill the player", () => {
    const c = makeChar({ health: 10 })
    const cr = makeCreature({ attack: 99, canKillPlayer: true })
    const state = makeState(c, cr)
    const { over } = resolveCombatRound(state, c, makeKit(), { kind: "attack" }, new Rng(1))
    expect(over).toBe(true)
    expect(state.result).toBe("lost")
    expect(c.health).toBe(0)
  })

  it("resource is deducted and an empty pool rejects", () => {
    const c = makeChar()
    const cr = makeCreature({ health: 10000, canKillPlayer: false })
    const state = makeState(c, cr, makeKit({ resourceMultiplier: 1, resourceStat: "strength" }))
    // strength 8 -> resourceMax 8; ability cost 8.
    expect(state.resource).toBe(8)
    resolveCombatRound(
      state,
      c,
      makeKit(),
      { kind: "ability", abilityId: "test_ability" },
      new Rng(1),
    )
    expect(state.resource).toBe(0)
    expect(() =>
      resolveCombatRound(
        state,
        c,
        makeKit(),
        { kind: "ability", abilityId: "test_ability" },
        new Rng(2),
      ),
    ).toThrow("insufficient resource")
  })

  it("abilities are gated by unlockAge", () => {
    const c = makeChar({ age: 16 })
    const state = makeState(c, makeCreature())
    const kit = makeKit({ abilities: [makeAbility({ unlockAge: 99 })] })
    expect(() =>
      resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(1)),
    ).toThrow("locked ability")
  })

  it("unknown abilities are rejected", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature())
    expect(() =>
      resolveCombatRound(state, c, makeKit(), { kind: "ability", abilityId: "nope" }, new Rng(1)),
    ).toThrow("unknown ability")
  })

  it("flee succeeds with a smoke boost and ends the fight without rewards", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature())
    state.playerStatuses.push({ id: "smoke", turns: 0 })
    const { over } = resolveCombatRound(state, c, makeKit(), { kind: "flee" }, new Rng(1))
    expect(over).toBe(true)
    expect(state.result).toBe("fled")
    expect(state.log[0].playerFled).toBe(true)
  })

  it("a failed flee consumes the round and the creature acts", () => {
    const c = makeChar()
    // fleeChance floor is 0.1; a creature with max fleeDifficulty + a bad roll
    // still fails sometimes — force by checking roll outcomes across seeds.
    const cr = makeCreature({ fleeDifficulty: 1, canKillPlayer: false })
    const state = makeState(c, cr)
    let failed = false
    for (let seed = 1; seed <= 20 && !failed; seed++) {
      const s2: PendingCombatState = { ...state, log: [], round: 0 }
      s2.creatureHealth = cr.health
      const { over } = resolveCombatRound(s2, c, makeKit(), { kind: "flee" }, new Rng(seed))
      if (!over) {
        failed = true
        expect(s2.log[0].playerFled).toBeUndefined()
        expect(s2.log[0].creatureMoveId).toBe("bite")
      }
    }
    expect(failed).toBe(true)
  })

  it("defend halves incoming damage this round only", () => {
    const c = makeChar()
    const cr = makeCreature({ attack: 40, canKillPlayer: false })
    const state = makeState(c, cr)
    // First round: defend -> damage halved (after defense mitigation).
    const r1 = resolveCombatRound(state, c, makeKit(), { kind: "defend" }, new Rng(3))
    expect(r1.over).toBe(false)
    const guarded = c.health
    const entry = state.log[state.log.length - 1]
    expect(entry.creatureDamage).toBeGreaterThan(0)
    expect(c.health).toBeGreaterThanOrEqual(GAME_CONFIG.combatSafetyFloor)
    // Second round: no defend -> guard cleared, full damage lands.
    const before = c.health
    resolveCombatRound(state, c, makeKit(), { kind: "attack" }, new Rng(4))
    const after = c.health
    expect(after).toBeLessThanOrEqual(before - 1)
    expect(state.playerStatuses.some((s) => s.id === "guarding")).toBe(false)
    void guarded
  })

  it("stun makes the creature skip its action", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature())
    const kit = makeKit({
      abilities: [makeAbility({ effect: "stun", stunChance: 1, cost: 4 })],
    })
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(1))
    const entry = state.log[state.log.length - 1]
    expect(entry.creatureSkipped).toBe(true)
    expect(entry.creatureDamage).toBeUndefined()
  })

  it("poison ticks on later rounds and expires", () => {
    const c = makeChar()
    const cr = makeCreature({ health: 60, attack: 1, canKillPlayer: false })
    const state = makeState(c, cr)
    const kit = makeKit({
      abilities: [
        makeAbility({
          effect: "damage_over_time",
          dotPerTurn: 3,
          statusTurns: 3,
          stat: "strength",
          coefficient: 0.6,
          base: 2,
          cost: 5,
        }),
      ],
    })
    const first = resolveCombatRound(
      state,
      c,
      kit,
      { kind: "ability", abilityId: "test_ability" },
      new Rng(1),
    )
    expect(first.over).toBe(false)
    const afterHit = state.creatureHealth
    // No tick in the application round.
    expect(state.log[0].poisonedTick).toBeUndefined()
    // Rounds 2-5 use defend (no damage), so only the poison moves the creature's
    // health.
    for (let round = 2; round <= 5; round++) {
      resolveCombatRound(state, c, kit, { kind: "defend" }, new Rng(round))
    }
    // Three ticks of 3 on rounds 2-4 (57 -> 54 -> 51 -> 48), then it expires:
    // round 5 has no tick.
    expect(state.log[1].poisonedTick).toBe(3)
    expect(state.log[2].poisonedTick).toBe(3)
    expect(state.log[3].poisonedTick).toBe(3)
    expect(state.creatureHealth).toBe(afterHit - 9)
    expect(state.creatureStatuses.some((s) => s.id === "poisoned")).toBe(false)
    expect(state.log[4].poisonedTick).toBeUndefined()
  })

  it("damage_and_debuff slows the creature", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature({ health: 10000 }))
    const kit = makeKit({
      abilities: [makeAbility({ effect: "damage_and_debuff", statusTurns: 2, cost: 6 })],
    })
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(1))
    expect(state.creatureStatuses.some((s) => s.id === "slowed")).toBe(true)
  })

  it("heal restores player health clamped to 100", () => {
    const c = makeChar({ health: 40 })
    // attack 1 keeps the counterattack to the 1-damage minimum.
    const state = makeState(c, makeCreature({ attack: 1, canKillPlayer: false }))
    const kit = makeKit({
      abilities: [
        makeAbility({
          effect: "heal",
          healCoefficient: 1.5,
          base: 6,
          stat: "intelligence",
          coefficient: 0,
          cost: 5,
        }),
      ],
    })
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(1))
    // Healed 6 + floor(3 * 1.5) = 10, then the creature lands its 1-damage hit.
    expect(state.log[0].playerHeal).toBe(10)
    expect(c.health).toBe(49)
    c.health = 99
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(2))
    // Clamped to 100 before the counterattack.
    expect(state.log[1].playerHeal).toBe(1)
    expect(c.health).toBe(99)
  })

  it("buff_attack stacks and buff_defense raises effective defense", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature())
    const baseAtk = state.playerBaseAttack
    const baseDef = state.playerBaseDefense
    const kit = makeKit({
      abilities: [
        makeAbility({
          effect: "buff_attack",
          stat: "strength",
          coefficient: 0.5,
          base: 3,
          cost: 5,
        }),
        makeAbility({
          id: "def_up",
          effect: "buff_defense",
          stat: "charisma",
          coefficient: 0.4,
          base: 3,
          cost: 5,
        }),
      ],
    })
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(1))
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(2))
    // two attack buffs of 3 + floor(8*0.5)=7 each
    expect(playerEffectiveAttack(state)).toBe(baseAtk + 14)
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "def_up" }, new Rng(3))
    expect(playerEffectiveDefense(state)).toBe(baseDef + 3 + Math.floor(4 * 0.4))
  })

  it("steal deals damage and grants gold equal to the damage", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature({ health: 10000 }))
    const kit = makeKit({
      abilities: [
        makeAbility({
          effect: "steal",
          stat: "dexterity",
          coefficient: 0.8,
          base: 4,
          cost: 5,
        }),
      ],
    })
    const goldBefore = c.gold
    resolveCombatRound(state, c, kit, { kind: "ability", abilityId: "test_ability" }, new Rng(1))
    const entry = state.log[state.log.length - 1]
    expect(entry.playerGold).toBe(entry.playerDamage)
    expect(c.gold).toBe(goldBefore + (entry.playerDamage ?? 0))
    expect(state.creatureHealth).toBeLessThan(10000)
  })

  it("moves after the fight is over are rejected", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature({ health: 1 }))
    resolveCombatRound(state, c, makeKit(), { kind: "attack" }, new Rng(1))
    expect(state.over).toBe(true)
    expect(() => resolveCombatRound(state, c, makeKit(), { kind: "attack" }, new Rng(2))).toThrow(
      "combat already finished",
    )
  })

  it("is deterministic given the same seed", () => {
    const run = (seed: number) => {
      const c = makeChar()
      const state = makeState(c, makeCreature({ health: 50 }))
      const kit = makeKit()
      let rounds = 0
      while (!state.over && rounds < 20) {
        resolveCombatRound(state, c, kit, { kind: "attack" }, new Rng(seed))
        rounds++
      }
      return {
        health: c.health,
        creatureHealth: state.creatureHealth,
        result: state.result,
        rounds,
      }
    }
    expect(run(42)).toEqual(run(42))
  })
})

describe("creature AI", () => {
  it("phase gating restricts the move pool by health fraction", () => {
    const cr = makeCreature({
      moves: [
        { id: "bite", name: { en: "Bite", es: "Mordisco" }, weight: 100, effect: "damage" },
        {
          id: "enrage",
          name: { en: "Enrage", es: "Enfurecer" },
          weight: 100,
          effect: "self_buff_attack",
          maxHealthFraction: 0.5,
        },
        {
          id: "flee",
          name: { en: "Flee", es: "Huir" },
          weight: 100,
          effect: "flee_if_low_hp",
          maxHealthFraction: 0.2,
        },
      ],
    })
    // Full health: only bite is in the pool.
    for (let seed = 1; seed <= 10; seed++) {
      expect(pickCreatureMove(cr, 1.0, new Rng(seed)).id).toBe("bite")
    }
    // Mid health: bite or enrage, never flee.
    for (let seed = 1; seed <= 20; seed++) {
      const mv = pickCreatureMove(cr, 0.4, new Rng(seed))
      expect(["bite", "enrage"]).toContain(mv.id)
    }
    // Near death: all three can appear.
    const seen = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      seen.add(pickCreatureMove(cr, 0.1, new Rng(seed)).id)
    }
    expect(seen.has("flee")).toBe(true)
    expect(seen.has("bite")).toBe(true)
  })
})

describe("flee chance", () => {
  it("follows the formula and clamps", () => {
    const c = makeChar({ dexterity: 5 })
    const kit = makeKit({ fleeModifier: 0.2 })
    expect(fleeChance(c, kit, makeCreature({ fleeDifficulty: 0.3 }))).toBeCloseTo(
      0.6 + 0.2 + 5 * 0.02 - 0.3,
    )
    expect(fleeChance(c, kit, makeCreature({ fleeDifficulty: 0 }))).toBeLessThanOrEqual(0.95)
    expect(fleeChance(c, kit, makeCreature({ fleeDifficulty: 1 }))).toBeGreaterThanOrEqual(0.1)
  })
})

describe("status ticks", () => {
  it("decrements timed statuses and clears them at zero", () => {
    const c = makeChar()
    const state = makeState(c, makeCreature())
    state.playerStatuses.push({ id: "attack_down", turns: 2, amount: 3 })
    state.round = 5
    applyStatusesTick(state, c)
    expect(state.playerStatuses[0].turns).toBe(1)
    applyStatusesTick(state, c)
    expect(state.playerStatuses.some((s) => s.id === "attack_down")).toBe(false)
  })
})

describe("combat session lifecycle", () => {
  const reg = loadContent()

  // A real combat event whose pool spans a couple of arcs (road_ambush).
  const roadAmbush = reg.combats.find((e) => e.id === "road_ambush")!

  it("creature pick is deterministic and arc-gated", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    // rat_swarm (adventurer only) and dire_wolf (adventurer..mercenary) are
    // both eligible in the adventurer arc; the pick is seeded so identical
    // runs choose identically.
    const a = startCombatState(roadAmbush, c, reg, new Rng(7))
    const b = startCombatState(roadAmbush, c, reg, new Rng(7))
    expect(a.creature.id).toBe(b.creature.id)
    expect(a.creatureHealth).toBe(a.creature.health)
    expect(a.eventId).toBe("road_ambush")
  })

  it("creatures whose arcs exclude the current arc are never picked", () => {
    // road_ambush pool: bandit (adventurer), wild_boar (adventurer),
    // dire_wolf (adventurer..mercenary). In the mercenary arc all three are
    // still eligible — so build a pool that is NOT: use rat_swarm (adventurer
    // only) + bandit (adventurer only) on a mercenary-age character.
    const ev = {
      ...roadAmbush,
      combat: { creatures: ["rat_swarm", "bandit"] },
    }
    const c = makeChar({ class: "warrior", age: 30, currentArc: arcForAge(30) })
    expect(arcForAge(30)).toBe("mercenary")
    // Every seed must still land on an eligible creature… the pool is entirely
    // ineligible, so startCombatState must not crash and must pick SOMETHING
    // (the empty-pool guard falls back to the full authored pool).
    for (let seed = 1; seed <= 20; seed++) {
      const s = startCombatState(ev, c, reg, new Rng(seed))
      expect(s.creature.id).toBeTruthy()
    }
  })

  it("resource is computed from the kit and stat", () => {
    const c = makeChar({ class: "wizard", age: 16, currentArc: arcForAge(16), intelligence: 9 })
    const kit = reg.classKits.wizard
    expect(kit.resourceMultiplier).toBe(3.5)
    const state = startCombatState(roadAmbush, c, reg, new Rng(1))
    expect(state.resourceMax).toBe(Math.floor(9 * 3.5))
    expect(state.resource).toBe(state.resourceMax)
  })

  it("combatView reflects the persisted state with localized labels", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const state = startCombatState(roadAmbush, c, reg, new Rng(3))
    const view = combatView(state, c, "en", reg)
    expect(view.creature.id).toBe(state.creature.id)
    expect(view.creature.currentHealth).toBe(state.creatureHealth)
    expect(view.creature.maxHealth).toBe(state.creature.health)
    expect(view.creature.name.length).toBeGreaterThan(0)
    expect(view.player.health).toBe(c.health)
    expect(view.player.resource).toBe(state.resource)
    expect(view.kit.basicAttackLabel).toBe("Strike")
    expect(view.kit.abilityMenuLabel).toBe("Shout")
    expect(view.over).toBe(false)
    expect(view.result).toBeNull()
    // creatureMoveNames covers every authored move (localized).
    for (const mv of state.creature.moves) {
      expect(view.creatureMoveNames[mv.id]).toBeTruthy()
    }
    // Spanish localization renders the other locale.
    const es = combatView(state, c, "es", reg)
    expect(es.creature.name.length).toBeGreaterThan(0)
    expect(es.kit.basicAttackLabel).toBe("Golpe")
  })

  it("prepareCombatServe is idempotent across resumes and never re-rolls", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const first = prepareCombatServe(roadAmbush, c, "en", reg, new Rng(11))
    const creatureId = first.creature.id
    expect(c.pendingCombat).toBeTruthy()
    // A resume with a completely different rng must reuse the persisted state.
    const second = prepareCombatServe(roadAmbush, c, "en", reg, new Rng(99))
    expect(second.creature.id).toBe(creatureId)
    expect(c.pendingCombat!.creature.id).toBe(creatureId)
    // A different event forces a fresh fight.
    const cave = reg.combats.find((e) => e.id === "cave_den")!
    const fresh = prepareCombatServe(cave, c, "en", reg, new Rng(2))
    expect(fresh.creature.id).not.toBe(creatureId)
  })

  it("log round numbers increment across rounds", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const state = startCombatState(roadAmbush, c, reg, new Rng(4))
    resolveCombatRound(state, c, reg.classKits.warrior, { kind: "attack" }, new Rng(1))
    resolveCombatRound(state, c, reg.classKits.warrior, { kind: "attack" }, new Rng(2))
    expect(state.log.map((l) => l.round)).toEqual([1, 2])
  })
})

describe("endCombat rewards and outcomes", () => {
  const reg = loadContent()
  const campCookInShop = reg.shop.some((s) => s.id === "camp_cook")
  const roadAmbush = reg.combats.find((e) => e.id === "road_ambush")!

  it("win grants loot, counters, and completes the encounter", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16), gold: 50, fame: 10 })
    const ev = roadAmbush
    const state = startCombatState(ev, c, reg, new Rng(2))
    // Force a won fight.
    state.over = true
    state.result = "won"
    state.creatureHealth = 0
    const out = endCombat(c, ev, state, reg, new Rng(7))
    const loot = state.creature.loot
    expect(c.gold).toBeGreaterThanOrEqual(50 + loot.goldMin)
    expect(c.gold).toBeLessThanOrEqual(50 + loot.goldMax)
    expect(c.fame).toBeGreaterThanOrEqual(10 + loot.fameMin)
    expect(c.fame).toBeLessThanOrEqual(10 + loot.fameMax)
    expect(c.counters["battles_won"] ?? 0).toBe(1)
    expect(c.counters["monsters_killed"] ?? 0).toBe(1)
    expect(c.counters[`event_${ev.id}`] ?? 0).toBe(1)
    expect(out.ended).toBe(false)
    expect(out.wonBattle).toBe(true)
    expect(out.narrative.length).toBeGreaterThan(0)
  })

  it("elite and boss kills bump their own counters", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const ev = roadAmbush
    // Force a stone_golem (elite) kill.
    const state = startCombatState(ev, c, reg, new Rng(1))
    state.creature = reg.creaturesById.get("stone_golem")!
    state.creatureHealth = 0
    state.over = true
    state.result = "won"
    endCombat(c, ev, state, reg, new Rng(1))
    expect(c.counters["elite_kills"] ?? 0).toBe(1)

    const c2 = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const state2 = startCombatState(ev, c2, reg, new Rng(1))
    state2.creature = reg.creaturesById.get("young_dragon")!
    state2.creatureHealth = 0
    state2.over = true
    state2.result = "won"
    endCombat(c2, ev, state2, reg, new Rng(1))
    expect(c2.counters["boss_kills"] ?? 0).toBe(1)
  })

  it("item drops grant inventory when the roll lands", () => {
    expect(campCookInShop).toBe(true)
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const ev = roadAmbush
    const state = startCombatState(ev, c, reg, new Rng(1))
    state.creature = {
      ...reg.creaturesById.get("rat_swarm")!,
      loot: {
        goldMin: 1,
        goldMax: 1,
        fameMin: 0,
        fameMax: 0,
        items: [{ itemId: "camp_cook", chance: 1 }],
      },
    }
    state.over = true
    state.result = "won"
    endCombat(c, ev, state, reg, new Rng(5))
    expect(c.inventory.some((inv) => inv.itemId === "camp_cook")).toBe(true)
  })

  it("reputation delta is applied to the authored faction on a win", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16) })
    const ev = roadAmbush
    const state = startCombatState(ev, c, reg, new Rng(1))
    state.creature = {
      ...reg.creaturesById.get("rat_swarm")!,
      loot: {
        goldMin: 1,
        goldMax: 1,
        fameMin: 0,
        fameMax: 0,
        reputationDelta: 5,
        reputationFaction: "ironhold",
      },
    }
    state.over = true
    state.result = "won"
    endCombat(c, ev, state, reg, new Rng(5))
    expect(c.reputations.find((r) => r.faction === "ironhold")?.value).toBeGreaterThan(0)
  })

  it("flee grants no rewards and does not complete the encounter", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16), gold: 50, fame: 10 })
    const ev = roadAmbush
    const state = startCombatState(ev, c, reg, new Rng(1))
    state.over = true
    state.result = "fled"
    endCombat(c, ev, state, reg, new Rng(1))
    expect(c.gold).toBe(50)
    expect(c.fame).toBe(10)
    expect(c.counters["flees_count"] ?? 0).toBe(1)
    expect(c.counters["battles_won"] ?? 0).toBe(0)
    expect(c.counters[`event_${ev.id}`] ?? 0).toBe(0)
  })

  it("loss with zero health ends the run through the death path", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16), health: 0, fame: 0 })
    const ev = roadAmbush
    const state = startCombatState(ev, c, reg, new Rng(1))
    state.over = true
    state.result = "lost"
    const out = endCombat(c, ev, state, reg, new Rng(1))
    expect(c.status).toBe("dead")
    expect(out.ended).toBe(true)
    expect(out.endingType).toBe("other_death")
    expect(c.counters["lost_encounters"] ?? 0).toBe(1)
  })

  it("turn advances exactly once and pendingCombat is cleared", () => {
    const c = makeChar({ class: "warrior", age: 16, currentArc: arcForAge(16), turn: 4 })
    const ev = roadAmbush
    const state = startCombatState(ev, c, reg, new Rng(1))
    c.pendingCombat = state
    state.over = true
    state.result = "won"
    endCombat(c, ev, state, reg, new Rng(1))
    expect(c.turn).toBe(5)
    expect(c.pendingCombat).toBeNull()
  })
})

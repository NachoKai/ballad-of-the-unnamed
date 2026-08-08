import { describe, expect, it } from "vitest"
import { GAME_CONFIG } from "./config.js"

describe("GAME_CONFIG combat knobs", () => {
  it("defines every combat knob with sane ranges", () => {
    const c = GAME_CONFIG
    expect(c.combatEncounterChance).toBeGreaterThan(0)
    expect(c.combatEncounterChance).toBeLessThan(0.5)
    expect(c.combatCritMultiplier).toBeGreaterThan(1)
    expect(c.combatVariance).toBeGreaterThan(0)
    expect(c.combatVariance).toBeLessThan(0.5)
    expect(c.combatSafetyFloor).toBeGreaterThan(0)
    expect(c.combatFleeBase).toBeGreaterThan(0)
    expect(c.combatFleeBase).toBeLessThan(1)
    expect(c.combatFleeDexCoeff).toBeGreaterThan(0)
    expect(c.combatConMitigation).toBeGreaterThan(0)
    expect(c.combatGuardFactor).toBeLessThan(1)
    expect(c.combatPoisonPerTurn).toBeGreaterThan(0)
  })
})

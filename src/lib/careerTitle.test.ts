import { describe, expect, it } from "vitest"
import { careerPowerTier, careerTitle } from "./careerTitle"

describe("careerPowerTier", () => {
  it("returns tier 0 for low power", () => {
    expect(careerPowerTier(0)).toBe(0)
    expect(careerPowerTier(79)).toBe(0)
  })

  it("returns tier 1 for mid power", () => {
    expect(careerPowerTier(80)).toBe(1)
    expect(careerPowerTier(139)).toBe(1)
  })

  it("returns tier 2 for high power", () => {
    expect(careerPowerTier(140)).toBe(2)
    expect(careerPowerTier(200)).toBe(2)
  })
})

describe("careerTitle", () => {
  it("returns a title for the arc and power tier in English", () => {
    expect(careerTitle("en", "male", "adventurer", 20)).toBe("Wanderer")
    expect(careerTitle("en", "male", "adventurer", 90)).toBe("Adventurer")
    expect(careerTitle("en", "male", "adventurer", 150)).toBe("Rising Star")
    expect(careerTitle("en", "male", "mercenary", 150)).toBe("War Captain")
    expect(careerTitle("en", "male", "legend", 150)).toBe("Mythic Hero")
  })

  it("localizes titles to Spanish", () => {
    expect(careerTitle("es", "male", "adventurer", 20)).toBe("Errante")
    expect(careerTitle("es", "male", "kingdom_hero", 90)).toBe("Campeón de la Corona")
    expect(careerTitle("es", "male", "old_hero", 20)).toBe("Veterano")
  })

  it("gender-inflects Spanish titles for female characters", () => {
    expect(careerTitle("es", "female", "adventurer", 90)).toBe("Aventurera")
    expect(careerTitle("es", "female", "kingdom_hero", 90)).toBe("Campeona de la Corona")
    expect(careerTitle("es", "female", "mercenary", 150)).toBe("Capitana de Guerra")
    expect(careerTitle("es", "female", "legend", 150)).toBe("Heroína Mítica")
  })

  it("leaves English unaffected by gender", () => {
    expect(careerTitle("en", "female", "adventurer", 90)).toBe("Adventurer")
  })
})

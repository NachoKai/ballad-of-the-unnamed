import { describe, expect, it } from "vitest"
import { arcForAge } from "../../shared/config.js"
import { loadContent } from "./registry.js"

describe("combat content", () => {
  const reg = loadContent()

  it("loads a class kit for every class", () => {
    for (const cls of reg.classes) {
      const kit = reg.classKits[cls.id]
      expect(kit, `missing kit for ${cls.id}`).toBeDefined()
      expect(kit.abilities.length).toBeGreaterThan(0)
    }
  })

  it("loads combat encounters with creature pools that resolve", () => {
    expect(reg.combats.length).toBeGreaterThan(0)
    for (const ev of reg.combats) {
      expect(ev.type).toBe("combat")
      expect(ev.combat?.creatures.length).toBeGreaterThan(0)
      for (const cid of ev.combat!.creatures) {
        expect(reg.creaturesById.has(cid), `encounter ${ev.id} unknown creature ${cid}`).toBe(true)
      }
    }
  })

  it("every creature is well-formed", () => {
    for (const cr of reg.creatures) {
      expect(cr.health).toBeGreaterThan(0)
      expect(cr.attack).toBeGreaterThan(0)
      expect(cr.moves.length).toBeGreaterThan(0)
      expect(cr.loot.goldMax).toBeGreaterThanOrEqual(cr.loot.goldMin)
      expect(cr.loot.fameMax).toBeGreaterThanOrEqual(cr.loot.fameMin)
      for (const mv of cr.moves) expect(mv.weight).toBeGreaterThan(0)
    }
  })

  it("common/uncommon creatures never kill; rare+ can", () => {
    for (const cr of reg.creatures) {
      if (cr.rarity === "common" || cr.rarity === "uncommon") {
        expect(cr.canKillPlayer, `${cr.id} should not kill`).toBe(false)
      } else {
        expect(cr.canKillPlayer, `${cr.id} should be able to kill`).toBe(true)
      }
    }
  })

  it("the roster spans all five rarity tiers", () => {
    const tiers = new Set(reg.creatures.map((cr) => cr.rarity))
    for (const tier of ["common", "uncommon", "rare", "elite", "boss"]) {
      expect(tiers.has(tier as never), `no creature of rarity ${tier}`).toBe(true)
    }
  })

  it("every encounter keeps an arc-viable creature across its whole age range", () => {
    // Guard against the empty-pool crash: an encounter is eligible at an age
    // where its entire creature pool is arc-filtered out.
    for (const ev of reg.combats) {
      const creatures = ev.combat!.creatures.map((id) => reg.creaturesById.get(id)!)
      for (let age = ev.minAge; age <= Math.min(ev.maxAge, 90); age += 10) {
        const arc = arcForAge(age)
        const viable = creatures.some((cr) => !cr.arcs || cr.arcs.includes(arc))
        expect(viable, `encounter ${ev.id} has no viable creature at age ${age} (${arc})`).toBe(
          true,
        )
      }
    }
  })
})

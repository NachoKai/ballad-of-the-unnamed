import { describe, expect, it } from "vitest"
import { Rng } from "../../../shared/rng.js"
import { GAME_CONFIG } from "../../../shared/config.js"
import type {
  CharacterState,
  CircusSegmentKind,
  CircusWheelConfig,
  PendingMinigameState,
  ServedInteractiveState,
} from "../../../shared/types.js"
import { applyInteractiveMove, interactiveTier, interactiveView } from "./index.js"
import { circusSpin, circusTier, createCircusState } from "./circusWheel.js"
import { loadContent } from "../../content/registry.js"

const SPIN = { kind: "circus_wheel", action: "spin" } as const
const LEAVE = { kind: "circus_wheel", action: "leave" } as const

// A 7-segment wheel covering every prize kind (uniform roll, 0..6).
const WHEEL: CircusWheelConfig = {
  cost: 50,
  segments: [
    { id: "empty", icon: "ban", kind: "nothing", label: { en: "Nothing", es: "Nada" } },
    { id: "coins_20", icon: "coins", kind: "gold", amount: 20, label: { en: "+20", es: "+20" } },
    {
      id: "jackpot",
      icon: "star",
      kind: "jackpot",
      amount: 300,
      label: { en: "JACKPOT", es: "¡JACKPOT!" },
    },
    {
      id: "free_spin",
      icon: "rotate-3d",
      kind: "freespin",
      label: { en: "Free spin", es: "Tirada gratis" },
    },
    {
      id: "charm",
      icon: "clover",
      kind: "item",
      itemId: "lucky_charm",
      label: { en: "Lucky Charm", es: "Amuleto de suerte" },
    },
    {
      id: "fame",
      icon: "megaphone",
      kind: "fame",
      amount: 12,
      label: { en: "+12 Fame", es: "+12 Fama" },
    },
    {
      id: "mystery_box",
      icon: "gem",
      kind: "mystery",
      amount: 120,
      healthCost: 12,
      chance: 0.5,
      label: { en: "Mystery box", es: "Caja misteriosa" },
    },
  ],
}

interface SegmentExtras {
  healthCost?: number
  chance?: number
}

// A single-segment wheel so a spin always lands on exactly the kind we want.
function oneSegment(
  kind: CircusSegmentKind,
  amount?: number,
  itemId?: string,
  extras?: SegmentExtras,
): CircusWheelConfig {
  return {
    cost: 50,
    segments: [
      {
        id: "solo",
        icon: "coins",
        kind,
        amount,
        itemId,
        healthCost: extras?.healthCost,
        chance: extras?.chance,
        label: { en: "X", es: "X" },
      },
    ],
  }
}

// Minimal CharacterState the wheel harness reads (gold, fame, health, inventory, turn).
function characterState(gold = 500): CharacterState {
  return { gold, fame: 0, health: 100, inventory: [], turn: 10 } as unknown as CharacterState
}

function spinOnce(state: PendingMinigameState, c: CharacterState, seed = 1) {
  return applyInteractiveMove(state, SPIN, 20, new Rng(seed), undefined, c)
}

describe("circus wheel", () => {
  it("creates an rng-free initial state from the authored wheel", () => {
    const s = createCircusState("ev1", WHEEL)
    expect(s.game).toBe("circus_wheel")
    expect(s.wheel!.cost).toBe(50)
    expect(s.wheel!.segments.length).toBe(7)
    expect(s.wheel!.spins).toEqual([])
    expect(s.wheel!.freeSpins).toBe(0)
    expect(s.wheel!.net).toBe(0)
    expect(s.wheel!.over).toBe(false)
    // no spins and no money lost yet: a break-even night reads as partial.
    expect(circusTier(s)).toBe("partial")
  })

  it("rolls deterministically for the same seed", () => {
    const a = createCircusState("ev1", WHEEL)
    const b = createCircusState("ev1", WHEEL)
    circusSpin(a, new Rng(7))
    circusSpin(b, new Rng(7))
    expect(a.wheel!.spins).toEqual(b.wheel!.spins)
  })

  it("charges gold per spin and tracks the net", () => {
    const c = characterState(500)
    const s = createCircusState("ev1", oneSegment("gold", 40))
    const out = spinOnce(s, c)
    expect(out.over).toBe(false)
    expect(c.gold).toBe(490) // 500 − 50 paid + 40 prize
    expect(s.wheel!.net).toBe(-10) // +40 prize − 50 cost
    expect(s.wheel!.spins).toEqual([0])
  })

  it("spends a banked free spin before gold, and lands can bank free spins", () => {
    const c = characterState(500)
    const s = createCircusState("ev1", oneSegment("freespin"))
    spinOnce(s, c)
    expect(c.gold).toBe(450) // first spin is paid
    expect(s.wheel!.freeSpins).toBe(1) // and it won a free spin
    spinOnce(s, c)
    expect(c.gold).toBe(450) // second spin consumed the free spin, no charge
    expect(s.wheel!.freeSpins).toBe(1) // ...and won another
  })

  it("credits jackpot gold to the character", () => {
    const c = characterState(500)
    const s = createCircusState("ev1", oneSegment("jackpot", 300))
    spinOnce(s, c)
    expect(c.gold).toBe(750) // 500 − 50 paid + 300 jackpot
    expect(s.wheel!.net).toBe(250)
    expect(s.wheel!.hitJackpot).toBe(true)
    expect(interactiveTier(s)).toBe("critical")
  })

  it("credits fame to the character on a fame landing", () => {
    const c = characterState(500)
    const s = createCircusState("ev1", oneSegment("fame", 12))
    spinOnce(s, c)
    expect(c.fame).toBe(12)
    expect(c.gold).toBe(450) // fame costs a spin, pays no gold
    expect(s.wheel!.net).toBe(-50)
  })

  it("mystery box treasure side pays gold and records the reveal", () => {
    const c = characterState(500)
    // chance 1 ⇒ the box always holds treasure
    const s = createCircusState("ev1", oneSegment("mystery", 120, undefined, { healthCost: 12, chance: 1 }))
    spinOnce(s, c)
    expect(c.gold).toBe(570) // 500 − 50 paid + 120 treasure
    expect(c.health).toBe(100)
    expect(s.wheel!.net).toBe(70)
    expect(s.wheel!.mysteryResults).toEqual({ 0: "prize" })
    const view = interactiveView(s, "en", c.gold) as Extract<
      ServedInteractiveState,
      { game: "circus_wheel" }
    >
    expect(view.lastSpin).toEqual({ segment: 0, mystery: "prize" })
  })

  it("mystery box trap side costs health and pays no gold", () => {
    const c = characterState(500)
    // chance 0 ⇒ the box is always rigged
    const s = createCircusState("ev1", oneSegment("mystery", 120, undefined, { healthCost: 12, chance: 0 }))
    spinOnce(s, c)
    expect(c.health).toBe(88)
    expect(c.gold).toBe(450)
    expect(s.wheel!.net).toBe(-50)
    expect(s.wheel!.mysteryResults).toEqual({ 0: "injury" })
  })

  it("mystery box reveals are deterministic for the same seed", () => {
    const a = createCircusState(
      "ev1",
      oneSegment("mystery", 120, undefined, { healthCost: 12, chance: 0.5 }),
    )
    const b = createCircusState(
      "ev1",
      oneSegment("mystery", 120, undefined, { healthCost: 12, chance: 0.5 }),
    )
    circusSpin(a, new Rng(5))
    circusSpin(b, new Rng(5))
    const side = a.wheel!.mysteryResults![0]
    expect(["prize", "injury"]).toContain(side)
    expect(b.wheel!.mysteryResults).toEqual(a.wheel!.mysteryResults)
  })

  it("grants the item prize into the inventory and stacks duplicates", () => {
    const c = characterState(500)
    const s = createCircusState("ev1", oneSegment("item", undefined, "lucky_charm"))
    spinOnce(s, c)
    expect(c.inventory).toEqual([
      { itemId: "lucky_charm", qty: 1, expiresAtTurn: 10 + GAME_CONFIG.seasonLength },
    ])
    spinOnce(s, c)
    expect(c.inventory[0].qty).toBe(2)
  })

  it("rejects a spin with no gold and no free spins", () => {
    const c = characterState(10)
    const s = createCircusState("ev1", oneSegment("gold", 40))
    expect(() => spinOnce(s, c)).toThrow("no funds")
  })

  it("rejects a move for the wrong game", () => {
    const s = createCircusState("ev1", WHEEL)
    expect(() =>
      applyInteractiveMove(s, { kind: "rps", choice: "rock" }, 20, new Rng(1), undefined, characterState()),
    ).toThrow("invalid move for circus_wheel")
  })

  it("cashing out ends the night with all gold already settled", () => {
    const c = characterState(500)
    const s = createCircusState("ev1", oneSegment("gold", 40))
    spinOnce(s, c)
    const out = applyInteractiveMove(s, LEAVE, 20, new Rng(1), undefined, c)
    expect(out.over).toBe(true)
    expect(s.wheel!.over).toBe(true)
    expect(c.gold).toBe(490) // 500 − 50 paid + 40 prize, settled live
    // the outcome tier reviews a losing night
    expect(interactiveTier(s)).toBe("partial")
  })

  it("maps the night's net to tiers", () => {
    const jackpot = createCircusState("ev1", oneSegment("jackpot", 300))
    circusSpin(jackpot, new Rng(1))
    expect(circusTier(jackpot)).toBe("critical")

    const winning = createCircusState("ev1", oneSegment("gold", 100))
    winning.wheel!.net = 50
    expect(circusTier(winning)).toBe("success")

    const even = createCircusState("ev1", oneSegment("gold", 20))
    even.wheel!.net = -30 // lost less than a spin's cost
    expect(circusTier(even)).toBe("partial")

    const cleaned = createCircusState("ev1", oneSegment("nothing"))
    cleaned.wheel!.net = -100
    expect(circusTier(cleaned)).toBe("fail")
  })

  it("serves a localized view with live gold and the latest landing", () => {
    const c = characterState(200)
    const s = createCircusState("ev1", WHEEL)
    spinOnce(s, c)
    const view = interactiveView(s, "es", c.gold) as Extract<
      ServedInteractiveState,
      { game: "circus_wheel" }
    >
    expect(view.game).toBe("circus_wheel")
    expect(view.gold).toBe(c.gold)
    expect(view.cost).toBe(50)
    expect(view.spins).toBe(1)
    expect(view.freeSpins).toBe(s.wheel!.freeSpins)
    expect(view.segments.length).toBe(7)
    expect(view.segments[0].label).toBe("Nada")
    expect(view.lastSpin).toEqual({ segment: s.wheel!.spins[0] })
    expect(view.log).toEqual([s.wheel!.spins[0]])
    expect(view.over).toBe(false)
    expect(view.result).toBe("playing")
  })
})

describe("circus wheel economy", () => {
  // The wheel must be slightly negative-EV in GOLD so cashing out is a real
  // decision: the longer a player grinds, the more gold they lose on average.
  // Items and fame are counted at zero gold value here — the gold a player
  // actually sees bleed. Caveat: a collector who values the prize items at
  // their 600–700g shop price could see the wheel as nearer to even, but the
  // guard keeps the honest, gold-visible edge negative.
  //
  // Model: with `fs` free-spin segments out of `n`, a paid spin rolls, on
  // average, n/(n−fs) prize draws (free spins cascade). Expected gold per
  // PAID spin is therefore P/(n−fs), where P is the wheel's total gold prize
  // value (gold/jackpot amounts + mystery chance×amount). The house edge is
  // cost − P/(n−fs); the band keeps it between 5% and 15% — "slightly
  // negative", not a scam, and not break-even.
  it("the authored wheel bleeds gold slowly (house edge 5–15%)", () => {
    const registry = loadContent()
    const ev = registry.minigames.find((m) => m.id === "circus_wheel_of_fortune")
    expect(ev).toBeDefined()
    const wheel = ev!.wheel!
    const segments = wheel.segments
    const n = segments.length
    const fs = segments.filter((s) => s.kind === "freespin").length
    expect(fs).toBeGreaterThan(0)

    const prizeTotal = segments.reduce((sum, s) => {
      if (s.kind === "gold" || s.kind === "jackpot") return sum + (s.amount ?? 0)
      if (s.kind === "mystery") return sum + (s.chance ?? 0.5) * (s.amount ?? 0)
      return sum
    }, 0)

    const evPerPaidSpin = prizeTotal / (n - fs)
    const houseEdge = wheel.cost - evPerPaidSpin
    // slightly negative: lose 5% to 15% of the stake per paid spin on average
    expect(houseEdge).toBeGreaterThan(0.05 * wheel.cost)
    expect(houseEdge).toBeLessThanOrEqual(0.15 * wheel.cost)
  })
})

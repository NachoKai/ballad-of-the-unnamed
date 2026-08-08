import { describe, expect, it } from "vitest"
import { wheelButtons } from "./CircusWheelGame"

describe("wheelButtons", () => {
  it("cash-out stays enabled for a broke player (51 gold, cost 60)", () => {
    const b = wheelButtons({
      busy: false,
      spinning: false,
      over: false,
      gold: 51,
      cost: 60,
      freeSpins: 0,
    })
    expect(b.canSpin).toBe(false)
    expect(b.cashOutDisabled).toBe(false)
    expect(b.noFunds).toBe(true)
  })

  it("cash-out is enabled even while the wheel is still spinning", () => {
    const b = wheelButtons({
      busy: false,
      spinning: true,
      over: false,
      gold: 51,
      cost: 60,
      freeSpins: 0,
    })
    expect(b.cashOutDisabled).toBe(false)
    expect(b.spinDisabled).toBe(true)
  })

  it("spin is blocked during an in-flight request or the animation", () => {
    expect(
      wheelButtons({ busy: true, spinning: false, over: false, gold: 100, cost: 60, freeSpins: 0 })
        .spinDisabled,
    ).toBe(true)
    expect(
      wheelButtons({ busy: false, spinning: true, over: false, gold: 100, cost: 60, freeSpins: 0 })
        .spinDisabled,
    ).toBe(true)
  })

  it("a banked free spin lets a broke player spin again", () => {
    const b = wheelButtons({
      busy: false,
      spinning: false,
      over: false,
      gold: 51,
      cost: 60,
      freeSpins: 1,
    })
    expect(b.canSpin).toBe(true)
    expect(b.noFunds).toBe(false)
  })
})

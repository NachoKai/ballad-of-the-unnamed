import { describe, expect, it } from "vitest"
import { fmtInt } from "./format"

describe("fmtInt", () => {
  it("rounds fractional values to the nearest integer", () => {
    expect(fmtInt(3.2)).toBe(3)
    expect(fmtInt(3.5)).toBe(4)
    expect(fmtInt(3.8)).toBe(4)
  })

  it("rounds negative fractional values", () => {
    expect(fmtInt(-3.2)).toBe(-3)
    expect(fmtInt(-3.8)).toBe(-4)
  })

  it("leaves integers untouched", () => {
    expect(fmtInt(7)).toBe(7)
    expect(fmtInt(0)).toBe(0)
  })

  it("handles ratios that would otherwise surface a decimal", () => {
    expect(fmtInt((2 / 3) * 100)).toBe(67)
  })
})

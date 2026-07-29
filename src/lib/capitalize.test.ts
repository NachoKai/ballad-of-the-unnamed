import { describe, expect, it } from "vitest"
import { capitalize } from "./capitalize"

describe("capitalize", () => {
  it("capitalizes the first letter of a lowercase string", () => {
    expect(capitalize("un hombre lobo")).toBe("Un hombre lobo")
  })

  it("leaves an already-capitalized string unchanged", () => {
    expect(capitalize("El bosque")).toBe("El bosque")
  })

  it("handles a single character", () => {
    expect(capitalize("a")).toBe("A")
  })

  it("handles an empty string", () => {
    expect(capitalize("")).toBe("")
  })

  it("handles a string starting with a number", () => {
    expect(capitalize("3 aldeanos")).toBe("3 aldeanos")
  })

  it("handles a string with leading whitespace", () => {
    expect(capitalize("  hola")).toBe("  hola")
  })
})

import { describe, expect, it } from "vitest"
import { genderize, genderizeChrome } from "./genderize.js"

describe("genderize", () => {
  it("leaves masculine-authored text unchanged for unset genders", () => {
    expect(genderize("Salís renacido, listo para cualquier cosa.", undefined)).toBe(
      "Salís renacido, listo para cualquier cosa.",
    )
    expect(genderize("Salís renacido, listo para cualquier cosa.", null)).toBe(
      "Salís renacido, listo para cualquier cosa.",
    )
  })

  it("leaves masculine-authored text unchanged for male characters", () => {
    expect(genderize("Despertás alimentado y entero.", "male")).toBe(
      "Despertás alimentado y entero.",
    )
    expect(genderize("Salís renacido, listo para cualquier cosa.", "male")).toBe(
      "Salís renacido, listo para cualquier cosa.",
    )
    expect(genderize("Te inclinás. Empapado y medio congelado, coronás la cima.", "male")).toBe(
      "Te inclinás. Empapado y medio congelado, coronás la cima.",
    )
  })

  it("inflects player-referential words to feminine", () => {
    expect(genderize("Despertás alimentado y entero.", "female")).toBe(
      "Despertás alimentada y entera.",
    )
    expect(genderize("Salís renacido, listo para cualquier cosa.", "female")).toBe(
      "Salís renacida, lista para cualquier cosa.",
    )
    expect(genderize("Despertás tieso pero descansado.", "female")).toBe(
      "Despertás tiesa pero descansada.",
    )
    expect(genderize("Te inclinás. Empapado y medio congelado, coronás la cima.", "female")).toBe(
      "Te inclinás. Empapada y medio congelada, coronás la cima.",
    )
  })

  it("inflects vocatives and player noun phrases", () => {
    expect(genderize("Comé, viajero.", "female")).toBe("Comé, viajera.")
    expect(genderize("un viajero solitario sin estandarte", "female")).toBe(
      "una viajera solitaria sin estandarte",
    )
  })

  it("leaves NPC/group-referential masculine forms untouched", () => {
    const text = "Un herrero forja tu anillo. El anciano asiente. Los soldados alimentados esperan."
    expect(genderize(text, "male")).toBe(text)
    expect(genderize(text, "female")).toBe(text)
    expect(genderize("El Maestre del Gremio alza su martillo.", "female")).toBe(
      "El Maestre del Gremio alza su martillo.",
    )
    expect(genderize("La luz acoge a todos quienes necesitan descanso.", "female")).toBe(
      "La luz acoge a todos quienes necesitan descanso.",
    )
  })

  it("inflects archetype titles to feminine", () => {
    expect(genderize("Caballero", "female")).toBe("Caballera")
    expect(genderize("Guardiano", "female")).toBe("Guardiana")
    expect(genderize("Táctico", "female")).toBe("Táctica")
    expect(genderize("Encantador", "female")).toBe("Encantadora")
    expect(genderize("Asesino", "female")).toBe("Asesina")
    expect(genderize("Ladrón", "female")).toBe("Ladrona")
    expect(genderize("Infiltrador", "female")).toBe("Infiltradora")
    expect(genderize("Cazador", "female")).toBe("Cazadora")
    expect(genderize("Maestro de Bestias", "female")).toBe("Maestra de Bestias")
    expect(genderize("Explorador", "female")).toBe("Exploradora")
    expect(genderize("Francotirador", "female")).toBe("Francotiradora")
    expect(genderize("Trampero", "female")).toBe("Trampera")
    expect(genderize("Sanador", "female")).toBe("Sanadora")
    expect(genderize("Paladín", "female")).toBe("Paladina")
    expect(genderize("Inquisidor", "female")).toBe("Inquisidora")
    expect(genderize("Cómico", "female")).toBe("Cómica")
    expect(genderize("Escaldo", "female")).toBe("Escalda")
    expect(genderize("Sacerdote de Batalla", "female")).toBe("Sacerdotisa de Batalla")
    expect(genderize("Paciente. Silencioso. La caza es lo único que importa.", "female")).toBe(
      "Paciente. Silenciosa. La caza es lo único que importa.",
    )
  })

  it("leaves masculine archetype titles untouched", () => {
    expect(genderize("Caballero", "male")).toBe("Caballero")
    expect(genderize("Maestro de Bestias", "male")).toBe("Maestro de Bestias")
    expect(genderize("Sacerdote de Batalla", "male")).toBe("Sacerdote de Batalla")
  })

  it("preserves capitalization", () => {
    expect(genderize("Comé, Viajero.", "female")).toBe("Comé, Viajera.")
    expect(genderize("Un Viajero Solitario", "female")).toBe("Una Viajera Solitaria")
  })

  it("leaves English text and unknown words untouched", () => {
    expect(genderize("You sleep, fed and whole.", "female")).toBe("You sleep, fed and whole.")
    expect(genderize("Los hombres fuertes marchan.", "female")).toBe("Los hombres fuertes marchan.")
  })
})

describe("genderizeChrome", () => {
  it("feminizes client chrome labels for female characters only", () => {
    expect(genderizeChrome("Respetado", "female")).toBe("Respetada")
    expect(genderizeChrome("Respetado", "male")).toBe("Respetado")
    expect(genderizeChrome("Conocido cercano", "female")).toBe("Conocida cercana")
    expect(genderizeChrome("Seguro", "female")).toBe("Segura")
    expect(genderizeChrome("Leyenda", "female")).toBe("Leyenda")
  })

  it("leaves chrome labels untouched for unset or male genders", () => {
    expect(genderizeChrome("Marginado", undefined)).toBe("Marginado")
    expect(genderizeChrome("Marginado", null)).toBe("Marginado")
    expect(genderizeChrome("Marginado", "male")).toBe("Marginado")
  })
})

import { describe, expect, it } from "vitest"
import { genderize } from "./genderize.js"

describe("genderize", () => {
  it("keeps neutral 'e' forms for nonbinary and unset genders", () => {
    expect(genderize("Salís renacide, liste para cualquier cosa.", "nonbinary")).toBe(
      "Salís renacide, liste para cualquier cosa.",
    )
    expect(genderize("Salís renacide, liste para cualquier cosa.", undefined)).toBe(
      "Salís renacide, liste para cualquier cosa.",
    )
    expect(genderize("Salís renacide, liste para cualquier cosa.", null)).toBe(
      "Salís renacide, liste para cualquier cosa.",
    )
  })

  it("inflects player-referential words to masculine", () => {
    expect(genderize("Despertás alimentade y entero.", "male")).toBe(
      "Despertás alimentado y entero.",
    )
    expect(genderize("Salís renacide, liste para cualquier cosa.", "male")).toBe(
      "Salís renacido, listo para cualquier cosa.",
    )
    expect(genderize("Te inclinás. Empapade y medio congelade, coronás la cima.", "male")).toBe(
      "Te inclinás. Empapado y medio congelado, coronás la cima.",
    )
  })

  it("inflects player-referential words to feminine", () => {
    expect(genderize("Despertás alimentade y entero.", "female")).toBe(
      "Despertás alimentada y entera.",
    )
    expect(genderize("Salís renacide, liste para cualquier cosa.", "female")).toBe(
      "Salís renacida, lista para cualquier cosa.",
    )
    expect(genderize("Despertás tieso pero descansade.", "female")).toBe(
      "Despertás tiesa pero descansada.",
    )
  })

  it("inflects vocatives and player noun phrases", () => {
    expect(genderize("Comé, viajere.", "male")).toBe("Comé, viajero.")
    expect(genderize("Comé, viajere.", "female")).toBe("Comé, viajera.")
    expect(genderize("une viajere solitaire sin estandarte", "male")).toBe(
      "une viajero solitario sin estandarte",
    )
    expect(genderize("une viajere solitaire sin estandarte", "female")).toBe(
      "une viajera solitaria sin estandarte",
    )
  })

  it("leaves group/NPC-referential neutral forms untouched", () => {
    const text = "Une herrera forja tu anillo. L'anciane asiente. Les soldades alimentades esperan."
    expect(genderize(text, "male")).toBe(text)
    expect(genderize(text, "female")).toBe(text)
    expect(genderize("La luz acoge a todes quienes necesitan descanso.", "female")).toBe(
      "La luz acoge a todes quienes necesitan descanso.",
    )
  })

  it("feminizes client chrome labels for female characters only", () => {
    expect(genderize("Respetado", "female")).toBe("Respetada")
    expect(genderize("Respetado", "male")).toBe("Respetado")
    expect(genderize("Conocido cercano", "female")).toBe("Conocida cercana")
    expect(genderize("Seguro", "female")).toBe("Segura")
    expect(genderize("Leyenda", "female")).toBe("Leyenda")
  })

  it("preserves capitalization", () => {
    expect(genderize("Comé, Viajere.", "female")).toBe("Comé, Viajera.")
    expect(genderize("Respetado", "female")).toBe("Respetada")
  })

  it("inflects archetype titles to masculine", () => {
    expect(genderize("Caballere", "male")).toBe("Caballero")
    expect(genderize("Guardiane", "male")).toBe("Guardiano")
    expect(genderize("Táctique", "male")).toBe("Táctico")
    expect(genderize("Encantadore", "male")).toBe("Encantador")
    expect(genderize("Asesine", "male")).toBe("Asesino")
    expect(genderize("Ladrone", "male")).toBe("Ladrón")
    expect(genderize("Infiltradore", "male")).toBe("Infiltrador")
    expect(genderize("Cazadore", "male")).toBe("Cazador")
    expect(genderize("Maestroe de Bestias", "male")).toBe("Maestro de Bestias")
    expect(genderize("Exploradore", "male")).toBe("Explorador")
    expect(genderize("Francotiradore", "male")).toBe("Francotirador")
    expect(genderize("Trampere", "male")).toBe("Trampero")
    expect(genderize("Sanadore", "male")).toBe("Sanador")
    expect(genderize("Paladine", "male")).toBe("Paladín")
    expect(genderize("Inquisidore", "male")).toBe("Inquisidor")
    expect(genderize("Cómique", "male")).toBe("Cómico")
    expect(genderize("Paciente. Silenciose. La caza es lo único que importa.", "male")).toBe(
      "Paciente. Silencioso. La caza es lo único que importa.",
    )
  })

  it("inflects archetype titles to feminine", () => {
    expect(genderize("Caballere", "female")).toBe("Caballera")
    expect(genderize("Guardiane", "female")).toBe("Guardiana")
    expect(genderize("Táctique", "female")).toBe("Táctica")
    expect(genderize("Encantadore", "female")).toBe("Encantadora")
    expect(genderize("Asesine", "female")).toBe("Asesina")
    expect(genderize("Ladrone", "female")).toBe("Ladrona")
    expect(genderize("Infiltradore", "female")).toBe("Infiltradora")
    expect(genderize("Cazadore", "female")).toBe("Cazadora")
    expect(genderize("Maestroe de Bestias", "female")).toBe("Maestra de Bestias")
    expect(genderize("Exploradore", "female")).toBe("Exploradora")
    expect(genderize("Francotiradore", "female")).toBe("Francotiradora")
    expect(genderize("Trampere", "female")).toBe("Trampera")
    expect(genderize("Sanadore", "female")).toBe("Sanadora")
    expect(genderize("Paladine", "female")).toBe("Paladina")
    expect(genderize("Inquisidore", "female")).toBe("Inquisidora")
    expect(genderize("Cómique", "female")).toBe("Cómica")
    expect(genderize("Sacerdote de Batalla", "female")).toBe("Sacerdotisa de Batalla")
    expect(genderize("Paciente. Silenciose. La caza es lo único que importa.", "female")).toBe(
      "Paciente. Silenciosa. La caza es lo único que importa.",
    )
  })

  it("keeps neutral 'e' archetype titles for nonbinary", () => {
    expect(genderize("Caballere", "nonbinary")).toBe("Caballere")
    expect(genderize("Maestroe de Bestias", "nonbinary")).toBe("Maestroe de Bestias")
    expect(genderize("Sacerdote de Batalla", "nonbinary")).toBe("Sacerdote de Batalla")
  })

  it("leaves English text and unknown words untouched", () => {
    expect(genderize("You sleep, fed and whole.", "female")).toBe("You sleep, fed and whole.")
    expect(genderize("Los hombres fuertes marchan.", "female")).toBe("Los hombres fuertes marchan.")
  })
})

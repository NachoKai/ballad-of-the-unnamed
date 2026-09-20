import { describe, expect, it } from "vitest"
import { arcForAge } from "../../shared/config.js"
import { loadContent, validateDialogueBranches, validateDialogueEvent, validateThread } from "./registry.js"
import type { EventContent, ThreadContent } from "../../shared/types.js"

describe("story threads", () => {
  const reg = loadContent()
  const eventsById = new Map(reg.events.map((e) => [e.id, e]))

  it("loads at least one thread", () => {
    expect(reg.threads.length).toBeGreaterThan(0)
  })

  it("every beat resolves to a real event", () => {
    for (const t of reg.threads) {
      for (const beatId of t.beats) {
        expect(eventsById.has(beatId), `thread ${t.id} unknown beat ${beatId}`).toBe(true)
      }
    }
  })

  it("rejects a thread whose beat references an unknown event", () => {
    const bad: ThreadContent = {
      id: "bad_thread",
      title: { en: "Bad", es: "Malo" },
      beats: ["tavern_stranger", "does_not_exist"],
    }
    expect(() => validateThread(bad, eventsById)).toThrow(/unknown event does_not_exist/)
  })

  it("rejects a thread with fewer than two beats", () => {
    const bad: ThreadContent = {
      id: "short_thread",
      title: { en: "Short", es: "Corto" },
      beats: ["tavern_stranger"],
    }
    expect(() => validateThread(bad, eventsById)).toThrow(/at least 2 beats/)
  })

  it("rejects a thread with a missing locale", () => {
    const bad: ThreadContent = {
      id: "loc_thread",
      title: { en: "Only English" } as ThreadContent["title"],
      beats: ["tavern_stranger", "tavern_gamble"],
    }
    expect(() => validateThread(bad, eventsById)).toThrow(/missing 'es'/)
  })
})

describe("dialogue events", () => {
  const valid: EventContent = {
    id: "d_test",
    type: "dialogue",
    minAge: 0,
    maxAge: 999,
    weight: 1,
    narrative: { en: "A scene.", es: "Una escena." },
    dialoguePrompt: { en: "What say you?", es: "¿Qué dices?" },
    interpretations: [
      {
        id: "bold",
        intent: { en: "boastful", es: "jactancioso" },
        outcomeNarrative: { en: "You boast.", es: "Te jactas." },
        shortcutLabel: { en: "Boast", es: "Jactarse" },
      },
      {
        id: "meek",
        intent: { en: "modest", es: "modesto" },
        outcomeNarrative: { en: "You bow.", es: "Te inclinas." },
      },
    ],
    fallback: "meek",
  }

  it("accepts a well-formed dialogue event", () => {
    expect(() => validateDialogueEvent(valid)).not.toThrow()
  })

  it("requires a localized dialogue prompt", () => {
    const bad = { ...valid, dialoguePrompt: { en: "Only English" } } as EventContent
    expect(() => validateDialogueEvent(bad)).toThrow(/dialoguePrompt/)
  })

  it("requires at least two interpretations", () => {
    const bad = { ...valid, interpretations: [valid.interpretations![0]] } as EventContent
    expect(() => validateDialogueEvent(bad)).toThrow(/at least 2 interpretations/)
  })

  it("rejects duplicate interpretation ids", () => {
    const dup = { ...valid.interpretations![0] }
    const bad = {
      ...valid,
      interpretations: [valid.interpretations![0], dup],
    } as EventContent
    expect(() => validateDialogueEvent(bad)).toThrow(/duplicate interpretation bold/)
  })

  it("requires an interpretation's outcome narrative in every locale", () => {
    const bad = {
      ...valid,
      interpretations: [
        { ...valid.interpretations![0], outcomeNarrative: { en: "Only English" } },
        valid.interpretations![1],
      ],
    } as EventContent
    expect(() => validateDialogueEvent(bad)).toThrow(/outcomeNarrative/)
  })

  it("requires a fallback that names a real interpretation", () => {
    expect(() => validateDialogueEvent({ ...valid, fallback: undefined } as EventContent)).toThrow(
      /needs a fallback/,
    )
    expect(() =>
      validateDialogueEvent({ ...valid, fallback: "ghost" } as EventContent),
    ).toThrow(/fallback ghost is not an interpretation/)
  })

  it("rejects a non-positive maxLength", () => {
    expect(() => validateDialogueEvent({ ...valid, maxLength: 0 } as EventContent)).toThrow(
      /maxLength/,
    )
  })

  it("rejects a nextBeat that names an unknown event", () => {
    const branched = {
      ...valid,
      interpretations: [
        { ...valid.interpretations![0], nextBeat: "does_not_exist" },
        valid.interpretations![1],
      ],
    } as EventContent
    const byId = new Map([["d_test", branched]])
    expect(() => validateDialogueBranches([branched], byId)).toThrow(
      /nextBeat does_not_exist is unknown/,
    )
  })

  it("accepts a nextBeat that resolves to a real event", () => {
    const branched = {
      ...valid,
      interpretations: [
        { ...valid.interpretations![0], nextBeat: "tavern_stranger" },
        valid.interpretations![1],
      ],
    } as EventContent
    const byId = new Map([["tavern_stranger", {} as EventContent], ["d_test", branched]])
    expect(() => validateDialogueBranches([branched], byId)).not.toThrow()
  })
})

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

  it("every world-event combat menace targets real creatures with sane knobs", () => {
    const menaceEvents = reg.events.filter((e) => e.combatMenace)
    expect(menaceEvents.length).toBeGreaterThan(0)
    for (const ev of menaceEvents) {
      expect(ev.type).toBe("world")
      expect(ev.combatMenace!.creatureIds.length).toBeGreaterThan(0)
      for (const cid of ev.combatMenace!.creatureIds) {
        expect(reg.creaturesById.has(cid), `${ev.id} menace unknown ${cid}`).toBe(true)
      }
      expect(ev.combatMenace!.weightMultiplier).toBeGreaterThan(1)
      expect(ev.combatMenace!.durationSeasons).toBeGreaterThanOrEqual(1)
      expect(ev.combatMenace!.killTarget).toBeGreaterThanOrEqual(1)
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

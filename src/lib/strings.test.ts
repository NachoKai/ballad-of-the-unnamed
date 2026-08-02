import { describe, expect, it } from "vitest"
import { makeT } from "../i18n/strings"

const KEYS = [
  "minigameChooseMove",
  "minigameRivalTurn",
  "minigameVs",
  "minigameHowTo",
  "minigameClose",
  "rpsRock",
  "rpsPaper",
  "rpsScissors",
  "rpsLizard",
  "rpsSpock",
  "rpsRound",
  "rpsScore",
  "rpsWinRound",
  "rpsLoseRound",
  "rpsTieRound",
  "rpsHowTitle",
  "rpsHowIntro",
  "rpsHowStone",
  "rpsHowParchment",
  "rpsHowDagger",
  "rpsHowSalamander",
  "rpsHowMage",
  "tttHowTitle",
  "tttHowIntro",
  "tttHowBody",
  "minigameVictory",
  "minigameDefeat",
  "minigameDraw",
  "minigameContinue",
  "minigameResultWin",
  "minigameResultLose",
  "minigameResultDraw",
] as const

describe("interactive minigame i18n", () => {
  it("localizes every new key in en and es", () => {
    for (const k of KEYS) {
      expect(makeT("en")(k).length).toBeGreaterThan(0)
      expect(makeT("es")(k).length).toBeGreaterThan(0)
      // The key must resolve to real text, never fall through to the raw key.
      expect(makeT("en")(k)).not.toBe(k)
      expect(makeT("es")(k)).not.toBe(k)
    }
  })
})

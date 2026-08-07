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
  "affinity_tier_nemesis",
  "affinity_tier_rival",
  "affinity_tier_wary",
  "affinity_tier_stranger",
  "affinity_tier_acquaintance",
  "affinity_tier_friend",
  "affinity_tier_devoted",
  "tooltip_relationships",
  "npcRole_mentor",
  "npcRole_friend",
  "npcRole_love_interest",
  "npcRole_nemesis",
  "npcRole_child",
  "npcRole_apprentice",
  "npcRole_ally",
  "npcRole_acquaintance",
  "bondPeak",
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

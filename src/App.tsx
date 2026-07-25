import { useEffect, useRef, useState } from "react"
import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Locale,
  RunType,
  ServedEvent,
} from "@shared/types"
import { api } from "./api"
import { makeT, t } from "./i18n/strings"
import { CreationScreen } from "./components/CreationScreen"
import { GameScreen } from "./components/GameScreen"
import { EndingScreen } from "./components/EndingScreen"
import { LeaderboardScreen } from "./components/LeaderboardScreen"
import { Toasts, useAchievementToasts } from "./components/Toasts"

type Screen = "creation" | "game" | "ending" | "leaderboard"

const RUN_KEY = "chronicle_run_id"
const LOCALE_KEY = "chronicle_locale"

interface EndingData {
  endingType: EndingType
  epilogue: string
  score: number
  achievements: AchievementContent[]
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(
    () => (localStorage.getItem(LOCALE_KEY) as Locale) || "en",
  )
  const [screen, setScreen] = useState<Screen>("creation")
  const [character, setCharacter] = useState<CharacterState | null>(null)
  const [event, setEvent] = useState<ServedEvent | null>(null)
  const [turnNarrative, setTurnNarrative] = useState<string | null>(null)
  const [ending, setEnding] = useState<EndingData | null>(null)
  const [resuming, setResuming] = useState(true)
  const runIdRef = useRef<string | null>(null)
  const { toasts, push: pushToasts, remove: dismissToast } = useAchievementToasts(
    (k) => makeT(locale)(k),
  )

  // Resume an in-progress run after reload.
  useEffect(() => {
    const stored = localStorage.getItem(RUN_KEY)
    if (!stored) {
      setResuming(false)
      return
    }
    runIdRef.current = stored
    api
      .state(stored)
      .then((s) => {
        setCharacter(s.character)
        if (s.finished || !s.event) {
          localStorage.removeItem(RUN_KEY)
          runIdRef.current = null
          setScreen("creation")
        } else {
          setEvent(s.event)
          setScreen("game")
        }
      })
      .catch(() => {
        localStorage.removeItem(RUN_KEY)
        runIdRef.current = null
      })
      .finally(() => setResuming(false))
  }, [])

  function changeLocale(next: Locale) {
    setLocale(next)
    localStorage.setItem(LOCALE_KEY, next)
  }

  async function startRun(name: string, classId: string, runType: RunType) {
    const res = await api.newRun({ name, classId, runType, locale })
    runIdRef.current = res.runId
    localStorage.setItem(RUN_KEY, res.runId)
    setCharacter(res.character)
    setEvent(res.event)
    setTurnNarrative(null)
    setEnding(null)
    setScreen("game")
  }

  async function choose(choiceId: string) {
    const runId = runIdRef.current
    if (!runId) return
    let res: Awaited<ReturnType<typeof api.choose>>
    try {
      res = await api.choose({ runId, choiceId, cardId: choiceId })
    } catch {
      // The run no longer exists (e.g. server data was reset). Recover by
      // clearing the stale run and returning to creation instead of throwing.
      localStorage.removeItem(RUN_KEY)
      runIdRef.current = null
      setCharacter(null)
      setEvent(null)
      setScreen("creation")
      return
    }
    setCharacter(res.character)
    pushToasts(res.newAchievements)

    if (res.ended && res.endingType) {
      localStorage.removeItem(RUN_KEY)
      setEnding({
        endingType: res.endingType,
        epilogue: res.epilogue ?? "",
        score: res.score ?? 0,
        achievements: res.newAchievements,
      })
      setScreen("ending")
      return
    }
    setTurnNarrative(res.narrative)
    if (res.event) setEvent(res.event)
  }

  function abandonRun() {
    localStorage.removeItem(RUN_KEY)
    runIdRef.current = null
    setCharacter(null)
    setEvent(null)
    setScreen("creation")
  }

  if (resuming) {
    return (
      <div className="boot-screen">
        <div className="boot-rune" aria-hidden="true">
          {"\u16B1"}
        </div>
        <p>{t(locale, "loading")}</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <button
          type="button"
          className="brand"
          onClick={() => (screen === "game" ? undefined : setScreen("creation"))}
        >
          <span className="brand-rune" aria-hidden="true">{"\u16B1"}</span>
          {t(locale, "appTitle")}
        </button>
        <div className="top-actions">
          {screen !== "leaderboard" && screen !== "game" && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setScreen("leaderboard")}
            >
              {t(locale, "leaderboard")}
            </button>
          )}
          <div className="locale-switch" role="group" aria-label="language">
            <button
              type="button"
              className={locale === "en" ? "active" : ""}
              onClick={() => changeLocale("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={locale === "es" ? "active" : ""}
              onClick={() => changeLocale("es")}
            >
              ES
            </button>
          </div>
        </div>
      </div>

      {screen === "creation" && (
        <CreationScreen locale={locale} onStart={startRun} />
      )}

      {screen === "game" && character && event && (
        <GameScreen
          locale={locale}
          character={character}
          event={event}
          narrative={null}
          turnNarrative={turnNarrative}
          onChoose={choose}
          onAbandon={abandonRun}
        />
      )}

      {screen === "ending" && character && ending && (
        <EndingScreen
          locale={locale}
          character={character}
          endingType={ending.endingType}
          epilogue={ending.epilogue}
          score={ending.score}
          achievements={ending.achievements}
          onNewRun={abandonRun}
          onLeaderboard={() => setScreen("leaderboard")}
        />
      )}

      {screen === "leaderboard" && (
        <LeaderboardScreen locale={locale} onBack={() => setScreen("creation")} />
      )}

      <Toasts items={toasts} onExpire={dismissToast} />
    </div>
  )
}

import { useEffect, useState } from "react"
import { styled, keyframes } from "styled-components"
import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Gender,
  Locale,
  RichEpilogueData,
  RunType,
  ServedEvent,
} from "@shared/types"
import { type AchievementView, api } from "./api"
import { makeT, t } from "./i18n/strings"
import { t as resolveLocaleMap } from "@shared/i18n"
import { CreationScreen } from "./components/CreationScreen"
import { GameScreen } from "./components/GameScreen"
import { AchievementsScreen } from "./components/AchievementsScreen"
import { EndingScreen } from "./components/EndingScreen"
import { LeaderboardScreen } from "./components/LeaderboardScreen"
import { CollectionScreen } from "./components/CollectionScreen"
import { ShopModal } from "./components/ShopModal"
import { Toasts, useAchievementToasts } from "./components/Toasts"
import { LinkBtn } from "./components/ui/Button"
/* import { LightRays } from "./components/ui/LightRays" */

type Screen = "creation" | "game" | "ending" | "leaderboard" | "achievements" | "collection"

const RUN_KEY = "chronicle_run_id"
const LOCALE_KEY = "chronicle_locale"
const ACH_KEY = "chronicle_last_achievements"

interface EndingData {
  endingType: EndingType
  epilogue: string
  score: number
  achievements: AchievementContent[]
  richEpilogueData?: RichEpilogueData
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
  const [shopOpen, setShopOpen] = useState(false)
  const [resuming, setResuming] = useState(() => localStorage.getItem(RUN_KEY) !== null)
  const [runId, setRunId] = useState<string | null>(() => localStorage.getItem(RUN_KEY))
  const [lastAchievements, setLastAchievements] = useState<AchievementView[]>(() => {
    try {
      const stored = localStorage.getItem(ACH_KEY)
      return stored ? (JSON.parse(stored) as AchievementView[]) : []
    } catch {
      return []
    }
  })
  const {
    toasts,
    push: pushToasts,
    remove: dismissToast,
  } = useAchievementToasts((k) => makeT(locale)(k))

  // Resume an in-progress run after reload.
  useEffect(() => {
    const stored = localStorage.getItem(RUN_KEY)
    if (!stored) return
    api
      .state(stored)
      .then((s) => {
        setCharacter(s.character)
        if (s.finished || !s.event) {
          localStorage.removeItem(RUN_KEY)
          setRunId(null)
          setScreen("creation")
        } else {
          setEvent(s.event)
          setScreen("game")
        }
      })
      .catch(() => {
        localStorage.removeItem(RUN_KEY)
        setRunId(null)
      })
      .finally(() => setResuming(false))
  }, [])

  function changeLocale(next: Locale) {
    setLocale(next)
    localStorage.setItem(LOCALE_KEY, next)
  }

  async function startRun(name: string, gender: Gender, classId: string, runType: RunType) {
    const res = await api.newRun({ name, gender, classId, runType, locale })
    setRunId(res.runId)
    localStorage.setItem(RUN_KEY, res.runId)
    setCharacter(res.character)
    setEvent(res.event)
    setTurnNarrative(null)
    setEnding(null)
    setScreen("game")
  }

  async function startRunWithArchetype(
    name: string,
    gender: Gender,
    classId: string,
    archetypeId: string,
    runType: RunType,
  ) {
    const res = await api.newRun({ name, gender, classId, archetypeId, runType, locale })
    setRunId(res.runId)
    localStorage.setItem(RUN_KEY, res.runId)
    setCharacter(res.character)
    setEvent(res.event)
    setTurnNarrative(null)
    setEnding(null)
    setScreen("game")
  }

  async function choose(choiceId: string) {
    const currentRunId = runId
    if (!currentRunId) return
    let res: Awaited<ReturnType<typeof api.choose>>
    try {
      res = await api.choose({ runId: currentRunId, choiceId, cardId: choiceId })
    } catch {
      // Check if the run still exists before abandoning.
      try {
        const state = await api.state(currentRunId)
        if (state.finished || !state.event) {
          throw new Error("run finished or gone")
        }
        // Run is still valid — transient error. Show a brief message.
        setTurnNarrative("The fates hesitate... try again.")
        return
      } catch {
        // Run truly gone (server restart, DB reset, etc.). Recover gracefully.
        localStorage.removeItem(RUN_KEY)
        setRunId(null)
        setCharacter(null)
        setEvent(null)
        setScreen("creation")
        return
      }
    }
    setCharacter(res.character)
    pushToasts(res.newAchievements)

    if (res.ended && res.endingType) {
      localStorage.removeItem(RUN_KEY)
      const fresh = res.newAchievements.map((a) => ({
        id: a.id,
        icon: a.icon,
        rarity: a.rarity,
        hidden: false,
        name: resolveLocaleMap(a.name, locale),
        description: resolveLocaleMap(a.description, locale),
      }))
      const merged = new Map<string, AchievementView>()
      for (const a of lastAchievements) merged.set(a.id, a)
      for (const a of fresh) merged.set(a.id, a)
      const all = [...merged.values()]
      localStorage.setItem(ACH_KEY, JSON.stringify(all))
      setLastAchievements(all)
      setEnding({
        endingType: res.endingType,
        epilogue: res.epilogue ?? "",
        score: res.score ?? 0,
        achievements: res.newAchievements,
        richEpilogueData: res.richEpilogueData,
      })
      setScreen("ending")
      return
    }
    setTurnNarrative(res.narrative)
    if (res.event) setEvent(res.event)
  }

  function abandonRun() {
    localStorage.removeItem(RUN_KEY)
    setRunId(null)
    setCharacter(null)
    setEvent(null)
    setScreen("creation")
  }

  if (resuming) {
    return (
      <>
        {/* <LightRays /> */}
        <BootScreen>
          <BootRune aria-hidden="true">{"\u16B1"}</BootRune>
          <p>{t(locale, "loading")}</p>
        </BootScreen>
      </>
    )
  }

  return (
    <>
      {/*       <LightRays /> */}
      <AppShell>
        <TopBar>
          <Brand
            type="button"
            onClick={() => (screen === "game" ? undefined : setScreen("creation"))}
          >
            <BrandRune aria-hidden="true">{"\u16B1"}</BrandRune>
            {t(locale, "appTitle")}
          </Brand>
          <TopActions>
            {screen !== "leaderboard" && screen !== "game" && (
              <LinkBtn type="button" onClick={() => setScreen("leaderboard")}>
                {t(locale, "leaderboard")}
              </LinkBtn>
            )}
            {screen !== "achievements" && screen !== "game" && (
              <LinkBtn type="button" onClick={() => setScreen("achievements")}>
                {t(locale, "achievementsTitle")}
              </LinkBtn>
            )}
            {screen !== "collection" && screen !== "game" && (
              <LinkBtn type="button" onClick={() => setScreen("collection")}>
                {t(locale, "trophyHall")}
              </LinkBtn>
            )}
            <LocaleSwitch role="group" aria-label="language">
              <LocaleBtn type="button" $active={locale === "en"} onClick={() => changeLocale("en")}>
                EN
              </LocaleBtn>
              <LocaleBtn type="button" $active={locale === "es"} onClick={() => changeLocale("es")}>
                ES
              </LocaleBtn>
            </LocaleSwitch>
          </TopActions>
        </TopBar>

        {screen === "creation" && (
          <CreationScreen
            locale={locale}
            onStart={startRun}
            onStartWithArchetype={startRunWithArchetype}
          />
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
            onShopOpen={() => setShopOpen(true)}
          />
        )}

        {screen === "game" && shopOpen && runId && (
          <ShopModal
            locale={locale}
            runId={runId}
            onClose={() => setShopOpen(false)}
            onPurchased={(res) => {
              setCharacter((prev) =>
                prev
                  ? { ...prev, gold: res.gold, inventory: res.inventory ?? prev.inventory }
                  : prev,
              )
            }}
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
            richEpilogueData={ending.richEpilogueData}
            onNewRun={abandonRun}
            onLeaderboard={() => setScreen("leaderboard")}
          />
        )}

        {screen === "leaderboard" && (
          <LeaderboardScreen locale={locale} onBack={() => setScreen("creation")} />
        )}

        {screen === "achievements" && (
          <AchievementsScreen
            locale={locale}
            achievements={lastAchievements}
            onBack={() => setScreen("creation")}
          />
        )}

        {screen === "collection" && (
          <CollectionScreen locale={locale} onBack={() => setScreen("creation")} />
        )}

        <Toasts items={toasts} onExpire={dismissToast} />
      </AppShell>
    </>
  )
}

const pulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(0.96); }
  50% { opacity: 1; transform: scale(1.04); }
`

const BootScreen = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-height: 70vh;
  gap: 16px;
  color: ${({ theme }) => theme.colors.muted};
`

const BootRune = styled.div`
  font-size: 48px;
  color: ${({ theme }) => theme.colors.gold};
  animation: ${pulse} 1.8s ease-in-out infinite;
`

const AppShell = styled.div`
  position: relative;
  z-index: 1;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 20px 80px;
  min-height: 100vh;
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 0 18px;
  margin-bottom: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  position: sticky;
  top: 0;
  z-index: 20;
`

const Brand = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.goldBright};
`

const BrandRune = styled.span`
  color: ${({ theme }) => theme.colors.gold};
  font-size: 20px;
  opacity: 0.85;
`

const TopActions = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`

const LocaleSwitch = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
`

const LocaleBtn = styled.button<{ $active: boolean }>`
  background: transparent;
  border: none;
  padding: 6px 12px;
  color: ${({ $active, theme }) => ($active ? theme.colors.ink : theme.colors.muted)};
  font-size: 13px;
  letter-spacing: 0.08em;
  transition:
    background 0.15s,
    color 0.15s;
  background: ${({ $active, theme }) => ($active ? theme.colors.gold : "transparent")};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
`

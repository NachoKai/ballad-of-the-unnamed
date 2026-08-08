import { useEffect, useState } from "react"
import { styled, keyframes } from "styled-components"
import { CircleHelp } from "lucide-react"
import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Gender,
  InteractiveMove,
  Locale,
  Origin,
  RichEpilogueData,
  RunType,
  ServedEvent,
} from "@shared/types"
import { type AchievementView, api, type MinigameMoveResponse } from "./api"
import { makeT, t } from "./i18n/strings"
import { t as resolveLocaleMap } from "@shared/i18n"
import { readUnlockedClasses, stampUnlockedClass } from "./lib/archetypeUnlocks"
import { CreationScreen } from "./components/CreationScreen"
import { GameScreen } from "./components/GameScreen"
import { AchievementsScreen } from "./components/AchievementsScreen"
import { EndingScreen } from "./components/EndingScreen"
import { LeaderboardScreen } from "./components/LeaderboardScreen"
import { CollectionScreen } from "./components/CollectionScreen"
import { TutorialModal } from "./components/TutorialModal"
import { ShopModal } from "./components/ShopModal"
import { DetailsModal } from "./components/DetailsModal"
import { Toasts, useAchievementToasts } from "./components/Toasts"
import { LinkBtn } from "./components/ui/Button"
import { ShinyText } from "./components/ui/ShinyText"
/* import { LightRays } from "./components/ui/LightRays" */

type Screen = "creation" | "game" | "ending" | "leaderboard" | "achievements" | "collection"

const RUN_KEY = "chronicle_run_id"
const LOCALE_KEY = "chronicle_locale"
const ACH_KEY = "chronicle_last_achievements"
const TUTORIAL_SEEN_KEY = "chronicle_tutorial_seen"

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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [canBuy, setCanBuy] = useState(false)
  // Auto-show the tutorial on first visit only (no saved flag). Afterwards the
  // modal is still reopenable any time via "How to play".
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(
    () => !localStorage.getItem(TUTORIAL_SEEN_KEY),
  )
  const [menuOpen, setMenuOpen] = useState(false)
  // Result of the final move of an interactive minigame (banner + next event).
  const [pendingMinigameResult, setPendingMinigameResult] = useState<MinigameMoveResponse | null>(
    null,
  )
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
    pushCustom: pushCustomToast,
    remove: dismissToast,
  } = useAchievementToasts(locale, (k) => makeT(locale)(k))

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

  // Refetch shop availability whenever gold or inventory changes so the HUD
  // button can signal when something affordable and unowned exists.
  const shopSignal = character
    ? `${character.gold}|${(character.inventory ?? []).map((i) => `${i.itemId}:${i.qty}`).join(",")}`
    : ""
  useEffect(() => {
    if (screen !== "game" || !runId) return
    let cancelled = false
    api
      .shop(runId)
      .then((res) => {
        if (!cancelled) {
          setCanBuy(res.items.some((i) => i.owned === 0 && res.gold >= i.cost))
        }
      })
      .catch(() => {
        if (!cancelled) setCanBuy(false)
      })
    return () => {
      cancelled = true
    }
  }, [runId, screen, shopSignal])

  async function startRun(
    name: string,
    gender: Gender,
    classId: string,
    runType: RunType,
    origin: Origin,
  ) {
    const res = await api.newRun({
      name,
      gender,
      classId,
      origin,
      runType,
      locale,
      unlockedClasses: readUnlockedClasses(),
    })
    setRunId(res.runId)
    setCanBuy(false)
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
    origin: Origin,
  ) {
    const res = await api.newRun({
      name,
      gender,
      classId,
      archetypeId,
      origin,
      runType,
      locale,
      unlockedClasses: readUnlockedClasses(),
    })
    setRunId(res.runId)
    setCanBuy(false)
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
      // Hidden master archetypes: finishing a run with a class unlocks its
      // master archetype on this browser (first finish per class only).
      if (stampUnlockedClass(res.character.class)) {
        pushCustomToast([
          {
            icon: "key-round",
            title: t(locale, "newArchetypeUnlocked"),
            desc: `${t(locale, `class_${res.character.class}`)} · ${t(locale, "masterArchetype")}`,
          },
        ])
      }
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

  // One move of an interactive minigame. The final move resolves the outcome;
  // its payload is stashed so the game frame can show the result banner, and
  // applied when the player clicks Continue (onMinigameFinished).
  async function minigameMove(move: InteractiveMove): Promise<MinigameMoveResponse> {
    const currentRunId = runId
    if (!currentRunId) return { status: "playing" } as MinigameMoveResponse
    try {
      const res = await api.minigameMove({ runId: currentRunId, move })
      if (res.status === "finished") {
        setPendingMinigameResult(res)
      }
      return res
    } catch {
      // Mirror /choose recovery: transient error or the run is gone.
      try {
        const state = await api.state(currentRunId)
        if (state.finished || !state.event) throw new Error("run finished or gone")
        setTurnNarrative("The fates hesitate... try again.")
        return { status: "playing" } as MinigameMoveResponse
      } catch {
        localStorage.removeItem(RUN_KEY)
        setRunId(null)
        setCharacter(null)
        setEvent(null)
        setScreen("creation")
        return { status: "playing" } as MinigameMoveResponse
      }
    }
  }

  // Apply the finished minigame payload: fresh character, toasts, and either
  // the next event or the ending — mirroring the /choose handler.
  function applyMinigameResult(res: MinigameMoveResponse) {
    setPendingMinigameResult(null)
    if (!res.character) return
    setCharacter(res.character)
    pushToasts(res.newAchievements ?? [])

    if (res.ended && res.endingType) {
      localStorage.removeItem(RUN_KEY)
      if (res.character && stampUnlockedClass(res.character.class)) {
        pushCustomToast([
          {
            icon: "key-round",
            title: t(locale, "newArchetypeUnlocked"),
            desc: `${t(locale, `class_${res.character.class}`)} · ${t(locale, "masterArchetype")}`,
          },
        ])
      }
      const fresh = (res.newAchievements ?? []).map((a) => ({
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
        achievements: res.newAchievements ?? [],
        richEpilogueData: res.richEpilogueData,
      })
      setScreen("ending")
      return
    }
    setTurnNarrative(res.narrative ?? null)
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
            <ShinyText>{t(locale, "appTitle")}</ShinyText>
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
            <HelpBtn
              type="button"
              onClick={() => setTutorialOpen(true)}
              aria-label={t(locale, "howToPlay")}
            >
              <CircleHelp size={18} aria-hidden="true" />
            </HelpBtn>
            <LocaleSwitch role="group" aria-label="language">
              <LocaleBtn type="button" $active={locale === "en"} onClick={() => changeLocale("en")}>
                EN
              </LocaleBtn>
              <LocaleBtn type="button" $active={locale === "es"} onClick={() => changeLocale("es")}>
                ES
              </LocaleBtn>
            </LocaleSwitch>
          </TopActions>
          <HamburgerBtn
            type="button"
            aria-label={menuOpen ? t(locale, "closeMenu") : t(locale, "openMenu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <HamburgerLine $open={menuOpen} />
            <HamburgerLine $open={menuOpen} />
            <HamburgerLine $open={menuOpen} />
          </HamburgerBtn>
          {menuOpen && (
            <MobileMenu role="menu">
              {screen !== "leaderboard" && screen !== "game" && (
                <MobileLink
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setScreen("leaderboard")
                  }}
                >
                  {t(locale, "leaderboard")}
                </MobileLink>
              )}
              {screen !== "achievements" && screen !== "game" && (
                <MobileLink
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setScreen("achievements")
                  }}
                >
                  {t(locale, "achievementsTitle")}
                </MobileLink>
              )}
              {screen !== "collection" && screen !== "game" && (
                <MobileLink
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setScreen("collection")
                  }}
                >
                  {t(locale, "trophyHall")}
                </MobileLink>
              )}
              <MobileLink
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setTutorialOpen(true)
                }}
              >
                {t(locale, "howToPlay")}
              </MobileLink>
              <LocaleSwitch role="group" aria-label="language">
                <LocaleBtn
                  type="button"
                  $active={locale === "en"}
                  onClick={() => changeLocale("en")}
                >
                  EN
                </LocaleBtn>
                <LocaleBtn
                  type="button"
                  $active={locale === "es"}
                  onClick={() => changeLocale("es")}
                >
                  ES
                </LocaleBtn>
              </LocaleSwitch>
            </MobileMenu>
          )}
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
            onMinigameMove={minigameMove}
            onMinigameFinished={() => {
              if (pendingMinigameResult) applyMinigameResult(pendingMinigameResult)
            }}
            minigameFinishedResult={pendingMinigameResult}
            onAbandon={abandonRun}
            onShopOpen={() => setShopOpen(true)}
            onDetailsOpen={() => setDetailsOpen(true)}
            canBuy={canBuy}
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
              if (res.newAchievements?.length) pushToasts(res.newAchievements)
            }}
          />
        )}

        {screen === "game" && detailsOpen && character && (
          <DetailsModal
            locale={locale}
            character={character}
            onClose={() => setDetailsOpen(false)}
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

        {tutorialOpen && (
          <TutorialModal
            locale={locale}
            onClose={() => {
              try {
                localStorage.setItem(TUTORIAL_SEEN_KEY, "1")
              } catch {
                /* storage unavailable — still allow dismissing */
              }
              setTutorialOpen(false)
            }}
          />
        )}
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
  font-size: 49px;
  color: ${({ theme }) => theme.colors.gold};
  animation: ${pulse} 1.8s ease-in-out infinite;
`

const AppShell = styled.div`
  position: relative;
  z-index: 1;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 20px 80px;
  min-height: 100vh;
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 8px 18px;
  margin-bottom: 12px;
  background: rgba(20, 17, 13, 0.82);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  position: sticky;
  top: 0;
  z-index: 20;
`

const Brand = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  background: none;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.goldBright};

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 680px) {
    font-size: 18px;
    gap: 8px;
  }
`

const BrandRune = styled.span`
  color: ${({ theme }) => theme.colors.gold};
  font-size: 21px;
  opacity: 0.85;
`

const TopActions = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;

  @media (max-width: 680px) {
    display: none;
  }
`

const HamburgerBtn = styled.button`
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: pointer;

  @media (max-width: 680px) {
    display: inline-flex;
  }
`

const HamburgerLine = styled.span<{ $open: boolean }>`
  width: 20px;
  height: 2px;
  background: ${({ theme }) => theme.colors.gold};
  border-radius: 2px;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;

  &:nth-child(1) {
    transform: ${({ $open }) => ($open ? "translateY(7px) rotate(45deg)" : "none")};
  }

  &:nth-child(2) {
    opacity: ${({ $open }) => ($open ? 0 : 1)};
  }

  &:nth-child(3) {
    transform: ${({ $open }) => ($open ? "translateY(-7px) rotate(-45deg)" : "none")};
  }
`

const MobileMenu = styled.div`
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 10px;
  background: rgba(29, 25, 19, 0.97);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  box-shadow: ${({ theme }) => theme.shadow};
  z-index: 25;

  @media (max-width: 680px) {
    display: flex;
  }
`

const MobileLink = styled.button`
  background: none;
  border: 1px solid transparent;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 12px 14px;
  text-align: left;
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 17px;
  letter-spacing: 0.03em;
  transition:
    color 0.15s,
    border-color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.goldBright};
    border-color: ${({ theme }) => theme.colors.line2};
  }
`

const HelpBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.goldBright};
    border-color: ${({ theme }) => theme.colors.gold};
  }
`

const LocaleSwitch = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;

  @media (max-width: 680px) {
    display: flex;
    width: 100%;
    margin-top: 4px;
  }
`

const LocaleBtn = styled.button<{ $active: boolean }>`
  background: transparent;
  border: none;
  padding: 6px 12px;
  color: ${({ $active, theme }) => ($active ? theme.colors.ink : theme.colors.muted)};
  font-size: 12px;
  letter-spacing: 0.08em;
  transition:
    background 0.15s,
    color 0.15s;
  background: ${({ $active, theme }) => ($active ? theme.colors.gold : "transparent")};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};

  @media (max-width: 680px) {
    flex: 1;
    padding: 10px 12px;
    font-size: 13px;
  }
`

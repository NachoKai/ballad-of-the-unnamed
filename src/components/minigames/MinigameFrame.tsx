import { useState } from "react"
import { styled } from "styled-components"
import { HelpCircle, Swords } from "lucide-react"
import type { InteractiveMove, Locale, ServedEvent, ServedInteractiveState } from "@shared/types"
import type { MinigameMoveResponse } from "../../api"
import { t } from "../../i18n/strings"
import { LinkBtn } from "../ui/Button"
import { rise } from "../ui/Animation"
import { TicTacToeGame } from "./TicTacToeGame"
import { RpsGame } from "./RpsGame"
import { HowToModal } from "./HowToModal"

interface Props {
  locale: Locale
  event: ServedEvent
  onMove: (move: InteractiveMove) => Promise<MinigameMoveResponse>
  onFinished: () => void
  finishedResult: MinigameMoveResponse | null
}

export function MinigameFrame({ locale, event, onMove, onFinished, finishedResult }: Props) {
  const [view, setView] = useState<ServedInteractiveState>(event.interactive!.view)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showHowTo, setShowHowTo] = useState(false)

  async function handle(move: InteractiveMove) {
    if (busy) return
    setBusy(true)
    try {
      const res = await onMove(move)
      if (res.status === "playing" && res.minigame) {
        setView(res.minigame.view)
        setFeedback(res.feedback ?? null)
      } else if (res.status === "finished" && res.minigame) {
        // Final board arrives with the outcome so the banner shows the game
        // as it ended (the last move never returns as a "playing" frame).
        setView(res.minigame.view)
      }
    } finally {
      setBusy(false)
    }
  }

  const opponentName = event.interactive!.opponentName

  // Match over: result banner + localized outcome narrative + Continue.
  if (finishedResult) {
    const finalView = finishedResult.minigame?.view ?? view
    const won = finalView.result === "player_win"
    const draw = finalView.result === "draw"
    const tone = won ? "win" : draw ? "draw" : "lose"
    return (
      <Frame>
        <ResultCard $tone={tone}>
          <ResultTitle>{t(locale, won ? "minigameVictory" : draw ? "minigameDraw" : "minigameDefeat")}</ResultTitle>
          <ResultSub>
            {t(
              locale,
              won
                ? "minigameResultWin"
                : draw
                  ? "minigameResultDraw"
                  : "minigameResultLose",
            )}
          </ResultSub>
          {finalView.game === "tictactoe" ? (
            <TicTacToeGame
              locale={locale}
              view={finalView}
              busy
              onCell={() => {}}
              feedback={null}
            />
          ) : (
            <RpsGame locale={locale} view={finalView} busy onChoice={() => {}} feedback={null} />
          )}
          {finishedResult.narrative && <Narrative>{finishedResult.narrative}</Narrative>}
          <ContinueBtn type="button" onClick={onFinished}>
            {t(locale, "minigameContinue")}
          </ContinueBtn>
        </ResultCard>
      </Frame>
    )
  }

  return (
    <Frame>
      <OpponentHeader>
        <OpponentIcon>
          <Swords size={16} strokeWidth={2} aria-hidden="true" />
        </OpponentIcon>
        <OpponentName>{opponentName}</OpponentName>
        <Hint>{t(locale, "minigameChooseMove")}</Hint>
        <HowToBtn type="button" onClick={() => setShowHowTo(true)}>
          <HelpCircle size={15} strokeWidth={2} aria-hidden="true" />
          {t(locale, "minigameHowTo")}
        </HowToBtn>
      </OpponentHeader>
      {showHowTo && (
        <HowToModal locale={locale} game={view.game} onClose={() => setShowHowTo(false)} />
      )}
      {view.game === "tictactoe" ? (
        <TicTacToeGame
          locale={locale}
          view={view}
          busy={busy}
          onCell={(cell) => handle({ kind: "tictactoe", cell })}
          feedback={feedback}
        />
      ) : (
        <RpsGame
          locale={locale}
          view={view}
          busy={busy}
          onChoice={(choice) => handle({ kind: "rps", choice })}
          feedback={feedback}
        />
      )}
    </Frame>
  )
}

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 24px;
  margin-bottom: 18px;
  animation: ${rise} 0.35s ease both;
`

const OpponentHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 18px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: linear-gradient(
    180deg,
    rgba(201, 164, 76, 0.08),
    rgba(201, 164, 76, 0.02)
  );
`

const OpponentIcon = styled.span`
  display: inline-flex;
  color: ${({ theme }) => theme.colors.gold};
`

const OpponentName = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.parchment};
`

const Hint = styled.span`
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
`

const HowToBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  margin-left: 4px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
    background: rgba(201, 164, 76, 0.08);
  }
`

const TONE: Record<string, { color: string; bg: string }> = {
  win: { color: "#6f8f6a", bg: "rgba(111, 143, 106, 0.08)" },
  draw: { color: "#c9a44c", bg: "rgba(201, 164, 76, 0.08)" },
  lose: { color: "#c85a5a", bg: "rgba(200, 90, 90, 0.08)" },
}

const ResultCard = styled.div<{ $tone: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 26px 22px;
  border: 1px solid ${({ $tone }) => TONE[$tone].color};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ $tone }) => TONE[$tone].bg};
  box-shadow: ${({ theme }) => theme.shadow};
`

const ResultTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.parchment};
`

const ResultSub = styled.div`
  font-size: 14px;
  font-style: italic;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 6px;
`

const Narrative = styled.div`
  max-width: 520px;
  text-align: center;
  font-size: 17px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.parchment};
  padding: 14px 18px;
  border-left: 2px solid ${({ theme }) => theme.colors.line2};
  background: rgba(0, 0, 0, 0.18);
  border-radius: 0 ${({ theme }) => theme.radii.sm} ${({ theme }) => theme.radii.sm} 0;
`

const ContinueBtn = styled(LinkBtn)`
  margin-top: 6px;
  padding: 12px 34px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 17px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.parchmentDim};

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
    background: rgba(201, 164, 76, 0.06);
  }
`

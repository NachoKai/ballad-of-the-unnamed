import { keyframes, styled } from "styled-components"
import { Mountain, ScrollText, Sword, Flame, Wand } from "lucide-react"
import type { Locale, RpsChoice, ServedInteractiveState } from "@shared/types"
import { t } from "../../i18n/strings"

type RpsView = Extract<ServedInteractiveState, { game: "rps" }>

interface Props {
  locale: Locale
  view: RpsView
  busy: boolean
  onChoice: (choice: RpsChoice) => void
  feedback: string | null
}

const CHOICES: { id: RpsChoice; icon: typeof Mountain; labelKey: string }[] = [
  { id: "rock", icon: Mountain, labelKey: "rpsRock" },
  { id: "paper", icon: ScrollText, labelKey: "rpsPaper" },
  { id: "scissors", icon: Sword, labelKey: "rpsScissors" },
  { id: "lizard", icon: Flame, labelKey: "rpsLizard" },
  { id: "spock", icon: Wand, labelKey: "rpsSpock" },
]

const LABEL_KEYS: Record<RpsChoice, string> = {
  rock: "rpsRock",
  paper: "rpsPaper",
  scissors: "rpsScissors",
  lizard: "rpsLizard",
  spock: "rpsSpock",
}

function choiceLabel(locale: Locale, choice: RpsChoice): string {
  return t(locale, LABEL_KEYS[choice])
}

export function RpsGame({ locale, view, busy, onChoice, feedback }: Props) {
  const last = view.lastRound
  return (
    <Game>
      <ScoreLine>
        {/* Round counts rounds played (ties included), so it can exceed the
            round-win target — show it without the "/ bestOf" suffix. */}
        <RoundInfo>
          {t(locale, "rpsRound")} {view.round}
        </RoundInfo>
        <ScoreInfo>
          {t(locale, "rpsScore")}: <b>{view.playerWins}</b>
          <ScoreDash aria-hidden="true">—</ScoreDash>
          <b>{view.rivalWins}</b>
        </ScoreInfo>
      </ScoreLine>

      <Choices role="group" aria-label="five-hand-signs">
        {CHOICES.map((c) => {
          const Icon = c.icon
          return (
            <ChoiceBtn
              key={c.id}
              type="button"
              disabled={busy || view.over}
              onClick={() => onChoice(c.id)}
            >
              <Icon size={30} strokeWidth={1.8} aria-hidden="true" />
              <ChoiceLabel>{t(locale, c.labelKey)}</ChoiceLabel>
            </ChoiceBtn>
          )
        })}
      </Choices>

      {last && (
        <LastRound $result={last.result}>
          <LastMoves>
            <MoveName>{choiceLabel(locale, last.player)}</MoveName>
            <MoveVs>{t(locale, "minigameVs")}</MoveVs>
            <MoveName>{choiceLabel(locale, last.rival)}</MoveName>
          </LastMoves>
          <LastVerdict>
            {t(
              locale,
              last.result === "win"
                ? "rpsWinRound"
                : last.result === "loss"
                  ? "rpsLoseRound"
                  : "rpsTieRound",
            )}
          </LastVerdict>
        </LastRound>
      )}
      {feedback && <Feedback>{feedback}</Feedback>}
    </Game>
  )
}

const Game = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`

const ScoreLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: min(360px, 100%);
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const RoundInfo = styled.span`
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const ScoreInfo = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};

  b {
    font-size: 18px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
  }
`

const ScoreDash = styled.span`
  color: ${({ theme }) => theme.colors.gold};
`

const Choices = styled.div`
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
`

const ChoiceBtn = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 92px;
  padding: 15px 12px;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.lg};
  color: ${({ theme }) => theme.colors.parchment};
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.12s,
    box-shadow 0.15s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    background: ${({ theme }) => theme.colors.panel2};
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(201, 164, 76, 0.12);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const ChoiceLabel = styled.span`
  font-size: 14px;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const RESULT_COLOR: Record<string, string> = {
  win: "#6f8f6a",
  loss: "#c85a5a",
  tie: "#c9a44c",
}

const roundIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

const LastRound = styled.div<{ $result: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: min(360px, 100%);
  padding: 10px 16px;
  border: 1px solid ${({ $result }) => RESULT_COLOR[$result] ?? "#9c8f74"};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $result }) => `${RESULT_COLOR[$result] ?? "#9c8f74"}14`};
  animation: ${roundIn} 0.25s ease both;
`

const LastMoves = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

const MoveName = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.parchment};
`

const MoveVs = styled.span`
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted2};
`

const LastVerdict = styled.span`
  font-size: 13px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted};
`

const Feedback = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  font-style: italic;
  text-align: center;
`

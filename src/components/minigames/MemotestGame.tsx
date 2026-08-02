import { keyframes, styled } from "styled-components"
import {
  Crown,
  Egg,
  Flame,
  FlaskConical,
  Gem,
  ScrollText,
  Shield,
  Sword,
} from "lucide-react"
import type { Locale, MemotestFace, ServedInteractiveState } from "@shared/types"
import { t } from "../../i18n/strings"

type MemoView = Extract<ServedInteractiveState, { game: "memotest" }>

interface Props {
  locale: Locale
  view: MemoView
  busy: boolean
  onCard: (card: number) => void
  feedback: string | null
}

const FACE_ICONS: Record<MemotestFace, typeof Egg> = {
  dragon_egg: Egg,
  sword: Sword,
  crown: Crown,
  potion: FlaskConical,
  phoenix: Flame,
  shield: Shield,
  scroll: ScrollText,
  gem: Gem,
}

const FACE_KEYS: Record<MemotestFace, string> = {
  dragon_egg: "memFaceDragonEgg",
  sword: "memFaceSword",
  crown: "memFaceCrown",
  potion: "memFacePotion",
  phoenix: "memFacePhoenix",
  shield: "memFaceShield",
  scroll: "memFaceScroll",
  gem: "memFaceGem",
}

// Pure helpers (unit-tested): whether a card is currently visible, and the
// row-major index grid for a square board.
export function isFaceUp(view: MemoView, index: number): boolean {
  return view.matched.includes(index) || view.revealed.includes(index)
}

export function cardRows(size: number, count: number): number[][] {
  const rows: number[][] = []
  for (let r = 0; r < size; r++) {
    const row: number[] = []
    for (let c = 0; c < size; c++) {
      const idx = r * size + c
      if (idx < count) row.push(idx)
    }
    if (row.length > 0) rows.push(row)
  }
  return rows
}

export function MemotestGame({ locale, view, busy, onCard, feedback }: Props) {
  const rows = cardRows(view.size, view.size * view.size)
  const pickHint = view.revealed.length === 0 ? "minigameChooseMove" : "memPickSecond"
  const lastPlayer = view.lastPlayerTurn
  const lastRival = view.lastRivalTurn
  return (
    <BoardWrap>
      <ScoreLine>
        <RoundInfo>
          {t(locale, "memPairs")}: <b>{view.pairsTotal}</b>
        </RoundInfo>
        <ScoreInfo>
          {t(locale, "memYou")}: <b>{view.playerPairs}</b>
          <ScoreDash aria-hidden="true">—</ScoreDash>
          <b>{view.rivalPairs}</b>
          <ScoreOpp>{t(locale, "rival")}</ScoreOpp>
        </ScoreInfo>
      </ScoreLine>

      <Board role="group" aria-label="relic memotest">
        {rows.map((row, r) => (
          <Row key={r}>
            {row.map((idx) => {
              const face = isFaceUp(view, idx) ? view.faces[idx] : null
              const matched = view.matched.includes(idx)
              const Icon = face ? FACE_ICONS[face] : null
              return (
                <Card
                  key={idx}
                  type="button"
                  disabled={busy || view.over || face !== null}
                  onClick={() => onCard(idx)}
                  aria-label={face ? t(locale, FACE_KEYS[face]) : `tile ${idx}`}
                  $state={face === null ? "down" : matched ? "matched" : "revealed"}
                >
                  {Icon ? (
                    <Icon size={30} strokeWidth={1.7} aria-hidden="true" />
                  ) : (
                    <CardBackRune aria-hidden="true">{"\u16B1"}</CardBackRune>
                  )}
                </Card>
              )
            })}
          </Row>
        ))}
      </Board>

      {!view.over && (
        <Hint $busy={busy}>{busy ? t(locale, "minigameRivalTurn") : t(locale, pickHint)}</Hint>
      )}

      {lastPlayer && (
        <TurnStrip $tone={lastPlayer.matched ? "win" : "miss"}>
          <TurnMoves>
            {lastPlayer.cards.map((idx) => {
              const face = lastPlayer.faces[idx]
              const Icon = face ? FACE_ICONS[face] : null
              return (
                <TurnChip key={idx}>
                  {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
                  {face ? t(locale, FACE_KEYS[face]) : ""}
                </TurnChip>
              )
            })}
          </TurnMoves>
          <TurnVerdict>{t(locale, lastPlayer.matched ? "memMatched" : "memMissed")}</TurnVerdict>
        </TurnStrip>
      )}

      {lastRival && (
        <TurnStrip $tone={lastRival.matched ? "win" : "miss"}>
          <TurnMoves>
            {lastRival.cards.map((idx) => {
              const face = lastRival.faces[idx]
              const Icon = face ? FACE_ICONS[face] : null
              return (
                <TurnChip key={idx}>
                  {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
                  {face ? t(locale, FACE_KEYS[face]) : ""}
                </TurnChip>
              )
            })}
          </TurnMoves>
          <TurnVerdict>{t(locale, lastRival.matched ? "memRivalMatched" : "memRivalMissed")}</TurnVerdict>
        </TurnStrip>
      )}

      {feedback && <Feedback>{feedback}</Feedback>}
    </BoardWrap>
  )
}

const BoardWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
`

const ScoreLine = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: min(380px, 100%);
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

  b {
    color: ${({ theme }) => theme.colors.parchment};
  }
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

const ScoreOpp = styled.span`
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  width: min(420px, 100%);
  padding: 16px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: inset 0 2px 14px rgba(0, 0, 0, 0.35);
`

const Row = styled.div`
  display: contents;
`

const flipIn = keyframes`
  from {
    opacity: 0;
    transform: rotateY(70deg) scale(0.92);
  }
  to {
    opacity: 1;
    transform: rotateY(0) scale(1);
  }
`

const CARD_TONE: Record<string, { bg: string; border: string; color: string }> = {
  down: { bg: "rgba(201, 164, 76, 0.06)", border: "#3a3126", color: "#6b5d45" },
  revealed: { bg: "rgba(201, 164, 76, 0.14)", border: "#c9a44c", color: "#c9a44c" },
  matched: { bg: "rgba(111, 143, 106, 0.16)", border: "#6f8f6a", color: "#9fc08f" },
}

const Card = styled.button<{ $state: "down" | "revealed" | "matched" }>`
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: ${({ $state }) => CARD_TONE[$state].bg};
  border: 1px solid ${({ $state }) => CARD_TONE[$state].border};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ $state }) => CARD_TONE[$state].color};
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.1s,
    box-shadow 0.15s;
  animation: ${flipIn} 0.28s ease both;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    background: ${({ theme }) => theme.colors.panel2};
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(201, 164, 76, 0.12);
  }

  &:active:not(:disabled) {
    transform: scale(0.94);
  }
`

const CardBackRune = styled.span`
  font-size: 26px;
  opacity: 0.75;
`

const Hint = styled.div<{ $busy: boolean }>`
  color: ${({ theme, $busy }) => ($busy ? theme.colors.gold : theme.colors.muted)};
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  animation: ${({ $busy }) => ($busy ? rivalPulse : "none")} 1.3s ease-in-out infinite;
`

const rivalPulse = keyframes`
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
`

const TURN_TONE: Record<string, { color: string; bg: string }> = {
  win: { color: "#6f8f6a", bg: "rgba(111, 143, 106, 0.1)" },
  miss: { color: "#c85a5a", bg: "rgba(200, 90, 90, 0.08)" },
}

const TurnStrip = styled.div<{ $tone: string }>`
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(420px, 100%);
  padding: 8px 14px;
  border: 1px solid ${({ $tone }) => TURN_TONE[$tone].color};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $tone }) => TURN_TONE[$tone].bg};
  animation: ${flipIn} 0.25s ease both;
`

const TurnMoves = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const TurnChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  font-size: 13px;
  letter-spacing: 0.04em;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  color: ${({ theme }) => theme.colors.parchment};
`

const TurnVerdict = styled.span`
  margin-left: auto;
  font-size: 13px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted};
  text-align: right;
`

const Feedback = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  font-style: italic;
  text-align: center;
`

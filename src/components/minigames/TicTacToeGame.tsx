import { keyframes, styled } from "styled-components"
import { Sun, Moon } from "lucide-react"
import type { Locale, ServedInteractiveState } from "@shared/types"
import { t } from "../../i18n/strings"

type TttView = Extract<ServedInteractiveState, { game: "tictactoe" }>

interface Props {
  locale: Locale
  view: TttView
  busy: boolean
  onCell: (cell: number) => void
  feedback: string | null
}

// Pure helper: split a flat 9-cell board into 3 rows (unit-tested).
export function boardToRows(board: Array<"X" | "O" | null>): Array<Array<"X" | "O" | null>> {
  const rows: Array<Array<"X" | "O" | null>> = []
  for (let r = 0; r < 3; r++) rows.push(board.slice(r * 3, r * 3 + 3))
  return rows
}

export function TicTacToeGame({ locale, view, busy, onCell, feedback }: Props) {
  const rows = boardToRows(view.board)
  return (
    <BoardWrap>
      <Board role="group" aria-label="tic-tac-toe">
        {rows.map((row, r) => (
          <Row key={r}>
            {row.map((cell, c) => {
              const idx = r * 3 + c
              const taken = cell !== null
              return (
                <Cell
                  key={idx}
                  type="button"
                  disabled={busy || taken || view.over}
                  onClick={() => onCell(idx)}
                  aria-label={`cell ${idx}`}
                  $mark={cell}
                >
                  {cell === "X" ? (
                    // The player's Sun, the rival's Moon — thematic marks over
                    // the engine's neutral X/O.
                    <Sun size={36} strokeWidth={2.2} aria-hidden="true" />
                  ) : cell === "O" ? (
                    <Moon size={36} strokeWidth={2.2} aria-hidden="true" />
                  ) : null}
                </Cell>
              )
            })}
          </Row>
        ))}
      </Board>
      {busy && !view.over && <RivalTurn>{t(locale, "minigameRivalTurn")}</RivalTurn>}
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

const Board = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  width: min(320px, 100%);
  padding: 14px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: inset 0 2px 14px rgba(0, 0, 0, 0.35);
`

const Row = styled.div`
  display: contents;
`

const Cell = styled.button<{ $mark: "X" | "O" | null }>`
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme, $mark }) => ($mark === "X" ? theme.colors.goldBright : theme.colors.sage)};
  cursor: ${({ disabled }) => (disabled ? "default" : "pointer")};
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.1s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    background: ${({ theme }) => theme.colors.panel2};
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }
`

const rivalPulse = keyframes`
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
`

const RivalTurn = styled.div`
  color: ${({ theme }) => theme.colors.gold};
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  animation: ${rivalPulse} 1.3s ease-in-out infinite;
`

const Feedback = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  font-style: italic;
  text-align: center;
`

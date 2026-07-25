import { useEffect, useState } from "react"
import { styled, keyframes } from "styled-components"
import type { EndingType, Locale, RunType } from "@shared/types"
import { api, type LeaderboardEntryView } from "../api"
import { t } from "../i18n/strings"
import { BtnGhost } from "./ui/Button"
import { TextBalance } from "./ui/Text"

interface Props {
  locale: Locale
  onBack: () => void
}

const ENDING_COLOR: Record<EndingType, string> = {
  heroic_death: "#c85a5a",
  peaceful_retirement: "#6f8f6a",
  other_death: "#7d715a",
  other_retirement: "#b6a889",
}

export function LeaderboardScreen({ locale, onBack }: Props) {
  const [runType, setRunType] = useState<RunType>("standard")
  const [entries, setEntries] = useState<LeaderboardEntryView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    api
      .leaderboard(runType, locale)
      .then((r) => {
        if (alive) setEntries(r.entries)
      })
      .catch((e) => {
        if (alive) setError((e as Error).message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [runType, locale])

  return (
    <BoardScreen>
      <BoardHeader>
        <h1>{t(locale, "leaderboardTitle")}</h1>
        <BoardTabs role="tablist">
          <TabBtn
            type="button"
            role="tab"
            $active={runType === "standard"}
            aria-selected={runType === "standard"}
            onClick={() => setRunType("standard")}
          >
            {t(locale, "standardRuns")}
          </TabBtn>
          <TabBtn
            type="button"
            role="tab"
            $active={runType === "daily"}
            aria-selected={runType === "daily"}
            onClick={() => setRunType("daily")}
          >
            {t(locale, "dailyRuns")}
          </TabBtn>
        </BoardTabs>
      </BoardHeader>

      {loading && <BoardMsg>{t(locale, "loading")}</BoardMsg>}
      {error && <BoardError>{error}</BoardError>}

      {!loading && !error && entries.length === 0 && (
        <BoardMsg>{t(locale, "noEntries")}</BoardMsg>
      )}

      {!loading && entries.length > 0 && (
        <BoardTable role="table">
          <BoardRowHead role="row">
            <span>#</span>
            <span>{t(locale, "name")}</span>
            <span>{t(locale, "classLabel")}</span>
            <span>{t(locale, "endingLabel")}</span>
            <NumCell>{t(locale, "ageShort")}</NumCell>
            <NumCell>{t(locale, "scoreLabel")}</NumCell>
          </BoardRowHead>
          {entries.map((e) => (
            <BoardRow role="row" key={e.id}>
              <Rank $rank={e.rank <= 3 ? e.rank : undefined}>{e.rank}</Rank>
              <CellName>{e.name}</CellName>
              <span>{t(locale, `class_${e.class}` as never)}</span>
              <EndingTag $ending={e.endingType}>
                {t(locale, `ending_${e.endingType}` as never)}
              </EndingTag>
              <NumCell>{e.ageAtEnd}</NumCell>
              <ScoreNum>{e.score.toLocaleString()}</ScoreNum>
            </BoardRow>
          ))}
        </BoardTable>
      )}

      <BackBtn type="button" onClick={onBack}>
        {t(locale, "back")}
      </BackBtn>
    </BoardScreen>
  )
}

const rise = keyframes`
  from { opacity: 0; transform: translateY(10px); }
`;

const BoardScreen = styled.div`
  animation: ${rise} 0.4s ease both;
`

const BoardHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 18px;

  h1 {
    font-size: clamp(26px, 4vw, 38px);
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

const BoardTabs = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
  margin-bottom: 16px;
`

const TabBtn = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.colors.gold : "transparent")};
  border: none;
  padding: 9px 18px;
  color: ${({ $active, theme }) => ($active ? theme.colors.ink : theme.colors.muted)};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 14px;
  letter-spacing: 0.04em;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
`

const BoardTable = styled.div`
  width: 100%;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;
`

const BoardRow = styled.div`
  display: grid;
  grid-template-columns: 52px 1fr 110px 210px 64px 110px;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }

  > span {
    font-size: 16px;
    color: ${({ theme }) => theme.colors.parchmentDim};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  &:not(&:first-child):hover {
    background: ${({ theme }) => theme.colors.ink3};
  }
`

const BoardRowHead = styled(BoardRow)`
  background: ${({ theme }) => theme.colors.ink3};

  > span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.gold};
  }
`

const Rank = styled.span<{ $rank?: number }>`
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ $rank, theme }) =>
    $rank === 1 ? "#ffd76e" : $rank === 2 ? "#d8d2c4" : $rank === 3 ? "#d59a5c" : theme.colors.goldBright};
  font-weight: 600;
`

const CellName = styled.span`
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
`

const EndingTag = styled.span<{ $ending: EndingType }>`
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ $ending }) => ENDING_COLOR[$ending]};
`

const BoardMsg = styled.p`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`

const BoardError = styled(BoardMsg)`
  color: ${({ theme }) => theme.colors.bloodBright};
`

const BackBtn = styled(BtnGhost)`
  margin-top: 18px;
`

const NumCell = styled.span`
  text-align: right;
  font-variant-numeric: tabular-nums;
`

const ScoreNum = styled.span`
  color: ${({ theme }) => theme.colors.goldBright};
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
`

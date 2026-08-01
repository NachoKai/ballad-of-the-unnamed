import { useEffect, useMemo, useReducer, useState } from "react"
import { styled } from "styled-components"
import type { EndingType, LeaderboardCategory, Locale, RunType } from "@shared/types"
import { api, type LeaderboardEntryView } from "../api"
import { ENDING_COLOR, LEADERBOARD_CATEGORIES } from "../constants"
import { t } from "../i18n/strings"
import { boardReducer } from "../lib/boardReducer"
import { BtnGhost } from "./ui/Button"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  onBack: () => void
}

function sortValue(e: LeaderboardEntryView, cat: LeaderboardCategory): number {
  switch (cat) {
    case "net_worth":
      return e.netWorth ?? 0
    case "age_at_end":
      return e.ageAtEnd
    case "achievements_count":
      return e.achievementsCount
    case "battles_won":
      return e.battlesWon
    default:
      return e.score
  }
}

export function LeaderboardScreen({ locale, onBack }: Props) {
  const [runType, setRunType] = useState<RunType>("standard")
  const [tier, setTier] = useState<string | undefined>(undefined)
  const [category, setCategory] = useState<LeaderboardCategory>("score")
  const [{ loading, error, entries: rawEntries }, dispatch] = useReducer(
    boardReducer<LeaderboardEntryView>,
    { loading: true, error: null, entries: [] },
  )

  useEffect(() => {
    let alive = true
    dispatch({ type: "start" })

    api
      .leaderboard(runType, locale, tier)
      .then((r) => {
        if (alive) dispatch({ type: "ok", entries: r.entries })
      })
      .catch((e) => {
        if (alive) dispatch({ type: "fail", message: (e as Error).message })
      })

    return () => {
      alive = false
    }
  }, [runType, tier, locale])

  const sorted = useMemo(() => {
    const copy = [...rawEntries]
    copy.sort((a, b) => sortValue(b, category) - sortValue(a, category))
    return copy.map((e, i) => ({ ...e, rank: i + 1 }))
  }, [rawEntries, category])

  const sortLabel = LEADERBOARD_CATEGORIES.find((c) => c.id === category)?.labelKey

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
            onClick={() => {
              setRunType("standard")
              setTier(undefined)
            }}
          >
            {t(locale, "standardRuns")}
          </TabBtn>
          <TabBtn
            type="button"
            role="tab"
            $active={runType === "daily"}
            aria-selected={runType === "daily"}
            onClick={() => {
              setRunType("daily")
              setTier(undefined)
            }}
          >
            {t(locale, "dailyRuns")}
          </TabBtn>
          <TabBtn
            type="button"
            role="tab"
            $active={runType === "standard" && tier === "legendary"}
            aria-selected={runType === "standard" && tier === "legendary"}
            onClick={() => {
              setRunType("standard")
              setTier("legendary")
            }}
          >
            {t(locale, "legendaryBoard")}
          </TabBtn>
        </BoardTabs>
      </BoardHeader>

      <CategoryTabs role="tablist">
        {LEADERBOARD_CATEGORIES.map((c) => (
          <CatBtn
            key={c.id}
            type="button"
            role="tab"
            $active={category === c.id}
            aria-selected={category === c.id}
            onClick={() => setCategory(c.id)}
          >
            {t(locale, c.labelKey)}
          </CatBtn>
        ))}
      </CategoryTabs>

      {loading && <BoardMsg>{t(locale, "loading")}</BoardMsg>}
      {error && <BoardError>{error}</BoardError>}

      {!loading && !error && rawEntries.length === 0 && (
        <BoardMsg>{t(locale, "noEntries")}</BoardMsg>
      )}

      {!loading && sorted.length > 0 && (
        <BoardTable role="table">
          <BoardRowHead role="row">
            <span>#</span>
            <span>{t(locale, "name")}</span>
            <span>{t(locale, "classLabel")}</span>
            <span>{t(locale, "endingLabel")}</span>
            <NumCell>{t(locale, sortLabel ?? "scoreLabel")}</NumCell>
            <NumCell>{t(locale, "ageShort")}</NumCell>
          </BoardRowHead>
          {sorted.map((e) => (
            <BoardRow role="row" key={e.id}>
              <Rank $rank={e.rank <= 3 ? e.rank : undefined}>{e.rank}</Rank>
              <CellName>
                {e.name}
                {e.epithet && <EpithetLabel>{e.epithet}</EpithetLabel>}
              </CellName>
              <span>{t(locale, `class_${e.class}` as never)}</span>
              <EndingTag $ending={e.endingType}>
                {t(locale, `ending_${e.endingType}` as never)}
              </EndingTag>
              <NumCell>{sortValue(e, category).toLocaleString()}</NumCell>
              <NumCell>{e.ageAtEnd}</NumCell>
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

const BoardScreen = styled.div`
  animation: ${rise} 0.4s ease both;
`

const BoardHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 10px;

  h1 {
    font-size: clamp(27px, 4vw, 39px);
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

const BoardTabs = styled.div`
  display: inline-flex;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
`

const TabBtn = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.colors.gold : "transparent")};
  border: none;
  padding: 9px 18px;
  color: ${({ $active, theme }) => ($active ? theme.colors.ink : theme.colors.muted)};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 15px;
  letter-spacing: 0.04em;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
`

const CategoryTabs = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const CatBtn = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? "rgba(201,164,76,0.15)" : "transparent")};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.gold : theme.colors.line2)};
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ $active, theme }) => ($active ? theme.colors.gold : theme.colors.muted)};
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
  grid-template-columns: 52px 1fr 110px 210px 110px 64px;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};

  &:last-child {
    border-bottom: none;
  }

  > span {
    font-size: 17px;
    color: ${({ theme }) => theme.colors.parchmentDim};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:not(&:first-child):hover {
    background: ${({ theme }) => theme.colors.ink3};
  }
`

const BoardRowHead = styled(BoardRow)`
  background: ${({ theme }) => theme.colors.ink3};

  > span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.gold};
  }
`

const Rank = styled.span<{ $rank?: number }>`
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ $rank, theme }) =>
    $rank === 1
      ? "#ffd76e"
      : $rank === 2
        ? "#d8d2c4"
        : $rank === 3
          ? "#d59a5c"
          : theme.colors.goldBright};
  font-weight: 600;
`

const CellName = styled.span`
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const EpithetLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.gold};
  letter-spacing: 0.06em;
  font-weight: 400;
`

const EndingTag = styled.span<{ $ending: EndingType }>`
  font-size: 13px;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

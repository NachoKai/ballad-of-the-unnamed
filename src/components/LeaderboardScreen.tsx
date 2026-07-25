import { useEffect, useState } from "react"
import type { Locale, RunType } from "@shared/types"
import { api, type LeaderboardEntryView } from "../api"
import { t } from "../i18n/strings"

interface Props {
  locale: Locale
  onBack: () => void
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
    <div className="board-screen">
      <header className="board-header">
        <h1 className="text-balance">{t(locale, "leaderboardTitle")}</h1>
        <div className="board-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={runType === "standard"}
            className={runType === "standard" ? "tab active" : "tab"}
            onClick={() => setRunType("standard")}
          >
            {t(locale, "standardRuns")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={runType === "daily"}
            className={runType === "daily" ? "tab active" : "tab"}
            onClick={() => setRunType("daily")}
          >
            {t(locale, "dailyRuns")}
          </button>
        </div>
      </header>

      {loading && <p className="board-msg">{t(locale, "loading")}</p>}
      {error && <p className="board-msg board-error">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="board-msg">{t(locale, "noEntries")}</p>
      )}

      {!loading && entries.length > 0 && (
        <div className="board-table" role="table">
          <div className="board-row board-row-head" role="row">
            <span>#</span>
            <span>{t(locale, "name")}</span>
            <span>{t(locale, "classLabel")}</span>
            <span>{t(locale, "endingLabel")}</span>
            <span className="num">{t(locale, "ageShort")}</span>
            <span className="num">{t(locale, "scoreLabel")}</span>
          </div>
          {entries.map((e) => (
            <div className="board-row" role="row" key={e.id}>
              <span className={`rank rank-${e.rank <= 3 ? e.rank : "n"}`}>{e.rank}</span>
              <span className="cell-name">{e.name}</span>
              <span>{t(locale, `class_${e.class}` as never)}</span>
              <span className={`ending-tag ending-${e.endingType}`}>
                {t(locale, `ending_${e.endingType}` as never)}
              </span>
              <span className="num">{e.ageAtEnd}</span>
              <span className="num score-cell">{e.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn-ghost board-back" onClick={onBack}>
        {t(locale, "back")}
      </button>
    </div>
  )
}

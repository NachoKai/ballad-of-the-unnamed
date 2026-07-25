import { useEffect, useState } from "react"
import type { Locale, RunType } from "@shared/types"
import { api, type ClassInfo } from "../api"
import { t } from "../i18n/strings"

interface Props {
  locale: Locale
  onStart: (name: string, classId: string, runType: RunType) => Promise<void>
}

const STAT_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  charisma: "CHA",
}

export function CreationScreen({ locale, onStart }: Props) {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [dailySeed, setDailySeed] = useState("")
  const [name, setName] = useState("")
  const [classId, setClassId] = useState<string | null>(null)
  const [runType, setRunType] = useState<RunType>("standard")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .classes(locale)
      .then((res) => {
        if (!active) return
        setClasses(res.classes)
        setDailySeed(res.dailySeed)
      })
      .catch((e) => active && setError(String(e.message)))
    return () => {
      active = false
    }
  }, [locale])

  async function begin() {
    if (!classId || busy) return
    setBusy(true)
    setError(null)
    try {
      await onStart(name.trim() || "Wanderer", classId, runType)
    } catch (e) {
      setError(String((e as Error).message))
      setBusy(false)
    }
  }

  return (
    <div className="creation-screen">
      <header className="creation-hero">
        <h1 className="text-balance">{t(locale, "newLife")}</h1>
        <p className="creation-sub text-pretty">{t(locale, "subtitle")}</p>
      </header>

      <section className="creation-block">
        <label className="block-label" htmlFor="hero-name">
          {t(locale, "chooseName")}
        </label>
        <input
          id="hero-name"
          className="name-input"
          value={name}
          maxLength={24}
          placeholder={t(locale, "namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </section>

      <section className="creation-block">
        <span className="block-label">{t(locale, "chooseClass")}</span>
        <div className="class-grid">
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`class-card ${classId === c.id ? "selected" : ""}`}
              onClick={() => setClassId(c.id)}
              aria-pressed={classId === c.id}
            >
              <h3>{c.name}</h3>
              <p className="class-desc text-pretty">{c.description}</p>
              <div className="stat-row">
                {Object.entries(c.base).map(([k, v]) => (
                  <span key={k} className="stat-chip">
                    <em>{STAT_ABBR[k] ?? k}</em> {v}
                  </span>
                ))}
                <span className="stat-chip gold-chip">
                  <em>{t(locale, "gold")}</em> {c.startingGold}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="creation-block">
        <span className="block-label">{t(locale, "runMode")}</span>
        <div className="run-modes">
          <button
            type="button"
            className={`mode-pill ${runType === "standard" ? "active" : ""}`}
            onClick={() => setRunType("standard")}
          >
            <strong>{t(locale, "standard")}</strong>
            <span>{t(locale, "standardHint")}</span>
          </button>
          <button
            type="button"
            className={`mode-pill ${runType === "daily" ? "active" : ""}`}
            onClick={() => setRunType("daily")}
          >
            <strong>{t(locale, "daily")}</strong>
            <span>
              {t(locale, "dailyHint")}
              {dailySeed ? ` (${dailySeed})` : ""}
            </span>
          </button>
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}

      <button
        type="button"
        className="btn-primary begin-btn"
        disabled={!classId || busy}
        onClick={begin}
      >
        {busy ? t(locale, "loading") : t(locale, "begin")}
      </button>
    </div>
  )
}

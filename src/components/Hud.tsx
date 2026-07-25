import type { CharacterState, Locale } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import { t as translate } from "../i18n/strings"

interface Props {
  character: CharacterState
  locale: Locale
}

const STAT_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  charisma: "CHA",
}

export function Hud({ character: c, locale }: Props) {
  const t = (k: string) => translate(locale, k)
  const className = t(`class_${c.class}`)
  const momentumKey =
    c.momentum === "rising"
      ? "momentumRising"
      : c.momentum === "falling"
        ? "momentumFalling"
        : "momentumNormal"

  return (
    <div className="panel hud-wrap">
      <div className="hud">
        <span className="name">
          {c.name} <span className="faint">· {className}</span>
        </span>
        <span className="meter">
          {t("age")} <b>{c.age}</b>
        </span>
        <span className="meter">
          {t("health")} <b>{c.health}</b>
        </span>
        <span className="meter">
          {t("gold")} <b>{c.gold}</b>
        </span>
        <span className="meter">
          {t("fame")} <b>{c.fame}</b>
        </span>
        <span className="meter">
          {t("power")} <b>{c.powerLevel}</b>
        </span>
        <span className={`momentum ${c.momentum}`}>{t(momentumKey)}</span>
      </div>
      <div className="stats-strip">
        {STAT_KEYS.map((k) => (
          <span key={k} className="stat-pill">
            {STAT_ABBR[k]} <b>{c[k]}</b>
          </span>
        ))}
        <span className="stat-pill">
          {t("turn")} <b>{c.turn}</b>
        </span>
      </div>
    </div>
  )
}

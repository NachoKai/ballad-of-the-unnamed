import { Castle, Landmark, Skull, Swords } from "lucide-react"
import type { AchievementContent, CharacterState, EndingType, Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { AchIcon } from "./AchIcon"

interface Props {
  locale: Locale
  character: CharacterState
  endingType: EndingType
  epilogue: string
  score: number
  achievements: AchievementContent[]
  onNewRun: () => void
  onLeaderboard: () => void
}

const ENDING_ICON: Record<EndingType, typeof Skull> = {
  heroic_death: Swords,
  peaceful_retirement: Castle,
  other_death: Skull,
  other_retirement: Landmark,
}

export function EndingScreen({
  locale,
  character,
  endingType,
  epilogue,
  score,
  achievements,
  onNewRun,
  onLeaderboard,
}: Props) {
  const Crest = ENDING_ICON[endingType]
  return (
    <div className="ending-screen">
      <div className={`ending-card ending-${endingType}`}>
        <div className="ending-crest" aria-hidden="true">
          <Crest size={52} strokeWidth={1.5} />
        </div>
        <h1 className="ending-title text-balance">
          {t(locale, `ending_${endingType}` as never)}
        </h1>
        <p className="ending-name">
          {character.name} &middot; {t(locale, `class_${character.class}` as never)} &middot;{" "}
          {t(locale, "ageLabel")} {character.age}
        </p>

        <p className="epilogue text-pretty">{epilogue}</p>

        <div className="score-banner">
          <span className="score-label">{t(locale, "finalScore")}</span>
          <span className="score-value">{score.toLocaleString()}</span>
        </div>

        <dl className="ending-stats">
          <div><dt>{t(locale, "powerLevel")}</dt><dd>{character.powerLevel}</dd></div>
          <div><dt>{t(locale, "netWorth")}</dt><dd>{character.gold}g</dd></div>
          <div><dt>{t(locale, "battlesWon")}</dt><dd>{character.counters["battles_won"] ?? 0}</dd></div>
          <div><dt>{t(locale, "questsCompleted")}</dt><dd>{character.counters["quests_completed"] ?? 0}</dd></div>
          <div><dt>{t(locale, "achievements")}</dt><dd>{character.achievements.length}</dd></div>
        </dl>

        {achievements.length > 0 && (
          <div className="ending-achievements">
            <h2>{t(locale, "achievementsEarned")}</h2>
            <ul>
              {achievements.map((a) => (
                <li key={a.id} className={`ach-chip ach-${a.rarity}`}>
                  <span className="ach-icon">
                    <AchIcon name={a.icon} size={16} />
                  </span>
                  <span>
                    <strong>{a.name.en}</strong>
                    <em>{a.description.en}</em>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="ending-actions">
          <button type="button" className="btn-primary" onClick={onNewRun}>
            {t(locale, "playAgain")}
          </button>
          <button type="button" className="btn-ghost" onClick={onLeaderboard}>
            {t(locale, "viewLeaderboard")}
          </button>
        </div>
      </div>
    </div>
  )
}

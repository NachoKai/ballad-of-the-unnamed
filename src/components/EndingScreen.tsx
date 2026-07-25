import { Castle, Landmark, Skull, Swords } from "lucide-react"
import { styled, keyframes } from "styled-components"
import type { AchievementContent, CharacterState, EndingType, Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { AchIcon } from "./AchIcon"
import { BtnPrimary, BtnGhost } from "./ui/Button"
import { TextBalance, TextPretty } from "./ui/Text"

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
    <EndingScreenRoot>
      <EndingCard>
        <EndingCrest aria-hidden="true">
          <Crest size={52} strokeWidth={1.5} />
        </EndingCrest>
        <EndingTitle>
          {t(locale, `ending_${endingType}` as never)}
        </EndingTitle>
        <EndingName>
          {character.name} &middot; {t(locale, `class_${character.class}` as never)} &middot;{" "}
          {t(locale, "ageLabel")} {character.age}
        </EndingName>

        <Epilogue>{epilogue}</Epilogue>

        <ScoreBanner>
          <ScoreLabel>{t(locale, "finalScore")}</ScoreLabel>
          <ScoreValue>{score.toLocaleString()}</ScoreValue>
        </ScoreBanner>

        <EndingStats>
          <StatCell>
            <dt>{t(locale, "powerLevel")}</dt>
            <dd>{character.powerLevel}</dd>
          </StatCell>
          <StatCell>
            <dt>{t(locale, "netWorth")}</dt>
            <dd>{character.gold}g</dd>
          </StatCell>
          <StatCell>
            <dt>{t(locale, "battlesWon")}</dt>
            <dd>{character.counters["battles_won"] ?? 0}</dd>
          </StatCell>
          <StatCell>
            <dt>{t(locale, "questsCompleted")}</dt>
            <dd>{character.counters["quests_completed"] ?? 0}</dd>
          </StatCell>
          <StatCell>
            <dt>{t(locale, "achievements")}</dt>
            <dd>{character.achievements.length}</dd>
          </StatCell>
        </EndingStats>

        {achievements.length > 0 && (
          <EndingAchievements>
            <h2>{t(locale, "achievementsEarned")}</h2>
            <ul>
              {achievements.map((a) => (
                <AchChip key={a.id}>
                  <AchIconWrap>
                    <AchIcon name={a.icon} size={16} />
                  </AchIconWrap>
                  <span>
                    <strong>{a.name.en}</strong>
                    <em>{a.description.en}</em>
                  </span>
                </AchChip>
              ))}
            </ul>
          </EndingAchievements>
        )}

        <EndingActions>
          <BtnPrimary type="button" onClick={onNewRun}>
            {t(locale, "playAgain")}
          </BtnPrimary>
          <BtnGhost type="button" onClick={onLeaderboard}>
            {t(locale, "viewLeaderboard")}
          </BtnGhost>
        </EndingActions>
      </EndingCard>
    </EndingScreenRoot>
  )
}

const rise = keyframes`
  from { opacity: 0; transform: translateY(10px); }
`;

const EndingScreenRoot = styled.div`
  display: grid;
  place-items: center;
  padding: 26px 0;
  animation: ${rise} 0.5s ease both;
`

const EndingCard = styled.div`
  width: 100%;
  max-width: 720px;
  background: linear-gradient(180deg, ${({ theme }) => theme.colors.panel} 0%, ${({ theme }) => theme.colors.ink2} 100%);
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 34px;
  box-shadow: ${({ theme }) => theme.shadow};
  text-align: center;

  @media (max-width: 680px) {
    padding: 22px;
  }
`

const EndingCrest = styled.div`
  font-size: 56px;
  color: ${({ theme }) => theme.colors.gold};
  line-height: 1;
`

const EndingTitle = styled(TextBalance)`
  font-size: clamp(26px, 4vw, 38px);
  color: ${({ theme }) => theme.colors.goldBright};
  margin-top: 6px;
`

const EndingName = styled.p`
  font-size: clamp(26px, 4vw, 38px);
  color: ${({ theme }) => theme.colors.goldBright};
  margin-top: 6px;
`

const Epilogue = styled(TextPretty)`
  margin: 22px auto 6px;
  max-width: 60ch;
  font-size: 20px;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.parchment};
  font-style: italic;
`

const ScoreBanner = styled.div`
  margin: 24px auto;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 40px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink3};
`

const ScoreLabel = styled.span`
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const ScoreValue = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 40px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.goldBright};
  font-variant-numeric: tabular-nums;
`

const EndingStats = styled.dl`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin: 8px 0 18px;
`

const StatCell = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 92px;
  padding: 10px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink2};

  dd {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
    font-weight: 600;
    margin: 0;
  }

  dt {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.muted};
    letter-spacing: 0.04em;
  }
`

const EndingAchievements = styled.div`
  margin: 22px 0 6px;

  h2 {
    font-size: 14px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.gold};
    margin-bottom: 12px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
`

const AchChip = styled.li`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border: 1px solid rgba(201, 164, 76, 0.35);
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(201, 164, 76, 0.08);
  text-align: left;

  > span:last-child {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }

  strong {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 14px;
    color: ${({ theme }) => theme.colors.goldBright};
  }

  em {
    font-style: normal;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.parchmentDim};
    margin-top: 2px;
  }
`

const AchIconWrap = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.goldBright};
`

const EndingActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 26px;
`

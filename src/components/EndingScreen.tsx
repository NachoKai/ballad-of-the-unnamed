import { Castle, Landmark, Skull, Swords, Trophy, Crosshair } from "lucide-react"
import { styled } from "styled-components"
import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Locale,
  RichEpilogueData,
} from "@shared/types"
import { t } from "../i18n/strings"
import { AchIcon } from "./AchIcon"
import { BtnPrimary, BtnGhost } from "./ui/Button"
import { TextBalance, TextPretty } from "./ui/Text"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  character: CharacterState
  endingType: EndingType
  epilogue: string
  score: number
  achievements: AchievementContent[]
  richEpilogueData?: RichEpilogueData
  onNewRun: () => void
  onLeaderboard: () => void
}

const ENDING_ICON: Record<EndingType, typeof Skull> = {
  heroic_death: Swords,
  peaceful_retirement: Castle,
  other_death: Skull,
  other_retirement: Landmark,
}

function FactionHistory({
  locale,
  data,
}: {
  locale: Locale
  data: RichEpilogueData["factionHistory"]
}) {
  if (data.length === 0) return null
  return (
    <Section>
      <SectionTitle>{t(locale, "factionHistory")}</SectionTitle>
      <FactionGrid>
        {data.map((f) => (
          <FactionBadge key={f.faction}>
            <FactionName>{f.faction}</FactionName>
            <FactionTier>{f.peakTier}</FactionTier>
            <FactionValue>{f.peakValue}</FactionValue>
          </FactionBadge>
        ))}
      </FactionGrid>
    </Section>
  )
}

function RivalBlock({
  locale,
  data,
}: {
  locale: Locale
  data: RichEpilogueData["rivalComparison"]
}) {
  if (!data) return null
  const playerWon = data.playerScore >= data.rivalScore
  return (
    <Section>
      <SectionTitle>{t(locale, "rivalComparison")}</SectionTitle>
      <RivalCard>
        <RivalRow>
          <RivalLabel>{t(locale, "name")}</RivalLabel>
          <RivalValue>{data.name}</RivalValue>
        </RivalRow>
        <RivalRow>
          <RivalLabel>{t(locale, "powerLevel")}</RivalLabel>
          <RivalValue>
            <RivalStat $win={data.playerPowerLevel >= data.rivalPowerLevel}>
              {data.playerPowerLevel}
            </RivalStat>
            <RivalVs>{t(locale, "vs")}</RivalVs>
            <RivalStat $win={data.rivalPowerLevel >= data.playerPowerLevel}>
              {data.rivalPowerLevel}
            </RivalStat>
          </RivalValue>
        </RivalRow>
        <RivalRow>
          <RivalLabel>{t(locale, "scoreLabel")}</RivalLabel>
          <RivalValue>
            <RivalStat $win={playerWon}>{data.playerScore}</RivalStat>
            <RivalVs>{t(locale, "vs")}</RivalVs>
            <RivalStat $win={!playerWon}>{data.rivalScore}</RivalStat>
          </RivalValue>
        </RivalRow>
        <RivalRow>
          <RivalLabel>{t(locale, "achievements")}</RivalLabel>
          <RivalValue>
            <RivalStat $win={data.playerAchievements >= data.rivalAchievements}>
              {data.playerAchievements}
            </RivalStat>
            <RivalVs>{t(locale, "vs")}</RivalVs>
            <RivalStat $win={data.rivalAchievements >= data.playerAchievements}>
              {data.rivalAchievements}
            </RivalStat>
          </RivalValue>
        </RivalRow>
        <RivalOutcome>{playerWon ? t(locale, "rivalWon") : t(locale, "rivalLost")}</RivalOutcome>
      </RivalCard>
    </Section>
  )
}

function DistinctionsBlock({
  locale,
  distinctions,
}: {
  locale: Locale
  distinctions: RichEpilogueData["distinctions"]
}) {
  if (distinctions.length === 0) return null
  return (
    <Section>
      <SectionTitle>{t(locale, "distinctions")}</SectionTitle>
      <DistinctionsList>
        {distinctions.map((d) => (
          <DistinctionChip key={d.id}>
            <DistinctionIcon>
              <Trophy size={14} />
            </DistinctionIcon>
            <span>{d.label.en}</span>
            <DistinctionCount>x{d.count}</DistinctionCount>
          </DistinctionChip>
        ))}
      </DistinctionsList>
    </Section>
  )
}

function LostEncountersBlock({ locale, count }: { locale: Locale; count: number }) {
  if (count === 0) return null
  return (
    <Section>
      <SectionTitle>{t(locale, "lostEncounters")}</SectionTitle>
      <LostEncountersCard>
        <Crosshair size={18} />
        <span>
          {count}{" "}
          {count === 1 ? t(locale, "lostEncounterSingle") : t(locale, "lostEncounterPlural")}
        </span>
      </LostEncountersCard>
    </Section>
  )
}

export function EndingScreen({
  locale,
  character,
  endingType,
  epilogue,
  score,
  achievements,
  richEpilogueData,
  onNewRun,
  onLeaderboard,
}: Props) {
  const Crest = ENDING_ICON[endingType]
  const epithet = richEpilogueData?.epithet
  const stats = [
    { key: "powerLevel", value: character.powerLevel },
    { key: "netWorth", value: character.gold + "g" },
    { key: "battlesWon", value: character.counters["battles_won"] ?? 0 },
    { key: "questsCompleted", value: character.counters["quests_completed"] ?? 0 },
    { key: "achievements", value: character.achievements.length },
  ]
  if (richEpilogueData) {
    stats.splice(2, 0, {
      key: "peakMarketValue",
      value: richEpilogueData.peakMarketValue.toLocaleString() + "g",
    })
  }

  return (
    <EndingScreenRoot>
      <EndingCard>
        <EndingCrest aria-hidden="true">
          <Crest size={52} strokeWidth={1.5} />
        </EndingCrest>
        <EndingTitle>{t(locale, `ending_${endingType}` as never)}</EndingTitle>
        <EndingName>
          {character.name}
          {epithet && <EpithetTag>{epithet.title}</EpithetTag>}
        </EndingName>
        {epithet && <EpithetSub>{epithet.subtitle}</EpithetSub>}

        <Epilogue>{epilogue}</Epilogue>

        <ScoreBanner>
          <ScoreLabel>{t(locale, "finalScore")}</ScoreLabel>
          <ScoreValue>{score.toLocaleString()}</ScoreValue>
          {richEpilogueData && (
            <ScoreDetail>
              {t(locale, "legacyScore")}: {richEpilogueData.legacyScore.toLocaleString()}
            </ScoreDetail>
          )}
        </ScoreBanner>

        <EndingStats>
          {stats.map((s) => (
            <StatCell key={s.key}>
              <dt>{t(locale, s.key as never)}</dt>
              <dd>{s.value}</dd>
            </StatCell>
          ))}
        </EndingStats>

        {richEpilogueData && (
          <>
            <FactionHistory locale={locale} data={richEpilogueData.factionHistory} />
            <RivalBlock locale={locale} data={richEpilogueData.rivalComparison} />
            <DistinctionsBlock locale={locale} distinctions={richEpilogueData.distinctions} />
            <LostEncountersBlock locale={locale} count={richEpilogueData.lostEncounters} />
          </>
        )}

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

const EndingScreenRoot = styled.div`
  display: grid;
  place-items: center;
  padding: 26px 0;
  animation: ${rise} 0.5s ease both;
`

const EndingCard = styled.div`
  width: 100%;
  max-width: 720px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel} 0%,
    ${({ theme }) => theme.colors.ink2} 100%
  );
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
`

const EpithetTag = styled.span`
  font-size: 18px;
  background: rgba(201, 164, 76, 0.15);
  border: 1px solid rgba(201, 164, 76, 0.3);
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 4px 12px;
  color: ${({ theme }) => theme.colors.gold};
  font-family: ${({ theme }) => theme.fonts.display};
  letter-spacing: 0.06em;
`

const EpithetSub = styled.p`
  font-size: 16px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  margin-top: 2px;
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

const ScoreDetail = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
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

const Section = styled.div`
  margin: 24px 0 10px;
  text-align: left;
`

const SectionTitle = styled.h3`
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
  padding-bottom: 6px;
`

const FactionGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`

const FactionBadge = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink2};
  min-width: 100px;
`

const FactionName = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
`

const FactionTier = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.gold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

const FactionValue = styled.span`
  font-size: 18px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const RivalCard = styled.div`
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink2};
`

const RivalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
`

const RivalLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`

const RivalValue = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
`

const RivalStat = styled.span<{ $win: boolean }>`
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $win, theme }) => ($win ? theme.colors.goldBright : theme.colors.muted)};
`

const RivalVs = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
`

const RivalOutcome = styled.p`
  margin-top: 8px;
  font-size: 14px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.parchmentDim};
  text-align: center;
`

const DistinctionsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const DistinctionChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(201, 164, 76, 0.25);
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(201, 164, 76, 0.06);
  font-size: 13px;
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const DistinctionIcon = styled.span`
  color: ${({ theme }) => theme.colors.gold};
  display: inline-flex;
`

const DistinctionCount = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.gold};
  font-variant-numeric: tabular-nums;
`

const LostEncountersCard = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(200, 90, 90, 0.06);
  color: ${({ theme }) => theme.colors.bloodBright};
  font-size: 14px;
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

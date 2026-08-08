import { Fragment } from "react"
import { Award, Castle, Crosshair, Flag, Landmark, ShoppingBag, Skull, Swords, Trophy } from "lucide-react"
import { styled } from "styled-components"
import { theme } from "../theme"
import type {
  AchievementContent,
  CharacterState,
  EndingType,
  Locale,
  RelationshipEntry,
  RichEpilogueData,
  TurnLogKind,
} from "@shared/types"
import { affinityTierId } from "@shared/config"
import { interpolate } from "@shared/i18n"
import { gt, t } from "../i18n/strings"
import { bondTone, showsBondPeak, type BondTone } from "../lib/bonds"
import { AchIcon } from "./AchIcon"
import { FactionFlag } from "./FactionFlag"
import { BtnPrimary, BtnGhost } from "./ui/Button"
import { SpecularBorder } from "./ui/SpecularBorder"
import { TONES } from "./ui/Tag"
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
  gender,
  data,
}: {
  locale: Locale
  gender: CharacterState["gender"]
  data: RichEpilogueData["factionHistory"]
}) {
  if (data.length === 0) return null

  return (
    <Section>
      <SectionTitle>{t(locale, "factionHistory")}</SectionTitle>
      <FactionGrid>
        {data.map((f) => (
          <FactionBadge key={f.faction}>
            <FactionFlagWrap>
              <FactionFlag factionId={f.faction} size={22} />
            </FactionFlagWrap>
            <FactionName>{t(locale, `faction_${f.faction}`)}</FactionName>
            <FactionTier>{gt(locale, gender, `reputation_tier_${f.peakTier}`)}</FactionTier>
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
            <span>{d.label[locale] ?? d.label.en}</span>
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

// Icon per special life-beat kind, so the chip reads at a glance: a bag for
// shop purchases, a banner for clan joins, a laurel for tournament wins.
const STORY_KIND_ICON: Record<NonNullable<RichEpilogueData["story"][number]["kind"]>, typeof Award> = {
  event: Trophy,
  shop: ShoppingBag,
  clan: Flag,
  tournament: Award,
}

// Per-kind chip tint: shop = coin-blue, clan = sage green, tournament = gold.
// `event` is unreachable for kind chips (regular turns render the personality
// tag instead) but keeps the Record total for the union type.
const STORY_KIND_TONE: Record<TurnLogKind, { fg: string; border: string; bg: string }> = {
  event: { fg: theme.colors.gold, border: "rgba(201, 164, 76, 0.25)", bg: "transparent" },
  shop: {
    fg: theme.colors.rarity.rare,
    border: "rgba(90, 134, 200, 0.45)",
    bg: "rgba(90, 134, 200, 0.12)",
  },
  clan: {
    fg: theme.colors.sage,
    border: "rgba(111, 143, 106, 0.45)",
    bg: "rgba(111, 143, 106, 0.12)",
  },
  tournament: {
    fg: theme.colors.goldBright,
    border: "rgba(201, 164, 76, 0.55)",
    bg: "rgba(201, 164, 76, 0.12)",
  },
}

// The run's "Your Story" scrollback: every resolved turn as a timeline of
// headline + detail lines, with a season divider when the year turns over.
function StoryBlock({
  locale,
  gender,
  story,
}: {
  locale: Locale
  gender: CharacterState["gender"]
  story: RichEpilogueData["story"]
}) {
  if (story.length === 0) return null
  return (
    <Section>
      <SectionTitle>{t(locale, "yourStory")}</SectionTitle>
      <StoryScroller>
        {story.map((s, i) => {
          const prevSeason = i > 0 ? story[i - 1].season : s.season
          // The index disambiguates rows that share a turn + headline (e.g. two
          // purchases of the same item in one shop visit — the shop doesn't
          // advance the turn, so both entries collide without it).
          return (
            <Fragment key={`${s.turn}-${i}-${s.headline.slice(0, 12)}`}>
              {s.season !== prevSeason && (
                <SeasonDivider>
                  {interpolate(t(locale, "storySeason"), { n: s.season })}
                </SeasonDivider>
              )}
              <StoryRow>
                <StoryRail>
                  <StoryDot />
                  {i < story.length - 1 && <StoryLine />}
                </StoryRail>
                <StoryBody>
                  <StoryMeta>
                    <StoryTurn>
                      {interpolate(t(locale, "storyTurn"), { n: s.turn })}
                    </StoryTurn>
                    {/* Special life beats (shop/clan/tournament) get a kind chip;
                        encounter turns show the choice's personality tag. */}
                    {s.kind && s.kind !== "event" ? (
                      <StoryTag $kind={s.kind}>
                        <StoryKindIcon as={STORY_KIND_ICON[s.kind]} size={11} strokeWidth={2.4} />
                        {t(locale, `storyKind_${s.kind}` as never)}
                      </StoryTag>
                    ) : (
                      s.tag && <StoryTag>{gt(locale, gender, `personality_tag_${s.tag}`)}</StoryTag>
                    )}
                  </StoryMeta>
                  <StoryHeadline>{s.headline}</StoryHeadline>
                  {s.detail && <StoryDetail>{s.detail}</StoryDetail>}
                </StoryBody>
              </StoryRow>
            </Fragment>
          )
        })}
      </StoryScroller>
    </Section>
  )
}

// The bonds forged over a life: every met NPC with their role, final affinity
// tier, and last affinity. Same tier/role labels and tone logic as the HUD
// strip, so a devoted ally reads sage and a sworn enemy reads blood.
function BondsBlock({
  locale,
  relationships,
}: {
  locale: Locale
  relationships: RelationshipEntry[]
}) {
  if (relationships.length === 0) return null
  return (
    <Section>
      <SectionTitle>{t(locale, "relationships")}</SectionTitle>
      <BondsGrid>
        {[...relationships]
          .sort((a, b) => b.affinity - a.affinity)
          .map((rel) => {
            const tone = bondTone(rel.affinity)
            return (
              <BondBadge key={rel.npcId} $tone={tone}>
                <BondName>{rel.npcName ?? rel.npcId}</BondName>
                <BondRole>{t(locale, `npcRole_${rel.npcRole ?? "acquaintance"}`)}</BondRole>
                <BondTier>{t(locale, `affinity_tier_${affinityTierId(rel.affinity)}`)}</BondTier>
                <BondValue $tone={tone}>
                  {rel.affinity > 0 ? "+" : ""}
                  {rel.affinity}
                </BondValue>
                {showsBondPeak(rel) && (
                  <BondPeak>{interpolate(t(locale, "bondPeak"), { n: rel.peakAffinity })}</BondPeak>
                )}
              </BondBadge>
            )
          })}
      </BondsGrid>
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

        <SpecularBorder
          radius={12}
          lineColor={theme.colors.goldBright}
          baseColor={theme.colors.gold}
          thickness={1.3}
          intensity={1.1}
          style={{ display: "inline-flex", margin: "24px auto" }}
        >
          <ScoreBanner>
            <ScoreLabel>{t(locale, "finalScore")}</ScoreLabel>
            <ScoreValue>{score.toLocaleString()}</ScoreValue>
            {richEpilogueData && (
              <ScoreDetail>
                {t(locale, "legacyScore")}: {richEpilogueData.legacyScore.toLocaleString()}
              </ScoreDetail>
            )}
          </ScoreBanner>
        </SpecularBorder>

        <EndingStats>
          {stats.map((s) => (
            <StatCell key={s.key}>
              <dt>{t(locale, s.key as never)}</dt>
              <dd>{s.value}</dd>
            </StatCell>
          ))}
        </EndingStats>

        {richEpilogueData && richEpilogueData.story.length > 0 && (
          <StoryBlock
            locale={locale}
            gender={character.gender}
            story={richEpilogueData.story}
          />
        )}

        {richEpilogueData && (
          <>
            <FactionHistory
              locale={locale}
              gender={character.gender}
              data={richEpilogueData.factionHistory}
            />
            <RivalBlock locale={locale} data={richEpilogueData.rivalComparison} />
            <DistinctionsBlock locale={locale} distinctions={richEpilogueData.distinctions} />
            <LostEncountersBlock locale={locale} count={richEpilogueData.lostEncounters} />
          </>
        )}

        <BondsBlock locale={locale} relationships={character.relationships ?? []} />

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
                    <strong>{a.name[locale] ?? a.name.en}</strong>
                    <em>{a.description[locale] ?? a.description.en}</em>
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
  font-size: 57px;
  color: ${({ theme }) => theme.colors.gold};
  line-height: 1;
`

const EndingTitle = styled(TextBalance)`
  font-size: clamp(27px, 4vw, 39px);
  color: ${({ theme }) => theme.colors.goldBright};
  margin-top: 6px;
`

const EndingName = styled.p`
  font-size: clamp(27px, 4vw, 39px);
  color: ${({ theme }) => theme.colors.goldBright};
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
`

const EpithetTag = styled.span`
  font-size: 19px;
  background: rgba(201, 164, 76, 0.15);
  border: 1px solid rgba(201, 164, 76, 0.3);
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 4px 12px;
  color: ${({ theme }) => theme.colors.gold};
  font-family: ${({ theme }) => theme.fonts.display};
  letter-spacing: 0.06em;
`

const EpithetSub = styled.p`
  font-size: 17px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  margin-top: 2px;
`

const Epilogue = styled(TextPretty)`
  margin: 22px auto 6px;
  max-width: 60ch;
  font-size: 21px;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.parchment};
  font-style: italic;
`

const ScoreBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 40px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink3};
`

const ScoreLabel = styled.span`
  font-size: 13px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const ScoreValue = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 41px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.goldBright};
  font-variant-numeric: tabular-nums;
`

const ScoreDetail = styled.span`
  font-size: 14px;
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
    font-size: 23px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
    font-weight: 600;
    margin: 0;
  }

  dt {
    font-size: 13px;
    color: ${({ theme }) => theme.colors.muted};
    letter-spacing: 0.04em;
  }
`

const Section = styled.div`
  margin: 24px 0 10px;
  text-align: left;
`

const SectionTitle = styled.h3`
  font-size: 14px;
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
  gap: 6px;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink2};
  min-width: 100px;
`

const FactionFlagWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
`

const FactionName = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
`

const FactionTier = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.gold};
  letter-spacing: 0.06em;
  text-transform: uppercase;
`

const FactionValue = styled.span`
  font-size: 19px;
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
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`

const RivalValue = styled.span`
  display: flex;
  align-items: center;
  gap: 12px;
`

const RivalStat = styled.span<{ $win: boolean }>`
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $win, theme }) => ($win ? theme.colors.goldBright : theme.colors.muted)};
`

const RivalVs = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`

const RivalOutcome = styled.p`
  margin-top: 8px;
  font-size: 15px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.parchmentDim};
  text-align: center;
`

const DistinctionsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
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

const StoryScroller = styled.div`
  max-height: 340px;
  overflow-y: auto;
  padding-right: 10px;
  scrollbar-width: thin;
  scrollbar-color: ${({ theme }) => theme.colors.line2} transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.line2};
    border-radius: 999px;
  }
`

const SeasonDivider = styled.div`
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
  margin: 16px 0 6px;
  padding-left: 22px;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 50%;
    width: 10px;
    height: 1px;
    background: ${({ theme }) => theme.colors.gold};
  }
`

const StoryRow = styled.div`
  display: flex;
  gap: 12px;
`

const StoryRail = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 14px;
  flex-shrink: 0;
`

const StoryDot = styled.span`
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.gold};
  box-shadow: 0 0 0 3px rgba(201, 164, 76, 0.15);
  margin-top: 5px;
  flex-shrink: 0;
`

const StoryLine = styled.span`
  flex: 1;
  width: 1px;
  background: ${({ theme }) => theme.colors.line2};
  margin: 3px 0;
`

const StoryBody = styled.div`
  flex: 1;
  padding-bottom: 16px;
`

const StoryMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
`

const StoryTurn = styled.span`
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const StoryTag = styled.span<{ $kind?: TurnLogKind }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ $kind }) => ($kind ? STORY_KIND_TONE[$kind].fg : theme.colors.gold)};
  border: 1px solid
    ${({ $kind }) => ($kind ? STORY_KIND_TONE[$kind].border : "rgba(201, 164, 76, 0.25)")};
  border-radius: 999px;
  padding: 1px 8px;
  background: ${({ $kind }) => ($kind ? STORY_KIND_TONE[$kind].bg : "transparent")};
  ${({ $kind }) => $kind && `font-weight: 600;`}
`

const StoryKindIcon = styled.span`
  display: inline-flex;
  align-items: center;
`

const StoryHeadline = styled.p`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.parchment};
  margin: 0;
`

const StoryDetail = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.parchmentDim};
  margin: 2px 0 0;
  line-height: 1.45;
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
  font-size: 15px;
`

const BondsGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`

const BondBadge = styled.div<{ $tone: BondTone }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  min-width: 108px;
  border: 1px solid ${({ $tone }) => TONES[$tone].border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $tone }) => TONES[$tone].fill};
`

const BondName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.parchment};
  text-align: center;
`

const BondRole = styled.span`
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const BondTier = styled.span`
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
`

const BondValue = styled.span<{ $tone: BondTone }>`
  font-size: 19px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $tone }) => TONES[$tone].text};
`

const BondPeak = styled.span`
  font-size: 12px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.muted2};
  text-align: center;
`

const EndingAchievements = styled.div`
  margin: 22px 0 6px;

  h2 {
    font-size: 15px;
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
    font-size: 15px;
    color: ${({ theme }) => theme.colors.goldBright};
  }

  em {
    font-style: normal;
    font-size: 14px;
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
  gap: 16px;
  justify-content: center;
  margin-top: 26px;
`

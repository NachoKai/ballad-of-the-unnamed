import { useEffect, useState } from "react"
import { styled } from "styled-components"
import type { Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { api, type AchievementView, type CollectionResponse, type EncounterView } from "../api"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { BtnGhost } from "./ui/Button"
import { rise } from "./ui/Animation"
import { AchIcon } from "./AchIcon"

interface Props {
  locale: Locale
  onBack: () => void
}

// How many "still to discover" chips render before the show-more toggle.
const UNSEEN_LIMIT = 18

export function CollectionScreen({ locale, onBack }: Props) {
  const [data, setData] = useState<CollectionResponse | null>(null)
  const [catalog, setCatalog] = useState<Record<string, AchievementView>>({})
  // Per-bank "show all" flags for the still-to-discover chip lists.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    api
      .collection(locale)
      .then(setData)
      .catch(() => setData(null))
    api
      .achievements(locale)
      .then((res) => {
        const byId: Record<string, AchievementView> = {}
        for (const a of res.achievements) byId[a.id] = a
        setCatalog(byId)
      })
      .catch(() => setCatalog({}))
  }, [locale])

  const endings = data?.uniqueEndings ?? []
  const factions = data?.uniqueFactions ?? []
  const classes = data?.uniqueClasses ?? []
  const achievements = data?.uniqueAchievements ?? []

  return (
    <Screen>
      <Header>
        <h1>{t(locale, "trophyHallTitle")}</h1>
        <BtnGhost type="button" onClick={onBack}>
          ← {t(locale, "back")}
        </BtnGhost>
      </Header>

      {!data ? (
        <EmptyMsg>{t(locale, "loading")}</EmptyMsg>
      ) : data.totalRuns === 0 ? (
        <EmptyMsg>{t(locale, "emptyCollection")}</EmptyMsg>
      ) : (
        <>
          <StatRow>
            <StatCard>
              <StatValue>{data.totalRuns}</StatValue>
              <StatLabel>{t(locale, "totalRuns")}</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{data.completion.overall.pct}%</StatValue>
              <StatLabel>{t(locale, "completionPct")}</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>
                {data.completion.overall.collected}/{data.completion.overall.total}
              </StatValue>
              <StatLabel>{t(locale, "collectionProgress")}</StatLabel>
            </StatCard>
          </StatRow>

          <Section>
            <SectionTitle>{t(locale, "collectionProgress")}</SectionTitle>
            <ProgressRow>
              <ProgressLabel>{t(locale, "endingsCollected")}</ProgressLabel>
              <Bar>
                <Fill
                  pct={
                    (data.completion.endings.collected /
                      Math.max(1, data.completion.endings.total)) *
                    100
                  }
                />
              </Bar>
              <ProgressCount>
                {data.completion.endings.collected}/{data.completion.endings.total}
              </ProgressCount>
            </ProgressRow>
            <ProgressRow>
              <ProgressLabel>{t(locale, "factionsCollected")}</ProgressLabel>
              <Bar>
                <Fill
                  pct={
                    (data.completion.factions.collected /
                      Math.max(1, data.completion.factions.total)) *
                    100
                  }
                />
              </Bar>
              <ProgressCount>
                {data.completion.factions.collected}/{data.completion.factions.total}
              </ProgressCount>
            </ProgressRow>
            <ProgressRow>
              <ProgressLabel>{t(locale, "classesCollected")}</ProgressLabel>
              <Bar>
                <Fill
                  pct={
                    (data.completion.classes.collected /
                      Math.max(1, data.completion.classes.total)) *
                    100
                  }
                />
              </Bar>
              <ProgressCount>
                {data.completion.classes.collected}/{data.completion.classes.total}
              </ProgressCount>
            </ProgressRow>
            <ProgressRow>
              <ProgressLabel>{t(locale, "achievementsCollected")}</ProgressLabel>
              <Bar>
                <Fill
                  pct={
                    (data.completion.achievements.collected /
                      Math.max(1, data.completion.achievements.total)) *
                    100
                  }
                />
              </Bar>
              <ProgressCount>
                {data.completion.achievements.collected}/{data.completion.achievements.total}
              </ProgressCount>
            </ProgressRow>
          </Section>

          <Section>
            <SectionTitle>{t(locale, "endingsCollected")}</SectionTitle>
            {endings.length === 0 ? (
              <EmptyMsg>{t(locale, "emptyCollection")}</EmptyMsg>
            ) : (
              <TagGrid>
                {endings.map((e) => (
                  <Tag key={e}>{t(locale, `ending_${e}`)}</Tag>
                ))}
              </TagGrid>
            )}
          </Section>

          <Section>
            <SectionTitle>{t(locale, "factionsCollected")}</SectionTitle>
            {factions.length === 0 ? (
              <EmptyMsg>{t(locale, "emptyCollection")}</EmptyMsg>
            ) : (
              <TagGrid>
                {factions.map((f) => (
                  <Tag key={f}>
                    <FactionFlag factionId={f} size={16} />
                    {t(locale, `faction_${f}`)}
                  </Tag>
                ))}
              </TagGrid>
            )}
          </Section>

          <Section>
            <SectionTitle>{t(locale, "classesCollected")}</SectionTitle>
            {classes.length === 0 ? (
              <EmptyMsg>{t(locale, "emptyCollection")}</EmptyMsg>
            ) : (
              <TagGrid>
                {classes.map((c) => (
                  <Tag key={c}>{t(locale, `class_${c}`)}</Tag>
                ))}
              </TagGrid>
            )}
          </Section>

          <Section>
            <SectionTitle>{t(locale, "permaAchievements")}</SectionTitle>
            {achievements.length === 0 ? (
              <EmptyMsg>{t(locale, "emptyCollection")}</EmptyMsg>
            ) : (
              <TagGrid>
                {achievements.map((a) => {
                  const ach = catalog[a]
                  return (
                    <Tag key={a}>
                      <AchIcon name={ach?.icon ?? "sparkles"} size={14} />
                      {ach?.name ?? a}
                    </Tag>
                  )
                })}
              </TagGrid>
            )}
          </Section>

          <Section>
            <SectionTitle>{t(locale, "encountersTitle")}</SectionTitle>
            <EncounterSub
              locale={locale}
              titleKey="storyEvents"
              progress={data.encounterProgress.events}
              unseen={data.encounters.events.filter((e) => !e.seen)}
              expanded={Boolean(expanded.events)}
              onToggle={() => setExpanded((s) => ({ ...s, events: !s.events }))}
            />
            <EncounterSub
              locale={locale}
              titleKey="minigamesTitle"
              progress={data.encounterProgress.minigames}
              unseen={data.encounters.minigames.filter((e) => !e.seen)}
              expanded={Boolean(expanded.minigames)}
              onToggle={() => setExpanded((s) => ({ ...s, minigames: !s.minigames }))}
            />
            <EncounterSub
              locale={locale}
              titleKey="combatEncounters"
              progress={data.encounterProgress.combats}
              unseen={data.encounters.combats.filter((e) => !e.seen)}
              expanded={Boolean(expanded.combats)}
              onToggle={() => setExpanded((s) => ({ ...s, combats: !s.combats }))}
            />
          </Section>
        </>
      )}
    </Screen>
  )
}

// One encounter bank (story events / minigames / combat): a progress row plus
// a "still to discover" chip list, capped with a show-more toggle.
function EncounterSub({
  locale,
  titleKey,
  progress,
  unseen,
  expanded,
  onToggle,
}: {
  locale: Locale
  titleKey: string
  progress: { collected: number; total: number }
  unseen: EncounterView[]
  expanded: boolean
  onToggle: () => void
}) {
  const total = Math.max(1, progress.total)
  const shown = expanded ? unseen : unseen.slice(0, UNSEEN_LIMIT)
  return (
    <SubBlock>
      <ProgressRow>
        <ProgressLabel>{t(locale, titleKey)}</ProgressLabel>
        <Bar>
          <Fill pct={(progress.collected / total) * 100} />
        </Bar>
        <ProgressCount>
          {progress.collected}/{progress.total}
        </ProgressCount>
      </ProgressRow>
      {unseen.length === 0 ? (
        <DoneMsg>{t(locale, "allDiscovered")}</DoneMsg>
      ) : (
        <>
          <DiscoverLabel>
            {t(locale, "stillToDiscover")} ({unseen.length})
          </DiscoverLabel>
          <TagGrid>
            {shown.map((e) => {
              // Only render the location tag when the group resolves to a real
              // faction name (some events use non-faction locations like
              // "road"/"dungeon"/"court", which have no localized label).
              const groupKey = `faction_${e.group}`
              const groupName = e.group ? t(locale, groupKey) : ""
              const hasGroup = Boolean(e.group) && groupName !== groupKey
              return (
                <Tag key={e.id}>
                  {hasGroup && <GroupTag>{groupName}</GroupTag>}
                  {e.label}
                </Tag>
              )
            })}
          </TagGrid>
          {unseen.length > UNSEEN_LIMIT && (
            <ToggleBtn type="button" onClick={onToggle}>
              {expanded ? t(locale, "showLess") : t(locale, "showAll")}
            </ToggleBtn>
          )}
        </>
      )}
    </SubBlock>
  )
}

const Screen = styled.div`
  animation: ${rise} 0.4s ease both;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 27px;
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

const EmptyMsg = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 60px;
`

const StatRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 28px;
`

const StatCard = styled(Panel)`
  flex: 1;
  text-align: center;
  padding: 18px 14px;
`

const StatValue = styled.div`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 29px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.goldBright};
`

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
`

const Section = styled.div`
  margin-bottom: 24px;
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 19px;
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 12px;
`

const TagGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`

const Tag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.parchment};
`

const ProgressRow = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 10px;
`

const ProgressLabel = styled.span`
  width: 130px;
  flex-shrink: 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`

const Bar = styled.div`
  flex: 1;
  height: 10px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  overflow: hidden;
`

const Fill = styled.div<{ pct: number }>`
  height: 100%;
  width: ${({ pct }) => Math.min(100, Math.max(0, pct))}%;
  background: ${({ theme }) => theme.colors.gold};
  border-radius: 999px;
  transition: width 0.4s ease;
`

const ProgressCount = styled.span`
  width: 64px;
  flex-shrink: 0;
  text-align: right;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 15px;
  color: ${({ theme }) => theme.colors.goldBright};
`

const SubBlock = styled.div`
  margin-bottom: 18px;
`

const DoneMsg = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.gold};
  margin: 6px 0 0;
`

const DiscoverLabel = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 10px 0 8px;
`

const GroupTag = styled.span`
  color: ${({ theme }) => theme.colors.gold};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  &::after {
    content: "\00a0·\00a0";
    color: ${({ theme }) => theme.colors.line};
  }
`

const ToggleBtn = styled.button`
  margin-top: 10px;
  padding: 4px 12px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  color: ${({ theme }) => theme.colors.gold};
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

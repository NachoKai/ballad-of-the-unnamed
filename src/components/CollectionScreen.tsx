import { useEffect, useState } from "react"
import { styled } from "styled-components"
import type { Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { api, type AchievementView } from "../api"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { BtnGhost } from "./ui/Button"
import { rise } from "./ui/Animation"
import { AchIcon } from "./AchIcon"

interface Props {
  locale: Locale
  onBack: () => void
}

interface CollectionData {
  uniqueFactions: string[]
  uniqueEndings: string[]
  uniqueClasses: string[]
  uniqueAchievements: string[]
  totalRuns: number
  completion: {
    endings: { collected: number; total: number }
    factions: { collected: number; total: number }
    classes: { collected: number; total: number }
    achievements: { collected: number; total: number }
    overall: { collected: number; total: number; pct: number }
  }
}

export function CollectionScreen({ locale, onBack }: Props) {
  const [data, setData] = useState<CollectionData | null>(null)
  const [catalog, setCatalog] = useState<Record<string, AchievementView>>({})

  useEffect(() => {
    api
      .collection()
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
        </>
      )}
    </Screen>
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
    font-size: 26px;
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
  font-size: 28px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.goldBright};
`

const StatLabel = styled.div`
  font-size: 13px;
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
  font-size: 18px;
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 12px;
`

const TagGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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
  gap: 12px;
  margin-bottom: 10px;
`

const ProgressLabel = styled.span`
  width: 130px;
  flex-shrink: 0;
  font-size: 13px;
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
  font-size: 14px;
  color: ${({ theme }) => theme.colors.goldBright};
`

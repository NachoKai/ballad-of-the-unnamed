import { useEffect, useState } from "react"
import { styled } from "styled-components"
import type { Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { api } from "../api"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { BtnGhost } from "./ui/Button"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  onBack: () => void
}

export function CollectionScreen({ locale, onBack }: Props) {
  const [data, setData] = useState<{
    uniqueFactions: string[]
    uniqueEndings: string[]
    totalRuns: number
  } | null>(null)

  useEffect(() => {
    api
      .collection()
      .then(setData)
      .catch(() => setData(null))
  }, [])

  const endings = data?.uniqueEndings ?? []
  const factions = data?.uniqueFactions ?? []

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
              <StatValue>{factions.length}</StatValue>
              <StatLabel>{t(locale, "factionsCollected")}</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue>{endings.length}/4</StatValue>
              <StatLabel>{t(locale, "endingsCollected")}</StatLabel>
            </StatCard>
          </StatRow>

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

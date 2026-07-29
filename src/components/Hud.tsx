import type { CharacterState, Locale } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import { styled } from "styled-components"
import { t as translate } from "../i18n/strings"
import { STAT_ABBR } from "../constants"
import { Panel } from "./ui/Panel"
import { Faint } from "./ui/Text"

interface Props {
  character: CharacterState
  locale: Locale
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
    <HudWrap>
      <TopRow>
        <Name>
          {c.name} <Faint>· {className}</Faint>
          {c.archetype && <ArchetypeTag>{c.archetype}</ArchetypeTag>}
        </Name>
        <TurnPill>
          {t("turn")} <b>{c.turn}</b>
        </TurnPill>
      </TopRow>

      <MetersRow>
        <Meter>
          {t("age")} <b>{c.age}</b>
        </Meter>
        <Meter>
          {t("health")} <b>{c.health}</b>
        </Meter>
        <Meter>
          {t("gold")} <b>{c.gold}</b>
        </Meter>
        <Meter>
          {t("fame")} <b>{c.fame}</b>
        </Meter>
        <Meter>
          {t("power")} <b>{c.powerLevel}</b>
        </Meter>
        <Meter>
          MV <b>{c.marketValue}</b>
        </Meter>
        <MomentumBadge $variant={c.momentum}>{t(momentumKey)}</MomentumBadge>
      </MetersRow>

      <StatsStrip>
        {STAT_KEYS.map((k) => (
          <StatPill key={k}>
            {t(STAT_ABBR[k])} <b>{c[k]}</b>
          </StatPill>
        ))}
      </StatsStrip>
    </HudWrap>
  )
}

const HudWrap = styled(Panel)`
  position: sticky;
  top: 78px;
  z-index: 10;
`

const TurnPill = styled.span`
  margin-left: auto;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.parchment};

  b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
    font-weight: 600;
  }
`

const ArchetypeTag = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  vertical-align: middle;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px 14px;
  padding: 16px 18px;
`

const MetersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 16px 18px;
`

const Name = styled.span`
  flex: 1;
  min-width: 0;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 20px;
  color: ${({ theme }) => theme.colors.goldBright};
`

const Meter = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 12px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;

  b {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
    text-transform: none;
  }
`

const MomentumBadge = styled.span<{ $variant: string }>`
  margin-left: auto;
  padding: 5px 12px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $variant, theme }) =>
    $variant === "falling" ? theme.colors.bloodBright : theme.colors.sage};
  border-color: ${({ $variant, theme }) =>
    $variant === "falling" ? theme.colors.bloodBright : theme.colors.sage};
`

const StatsStrip = styled.div`
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 16px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`

const StatPill = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.parchment};

  b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
    font-weight: 600;
  }
`

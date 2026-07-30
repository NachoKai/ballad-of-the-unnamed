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
  onShopOpen?: () => void
}

export function Hud({ character: c, locale, onShopOpen }: Props) {
  const t = (k: string) => translate(locale, k)
  const className = t(`class_${c.class}`)
  const momentumKey =
    c.momentum === "rising"
      ? "momentumRising"
      : c.momentum === "falling"
        ? "momentumFalling"
        : "momentumNormal"
  const arcKey = `arc_${c.currentArc}`
  const inventoryCount = c.inventory?.reduce((s, i) => s + i.qty, 0) ?? 0
  const playerScore = (c.counters["battles_won"] ?? 0) + (c.counters["quests_completed"] ?? 0)

  return (
    <HudWrap>
      <TopRow>
        <Name>
          {c.name} <Faint>· {className}</Faint>
          {c.archetype && <ArchetypeTag>{c.archetype}</ArchetypeTag>}
          {c.currentClanId && <ClanTag>{c.currentClanId}</ClanTag>}
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
          {t("season")} <b>{c.seasonCount}</b>
        </Meter>
        <Meter>
          {t("health")} <b>{c.health}</b>
        </Meter>
        <Meter $low={c.stamina < 20}>
          {t("stamina")} <b>{c.stamina}</b>
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
        <ArcPill>{t(arcKey)}</ArcPill>
        {STAT_KEYS.map((k) => (
          <StatPill key={k}>
            {t(STAT_ABBR[k])} <b>{c[k]}</b>
          </StatPill>
        ))}
        {c.rival && (
          <RivalBadge>
            ⚔️ {c.rival.name} {t("vs")} <b>{playerScore}</b>–<b>{c.rival.score}</b>
          </RivalBadge>
        )}
        {c.huntedBy && (
          <HuntedBadge>
            ⚠️ {t("hunted")} {c.huntedBy}
          </HuntedBadge>
        )}
        {onShopOpen && (
          <ShopBtn type="button" onClick={onShopOpen}>
            {t("shop")}
            {inventoryCount > 0 && <InvBadge>{inventoryCount}</InvBadge>}
          </ShopBtn>
        )}
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

const Meter = styled.span<{ $low?: boolean }>`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 5px 12px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ $low, theme }) => ($low ? theme.colors.bloodBright : theme.colors.line)};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: ${({ $low, theme }) => ($low ? theme.colors.bloodBright : theme.colors.muted)};
  text-transform: uppercase;

  b {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    color: ${({ $low, theme }) => ($low ? theme.colors.bloodBright : theme.colors.parchment)};
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

const ArcPill = styled(StatPill)`
  border-color: ${({ theme }) => theme.colors.gold};
  color: ${({ theme }) => theme.colors.goldBright};
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.1em;
`

const ShopBtn = styled.button`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.gold};
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    background: ${({ theme }) => theme.colors.ink2};
    border-color: ${({ theme }) => theme.colors.gold};
  }
`

const InvBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gold};
  color: ${({ theme }) => theme.colors.ink};
  font-size: 11px;
  font-weight: 700;
`

const ClanTag = styled.span`
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border: 1px solid ${({ theme }) => theme.colors.sage};
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.sage};
  vertical-align: middle;
`

const RivalBadge = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid ${({ theme }) => theme.colors.bloodBright};
  border-radius: 999px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.bloodBright};
  letter-spacing: 0.04em;

  b {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.parchment};
  }
`

const HuntedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(191, 30, 30, 0.12);
  border: 1px solid ${({ theme }) => theme.colors.bloodBright};
  border-radius: 999px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.bloodBright};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

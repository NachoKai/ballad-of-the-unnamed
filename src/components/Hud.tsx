import type { CharacterState, Locale } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import { styled } from "styled-components"
import { genderize } from "@shared/genderize"
import { gt as translateFor, t as translate } from "../i18n/strings"
import { STAT_ABBR } from "../constants"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { Faint } from "./ui/Text"
import { Tooltip } from "./ui/Tooltip"

interface Props {
  character: CharacterState
  locale: Locale
  onShopOpen?: () => void
}

const REPUTATION_TIERS: { min: number; id: string }[] = [
  { min: 0, id: "outcast" },
  { min: 5, id: "stranger" },
  { min: 20, id: "known" },
  { min: 35, id: "acquaintance" },
  { min: 50, id: "respected" },
  { min: 65, id: "notable" },
  { min: 78, id: "renowned" },
  { min: 90, id: "legend" },
  { min: 99, id: "myth" },
]

function reputationTier(value: number): string {
  let id = REPUTATION_TIERS[0].id
  for (const tier of REPUTATION_TIERS) {
    if (value >= tier.min) id = tier.id
  }
  return id
}

function personalitySummary(p: Record<string, number>): string[] {
  return Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag)
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

  const primaryRep =
    c.reputations.length > 0
      ? c.reputations.reduce((a, b) => (a.peakValue >= b.peakValue ? a : b))
      : null

  const topTags = personalitySummary(c.personality)

  return (
    <HudWrap>
      <TopRow>
        <Name>
          {c.name} <Faint>· {className}</Faint>
          {c.archetype && (
            <Tooltip content={t("tooltip_archetype")} side="bottom">
              <ArchetypeTag>{genderize(t(`archetype_${c.archetype}`), c.gender)}</ArchetypeTag>
            </Tooltip>
          )}
          {c.currentClanId && (
            <ClanTag>
              <FactionFlag factionId={c.currentClanId} size={14} />
              {t(`faction_${c.currentClanId}`)}
            </ClanTag>
          )}
        </Name>
        <TurnTip content={t("tooltip_turn")} align="end" side="bottom">
          <TurnPill>
            {t("turn")} <b>{c.turn}</b>
          </TurnPill>
        </TurnTip>
      </TopRow>

      <MetersRow>
        <Tooltip content={t("tooltip_age")}>
          <Meter>
            {t("age")} <b>{c.age}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_season")}>
          <Meter>
            {t("season")} <b>{c.seasonCount}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_health")}>
          <Meter>
            {t("health")} <b>{c.health}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_stamina")}>
          <Meter $low={c.stamina < 20}>
            {t("stamina")} <b>{c.stamina}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_gold")}>
          <Meter>
            {t("gold")} <b>{c.gold}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_fame")}>
          <Meter>
            {t("fame")} <b>{c.fame}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_power")}>
          <Meter>
            {t("power")} <b>{c.powerLevel}</b>
          </Meter>
        </Tooltip>
        <Tooltip content={t("tooltip_mv")}>
          <Meter>
            MV <b>{c.marketValue}</b>
          </Meter>
        </Tooltip>
        <MomentumTip content={t("tooltip_momentum")} align="end">
          <MomentumBadge $variant={c.momentum}>{t(momentumKey)}</MomentumBadge>
        </MomentumTip>
      </MetersRow>

      <StatsStrip>
        <Tooltip content={t("tooltip_arc")}>
          <ArcPill>{t(arcKey)}</ArcPill>
        </Tooltip>
        {STAT_KEYS.map((k) => (
          <Tooltip key={k} content={t(`tooltip_stat_${k}`)}>
            <StatPill>
              {t(STAT_ABBR[k])} <b>{c[k]}</b>
            </StatPill>
          </Tooltip>
        ))}
        {primaryRep && (
          <Tooltip content={t("tooltip_reputation")}>
            <RepPill>
              <FactionFlag factionId={primaryRep.faction} size={14} />
              {t(`faction_${primaryRep.faction}`)} ·{" "}
              {translateFor(
                locale,
                c.gender,
                `reputation_tier_${reputationTier(primaryRep.value)}`,
              )}{" "}
              [{primaryRep.value}]
            </RepPill>
          </Tooltip>
        )}
        {topTags.length > 0 && (
          <TagPill>
            {topTags
              .map((tag) => translateFor(locale, c.gender, `personality_tag_${tag}`))
              .join(" · ")}
          </TagPill>
        )}
        {c.rival && (
          <Tooltip content={t("tooltip_rival")}>
            <RivalBadge>
              ⚔️ {c.rival.name} {t("vs")} <b>{playerScore}</b>—<b>{c.rival.score}</b>
            </RivalBadge>
          </Tooltip>
        )}
        {c.huntedBy && (
          <Tooltip content={t("tooltip_hunted")}>
            <HuntedBadge>
              ⚠️ {t("hunted")} {t(`faction_${c.huntedBy}`)}
            </HuntedBadge>
          </Tooltip>
        )}
        {onShopOpen && (
          <ShopTip content={t("tooltip_shop")} align="end">
            <ShopBtn type="button" onClick={onShopOpen}>
              {t("shop")}
              {inventoryCount > 0 && <InvBadge>{inventoryCount}</InvBadge>}
            </ShopBtn>
          </ShopTip>
        )}
      </StatsStrip>
    </HudWrap>
  )
}

const HudWrap = styled(Panel)``

const TurnTip = styled(Tooltip)`
  margin-left: auto;
`

const MomentumTip = styled(Tooltip)`
  margin-left: auto;
`

const ShopTip = styled(Tooltip)`
  margin-left: auto;
`

const TurnPill = styled.span`
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
  gap: 12px;
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
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  padding: 2px 8px;
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

const RepPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid ${({ theme }) => theme.colors.gold};
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.gold};
  text-transform: uppercase;
`

const TagPill = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid ${({ theme }) => theme.colors.sage};
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.sage};
`

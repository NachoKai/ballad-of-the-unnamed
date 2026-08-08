import {
  Activity,
  Award,
  Dumbbell,
  Globe,
  Home,
  ScrollText,
  Skull,
  Store,
  TriangleAlert,
} from "lucide-react"
import type { CharacterState, Locale } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import { keyframes, styled } from "styled-components"
import { genderize } from "@shared/genderize"
import { GAME_CONFIG, REPUTATION_TIERS, reputationTierId } from "@shared/config"
import { gt as translateFor, t as translate } from "../i18n/strings"
import { STAT_ABBR } from "../constants"
import type { Theme } from "../theme"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { Tag } from "./ui/Tag"
import { Tooltip } from "./ui/Tooltip"

interface Props {
  character: CharacterState
  locale: Locale
  onShopOpen?: () => void
  canBuy?: boolean
  onDetailsOpen?: () => void
}

// Reputation is clamped 0..100 server-side; the bar fills across the whole
// scale so the tier tick marks stay at their true positions.
function repFillPct(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function Hud({ character: c, locale, onShopOpen, canBuy, onDetailsOpen }: Props) {
  const t = (k: string) => translate(locale, k)
  const className = t(`class_${c.class}`)
  const inventoryCount = c.inventory?.reduce((s, i) => s + i.qty, 0) ?? 0

  const primaryRep =
    c.reputations.length > 0
      ? c.reputations.reduce((a, b) => (a.peakValue >= b.peakValue ? a : b))
      : null

  const liability = c.liability ?? 0
  const notorious = liability >= GAME_CONFIG.liabilityNotoriousThreshold
  const liabilityTint = liability > 0 ? (notorious ? "blood" : "stain") : undefined

  return (
    <HudWrap>
      <NameBanner>
        <NameText>
          <b>{c.name}</b>
          <NameSep aria-hidden="true">·</NameSep>
          <span>{className}</span>
          {c.archetype && (
            <>
              <NameSep aria-hidden="true">·</NameSep>
              <span>{genderize(t(`archetype_${c.archetype}`), c.gender)}</span>
            </>
          )}
        </NameText>
      </NameBanner>

      <TagRow>
        <TagList>
          {c.currentClanId && (
            <Tooltip content={t("tooltip_faction")} side="bottom">
              <Tag $tone="sage">
                <FactionFlag factionId={c.currentClanId} size={14} />
                {t(`faction_${c.currentClanId}`)}
              </Tag>
            </Tooltip>
          )}
          {c.currentRegion !== c.homeRegion ? (
            <Tooltip content={t("tooltip_location")} side="bottom">
              <Tag $tone="muted">
                <Globe size={12} /> {t("abroadTag")}
              </Tag>
            </Tooltip>
          ) : (
            <Tooltip content={t("tooltip_location")} side="bottom">
              <Tag $tone="gold">
                <Home size={12} /> {t("homeTag")}
              </Tag>
            </Tooltip>
          )}
          {c.huntedBy && (
            <Tooltip content={t("tooltip_hunted")}>
              <Tag $tone="blood">
                <TriangleAlert size={12} /> {t("hunted")} {t(`faction_${c.huntedBy}`)}
              </Tag>
            </Tooltip>
          )}
        </TagList>
        {onDetailsOpen && (
          <Tooltip content={t("tooltip_details")} align="end">
            <DetailsBtn type="button" onClick={onDetailsOpen}>
              <ScrollText size={14} aria-hidden="true" />
              {t("details")}
            </DetailsBtn>
          </Tooltip>
        )}
        {onShopOpen && (
          <ShopTip content={t("tooltip_shop")} align="end">
            <ShopBtn type="button" onClick={onShopOpen}>
              <Store size={14} aria-hidden="true" />
              {t("shop")}
              {inventoryCount > 0 && <InvBadge>{inventoryCount}</InvBadge>}
              {canBuy && <ShopDot aria-hidden="true" />}
            </ShopBtn>
          </ShopTip>
        )}
      </TagRow>

      <SectionLabel>
        <Activity size={12} aria-hidden="true" /> {t("stats")}
      </SectionLabel>
      <PrimaryGrid>
        <PrimaryTip content={t("tooltip_age")}>
          <PrimaryCard $tint="bronze">
            <CardLabel $tint="bronze">{t("age")}</CardLabel>
            <CardValue $tint="bronze">{c.age}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_health")}>
          <PrimaryCard $tint="sage" $low={c.health < 30}>
            <CardLabel>{t("health")}</CardLabel>
            <CardValue $low={c.health < 30}>{c.health}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_stamina")}>
          <PrimaryCard $tint="sage" $low={c.stamina < 20}>
            <CardLabel>{t("stamina")}</CardLabel>
            <CardValue $low={c.stamina < 20}>{c.stamina}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_gold")}>
          <PrimaryCard $tint="gold">
            <CardLabel>{t("gold")}</CardLabel>
            <CardValue $tint="gold">{c.gold}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_fame")}>
          <PrimaryCard $tint="silver">
            <CardLabel $tint="silver">{t("fame")}</CardLabel>
            <CardValue $tint="silver">{c.fame}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_power")}>
          <PrimaryCard $tint="blood">
            <CardLabel $tint="blood">{t("power")}</CardLabel>
            <CardValue $tint="blood">{c.powerLevel}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_liability")}>
          <PrimaryCard $tint={liabilityTint}>
            <CardLabel $tint={liabilityTint}>
              {notorious && <Skull size={12} aria-hidden="true" />}
              {t("liability")}
            </CardLabel>
            <CardValue $tint={liabilityTint}>{liability}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
        <PrimaryTip content={t("tooltip_mv")}>
          <PrimaryCard $tint="gold">
            <CardLabel $tint="gold">MV</CardLabel>
            <CardValue $tint="gold">{c.marketValue}</CardValue>
          </PrimaryCard>
        </PrimaryTip>
      </PrimaryGrid>

      <SectionLabel>
        <Dumbbell size={12} aria-hidden="true" /> {t("attributes")}
      </SectionLabel>
      <AttrRow>
        {STAT_KEYS.map((k) => (
          <PrimaryTip key={k} content={t(`tooltip_stat_${k}`)}>
            <PrimaryCard $tint={STAT_TINT[k]}>
              <CardLabel $tint={STAT_TINT[k]}>{t(STAT_ABBR[k])}</CardLabel>
              <CardValue $tint={STAT_TINT[k]}>{c[k]}</CardValue>
            </PrimaryCard>
          </PrimaryTip>
        ))}
      </AttrRow>

      {primaryRep && (
        <SectionLabel>
          <Award size={12} aria-hidden="true" /> {t("reputation")}
        </SectionLabel>
      )}
      <StatusRow>
        {primaryRep && (
          <RepTip content={t("tooltip_reputation")}>
            <RepBar>
              <RepBarHead>
                <FactionFlag factionId={primaryRep.faction} size={14} />
                <RepBarName>{t(`faction_${primaryRep.faction}`)}</RepBarName>
                <RepBarTier>
                  {translateFor(
                    locale,
                    c.gender,
                    `reputation_tier_${reputationTierId(primaryRep.value)}`,
                  )}{" "}
                  [{primaryRep.value}]
                </RepBarTier>
              </RepBarHead>
              <RepBarTrack>
                <RepBarFill $pct={repFillPct(primaryRep.value)} />
                {REPUTATION_TIERS.slice(1).map((tier) => (
                  <RepTick key={tier.id} $at={tier.min} $active={primaryRep.value >= tier.min} />
                ))}
              </RepBarTrack>
            </RepBar>
          </RepTip>
        )}
      </StatusRow>
    </HudWrap>
  )
}

const HudWrap = styled(Panel)``

const ShopTip = styled(Tooltip)`
  flex: 0 0 auto;
`

const TagRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 18px 14px;
`

const TagList = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-width: 0;
`

const NameBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 6px;

  &::before,
  &::after {
    content: "";
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, transparent, ${({ theme }) => theme.colors.line2});
  }

  &::before {
    margin-right: 8px;
  }

  &::after {
    margin-left: 8px;
    background: linear-gradient(90deg, ${({ theme }) => theme.colors.line2}, transparent);
  }
`

const NameText = styled.span`
  display: inline-flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.colors.parchment};
  }
`

const NameSep = styled.span`
  color: ${({ theme }) => theme.colors.gold};
`

const SectionLabel = styled.h3`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 18px 18px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};

  svg {
    flex-shrink: 0;
    opacity: 0.85;
  }

  &::after {
    content: "";
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, ${({ theme }) => theme.colors.line2}, transparent);
  }
`

const PrimaryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 20px 18px 18px;
`

const AttrRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 18px 18px;
`

type TileTint = "gold" | "sage" | "blood" | "stain" | "bronze" | "silver" | "blue" | "purple"

// Per-attribute accent: the classic RPG color-coding for the five core stats.
const STAT_TINT: Record<string, TileTint> = {
  strength: "blood",
  dexterity: "gold",
  constitution: "sage",
  intelligence: "blue",
  charisma: "purple",
}

// Single source of truth for the card accent colors, keyed by tint.
function tileColor(tint: TileTint | undefined, theme: Theme, fallback: string): string {
  switch (tint) {
    case "gold":
      return theme.colors.goldBright
    case "sage":
      return theme.colors.sage
    case "blood":
      return theme.colors.bloodBright
    case "stain":
      return theme.colors.rarity.volatile
    case "bronze":
      return theme.colors.rank3
    case "silver":
      return theme.colors.rank2
    case "blue":
      return theme.colors.rarity.rare
    case "purple":
      return theme.colors.rarity.epic
    default:
      return fallback
  }
}

const PrimaryTip = styled(Tooltip)`
  flex: 1 1 0;
  min-width: 104px;
`

const PrimaryCard = styled.span<{ $tint?: TileTint; $low?: boolean }>`
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px 8px 11px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-top: 2px solid
    ${({ $tint, $low, theme }) =>
      $low ? theme.colors.bloodBright : tileColor($tint, theme, theme.colors.line2)};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const CardLabel = styled.span<{ $tint?: TileTint }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ $tint, theme }) => tileColor($tint, theme, theme.colors.muted)};

  svg {
    flex-shrink: 0;
  }
`

const CardValue = styled.span<{ $tint?: TileTint; $low?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 24px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $tint, $low, theme }) =>
    $low ? theme.colors.bloodBright : tileColor($tint, theme, theme.colors.parchment)};
`

const ShopBtn = styled.button`
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.goldBright},
    ${({ theme }) => theme.colors.gold}
  );
  border: 1px solid ${({ theme }) => theme.colors.goldBright};
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.ink};
  cursor: pointer;
  transition: all 0.12s;

  &:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 12px rgba(201, 164, 76, 0.35);
  }
`

const shopPulse = keyframes`
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.55;
    transform: scale(0.82);
  }
`

const ShopDot = styled.span`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.sage};
  border: 2px solid ${({ theme }) => theme.colors.ink2};
  animation: ${shopPulse} 1.6s ease-in-out infinite;
`

const InvBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.ink};
  color: ${({ theme }) => theme.colors.goldBright};
  font-size: 13px;
  font-weight: 700;
`

const DetailsBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.parchmentDim};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
    box-shadow: 0 0 10px rgba(201, 164, 76, 0.2);
  }
`

const RepTip = styled(Tooltip)`
  flex: 1 1 auto;
  min-width: 260px;
`

const RepBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const RepBarHead = styled.div`
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
`

const RepBarName = styled.span`
  font-weight: 600;
`

const RepBarTier = styled.span`
  margin-left: auto;
  color: ${({ theme }) => theme.colors.goldBright};
`

const RepBarTrack = styled.div`
  position: relative;
  height: 10px;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.ink};
  overflow: hidden;
`

const RepBarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.gold},
    ${({ theme }) => theme.colors.goldBright}
  );
  transition: width 0.4s ease;
`

const RepTick = styled.span<{ $at: number; $active: boolean }>`
  position: absolute;
  top: 50%;
  left: ${({ $at }) => `${$at}%`};
  transform: translate(-50%, -50%);
  width: 2px;
  height: 15px;
  border-radius: 1px;
  background: ${({ $active, theme }) => ($active ? theme.colors.goldBright : theme.colors.muted2)};
`

const StatusRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 16px 18px 18px;
`

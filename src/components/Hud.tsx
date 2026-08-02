import { Globe, Home, Skull, Store, Swords, TriangleAlert } from "lucide-react"
import type { CharacterState, Locale } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import { styled } from "styled-components"
import { genderize } from "@shared/genderize"
import { GAME_CONFIG, reputationTierId } from "@shared/config"
import { gt as translateFor, t as translate } from "../i18n/strings"
import { STAT_ABBR } from "../constants"
import { personalitySummary } from "../lib/personality"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { Tooltip } from "./ui/Tooltip"

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

  const primaryRep =
    c.reputations.length > 0
      ? c.reputations.reduce((a, b) => (a.peakValue >= b.peakValue ? a : b))
      : null

  const topTags = personalitySummary(c.personality)

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

      <TopRow>
        {c.currentClanId && (
          <Tooltip content={t("tooltip_faction")} side="bottom">
            <ClanTag>
              <FactionFlag factionId={c.currentClanId} size={14} />
              {t(`faction_${c.currentClanId}`)}
            </ClanTag>
          </Tooltip>
        )}
        {c.currentRegion !== c.homeRegion ? (
          <Tooltip content={t("tooltip_location")} side="bottom">
            <AbroadTag>
              <Globe size={12} /> {t("abroadTag")}
            </AbroadTag>
          </Tooltip>
        ) : (
          <Tooltip content={t("tooltip_location")} side="bottom">
            <HomeTag>
              <Home size={12} /> {t("homeTag")}
            </HomeTag>
          </Tooltip>
        )}
        {onShopOpen && (
          <ShopTip content={t("tooltip_shop")} align="end">
            <ShopBtn type="button" onClick={onShopOpen}>
              <Store size={14} aria-hidden="true" />
              {t("shop")}
              {inventoryCount > 0 && <InvBadge>{inventoryCount}</InvBadge>}
            </ShopBtn>
          </ShopTip>
        )}
      </TopRow>

      <MetersRow>
        <Tooltip content={t("tooltip_age")}>
          <Meter>
            {t("age")} <b>{c.age}</b>
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
        <Tooltip content={t("tooltip_liability")}>
          <LiabilityMeter
            $high={(c.liability ?? 0) >= GAME_CONFIG.liabilityNotoriousThreshold}
            $stained={(c.liability ?? 0) > 0}
          >
            {(c.liability ?? 0) >= GAME_CONFIG.liabilityNotoriousThreshold && (
              <Skull size={12} aria-hidden="true" />
            )}
            {t("liability")} <b>{c.liability ?? 0}</b>
          </LiabilityMeter>
        </Tooltip>
        <Tooltip content={t("tooltip_mv")}>
          <Meter>
            MV <b>{c.marketValue}</b>
          </Meter>
        </Tooltip>
      </MetersRow>

      <AttributeRow>
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
      </AttributeRow>

      {c.rival && (
        <RivalRow>
          <Tooltip content={t("tooltip_rival")}>
            <RivalBadge>
              <Swords size={12} /> {c.rival.name} {t("vs")} <b>{playerScore}</b>—
              <b>{c.rival.score}</b>
            </RivalBadge>
          </Tooltip>
          {c.rival.focusId && (
            <Tooltip content={t("tooltip_rival_focus")} side="bottom">
              <FocusChip>{t(`rivalFocus_${c.rival.focusId}`)}</FocusChip>
            </Tooltip>
          )}
        </RivalRow>
      )}

      <StatusRow>
        {primaryRep && (
          <Tooltip content={t("tooltip_reputation")}>
            <RepPill>
              <FactionFlag factionId={primaryRep.faction} size={14} />
              {t(`faction_${primaryRep.faction}`)} ·{" "}
              {translateFor(
                locale,
                c.gender,
                `reputation_tier_${reputationTierId(primaryRep.value)}`,
              )}{" "}
              [{primaryRep.value}]
            </RepPill>
          </Tooltip>
        )}
        {topTags.length > 0 && (
          <Tooltip content={t("tooltip_personality")}>
            <TagPill>
              {topTags
                .map((tag) => translateFor(locale, c.gender, `personality_tag_${tag}`))
                .join(" · ")}
            </TagPill>
          </Tooltip>
        )}
        {c.huntedBy && (
          <Tooltip content={t("tooltip_hunted")}>
            <HuntedBadge>
              <TriangleAlert size={12} /> {t("hunted")} {t(`faction_${c.huntedBy}`)}
            </HuntedBadge>
          </Tooltip>
        )}
        <MomentumTip content={t("tooltip_momentum")} align="end">
          <MomentumBadge $variant={c.momentum}>{t(momentumKey)}</MomentumBadge>
        </MomentumTip>
      </StatusRow>
    </HudWrap>
  )
}

const HudWrap = styled(Panel)``

const ShopTip = styled(Tooltip)`
  margin-left: auto;
`

const MomentumTip = styled(Tooltip)`
  margin-left: auto;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px 14px;
  padding: 12px 18px 16px;
`

const NameBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px 0;

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

const MetersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 14px 18px;
`

const Meter = styled.span<{ $low?: boolean }>`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 11px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ $low, theme }) => ($low ? theme.colors.bloodBright : theme.colors.line)};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.03em;
  color: ${({ $low, theme }) => ($low ? theme.colors.bloodBright : theme.colors.muted)};
  text-transform: uppercase;

  b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: ${({ $low, theme }) => ($low ? theme.colors.bloodBright : theme.colors.parchment)};
    text-transform: none;
  }
`

const LiabilityMeter = styled.span<{ $high?: boolean; $stained?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  background: ${({ $high, theme }) => ($high ? "rgba(191, 30, 30, 0.14)" : theme.colors.ink3)};
  border: 1px solid ${({ $high, theme }) => ($high ? theme.colors.bloodBright : theme.colors.line)};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: ${({ $high, $stained, theme }) =>
    $high ? theme.colors.bloodBright : $stained ? "#c9803c" : theme.colors.muted};
  box-shadow: ${({ $high }) => ($high ? `0 0 12px rgba(191, 30, 30, 0.25)` : "none")};

  b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    color: ${({ $high, theme }) => ($high ? theme.colors.bloodBright : theme.colors.parchment)};
    text-transform: none;
  }

  svg {
    flex-shrink: 0;
  }
`

const MomentumBadge = styled.span<{ $variant: string }>`
  padding: 4px 12px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ $variant, theme }) =>
    $variant === "falling" ? theme.colors.bloodBright : theme.colors.sage};
  border-color: ${({ $variant, theme }) =>
    $variant === "falling" ? theme.colors.bloodBright : theme.colors.sage};
`

const AttributeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px 18px;
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
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.sage};
  vertical-align: middle;
`

const HomeTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding: 2px 8px;
  border: 1px solid ${({ theme }) => theme.colors.gold};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
  vertical-align: middle;
`

const AbroadTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding: 2px 8px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  vertical-align: middle;
`

const RivalBadge = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid ${({ theme }) => theme.colors.bloodBright};
  border-radius: 999px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.bloodBright};
  letter-spacing: 0.04em;

  b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.parchment};
  }
`

const RivalRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  background: linear-gradient(90deg, rgba(191, 30, 30, 0.07), transparent 55%);
`

const FocusChip = styled.span`
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  padding: 1px 9px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;
`

const HuntedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  background: rgba(191, 30, 30, 0.12);
  border: 1px solid ${({ theme }) => theme.colors.bloodBright};
  border-radius: 999px;
  font-size: 13px;
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
  font-size: 13px;
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
  font-size: 13px;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.sage};
`

const StatusRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`

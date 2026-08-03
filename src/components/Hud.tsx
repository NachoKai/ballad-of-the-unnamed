import {
  Activity,
  Crosshair,
  Globe,
  Home,
  Skull,
  Store,
  Swords,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react"
import type { Arc, CharacterState, Locale } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import { keyframes, styled } from "styled-components"
import { genderize } from "@shared/genderize"
import { GAME_CONFIG, REPUTATION_TIERS, reputationTierId } from "@shared/config"
import { gt as translateFor, t as translate } from "../i18n/strings"
import { STAT_ABBR } from "../constants"
import { personalitySummary } from "../lib/personality"
import { careerTitle } from "../lib/careerTitle"
import { FactionFlag } from "./FactionFlag"
import { Panel } from "./ui/Panel"
import { Tag } from "./ui/Tag"
import { Tooltip } from "./ui/Tooltip"

interface Props {
  character: CharacterState
  locale: Locale
  onShopOpen?: () => void
  canBuy?: boolean
}

// The chapters of a life of renown, in order. "child" is skipped — it is the
// prologue, not a rung on the road to power.
const PATH_ARCS: Arc[] = ["adventurer", "mercenary", "kingdom_hero", "legend", "old_hero"]

// Reputation is clamped 0..100 server-side; the bar fills across the whole
// scale so the tier tick marks stay at their true positions.
function repFillPct(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function Hud({ character: c, locale, onShopOpen, canBuy }: Props) {
  const t = (k: string) => translate(locale, k)
  const className = t(`class_${c.class}`)
  const momentumKey =
    c.momentum === "rising"
      ? "momentumRising"
      : c.momentum === "falling"
        ? "momentumFalling"
        : "momentumNormal"
  const arcKey = `arc_${c.currentArc}`
  const career = careerTitle(locale, c.gender, c.currentArc, c.powerLevel)
  const MomentumIcon =
    c.momentum === "rising" ? TrendingUp : c.momentum === "falling" ? TrendingDown : Activity
  const currentArcIndex = PATH_ARCS.indexOf(c.currentArc)
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
          {topTags.length > 0 && (
            <Tooltip content={t("tooltip_personality")}>
              <Tag $tone="sage">
                {topTags
                  .map((tag) => translateFor(locale, c.gender, `personality_tag_${tag}`))
                  .join(" · ")}
              </Tag>
            </Tooltip>
          )}
          <Tooltip content={t("tooltip_arc")}>
            <Tag $tone="gold">{t(arcKey)}</Tag>
          </Tooltip>
          <Tooltip content={t("tooltip_careerTitle")}>
            <Tag $tone="gold">{career}</Tag>
          </Tooltip>
          {c.huntedBy && (
            <Tooltip content={t("tooltip_hunted")}>
              <Tag $tone="blood">
                <TriangleAlert size={12} /> {t("hunted")} {t(`faction_${c.huntedBy}`)}
              </Tag>
            </Tooltip>
          )}
          <Tooltip content={t("tooltip_momentum")} align="end">
            <Tag $tone={c.momentum === "falling" ? "blood" : "sage"}>
              <MomentumIcon size={12} aria-hidden="true" /> {t(momentumKey)}
            </Tag>
          </Tooltip>
        </TagList>
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

      <PrimaryGrid>
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
        {STAT_KEYS.map((k) => (
          <PrimaryTip key={k} content={t(`tooltip_stat_${k}`)}>
            <PrimaryCard>
              <CardLabel>{t(STAT_ABBR[k])}</CardLabel>
              <CardValue>{c[k]}</CardValue>
            </PrimaryCard>
          </PrimaryTip>
        ))}
      </PrimaryGrid>

      <DetailsSection>
        <Tooltip content={t("tooltip_age")}>
          <Meter>
            {t("age")} <b>{c.age}</b>
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
        {c.rival && (
          <>
            <Tooltip content={t("tooltip_rival")}>
              <Tag $tone="blood">
                <Swords size={12} /> {c.rival.name} {t("vs")} <b>{playerScore}</b>—
                <b>{c.rival.score}</b>
              </Tag>
            </Tooltip>
            {c.rival.focusId && (
              <Tooltip content={t("tooltip_rival_focus")} side="bottom">
                <FocusChip>
                  <Crosshair size={12} aria-hidden="true" /> {t(`rivalFocus_${c.rival.focusId}`)}
                </FocusChip>
              </Tooltip>
            )}
          </>
        )}
      </DetailsSection>

      <PathTip content={t("tooltip_path")} side="bottom" fill>
        <PathRow>
          <PathLabel>{t("pathLabel")}</PathLabel>
          <PathSteps>
            {PATH_ARCS.map((arc, i) => {
              const state =
                i < currentArcIndex ? "reached" : i === currentArcIndex ? "current" : "future"
              return (
                <PathStepGroup key={arc}>
                  {i > 0 && <PathArrow aria-hidden="true">→</PathArrow>}
                  <PathStep $state={state}>{t(`arc_${arc}`)}</PathStep>
                </PathStepGroup>
              )
            })}
          </PathSteps>
        </PathRow>
      </PathTip>

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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
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

const PrimaryGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 20px 18px 14px;
`

const PrimaryTip = styled(Tooltip)`
  flex: 1 1 0;
  min-width: 104px;
`

const PrimaryCard = styled.span<{ $tint?: "gold" | "sage"; $low?: boolean }>`
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
      $low
        ? theme.colors.bloodBright
        : $tint === "gold"
          ? theme.colors.goldBright
          : $tint === "sage"
            ? theme.colors.sage
            : theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const CardLabel = styled.span`
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const CardValue = styled.span<{ $tint?: "gold"; $low?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 24px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: ${({ $tint, $low, theme }) =>
    $low
      ? theme.colors.bloodBright
      : $tint === "gold"
        ? theme.colors.goldBright
        : theme.colors.parchment};
`

const DetailsSection = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
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
  white-space: nowrap;
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
  white-space: nowrap;
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

const FocusChip = styled(Tag)`
  margin-left: auto;
`

const RepTip = styled(Tooltip)`
  flex: 0 0 100%;
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
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`

const PathTip = styled(Tooltip)`
  display: block;
  padding: 12px 18px 8px;
`

const PathRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const PathLabel = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
`

const PathSteps = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
`

const PathStepGroup = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

const PathArrow = styled.span`
  color: ${({ theme }) => theme.colors.muted2};
  font-size: 13px;
`

const PathStep = styled.span<{ $state: "reached" | "current" | "future" }>`
  padding: 2px 8px;
  border: 1px solid
    ${({ $state, theme }) =>
      $state === "current"
        ? theme.colors.goldBright
        : $state === "reached"
          ? theme.colors.line2
          : theme.colors.line};
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ $state, theme }) =>
    $state === "current"
      ? theme.colors.goldBright
      : $state === "reached"
        ? theme.colors.parchmentDim
        : theme.colors.muted2};
  background: ${({ $state }) =>
    $state === "current" ? "rgba(201, 164, 76, 0.12)" : "transparent"};
`

import { useEffect } from "react"
import { Activity, Crosshair, ScrollText, Swords, TrendingDown, TrendingUp } from "lucide-react"
import { styled } from "styled-components"
import type { Arc, CharacterState, Locale } from "@shared/types"
import { affinityTierId, REPUTATION_TIERS, reputationTierId } from "@shared/config"
import { gt as translateFor, t as translate } from "../i18n/strings"
import { careerTitle } from "../lib/careerTitle"
import { bondTone } from "../lib/bonds"
import { personalitySummary } from "../lib/personality"
import { FactionFlag } from "./FactionFlag"
import { Tag } from "./ui/Tag"
import { Tooltip } from "./ui/Tooltip"
import { rise } from "./ui/Animation"

// The chapters of a life of renown, in order. "child" is skipped — it is the
// prologue, not a rung on the road to power.
const PATH_ARCS: Arc[] = ["adventurer", "mercenary", "kingdom_hero", "legend", "old_hero"]

// Reputation is clamped 0..100 server-side; the bar fills across the whole
// scale so the tier tick marks stay at their true positions.
function repFillPct(value: number): number {
  return Math.max(0, Math.min(100, value))
}

interface Props {
  locale: Locale
  character: CharacterState
  onClose: () => void
}

export function DetailsModal({ locale, character: c, onClose }: Props) {
  const t = (k: string) => translate(locale, k)
  const gt = (k: string) => translateFor(locale, c.gender, k)
  const career = careerTitle(locale, c.gender, c.currentArc, c.powerLevel)
  const currentArcIndex = PATH_ARCS.indexOf(c.currentArc)
  const playerScore = (c.counters["battles_won"] ?? 0) + (c.counters["quests_completed"] ?? 0)
  const reps = [...c.reputations].sort((a, b) => b.value - a.value)
  const bonds = [...c.relationships].sort((a, b) => b.affinity - a.affinity)
  const topTags = personalitySummary(c.personality)
  const momentumKey =
    c.momentum === "rising"
      ? "momentumRising"
      : c.momentum === "falling"
        ? "momentumFalling"
        : "momentumNormal"
  const MomentumIcon =
    c.momentum === "rising" ? TrendingUp : c.momentum === "falling" ? TrendingDown : Activity

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("details")}>
        <Header>
          <Title>{t("details")}</Title>
          <CloseBtn type="button" onClick={onClose} aria-label={t("minigameClose")}>
            &times;
          </CloseBtn>
        </Header>

        <Body>
          <Section>
            <SectionTitle>{t("personality")}</SectionTitle>
            <ChipRow>
              {topTags.length > 0 && (
                <Tooltip content={t("tooltip_personality")} side="bottom">
                  <Tag $tone="sage">
                    {topTags.map((tag) => gt(`personality_tag_${tag}`)).join(" · ")}
                  </Tag>
                </Tooltip>
              )}
              <Tooltip content={t("tooltip_momentum")} side="bottom">
                <Tag $tone={c.momentum === "falling" ? "blood" : "sage"}>
                  <MomentumIcon size={12} aria-hidden="true" /> {t(momentumKey)}
                </Tag>
              </Tooltip>
            </ChipRow>
          </Section>

          <Section>
            <SectionTitle>{t("pathLabel")}</SectionTitle>
            <PathRow>
              <Tooltip content={t("tooltip_careerTitle")} side="bottom">
                <Tag $tone="gold">
                  <ScrollText size={12} aria-hidden="true" /> {career}
                </Tag>
              </Tooltip>
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
          </Section>

          {reps.length > 0 && (
            <Section>
              <SectionTitle>{t("reputation")}</SectionTitle>
              <RepList>
                {reps.map((rep) => (
                  <RepBar key={rep.faction}>
                    <RepBarHead>
                      <FactionFlag factionId={rep.faction} size={14} />
                      <RepBarName>{t(`faction_${rep.faction}`)}</RepBarName>
                      <RepBarTier>
                        {gt(`reputation_tier_${reputationTierId(rep.value)}`)} [{rep.value}]
                      </RepBarTier>
                    </RepBarHead>
                    <RepBarTrack>
                      <RepBarFill $pct={repFillPct(rep.value)} />
                      {REPUTATION_TIERS.slice(1).map((tier) => (
                        <RepTick key={tier.id} $at={tier.min} $active={rep.value >= tier.min} />
                      ))}
                    </RepBarTrack>
                  </RepBar>
                ))}
              </RepList>
            </Section>
          )}

          {c.rival && (
            <Section>
              <SectionTitle>{t("rival")}</SectionTitle>
              <RivalCard>
                <RivalRow>
                  <RivalName>
                    <Swords size={14} aria-hidden="true" />
                    {c.rival.name}
                  </RivalName>
                  <RivalScore>
                    <b>{playerScore}</b> {t("vs")} <b>{c.rival.score}</b>
                  </RivalScore>
                </RivalRow>
                <RivalChips>
                  {c.rival.factionId && (
                    <Tooltip content={t("tooltip_rival_faction")} side="bottom">
                      <Tag $tone="blood">
                        <FactionFlag factionId={c.rival.factionId} size={12} />
                        {t(`faction_${c.rival.factionId}`)}
                      </Tag>
                    </Tooltip>
                  )}
                  {c.rival.focusId && (
                    <Tooltip content={t("tooltip_rival_focus")} side="bottom">
                      <Tag $tone="blood">
                        <Crosshair size={12} aria-hidden="true" />
                        {t(`rivalFocus_${c.rival.focusId}`)}
                      </Tag>
                    </Tooltip>
                  )}
                </RivalChips>
              </RivalCard>
            </Section>
          )}

          {bonds.length > 0 && (
            <Section>
              <SectionTitle>{t("relationships")}</SectionTitle>
              <BondsList>
                {bonds.map((rel) => (
                  <Tag key={rel.npcId} $tone={bondTone(rel.affinity)}>
                    <b>{rel.npcName ?? rel.npcId}</b>
                    <span>
                      {t(`npcRole_${rel.npcRole ?? "acquaintance"}`)} ·{" "}
                      {t(`affinity_tier_${affinityTierId(rel.affinity)}`)} [{rel.affinity}]
                    </span>
                  </Tag>
                ))}
              </BondsList>
            </Section>
          )}
        </Body>
      </Modal>
    </Overlay>
  )
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  padding: 20px;
`

const Modal = styled.div`
  width: 100%;
  max-width: 920px;
  max-height: 92vh;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  animation: ${rise} 0.25s ease both;
`

const Header = styled.div`
  position: sticky;
  top: 0;
  z-index: 1;
  background: ${({ theme }) => theme.colors.ink2};
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`

const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.parchment};
`

const CloseBtn = styled.button`
  margin-left: auto;
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0 6px;
  font-size: 27px;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  line-height: 1;
  transition: color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
`

const Section = styled.section``

const SectionTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};

  &::after {
    content: "";
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, ${({ theme }) => theme.colors.line2}, transparent);
  }
`

const PathRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
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
  padding: 3px 10px;
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

const RepList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const RepBar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  min-width: 0;
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

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const RivalCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(191, 30, 30, 0.06);
  border: 1px solid rgba(200, 90, 90, 0.35);
  border-radius: ${({ theme }) => theme.radii.sm};
`

const RivalRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const RivalName = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.parchment};

  svg {
    color: ${({ theme }) => theme.colors.bloodBright};
  }
`

const RivalScore = styled.span`
  margin-left: auto;
  font-size: 15px;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.muted};
  white-space: nowrap;

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
  }
`

const RivalChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const BondsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

import { useState } from "react"
import { styled } from "styled-components"
import type { CharacterState, ServedEvent, Rarity } from "@shared/types"
import type { Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { AchIcon } from "./AchIcon"
import { FactionFlag } from "./FactionFlag"
import { Hud } from "./Hud"
import { StatTag } from "./StatTag"
import { LinkBtn } from "./ui/Button"
import { TextPretty } from "./ui/Text"
import { rise } from "./ui/Animation"
import { ElectricBorder } from "./ui/ElectricBorder"
import { SpecularBorder } from "./ui/SpecularBorder"
import { Tooltip } from "./ui/Tooltip"
import { capitalize } from "../lib/capitalize"
import { RARITY_CHAOS } from "../constants"
import { rarityRank } from "@shared/config"
import { theme } from "../theme"

interface Props {
  locale: Locale
  character: CharacterState
  event: ServedEvent
  narrative: string | null
  turnNarrative: string | null
  onChoose: (choiceId: string) => Promise<void>
  onAbandon: () => void
  onShopOpen?: () => void
}

export function GameScreen({
  locale,
  character,
  event,
  turnNarrative,
  onChoose,
  onAbandon,
  onShopOpen,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  async function pick(id: string) {
    if (busy) return
    setBusy(true)
    setSelected(id)
    try {
      await onChoose(id)
    } finally {
      setBusy(false)
      setSelected(null)
    }
  }

  // Sort choices by rarity so the "safe" option is first and rare/volatile pop last.
  const choices = [...event.choices].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))

  const isSeasonSummary = event.isSeasonSummary

  return (
    <GameLayout>
      <Hud locale={locale} character={character} onShopOpen={onShopOpen} />

      <Scene aria-live="polite">
        {turnNarrative && <SceneEcho>{capitalize(turnNarrative)}</SceneEcho>}

        {event.isRetirementOffer && (
          <RetireBanner role="status">{t(locale, "retirementOffered")}</RetireBanner>
        )}

        {isSeasonSummary && event.seasonHeadline && (
          <SpecularBorder
            radius={8}
            lineColor={theme.colors.goldBright}
            baseColor={theme.colors.gold}
            thickness={1.4}
            intensity={1.1}
            style={{ marginBottom: 18 }}
          >
            <SummaryBanner>
              <SummaryGrade
                $grade={
                  (event.seasonGrade ?? 5) >= 7
                    ? "good"
                    : (event.seasonGrade ?? 5) >= 4
                      ? "ok"
                      : "bad"
                }
              >
                {(event.seasonGrade ?? 0).toFixed(1)}
              </SummaryGrade>
              <SummaryHeadline>{event.seasonHeadline}</SummaryHeadline>
              <SummarySub>{t(locale, "seasonSummary")}</SummarySub>
            </SummaryBanner>
          </SpecularBorder>
        )}

        <SceneNarrative>{capitalize(event.narrative)}</SceneNarrative>

        <ChoiceGrid role="group" aria-label={t(locale, "chooseAction")}>
          {choices.map((c) => (
            <ChoiceCardWrap
              key={c.id}
              color={theme.colors.rarity[c.rarity]}
              chaos={RARITY_CHAOS[c.rarity]}
              borderRadius={8}
            >
              <ChoiceCard
                type="button"
                $rarity={c.rarity}
                $selected={selected === c.id}
                onClick={() => pick(c.id)}
                disabled={busy}
              >
                {isSeasonSummary && c.id === "continue" ? null : (
                  <RarityPip $rarity={c.rarity} aria-hidden="true" />
                )}
                <ChoiceLabel>
                  {c.factionId ? (
                    <FactionFlag factionId={c.factionId} size={20} />
                  ) : c.icon ? (
                    <AchIcon name={c.icon} size={20} />
                  ) : null}
                  {c.label}
                </ChoiceLabel>
                {isSeasonSummary && c.id === "continue" ? null : (
                  <ChoiceRarity $rarity={c.rarity}>
                    {t(locale, `rarity_${c.rarity}` as never)}
                  </ChoiceRarity>
                )}
                {(c.statDeltas ||
                  c.tradeoffDeltas ||
                  c.fameDelta ||
                  c.reputationDelta ||
                  c.goldDelta) && (
                  <ChoiceDeltas>
                    {c.statDeltas && <StatTag locale={locale} deltas={c.statDeltas} />}
                    {c.tradeoffDeltas && (
                      <StatTag locale={locale} deltas={c.tradeoffDeltas} tradeoff />
                    )}
                    {c.fameDelta && c.fameDelta !== 0 && (
                      <Tooltip content={t(locale, "tooltip_fame")}>
                        <BonusTag $tint="fame">
                          {t(locale, "fame")} {c.fameDelta > 0 ? `+${c.fameDelta}` : c.fameDelta}
                        </BonusTag>
                      </Tooltip>
                    )}
                    {c.reputationDelta && c.reputationDelta !== 0 && (
                      <Tooltip content={t(locale, "tooltip_reputation")}>
                        <BonusTag $tint="rep">
                          {t(locale, "reputation")}{" "}
                          {c.reputationDelta > 0 ? `+${c.reputationDelta}` : c.reputationDelta}
                        </BonusTag>
                      </Tooltip>
                    )}
                    {c.goldDelta && c.goldDelta !== 0 && (
                      <Tooltip content={t(locale, "tooltip_gold")}>
                        <BonusTag $tint="gold">
                          {t(locale, "gold")} {c.goldDelta > 0 ? `+${c.goldDelta}` : c.goldDelta}
                        </BonusTag>
                      </Tooltip>
                    )}
                    {c.stipend && c.stipend !== 0 && (
                      <Tooltip content={t(locale, "tooltip_gold")}>
                        <BonusTag $tint="gold">
                          +{c.stipend} {t(locale, "stipendPerSeason")}
                        </BonusTag>
                      </Tooltip>
                    )}
                  </ChoiceDeltas>
                )}
              </ChoiceCard>
            </ChoiceCardWrap>
          ))}
        </ChoiceGrid>

        {isSeasonSummary && (
          <>
            {event.worldEvents && event.worldEvents.length > 0 && (
              <WorldEventsBlock>
                <WorldEventsTitle>{t(locale, "worldEvents")}</WorldEventsTitle>
                {event.worldEvents.map((we, i) => (
                  <WorldEventCard key={i}>
                    <WorldEventHeadline>{we.headline}</WorldEventHeadline>
                    <WorldEventNarrative>{we.narrative}</WorldEventNarrative>
                  </WorldEventCard>
                ))}
              </WorldEventsBlock>
            )}

            {event.rivalUpdate && <RivalUpdateBlock>⚔️ {event.rivalUpdate}</RivalUpdateBlock>}

            <SeasonStatRow>
              <SeasonStat>
                <span>{t(locale, "age")}</span>
                <b>{character.age}</b>
              </SeasonStat>
              <SeasonStat>
                <span>{t(locale, "gold")}</span>
                <b>{character.gold}</b>
              </SeasonStat>
              <SeasonStat>
                <span>{t(locale, "power")}</span>
                <b>{character.powerLevel}</b>
              </SeasonStat>
              <SeasonStat>
                <span>{t(locale, "fame")}</span>
                <b>{character.fame}</b>
              </SeasonStat>
              <SeasonStat>
                <span>{t(locale, "battles")}</span>
                <b>{character.counters["battles_won"] ?? 0}</b>
              </SeasonStat>
              {event.stipendEarned != null && event.stipendEarned > 0 && (
                <SeasonStat>
                  <span>{t(locale, "stipend")}</span>
                  <b>+{event.stipendEarned}</b>
                </SeasonStat>
              )}
            </SeasonStatRow>
          </>
        )}

        <Tooltip content={t(locale, "tooltip_abandon")} align="end">
          <AbandonBtn type="button" onClick={onAbandon} disabled={busy}>
            {t(locale, "abandonRun")}
          </AbandonBtn>
        </Tooltip>
      </Scene>
    </GameLayout>
  )
}

const GameLayout = styled.div`
  display: grid;
  gap: 22px;
  animation: ${rise} 0.35s ease both;
`

const Scene = styled.main`
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel} 0%,
    ${({ theme }) => theme.colors.ink2} 100%
  );
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 26px 28px;
  box-shadow: ${({ theme }) => theme.shadow};

  @media (max-width: 680px) {
    padding: 20px;
  }
`

const SceneEcho = styled.p`
  color: ${({ theme }) => theme.colors.sage};
  font-style: italic;
  font-size: 16px;
  padding: 10px 14px;
  border-left: 2px solid ${({ theme }) => theme.colors.sage};
  background: rgba(111, 143, 106, 0.06);
  border-radius: 0 ${({ theme }) => theme.radii.sm} ${({ theme }) => theme.radii.sm} 0;
  margin-bottom: 18px;
  animation: ${rise} 0.3s ease both;
`

const SceneNarrative = styled(TextPretty)`
  font-size: 21px;
  line-height: 1.65;
  color: ${({ theme }) => theme.colors.parchment};
`

const RetireBanner = styled.div`
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid rgba(201, 164, 76, 0.4);
  background: rgba(201, 164, 76, 0.08);
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.goldBright};
  font-style: italic;
`

const ChoiceGrid = styled.div`
  display: grid;
  gap: 24px;
  margin-top: 24px;
  margin-bottom: 18px;
`

const ChoiceCardWrap = styled(ElectricBorder)`
  transition: transform 0.12s;

  &:hover {
    transform: translateX(4px);
  }
`

const ChoiceCard = styled.button<{ $rarity: Rarity; $selected: boolean }>`
  position: relative;
  text-align: left;
  width: 100%;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-left: 4px solid ${({ theme, $rarity }) => theme.colors.rarity[$rarity]};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 15px 18px;
  color: ${({ theme }) => theme.colors.parchment};
  font-size: 18px;
  transition:
    border-color 0.15s,
    background 0.15s;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.ink3};
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`

const RarityPip = styled.span<{ $rarity: Rarity }>`
  position: absolute;
  top: 14px;
  right: 16px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${({ theme, $rarity }) => theme.colors.rarity[$rarity]};
`

const ChoiceLabel = styled(TextPretty)`
  display: flex;
  align-items: center;
  gap: 10px;
`

const ChoiceRarity = styled.span<{ $rarity: Rarity }>`
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $rarity, theme }) =>
    $rarity === "rare"
      ? theme.colors.rarity.rare
      : $rarity === "volatile"
        ? theme.colors.rarity.volatile
        : theme.colors.muted};
`

const ChoiceDeltas = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
`

const BONUS_COLOR: Record<string, string> = {
  fame: "#c9803c",
  rep: "#6f8f6a",
  gold: "#e6c84a",
}

const BonusTag = styled.span<{ $tint: string }>`
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  color: ${({ $tint }) => BONUS_COLOR[$tint] ?? "#9c8f74"};
  background: ${({ $tint }) => `${BONUS_COLOR[$tint] ?? "#9c8f74"}18`};
  line-height: 1.5;
`

const SummaryBanner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(201, 164, 76, 0.06);
`

const SummaryGrade = styled.span<{ $grade: string }>`
  font-size: 42px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.fonts.display};
  color: ${({ $grade, theme }) =>
    $grade === "good"
      ? theme.colors.sage
      : $grade === "ok"
        ? theme.colors.gold
        : theme.colors.bloodBright};
  line-height: 1;
`

const SummaryHeadline = styled.span`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.parchment};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-align: center;
`

const SummarySub = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  letter-spacing: 0.1em;
  text-transform: uppercase;
`

const SeasonStatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink3};
`

const SeasonStat = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 64px;
  flex: 1;

  span {
    font-size: 11px;
    color: ${({ theme }) => theme.colors.muted};
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  b {
    font-size: 20px;
    color: ${({ theme }) => theme.colors.parchment};
    font-variant-numeric: tabular-nums;
  }
`

const AbandonBtn = styled(LinkBtn)`
  margin-top: 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted2};
  font-size: 14px;

  &:hover {
    color: ${({ theme }) => theme.colors.bloodBright};
  }
`

const WorldEventsBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(111, 143, 106, 0.04);
`

const WorldEventsTitle = styled.span`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: ${({ theme }) => theme.colors.sage};
  margin-bottom: 4px;
`

const WorldEventCard = styled.div`
  padding: 10px 12px;
  border-left: 2px solid ${({ theme }) => theme.colors.line2};
`

const WorldEventHeadline = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.parchment};
  margin-bottom: 4px;
`

const WorldEventNarrative = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const RivalUpdateBlock = styled.div`
  padding: 10px 14px;
  margin-bottom: 16px;
  border: 1px solid ${({ theme }) => theme.colors.bloodBright};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(191, 30, 30, 0.06);
  color: ${({ theme }) => theme.colors.bloodBright};
  font-size: 13px;
  letter-spacing: 0.04em;
`

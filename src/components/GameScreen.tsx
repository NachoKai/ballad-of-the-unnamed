import { useState } from "react"
import { styled } from "styled-components"
import type { CharacterState, ServedEvent, Rarity } from "@shared/types"
import type { Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { AchIcon } from "./AchIcon"
import { Hud } from "./Hud"
import { StatTag } from "./StatTag"
import { LinkBtn } from "./ui/Button"
import { TextPretty } from "./ui/Text"
import { rise } from "./ui/Animation"
import { capitalize } from "../lib/capitalize"

interface Props {
  locale: Locale
  character: CharacterState
  event: ServedEvent
  narrative: string | null
  turnNarrative: string | null
  onChoose: (choiceId: string) => Promise<void>
  onAbandon: () => void
}

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  volatile: 3,
}

export function GameScreen({
  locale,
  character,
  event,
  turnNarrative,
  onChoose,
  onAbandon,
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
  const choices = [...event.choices].sort(
    (a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0),
  )

  return (
    <GameLayout>
      <Hud locale={locale} character={character} />

      <Scene aria-live="polite">
        {turnNarrative && <SceneEcho>{capitalize(turnNarrative)}</SceneEcho>}

        {event.isRetirementOffer && (
          <RetireBanner role="status">{t(locale, "retirementOffered")}</RetireBanner>
        )}

        <SceneNarrative>{capitalize(event.narrative)}</SceneNarrative>

        <ChoiceGrid role="group" aria-label={t(locale, "chooseAction")}>
          {choices.map((c) => (
            <ChoiceCard
              key={c.id}
              type="button"
              $rarity={c.rarity}
              $selected={selected === c.id}
              onClick={() => pick(c.id)}
              disabled={busy}
            >
              <RarityPip $rarity={c.rarity} aria-hidden="true" />
              <ChoiceLabel>
                {c.icon && <AchIcon name={c.icon} size={20} />}
                {c.label}
              </ChoiceLabel>
              <ChoiceRarity $rarity={c.rarity}>
                {t(locale, `rarity_${c.rarity}` as never)}
              </ChoiceRarity>
              {(c.statDeltas || c.tradeoffDeltas) && (
                <ChoiceDeltas>
                  {c.statDeltas && <StatTag locale={locale} deltas={c.statDeltas} />}
                  {c.tradeoffDeltas && (
                    <StatTag locale={locale} deltas={c.tradeoffDeltas} tradeoff />
                  )}
                </ChoiceDeltas>
              )}
            </ChoiceCard>
          ))}
        </ChoiceGrid>

        <AbandonBtn type="button" onClick={onAbandon} disabled={busy}>
          {t(locale, "abandonRun")}
        </AbandonBtn>
      </Scene>
    </GameLayout>
  )
}

const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9c8f74",
  uncommon: "#6f8f6a",
  rare: "#5a86c8",
  volatile: "#c9803c",
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
  gap: 12px;
  margin-top: 22px;
`

const ChoiceCard = styled.button<{ $rarity: Rarity; $selected: boolean }>`
  position: relative;
  text-align: left;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-left: 4px solid ${({ $rarity }) => RARITY_COLOR[$rarity]};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 15px 18px;
  color: ${({ theme }) => theme.colors.parchment};
  font-size: 18px;
  transition:
    transform 0.12s,
    border-color 0.15s,
    background 0.15s;

  &:hover:not(:disabled) {
    transform: translateX(4px);
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
  background: ${({ $rarity }) => RARITY_COLOR[$rarity]};
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

const AbandonBtn = styled(LinkBtn)`
  margin-top: 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted2};
  font-size: 14px;

  &:hover {
    color: ${({ theme }) => theme.colors.bloodBright};
  }
`

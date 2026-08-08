import { useState } from "react"
import { styled } from "styled-components"
import {
  Coins,
  Crown,
  Footprints,
  HeartPulse,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react"
import type {
  CombatLogEntry,
  CombatMove,
  Locale,
  ServedCombatState,
  ServedEvent,
} from "@shared/types"
import type { CombatMoveResponse } from "../../api"
import { t } from "../../i18n/strings"
import { interpolate } from "@shared/i18n"
import { fmtInt } from "@shared/format"
import { LinkBtn } from "../ui/Button"
import { rise } from "../ui/Animation"
import { AchIcon } from "../AchIcon"
import { Tooltip } from "../ui/Tooltip"
import { theme } from "../../theme"

interface Props {
  locale: Locale
  event: ServedEvent
  onMove: (move: CombatMove) => Promise<CombatMoveResponse>
  onFinished: () => void
  finishedResult: CombatMoveResponse | null
}

// Humanize a raw item id for the spoils breakdown ("wolf_pelt" → "Wolf Pelt").
// The client doesn't load shop names at combat time; the id is close enough.
function prettyItemId(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())
}

// Build the localized prose lines for one resolved round. Returns an array
// because a single round can produce several beats (ability + damage + dot).
function roundLines(
  entry: CombatLogEntry,
  locale: Locale,
  creatureName: string,
  abilityLabels: Record<string, string>,
  moveNames: Record<string, string>,
): string[] {
  const lines: string[] = []
  const fill = (key: string, vars: Record<string, string | number>) =>
    interpolate(t(locale, key), vars)

  // Player's action beat.
  if (entry.playerFled) {
    lines.push(fill("combatYouFled", {}))
  } else if (entry.playerAction === "defend") {
    lines.push(fill("combatYouDefend", {}))
  } else if (entry.playerAction === "flee") {
    lines.push(fill("combatYouFlee", {}))
  } else if (entry.playerAction === "attack") {
    if (entry.playerCrit) {
      lines.push(fill("combatYouCrit", { dmg: entry.playerDamage ?? 0 }))
    } else {
      lines.push(fill("combatYouStrike", { creature: creatureName, dmg: entry.playerDamage ?? 0 }))
    }
  } else if (entry.playerAction === "ability") {
    const label = entry.playerAbilityId
      ? (abilityLabels[entry.playerAbilityId] ?? entry.playerAbilityId)
      : ""
    lines.push(fill("combatYouUse", { ability: label }))
    if (entry.playerHeal != null) {
      lines.push(fill("combatYouHeal", { n: entry.playerHeal }))
    }
    if (entry.playerGold != null) {
      lines.push(fill("combatYouSteal", { n: entry.playerGold }))
    }
    if (entry.playerDamage != null) {
      if (entry.playerCrit) {
        lines.push(fill("combatYouCrit", { dmg: entry.playerDamage }))
      } else {
        lines.push(fill("combatYouStrike", { creature: creatureName, dmg: entry.playerDamage }))
      }
    }
  }

  // Creature's reaction beat.
  if (entry.poisonedTick != null) {
    lines.push(fill("combatPoisonTick", { creature: creatureName, n: entry.poisonedTick }))
  }
  if (entry.creatureSkipped) {
    lines.push(fill("combatCreatureSkipped", { creature: creatureName }))
  } else if (entry.creatureFled) {
    lines.push(fill("combatCreatureFled", { creature: creatureName }))
  } else if (entry.creatureHeal != null) {
    lines.push(fill("combatCreatureHeals", { creature: creatureName, n: entry.creatureHeal }))
  } else if (entry.creatureDamage != null) {
    const move = entry.creatureMoveId
      ? (moveNames[entry.creatureMoveId] ?? entry.creatureMoveId)
      : ""
    lines.push(
      fill("combatCreatureUses", { creature: creatureName, move, dmg: entry.creatureDamage }),
    )
  }
  return lines
}

export function CombatGame({ locale, event, onMove, onFinished, finishedResult }: Props) {
  const [view, setView] = useState<ServedCombatState>(event.combat!.view)
  const [busy, setBusy] = useState(false)

  async function handle(move: CombatMove) {
    if (busy) return
    setBusy(true)
    try {
      const res = await onMove(move)
      if (res.status === "playing" && res.combat) {
        setView(res.combat.view)
      } else if (res.status === "finished" && res.combat) {
        // Final frame rides along with the outcome so the banner shows the
        // fight as it ended.
        setView(res.combat.view)
      }
    } finally {
      setBusy(false)
    }
  }

  const canAct = !view.over && !busy
  const abilityLabels = Object.fromEntries(view.kit.abilities.map((a) => [a.id, a.label]))

  // Fight over: result banner + loot breakdown + Continue (mirrors the
  // minigame frames' finishedResult flow).
  if (finishedResult) {
    const finalView = finishedResult.combat?.view ?? view
    const won = finalView.result === "won"
    const fled = finalView.result === "fled"
    const tone = won ? "win" : fled ? "fled" : "lose"
    const loot = finishedResult.loot
    const hasLoot =
      loot != null && (loot.gold > 0 || loot.fame > 0 || (loot.items ?? []).length > 0)
    return (
      <Frame>
        <ResultCard $tone={tone}>
          <ResultTitle>
            {t(locale, won ? "combatVictory" : fled ? "combatFled" : "combatDefeat")}
          </ResultTitle>
          <ResultSub>
            {interpolate(
              t(locale, won ? "combatResultWin" : fled ? "combatResultFled" : "combatResultLose"),
              { creature: finalView.creature.name },
            )}
          </ResultSub>

          {hasLoot && (
            <SpoilsCard $tone={tone}>
              <SpoilsTitle>
                <Crown size={15} strokeWidth={2} aria-hidden="true" />
                {t(locale, "combatSpoils")}
              </SpoilsTitle>
              <SpoilsRow>
                {loot.gold > 0 && (
                  <SpoilsItem>
                    <Coins size={16} strokeWidth={2} aria-hidden="true" />
                    <b>+{fmtInt(loot.gold)}</b> {t(locale, "gold")}
                  </SpoilsItem>
                )}
                {loot.fame > 0 && (
                  <SpoilsItem>
                    <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
                    <b>+{fmtInt(loot.fame)}</b> {t(locale, "fame")}
                  </SpoilsItem>
                )}
                {(loot.items ?? []).map((it) => (
                  <SpoilsItem key={it.itemId}>
                    <AchIcon name={it.itemId} size={18} />
                    <b>{it.qty}×</b> {prettyItemId(it.itemId)}
                  </SpoilsItem>
                ))}
              </SpoilsRow>
            </SpoilsCard>
          )}

          {finishedResult.narrative && <Narrative>{finishedResult.narrative}</Narrative>}
          <ContinueBtn type="button" onClick={onFinished}>
            {t(locale, "minigameContinue")}
          </ContinueBtn>
        </ResultCard>
      </Frame>
    )
  }

  return (
    <Frame>
      <RoundHeader>
        <Swords size={15} strokeWidth={2} aria-hidden="true" />
        {t(locale, "combatRound")} <b>{view.round}</b>
      </RoundHeader>

      {view.menace && (
        <MenaceBanner>
          <Skull size={15} strokeWidth={2} aria-hidden="true" />
          <MenaceText>
            <b>{view.menace.headline}</b>
            <span>
              {interpolate(t(locale, "combatMenaceProgress"), {
                kills: view.menace.kills,
                target: view.menace.killTarget,
              })}
            </span>
          </MenaceText>
        </MenaceBanner>
      )}

      <CombatantsGrid>
        {/* Creature panel */}
        <CombatantCard $side="creature">
          <CombatantHead>
            <AchIcon name={view.creature.icon} size={34} />
            <CombatantName>{view.creature.name}</CombatantName>
            <RarityTag $rarity={view.creature.rarity}>
              {t(locale, `combatRarity_${view.creature.rarity}` as never)}
            </RarityTag>
          </CombatantHead>

          <BarWrap>
            <BarLabel>
              <Skull size={12} strokeWidth={2} aria-hidden="true" />
              {t(locale, "health")}
            </BarLabel>
            <HealthBar
              $tone="creature"
              $pct={healthPct(view.creature.currentHealth, view.creature.maxHealth)}
            >
              <span />
            </HealthBar>
            <BarNumbers>
              {view.creature.currentHealth}/{view.creature.maxHealth}
            </BarNumbers>
          </BarWrap>

          <StatRow>
            <Stat>
              <Swords size={13} strokeWidth={2} aria-hidden="true" />
              {t(locale, "combatAttack")} <b>{view.creature.attack}</b>
            </Stat>
            <Stat>
              <Shield size={13} strokeWidth={2} aria-hidden="true" />
              {t(locale, "combatDefense")} <b>{view.creature.defense}</b>
            </Stat>
            <Stat>
              <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
              {t(locale, "combatResistance")} <b>{view.creature.magicResistance}</b>
            </Stat>
          </StatRow>

          {view.creature.statuses.length > 0 && (
            <StatusRow>
              {view.creature.statuses.map((s) => (
                <StatusChip key={s.id} $tone="creature">
                  {t(locale, `combatStatus_${s.id}` as never)}
                </StatusChip>
              ))}
            </StatusRow>
          )}
        </CombatantCard>

        {/* Player panel */}
        <CombatantCard $side="player">
          <CombatantHead>
            <HeartPulse size={26} strokeWidth={2} aria-hidden="true" />
            <CombatantName>{t(locale, "combatYou")}</CombatantName>
          </CombatantHead>

          <BarWrap>
            <BarLabel>
              <HeartPulse size={12} strokeWidth={2} aria-hidden="true" />
              {t(locale, "health")}
            </BarLabel>
            <HealthBar $tone="player" $pct={healthPct(view.player.health, view.player.maxHealth)}>
              <span />
            </HealthBar>
            <BarNumbers>
              {view.player.health}/{view.player.maxHealth}
            </BarNumbers>
          </BarWrap>

          <BarWrap>
            <BarLabel>
              <Zap size={12} strokeWidth={2} aria-hidden="true" />
              {view.player.resourceLabel}
            </BarLabel>
            <HealthBar
              $tone="resource"
              $pct={healthPct(view.player.resource, view.player.resourceMax)}
            >
              <span />
            </HealthBar>
            <BarNumbers>
              {view.player.resource}/{view.player.resourceMax}
            </BarNumbers>
          </BarWrap>

          <StatRow>
            <Stat>
              <Swords size={13} strokeWidth={2} aria-hidden="true" />
              {t(locale, "combatAttack")} <b>{view.player.attack}</b>
            </Stat>
            <Stat>
              <Shield size={13} strokeWidth={2} aria-hidden="true" />
              {t(locale, "combatDefense")} <b>{view.player.defense}</b>
            </Stat>
          </StatRow>

          {view.player.statuses.length > 0 && (
            <StatusRow>
              {view.player.statuses.map((s) => (
                <StatusChip key={s.id} $tone="player">
                  {t(locale, `combatStatus_${s.id}` as never)}
                </StatusChip>
              ))}
            </StatusRow>
          )}
        </CombatantCard>
      </CombatantsGrid>

      {/* Class-gated action menu — labels come from the kit, never hardcoded. */}
      <ActionMenu>
        <AttackBtn type="button" onClick={() => handle({ kind: "attack" })} disabled={!canAct}>
          <Swords size={16} strokeWidth={2} aria-hidden="true" />
          {view.kit.basicAttackLabel}
        </AttackBtn>

        {view.kit.abilities.length > 0 && (
          <AbilityGroup>
            <AbilityGroupTitle>{view.kit.abilityMenuLabel}</AbilityGroupTitle>
            <AbilityGrid>
              {view.kit.abilities.map((a) => {
                const locked = !a.unlocked || view.player.resource < a.cost
                const btn = (
                  <AbilityBtn
                    type="button"
                    key={a.id}
                    $locked={locked}
                    disabled={!canAct || locked}
                    onClick={() => handle({ kind: "ability", abilityId: a.id })}
                  >
                    <AbilityLabel>{a.label}</AbilityLabel>
                    <AbilityCost>
                      <Zap size={11} strokeWidth={2.5} aria-hidden="true" /> {a.cost}
                    </AbilityCost>
                  </AbilityBtn>
                )
                if (!a.unlocked) {
                  return (
                    <Tooltip key={a.id} fill content={t(locale, "combatLocked")}>
                      {btn}
                    </Tooltip>
                  )
                }
                if (view.player.resource < a.cost) {
                  return (
                    <Tooltip key={a.id} fill content={`${t(locale, "combatResource")}: ${a.cost}`}>
                      {btn}
                    </Tooltip>
                  )
                }
                return btn
              })}
            </AbilityGrid>
          </AbilityGroup>
        )}

        <SupportRow>
          <DefendBtn type="button" onClick={() => handle({ kind: "defend" })} disabled={!canAct}>
            <Shield size={15} strokeWidth={2} aria-hidden="true" />
            {t(locale, "combatDefend")}
          </DefendBtn>
          <FleeBtn type="button" onClick={() => handle({ kind: "flee" })} disabled={!canAct}>
            <Footprints size={15} strokeWidth={2} aria-hidden="true" />
            {t(locale, "combatFlee")}
          </FleeBtn>
        </SupportRow>
      </ActionMenu>

      {view.log.length > 0 && (
        <LogBlock>
          <LogTitle>{t(locale, "combatLog")}</LogTitle>
          <LogList>
            {view.log.slice(-12).map((entry, i) => (
              <LogLineGroup key={i}>
                <LogRound>{entry.round}</LogRound>
                <LogBeats>
                  {roundLines(
                    entry,
                    locale,
                    view.creature.name,
                    abilityLabels,
                    view.creatureMoveNames,
                  ).map((line, j) => (
                    <LogLine key={j}>{line}</LogLine>
                  ))}
                </LogBeats>
              </LogLineGroup>
            ))}
          </LogList>
        </LogBlock>
      )}
    </Frame>
  )
}

function healthPct(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (current / max) * 100))
}

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 24px;
  margin-bottom: 18px;
  animation: ${rise} 0.35s ease both;
`

const RoundHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: linear-gradient(180deg, rgba(201, 164, 76, 0.08), rgba(201, 164, 76, 0.02));
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;

  b {
    color: ${({ theme }) => theme.colors.goldBright};
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }
`

const MenaceBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border: 1px solid rgba(200, 90, 90, 0.45);
  border-left: 3px solid ${({ theme }) => theme.colors.bloodBright};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: linear-gradient(90deg, rgba(200, 90, 90, 0.12), rgba(200, 90, 90, 0.03));
  color: ${({ theme }) => theme.colors.bloodBright};
`

const MenaceText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.colors.parchment};
  }

  span {
    font-style: italic;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const CombatantsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`

const CombatantCard = styled.div<{ $side: "creature" | "player" }>`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.ink2};
  border-top: 2px solid
    ${({ $side, theme }) => ($side === "creature" ? theme.colors.bloodBright : theme.colors.sage)};
`

const CombatantHead = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const CombatantName = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.parchment};
`

const RarityTag = styled.span<{ $rarity: string }>`
  margin-left: auto;
  padding: 2px 10px;
  border: 1px solid
    ${({ $rarity }) => theme.colors.rarity[$rarity as keyof typeof theme.colors.rarity] ?? theme.colors.rarity.common};
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ $rarity }) => theme.colors.rarity[$rarity as keyof typeof theme.colors.rarity] ?? theme.colors.rarity.common};
`

const BarWrap = styled.div`
  display: grid;
  grid-template-columns: 1fr 44px;
  gap: 4px 10px;
  align-items: center;
`

const BarLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const HealthBar = styled.div<{ $tone: "creature" | "player" | "resource"; $pct: number }>`
  grid-column: 1 / -1;
  height: 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid ${({ theme }) => theme.colors.line};
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    width: ${({ $pct }) => $pct}%;
    border-radius: 999px;
    background: ${({ $tone, theme }) =>
      $tone === "creature"
        ? "linear-gradient(90deg, #8c2f2f, " + theme.colors.bloodBright + ")"
        : $tone === "resource"
          ? "linear-gradient(90deg, #8f6a2a, " + theme.colors.goldBright + ")"
          : "linear-gradient(90deg, #4e6b4a, " + theme.colors.sage + ")"};
    transition: width 0.3s ease;
  }
`

const BarNumbers = styled.span`
  text-align: right;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const StatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const Stat = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};

  b {
    color: ${({ theme }) => theme.colors.parchment};
    font-variant-numeric: tabular-nums;
  }
`

const StatusRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const StatusChip = styled.span<{ $tone: "creature" | "player" }>`
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.parchment};
  background: ${({ $tone }) =>
    $tone === "creature" ? "rgba(200, 90, 90, 0.16)" : "rgba(111, 143, 106, 0.16)"};
  border: 1px solid
    ${({ $tone }) => ($tone === "creature" ? "rgba(200, 90, 90, 0.4)" : "rgba(111, 143, 106, 0.4)")};
`

const ActionMenu = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.ink2};
`

const AttackBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 22px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.goldBright},
    ${({ theme }) => theme.colors.gold}
  );
  border: 1px solid ${({ theme }) => theme.colors.gold};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.ink};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 600;
  font-size: 17px;
  letter-spacing: 0.06em;
  transition:
    transform 0.12s,
    filter 0.15s;

  &:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.5);
  }
`

const AbilityGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const AbilityGroupTitle = styled.span`
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted2};
`

const AbilityGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
`

const AbilityBtn = styled.button<{ $locked: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 13px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  text-align: left;
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.12s;
  opacity: ${({ $locked }) => ($locked ? 0.45 : 1)};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    background: rgba(201, 164, 76, 0.06);
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
  }
`

const AbilityLabel = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: ${({ theme }) => theme.colors.parchment};
`

const AbilityCost = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.gold};
`

const SupportRow = styled.div`
  display: flex;
  gap: 10px;

  @media (max-width: 680px) {
    flex-direction: column;
  }
`

const DefendBtn = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 15px;
  letter-spacing: 0.04em;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.sage};
    color: ${({ theme }) => theme.colors.sage};
    background: rgba(111, 143, 106, 0.08);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const FleeBtn = styled.button`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.muted};
  font-size: 15px;
  letter-spacing: 0.04em;
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.bloodBright};
    color: ${({ theme }) => theme.colors.bloodBright};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

const LogBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(0, 0, 0, 0.18);
`

const LogTitle = styled.span`
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted2};
`

const LogList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
`

const LogLineGroup = styled.div`
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
`

const LogRound = styled.span`
  padding-top: 1px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.gold};
`

const LogBeats = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const LogLine = styled.span`
  font-size: 15px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const TONE: Record<string, { color: string; bg: string }> = {
  win: { color: "#6f8f6a", bg: "rgba(111, 143, 106, 0.08)" },
  fled: { color: "#c9a44c", bg: "rgba(201, 164, 76, 0.08)" },
  lose: { color: "#c85a5a", bg: "rgba(200, 90, 90, 0.08)" },
}

const ResultCard = styled.div<{ $tone: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 26px 22px;
  border: 1px solid ${({ $tone }) => TONE[$tone].color};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ $tone }) => TONE[$tone].bg};
  box-shadow: ${({ theme }) => theme.shadow};
`

const ResultTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 34px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.parchment};
`

const ResultSub = styled.div`
  font-size: 14px;
  font-style: italic;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 6px;
`

const SpoilsCard = styled.div<{ $tone: string }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-self: stretch;
  padding: 14px 18px;
  border: 1px solid ${({ $tone }) => TONE[$tone].color};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: rgba(0, 0, 0, 0.2);
`

const SpoilsTitle = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.goldBright};
`

const SpoilsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const SpoilsItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 6px;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.parchmentDim};

  b {
    color: ${({ theme }) => theme.colors.goldBright};
    font-variant-numeric: tabular-nums;
  }
`

const Narrative = styled.div`
  max-width: 720px;
  text-align: center;
  font-size: 17px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.parchment};
  padding: 14px 18px;
  border-left: 2px solid ${({ theme }) => theme.colors.line2};
  background: rgba(0, 0, 0, 0.18);
  border-radius: 0 ${({ theme }) => theme.radii.sm} ${({ theme }) => theme.radii.sm} 0;
`

const ContinueBtn = styled(LinkBtn)`
  margin-top: 6px;
  padding: 12px 34px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 17px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.parchmentDim};

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
    background: rgba(201, 164, 76, 0.06);
  }
`

import { useEffect, useRef, useState } from "react"
import { keyframes, styled } from "styled-components"
import type {
  CircusMysterySide,
  CircusSegmentKind,
  Locale,
  ServedInteractiveState,
} from "@shared/types"
import { t } from "../../i18n/strings"
import { AchIcon } from "../AchIcon"
import { rise } from "../ui/Animation"

type WheelView = Extract<ServedInteractiveState, { game: "circus_wheel" }>

export interface WheelButtonsInput {
  busy: boolean
  spinning: boolean
  over: boolean
  gold: number
  cost: number
  freeSpins: number
}

export interface WheelButtonsState {
  canSpin: boolean
  spinDisabled: boolean
  cashOutDisabled: boolean
  noFunds: boolean
}

// Cash out must always be reachable once the wheel is up: the player who
// banked a bad spin and can no longer afford one is never stranded — the night
// can always end. Only an in-flight request (busy) or an already-finished match
// locks it; the spin animation or a stuck spinner must not trap the player.
export function wheelButtons({
  busy,
  spinning,
  over,
  gold,
  cost,
  freeSpins,
}: WheelButtonsInput): WheelButtonsState {
  const canSpin = freeSpins > 0 || gold >= cost
  return {
    canSpin,
    spinDisabled: busy || spinning || over || !canSpin,
    cashOutDisabled: busy || over,
    noFunds: !canSpin && !over && freeSpins === 0,
  }
}

interface Props {
  locale: Locale
  view: WheelView
  busy: boolean
  onSpin: () => void
  onLeave: () => void
}

// Alternating warm/cool circus palette so adjacent segments always contrast.
const COLORS = [
  "#a8433c",
  "#3f6d8f",
  "#c9a44c",
  "#5a7a4f",
  "#8f3f6d",
  "#b0603a",
  "#44608f",
  "#7a5a9e",
]

// How long the wheel spins before it can be spun again (matches the CSS
// transition below). The wheel stays visibly busy while it turns.
const SPIN_MS = 4200

function lastLine(
  locale: Locale,
  seg: WheelView["segments"][number],
  mystery: CircusMysterySide | undefined,
): string {
  if (seg.kind === "nothing") return t(locale, "wheelNothing")
  if (seg.kind === "freespin") return `${t(locale, "wheelFreeSpin")}!`
  if (seg.kind === "jackpot") return `${t(locale, "wheelJackpot")} ${seg.label}`
  if (seg.kind === "mystery") {
    return mystery === "injury"
      ? `${t(locale, "wheelMysteryInjury")} −${seg.healthCost ?? 10} ${t(locale, "health")}`
      : `${t(locale, "wheelMysteryPrize")} +${seg.amount ?? 0}`
  }
  return `${t(locale, "wheelYouWon")} ${seg.label}`
}

export function CircusWheelGame({ locale, view, busy, onSpin, onLeave }: Props) {
  const step = 360 / view.segments.length
  // Wheel rotation in degrees. Each new landing adds at least five full turns
  // plus the offset that parks the winning segment under the pointer.
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const animatedRef = useRef(0)

  useEffect(() => {
    if (view.lastSpin == null || view.spins <= animatedRef.current) return
    animatedRef.current = view.spins
    setSpinning(true)
    const segCenter = (view.lastSpin.segment + 0.5) * step
    setRotation((r) => {
      const delta = (360 - segCenter - (r % 360) + 360) % 360
      return r + 5 * 360 + delta
    })
    const t = setTimeout(() => setSpinning(false), SPIN_MS)
    return () => clearTimeout(t)
  }, [view.lastSpin, view.spins, step])

  const buttons = wheelButtons({
    busy,
    spinning,
    over: view.over,
    gold: view.gold,
    cost: view.cost,
    freeSpins: view.freeSpins,
  })
  const last = view.lastSpin != null ? view.segments[view.lastSpin.segment] : null
  const lastMystery = view.lastSpin?.mystery
  const gradient = view.segments
    .map((_, i) => `${COLORS[i % COLORS.length]} ${i * step}deg ${(i + 1) * step}deg`)
    .join(", ")

  return (
    <Game>
      <WheelWrap>
        <Pointer aria-hidden="true" />
        <WheelDisc
          role="img"
          aria-label="wheel of fortune"
          $rotation={rotation}
          $gradient={gradient}
        >
          {view.segments.map((s, i) => (
            <SegmentIcon key={s.id} $angle={(i + 0.5) * step}>
              <AchIcon name={s.icon} size={18} />
            </SegmentIcon>
          ))}
        </WheelDisc>
        <Hub aria-hidden="true" />
      </WheelWrap>

      {last && (
        <LastResult $kind={last.kind} $spin={view.spins}>
          <AchIcon name={last.icon} size={16} />
          <span>{lastLine(locale, last, lastMystery)}</span>
        </LastResult>
      )}

      <Stats>
        <Stat>
          {t(locale, "gold")} <StatB>{view.gold}</StatB>
        </Stat>
        <Stat>
          {t(locale, "wheelSpins")} <StatB>{view.spins}</StatB>
        </Stat>
        <Stat>
          {t(locale, "wheelNet")}{" "}
          <StatB $pos={view.net >= 0}>{view.net > 0 ? `+${view.net}` : view.net}</StatB>
        </Stat>
        {view.freeSpins > 0 && (
          <FreeChip>
            {t(locale, "wheelFreeSpin")} ×{view.freeSpins}
          </FreeChip>
        )}
        {view.hitJackpot && <JackpotChip>{t(locale, "wheelJackpot")}</JackpotChip>}
      </Stats>

      {view.log.length > 0 && (
        <LogStrip aria-label="spin history">
          {view.log.map((idx, i) => (
            <LogPip key={i} $last={i === view.log.length - 1}>
              <AchIcon name={view.segments[idx].icon} size={13} />
            </LogPip>
          ))}
        </LogStrip>
      )}

      <Buttons>
        <SpinBtn type="button" disabled={buttons.spinDisabled} onClick={onSpin}>
          {view.freeSpins > 0
            ? t(locale, "wheelFreeSpin")
            : `${t(locale, "wheelSpin")} · ${view.cost}g`}
        </SpinBtn>
        <CashOutBtn type="button" disabled={buttons.cashOutDisabled} onClick={onLeave}>
          {t(locale, "wheelCashOut")}
        </CashOutBtn>
      </Buttons>
      {buttons.noFunds && <NoFunds>{t(locale, "wheelNoFunds")}</NoFunds>}
    </Game>
  )
}

const Game = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: ${rise} 0.3s ease both;
`

const WheelWrap = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  padding: 12px 0 6px;
`

const WheelDisc = styled.div<{ $rotation: number; $gradient: string }>`
  --rim: min(104px, 24.5vw);
  position: relative;
  width: min(300px, 72vw);
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(from 0deg, ${({ $gradient }) => $gradient});
  box-shadow:
    inset 0 0 0 5px rgba(20, 17, 13, 0.92),
    inset 0 0 0 6px rgba(201, 164, 76, 0.55),
    inset 0 0 26px rgba(0, 0, 0, 0.5),
    0 10px 30px rgba(0, 0, 0, 0.45);
  transform: rotate(${({ $rotation }) => $rotation}deg);
  transition: transform ${SPIN_MS}ms cubic-bezier(0.12, 0.82, 0.16, 1);
  will-change: transform;
`

const SegmentIcon = styled.span<{ $angle: number }>`
  position: absolute;
  top: 50%;
  left: 50%;
  display: inline-flex;
  color: rgba(255, 246, 230, 0.94);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
  transform: translate(-50%, -50%) rotate(${({ $angle }) => $angle}deg)
    translateY(calc(var(--rim) * -1)) rotate(${({ $angle }) => -$angle}deg);
  pointer-events: none;
`

const Pointer = styled.div`
  position: absolute;
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-top: 20px solid ${({ theme }) => theme.colors.goldBright};
  z-index: 3;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.55));
`

const Hub = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 35% 30%,
    #f3d98c,
    ${({ theme }) => theme.colors.gold} 62%,
    #7a5f22
  );
  box-shadow:
    inset 0 -3px 6px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.5);
  z-index: 2;
`

const RESULT_TONE: Record<CircusSegmentKind, string> = {
  gold: "#c9a44c",
  jackpot: "#e6c874",
  nothing: "#9c8f74",
  freespin: "#6f8f6a",
  item: "#6f8f6a",
  fame: "#c9803c",
  mystery: "#7a5a9e",
}

const pop = keyframes`
  from {
    opacity: 0;
    transform: translateY(5px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`

const LastResult = styled.div<{ $kind: CircusSegmentKind; $spin: number }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  border: 1px solid ${({ $kind }) => RESULT_TONE[$kind]};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $kind }) => `${RESULT_TONE[$kind]}16`};
  color: ${({ theme }) => theme.colors.parchment};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.03em;
  animation: ${pop} 0.3s ease both;
`

const Stats = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  width: min(420px, 100%);
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  flex-wrap: wrap;
`

const Stat = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const StatB = styled.b<{ $pos?: boolean }>`
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  color: ${({ $pos, theme }) => ($pos ? theme.colors.sage : theme.colors.parchment)};
`

const FreeChip = styled.span`
  padding: 2px 10px;
  border: 1px solid rgba(111, 143, 106, 0.55);
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.sage};
  background: rgba(111, 143, 106, 0.1);
`

const jackpotPulse = keyframes`
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(230, 200, 116, 0.35);
  }
  50% {
    box-shadow: 0 0 12px 2px rgba(230, 200, 116, 0.45);
  }
`

const JackpotChip = styled.span`
  padding: 3px 12px;
  border: 1px solid ${({ theme }) => theme.colors.goldBright};
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.goldBright};
  background: rgba(201, 164, 76, 0.14);
  animation: ${jackpotPulse} 1.6s ease-in-out infinite;
`

const LogStrip = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
  max-width: 420px;
`

const LogPip = styled.span<{ $last: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ $last, theme }) => ($last ? theme.colors.gold : theme.colors.line2)};
  color: ${({ theme }) => theme.colors.muted};
  ${({ $last }) => $last && `color: #e6c874;`}
`

const Buttons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
`

const SpinBtn = styled.button`
  padding: 12px 26px;
  background: linear-gradient(180deg, rgba(201, 164, 76, 0.16), rgba(201, 164, 76, 0.06));
  border: 1px solid ${({ theme }) => theme.colors.gold};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 16px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.goldBright};
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.12s,
    box-shadow 0.15s;

  &:hover:not(:disabled) {
    background: linear-gradient(180deg, rgba(201, 164, 76, 0.28), rgba(201, 164, 76, 0.1));
    box-shadow: 0 6px 18px rgba(201, 164, 76, 0.18);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const CashOutBtn = styled.button`
  padding: 12px 22px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 15px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.parchmentDim};
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const NoFunds = styled.div`
  font-size: 13px;
  font-style: italic;
  color: ${({ theme }) => theme.colors.bloodBright};
`

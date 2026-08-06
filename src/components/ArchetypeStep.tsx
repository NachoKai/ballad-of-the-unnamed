import { Lock } from "lucide-react"
import { styled } from "styled-components"
import type { ArchetypeView } from "../api"
import { AchIcon } from "./AchIcon"
import { t } from "../i18n/strings"
import { rise } from "./ui/Animation"
import { STAT_ABBR } from "../constants"
import { LinkBtn } from "./ui/Button"
import { Tooltip } from "./ui/Tooltip"
import type { Locale } from "@shared/types"

interface Props {
  locale: Locale
  archetypes: ArchetypeView[]
  onPick: (id: string) => void
  onBack: () => void
  busy: boolean
  // Localized name of the class being rolled (for the locked-card hint).
  className?: string
}

export function ArchetypeStep({ locale, archetypes, onPick, onBack, busy, className }: Props) {
  // The hidden master archetype (locked "???" card, or its unlocked form) is
  // always pinned to the end of the grid; the normal cards stay in draw order.
  const ordered = [...archetypes].sort(
    (a, b) =>
      Number(b.locked ?? false) +
      Number(b.isMaster ?? false) -
      (Number(a.locked ?? false) + Number(a.isMaster ?? false)),
  )
  return (
    <ArchetypeRoot>
      <BackRow>
        <LinkBtn type="button" onClick={onBack} disabled={busy}>
          ← {t(locale, "back")}
        </LinkBtn>
      </BackRow>
      <Heading>{t(locale, "chooseArchetype")}</Heading>
      <Grid>
        {ordered.map((a) =>
          a.locked ? (
            <LockedCard key={a.id} type="button" disabled>
              <IconWrap>
                <AchIcon name={a.icon} size={28} />
              </IconWrap>
              <Name>???</Name>
              {className && <ClassLine>{className}</ClassLine>}
              <LockedHint>{t(locale, "masterArchetypeLocked")}</LockedHint>
              <LockChip>
                <Lock size={12} aria-hidden="true" /> {t(locale, "locked")}
              </LockChip>
            </LockedCard>
          ) : (
            <Card
              key={a.id}
              type="button"
              $master={a.isMaster}
              onClick={() => onPick(a.id)}
              disabled={busy}
            >
              {a.isMaster && <MasterBadge>{t(locale, "masterArchetype")}</MasterBadge>}
              <IconWrap>
                <AchIcon name={a.icon} size={28} />
              </IconWrap>
              <Name>{a.name}</Name>
              <Flavor>{a.flavor}</Flavor>
              <StatList>
                {Object.entries(a.statDeltas).map(([k, v]) => (
                  <Tooltip key={k} content={t(locale, `tooltip_stat_${k}`)}>
                    <StatChip>
                      {t(locale, STAT_ABBR[k])} <b>+{v}</b>
                    </StatChip>
                  </Tooltip>
                ))}
              </StatList>
            </Card>
          ),
        )}
      </Grid>
    </ArchetypeRoot>
  )
}

const ArchetypeRoot = styled.div`
  animation: ${rise} 0.4s ease both;
  margin-top: 10px;
`

const BackRow = styled.div`
  margin-bottom: 6px;
`

const Heading = styled.h2`
  text-align: center;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 23px;
  color: ${({ theme }) => theme.colors.goldBright};
  margin-bottom: 20px;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`

const Card = styled.button<{ $master?: boolean }>`
  position: relative;
  text-align: center;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel} 0%,
    ${({ theme }) => theme.colors.ink2} 100%
  );
  border: 1px solid ${({ $master, theme }) => ($master ? theme.colors.gold : theme.colors.line)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px 18px 18px;
  transition:
    border-color 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.goldBright};
    transform: translateY(-3px);
    box-shadow: ${({ $master, theme }) =>
      $master
        ? `0 0 0 1px ${theme.colors.goldBright}, 0 6px 18px rgba(201, 164, 76, 0.18)`
        : `0 0 0 1px ${theme.colors.gold}`};
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`

// The hidden master archetype, not yet unlocked: a masked "???" card so
// players know the class has a secret archetype to earn.
const LockedCard = styled.button`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 232px;
  gap: 8px;
  background:
    repeating-linear-gradient(45deg, rgba(201, 164, 76, 0.045) 0 10px, transparent 10px 20px),
    linear-gradient(
      180deg,
      ${({ theme }) => theme.colors.panel} 0%,
      ${({ theme }) => theme.colors.ink2} 100%
    );
  border: 1px dashed ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px 18px 18px;
  cursor: default;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
  }
`

const MasterBadge = styled.span`
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.ink};
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.goldBright},
    ${({ theme }) => theme.colors.gold}
  );
  border-radius: 999px;
  padding: 3px 10px;
  white-space: nowrap;
`

const IconWrap = styled.div`
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 10px;
`

const Name = styled.h3`
  color: ${({ theme }) => theme.colors.goldBright};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 20px;
  margin-bottom: 6px;
`

const ClassLine = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`

const LockedHint = styled.p`
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 14px;
  font-style: italic;
  line-height: 1.45;
  max-width: 220px;
`

const LockChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
`

const Flavor = styled.p`
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 15px;
  line-height: 1.5;
  margin-bottom: 14px;
  min-height: 42px;
`

const StatList = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
`

const StatChip = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};

  b {
    color: ${({ theme }) => theme.colors.sage};
    font-weight: 600;
  }
`

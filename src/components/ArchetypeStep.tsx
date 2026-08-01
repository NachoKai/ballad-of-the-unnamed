import { styled } from "styled-components"
import type { ArchetypeView } from "../api"
import { AchIcon } from "./AchIcon"
import { t } from "../i18n/strings"
import { rise } from "./ui/Animation"
import { STAT_ABBR } from "../constants"
import { LinkBtn } from "./ui/Button"
import type { Locale } from "@shared/types"

interface Props {
  locale: Locale
  archetypes: ArchetypeView[]
  onPick: (id: string) => void
  onBack: () => void
  busy: boolean
}

export function ArchetypeStep({ locale, archetypes, onPick, onBack, busy }: Props) {
  return (
    <ArchetypeRoot>
      <BackRow>
        <LinkBtn type="button" onClick={onBack} disabled={busy}>
          ← {t(locale, "back")}
        </LinkBtn>
      </BackRow>
      <Heading>{t(locale, "chooseArchetype")}</Heading>
      <Grid>
        {archetypes.map((a) => (
          <Card key={a.id} type="button" onClick={() => onPick(a.id)} disabled={busy}>
            <IconWrap>
              <AchIcon name={a.icon} size={28} />
            </IconWrap>
            <Name>{a.name}</Name>
            <Flavor>{a.flavor}</Flavor>
            <StatList>
              {Object.entries(a.statDeltas).map(([k, v]) => (
                <StatChip key={k}>
                  {t(locale, STAT_ABBR[k])} <b>+{v}</b>
                </StatChip>
              ))}
            </StatList>
          </Card>
        ))}
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
  font-size: 22px;
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

const Card = styled.button`
  text-align: center;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel} 0%,
    ${({ theme }) => theme.colors.ink2} 100%
  );
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px 18px 18px;
  transition:
    border-color 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    transform: translateY(-3px);
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.gold};
  }

  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`

const IconWrap = styled.div`
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 10px;
`

const Name = styled.h3`
  color: ${({ theme }) => theme.colors.goldBright};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 19px;
  margin-bottom: 6px;
`

const Flavor = styled.p`
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 14px;
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
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};

  b {
    color: ${({ theme }) => theme.colors.sage};
    font-weight: 600;
  }
`

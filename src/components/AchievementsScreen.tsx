import { styled } from "styled-components"
import type { Locale } from "@shared/types"
import type { AchievementView } from "../api"
import { t } from "../i18n/strings"
import { AchIcon } from "./AchIcon"
import { BtnGhost } from "./ui/Button"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  achievements: AchievementView[]
  onBack: () => void
}

const RARITY_COLOR: Record<string, string> = {
  common: "#9c8f74",
  uncommon: "#6f8f6a",
  rare: "#5a86c8",
  volatile: "#c9803c",
  epic: "#b674e0",
  legendary: "#e6c874",
}

export function AchievementsScreen({ locale, achievements, onBack }: Props) {
  return (
    <Screen>
      <Header>
        <h1>{t(locale, "achievementsTitle")}</h1>
      </Header>

      {achievements.length === 0 ? (
        <EmptyMsg>{t(locale, "noAchievements")}</EmptyMsg>
      ) : (
        <Grid>
          {achievements.map((a) => (
            <Card key={a.id}>
              <IconWrap>
                <AchIcon name={a.icon} size={18} />
              </IconWrap>
              <Info>
                <Name>{a.name}</Name>
                <Desc>{a.description}</Desc>
              </Info>
              <RarityBadge $rarity={a.rarity}>
                {t(locale, `rarity_${a.rarity}` as never)}
              </RarityBadge>
            </Card>
          ))}
        </Grid>
      )}

      <BackBtn type="button" onClick={onBack}>
        {t(locale, "back")}
      </BackBtn>
    </Screen>
  )
}

const Screen = styled.div`
  animation: ${rise} 0.4s ease both;
`

const Header = styled.header`
  margin: 18px 0 10px;

  h1 {
    font-size: clamp(26px, 4vw, 38px);
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

const EmptyMsg = styled.p`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
`

const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.sm};
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
  }
`

const IconWrap = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(201, 164, 76, 0.1);
  color: ${({ theme }) => theme.colors.goldBright};
  flex-shrink: 0;
`

const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`

const Name = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.parchment};
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Desc = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RarityBadge = styled.span<{ $rarity: string }>`
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  background: ${({ $rarity }) => {
    const c = RARITY_COLOR[$rarity]
    return c ? `${c}22` : "rgba(156,143,116,0.15)"
  }};
  color: ${({ $rarity }) => RARITY_COLOR[$rarity] ?? "#9c8f74"};
`

const BackBtn = styled(BtnGhost)`
  margin-top: 18px;
`

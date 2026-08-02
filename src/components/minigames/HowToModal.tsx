import { styled } from "styled-components"
import type { InteractiveGameKind, Locale } from "@shared/types"
import { t } from "../../i18n/strings"
import { rise } from "../ui/Animation"

interface Props {
  locale: Locale
  game: InteractiveGameKind
  onClose: () => void
}

const RPS_RULES: { key: string; icon: string }[] = [
  { key: "rpsHowStone", icon: "🪨" },
  { key: "rpsHowParchment", icon: "📜" },
  { key: "rpsHowDagger", icon: "🗡️" },
  { key: "rpsHowSalamander", icon: "🦎" },
  { key: "rpsHowMage", icon: "🧙" },
]

export function HowToModal({ locale, game, onClose }: Props) {
  const isRps = game === "rps"
  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()}>
        <Header>
          <Title>{t(locale, isRps ? "rpsHowTitle" : "tttHowTitle")}</Title>
          <CloseBtn type="button" onClick={onClose} aria-label={t(locale, "minigameClose")}>
            &times;
          </CloseBtn>
        </Header>
        <Body>
          {isRps ? (
            <>
              <Intro>{t(locale, "rpsHowIntro")}</Intro>
              <Rules>
                {RPS_RULES.map((r) => (
                  <Rule key={r.key}>
                    <RuleIcon aria-hidden="true">{r.icon}</RuleIcon>
                    <RuleText>{t(locale, r.key)}</RuleText>
                  </Rule>
                ))}
              </Rules>
            </>
          ) : (
            <>
              <Intro>{t(locale, "tttHowIntro")}</Intro>
              <TttBody>{t(locale, "tttHowBody")}</TttBody>
            </>
          )}
        </Body>
        <Footer>
          <DoneBtn type="button" onClick={onClose}>
            {t(locale, "minigameClose")}
          </DoneBtn>
        </Footer>
      </Modal>
    </Overlay>
  )
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  padding: 20px;
`

const Modal = styled.div`
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: ${({ theme }) => theme.radii.lg};
  animation: ${rise} 0.25s ease both;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 21px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.goldBright};
  margin: 0;
`

const CloseBtn = styled.button`
  margin-left: auto;
  background: none;
  border: none;
  padding: 0 6px;
  font-size: 26px;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  line-height: 1;
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
`

const Intro = styled.p`
  margin: 0;
  font-size: 15px;
  font-style: italic;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const Rules = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
`

const Rule = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
`

const RuleIcon = styled.span`
  font-size: 20px;
  min-width: 26px;
  text-align: center;
`

const RuleText = styled.span`
  font-size: 14px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.parchment};
`

const TttBody = styled.p`
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.parchment};
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`

const DoneBtn = styled.button`
  padding: 8px 22px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 14px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.parchment};
  cursor: pointer;
  transition:
    border-color 0.15s,
    color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

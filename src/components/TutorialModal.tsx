import { useEffect, useState } from "react"
import { styled } from "styled-components"
import type { Locale } from "@shared/types"
import { t } from "../i18n/strings"
import { TUTORIAL_PAGES } from "../i18n/tutorial"
import { AchIcon } from "./AchIcon"
import { TextPretty } from "./ui/Text"
import { BtnPrimary } from "./ui/Button"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  onClose: () => void
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

export function TutorialModal({ locale, onClose }: Props) {
  const total = TUTORIAL_PAGES.length
  const [page, setPage] = useState(0)
  const current = TUTORIAL_PAGES[page] ?? TUTORIAL_PAGES[0]
  const isLast = page === total - 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function advance() {
    if (page < total - 1) setPage(page + 1)
    else onClose()
  }

  return (
    <Overlay onClick={onClose}>
      <Modal onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <Header>
          <Title>
            <AchIcon name={current.icon} size={22} />
            {t(locale, "tutorialTitle")}
          </Title>
          <CloseBtn type="button" onClick={onClose} aria-label="close">
            &times;
          </CloseBtn>
        </Header>

        <Body>
          <PageIcon aria-hidden="true">
            <AchIcon name={current.icon} size={40} />
          </PageIcon>
          <PageTitle>{current.title[locale]}</PageTitle>
          <PageText>{current.body[locale]}</PageText>
        </Body>

        <Footer>
          <PageCount>
            {interpolate(t(locale, "tutorialPageCount"), { n: page + 1, total })}
          </PageCount>
          <Dots aria-hidden="true">
            {TUTORIAL_PAGES.map((p, i) => (
              <Dot key={p.id} $active={i === page} />
            ))}
          </Dots>
          <NextBtn type="button" onClick={advance}>
            {isLast ? t(locale, "tutorialDone") : t(locale, "tutorialNext")}
          </NextBtn>
        </Footer>
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
  max-width: 720px;
  max-height: 82vh;
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
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.line};
`

const Title = styled.h2`
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 22px;
  color: ${({ theme }) => theme.colors.goldBright};
  margin: 0;

  svg {
    color: ${({ theme }) => theme.colors.gold};
  }
`

const CloseBtn = styled.button`
  margin-left: auto;
  background: none;
  border: none;
  padding: 0 6px;
  font-size: 27px;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  line-height: 1;
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14px;
  padding: 28px 26px 20px;
`

const PageIcon = styled.div`
  color: ${({ theme }) => theme.colors.gold};
`

const PageTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 24px;
  color: ${({ theme }) => theme.colors.parchment};
  margin: 0;
`

const PageText = styled(TextPretty)`
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 17px;
  line-height: 1.55;
  max-width: 62ch;
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.line};
`

const PageCount = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
`

const Dots = styled.div`
  display: flex;
  gap: 6px;
  margin-left: auto;
`

const Dot = styled.span<{ $active: boolean }>`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${({ $active, theme }) => ($active ? theme.colors.gold : theme.colors.line2)};
  transition: background 0.15s;
`

const NextBtn = styled(BtnPrimary)`
  font-size: 15px;
  padding: 9px 22px;
`

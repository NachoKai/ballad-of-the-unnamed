import { useEffect, useState } from "react"
import { styled, keyframes } from "styled-components"
import type { AchievementContent, Locale } from "@shared/types"
import { t as resolveLocaleMap } from "@shared/i18n"
import { AchIcon } from "./AchIcon"

export interface ToastItem {
  id: string
  icon: string
  title: string
  desc: string
}

export function useAchievementToasts(locale: Locale, t: (k: string) => string) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  function push(achievements: AchievementContent[]) {
    if (achievements.length === 0) return
    const items = achievements.map((a) => ({
      id: `${a.id}-${Date.now()}-${Math.random()}`,
      icon: a.icon,
      title: `${t("achievementUnlocked")}: ${resolveLocaleMap(a.name, locale)}`,
      desc: resolveLocaleMap(a.description, locale),
    }))
    setToasts((prev) => [...prev, ...items])
  }

  function remove(id: string) {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }

  return { toasts, push, remove }
}

export function Toasts({
  items,
  onExpire,
}: {
  items: ToastItem[]
  onExpire: (id: string) => void
}) {
  return (
    <ToastWrap aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onExpire={onExpire} />
      ))}
    </ToastWrap>
  )
}

function ToastCard({ item, onExpire }: { item: ToastItem; onExpire: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(item.id), 5000)
    return () => clearTimeout(timer)
  }, [item.id, onExpire])

  return (
    <Toast role="status" onClick={() => onExpire(item.id)}>
      <ToastIcon>
        <AchIcon name={item.icon} size={26} />
      </ToastIcon>
      <div>
        <ToastTitle>{item.title}</ToastTitle>
        <ToastDesc>{item.desc}</ToastDesc>
      </div>
    </Toast>
  )
}

const ToastWrap = styled.div`
  position: fixed;
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 100;
`

const toastIn = keyframes`
  from { opacity: 0; transform: translateX(30px); }
`

const Toast = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 260px;
  max-width: 340px;
  padding: 14px 16px;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel2},
    ${({ theme }) => theme.colors.ink2}
  );
  border: 1px solid ${({ theme }) => theme.colors.gold};
  border-radius: ${({ theme }) => theme.radii.sm};
  box-shadow: ${({ theme }) => theme.shadow};
  animation: ${toastIn} 0.35s ease both;
  cursor: pointer;
`

const ToastIcon = styled.span`
  font-size: 27px;
  color: ${({ theme }) => theme.colors.goldBright};
`

const ToastTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 16px;
  color: ${({ theme }) => theme.colors.goldBright};
`

const ToastDesc = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.parchmentDim};
  line-height: 1.4;
`

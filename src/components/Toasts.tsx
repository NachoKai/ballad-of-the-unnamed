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
  // "gold" is the default celebratory card; "error" renders with the blood-
  // red border/icon treatment for failures.
  tone?: "gold" | "error"
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

  // Custom (non-achievement) toasts — e.g. "New archetype unlocked!" on the
  // ending screen. Same card, no "Achievement unlocked" prefix.
  function pushCustom(items: { icon: string; title: string; desc: string; tone?: ToastItem["tone"] }[]) {
    if (items.length === 0) return
    const withIds = items.map((item) => ({
      ...item,
      id: `${item.title}-${Date.now()}-${Math.random()}`,
    }))
    setToasts((prev) => [...prev, ...withIds])
  }

  // Error toasts — failures surfaced to the player with a distinct treatment.
  function pushError(items: { title: string; desc: string }[]) {
    pushCustom(items.map((item) => ({ ...item, icon: "siren", tone: "error" as const })))
  }

  function remove(id: string) {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }

  return { toasts, push, pushCustom, pushError, remove }
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
    const timer = setTimeout(() => onExpire(item.id), item.tone === "error" ? 9000 : 5000)
    return () => clearTimeout(timer)
  }, [item.id, item.tone, onExpire])

  return (
    <Toast role="status" $tone={item.tone ?? "gold"} onClick={() => onExpire(item.id)}>
      <ToastIcon $tone={item.tone ?? "gold"}>
        <AchIcon name={item.icon} size={26} />
      </ToastIcon>
      <div>
        <ToastTitle $tone={item.tone ?? "gold"}>{item.title}</ToastTitle>
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

const Toast = styled.div<{ $tone: NonNullable<ToastItem["tone"]> }>`
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
  border: 1px solid
    ${({ $tone, theme }) => ($tone === "error" ? theme.colors.bloodBright : theme.colors.gold)};
  border-radius: ${({ theme }) => theme.radii.sm};
  box-shadow: ${({ theme }) => theme.shadow};
  animation: ${toastIn} 0.35s ease both;
  cursor: pointer;
`

const ToastIcon = styled.span<{ $tone: NonNullable<ToastItem["tone"]> }>`
  font-size: 27px;
  color: ${({ $tone, theme }) => ($tone === "error" ? theme.colors.bloodBright : theme.colors.goldBright)};
`

const ToastTitle = styled.div<{ $tone: NonNullable<ToastItem["tone"]> }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 16px;
  color: ${({ $tone, theme }) => ($tone === "error" ? theme.colors.bloodBright : theme.colors.goldBright)};
`

const ToastDesc = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.parchmentDim};
  line-height: 1.4;
`

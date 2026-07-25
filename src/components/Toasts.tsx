import { useEffect, useState } from "react"
import type { AchievementContent } from "@shared/types"
import { AchIcon } from "./AchIcon"

export interface ToastItem {
  id: string
  icon: string
  title: string
  desc: string
}

export function useAchievementToasts(t: (k: string) => string) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  function push(achievements: AchievementContent[]) {
    if (achievements.length === 0) return
    const items = achievements.map((a) => ({
      id: `${a.id}-${Date.now()}-${Math.random()}`,
      icon: a.icon,
      title: `${t("achievementUnlocked")}: ${a.name.en}`,
      desc: a.description.en,
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
    <div className="toast-wrap" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onExpire={onExpire} />
      ))}
    </div>
  )
}

function ToastCard({
  item,
  onExpire,
}: {
  item: ToastItem
  onExpire: (id: string) => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(item.id), 5000)
    return () => clearTimeout(timer)
  }, [item.id, onExpire])

  return (
    <div className="toast" role="status">
      <span className="ach-icon">
        <AchIcon name={item.icon} size={26} />
      </span>
      <div>
        <div className="t-title">{item.title}</div>
        <div className="t-desc">{item.desc}</div>
      </div>
    </div>
  )
}

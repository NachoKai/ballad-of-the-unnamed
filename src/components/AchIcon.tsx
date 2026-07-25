import {
  Clover,
  Coins,
  Crown,
  Dumbbell,
  Flag,
  Flame,
  Gem,
  HeartPulse,
  Hourglass,
  type LucideIcon,
  MessageCircle,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Tent,
} from "lucide-react"

// Maps the semantic icon names used in content/achievements.json to real
// Lucide icons (design guideline: use real icons, never emoji/text names).
const ICONS: Record<string, LucideIcon> = {
  swords: Swords,
  shield: Shield,
  coins: Coins,
  star: Star,
  crown: Crown,
  dumbbell: Dumbbell,
  "message-circle": MessageCircle,
  sparkles: Sparkles,
  "heart-pulse": HeartPulse,
  hourglass: Hourglass,
  tent: Tent,
  flame: Flame,
  flag: Flag,
  skull: Skull,
  gem: Gem,
  clover: Clover,
}

export function AchIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Sparkles
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
}

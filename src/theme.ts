export const theme = {
  colors: {
    ink: "#14110d",
    ink2: "#1d1913",
    ink3: "#272016",
    panel: "#201a12",
    panel2: "#2a2318",
    line: "#3a3123",
    line2: "#4a3f2c",
    parchment: "#e8dcc0",
    parchmentDim: "#b6a889",
    muted: "#9c8f74",
    muted2: "#7d715a",
    gold: "#c9a44c",
    goldBright: "#e6c874",
    blood: "#a03434",
    bloodBright: "#c85a5a",
    sage: "#6f8f6a",

    rarity: {
      common: "#9c8f74",
      uncommon: "#6f8f6a",
      rare: "#5a86c8",
      volatile: "#c9803c",
      epic: "#b674e0",
      legendary: "#e6c874",
    },

    rank1: "#ffd76e",
    rank2: "#d8d2c4",
    rank3: "#d59a5c",
  },

  fonts: {
    display: "'Cinzel', serif",
    body: "'EB Garamond', Georgia, serif",
  },

  radii: {
    sm: "8px",
    lg: "14px",
  },

  shadow: "0 10px 40px rgba(0, 0, 0, 0.55)",
} as const

export function rarityColor(rarity: string): string {
  return (
    theme.colors.rarity[rarity as keyof typeof theme.colors.rarity] ?? theme.colors.rarity.common
  )
}

export type Theme = typeof theme

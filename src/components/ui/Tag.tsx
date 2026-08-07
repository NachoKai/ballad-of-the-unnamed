import { styled } from "styled-components"
import { theme } from "../../theme"

export type TagTone = "gold" | "sage" | "blood" | "muted" | "parchment"

interface TagProps {
  $tone?: TagTone
  $fill?: boolean
}

// Exported so sibling screens (e.g. the ending screen's bond badges) can reuse
// the exact same tone palette instead of re-deriving the rgba values.
export const TONES: Record<TagTone, { border: string; fill: string; text: string }> = {
  gold: {
    border: "rgba(201, 164, 76, 0.55)",
    fill: "rgba(201, 164, 76, 0.12)",
    text: theme.colors.goldBright,
  },
  sage: {
    border: "rgba(111, 143, 106, 0.5)",
    fill: "rgba(111, 143, 106, 0.12)",
    text: theme.colors.sage,
  },
  blood: {
    border: "rgba(200, 90, 90, 0.5)",
    fill: "rgba(191, 30, 30, 0.12)",
    text: theme.colors.bloodBright,
  },
  muted: {
    border: "rgba(154, 143, 116, 0.35)",
    fill: "rgba(154, 143, 116, 0.08)",
    text: theme.colors.muted,
  },
  parchment: {
    border: "rgba(232, 220, 192, 0.4)",
    fill: "rgba(232, 220, 192, 0.08)",
    text: theme.colors.parchment,
  },
}

export const Tag = styled.span<TagProps>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border: 1px solid ${({ $tone = "muted" }) => TONES[$tone].border};
  border-radius: 999px;
  background: ${({ $tone = "muted", $fill = true }) => ($fill ? TONES[$tone].fill : "transparent")};
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.35;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ $tone = "muted" }) => TONES[$tone].text};

  b {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.parchment};
  }
`

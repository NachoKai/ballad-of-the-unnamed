// Top personality tags by weight, used for the HUD summary chips.
export function personalitySummary(p: Record<string, number>): string[] {
  return Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag)
}

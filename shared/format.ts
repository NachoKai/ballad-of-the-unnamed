// Every player-facing number in the game is an integer by design: no stat,
// gold, score, or grade should ever render a decimal point. Values that pick
// up fractional noise (fatigue-modified stamina, ratios, multipliers) are
// rounded through this single funnel before they reach the screen.
export function fmtInt(value: number): number {
  return Math.round(value)
}

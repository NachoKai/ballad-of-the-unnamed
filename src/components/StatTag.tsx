import type { StatDeltas } from "@shared/types"
import { STAT_KEYS } from "@shared/types"
import type { Locale } from "@shared/types"
import { styled } from "styled-components"
import { t } from "../i18n/strings"
import { Tooltip } from "./ui/Tooltip"

interface Props {
  locale: Locale
  deltas: StatDeltas
  tradeoff?: boolean
}

export function StatTag({ locale, deltas, tradeoff }: Props) {
  const entries = STAT_KEYS.map((k) => ({ key: k, delta: deltas[k] })).filter(
    (e): e is { key: (typeof STAT_KEYS)[number]; delta: number } =>
      e.delta !== undefined && e.delta !== 0,
  )

  if (entries.length === 0) return null

  return (
    <Group $tradeoff={tradeoff}>
      {entries.map((e) => {
        const Tag = e.delta > 0 ? TagUp : TagDown
        const sign = e.delta > 0 ? "+" : ""
        return (
          <Tooltip key={e.key} content={t(locale, `tooltip_stat_${e.key}`)}>
            <Tag>
              {sign}
              {e.delta} {t(locale, `stat_${e.key}_tag`)}
            </Tag>
          </Tooltip>
        )
      })}
    </Group>
  )
}

const Group = styled.span<{ $tradeoff?: boolean }>`
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  opacity: ${({ $tradeoff }) => ($tradeoff ? 0.75 : 1)};
`

const tagBase = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
`

const TagUp = styled(tagBase)`
  background: rgba(111, 143, 106, 0.15);
  color: ${({ theme }) => theme.colors.sage};
  border: 1px solid rgba(111, 143, 106, 0.3);
`

const TagDown = styled(tagBase)`
  background: rgba(160, 52, 52, 0.15);
  color: ${({ theme }) => theme.colors.bloodBright};
  border: 1px solid rgba(160, 52, 52, 0.3);
`

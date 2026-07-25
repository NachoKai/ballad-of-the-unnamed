import type { StatDeltas } from "@shared/types";
import { STAT_KEYS } from "@shared/types";
import type { Locale } from "@shared/types";
import { t } from "../i18n/strings";

interface Props {
  locale: Locale;
  deltas: StatDeltas;
  className?: string;
}

export function StatTag({ locale, deltas, className = "" }: Props) {
  const entries = STAT_KEYS.map(k => ({ key: k, delta: deltas[k] })).filter(
    (e): e is { key: (typeof STAT_KEYS)[number]; delta: number } =>
      e.delta !== undefined && e.delta !== 0,
  );

  if (entries.length === 0) return null;

  return (
    <span className={`stat-tag-group ${className}`}>
      {entries.map(e => {
        const cls = e.delta > 0 ? "stat-tag-up" : "stat-tag-down";
        const sign = e.delta > 0 ? "+" : "";
        return (
          <span key={e.key} className={`stat-tag ${cls}`}>
            {sign}
            {e.delta} {t(locale, `stat_${e.key}_tag`)}
          </span>
        );
      })}
    </span>
  );
}

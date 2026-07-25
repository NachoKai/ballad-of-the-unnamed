import { useState } from "react";
import { styled } from "styled-components";
import type { CharacterState, ServedEvent } from "@shared/types";
import type { Locale } from "@shared/types";
import { t } from "../i18n/strings";
import { AchIcon } from "./AchIcon";
import { Hud } from "./Hud";
import { StatTag } from "./StatTag";
import { LinkBtn } from "./Shared";

interface Props {
  locale: Locale;
  character: CharacterState;
  event: ServedEvent;
  narrative: string | null;
  turnNarrative: string | null;
  onChoose: (choiceId: string) => Promise<void>;
  onAbandon: () => void;
}

const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  volatile: 3,
};

export function GameScreen({
  locale,
  character,
  event,
  turnNarrative,
  onChoose,
  onAbandon,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  async function pick(id: string) {
    if (busy) return;
    setBusy(true);
    setSelected(id);
    try {
      await onChoose(id);
    } finally {
      setBusy(false);
      setSelected(null);
    }
  }

  // Sort choices by rarity so the "safe" option is first and rare/volatile pop last.
  const choices = [...event.choices].sort(
    (a, b) => (RARITY_ORDER[a.rarity] ?? 0) - (RARITY_ORDER[b.rarity] ?? 0),
  );

  return (
    <div className="game-layout">
      <Hud locale={locale} character={character} />

      <main className="scene" aria-live="polite">
        {turnNarrative && <p className="scene-echo">{turnNarrative}</p>}

        {event.isRetirementOffer && (
          <div className="retire-banner" role="status">
            {t(locale, "retirementOffered")}
          </div>
        )}

        <p className="scene-narrative text-pretty">{event.narrative}</p>

        <div className="choice-grid" role="group" aria-label={t(locale, "chooseAction")}>
          {choices.map(c => (
            <button
              key={c.id}
              type="button"
              className={`choice-card rarity-${c.rarity} ${
                selected === c.id ? "is-selected" : ""
              }`}
              onClick={() => pick(c.id)}
              disabled={busy}
            >
              <span className={`rarity-pip rarity-${c.rarity}`} aria-hidden="true" />
              <span className="choice-label text-pretty">
                {c.icon && <AchIcon name={c.icon} size={20} />}
                {c.label}
              </span>
              <span className="choice-rarity">
                {t(locale, `rarity_${c.rarity}` as never)}
              </span>
              {(c.statDeltas || c.tradeoffDeltas) && (
                <span className="choice-deltas">
                  {c.statDeltas && <StatTag locale={locale} deltas={c.statDeltas} />}
                  {c.tradeoffDeltas && (
                    <StatTag
                      locale={locale}
                      deltas={c.tradeoffDeltas}
                      className="tradeoff"
                    />
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        <AbandonBtn type="button" onClick={onAbandon} disabled={busy}>
          {t(locale, "abandonRun")}
        </AbandonBtn>
      </main>
    </div>
  );
}

const AbandonBtn = styled(LinkBtn)`
  margin-top: 20px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted2};
  font-size: 14px;

  &:hover {
    color: ${({ theme }) => theme.colors.bloodBright};
  }
`;

import { keyframes, styled } from "styled-components"
import { Check, Mic, X } from "lucide-react"
import type { Locale, PersonalityTag, ServedInteractiveState } from "@shared/types"
import { t } from "../../i18n/strings"
import { LinkBtn } from "../ui/Button"
import { AchIcon } from "../AchIcon"

// The served press view. `options` are { id, icon, tag } — the button label is
// the familiar personality_tag_<Tag> i18n string, matching how debate cards
// render their tag.
type PressView = Extract<ServedInteractiveState, { game: "press_conference" }>

interface Props {
  locale: Locale
  view: PressView
  busy: boolean
  onAnswer: (index: number) => void
  onContinue?: () => void
}

const RESULT_KEYS = {
  player_win: "pressResultWin",
  partial: "pressResultPartial",
  player_lose: "pressResultLose",
} as const

export function PressConferenceGame({ locale, view, busy, onAnswer, onContinue }: Props) {
  const question = view.questions[view.index]
  const resultKey = view.over && view.result !== "playing" ? RESULT_KEYS[view.result] : null
  const tone = view.over
    ? view.result === "player_win"
      ? "win"
      : view.result === "player_lose"
        ? "lose"
        : "mixed"
    : null
  return (
    <Game>
      <Step>
        <Mic size={14} strokeWidth={2} aria-hidden="true" />
        <span>
          {t(locale, "pressQuestion")} {Math.min(view.index + 1, view.questions.length)} /{" "}
          {view.questions.length}
        </span>
      </Step>

      {question && !view.over && (
        <>
          <Prompt>{question.prompt}</Prompt>
          <Options>
            {question.options.map((op, i) => (
              <Option key={op.id} type="button" disabled={busy} onClick={() => onAnswer(i)}>
                {op.icon && <AchIcon name={op.icon} size={18} />}
                <OptLabel>{t(locale, `personality_tag_${op.tag}`)}</OptLabel>
              </Option>
            ))}
          </Options>
        </>
      )}

      {view.over && resultKey && (
        <ResultCard $tone={tone ?? "mixed"}>
          <ResultLede>{t(locale, resultKey)}</ResultLede>
          <Transcript>
            <TranscriptTitle>{t(locale, "pressTranscript")}</TranscriptTitle>
            {view.answers.map((ans, i) => {
              const tag = view.questions[i]?.options[ans]?.tag as PersonalityTag | undefined
              const hit = view.revealed[i]
              // what the interviewer wanted on this question — only revealed
              // for misses, and only after that question has been answered.
              const wantedIndex = view.wanted[i]
              const wantedTag =
                wantedIndex != null
                  ? (view.questions[i]?.options[wantedIndex]?.tag as PersonalityTag | undefined)
                  : undefined
              return (
                <TranscriptRow key={i} $hit={hit}>
                  {hit === true ? (
                    <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                  ) : hit === false ? (
                    <X size={15} strokeWidth={2.5} aria-hidden="true" />
                  ) : null}
                  <RowTag>{tag ? t(locale, `personality_tag_${tag}`) : `#${ans + 1}`}</RowTag>
                  {hit === false && wantedTag && (
                    <RowWanted>
                      {t(locale, "pressWanted")}: {t(locale, `personality_tag_${wantedTag}`)}
                    </RowWanted>
                  )}
                </TranscriptRow>
              )
            })}
          </Transcript>
          {onContinue && (
            <ContinueBtn type="button" onClick={onContinue}>
              {t(locale, "minigameContinue")}
            </ContinueBtn>
          )}
        </ResultCard>
      )}
    </Game>
  )
}

const Game = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
`

const Step = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: 999px;
  font-size: 13px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
`

const Prompt = styled.p`
  margin: 0;
  max-width: 560px;
  text-align: center;
  font-size: 19px;
  font-style: italic;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.parchment};
  padding: 18px 22px;
  border-left: 3px solid ${({ theme }) => theme.colors.gold};
  border-radius: 0 ${({ theme }) => theme.radii.sm} ${({ theme }) => theme.radii.sm} 0;
  background: linear-gradient(90deg, rgba(201, 164, 76, 0.08), rgba(201, 164, 76, 0.02));
`

const Options = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  gap: 12px;
  width: min(480px, 100%);

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`

const Option = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: ${({ theme }) => theme.colors.ink2};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.lg};
  color: ${({ theme }) => theme.colors.parchment};
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.12s,
    box-shadow 0.15s;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gold};
    background: ${({ theme }) => theme.colors.panel2};
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(201, 164, 76, 0.12);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`

const OptLabel = styled.span`
  font-size: 15px;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.parchmentDim};
`

const TONE: Record<string, { color: string; bg: string }> = {
  win: { color: "#6f8f6a", bg: "rgba(111, 143, 106, 0.08)" },
  mixed: { color: "#c9a44c", bg: "rgba(201, 164, 76, 0.08)" },
  lose: { color: "#c85a5a", bg: "rgba(200, 90, 90, 0.08)" },
}

const revealIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`

const ResultCard = styled.div<{ $tone: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: min(480px, 100%);
  padding: 24px 22px;
  border: 1px solid ${({ $tone }) => TONE[$tone].color};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ $tone }) => TONE[$tone].bg};
  animation: ${revealIn} 0.3s ease both;
`

const ResultLede = styled.div`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.parchment};
`

const Transcript = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
`

const TranscriptTitle = styled.li`
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
`

const HIT_TONE: Record<string, { color: string; bg: string }> = {
  true: { color: "#6f8f6a", bg: "rgba(111, 143, 106, 0.12)" },
  false: { color: "#c85a5a", bg: "rgba(200, 90, 90, 0.1)" },
  null: { color: "#9c8f74", bg: "rgba(156, 143, 116, 0.06)" },
}

const TranscriptRow = styled.li<{ $hit: boolean | null }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border: 1px solid ${({ $hit }) => HIT_TONE[String($hit)].color};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $hit }) => HIT_TONE[String($hit)].bg};
  color: ${({ theme }) => theme.colors.parchment};
`

const RowTag = styled.span`
  font-size: 15px;
  letter-spacing: 0.04em;
`

const RowWanted = styled.span`
  margin-left: auto;
  font-size: 12px;
  font-style: italic;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.muted};
`

const ContinueBtn = styled(LinkBtn)`
  padding: 12px 34px;
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 17px;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.parchmentDim};

  &:hover {
    border-color: ${({ theme }) => theme.colors.gold};
    color: ${({ theme }) => theme.colors.goldBright};
    background: rgba(201, 164, 76, 0.06);
  }
`

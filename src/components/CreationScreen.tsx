import { useEffect, useState } from "react"
import { styled } from "styled-components"
import type { Gender, Locale, Origin, RunType } from "@shared/types"
import { api, type ArchetypeView, type ClassInfo } from "../api"
import { t } from "../i18n/strings"
import { STAT_ABBR } from "../constants"
import { AchIcon } from "./AchIcon"
import { ArchetypeStep } from "./ArchetypeStep"
import { BtnPrimary } from "./ui/Button"
import { TextPretty } from "./ui/Text"
import { GradientText } from "./ui/GradientText"
import { Tooltip } from "./ui/Tooltip"
import { rise } from "./ui/Animation"

interface Props {
  locale: Locale
  onStart: (
    name: string,
    gender: Gender,
    classId: string,
    runType: RunType,
    origin: Origin,
  ) => Promise<void>
  onStartWithArchetype: (
    name: string,
    gender: Gender,
    classId: string,
    archetypeId: string,
    runType: RunType,
    origin: Origin,
  ) => Promise<void>
}

type Step = "form" | "archetype"

export function CreationScreen({ locale, onStart, onStartWithArchetype }: Props) {
  const [step, setStep] = useState<Step>("form")
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [dailySeed, setDailySeed] = useState("")
  const [name, setName] = useState("")
  const [gender, setGender] = useState<Gender>("male")
  const [classId, setClassId] = useState<string | null>(null)
  const [runType, setRunType] = useState<RunType>("standard")
  const [origin, setOrigin] = useState<Origin>("humble")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [archetypes, setArchetypes] = useState<ArchetypeView[]>([])

  useEffect(() => {
    let active = true
    api
      .classes(locale)
      .then((res) => {
        if (!active) return
        setClasses(res.classes)
        setDailySeed(res.dailySeed)
      })
      .catch((e) => active && setError(String(e.message)))
    return () => {
      active = false
    }
  }, [locale])

  async function begin() {
    if (!classId || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.drawArchetypes({ classId, locale, gender })
      setArchetypes(res.archetypes)
      setStep("archetype")
    } catch (err) {
      console.error("Failed to draw archetypes:", err)
      // Fallback: if archetype-draw fails, skip straight to game with no archetype.
      await onStart(name.trim() || "Wanderer", gender, classId, runType, origin)
    } finally {
      setBusy(false)
    }
  }

  async function pickArchetype(archetypeId: string) {
    if (!classId || busy) return
    setBusy(true)
    setError(null)
    try {
      await onStartWithArchetype(
        name.trim() || "Wanderer",
        gender,
        classId,
        archetypeId,
        runType,
        origin,
      )
    } catch (e) {
      setError(String((e as Error).message))
      setBusy(false)
    }
  }

  function goBack() {
    setStep("form")
    setError(null)
  }

  if (step === "archetype") {
    return (
      <CreationScreenRoot>
        <ArchetypeStep
          locale={locale}
          archetypes={archetypes}
          onPick={pickArchetype}
          onBack={goBack}
          busy={busy}
        />
        {error && <FormError>{error}</FormError>}
      </CreationScreenRoot>
    )
  }

  return (
    <CreationScreenRoot>
      <CreationHero>
        <h1>
          <GradientText>{t(locale, "newLife")}</GradientText>
        </h1>
        <Subtitle>{t(locale, "subtitle")}</Subtitle>
      </CreationHero>

      <CreationBlock>
        <BlockLabel htmlFor="hero-name">{t(locale, "chooseName")}</BlockLabel>
        <NameInput
          id="hero-name"
          value={name}
          maxLength={24}
          placeholder={t(locale, "namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
        />
      </CreationBlock>

      <CreationBlock>
        <BlockLabel as="span">{t(locale, "chooseGender")}</BlockLabel>
        <GenderOptions role="group" aria-label={t(locale, "chooseGender")}>
          <GenderPill
            type="button"
            $active={gender === "male"}
            onClick={() => setGender("male")}
            aria-pressed={gender === "male"}
          >
            {t(locale, "genderMale")}
          </GenderPill>
          <GenderPill
            type="button"
            $active={gender === "female"}
            onClick={() => setGender("female")}
            aria-pressed={gender === "female"}
          >
            {t(locale, "genderFemale")}
          </GenderPill>
        </GenderOptions>
      </CreationBlock>

      <CreationBlock>
        <BlockLabel as="span">{t(locale, "chooseClass")}</BlockLabel>
        <ClassGrid>
          {classes.map((c) => (
            <ClassCard
              key={c.id}
              type="button"
              $selected={classId === c.id}
              onClick={() => setClassId(c.id)}
              aria-pressed={classId === c.id}
            >
              <ClassIcon>
                <AchIcon name={c.icon} size={26} />
              </ClassIcon>
              <h3>{c.name}</h3>
              <ClassDesc>{c.description}</ClassDesc>
              <StatRow>
                {Object.entries(c.base).map(([k, v]) => (
                  <Tooltip key={k} content={t(locale, `tooltip_stat_${k}`)}>
                    <StatChip>
                      <em>{t(locale, STAT_ABBR[k])}</em> {v}
                    </StatChip>
                  </Tooltip>
                ))}
                <Tooltip content={t(locale, "tooltip_gold")}>
                  <GoldChip>
                    <em>{t(locale, "gold")}</em> {c.startingGold}
                  </GoldChip>
                </Tooltip>
              </StatRow>
            </ClassCard>
          ))}
        </ClassGrid>
      </CreationBlock>

      <CreationBlock>
        <BlockLabel as="span">{t(locale, "runMode")}</BlockLabel>
        <RunModes>
          <ModePill
            type="button"
            $active={runType === "standard"}
            onClick={() => setRunType("standard")}
          >
            <strong>{t(locale, "standard")}</strong>
            <span>{t(locale, "standardHint")}</span>
          </ModePill>
          <ModePill type="button" $active={runType === "daily"} onClick={() => setRunType("daily")}>
            <strong>{t(locale, "daily")}</strong>
            <span>
              {t(locale, "dailyHint")}
              {dailySeed ? ` (${dailySeed})` : ""}
            </span>
          </ModePill>
        </RunModes>
      </CreationBlock>

      <CreationBlock>
        <BlockLabel as="span">{t(locale, "chooseOrigin")}</BlockLabel>
        <RunModes>
          <ModePill type="button" $active={origin === "humble"} onClick={() => setOrigin("humble")}>
            <strong>{t(locale, "originHumble")}</strong>
            <span>{t(locale, "originHumbleHint")}</span>
          </ModePill>
          <ModePill
            type="button"
            $active={origin === "established"}
            onClick={() => setOrigin("established")}
          >
            <strong>{t(locale, "originEstablished")}</strong>
            <span>{t(locale, "originEstablishedHint")}</span>
          </ModePill>
        </RunModes>
      </CreationBlock>

      {error && <FormError>{error}</FormError>}

      <BeginBtn type="button" disabled={!classId || busy || !name.trim()} onClick={begin}>
        {busy ? t(locale, "loading") : t(locale, "begin")}
      </BeginBtn>
    </CreationScreenRoot>
  )
}

const CreationScreenRoot = styled.div`
  animation: ${rise} 0.4s ease both;
`

const CreationHero = styled.header`
  text-align: center;
  margin: 18px 0 26px;

  h1 {
    font-size: clamp(31px, 5vw, 47px);
    color: ${({ theme }) => theme.colors.goldBright};
  }
`

const Subtitle = styled(TextPretty)`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  font-size: 19px;
  margin-top: 8px;
`

const CreationBlock = styled.section`
  margin-bottom: 24px;
`

const BlockLabel = styled.label`
  display: block;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 15px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 12px;
`

const NameInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 14px 16px;
  color: ${({ theme }) => theme.colors.parchment};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 21px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted2};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.gold};
    box-shadow: 0 0 0 3px rgba(201, 164, 76, 0.15);
  }
`

const ClassGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`

const ClassCard = styled.button<{ $selected: boolean }>`
  text-align: left;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel} 0%,
    ${({ theme }) => theme.colors.ink2} 100%
  );
  border: 1px solid ${({ $selected, theme }) => ($selected ? theme.colors.gold : theme.colors.line)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 18px 16px;
  transition:
    border-color 0.15s,
    transform 0.15s,
    box-shadow 0.15s;
  box-shadow: ${({ $selected }) =>
    $selected ? "0 0 0 1px #c9a44c, 0 12px 30px rgba(0, 0, 0, 0.5)" : "none"};

  &:hover {
    border-color: ${({ theme }) => theme.colors.line2};
    transform: translateY(-2px);
  }

  h3 {
    color: ${({ theme }) => theme.colors.goldBright};
    font-size: 22px;
    margin-bottom: 6px;
  }
`

const ClassIcon = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 10px;
`

const ClassDesc = styled(TextPretty)`
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 17px;
  min-height: 48px;
`

const StatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
`

const StatChip = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line};
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.parchment};

  em {
    font-style: normal;
    color: ${({ theme }) => theme.colors.muted};
    font-size: 12px;
    letter-spacing: 0.06em;
  }
`

const GoldChip = styled(StatChip)`
  border-color: rgba(201, 164, 76, 0.4);
  color: ${({ theme }) => theme.colors.goldBright};
`

const RunModes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`

const ModePill = styled.button<{ $active: boolean }>`
  text-align: left;
  background: ${({ $active, theme }) => ($active ? theme.colors.ink2 : theme.colors.ink2)};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.gold : theme.colors.line)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 16px;
  color: ${({ $active, theme }) => ($active ? theme.colors.parchment : theme.colors.parchmentDim)};
  font-size: 17px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  box-shadow: ${({ $active }) => ($active ? "0 0 0 1px #c9a44c" : "none")};
  cursor: pointer;

  strong {
    display: block;
    font-family: ${({ theme }) => theme.fonts.display};
    color: ${({ $active, theme }) => ($active ? theme.colors.goldBright : theme.colors.parchment)};
    font-size: 18px;
    margin-bottom: 4px;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 16px;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.line2};
  }
`

const GenderOptions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`

const GenderPill = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.colors.ink2 : theme.colors.ink2)};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.gold : theme.colors.line)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 12px 14px;
  color: ${({ $active, theme }) => ($active ? theme.colors.goldBright : theme.colors.parchmentDim)};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 16px;
  letter-spacing: 0.04em;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  box-shadow: ${({ $active }) => ($active ? "0 0 0 1px #c9a44c" : "none")};
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.line2};
  }
`

const FormError = styled.p`
  color: ${({ theme }) => theme.colors.bloodBright};
  font-size: 16px;
  margin-top: 8px;
`

const BeginBtn = styled(BtnPrimary)`
  margin-top: 26px;
  width: 100%;
  padding: 16px;
  font-size: 19px;
  text-transform: uppercase;
`

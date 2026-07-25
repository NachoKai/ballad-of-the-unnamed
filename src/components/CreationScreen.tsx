import { useEffect, useState } from "react";
import { styled, keyframes } from "styled-components";
import type { Locale, RunType } from "@shared/types";
import { api, type ClassInfo } from "../api";
import { t } from "../i18n/strings";
import { BtnPrimary } from "./ui/Button"
import { TextBalance, TextPretty } from "./ui/Text";

interface Props {
  locale: Locale;
  onStart: (name: string, classId: string, runType: RunType) => Promise<void>;
}

const STAT_ABBR: Record<string, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  charisma: "CHA",
};

export function CreationScreen({ locale, onStart }: Props) {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [dailySeed, setDailySeed] = useState("");
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<string | null>(null);
  const [runType, setRunType] = useState<RunType>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .classes(locale)
      .then(res => {
        if (!active) return;
        setClasses(res.classes);
        setDailySeed(res.dailySeed);
      })
      .catch(e => active && setError(String(e.message)));
    return () => {
      active = false;
    };
  }, [locale]);

  async function begin() {
    if (!classId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onStart(name.trim() || "Wanderer", classId, runType);
    } catch (e) {
      setError(String((e as Error).message));
      setBusy(false);
    }
  }

  return (
    <CreationScreenRoot>
      <CreationHero>
        <h1>{t(locale, "newLife")}</h1>
        <Subtitle>{t(locale, "subtitle")}</Subtitle>
      </CreationHero>

      <CreationBlock>
        <BlockLabel htmlFor="hero-name">{t(locale, "chooseName")}</BlockLabel>
        <NameInput
          id="hero-name"
          value={name}
          maxLength={24}
          placeholder={t(locale, "namePlaceholder")}
          onChange={e => setName(e.target.value)}
        />
      </CreationBlock>

      <CreationBlock>
        <BlockLabel as="span">{t(locale, "chooseClass")}</BlockLabel>
        <ClassGrid>
          {classes.map(c => (
            <ClassCard
              key={c.id}
              type="button"
              $selected={classId === c.id}
              onClick={() => setClassId(c.id)}
              aria-pressed={classId === c.id}
            >
              <h3>{c.name}</h3>
              <ClassDesc>{c.description}</ClassDesc>
              <StatRow>
                {Object.entries(c.base).map(([k, v]) => (
                  <StatChip key={k}>
                    <em>{STAT_ABBR[k] ?? k}</em> {v}
                  </StatChip>
                ))}
                <GoldChip>
                  <em>{t(locale, "gold")}</em> {c.startingGold}
                </GoldChip>
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
          <ModePill
            type="button"
            $active={runType === "daily"}
            onClick={() => setRunType("daily")}
          >
            <strong>{t(locale, "daily")}</strong>
            <span>
              {t(locale, "dailyHint")}
              {dailySeed ? ` (${dailySeed})` : ""}
            </span>
          </ModePill>
        </RunModes>
      </CreationBlock>

      {error && <FormError>{error}</FormError>}

      <BeginBtn type="button" disabled={!classId || busy} onClick={begin}>
        {busy ? t(locale, "loading") : t(locale, "begin")}
      </BeginBtn>
    </CreationScreenRoot>
  );
}

const rise = keyframes`
  from { opacity: 0; transform: translateY(10px); }
`;

const CreationScreenRoot = styled.div`
  animation: ${rise} 0.4s ease both;
`;

const CreationHero = styled.header`
  text-align: center;
  margin: 18px 0 26px;

  h1 {
    font-size: clamp(30px, 5vw, 46px);
    color: ${({ theme }) => theme.colors.goldBright};
  }
`;

const Subtitle = styled(TextPretty)`
  color: ${({ theme }) => theme.colors.muted};
  font-style: italic;
  font-size: 18px;
  margin-top: 8px;
`;

const CreationBlock = styled.section`
  margin-bottom: 24px;
`;

const BlockLabel = styled.label`
  display: block;
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 14px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.gold};
  margin-bottom: 12px;
`;

const NameInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.colors.ink3};
  border: 1px solid ${({ theme }) => theme.colors.line2};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 14px 16px;
  color: ${({ theme }) => theme.colors.parchment};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 20px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted2};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.gold};
    box-shadow: 0 0 0 3px rgba(201, 164, 76, 0.15);
  }
`;

const ClassGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const ClassCard = styled.button<{ $selected: boolean }>`
  text-align: left;
  background: linear-gradient(
    180deg,
    ${({ theme }) => theme.colors.panel} 0%,
    ${({ theme }) => theme.colors.ink2} 100%
  );
  border: 1px solid
    ${({ $selected, theme }) => ($selected ? theme.colors.gold : theme.colors.line)};
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
    font-size: 21px;
    margin-bottom: 6px;
  }
`;

const ClassDesc = styled(TextPretty)`
  color: ${({ theme }) => theme.colors.parchmentDim};
  font-size: 16px;
  min-height: 48px;
`;

const StatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
`;

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
    font-size: 11px;
    letter-spacing: 0.06em;
  }
`;

const GoldChip = styled(StatChip)`
  border-color: rgba(201, 164, 76, 0.4);
  color: ${({ theme }) => theme.colors.goldBright};
`;

const RunModes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const ModePill = styled.button<{ $active: boolean }>`
  text-align: left;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.ink2 : theme.colors.ink2};
  border: 1px solid
    ${({ $active, theme }) => ($active ? theme.colors.gold : theme.colors.line)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 16px;
  color: ${({ $active, theme }) =>
    $active ? theme.colors.parchment : theme.colors.parchmentDim};
  font-size: 16px;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
  box-shadow: ${({ $active }) => ($active ? "0 0 0 1px #c9a44c" : "none")};
  cursor: pointer;

  strong {
    display: block;
    font-family: ${({ theme }) => theme.fonts.display};
    color: ${({ $active, theme }) =>
      $active ? theme.colors.goldBright : theme.colors.parchment};
    font-size: 17px;
    margin-bottom: 4px;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 15px;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.line2};
  }
`;

const FormError = styled.p`
  color: ${({ theme }) => theme.colors.bloodBright};
  font-size: 15px;
  margin-top: 8px;
`;

const BeginBtn = styled(BtnPrimary)`
  margin-top: 26px;
  width: 100%;
  padding: 16px;
  font-size: 18px;
`;

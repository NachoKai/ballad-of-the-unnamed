// Shared domain types used by both the Express server and the React client.

export type Locale = "en" | "es";

// Every player-facing string in content is authored as a locale map so Spanish
// can be added later without touching game logic. See i18n section of the spec.
export type LocaleMap = Record<Locale, string>;

export const STAT_KEYS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "charisma",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export type StatDeltas = Partial<Record<StatKey, number>>;

export const PERSONALITY_TAGS = [
  "Humble",
  "Cocky",
  "Confident",
  "Professional",
  "Aggressive",
  "Funny",
  "Supportive",
  "Strategic",
  "Stoic",
  "Leader",
] as const;
export type PersonalityTag = (typeof PERSONALITY_TAGS)[number];

export type Rarity = "common" | "uncommon" | "rare" | "volatile";

export type Momentum = "rising" | "normal" | "falling";

export type CharacterStatus = "alive" | "retired" | "dead";

export type EndingType =
  | "heroic_death"
  | "peaceful_retirement"
  | "other_death"
  | "other_retirement";

export type RunType = "standard" | "daily";

// ---- Content bank shapes (authored as data, loaded into server memory) ----

export interface ChoiceContent {
  id: string;
  label: LocaleMap;
  tag?: PersonalityTag;
  rarity: Rarity;
  outcome?: "good" | "risky" | "neutral" | "bad";
  statDeltas?: StatDeltas;
  tradeoffDeltas?: StatDeltas; // negative, only on volatile / some rare
  goldDelta?: number;
  fameDelta?: number;
  staminaDelta?: number;
  reputationDelta?: number;
  reputationFaction?: string;
  healthDelta?: number;
  injuryRiskDelta?: number;
  countersDelta?: Record<string, number>;
  countersReset?: string[];
  narrative: LocaleMap;
  // If present, choosing this card offers retirement (age-gated event only).
  retire?: boolean;
}

export type OutcomeTier = "critical" | "success" | "partial" | "fail";

export interface MinigameCard {
  id: string;
  icon: string;
  label: LocaleMap;
}

export interface MinigameOutcome {
  statDeltas?: StatDeltas;
  goldDelta?: number;
  fameDelta?: number;
  reputationDelta?: number;
  reputationFaction?: string;
  injuryRiskDelta?: number;
  countersDelta?: Record<string, number>;
  countersReset?: string[];
  narrative: LocaleMap;
}

export interface MinigameResolution {
  type: "weighted_hidden_match";
  baseWinChance: number;
  statInfluence: Partial<Record<StatKey, number>>;
  cardModifiers?: Record<string, { winChanceDelta?: number; critChanceDelta?: number }>;
}

export interface EventContent {
  id: string;
  type?: "event" | "minigame";
  subtype?: string;
  minAge: number;
  maxAge: number;
  requiresClass?: string | null;
  requiresTags?: PersonalityTag[];
  excludeIfCompletedIds?: string[];
  weight: number;
  location?: string;
  narrative: LocaleMap;
  // Regular events use choices; minigames use cards + resolution + outcomes.
  choices?: ChoiceContent[];
  cards?: MinigameCard[];
  resolution?: MinigameResolution;
  outcomes?: Record<OutcomeTier, MinigameOutcome>;
  primaryStat?: StatKey;
}

export interface ClassContent {
  id: string;
  name: LocaleMap;
  description: LocaleMap;
  base: Record<StatKey, number>;
  startingGold: number;
  startingFaction?: string;
}

export type AchievementCondition =
  | { type: "counter_gte"; key: string; value: number }
  | { type: "gold_gte"; value: number }
  | { type: "fame_gte"; value: number }
  | { type: "stat_gte"; stat: StatKey; value: number }
  | { type: "age_gte"; value: number }
  | { type: "score_gte"; value: number }
  | { type: "reputation_gte"; value: number }
  | { type: "reputation_lte"; value: number }
  | { type: "rare_cards_gte"; value: number }
  | { type: "legendary_cards_gte"; value: number }
  | { type: "ending"; value: string };

export interface AchievementContent {
  id: string;
  icon: string;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  condition: AchievementCondition;
  name: LocaleMap;
  description: LocaleMap;
  hidden?: boolean;
}

export interface SlotPools {
  [poolName: string]: LocaleMap[];
}

// ---- Runtime / API shapes ----

export interface CharacterState {
  id: string;
  name: string;
  class: string;
  age: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  charisma: number;
  stamina: number;
  health: number;
  fame: number;
  gold: number;
  momentum: Momentum;
  status: CharacterStatus;
  locale: Locale;
  turn: number;
  powerLevel: number;
  counters: Record<string, number>;
  reputations: ReputationState[];
  personality: Record<string, number>;
  achievements: string[];
}

export interface ReputationState {
  faction: string;
  value: number;
  peakValue: number;
}

// A choice as served to the client (localized, no hidden server fields leaked).
export interface ServedChoice {
  id: string;
  label: string;
  icon?: string;
  tag?: PersonalityTag;
  rarity: Rarity;
}

export interface ServedEvent {
  eventId: string;
  narrative: string;
  choices: ServedChoice[];
  isRetirementOffer: boolean;
}

export interface TurnResult {
  character: CharacterState;
  narrative: string;
  newAchievements: AchievementContent[];
  ended: boolean;
  endingType?: EndingType;
  epilogue?: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  class: string;
  finalPowerLevel: number;
  netWorth: number;
  achievementsCount: number;
  battlesWon: number;
  questsCompleted: number;
  ageAtEnd: number;
  reputationPeak: number;
  endingType: EndingType;
  score: number;
  epilogue: string;
  runType: RunType;
  createdAt: number;
}

export type LeaderboardCategory =
  | "score"
  | "net_worth"
  | "achievements_count"
  | "age_at_end"
  | "battles_won";

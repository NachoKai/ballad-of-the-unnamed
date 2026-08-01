// Shared domain types used by both the Express server and the React client.

export type Locale = "en" | "es"

// How the character is addressed in gendered languages (Spanish). Content is
// authored once; male is the default inflection, female inflects at render time.
export type Gender = "male" | "female"

// Every player-facing string in content is authored as a locale map so Spanish
// can be added later without touching game logic. See i18n section of the spec.
export type LocaleMap = Record<Locale, string>

export const STAT_KEYS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "charisma",
] as const
export type StatKey = (typeof STAT_KEYS)[number]

export type StatDeltas = Partial<Record<StatKey, number>>

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
] as const
export type PersonalityTag = (typeof PERSONALITY_TAGS)[number]

export type Rarity = "common" | "uncommon" | "rare" | "volatile"

export type Momentum = "rising" | "normal" | "falling"

export type CharacterStatus = "alive" | "retired" | "dead"

export type EndingType = "heroic_death" | "peaceful_retirement" | "other_death" | "other_retirement"

export type RunType = "standard" | "daily"

export type Arc = "child" | "adventurer" | "mercenary" | "kingdom_hero" | "legend" | "old_hero"

// Origin dial at creation: a pacing/identity choice (no stat math). Humble
// starts poor with an underdog event pool; established starts with full gold
// and a reputation head-start. See §20.
export type Origin = "humble" | "established"

// The minutes-signal on a clan offer: does joining this faction put you on the
// bench (below its level), slot you right in, or see you arrive above it?
export type RoleSignal = "up" | "same" | "bench"

export type ShopCategory = "retinue" | "consumable" | "luxury"

export type ShopEffectType =
  | "injuryRiskModifier"
  | "fatigueModifier"
  | "momentumRecoveryModifier"
  | "ageDeclineDelay"
  | "offerQualityModifier"

export interface ShopItem {
  id: string
  category: ShopCategory
  name: LocaleMap
  cost: number
  effect: { type: ShopEffectType; value: number } | null
  icon: string
  flavor: LocaleMap
  requiresArc?: Arc[]
  achievementTrigger?: string
  duration?: number
}

export interface InventoryEntry {
  itemId: string
  qty: number
  expiresAtTurn?: number | null
}

// ---- Content bank shapes (authored as data, loaded into server memory) ----

export interface RelationshipEntry {
  npcId: string
  npcRole: string // 'mentor' | 'friend' | 'love_interest' | 'nemesis' | 'child' | 'apprentice'
  npcName?: string
  affinity: number // -100 to 100
  peakAffinity: number
  lastSeenTurn: number
}

export interface RivalState {
  name: string
  class: string
  factionId: string | null
  powerLevel: number
  age: number
  location: string
  achievementsCount: number
  score: number
  lastAdvancedTurn: number
}

export interface ClanMembershipEntry {
  clanId: string
  rank: "recruit" | "trusted" | "elder" | "leader"
  joinedAtTurn: number
  leftAtTurn?: number | null
  leftReason?: string | null
}

export interface ChoiceContent {
  id: string
  label: LocaleMap
  tag?: PersonalityTag
  rarity: Rarity
  outcome?: "good" | "risky" | "neutral" | "bad"
  // §24 legibility: explicit warning surfaced on the choice card before the
  // player commits (the negotiation greed dial's risk, stated up front).
  riskLabel?: LocaleMap
  statDeltas?: StatDeltas
  tradeoffDeltas?: StatDeltas // negative, only on volatile / some rare
  goldDelta?: number
  fameDelta?: number
  staminaDelta?: number
  reputationDelta?: number
  reputationFaction?: string
  healthDelta?: number
  injuryRiskDelta?: number
  countersDelta?: Record<string, number>
  countersReset?: string[]
  narrative: LocaleMap
  // If present, choosing this card offers retirement (age-gated event only).
  retire?: boolean
  // Personality tag synergy: matching tags boost stat gains, conflicting tags penalize.
  wantedTags?: Partial<Record<PersonalityTag, number>>
  punishedTags?: Partial<Record<PersonalityTag, number>>
  // Destiny card effects: lock/unlock entire event pools when chosen.
  unlocksEventPool?: string[]
  locksEventPool?: string[]
  // NPC Relationship: introduce an NPC or modify affinity.
  introducesRelationshipId?: string
  introducesNpcRole?: string
  introducesNpcName?: LocaleMap
  affinityDelta?: number
  // Long-term flags: set a keyed marker for narrative callbacks.
  setsFlag?: Record<string, unknown>
  // Clan system: join a clan through a choice.
  joinClanId?: string
  // Faction association for display (e.g. flag icon).
  factionId?: string
  // Per-season stipend offered by a faction (clan offer cards).
  stipend?: number
  leaveReason?: string
}

export type OutcomeTier = "critical" | "success" | "partial" | "fail"

export interface MinigameCard {
  id: string
  icon: string
  label: LocaleMap
}

export interface MinigameOutcome {
  statDeltas?: StatDeltas
  goldDelta?: number
  fameDelta?: number
  reputationDelta?: number
  reputationFaction?: string
  injuryRiskDelta?: number
  countersDelta?: Record<string, number>
  countersReset?: string[]
  narrative: LocaleMap
}

export type MinigameSubtype =
  "weighted_hidden_match" | "timing_bar" | "grid_gamble" | "memory_match"

export interface MinigameResolution {
  type: MinigameSubtype
  baseWinChance: number
  statInfluence: Partial<Record<StatKey, number>>
  cardModifiers?: Record<string, { winChanceDelta?: number; critChanceDelta?: number }>
  // timing_bar: statThreshold widens the green zone (higher stat = easier).
  // grid_gamble: pure luck, no stat influence.
  // memory_match: statThreshold grants bonus lives.
  statThreshold?: number
  bonusLives?: number
}

export interface EventContent {
  id: string
  type?: "event" | "minigame" | "destiny" | "world"
  subtype?: string
  minAge: number
  maxAge: number
  requiresClass?: string | null
  requiresTags?: PersonalityTag[]
  requiresArc?: Arc[]
  excludeIfArc?: Arc[]
  excludeIfCompletedIds?: string[]
  requiresRelationshipId?: string
  requiresFlag?: Record<string, unknown>
  requiresClanId?: string
  requiresNoClan?: boolean
  requiresHuntedBy?: boolean
  requiresForeign?: boolean
  requiresHomeRegion?: boolean
  requiresRegion?: string
  requiresOrigin?: string
  excludesIfClanId?: string
  involvesRival?: boolean
  weight: number
  location?: string
  narrative: LocaleMap
  flagLabel?: LocaleMap
  worldEventHeadline?: LocaleMap
  // Regular events use choices; minigames use cards + resolution + outcomes.
  choices?: ChoiceContent[]
  cards?: MinigameCard[]
  resolution?: MinigameResolution
  outcomes?: Record<OutcomeTier, MinigameOutcome>
  primaryStat?: StatKey
}

export interface ClassContent {
  id: string
  icon: string
  name: LocaleMap
  description: LocaleMap
  base: Record<StatKey, number>
  startingGold: number
  startingFaction?: string
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
  | { type: "relationship_affinity_gte"; value: number }
  | { type: "relationship_affinity_lte"; value: number }
  | { type: "ending"; value: string }
  | { type: "status"; value: string }
  // §23: the current clan's faction must be prestigious enough (league gate).
  | { type: "faction_wealth_gte"; value: number }
  // §20: the run's origin dial and reputation at the (fixed) home faction.
  | { type: "origin"; value: Origin }
  | { type: "home_rep_gte"; value: number }
  // Compound gate: all nested conditions must pass.
  | { type: "and"; conditions: AchievementCondition[] }

export interface AchievementContent {
  id: string
  icon: string
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"
  condition: AchievementCondition
  name: LocaleMap
  description: LocaleMap
  hidden?: boolean
}

export interface ArchetypeContent {
  id: string
  icon: string
  name: LocaleMap
  flavor: LocaleMap
  statDeltas: StatDeltas
}

export type ArchetypePool = Record<string, ArchetypeContent[]>

export interface FactionContent {
  id: string
  name: LocaleMap
  // Relative size/wealth of the faction (1-10). Drives signing gold and the
  // per-season stipend members receive — richer factions pay more.
  wealth: number
  // Region the faction calls home (see content/regions.json). Drives the
  // Abroad/Home identity and region-gated event variants (§19, §21).
  region: string
}

export interface SlotPools {
  [poolName: string]: LocaleMap[]
}

// ---- Runtime / API shapes ----

export interface CharacterState {
  id: string
  name: string
  gender: Gender
  class: string
  archetype: string | null
  epithet: string | null
  age: number
  currentArc: Arc
  // §19 identity axis: home faction + region are fixed forever at creation and
  // never change no matter which clan the character joins. `currentRegion`
  // tracks where they currently ply their trade (home region when solo).
  homeFactionId: string
  homeRegion: string
  currentRegion: string
  // §20 origin dial: humble (poor start, underdog pool) vs established.
  origin: Origin
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  charisma: number
  stamina: number
  health: number
  fame: number
  gold: number
  marketValue: number
  marketValuePeak: number
  momentum: Momentum
  status: CharacterStatus
  locale: Locale
  turn: number
  seasonCount: number
  powerLevel: number
  counters: Record<string, number>
  reputations: ReputationState[]
  personality: Record<string, number>
  achievements: string[]
  inventory: InventoryEntry[]
  lockedEventPools: string[]
  relationships: RelationshipEntry[]
  rival: RivalState | null
  currentClanId: string | null
  huntedBy: string | null
  huntedUntilTurn: number | null
  clanMemberships: ClanMembershipEntry[]
  flags: Record<string, unknown>
  lastEventId?: string | null
  // Consecutive turns spent at 0 stamina (forced recovery trigger).
  staminaZeroStreak?: number
  // §20 bench mechanic: while this turn is in the future, the character is
  // "riding the bench" at an over-reaching clan and stat gains are reduced.
  benchedUntilTurn?: number | null
  // Season (seasonCount) in which the last clan offer appeared. Clan offers
  // fire at most once per season; this resets automatically when seasonCount
  // advances past it.
  lastClanOfferSeason?: number | null
  pendingFinaleType?: EndingType
  finaleStage2Choice?: { endingType: EndingType; risky: boolean }
  // §24 negotiation dial: set when the player picks a clan offer, cleared once
  // the follow-up accept/negotiate choice resolves. Defers the actual join so
  // pressing for more gold can collapse the deal.
  pendingJoinOffer?: { clanId: string; signingGold: number; stipend: number } | null
  // §22 whole-arc tournament state. `mode` is chosen once at the arc's top.
  pendingTournament?: {
    mode: "luck" | "skill"
    fixturesLeft: number
    won: number
    nameKey: string
  } | null
  // §22 result stashed when the last fixture resolves; served as the honor beat.
  pendingTournamentResult?: { won: boolean; nameKey: string } | null
  // §22 season in which the last tournament arc started (at most once per cadence).
  lastTournamentSeason?: number | null
}

export interface ReputationState {
  faction: string
  value: number
  peakValue: number
}

// A choice as served to the client (localized, no hidden server fields leaked).
export interface ServedChoice {
  id: string
  label: string
  icon?: string
  tag?: PersonalityTag
  rarity: Rarity
  statDeltas?: StatDeltas
  tradeoffDeltas?: StatDeltas
  fameDelta?: number
  reputationDelta?: number
  goldDelta?: number
  // Faction association for flag icon display in choice cards.
  factionId?: string
  // Per-season stipend offered by a faction (clan offer cards).
  stipend?: number
  // §20 minutes-signal on a clan-join offer card (up/same/bench).
  roleSignal?: RoleSignal
  // §24 legibility: explicit risk warning surfaced on the choice card.
  riskLabel?: string
}

export interface ServedEvent {
  eventId: string
  narrative: string
  choices: ServedChoice[]
  isRetirementOffer: boolean
  isSeasonSummary?: boolean
  seasonHeadline?: string
  seasonGrade?: number
  worldEvents?: ServedWorldEvent[]
  rivalUpdate?: string
  isClanOffer?: boolean
  clanOfferChoices?: ServedClanOffer[]
  // Gold paid to the character this season by their faction (season summary).
  stipendEarned?: number
  flagLabel?: string
}

export interface ServedClanOffer {
  clanId: string
  name: string
  specialty: string
  signingGold: number
  // Per-season stipend if the character joins.
  stipend: number
  perkLabel: string
  icon: string
  // §20 minutes-signal: up/same/bench based on powerLevel vs faction wealth.
  roleSignal?: RoleSignal
}

export interface ServedWorldEvent {
  headline: string
  narrative: string
}

export interface RivalComparison {
  name: string
  class: string
  playerScore: number
  rivalScore: number
  playerPowerLevel: number
  rivalPowerLevel: number
  playerAchievements: number
  rivalAchievements: number
}

export interface TurnResult {
  character: CharacterState
  narrative: string
  newAchievements: AchievementContent[]
  ended: boolean
  endingType?: EndingType
  epilogue?: string
  richEpilogueData?: RichEpilogueData
}

export interface LeaderboardEntry {
  id: string
  name: string
  class: string
  finalPowerLevel: number
  netWorth: number
  achievementsCount: number
  battlesWon: number
  questsCompleted: number
  ageAtEnd: number
  reputationPeak: number
  endingType: EndingType
  score: number
  epithet?: string
  epilogue: string
  runType: RunType
  createdAt: number
}

export type LeaderboardCategory =
  "score" | "net_worth" | "achievements_count" | "age_at_end" | "battles_won"

export interface FinaleChoice {
  id: string
  label: LocaleMap
  narrative: LocaleMap
  statDeltas?: StatDeltas
  fameDelta?: number
  goldDelta?: number
  reputationDelta?: number
  reputationFaction?: string
  healthDelta?: number
}

export interface FinaleStage {
  stage: "last_chapter" | "outcome"
  narrative: LocaleMap
  choices?: FinaleChoice[]
  outcomeNarrative?: LocaleMap
}

export interface EpithetData {
  title: string
  subtitle: string
}

export interface FactionHistoryEntry {
  faction: string
  peakTier: string
  peakValue: number
}

export interface DistinctionEntry {
  id: string
  label: LocaleMap
  count: number
}

export interface RichEpilogueData {
  epithet: EpithetData
  legacyScore: number
  peakMarketValue: number
  totalGoldEarned: number
  factionHistory: FactionHistoryEntry[]
  rivalComparison: RivalComparison | null
  distinctions: DistinctionEntry[]
  lostEncounters: number
  achievements: AchievementContent[]
  score: number
}

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

// ---- Interactive minigames (multi-move, server-authoritative) ----

export type InteractiveGameKind = "tictactoe" | "rps" | "memotest"

// The five hand-signs of the goblin's game. Internal keys are language-neutral;
// the client localizes them (e.g. rock → Piedra, paper → Pergamino, scissors →
// Daga, lizard → Salamandra, spock → Mago). Rules are the classic 5-signal
// version (rock-paper-scissors-lizard-spock).
export type RpsChoice = "rock" | "paper" | "scissors" | "lizard" | "spock"
export type RpsRoundResult = "win" | "loss" | "tie"

// The eight relic faces of the memotest. Language-neutral keys — the client
// maps them to themed labels + icons (e.g. "dragon_egg" → Dragon's Egg).
export type MemotestFace =
  "dragon_egg" | "sword" | "crown" | "potion" | "phoenix" | "shield" | "scroll" | "gem"

export type TicTacToeMark = "X" | "O"
export type TicTacToeCell = TicTacToeMark | null

// Server-persisted in-progress state (stored in character.pendingMinigame).
// Language-neutral on purpose — localize at serve time, never persist prose.
export interface PendingMinigameState {
  eventId: string
  game: InteractiveGameKind
  // tictactoe:
  board?: TicTacToeCell[]
  marksPlaced?: number
  // rps:
  bestOf?: number
  playerWins?: number
  rivalWins?: number
  rivalLastChoice?: RpsChoice | null
  playerLastChoice?: RpsChoice | null
  // memotest: the 4x4 deck (8 pairs) is dealt lazily from the run Rng on the
  // first move and persisted, so resume before the first move needs no Rng.
  deck?: MemotestFace[]
  matched?: number[]
  // matched pairs split by who claimed them — the client colors the cards
  // differently so the altar reads like a shared game.
  playerMatched?: number[]
  rivalMatched?: number[]
  revealed?: number[]
  playerPairs?: number
  rivalPairs?: number
  // index -> face for every card the rival has seen (feeds its memory AI).
  rivalMemory?: Record<number, MemotestFace>
  // the last resolved player pair (misses let the rival take a turn).
  lastPlayerTurn?: { cards: number[]; matched: boolean } | null
  lastRivalTurn?: { cards: number[]; matched: boolean } | null
}

// Client-facing serialized view of a game in progress.
export type ServedInteractiveState =
  | {
      game: "tictactoe"
      board: TicTacToeCell[]
      playerMark: TicTacToeMark
      rivalMark: TicTacToeMark
      over: boolean
      result: "playing" | "player_win" | "rival_win" | "draw"
    }
  | {
      game: "rps"
      bestOf: number
      playerWins: number
      rivalWins: number
      round: number
      lastRound: { player: RpsChoice; rival: RpsChoice; result: RpsRoundResult } | null
      over: boolean
      result: "playing" | "player_win" | "rival_win"
    }
  | {
      game: "memotest"
      size: number
      pairsTotal: number
      playerPairs: number
      rivalPairs: number
      // permanently face-up card indices (matched pairs)
      matched: number[]
      // the same indices, split by who claimed each pair (colors the cards)
      playerMatched: number[]
      rivalMatched: number[]
      // indices currently face-up awaiting the second flip of the player's pair
      revealed: number[]
      // face of every currently visible card (matched ∪ revealed)
      faces: Record<number, MemotestFace>
      // the last resolved exchanges, for the verdict strips under the grid.
      // faces for these cards ride in `faces` (matched) or the turn's own map.
      lastPlayerTurn: {
        cards: number[]
        faces: Record<number, MemotestFace>
        matched: boolean
      } | null
      lastRivalTurn: {
        cards: number[]
        faces: Record<number, MemotestFace>
        matched: boolean
      } | null
      over: boolean
      result: "playing" | "player_win" | "rival_win" | "draw"
    }

// A single move the client sends to /api/game/minigame-move.
export type InteractiveMove =
  | { kind: "tictactoe"; cell: number }
  | { kind: "rps"; choice: RpsChoice }
  | { kind: "memotest"; card: number }

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
// and a reputation head-start.
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
  // What the rival is "about" this season (see RIVAL_FOCUSES in config).
  // Optional so old persisted runs without a focus still load cleanly.
  focusId?: string
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
  // Legibility: explicit warning surfaced on the choice card before the
  // player commits (the negotiation greed dial's risk, stated up front).
  riskLabel?: LocaleMap
  // Stat gating: the choice stays visible but locked unless the character's
  // stat meets the minimum. Server rejects locked picks regardless of client.
  requiresStat?: { stat: StatKey; min: number }
  // Liability: shady choices and grave outcomes add to the "Expediente" —
  // what the realm knows of your darker deeds. Clamped 0..liabilityMax.
  liabilityDelta?: number
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

// What kind of season-end capstone a minigame is (Puntero's "ELEGÍ UNA URNA"
// vs "DEBATE CARA A CARA"). Drives the client's capstone frame + summary block.
export type CapstoneKind = "debate" | "election"

// The verdict of a resolved season-end capstone, surfaced on the season
// summary: the tier, the localized "BUENA +3" / "MALA −4" label, and the grade
// swing applied to that season's grade.
export interface CapstoneResult {
  kind: CapstoneKind
  tier: OutcomeTier
  verdict: string
  gradeDelta: number
}

export interface MinigameCard {
  id: string
  icon: string
  label: LocaleMap
  // Urn mechanic: picking a trapped card forces the fail tier regardless of
  // the hidden variable. Authored per event (never rolled) so daily runs stay
  // deterministic. Never served to the client — only `hasTraps` is, so the
  // trap's identity stays hidden until the reveal.
  trap?: boolean
  // Personality alignment (debate cards): the tag this response embodies.
  tag?: PersonalityTag
  // Personality tag synergy: matching tags boost the hidden roll, conflicting
  // tags penalize it. Same semantics as ChoiceContent.wantedTags/punishedTags,
  // reused by the capstone debate minigames.
  wantedTags?: Partial<Record<PersonalityTag, number>>
  punishedTags?: Partial<Record<PersonalityTag, number>>
}

export interface MinigameOutcome {
  statDeltas?: StatDeltas
  goldDelta?: number
  fameDelta?: number
  reputationDelta?: number
  reputationFaction?: string
  injuryRiskDelta?: number
  // Liability: a failed roll or grave outcome can stain the record.
  liabilityDelta?: number
  countersDelta?: Record<string, number>
  countersReset?: string[]
  narrative: LocaleMap
  // Season-end capstone: localized verdict surfaced after picking (e.g.
  // "BUENA +3" / "MALA −4") and the grade swing applied to the season summary.
  verdict?: LocaleMap
  gradeDelta?: number
}

export type MinigameSubtype =
  "weighted_hidden_match" | "timing_bar" | "grid_gamble" | "memory_match" | "interactive"

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
  // interactive minigames (type: "interactive"):
  game?: InteractiveGameKind
  bestOf?: number // rps: target round wins to take the match (default 3)
  rivalSkill?: number // 0..1 rival competence; higher player primaryStat lowers it
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
  // Liability gate: dark-path events only appear once the character's
  // liability ("Expediente") reaches the minimum.
  requiresLiability?: { min: number }
  // Season-end capstone: this minigame is served on the turn before the
  // season summary instead of a random event. Its outcome surfaces a verdict
  // and moves the season grade.
  isCapstone?: boolean
  capstoneKind?: CapstoneKind
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
  // interactive minigame: the opponent's name shown in the game frame.
  opponent?: LocaleMap
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
  // the current clan's faction must be prestigious enough (league gate).
  | { type: "faction_wealth_gte"; value: number }
  // the run's origin dial and reputation at the (fixed) home faction.
  | { type: "origin"; value: Origin }
  | { type: "home_rep_gte"; value: number }
  // liability ("Expediente") thresholds — clean vs. known in the underworld.
  | { type: "liability_gte"; value: number }
  | { type: "liability_lte"; value: number }
  // only true on the final achievement pass (run ended) — gates
  // end-of-life achievements like a clean-conscience finish.
  | { type: "run_ended" }
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
  // Hidden "master" archetypes: one per class, stronger than every normal
  // archetype (+12 vs +8), invisible until the player finishes a run with the
  // class. The server never serves them unlocked unless the client proves the
  // class is in its unlock set (client-side localStorage — no accounts exist).
  hidden?: boolean
}

export type ArchetypePool = Record<string, ArchetypeContent[]>

export interface FactionContent {
  id: string
  name: LocaleMap
  // Relative size/wealth of the faction (1-10). Drives signing gold and the
  // per-season stipend members receive — richer factions pay more.
  wealth: number
  // Region the faction calls home (see content/regions.json). Drives the
  // Abroad/Home identity and region-gated event variants.
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
  // identity axis: home faction + region are fixed forever at creation and
  // never change no matter which clan the character joins. `currentRegion`
  // tracks where they currently ply their trade (home region when solo).
  homeFactionId: string
  homeRegion: string
  currentRegion: string
  // origin dial: humble (poor start, underdog pool) vs established.
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
  // Liability ("Expediente"): starts at 0; shady choices accrue it, slow
  // natural decay per season. High liability gates the underworld's attention.
  liability: number
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
  // bench mechanic: while this turn is in the future, the character is
  // "riding the bench" at an over-reaching clan and stat gains are reduced.
  benchedUntilTurn?: number | null
  // Season (seasonCount) in which the last clan offer appeared. Clan offers
  // fire at most once per season; this resets automatically when seasonCount
  // advances past it.
  lastClanOfferSeason?: number | null
  pendingFinaleType?: EndingType
  finaleStage2Choice?: { endingType: EndingType; risky: boolean }
  // negotiation dial: set when the player picks a clan offer, cleared once
  // the follow-up accept/negotiate choice resolves. Defers the actual join so
  // pressing for more gold can collapse the deal.
  pendingJoinOffer?: { clanId: string; signingGold: number; stipend: number } | null
  // whole-arc tournament state. `mode` is chosen once at the arc's top.
  pendingTournament?: {
    mode: "luck" | "skill"
    fixturesLeft: number
    won: number
    nameKey: string
  } | null
  // result stashed when the last fixture resolves; served as the honor beat.
  pendingTournamentResult?: { won: boolean; nameKey: string } | null
  // season in which the last tournament arc started (at most once per cadence).
  lastTournamentSeason?: number | null
  // season-end capstone result, set when the capstone minigame resolves and
  // consumed by the following season summary. Cleared when the summary resolves.
  pendingCapstoneResult?: CapstoneResult | null
  // in-progress interactive minigame state, persisted across moves/reloads.
  pendingMinigame?: PendingMinigameState | null
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
  // Minutes-signal on a clan-join offer card (up/same/bench).
  roleSignal?: RoleSignal
  // Legibility: explicit risk warning surfaced on the choice card.
  riskLabel?: string
  // Stat gating surfaced to the client: the requirement and whether the
  // current character meets it (locked choices render dimmed + disabled).
  requiresStat?: { stat: StatKey; min: number }
  statMet?: boolean
  // Liability delta surfaced so the card can warn of a stained record.
  liabilityDelta?: number
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
  // Urn mechanic: true when this minigame's card set contains a trap. Lets
  // the client hint at danger (iconography only) without revealing which card.
  hasTraps?: boolean
  // Season-end capstone: this event is a capstone minigame (debate/election)
  // and its kind drives the client's showdown frame.
  isCapstone?: boolean
  capstoneKind?: CapstoneKind
  // Season summary: the resolved capstone's verdict shown as a set-piece block.
  capstoneResult?: CapstoneResult
  // Gold paid to the character this season by their faction (season summary).
  stipendEarned?: number
  flagLabel?: string
  // Interactive minigame: a multi-move game frame instead of a card grid.
  // When present, `choices` is empty and the client renders a game component.
  interactive?: {
    game: InteractiveGameKind
    opponentName: string
    view: ServedInteractiveState
  }
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
  // Bench mechanic: up/same/bench based on powerLevel vs faction wealth.
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

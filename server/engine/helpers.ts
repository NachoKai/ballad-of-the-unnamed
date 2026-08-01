import type {
  CharacterState,
  EventContent,
  Locale,
  LocaleMap,
  Rarity,
  RelationshipEntry,
  RoleSignal,
  ServedChoice,
  ServedEvent,
  StatKey,
} from "../../shared/types.js"
import { STAT_KEYS } from "../../shared/types.js"
import type { Rng } from "../../shared/rng.js"
import type { ContentRegistry } from "../content/registry.js"
import { reputationTierId, affinityTierId, GAME_CONFIG, rarityRank } from "../../shared/config.js"
import { genderize } from "../../shared/genderize.js"

// Fill {slot:pool} placeholders in a narrative string deterministically.
// The same rng sequence + same seed => identical filled text for daily mode.
export function fillSlots(
  text: string,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
  character?: CharacterState,
): string {
  // Gender-inflect player-referential Spanish words BEFORE slots are filled so
  // NPC/group text pulled from slot pools is never regendered with the player.
  // Runs without a stored gender (old saves) default to masculine.
  const gendered = character && locale === "es" ? genderize(text, character.gender) : text
  // Supports both {poolName} and {slot:poolName} placeholder styles.
  return gendered.replace(/\{(?:slot:)?([a-zA-Z_]+)\}/g, (_m, pool: string) => {
    // {rivalName} is special: substituted with the actual run's rival, not a pool.
    if (pool === "rivalName") {
      return character?.rival?.name ?? "your rival"
    }
    const entries = registry.slots[pool]
    if (!entries || entries.length === 0) return pool
    const chosen = rng.pick(entries)
    return chosen[locale] ?? chosen.en
  })
}

export function localize(map: LocaleMap, locale: Locale): string {
  return map[locale] ?? map.en
}

// Power level is a single scalar used for scoring and matchmaking-style gates.
export function computePowerLevel(c: CharacterState): number {
  const statSum = STAT_KEYS.reduce((s, k) => s + c[k], 0)
  return Math.round(statSum + c.fame / 5 + c.age / 2)
}

export function recomputeDerived(c: CharacterState): void {
  // Clamp stats to sane ranges.
  for (const k of STAT_KEYS) {
    c[k] = Math.max(0, Math.min(40, c[k]))
  }
  c.health = Math.max(0, Math.min(100, c.health))
  c.stamina = Math.max(0, Math.min(100, c.stamina))
  c.fame = Math.max(0, c.fame)
  c.gold = Math.max(0, c.gold)
  c.powerLevel = computePowerLevel(c)
}

export function primaryReputation(c: CharacterState): number {
  if (c.reputations.length === 0) return 0
  return Math.max(...c.reputations.map((r) => r.value))
}

export function peakReputation(c: CharacterState): number {
  if (c.reputations.length === 0) return 0
  return Math.max(...c.reputations.map((r) => r.peakValue))
}

export function adjustReputation(c: CharacterState, faction: string, delta: number): void {
  let rep = c.reputations.find((r) => r.faction === faction)
  if (!rep) {
    rep = { faction, value: 0, peakValue: 0 }
    c.reputations.push(rep)
  }
  rep.value = Math.max(0, Math.min(100, rep.value + delta))
  rep.peakValue = Math.max(rep.peakValue, rep.value)
}

export function reputationLabel(c: CharacterState): string {
  return reputationTierId(primaryReputation(c))
}

// Momentum shifts based on how the last few turns trended (stored in counters).
export function updateMomentum(c: CharacterState, netStatGain: number): void {
  // Shop momentum modifier (camp_seer): helps recover from bad streaks.
  const momentumMod = getActiveModifier(c, "momentumRecoveryModifier")
  const adjusted = netStatGain + (c.momentum === "falling" ? Math.abs(momentumMod) : 0)
  if (adjusted > 2) c.momentum = "rising"
  else if (adjusted < 0) c.momentum = "falling"
  else c.momentum = "normal"
}

export function adjustAffinity(
  c: CharacterState,
  npcId: string,
  delta: number,
  turn: number,
): void {
  const rel = c.relationships.find((r) => r.npcId === npcId)
  if (!rel) return
  rel.affinity = Math.max(-100, Math.min(100, rel.affinity + delta))
  rel.peakAffinity = Math.max(rel.peakAffinity, rel.affinity)
  rel.lastSeenTurn = turn
}

export function relationshipAffinityTier(c: CharacterState, npcId: string): string {
  const rel = c.relationships.find((r) => r.npcId === npcId)
  if (!rel) return "stranger"
  return affinityTierId(rel.affinity)
}

export function ensureRelationship(
  c: CharacterState,
  npcId: string,
  npcRole: string,
  turn: number,
  npcName?: string,
): RelationshipEntry {
  let rel = c.relationships.find((r) => r.npcId === npcId)
  if (!rel) {
    rel = { npcId, npcRole, npcName, affinity: 0, peakAffinity: 0, lastSeenTurn: turn }
    c.relationships.push(rel)
  } else if (npcName && !rel.npcName) {
    rel.npcName = npcName
  }
  return rel
}

export function checkFlag(c: CharacterState, flag: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(flag)) {
    const existing = c.flags[key]
    if (existing === undefined) return false
    if (value !== undefined && value !== null && existing !== value) return false
  }
  return true
}

export function setFlag(c: CharacterState, key: string, value: unknown): void {
  c.flags[key] = value
}

export function applyClanBetrayal(c: CharacterState, newClanId: string, turn: number): void {
  const oldClanId = c.currentClanId
  if (!oldClanId) return

  const membership = c.clanMemberships.find((m) => m.clanId === oldClanId && m.leftAtTurn == null)
  if (membership) {
    membership.leftAtTurn = turn
    membership.leftReason = "betrayed"
  }

  // Reputation crash at old clan.
  adjustReputation(c, oldClanId, -30)

  // Set hunted status.
  c.huntedBy = oldClanId
  c.huntedUntilTurn = turn + GAME_CONFIG.huntedDurationTurns

  c.currentClanId = null
  // Identity (§19): leaving a foreign clan returns you to your home region.
  c.currentRegion = c.homeRegion
}

// The region a faction belongs to (see content/regions.json).
export function regionOf(factionId: string, registry: ContentRegistry): string {
  return registry.factionsById.get(factionId)?.region ?? "vale"
}

// §20: whether the character is currently "riding the bench" at an over-
// reaching clan (stat gains reduced while this holds).
export function isBenched(c: CharacterState): boolean {
  return c.benchedUntilTurn != null && c.turn < c.benchedUntilTurn
}

export function joinClan(
  c: CharacterState,
  clanId: string,
  turn: number,
  signingGold: number,
  registry?: ContentRegistry,
): void {
  c.currentClanId = clanId
  c.gold += signingGold
  c.clanMemberships.push({
    clanId,
    rank: "recruit",
    joinedAtTurn: turn,
    leftAtTurn: null,
    leftReason: null,
  })
  // Start reputation at 0 in the new faction.
  adjustReputation(c, clanId, 0)
  // Geography (§19): moving to a clan updates the current region; identity
  // (homeFactionId/homeRegion) is untouched.
  if (registry) {
    c.currentRegion = regionOf(clanId, registry)
  }
  // §20 over-reaching bench: joining a big clan below its level leaves you on
  // the bench. Tracked as a counter so the "Bench to Banner" achievement can
  // verify the rise-from-below story actually happened.
  const wealth = registry?.factionsById.get(clanId)?.wealth ?? 3
  if (wealth >= 6 && c.powerLevel < wealth * 12) {
    c.benchedUntilTurn = turn + GAME_CONFIG.benchDurationTurns
    c.counters["bench_joined"] = (c.counters["bench_joined"] ?? 0) + 1
  }
}

export function leaveClanAmicably(c: CharacterState, turn: number): void {
  const oldClanId = c.currentClanId
  if (!oldClanId) return
  const membership = c.clanMemberships.find((m) => m.clanId === oldClanId && m.leftAtTurn == null)
  if (membership) {
    membership.leftAtTurn = turn
    membership.leftReason = "retired"
  }
  c.currentClanId = null
  // Identity (§19): solo adventurers are back in their home region.
  c.currentRegion = c.homeRegion
}

export function clearExpiredHunted(c: CharacterState): void {
  if (c.huntedBy && c.huntedUntilTurn != null && c.turn >= c.huntedUntilTurn) {
    c.huntedBy = null
    c.huntedUntilTurn = null
  }
  // §20: the bench stint ends once the character's turn passes the deadline.
  if (c.benchedUntilTurn != null && c.turn >= c.benchedUntilTurn) {
    c.benchedUntilTurn = null
  }
}

// ---- Event eligibility + weighting ----

export function isEligible(ev: EventContent, c: CharacterState): boolean {
  if (c.age < ev.minAge || c.age > ev.maxAge) return false
  if (ev.requiresClass && ev.requiresClass !== c.class) return false
  if (ev.excludeIfCompletedIds?.some((id) => c.counters[`event_${id}`])) {
    return false
  }
  if (ev.requiresTags && ev.requiresTags.length > 0) {
    const hasTag = ev.requiresTags.some((t) => (c.personality[t] ?? 0) > 0)
    if (!hasTag) return false
  }
  // Arc gating: requiresArc means event only shows during those arcs.
  if (ev.requiresArc && ev.requiresArc.length > 0) {
    if (!ev.requiresArc.includes(c.currentArc)) return false
  }
  // Arc exclusion: excludeIfArc means event doesn't show during those arcs.
  if (ev.excludeIfArc && ev.excludeIfArc.length > 0) {
    if (ev.excludeIfArc.includes(c.currentArc)) return false
  }
  // Locked event pools: if event belongs to a locked pool, it's ineligible.
  if (c.lockedEventPools.length > 0 && ev.type === "destiny") {
    // Check if this destiny event's pool is locked.
    if (ev.id && c.lockedEventPools.includes(ev.id)) return false
  }
  if (ev.requiresRelationshipId) {
    if (!c.relationships.some((r) => r.npcId === ev.requiresRelationshipId)) return false
  }
  if (ev.requiresFlag) {
    if (!checkFlag(c, ev.requiresFlag)) return false
  }
  if (ev.requiresClanId) {
    if (c.currentClanId !== ev.requiresClanId) return false
  }
  if (ev.requiresNoClan) {
    if (c.currentClanId != null) return false
  }
  if (ev.excludesIfClanId) {
    if (c.currentClanId === ev.excludesIfClanId) return false
  }
  if (ev.requiresHuntedBy) {
    if (!c.huntedBy) return false
  }
  // §19 geography axis: "outsider" events only while away from home, and the
  // home-region pool only while there. Identity (homeRegion) is never touched.
  if (ev.requiresForeign) {
    if (c.currentRegion === c.homeRegion) return false
  }
  if (ev.requiresHomeRegion) {
    if (c.currentRegion !== c.homeRegion) return false
  }
  // §21 region-gated event variants: same archetype, current-region dressing.
  if (ev.requiresRegion) {
    if (c.currentRegion !== ev.requiresRegion) return false
  }
  // §20 origin-gated pools (underdog / privileged flavor).
  if (ev.requiresOrigin) {
    if (c.origin !== ev.requiresOrigin) return false
  }
  if (ev.involvesRival && !c.rival) return false
  return true
}

// Momentum nudges the effective weight so runs feel like they have streaks.
export function effectiveWeight(ev: EventContent, c: CharacterState): number {
  let w = ev.weight
  if (c.momentum === "rising" && ev.location === "court") w *= 1.3
  if (c.momentum === "falling" && ev.location === "dungeon") w *= 1.3
  return w
}

// ---- Serving events to the client (strip hidden fields) ----

// §20 minutes-signal for a clan-join offer: bench (below its level), same
// (right-sized), up (arriving above the level you'd be slotted into).
export function roleSignalFor(
  c: CharacterState,
  factionId: string,
  registry: ContentRegistry,
): RoleSignal {
  const wealth = registry.factionsById.get(factionId)?.wealth ?? 3
  if (wealth >= 6 && c.powerLevel < wealth * 12) return "bench"
  if (c.powerLevel >= wealth * 18) return "up"
  return "same"
}

export function serveEvent(
  ev: EventContent,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
  isRetirementOffer: boolean,
): ServedEvent {
  const narrative = fillSlots(localize(ev.narrative, locale), locale, registry, rng, c)

  // Minigames present their cards as choices; regular events present choices.
  const isMinigame = ev.type === "minigame" || Boolean(ev.cards)
  let choices: ServedChoice[]
  if (isMinigame && ev.cards) {
    choices = ev.cards.map((card) => ({
      id: card.id,
      label: fillSlots(localize(card.label, locale), locale, registry, rng, c),
      icon: card.icon,
      rarity: "uncommon" as Rarity,
    }))
    // Cards keep their authored order (no rarity reveal sort for minigames).
  } else {
    choices = (ev.choices ?? []).map((ch) => ({
      id: ch.id,
      label: fillSlots(localize(ch.label, locale), locale, registry, rng, c),
      tag: ch.tag,
      rarity: ch.rarity,
      statDeltas: ch.statDeltas,
      tradeoffDeltas: ch.tradeoffDeltas,
      fameDelta: ch.fameDelta,
      reputationDelta: ch.reputationDelta,
      goldDelta: ch.goldDelta,
      factionId: ch.factionId ?? ch.joinClanId ?? ch.reputationFaction,
      stipend: ch.stipend,
      roleSignal: ch.joinClanId ? roleSignalFor(c, ch.joinClanId, registry) : undefined,
      riskLabel: ch.riskLabel
        ? fillSlots(localize(ch.riskLabel, locale), locale, registry, rng, c)
        : undefined,
    }))
    // Sort so rarer, more interesting choices read last (feels like a reveal).
    choices.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))
  }
  const flagLabel = ev.flagLabel ? localize(ev.flagLabel, locale) : undefined
  return { eventId: ev.id, narrative, choices, isRetirementOffer, flagLabel }
}

export function statLabelKeys(): readonly StatKey[] {
  return STAT_KEYS
}

// Market value: fluctuates independently of gold. Represents the character's
// worth on the open market (prize money, bounty, sponsorship, etc.).
export function computeMarketValue(c: CharacterState): number {
  const agePenalty = c.age > 35 ? (c.age - 35) * 100 : 0
  return Math.max(0, c.powerLevel * 50 + c.fame * 10 + c.achievements.length * 200 - agePenalty)
}

export function updateMarketValue(c: CharacterState): void {
  c.marketValue = computeMarketValue(c)
  if (c.marketValue > c.marketValuePeak) {
    c.marketValuePeak = c.marketValue
  }
}

// Stamina: each turn costs 1 base stamina. If stamina < 20, apply a fatigue
// penalty to all stat gains. Recovery happens through shop items or rest events.
export const STAMINA_BASE_COST = 1
export const STAMINA_FATIGUE_THRESHOLD = 20
export const FATIGUE_MULTIPLIER = 0.5

// Read aggregate modifier value for a given effect type from owned inventory.
// Retinue items apply their effect value as a flat sum; consumables with the same
// effect type stack additively while active.
export function getActiveModifier(c: CharacterState, effectType: string): number {
  let total = 0
  for (const entry of c.inventory) {
    // Shop item effects are looked up from content data; we don't store them
    // on the inventory entry, so we match by known item ids.
    const MOD_MAP: Record<string, { type: string; value: number }> = {
      camp_cook: { type: "fatigueModifier", value: -0.15 },
      battle_healer: { type: "injuryRiskModifier", value: -0.15 },
      camp_seer: { type: "momentumRecoveryModifier", value: -0.2 },
      weapon_master: { type: "ageDeclineDelay", value: 3 },
      guild_herald: { type: "offerQualityModifier", value: 0.15 },
      season_healer: { type: "injuryRiskModifier", value: -0.1 },
    }
    const mod = MOD_MAP[entry.itemId]
    if (mod && mod.type === effectType) {
      total += mod.value * entry.qty
    }
  }
  return total
}

export function deductStamina(c: CharacterState, extraCost = 0): void {
  const fatigueMod = getActiveModifier(c, "fatigueModifier")
  const cost = Math.max(0, STAMINA_BASE_COST + extraCost + fatigueMod)
  c.stamina = Math.max(0, c.stamina - cost)
  // Track consecutive turns spent at 0 stamina so the engine can force recovery.
  c.staminaZeroStreak = c.stamina <= 0 ? (c.staminaZeroStreak ?? 0) + 1 : 0
}

export function isFatigued(c: CharacterState): boolean {
  return c.stamina < STAMINA_FATIGUE_THRESHOLD
}

// Age-related stat decline: after ageRiskStart, stats decay each season.
// "weapon_master" retinue delays this by adding years to the effective start.
export function ageDeclineStart(c: CharacterState): number {
  const delay = getActiveModifier(c, "ageDeclineDelay")
  return GAME_CONFIG.ageRiskStart + delay
}

export function applyAgeDecline(c: CharacterState): void {
  const declineStart = ageDeclineStart(c)
  if (c.age <= declineStart) return
  const yearsOver = c.age - declineStart
  if (yearsOver % 3 === 0) {
    // Every 3 years past decline start, lose 1 from every physical stat.
    const physicalStats = STAT_KEYS.filter((k) => k !== "intelligence" && k !== "charisma")
    for (const k of physicalStats) {
      if (c[k] > 0) c[k] -= 1
    }
  }
}

const LOCALE_LOCATION: Record<string, string> = {
  "the northern reaches": "las fronteras del norte",
  "the capital": "la capital",
  "the wildlands": "las tierras salvajes",
  "distant shores": "costas lejanas",
  "the court": "la corte",
}

export function localizeLocation(location: string, locale: Locale): string {
  if (locale === "en") return location
  return LOCALE_LOCATION[location] ?? location
}

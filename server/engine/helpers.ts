import type {
  CharacterState,
  EventContent,
  Locale,
  LocaleMap,
  Rarity,
  ServedChoice,
  ServedEvent,
  StatKey,
} from "../../shared/types.js";
import { STAT_KEYS } from "../../shared/types.js";
import type { Rng } from "../../shared/rng.js";
import type { ContentRegistry } from "../content/registry.js";
import { reputationTierId } from "../../shared/config.js";

// Fill {slot:pool} placeholders in a narrative string deterministically.
// The same rng sequence + same seed => identical filled text for daily mode.
export function fillSlots(
  text: string,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
): string {
  // Supports both {poolName} and {slot:poolName} placeholder styles.
  return text.replace(/\{(?:slot:)?([a-zA-Z_]+)\}/g, (_m, pool: string) => {
    const entries = registry.slots[pool];
    if (!entries || entries.length === 0) return pool;
    const chosen = rng.pick(entries);
    return chosen[locale] ?? chosen.en;
  });
}

export function localize(map: LocaleMap, locale: Locale): string {
  return map[locale] ?? map.en;
}

// Power level is a single scalar used for scoring and matchmaking-style gates.
export function computePowerLevel(c: CharacterState): number {
  const statSum = STAT_KEYS.reduce((s, k) => s + c[k], 0);
  return Math.round(statSum + c.fame / 5 + c.age / 2);
}

export function recomputeDerived(c: CharacterState): void {
  // Clamp stats to sane ranges.
  for (const k of STAT_KEYS) {
    c[k] = Math.max(0, Math.min(40, c[k]));
  }
  c.health = Math.max(0, Math.min(100, c.health));
  c.stamina = Math.max(0, Math.min(100, c.stamina));
  c.fame = Math.max(0, c.fame);
  c.gold = Math.max(0, c.gold);
  c.powerLevel = computePowerLevel(c);
}

export function primaryReputation(c: CharacterState): number {
  if (c.reputations.length === 0) return 0;
  return Math.max(...c.reputations.map(r => r.value));
}

export function peakReputation(c: CharacterState): number {
  if (c.reputations.length === 0) return 0;
  return Math.max(...c.reputations.map(r => r.peakValue));
}

export function adjustReputation(
  c: CharacterState,
  faction: string,
  delta: number,
): void {
  let rep = c.reputations.find(r => r.faction === faction);
  if (!rep) {
    rep = { faction, value: 0, peakValue: 0 };
    c.reputations.push(rep);
  }
  rep.value = Math.max(0, Math.min(100, rep.value + delta));
  rep.peakValue = Math.max(rep.peakValue, rep.value);
}

export function reputationLabel(c: CharacterState): string {
  return reputationTierId(primaryReputation(c));
}

// Momentum shifts based on how the last few turns trended (stored in counters).
export function updateMomentum(c: CharacterState, netStatGain: number): void {
  if (netStatGain > 2) c.momentum = "rising";
  else if (netStatGain < 0) c.momentum = "falling";
  else c.momentum = "normal";
}

// ---- Event eligibility + weighting ----

export function isEligible(ev: EventContent, c: CharacterState): boolean {
  if (c.age < ev.minAge || c.age > ev.maxAge) return false;
  if (ev.requiresClass && ev.requiresClass !== c.class) return false;
  if (ev.excludeIfCompletedIds?.some(id => c.counters[`event_${id}`])) {
    return false;
  }
  if (ev.requiresTags && ev.requiresTags.length > 0) {
    const hasTag = ev.requiresTags.some(t => (c.personality[t] ?? 0) > 0);
    if (!hasTag) return false;
  }
  return true;
}

// Momentum nudges the effective weight so runs feel like they have streaks.
export function effectiveWeight(ev: EventContent, c: CharacterState): number {
  let w = ev.weight;
  if (c.momentum === "rising" && ev.location === "court") w *= 1.3;
  if (c.momentum === "falling" && ev.location === "dungeon") w *= 1.3;
  return w;
}

// ---- Serving events to the client (strip hidden fields) ----

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "volatile"];

export function serveEvent(
  ev: EventContent,
  c: CharacterState,
  locale: Locale,
  registry: ContentRegistry,
  rng: Rng,
  isRetirementOffer: boolean,
): ServedEvent {
  const narrative = fillSlots(localize(ev.narrative, locale), locale, registry, rng);

  // Minigames present their cards as choices; regular events present choices.
  const isMinigame = ev.type === "minigame" || Boolean(ev.cards);
  let choices: ServedChoice[];
  if (isMinigame && ev.cards) {
    choices = ev.cards.map(card => ({
      id: card.id,
      label: fillSlots(localize(card.label, locale), locale, registry, rng),
      icon: card.icon,
      rarity: "uncommon" as Rarity,
    }));
    // Cards keep their authored order (no rarity reveal sort for minigames).
  } else {
    choices = (ev.choices ?? []).map(ch => ({
      id: ch.id,
      label: fillSlots(localize(ch.label, locale), locale, registry, rng),
      tag: ch.tag,
      rarity: ch.rarity,
    }));
    // Sort so rarer, more interesting choices read last (feels like a reveal).
    choices.sort(
      (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
    );
  }
  return { eventId: ev.id, narrative, choices, isRetirementOffer };
}

export function statLabelKeys(): readonly StatKey[] {
  return STAT_KEYS;
}

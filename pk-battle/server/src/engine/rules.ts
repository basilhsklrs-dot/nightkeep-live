/**
 * Game-agnostic rules: maps normalized viewer events to abstract actions.
 * A different game theme only needs a new Battle implementation that consumes
 * these actions; the TikTok integration stays untouched.
 */
export type ActionKind = 'soldier' | 'strike' | 'archer' | 'shield' | 'elite' | 'heavy' | 'boss' | 'knight';

export interface GiftTier { minCoins: number; action: ActionKind; label: string }

export interface Rules {
  /** Initial design values; NOT claims about TikTok's gift catalog. Matched on the verified diamondCount of each gift event. */
  giftTiers: GiftTier[];
  /** Optional verified giftId -> action overrides (env GIFT_ID_MAP). */
  giftIdMap: Record<string, ActionKind>;
  maxSpawnPerPacket: number;
  likes: { energyPerLike: number; maxEnergy: number; decayPerSec: number; likesPerSoldier: number; maxDamageBoost: number };
  follow: { action: ActionKind; count: number; score: number };
  membership: { action: ActionKind; count: number; score: number };
  combo: { at: number; action: ActionKind; label: string }[];
  score: { damage: number; spawn: number; kill: number; defense: number; like: number; coin: number; combo: number; follow: number };
  castleHp: number;
  maxShield: number;
  durationSec: number;
  countdownSec: number;
  resultSec: number;
  maxUnitsPerSide: number;
}

export const defaultRules: Rules = {
  giftTiers: [
    { minCoins: 1, action: 'soldier', label: 'Basic soldier' },
    { minCoins: 3, action: 'strike', label: 'Fire strike' },
    { minCoins: 5, action: 'archer', label: 'Archer' },
    { minCoins: 10, action: 'shield', label: 'Castle shield' },
    { minCoins: 20, action: 'elite', label: 'Elite soldier' },
    { minCoins: 50, action: 'heavy', label: 'Meteor attack' },
    { minCoins: 100, action: 'boss', label: 'Boss power-up' },
  ],
  giftIdMap: {},
  maxSpawnPerPacket: 12,
  likes: { energyPerLike: 0.5, maxEnergy: 100, decayPerSec: 1.5, likesPerSoldier: 60, maxDamageBoost: 0.5 },
  follow: { action: 'soldier', count: 3, score: 50 },
  membership: { action: 'knight', count: 2, score: 300 },
  combo: [
    { at: 10, action: 'strike', label: 'COMBO x10' },
    { at: 50, action: 'heavy', label: 'COMBO x50' },
    { at: 100, action: 'boss', label: 'COMBO x100' },
  ],
  score: { damage: 1, spawn: 5, kill: 5, defense: 0.5, like: 0.2, coin: 10, combo: 100, follow: 1 },
  castleHp: 20000,
  maxShield: 6000,
  durationSec: 300,
  countdownSec: 3,
  resultSec: 15,
  maxUnitsPerSide: 70,
};

export const ACTIONS: ActionKind[] = ['soldier', 'strike', 'archer', 'shield', 'elite', 'heavy', 'boss', 'knight'];

export function tierFor(rules: Rules, coins: number, giftId: string): { action: ActionKind; tier: GiftTier | null } {
  const mapped = rules.giftIdMap[giftId];
  if (mapped) return { action: mapped, tier: rules.giftTiers.find(t => t.action === mapped) ?? null };
  const tiers = [...rules.giftTiers].sort((a, b) => a.minCoins - b.minCoins);
  let pick = tiers[0];
  for (const t of tiers) if (coins >= t.minCoins) pick = t;
  return { action: pick.action, tier: pick };
}

/** Merge a JSON override (env GAME_RULES) onto the defaults, validating action names. */
export function loadRules(json?: string, giftIdMap?: string): Rules {
  const rules: Rules = structuredClone(defaultRules);
  if (json) {
    const o = JSON.parse(json);
    for (const k of Object.keys(o)) if (k in rules) (rules as any)[k] = typeof o[k] === 'object' && !Array.isArray(o[k]) ? { ...(rules as any)[k], ...o[k] } : o[k];
  }
  if (giftIdMap) rules.giftIdMap = JSON.parse(giftIdMap);
  for (const a of [...rules.giftTiers.map(t => t.action), ...Object.values(rules.giftIdMap), ...rules.combo.map(c => c.action), rules.follow.action, rules.membership.action])
    if (!ACTIONS.includes(a)) throw new Error(`Invalid action in rules: ${a}`);
  return rules;
}

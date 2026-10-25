/**
 * Raw tiktok-live-connector (v2, EulerStream signed) payloads -> internal events.
 * Combo logic is ported from NIGHTKEEP's proven Normalizer: cumulative streak
 * updates are converted to deltas so a 20x combo counts 20 gifts, not 1+2+...+20.
 */
import { randomUUID } from 'node:crypto';
import type { NormalizedEvent, Side } from './types.js';

type Raw = Record<string, any>;

export const clean = (v: unknown, n = 64): string =>
  String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
const positive = (v: unknown, max = 100000): number =>
  Math.max(1, Math.min(max, Math.floor(Number(v) || 1)));

export function viewer(d: Raw) {
  const u = d.user ?? {};
  const user = clean(u.uniqueId || u.displayId || d.uniqueId || u.nickname || 'viewer');
  const userId = clean(u.userId || u.id || d.userId || '', 32) || undefined;
  const displayName = clean(u.nickname || u.displayName || d.nickname || user) || user;
  return { user, userId, displayName };
}

interface Streak { at: number; count: number; ended: boolean; comboId: string }

export class Normalizer {
  private ids = new Map<string, { at: number }>();
  private streaks = new Map<string, Streak>();
  private followed = new Map<string, { at: number }>();
  constructor(private now: () => number = () => Date.now()) {}

  private prune<T extends { at: number }>(map: Map<string, T>, ttl: number) {
    const now = this.now();
    for (const [key, v] of map) if (now - v.at > ttl) map.delete(key);
    while (map.size > 20000) map.delete(map.keys().next().value as string);
  }

  /** Returns true the first time a message id is seen (replay protection). */
  private fresh(key: string): boolean {
    if (this.ids.has(key)) return false;
    this.ids.set(key, { at: this.now() });
    return true;
  }

  normalize(kind: string, d: Raw, room: string, side: Side): NormalizedEvent | null {
    this.prune(this.ids, 600_000);
    this.prune(this.streaks, 120_000);
    this.prune(this.followed, 6 * 3600_000);
    const base = { room, side, source: 'tiktok' as const, at: this.now() };
    const msgId = d.common?.msgId || d.msgId;
    // Gift streak updates may reuse msgId; their cumulative count is deduped below.
    if (kind !== 'gift' && msgId && msgId !== '0' && !this.fresh(`${room}:${kind}:${msgId}`)) return null;
    const v = viewer(d);
    switch (kind) {
      case 'join': return { ...base, ...v, type: 'viewer_join' };
      case 'like': return { ...base, ...v, type: 'like', count: positive(d.count ?? d.likeCount, 1000) };
      case 'follow': {
        // One-time bonus per viewer per room (per 6h window, survives re-follows).
        const key = `${room}:${v.userId || v.user}`;
        if (this.followed.has(key)) return null;
        this.followed.set(key, { at: this.now() });
        return { ...base, ...v, type: 'follow' };
      }
      case 'membership': return { ...base, ...v, type: 'membership', level: Number(d.subMonth) || undefined };
      case 'gift': return this.gift(d, base, v, msgId);
      default: return null;
    }
  }

  private gift(d: Raw, base: { room: string; side: Side; source: 'tiktok'; at: number }, v: ReturnType<typeof viewer>, msgId?: string): NormalizedEvent | null {
    const giftId = clean(d.giftId ?? d.gift?.id ?? '', 24);
    const g = d.gift ?? d.extendedGiftInfo ?? {};
    const giftName = clean(g.name || d.giftName || `Gift #${giftId}`);
    const coinsRaw = Number(g.diamondCount ?? g.diamond_count ?? d.diamondCount ?? 0);
    const coins = Number.isFinite(coinsRaw) && coinsRaw > 0 ? Math.min(100000, coinsRaw) : 0;
    const count = positive(d.repeatCount);
    const ended = d.repeatEnd === true || Number(d.repeatEnd) === 1;
    const streakable = Number(g.type ?? d.giftType) === 1;
    if (streakable) {
      // groupId is the authoritative combo identity; fallback resets after the final packet.
      const rawGroup = d.groupId ?? g.groupId;
      const group = rawGroup != null && String(rawGroup) !== '0' ? String(rawGroup) : '';
      const key = `${base.room}:${v.userId || v.user}:${giftId}:${group || 'active'}`;
      let old = this.streaks.get(key);
      if (!group && old?.ended && !ended && count <= old.count) old = undefined;
      const total = Math.max(count, old?.count ?? 0);
      const delta = Math.max(0, count - (old?.count ?? 0));
      const comboId = old?.comboId ?? randomUUID();
      this.streaks.set(key, { at: this.now(), count: total, ended: ended || Boolean(old?.ended && !delta), comboId });
      if (!delta && !(ended && !old?.ended)) return null;
      return { ...base, ...v, type: 'gift', giftId, giftName, coins, count: delta, comboId, comboTotal: total, comboEnded: ended };
    }
    if (msgId && msgId !== '0' && !this.fresh(`${base.room}:gift:${msgId}`)) return null;
    return { ...base, ...v, type: 'gift', giftId, giftName, coins, count, comboId: randomUUID(), comboTotal: count, comboEnded: true };
  }
}

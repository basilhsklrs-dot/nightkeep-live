/**
 * Development simulator. Every event it produces carries source:'sim' and the
 * UI shows a SIMULATION badge, so simulated play is never presented as real.
 */
import { randomUUID } from 'node:crypto';
import type { NormalizedEvent, Side } from './types.js';

const NAMES = ['knight_ava', 'pixel_max', 'luna.rose', 'drako77', 'mira_star', 'kostas.gr', 'nova_fan', 'zeus_tap', 'eleni.k', 'rocket_jo'];
const GIFTS: [string, number][] = [['Rose', 1], ['GG', 1], ['Finger Heart', 5], ['Perfume', 20], ['Doughnut', 30], ['Hand Hearts', 100], ['Ice Cream Cone', 1], ['Confetti', 100], ['Galaxy', 1000]];

export type SimInput =
  | { type: 'like'; side: Side; user?: string; count?: number }
  | { type: 'follow' | 'membership' | 'viewer_join'; side: Side; user?: string }
  | { type: 'gift'; side: Side; user?: string; giftName?: string; coins?: number; count?: number; comboId?: string; comboTotal?: number; comboEnded?: boolean; giftId?: string };

export function simEvent(i: SimInput, room = 'simulator'): NormalizedEvent {
  const user = String(i.user || NAMES[Math.floor(Math.random() * NAMES.length)]).slice(0, 32);
  const base = { room, side: i.side, source: 'sim' as const, at: Date.now(), user, displayName: user };
  switch (i.type) {
    case 'like': return { ...base, type: 'like', count: Math.max(1, Math.min(1000, Math.floor(i.count ?? 15))) };
    case 'follow': return { ...base, type: 'follow' };
    case 'membership': return { ...base, type: 'membership' };
    case 'viewer_join': return { ...base, type: 'viewer_join' };
    case 'gift': {
      const count = Math.max(0, Math.min(1000, Math.floor(i.count ?? 1)));
      return { ...base, type: 'gift', giftId: String(i.giftId ?? 'sim'), giftName: String(i.giftName ?? 'Rose').slice(0, 32), coins: Math.max(0, Math.min(100000, Number(i.coins ?? 1))), count, comboId: String(i.comboId ?? randomUUID()).slice(0, 64), comboTotal: Math.max(count, Math.floor(i.comboTotal ?? count)), comboEnded: i.comboEnded ?? true };
    }
  }
}

/** Random traffic for demo mode, with occasional combos and big gifts. */
export function demoTraffic(emit: (e: NormalizedEvent) => void) {
  let step = 0;
  return setInterval(() => {
    step++;
    for (const side of ['left', 'right'] as Side[]) {
      const r = Math.random();
      if (r < 0.55) emit(simEvent({ type: 'like', side, count: 5 + Math.floor(Math.random() * 30) }));
      else if (r < 0.85) {
        const [giftName, coins] = GIFTS[Math.floor(Math.random() * (Math.random() < 0.93 ? 5 : GIFTS.length))];
        emit(simEvent({ type: 'gift', side, giftName, coins }));
      } else if (r < 0.95) emit(simEvent({ type: 'follow', side, user: `fan_${step}_${side}` }));
      else emit(simEvent({ type: 'membership', side }));
    }
    if (step % 40 === 0) {
      // A 12x Rose combo delivered as cumulative updates (exercises combo dedup).
      const side: Side = Math.random() < 0.5 ? 'left' : 'right', comboId = randomUUID(), user = 'combo_queen';
      for (let n = 1; n <= 12; n++) emit(simEvent({ type: 'gift', side, user, giftName: 'Rose', coins: 1, count: 1, comboId, comboTotal: n, comboEnded: n === 12 }));
    }
  }, 700);
}

/**
 * TikTok LIVE ingestion via tiktok-live-connector + EulerStream signing.
 * One RoomSource per connected room. The HOST room feeds the LEFT team; the
 * OPPONENT room (connected once the PK opponent is identified) feeds RIGHT.
 * Reconnect/backoff and connection-generation logic ported from NIGHTKEEP.
 */
import { EventEmitter } from 'node:events';
import { Normalizer, clean } from './normalizer.js';
import type { NormalizedEvent, Side } from './types.js';

export type RoomState = 'idle' | 'connecting' | 'live' | 'offline' | 'stopped';

const RAW_EVENTS: [string, string][] = [
  ['LIKE', 'like'], ['FOLLOW', 'follow'], ['GIFT', 'gift'], ['MEMBER', 'join'],
  ['SUB_NOTIFY', 'membership'], ['SUPER_FAN_JOIN', 'membership'],
];
export const PK_EVENTS: [string, 'linkMicBattle' | 'linkMicArmies' | 'linkMicBattlePunishFinish'][] = [
  ['LINK_MIC_BATTLE', 'linkMicBattle'], ['LINK_MIC_ARMIES', 'linkMicArmies'], ['LINK_MIC_BATTLE_PUNISH_FINISH', 'linkMicBattlePunishFinish'],
];

export interface RoomSourceEvents {
  event: [NormalizedEvent];
  pk: [kind: 'linkMicBattle' | 'linkMicArmies' | 'linkMicBattlePunishFinish', data: any, room: string];
  state: [RoomState];
  connected: [{ roomId: string; ownerUserId: string }];
}

export class RoomSource extends EventEmitter<RoomSourceEvents> {
  state: RoomState = 'idle';
  roomId = '';
  lastEventAt: number | null = null;
  nextRetryAt: number | null = null;
  lastError = '';
  /** Per-type raw counts, to verify availability of each event type in diagnostics. */
  seen: Record<string, number> = {};
  private connection: any;
  private generation = 0;
  private failures = 0;
  private connecting = false;
  private stopping = false;
  private timer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout;
  private normalizer = new Normalizer();

  constructor(public uniqueId: string, public side: Side, private signApiKey?: string, private maxRetries = Infinity) {
    super();
    this.watchdog = setInterval(() => {
      if (!this.stopping && !this.connecting && this.state === 'live' && !this.connection?.isConnected) { this.set('offline'); void this.dispose().then(() => this.retry()); }
    }, 30_000);
  }

  private set(s: RoomState) { this.state = s; this.emit('state', s); }

  start() { this.stopping = false; void this.connect(); }

  async stop() {
    this.stopping = true;
    clearTimeout(this.timer); clearInterval(this.watchdog);
    await this.dispose();
    this.set('stopped');
  }

  private async dispose() {
    this.generation++;
    const old = this.connection; this.connection = undefined;
    if (old) { old.removeAllListeners(); old.on('error', () => {}); try { await old.disconnect(); } catch { /* already closed */ } }
  }

  private retry() {
    if (this.stopping || this.timer) return;
    if (this.failures >= this.maxRetries) { this.set('offline'); return; }
    // Capped at 60 s so a LIVE that starts later is picked up within about a minute.
    const ms = Math.min(60_000, 5000 * 2 ** Math.min(this.failures++, 4)) + Math.random() * 2000;
    this.nextRetryAt = Date.now() + ms;
    this.set('offline');
    this.timer = setTimeout(() => { this.timer = undefined; if (this.connecting) this.retry(); else void this.connect(); }, ms);
  }

  private async connect() {
    if (this.connecting || this.stopping) return;
    this.connecting = true;
    await this.dispose();
    const ticket = this.generation;
    this.set('connecting');
    try {
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector') as any;
      if (ticket !== this.generation || this.stopping) return;
      const current = new TikTokLiveConnection(this.uniqueId, {
        enableExtendedGiftInfo: false, processInitialData: false,
        ...(this.signApiKey ? { signApiKey: this.signApiKey } : {}),
      });
      this.connection = current;
      const valid = () => ticket === this.generation && !this.stopping;
      current.on(ControlEvent.ERROR, () => { if (valid()) this.lastError = 'connection error'; });
      current.on(ControlEvent.DISCONNECTED, () => { if (valid()) this.retry(); });
      current.on(WebcastEvent.STREAM_END, () => { if (valid()) { void this.dispose(); this.retry(); } });
      for (const [key, kind] of RAW_EVENTS) {
        if (!WebcastEvent[key]) continue;
        current.on(WebcastEvent[key], (d: any) => {
          if (!valid()) return;
          this.seen[kind] = (this.seen[kind] ?? 0) + 1;
          this.lastEventAt = Date.now();
          const e = this.normalizer.normalize(kind, d, this.uniqueId, this.side);
          if (e) this.emit('event', e);
        });
      }
      for (const [key, kind] of PK_EVENTS) {
        if (!WebcastEvent[key]) continue;
        current.on(WebcastEvent[key], (d: any) => {
          if (!valid()) return;
          this.seen[kind] = (this.seen[kind] ?? 0) + 1;
          this.emit('pk', kind, d, this.uniqueId);
        });
      }
      const pending = current.connect();
      // A late resolve after a timeout must not leave an abandoned connection alive.
      pending.then(() => { if (!valid()) void current.disconnect().catch(() => {}); }, () => {});
      let deadline: NodeJS.Timeout | undefined;
      let state: any;
      try {
        state = await Promise.race([pending, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Connect deadline exceeded')), 60_000); })]);
      } finally { clearTimeout(deadline); }
      if (!valid()) { try { await current.disconnect(); } catch { /* ignore */ } return; }
      this.roomId = clean(state?.roomId || '', 32);
      const info = state?.roomInfo ?? {};
      const owner = clean(info.owner?.id_str || info.owner?.id || info.data?.owner?.id_str || info.owner_user_id || '', 32);
      this.failures = 0; this.nextRetryAt = null; this.lastError = '';
      clearTimeout(this.timer); this.timer = undefined;
      this.set('live');
      this.emit('connected', { roomId: this.roomId, ownerUserId: owner });
    } catch (error: any) {
      // Never log raw error objects: they can contain signed URLs or headers.
      this.lastError = clean(error?.name || 'Error') + ': ' + clean(error?.message || '', 120).replace(/https?:\S+/g, '[url]');
      console.warn(JSON.stringify({ room: this.uniqueId, side: this.side, connect: 'failed', reason: this.lastError }));
      if (ticket === this.generation && !this.stopping) { await this.dispose(); this.retry(); }
    } finally { this.connecting = false; }
  }

  diagnostics() {
    return { uniqueId: this.uniqueId, side: this.side, state: this.state, roomId: this.roomId, lastEventAt: this.lastEventAt, nextRetryAt: this.nextRetryAt, lastError: this.lastError, seen: this.seen };
  }
}

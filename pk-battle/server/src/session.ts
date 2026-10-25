/**
 * One PK session = one host creator. Owns the battle, the event->action
 * mapping, PK lifecycle, leaderboards and the activity feed. Multiple sessions
 * can run side by side (SessionManager in server.ts).
 */
import { Battle } from './engine/battle.js';
import { tierFor, type Rules } from './engine/rules.js';
import type { AnchorInfo, NormalizedEvent, Side } from './types.js';

export type Mode = 'pk' | 'continuous';

export interface FeedItem { at: number; side: Side; text: string }
export interface Leader { name: string; side: Side; points: number; gifts: number }

export interface PkInfo {
  phase: 'idle' | 'invited' | 'live' | 'ended';
  battleId: string;
  opponent: AnchorInfo | null;
  officialScore: { left: number | null; right: number | null };
  officialTop: { left: { nickname: string; score: number }[]; right: { nickname: string; score: number }[] };
  endsAtMs: number | null;
  /** How RIGHT team viewer actions are attributed. */
  rightAttribution: 'opponent_room' | 'official_score_delta' | 'none';
}

export class Session {
  battle: Battle;
  mode: Mode;
  feed: FeedItem[] = [];
  leaders = new Map<string, Leader>();
  creators: Record<Side, { name: string; handle: string }>;
  pk: PkInfo = { phase: 'idle', battleId: '', opponent: null, officialScore: { left: null, right: null }, officialTop: { left: [], right: [] }, endsAtMs: null, rightAttribution: 'none' };
  counters = { events: 0, likes: 0, gifts: 0, coins: 0, follows: 0, joins: 0, memberships: 0, pkSignals: 0 };
  private combosFired = new Map<string, Set<number>>();
  private lastOfficialRight: number | null = null;
  private hostUserId = '';
  opponentRoomLive = false;
  /**
   * Creator Battle (no TikTok PK): both creators stream this game in their own
   * LIVE; the server reads both rooms. Never presented as an official TikTok PK.
   */
  rival: string | null = null;

  startRival(handle: string) {
    this.rival = handle;
    this.creators.right = { name: handle, handle };
    this.pk.rightAttribution = 'opponent_room';
    this.push('right', `Creator Battle vs @${handle}`);
    this.battle.start(this.rules.durationSec);
  }

  stopRival() {
    this.rival = null;
    this.creators.right = { name: 'OPPONENT', handle: '' };
    this.pk.rightAttribution = 'none';
    this.battle.stop();
  }

  constructor(public id: string, public rules: Rules, host: { name: string; handle: string }, mode: Mode, seed?: number) {
    this.battle = new Battle(rules, seed);
    this.mode = mode;
    this.creators = { left: host, right: { name: 'OPPONENT', handle: '' } };
    if (mode === 'continuous') this.battle.start();
  }

  setHostUserId(id: string) { this.hostUserId = id; }

  private push(side: Side, text: string) {
    this.feed.push({ at: Date.now(), side, text });
    if (this.feed.length > 30) this.feed.shift();
  }

  private lead(side: Side, name: string, user: string, points: number, gifts = 0) {
    const key = `${side}:${user}`;
    const l = this.leaders.get(key) ?? { name, side, points: 0, gifts: 0 };
    l.points += points; l.gifts += gifts; l.name = name;
    this.leaders.set(key, l);
    if (this.leaders.size > 5000) {
      const weakest = [...this.leaders.entries()].sort((a, b) => a[1].points - b[1].points)[0];
      this.leaders.delete(weakest[0]);
    }
  }

  leaderboard(n = 10) { return [...this.leaders.values()].sort((a, b) => b.points - a.points).slice(0, n).map(l => ({ ...l, points: Math.round(l.points) })); }

  handle(e: NormalizedEvent) {
    this.counters.events++;
    const b = this.battle, R = this.rules;
    switch (e.type) {
      case 'viewer_join': this.counters.joins++; return;
      case 'like':
        this.counters.likes += e.count;
        b.likes(e.side, e.user, e.displayName, e.count);
        this.lead(e.side, e.displayName, e.user, e.count * R.score.like);
        if (b.phase !== 'battle') this.push(e.side, `${e.displayName} tapped x${e.count}`);
        return;
      case 'follow':
        this.counters.follows++;
        for (let i = 0; i < R.follow.count; i++) b.act(e.side, R.follow.action, e.user, e.displayName);
        b.addScore(e.side, 'score', R.follow.score, 1);
        b.credit(e.side, e.user, e.displayName, R.follow.score);
        this.lead(e.side, e.displayName, e.user, R.follow.score);
        this.push(e.side, `${e.displayName} followed! +${R.follow.count} soldiers`);
        return;
      case 'membership':
        this.counters.memberships++;
        for (let i = 0; i < R.membership.count; i++) b.act(e.side, R.membership.action, e.user, e.displayName);
        b.addScore(e.side, 'score', R.membership.score, 1);
        b.credit(e.side, e.user, e.displayName, R.membership.score);
        this.lead(e.side, e.displayName, e.user, R.membership.score);
        this.push(e.side, `${e.displayName} joined the guard! Knights deployed`);
        return;
      case 'gift': return this.gift(e);
      case 'opponent_identified':
        this.pk.opponent = e.opponent;
        this.creators.right = { name: e.opponent.nickname || e.opponent.uniqueId || 'OPPONENT', handle: e.opponent.uniqueId };
        this.push('right', `Opponent: ${this.creators.right.name}`);
        return;
      case 'pk_invitation':
        this.counters.pkSignals++;
        this.pk.phase = 'invited'; this.pk.battleId = e.battleId;
        if (e.inviter) this.pk.opponent = e.inviter;
        return;
      case 'pk_started': {
        this.counters.pkSignals++;
        this.pk.phase = 'live'; this.pk.battleId = e.battleId;
        this.pk.officialScore = { left: null, right: null }; this.lastOfficialRight = null;
        let dur = e.durationSec ?? R.durationSec;
        if (e.durationSec && e.startedAtMs) {
          this.pk.endsAtMs = e.startedAtMs + e.durationSec * 1000;
          dur = Math.max(30, Math.round((this.pk.endsAtMs - Date.now()) / 1000));
        } else this.pk.endsAtMs = e.durationSec ? Date.now() + e.durationSec * 1000 : null;
        if (b.phase !== 'battle' && b.phase !== 'countdown') b.start(dur);
        else b.syncTime(dur);
        this.push('left', 'PK BATTLE STARTED!');
        return;
      }
      case 'pk_score_updated': {
        this.counters.pkSignals++;
        for (const [anchorId, score] of Object.entries(e.scores)) {
          const side = this.sideOfAnchor(anchorId);
          if (!side) continue;
          this.pk.officialScore[side] = score;
          this.pk.officialTop[side] = (e.supporters[anchorId] ?? []).slice(0, 3).map(s => ({ nickname: s.nickname, score: s.score }));
          if (side === 'right') this.rightFromOfficial(score);
        }
        return;
      }
      case 'pk_ended':
        this.counters.pkSignals++;
        this.pk.phase = 'ended'; this.pk.endsAtMs = null;
        if (this.mode === 'pk') b.stop();
        return;
    }
  }

  private sideOfAnchor(anchorId: string): Side | null {
    if (this.hostUserId && anchorId === this.hostUserId) return 'left';
    if (this.pk.opponent && anchorId === this.pk.opponent.userId) return 'right';
    return null;
  }

  /**
   * Fallback attribution: without a connection to the opponent's room we cannot
   * see their viewers' gifts. The OFFICIAL PK score of the opponent is gift value
   * sent by THEIR audience, so its increase is converted to RIGHT-team actions.
   * Disabled when the opponent room is connected to avoid double counting.
   */
  private rightFromOfficial(score: number) {
    if (this.opponentRoomLive) { this.pk.rightAttribution = 'opponent_room'; this.lastOfficialRight = score; return; }
    this.pk.rightAttribution = 'official_score_delta';
    const prev = this.lastOfficialRight;
    this.lastOfficialRight = score;
    if (prev == null || score <= prev) return;
    const delta = Math.min(100000, score - prev);
    const { action } = tierFor(this.rules, delta, '');
    const name = `${this.creators.right.name} fans`;
    this.battle.act('right', action, 'opponent_fans', name, Math.max(1, Math.min(5, delta / Math.max(1, this.tierCoins(action)))));
    this.battle.addScore('right', 'coins', delta, this.rules.score.coin);
    this.push('right', `${name}: +${delta} PK points`);
  }

  private tierCoins(action: string) { return this.rules.giftTiers.find(t => t.action === action)?.minCoins ?? 1; }

  private gift(e: Extract<NormalizedEvent, { type: 'gift' }>) {
    const b = this.battle, R = this.rules;
    if (e.count > 0) {
      this.counters.gifts += e.count;
      const coins = e.coins * e.count;
      this.counters.coins += coins;
      const { action } = tierFor(R, e.coins, e.giftId);
      const spawn = Math.min(e.count, R.maxSpawnPerPacket);
      // Bigger gifts above the boss tier scale the power instead of spawning more.
      const power = action === 'boss' ? Math.max(1, Math.min(10, e.coins / this.tierCoins('boss'))) : 1;
      for (let i = 0; i < spawn; i++) b.act(e.side, action, e.user, e.displayName, power);
      const overflow = e.count - spawn;
      if (overflow > 0) b.act(e.side, 'strike', e.user, e.displayName, Math.min(20, overflow / 2));
      b.addScore(e.side, 'coins', Math.max(coins, e.count), R.score.coin);
      b.credit(e.side, e.user, e.displayName, Math.max(coins, e.count) * R.score.coin);
      this.lead(e.side, e.displayName, e.user, Math.max(coins, e.count) * R.score.coin, e.count);
      this.push(e.side, `${e.displayName} sent ${e.giftName}${e.comboTotal > 1 ? ` x${e.comboTotal}` : ''}`);
    }
    // Combo bonuses fire once per threshold per combo, using the cumulative total.
    const fired = this.combosFired.get(e.comboId) ?? new Set<number>();
    for (const c of R.combo) {
      if (e.comboTotal >= c.at && !fired.has(c.at)) {
        fired.add(c.at);
        b.act(e.side, c.action, e.user, e.displayName);
        b.addScore(e.side, 'combos', 1, R.score.combo);
        b.fx.push({ k: 'combo', side: e.side, label: c.label, by: e.displayName, total: e.comboTotal });
      }
    }
    this.combosFired.set(e.comboId, fired);
    if (e.comboEnded || this.combosFired.size > 2000) {
      if (e.comboEnded) this.combosFired.delete(e.comboId);
      while (this.combosFired.size > 2000) this.combosFired.delete(this.combosFired.keys().next().value as string);
    }
  }

  /** Advance one tick; handles phase transitions for continuous mode. */
  tick() {
    const b = this.battle;
    if (this.pk.phase === 'live' && this.pk.endsAtMs) b.syncTime((this.pk.endsAtMs - Date.now()) / 1000);
    b.tick();
    if (b.resultDone) {
      if (this.mode === 'continuous' || (this.rival && this.pk.phase !== 'live')) b.start();
      else b.phase = 'waiting';
    }
  }

  snapshot() {
    return {
      id: this.id, mode: this.mode, creators: this.creators,
      match: this.pk.phase === 'live' ? 'pk' : this.rival ? 'creator_battle' : 'none',
      rival: this.rival,
      pk: this.pk, battle: this.battle.snapshot(),
      feed: this.feed.slice(-6), leaderboard: this.leaderboard(5),
    };
  }

  /** Persistable state (leaderboards survive restarts; live battle state is short-lived). */
  persist() { return { id: this.id, leaders: [...this.leaders.entries()], counters: this.counters, round: this.battle.round }; }
  restore(p: ReturnType<Session['persist']>) {
    if (!p) return;
    this.leaders = new Map(p.leaders ?? []);
    Object.assign(this.counters, p.counters ?? {});
    this.battle.round = p.round ?? 0;
  }
}

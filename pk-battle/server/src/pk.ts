/**
 * Read-only PK telemetry parser for WebcastLinkMicBattle / LinkMicArmies /
 * LinkMicBattlePunishFinish. Official scores are passed through untouched;
 * the game never writes to, or claims to change, the TikTok PK score.
 */
import type { AnchorInfo, NormalizedEvent, Side, SupporterScore } from './types.js';
import { clean } from './normalizer.js';

type Raw = Record<string, any>;

// LinkMicBattleBattleAction (tiktok-live-proto v3)
const ACTION = { INVITE: 1, REJECT: 2, CANCEL: 3, OPEN: 4, FINISH: 5, CUT_SHORT: 6, ACCEPT: 7 } as const;
// BattleSettingsBattleStatus
const STATUS = { NOT_STARTED: 0, STARTED: 1, FINISHED: 2, PUNISH_STARTED: 3, PUNISH_FINISHED: 4 } as const;

/** Accepts either a protobuf map ({k: v}) or the repeated {key, value} form. */
function entries(x: unknown): [string, any][] {
  if (!x) return [];
  if (Array.isArray(x)) return x.map((e: any) => [String(e?.key ?? ''), e?.value ?? e] as [string, any]);
  if (typeof x === 'object') return Object.entries(x as Record<string, any>);
  return [];
}

function anchor(key: string, v: Raw | undefined): AnchorInfo | null {
  const u = v?.user ?? v;
  if (!u) return null;
  const userId = clean(u.userId || key, 32);
  if (!userId) return null;
  return { userId, uniqueId: clean(u.displayId || ''), nickname: clean(u.nickName || u.nickname || u.displayId || ''), roomId: clean(u.roomId || '', 32) };
}

export interface PkState {
  battleId: string;
  phase: 'idle' | 'invited' | 'live' | 'ended';
  anchors: AnchorInfo[];
  opponent: AnchorInfo | null;
  scores: Record<string, number>;
  durationSec: number | null;
  startedAtMs: number | null;
}

export class PkTracker {
  state: PkState = { battleId: '', phase: 'idle', anchors: [], opponent: null, scores: {}, durationSec: null, startedAtMs: null };
  private hostUserId = '';
  constructor(private hostUniqueId: string, private now: () => number = () => Date.now()) {}

  setHostUserId(id: string) { this.hostUserId = clean(id, 32); }
  get hostId() { return this.hostUserId; }

  private isHost(a: AnchorInfo) {
    return (this.hostUserId && a.userId === this.hostUserId) || (a.uniqueId && a.uniqueId.toLowerCase() === this.hostUniqueId.toLowerCase());
  }

  /** Returns 0..n normalized PK events for one raw connector message. */
  handle(kind: 'linkMicBattle' | 'linkMicArmies' | 'linkMicBattlePunishFinish', d: Raw, room: string): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    const base = { room, side: 'left' as Side, source: 'tiktok' as const, at: this.now() };
    const battleId = clean(d.battleId || d.battleSettings?.battleId || d.channelId || '', 40);
    if (!battleId) return out;
    const fresh = battleId !== this.state.battleId;
    if (fresh) this.state = { battleId, phase: 'idle', anchors: [], opponent: null, scores: {}, durationSec: null, startedAtMs: null };

    if (kind === 'linkMicBattle') {
      const anchors = entries(d.anchorsInfo).map(([k, v]) => anchor(k, v)).filter((a): a is AnchorInfo => !!a);
      if (anchors.length) this.state.anchors = anchors;
      const me = anchors.find(a => a.uniqueId && a.uniqueId.toLowerCase() === this.hostUniqueId.toLowerCase());
      if (me && !this.hostUserId) this.hostUserId = me.userId;
      const opponent = this.state.anchors.find(a => !this.isHost(a)) ?? null;
      if (opponent && opponent.userId !== this.state.opponent?.userId) {
        this.state.opponent = opponent;
        out.push({ ...base, type: 'opponent_identified', battleId, opponent });
      }
      const action = Number(d.action);
      const status = Number(d.battleSettings?.status);
      const dur = Number(d.battleSettings?.duration);
      const start = Number(d.battleSettings?.startTimeMs);
      if (Number.isFinite(dur) && dur > 0 && dur < 3600) this.state.durationSec = dur;
      if (Number.isFinite(start) && start > 0) this.state.startedAtMs = start;
      if (action === ACTION.INVITE && this.state.phase === 'idle') {
        this.state.phase = 'invited';
        out.push({ ...base, type: 'pk_invitation', battleId, inviter: opponent ?? undefined });
      }
      const started = action === ACTION.OPEN || action === ACTION.ACCEPT || status === STATUS.STARTED;
      const finished = action === ACTION.FINISH || action === ACTION.CUT_SHORT || status === STATUS.FINISHED || status === STATUS.PUNISH_STARTED || status === STATUS.PUNISH_FINISHED;
      if (started && !finished && this.state.phase !== 'live' && this.state.phase !== 'ended') {
        this.state.phase = 'live';
        out.push({ ...base, type: 'pk_started', battleId, durationSec: this.state.durationSec, startedAtMs: this.state.startedAtMs, anchors: this.state.anchors });
      }
      if (finished && this.state.phase !== 'ended') out.push(this.end(base, battleId, action === ACTION.CUT_SHORT ? 'cut_short' : 'finished', d.battleResult));
      if (action === ACTION.REJECT || action === ACTION.CANCEL) {
        if (this.state.phase === 'invited') out.push(this.end(base, battleId, action === ACTION.REJECT ? 'rejected' : 'cancelled', null));
      }
      // Some builds deliver the initial scores on the battle message itself.
      out.push(...this.scores(base, battleId, d.armies));
    } else if (kind === 'linkMicArmies') {
      out.push(...this.scores(base, battleId, d.armies));
    } else if (this.state.phase !== 'ended') {
      out.push(this.end(base, battleId, 'punish_finished', null));
    }
    return out;
  }

  private end(base: any, battleId: string, reason: string, rawResults: unknown): NormalizedEvent {
    this.state.phase = 'ended';
    const results: Record<string, string> = {};
    for (const [k, v] of entries(rawResults)) {
      const r = Number(v?.result);
      results[clean(v?.userId || k, 32)] = r === 0 ? 'win' : r === 1 ? 'lose' : r === 2 ? 'draw' : 'unknown';
    }
    return { ...base, type: 'pk_ended', battleId, reason, results };
  }

  private scores(base: any, battleId: string, armies: unknown): NormalizedEvent[] {
    const list = entries(armies);
    if (!list.length) return [];
    const scores: Record<string, number> = {}, supporters: Record<string, SupporterScore[]> = {};
    for (const [k, v] of list) {
      const id = clean(v?.anchorIdStr || k, 32);
      if (!id) continue;
      const s = Number(v?.hostscore ?? v?.hostScore);
      if (Number.isFinite(s)) scores[id] = s;
      supporters[id] = (Array.isArray(v?.userArmies) ? v.userArmies : []).slice(0, 10).map((u: Raw) => ({
        userId: clean(u.userIdStr || u.userId, 32), nickname: clean(u.nickname || 'viewer'), score: Number(u.score) || 0,
      }));
    }
    if (!Object.keys(scores).length) return [];
    this.state.scores = { ...this.state.scores, ...scores };
    return [{ ...base, type: 'pk_score_updated', battleId, scores, supporters }];
  }

  /** Which side an anchor id belongs to, for score display. */
  sideOf(anchorUserId: string): Side | null {
    const a = this.state.anchors.find(x => x.userId === anchorUserId);
    if (!a) return this.hostUserId === anchorUserId ? 'left' : null;
    return this.isHost(a) ? 'left' : 'right';
  }
}

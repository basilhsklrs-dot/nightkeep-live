/**
 * "Two Castles — One Battlefield": server-authoritative simulation.
 * Fixed 10 Hz tick; clients only render snapshots + fx and cannot mint actions.
 */
import type { ActionKind, Rules } from './rules.js';
import type { Side } from '../types.js';

export const FIELD = { length: 1000, leftWall: 120, rightWall: 880 };
const TICK = 0.1;

interface UnitDef { hp: number; atk: number; range: number; speed: number; cd: number; aoe: number; cost: number }
export const UNIT: Record<'soldier' | 'archer' | 'elite' | 'knight' | 'boss', UnitDef> = {
  soldier: { hp: 70, atk: 9, range: 20, speed: 48, cd: 0.8, aoe: 0, cost: 1 },
  archer: { hp: 45, atk: 12, range: 170, speed: 36, cd: 1.2, aoe: 0, cost: 5 },
  elite: { hp: 260, atk: 26, range: 24, speed: 52, cd: 0.7, aoe: 0, cost: 20 },
  knight: { hp: 420, atk: 34, range: 26, speed: 58, cd: 0.7, aoe: 18, cost: 30 },
  boss: { hp: 2600, atk: 110, range: 46, speed: 22, cd: 1.4, aoe: 55, cost: 100 },
};
export type UnitKind = keyof typeof UNIT;
export const UNIT_KINDS = Object.keys(UNIT) as UnitKind[];

export interface Unit { id: number; side: Side; kind: UnitKind; x: number; lane: number; hp: number; max: number; cd: number; owner: string; power: number; state: 0 | 1 }
export interface Castle { hp: number; max: number; shield: number }
export interface Contributor { user: string; name: string; side: Side; points: number }
export type Fx =
  | { k: 'spawn'; side: Side; kind: UnitKind; id: number; by: string }
  | { k: 'hit'; x: number; lane: number; dmg: number; side: Side }
  | { k: 'proj'; side: Side; from: number; to: number; lane: number; kind: 'arrow' | 'fire' | 'meteor' }
  | { k: 'boom'; x: number; r: number; side: Side }
  | { k: 'castle'; side: Side; dmg: number }
  | { k: 'shield'; side: Side; amount: number; by: string }
  | { k: 'boss'; side: Side; by: string }
  | { k: 'combo'; side: Side; label: string; by: string; total: number }
  | { k: 'banner'; text: string; side?: Side }
  | { k: 'kill'; x: number; lane: number; side: Side; kind: UnitKind }
  | { k: 'destroyed'; side: Side };

export type Phase = 'waiting' | 'countdown' | 'battle' | 'ended';

export interface TeamStats { score: number; damage: number; spawned: number; kills: number; defense: number; likes: number; coins: number; combos: number; energy: number; likeBank: number }
const emptyStats = (): TeamStats => ({ score: 0, damage: 0, spawned: 0, kills: 0, defense: 0, likes: 0, coins: 0, combos: 0, energy: 0, likeBank: 0 });

export interface BattleResult { winner: Side | 'draw'; reason: 'castle' | 'time' | 'stopped'; score: Record<Side, number> }

/** Deterministic PRNG so simulations are reproducible in tests. */
function mulberry(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Battle {
  phase: Phase = 'waiting';
  timeLeft = 0;
  phaseLeft = 0;
  castles: Record<Side, Castle>;
  stats: Record<Side, TeamStats> = { left: emptyStats(), right: emptyStats() };
  units: Unit[] = [];
  fx: Fx[] = [];
  contributors = new Map<string, Contributor>();
  result: BattleResult | null = null;
  round = 0;
  private nextId = 1;
  private rand: () => number;
  /** Actions received outside a running battle become reinforcements for the next one. */
  private reserve: { side: Side; action: ActionKind; owner: string; name: string; power: number }[] = [];

  constructor(public rules: Rules, seed = Date.now()) {
    this.rand = mulberry(seed);
    this.castles = { left: this.castle(), right: this.castle() };
  }
  private castle(): Castle { return { hp: this.rules.castleHp, max: this.rules.castleHp, shield: 0 }; }

  start(durationSec = this.rules.durationSec) {
    this.round++;
    this.castles = { left: this.castle(), right: this.castle() };
    this.stats = { left: emptyStats(), right: emptyStats() };
    this.units = []; this.result = null;
    this.contributors.clear();
    this.timeLeft = Math.max(30, Math.min(3600, durationSec));
    this.phase = 'countdown'; this.phaseLeft = this.rules.countdownSec;
    this.fx.push({ k: 'banner', text: 'WHO WILL WIN?' });
  }

  stop() { if (this.phase === 'battle' || this.phase === 'countdown') this.finish('stopped'); }

  /** Sync remaining time to the official PK clock when TikTok provides it. */
  syncTime(secLeft: number) { if (this.phase === 'battle' && secLeft > 0) this.timeLeft = secLeft; }

  credit(side: Side, owner: string, name: string, points: number) {
    if (!owner || points <= 0) return;
    const key = `${side}:${owner}`;
    const c = this.contributors.get(key) ?? { user: owner, name, side, points: 0 };
    c.points += points; c.name = name || c.name;
    this.contributors.set(key, c);
  }

  addScore(side: Side, key: keyof TeamStats, amount: number, weight: number) {
    if (this.phase !== 'battle') return; // scores are frozen outside a running battle
    (this.stats[side][key] as number) += amount;
    this.stats[side].score += amount * weight;
  }

  likes(side: Side, owner: string, name: string, count: number) {
    const s = this.stats[side], L = this.rules.likes;
    this.addScore(side, 'likes', count, this.rules.score.like);
    this.credit(side, owner, name, count * this.rules.score.like);
    if (this.phase !== 'battle') return;
    s.energy = Math.min(L.maxEnergy, s.energy + count * L.energyPerLike);
    s.likeBank += count;
    while (s.likeBank >= L.likesPerSoldier) { s.likeBank -= L.likesPerSoldier; this.act(side, 'soldier', owner, name, 1); }
  }

  /** Apply one abstract action. Returns false if it was queued (no running battle). */
  act(side: Side, action: ActionKind, owner: string, name: string, power = 1): boolean {
    if (this.phase !== 'battle') {
      if (this.reserve.length < 60) this.reserve.push({ side, action, owner, name, power });
      return false;
    }
    const enemy: Side = side === 'left' ? 'right' : 'left';
    const boost = 1 + (this.stats[side].energy / this.rules.likes.maxEnergy) * this.rules.likes.maxDamageBoost;
    switch (action) {
      case 'soldier': case 'archer': case 'elite': case 'knight': case 'boss': {
        if (this.units.filter(u => u.side === side).length >= this.rules.maxUnitsPerSide && action !== 'boss') {
          // Army full: convert to a direct strike so the viewer's gift still matters.
          this.strike(side, enemy, UNIT[action].cost * 25 * power * boost, 40, owner, name, 'fire');
          break;
        }
        const def = UNIT[action];
        const u: Unit = { id: this.nextId++, side, kind: action, x: side === 'left' ? FIELD.leftWall : FIELD.rightWall, lane: this.rand(), hp: def.hp * power, max: def.hp * power, cd: 0, owner, power, state: 0 };
        this.units.push(u);
        this.addScore(side, 'spawned', 1, this.rules.score.spawn);
        this.fx.push({ k: 'spawn', side, kind: action, id: u.id, by: name });
        if (action === 'boss') this.fx.push({ k: 'boss', side, by: name });
        break;
      }
      case 'strike': this.strike(side, enemy, 160 * power * boost, 55, owner, name, 'fire'); break;
      case 'heavy': this.strike(side, enemy, 700 * power * boost, 110, owner, name, 'meteor'); break;
      case 'shield': {
        const c = this.castles[side];
        const amount = Math.min(this.rules.maxShield - c.shield, 1500 * power);
        c.shield += Math.max(0, amount);
        this.addScore(side, 'defense', Math.max(0, amount), this.rules.score.defense);
        this.credit(side, owner, name, Math.max(0, amount) * this.rules.score.defense);
        this.fx.push({ k: 'shield', side, amount, by: name });
        break;
      }
    }
    return true;
  }

  /** Ranged blast at the enemy front line, or at the castle if the field is clear. */
  private strike(side: Side, enemy: Side, dmg: number, radius: number, owner: string, name: string, kind: 'fire' | 'meteor') {
    const foes = this.units.filter(u => u.side === enemy);
    const from = side === 'left' ? FIELD.leftWall : FIELD.rightWall;
    if (!foes.length) {
      this.fx.push({ k: 'proj', side, from, to: side === 'left' ? FIELD.rightWall : FIELD.leftWall, lane: 0.5, kind });
      this.hitCastle(enemy, side, dmg * 1.5, owner, name);
      return;
    }
    // Target the enemy closest to our castle (the most threatening).
    const front = foes.reduce((a, b) => (side === 'left' ? (b.x < a.x ? b : a) : (b.x > a.x ? b : a)));
    this.fx.push({ k: 'proj', side, from, to: front.x, lane: front.lane, kind });
    this.fx.push({ k: 'boom', x: front.x, r: radius, side });
    for (const u of foes) if (Math.abs(u.x - front.x) <= radius) this.damageUnit(u, dmg, side, owner, name);
  }

  private hitCastle(target: Side, by: Side, dmg: number, owner: string, name: string) {
    if (this.phase !== 'battle') return;
    const c = this.castles[target];
    const absorbed = Math.min(c.shield, dmg);
    c.shield -= absorbed;
    const real = Math.min(c.hp, dmg - absorbed);
    c.hp -= real;
    this.addScore(by, 'damage', dmg, this.rules.score.damage);
    this.credit(by, owner, name, dmg * this.rules.score.damage);
    this.fx.push({ k: 'castle', side: target, dmg: Math.round(dmg) });
    if (c.hp <= 0) { this.fx.push({ k: 'destroyed', side: target }); this.finish('castle', by); }
  }

  private damageUnit(u: Unit, dmg: number, by: Side, owner: string, name: string) {
    const real = Math.min(u.hp, dmg);
    u.hp -= dmg;
    this.addScore(by, 'damage', real, this.rules.score.damage);
    this.credit(by, owner, name, real * this.rules.score.damage);
    this.fx.push({ k: 'hit', x: u.x, lane: u.lane, dmg: Math.round(dmg), side: by });
    if (u.hp <= 0) {
      this.addScore(by, 'kills', 1, this.rules.score.kill);
      this.credit(by, owner, name, this.rules.score.kill);
      this.fx.push({ k: 'kill', x: u.x, lane: u.lane, side: u.side, kind: u.kind });
    }
  }

  private finish(reason: BattleResult['reason'], winner?: Side) {
    if (this.phase === 'ended') return;
    const s = { left: Math.round(this.stats.left.score), right: Math.round(this.stats.right.score) };
    const w: Side | 'draw' = winner ?? (s.left === s.right ? 'draw' : s.left > s.right ? 'left' : 'right');
    this.result = { winner: w, reason, score: s };
    this.phase = 'ended'; this.phaseLeft = this.rules.resultSec;
    this.fx.push({ k: 'banner', text: w === 'draw' ? 'DRAW!' : 'VICTORY!', side: w === 'draw' ? undefined : w });
  }

  tick(dt = TICK) {
    if (this.phase === 'countdown') {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) {
        this.phase = 'battle';
        this.fx.push({ k: 'banner', text: 'FIGHT!' });
        const queued = this.reserve.splice(0);
        for (const r of queued) this.act(r.side, r.action, r.owner, r.name, r.power);
      }
      return;
    }
    if (this.phase === 'ended') { this.phaseLeft -= dt; return; }
    if (this.phase !== 'battle') return;
    this.timeLeft -= dt;
    for (const side of ['left', 'right'] as Side[]) {
      const s = this.stats[side];
      s.energy = Math.max(0, s.energy - this.rules.likes.decayPerSec * dt);
    }
    this.step(dt);
    if (this.phase === 'battle' && this.timeLeft <= 0) this.finish('time');
  }

  private step(dt: number) {
    const left = this.units.filter(u => u.side === 'left'), right = this.units.filter(u => u.side === 'right');
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const def = UNIT[u.kind];
      const dir = u.side === 'left' ? 1 : -1;
      const foes = u.side === 'left' ? right : left;
      u.cd = Math.max(0, u.cd - dt);
      let target: Unit | null = null, best = Infinity;
      for (const f of foes) {
        if (f.hp <= 0) continue;
        const ahead = (f.x - u.x) * dir;
        if (ahead >= -10 && ahead < best && ahead <= def.range) { best = ahead; target = f; }
      }
      const wall = u.side === 'left' ? FIELD.rightWall : FIELD.leftWall;
      const atWall = (wall - u.x) * dir <= def.range;
      if (target || atWall) {
        u.state = 1;
        if (u.cd <= 0) {
          u.cd = def.cd;
          const boost = 1 + (this.stats[u.side].energy / this.rules.likes.maxEnergy) * this.rules.likes.maxDamageBoost;
          const dmg = def.atk * u.power * boost;
          const name = this.contributors.get(`${u.side}:${u.owner}`)?.name ?? u.owner;
          if (u.kind === 'archer') this.fx.push({ k: 'proj', side: u.side, from: u.x, to: target ? target.x : wall, lane: target ? target.lane : u.lane, kind: 'arrow' });
          if (target) {
            if (def.aoe) { for (const f of foes) if (f.hp > 0 && Math.abs(f.x - target.x) <= def.aoe) this.damageUnit(f, dmg, u.side, u.owner, name); }
            else this.damageUnit(target, dmg, u.side, u.owner, name);
          } else this.hitCastle(u.side === 'left' ? 'right' : 'left', u.side, dmg, u.owner, name);
          if (this.phase !== 'battle') return;
        }
      } else {
        u.state = 0;
        u.x += dir * def.speed * dt;
      }
    }
    this.units = this.units.filter(u => u.hp > 0);
  }

  /** True once the result screen has been shown long enough. */
  get resultDone() { return this.phase === 'ended' && this.phaseLeft <= 0; }

  topContributors(side: Side, n = 5) {
    return [...this.contributors.values()].filter(c => c.side === side).sort((a, b) => b.points - a.points).slice(0, n)
      .map(c => ({ name: c.name, points: Math.round(c.points) }));
  }

  drainFx() { const f = this.fx; this.fx = []; return f; }

  snapshot() {
    const r = (n: number) => Math.round(n);
    return {
      phase: this.phase, round: this.round,
      timeLeft: Math.max(0, Math.ceil(this.timeLeft)), phaseLeft: Math.max(0, Math.ceil(this.phaseLeft)),
      castles: { left: { hp: r(this.castles.left.hp), max: this.castles.left.max, shield: r(this.castles.left.shield) }, right: { hp: r(this.castles.right.hp), max: this.castles.right.max, shield: r(this.castles.right.shield) } },
      score: { left: r(this.stats.left.score), right: r(this.stats.right.score) },
      energy: { left: r(this.stats.left.energy), right: r(this.stats.right.energy) },
      // [id, side(0/1), kindIndex, x, lane*100, hp%, state]
      units: this.units.map(u => [u.id, u.side === 'left' ? 0 : 1, UNIT_KINDS.indexOf(u.kind), r(u.x), r(u.lane * 100), r((u.hp / u.max) * 100), u.state]),
      top: { left: this.topContributors('left'), right: this.topContributors('right') },
      result: this.result,
      reserve: this.reserve.length,
    };
  }
}

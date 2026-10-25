import test from 'node:test';
import assert from 'node:assert/strict';
import { Normalizer } from '../dist/normalizer.js';
import { PkTracker } from '../dist/pk.js';
import { Battle } from '../dist/engine/battle.js';
import { defaultRules, loadRules, tierFor } from '../dist/engine/rules.js';
import { Session } from '../dist/session.js';

const user = { uniqueId: 'alice', userId: '11', nickname: 'Alice' };
const rose = (repeatCount, repeatEnd = 0, groupId = 'g1', msgId = 'm1') => ({ common: { msgId }, user, giftId: '5655', repeatCount, repeatEnd, groupId, gift: { name: 'Rose', diamondCount: 1, type: 1 } });

test('combo of 20 counts exactly 20 gifts across cumulative updates and duplicates', () => {
  const n = new Normalizer();
  let total = 0, events = 0;
  for (let c = 1; c <= 20; c++) {
    for (const dup of [0, 1]) { // every update delivered twice
      const e = n.normalize('gift', rose(c, c === 20 ? 1 : 0), 'host', 'left');
      if (e) { total += e.count; events++; assert.equal(e.comboTotal, c); }
      void dup;
    }
  }
  assert.equal(total, 20);
  assert.equal(n.normalize('gift', rose(20, 1), 'host', 'left'), null, 'final packet replay ignored');
});

test('skipped cumulative updates still produce the right total', () => {
  const n = new Normalizer();
  const counts = [1, 4, 9, 9, 15];
  const total = counts.map(c => n.normalize('gift', rose(c, c === 15 ? 1 : 0), 'host', 'left')).filter(Boolean).reduce((a, e) => a + e.count, 0);
  assert.equal(total, 15);
});

test('non-streak gift is deduplicated by msgId; follows rewarded once per viewer', () => {
  const n = new Normalizer();
  const g = { common: { msgId: 'x9' }, user, giftId: '1', repeatCount: 1, gift: { name: 'Universe', diamondCount: 34999, type: 0 } };
  assert.equal(n.normalize('gift', g, 'host', 'left').coins, 34999);
  assert.equal(n.normalize('gift', g, 'host', 'left'), null);
  assert.ok(n.normalize('follow', { common: { msgId: 'f1' }, user }, 'host', 'left'));
  assert.equal(n.normalize('follow', { common: { msgId: 'f2' }, user }, 'host', 'left'), null);
});

test('likes keep the room team and same msgId is replay-protected', () => {
  const n = new Normalizer();
  const e = n.normalize('like', { common: { msgId: 'l1' }, user, count: 15 }, 'rival', 'right');
  assert.equal(e.side, 'right'); assert.equal(e.count, 15);
  assert.equal(n.normalize('like', { common: { msgId: 'l1' }, user, count: 15 }, 'rival', 'right'), null);
});

test('gift tiers map by verified coin value and giftId overrides win', () => {
  assert.equal(tierFor(defaultRules, 1, '').action, 'soldier');
  assert.equal(tierFor(defaultRules, 4, '').action, 'strike');
  assert.equal(tierFor(defaultRules, 30, '').action, 'elite');
  assert.equal(tierFor(defaultRules, 34999, '').action, 'boss');
  assert.equal(tierFor(defaultRules, 0, '').action, 'soldier');
  const r = loadRules(undefined, '{"5655":"shield"}');
  assert.equal(tierFor(r, 1, '5655').action, 'shield');
  assert.throws(() => loadRules(undefined, '{"1":"nuke"}'));
});

const battleMsg = (action, status, extra = {}) => ({
  battleId: 'B1', action, battleSettings: { battleId: 'B1', status, duration: 300, startTimeMs: String(Date.now()) },
  anchorsInfo: [{ key: '100', value: { user: { userId: '100', displayId: 'nightkeep.live', nickName: 'NightKeep', roomId: 'r1' } } }, { key: '200', value: { user: { userId: '200', displayId: 'rival.live', nickName: 'Rival', roomId: 'r2' } } }],
  ...extra,
});

test('PK tracker: invitation -> opponent -> start -> scores -> end, each once', () => {
  const t = new PkTracker('nightkeep.live');
  const a = t.handle('linkMicBattle', battleMsg(1, 0), 'nightkeep.live').map(e => e.type);
  assert.deepEqual(a, ['opponent_identified', 'pk_invitation']);
  assert.equal(t.hostId, '100');
  const b = t.handle('linkMicBattle', battleMsg(4, 1), 'nightkeep.live').map(e => e.type);
  assert.deepEqual(b, ['pk_started']);
  assert.deepEqual(t.handle('linkMicBattle', battleMsg(4, 1), 'nightkeep.live'), [], 'repeat start ignored');
  const s = t.handle('linkMicArmies', { battleId: 'B1', armies: { 100: { hostscore: '50', anchorIdStr: '100', userArmies: [{ userIdStr: '9', nickname: 'Top', score: '50' }] }, 200: { hostscore: '75', anchorIdStr: '200', userArmies: [] } } }, 'nightkeep.live');
  assert.equal(s[0].type, 'pk_score_updated'); assert.equal(s[0].scores['200'], 75);
  assert.equal(t.sideOf('200'), 'right'); assert.equal(t.sideOf('100'), 'left');
  const end = t.handle('linkMicBattle', battleMsg(5, 2, { battleResult: { 100: { userId: '100', result: 0 }, 200: { userId: '200', result: 1 } } }), 'nightkeep.live');
  assert.equal(end.at(-1).type, 'pk_ended'); assert.equal(end.at(-1).results['100'], 'win');
  assert.deepEqual(t.handle('linkMicBattlePunishFinish', { battleId: 'B1' }, 'nightkeep.live'), []);
});

test('battle: heavy attacks destroy a castle and the attacker wins', () => {
  const b = new Battle({ ...defaultRules, castleHp: 3000, countdownSec: 0.1 }, 1);
  b.start(120); b.tick(); b.tick();
  assert.equal(b.phase, 'battle');
  for (let i = 0; i < 5 && b.phase === 'battle'; i++) b.act('left', 'heavy', 'u', 'U');
  assert.equal(b.phase, 'ended');
  assert.equal(b.result.winner, 'left'); assert.equal(b.result.reason, 'castle');
  assert.ok(b.topContributors('left')[0].points > 0);
});

test('battle: shields absorb damage and time-out picks highest score', () => {
  const b = new Battle({ ...defaultRules, countdownSec: 0.1 }, 2);
  b.start(30); b.tick(); b.tick();
  b.act('right', 'shield', 'r', 'R');
  assert.equal(b.castles.right.shield, 1500);
  b.act('left', 'strike', 'l', 'L');
  assert.equal(b.castles.right.hp, b.castles.right.max, 'shield absorbed the strike');
  for (let i = 0; i < 10; i++) b.act('left', 'soldier', 'l', 'L');
  for (let i = 0; i < 400; i++) b.tick();
  assert.equal(b.phase, 'ended'); assert.equal(b.result.reason, 'time');
  assert.equal(b.result.winner, 'left');
});

test('battle: units march, fight and die; actions before battle become reinforcements', () => {
  const b = new Battle({ ...defaultRules, countdownSec: 0.1 }, 3);
  assert.equal(b.act('left', 'elite', 'a', 'A'), false);
  b.start(300); b.tick(); b.tick();
  assert.equal(b.units.length, 1, 'reserve deployed at FIGHT');
  for (let i = 0; i < 8; i++) b.act('right', 'soldier', 'b', 'B');
  for (let i = 0; i < 300; i++) b.tick();
  assert.ok(b.stats.left.kills + b.stats.right.kills > 0);
});

test('session: combo bonus fires once per threshold; gift totals correct', () => {
  const s = new Session('h', { ...defaultRules, countdownSec: 0.1 }, { name: 'H', handle: 'h' }, 'continuous', 4);
  s.tick(); s.tick();
  const n = new Normalizer();
  let fired = 0;
  for (let c = 1; c <= 12; c++) for (const dup of [0, 1]) {
    void dup;
    const e = n.normalize('gift', rose(c, c === 12 ? 1 : 0), 'h', 'left');
    if (e) { s.handle(e); fired += s.battle.fx.filter(f => f.k === 'combo').length; s.battle.drainFx(); }
  }
  assert.equal(s.counters.gifts, 12);
  assert.equal(fired, 1, 'x10 combo bonus exactly once');
});

test('session: official opponent score delta drives RIGHT only when opponent room is not connected', () => {
  const s = new Session('nightkeep.live', { ...defaultRules, countdownSec: 0.1 }, { name: 'NK', handle: 'nightkeep.live' }, 'pk', 5);
  s.setHostUserId('100');
  s.handle({ type: 'opponent_identified', room: 'x', side: 'left', source: 'tiktok', at: 0, battleId: 'B', opponent: { userId: '200', uniqueId: 'rival', nickname: 'Rival', roomId: '' } });
  s.handle({ type: 'pk_started', room: 'x', side: 'left', source: 'tiktok', at: 0, battleId: 'B', durationSec: 300, startedAtMs: Date.now(), anchors: [] });
  s.tick(); s.tick();
  assert.equal(s.battle.phase, 'battle');
  const score = (l, r) => s.handle({ type: 'pk_score_updated', room: 'x', side: 'left', source: 'tiktok', at: 0, battleId: 'B', scores: { 100: l, 200: r }, supporters: {} });
  score(0, 0); score(0, 30);
  assert.equal(s.pk.officialScore.right, 30);
  assert.equal(s.pk.rightAttribution, 'official_score_delta');
  assert.equal(s.battle.units.filter(u => u.side === 'right').length, 1);
  s.opponentRoomLive = true; score(0, 90);
  assert.equal(s.battle.units.filter(u => u.side === 'right').length, 1, 'no double counting');
  s.handle({ type: 'pk_ended', room: 'x', side: 'left', source: 'tiktok', at: 0, battleId: 'B', reason: 'finished', results: {} });
  assert.equal(s.battle.phase, 'ended');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { startServer } from '../dist/server.js';

const env = { PORT: '0', DEMO_MODE: 'true', ADMIN_TOKEN: 'adm', DEVICE_TOKEN: 'dev', DATA_DIR: mkdtempSync(join(tmpdir(), 'pk-')) };

test('server: health, auth, sim, device report, websocket snapshots', async () => {
  const app = await startServer(env);
  const base = `http://127.0.0.1:${app.port}`;
  try {
    const h = await (await fetch(`${base}/healthz`)).json();
    assert.equal(h.ok, true); assert.equal(h.demo, true);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/api/diagnostics`)).status, 401);
    assert.equal((await fetch(`${base}/api/control`, { method: 'POST', body: '{}' })).status, 401);
    const post = (p, b, t) => fetch(base + p, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: JSON.stringify(b) });
    assert.equal((await post('/api/sim', { events: [] }, 'wrong')).status, 401);
    const sim = await (await post('/api/sim', { events: [{ type: 'gift', side: 'right', coins: 100, giftName: 'Hand Hearts' }, { type: 'like', side: 'left', count: 50 }, { type: 'bogus', side: 'left' }] }, 'adm')).json();
    assert.equal(sim.applied, 2);
    assert.equal((await post('/api/device/report', { kind: 'pk_accept_clicked', inviter: 'rival' }, 'adm')).status, 401, 'admin token is not a device token');
    assert.equal((await post('/api/device/report', { kind: 'pk_accept_clicked', inviter: 'rival', mode: 'auto' }, 'dev')).status, 200);
    const d = await (await fetch(`${base}/api/diagnostics`, { headers: { Authorization: 'Bearer dev' } })).json();
    assert.equal(d.device.at(-1).inviter, 'rival');
    assert.equal(d.simulatedRecently, true);
    assert.equal((await (await post('/api/control', { action: 'start', durationSec: 60 }, 'dev')).json()).phase, 'countdown');

    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    const msgs = [];
    await new Promise((ok, fail) => { ws.on('message', m => { msgs.push(JSON.parse(m)); if (msgs.length >= 3) ok(); }); ws.on('error', fail); setTimeout(() => fail(new Error('timeout')), 5000); });
    ws.send(JSON.stringify({ type: 'like', count: 99999 })); // must have no effect
    ws.close();
    assert.equal(msgs[0].type, 'hello');
    const st = msgs.find(m => m.type === 'state');
    assert.ok(st.s.battle.castles.left.hp > 0);
    assert.equal(st.simulated, true);
    const bad = new WebSocket(`ws://127.0.0.1:${app.port}/ws?session=nobody`);
    await new Promise(ok => { bad.on('error', ok); bad.on('unexpected-response', ok); });
  } finally { await app.close(); }
});

test('server: sim endpoint is disabled outside demo unless ALLOW_SIM', async () => {
  const app = await startServer({ PORT: '0', TIKTOK_USERNAME: 'nightkeep.live', EULER_API_KEY: '', DATA_DIR: env.DATA_DIR, CONNECT_OPPONENT: 'false' });
  try {
    const r = await fetch(`http://127.0.0.1:${app.port}/api/sim`, { method: 'POST', body: '{"events":[]}' });
    assert.equal(r.status, 403);
  } finally { await app.close(); }
});

test('server: real PK telemetry flows through and correlates a device accept', async () => {
  const app = await startServer({ ...env, DEMO_MODE: 'false', TIKTOK_USERNAME: 'nightkeep.live', CONNECT_OPPONENT: 'false', PORT: '0' });
  const base = `http://127.0.0.1:${app.port}`;
  try {
    await fetch(`${base}/api/device/report`, { method: 'POST', headers: { Authorization: 'Bearer dev' }, body: JSON.stringify({ kind: 'pk_accept_clicked', inviter: 'Rival' }) });
    const anchors = [{ key: '100', value: { user: { userId: '100', displayId: 'nightkeep.live', nickName: 'NK' } } }, { key: '200', value: { user: { userId: '200', displayId: 'rival.live', nickName: 'Rival' } } }];
    app.handlePk('nightkeep.live', 'linkMicBattle', { battleId: 'B9', action: 4, battleSettings: { status: 1, duration: 300, startTimeMs: String(Date.now()) }, anchorsInfo: anchors });
    const d = await (await fetch(`${base}/api/diagnostics`, { headers: { Authorization: 'Bearer dev' } })).json();
    assert.equal(d.pk.phase, 'live');
    assert.equal(d.pk.opponent.uniqueId, 'rival.live');
    assert.equal(d.verifiedAccepts, 1);
    const s = await (await fetch(`${base}/api/state`)).json();
    assert.equal(s.creators.right.name, 'Rival');
    assert.equal(s.simulated, false);
  } finally { await app.close(); }
});

test('server: Creator Battle connects the rival room to the RIGHT team and loops battles', async () => {
  const app = await startServer({ ...env, DEMO_MODE: 'false', TIKTOK_USERNAME: 'nightkeep.live', PORT: '0' });
  const base = `http://127.0.0.1:${app.port}`;
  const post = b => fetch(`${base}/api/control`, { method: 'POST', headers: { Authorization: 'Bearer dev' }, body: JSON.stringify(b) });
  try {
    assert.equal((await post({ action: 'rival', rival: 'nightkeep.live' })).status, 400, 'cannot battle yourself');
    const r = await (await post({ action: 'rival', rival: '@rival.creator' })).json();
    assert.equal(r.rival, 'rival.creator'); assert.equal(r.phase, 'countdown');
    const slot = app.slots.get('nightkeep.live');
    assert.equal(slot.opponent.uniqueId, 'rival.creator');
    assert.equal(slot.opponent.side, 'right');
    const s = await (await fetch(`${base}/api/state`)).json();
    assert.equal(s.match, 'creator_battle'); assert.equal(s.creators.right.handle, 'rival.creator');
    await post({ action: 'rival_stop' });
    assert.equal(slot.opponent, undefined);
    assert.equal((await (await fetch(`${base}/api/state`)).json()).match, 'none');
  } finally { await app.close(); }
});

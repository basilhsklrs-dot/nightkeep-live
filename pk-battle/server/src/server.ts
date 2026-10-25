/**
 * NIGHTKEEP PK BATTLE — HTTP + WebSocket server (Node 22+).
 * Server-authoritative: viewers' TikTok events drive the simulation; game
 * clients only receive snapshots. Control/sim/device endpoints need tokens.
 */
import http from 'node:http';
import { readFile, readdir, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join, extname } from 'node:path';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { loadRules } from './engine/rules.js';
import { Session, type Mode } from './session.js';
import { RoomSource } from './ingest.js';
import { PkTracker } from './pk.js';
import { clean } from './normalizer.js';
import { simEvent, demoTraffic, type SimInput } from './sim.js';
import type { NormalizedEvent, Side } from './types.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp' };

interface DeviceReport { at: number; kind: string; inviter: string; detail: string; mode: string }

interface Slot {
  session: Session;
  tracker: PkTracker;
  host?: RoomSource;
  opponent?: RoomSource;
  opponentStopTimer?: NodeJS.Timeout;
  device: DeviceReport[];
  /** Last UI dumps from the tablet (TikTok screen text/ids) for calibrating invitation recognition. */
  dumps: { at: number; reason: string; dump: string }[];
  lastSimAt: number;
  verifiedAccepts: number;
}

const safeEq = (a: string, b: string) => {
  const x = createHash('sha256').update(a).digest(), y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
};

export async function startServer(env: NodeJS.ProcessEnv = process.env) {
  const demo = env.DEMO_MODE === 'true' || process.argv.includes('--demo');
  const rules = loadRules(env.GAME_RULES, env.GIFT_ID_MAP);
  const mode: Mode = env.GAME_MODE === 'continuous' || demo ? 'continuous' : 'pk';
  const hosts = (env.TIKTOK_USERNAMES || env.TIKTOK_USERNAME || (demo ? 'demo' : '')).split(',').map(h => clean(h).trim().replace(/^@/, '')).filter(Boolean);
  if (!hosts.length) throw new Error('Set TIKTOK_USERNAME (without @), or DEMO_MODE=true.');
  for (const h of hosts) if (!/^[\w.]{2,64}$/.test(h)) throw new Error(`Invalid TikTok username: ${h}`);
  const adminToken = env.ADMIN_TOKEN || '', deviceToken = env.DEVICE_TOKEN || '';
  const allowSim = demo || env.ALLOW_SIM === 'true';
  const connectOpponent = env.CONNECT_OPPONENT !== 'false';
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const dataDir = env.DATA_DIR || fileURLToPath(new URL('../data/', import.meta.url));
  const instance = randomUUID();
  const started = Date.now();
  const slots = new Map<string, Slot>();

  // ---------- persistence ----------
  let saved: Record<string, any> = {};
  try { saved = JSON.parse(await readFile(join(dataDir, 'sessions.json'), 'utf8')); } catch { /* first boot */ }
  async function persist() {
    try {
      await mkdir(dataDir, { recursive: true });
      const out: Record<string, any> = {};
      for (const [id, s] of slots) out[id] = s.session.persist();
      const tmp = join(dataDir, `sessions.${process.pid}.tmp`);
      await writeFile(tmp, JSON.stringify(out));
      await rename(tmp, join(dataDir, 'sessions.json'));
    } catch (e: any) { console.warn('persist failed', clean(e?.message, 120)); }
  }

  // ---------- sessions ----------
  const route = (slot: Slot, e: NormalizedEvent) => {
    if (e.source === 'sim') slot.lastSimAt = Date.now();
    slot.session.handle(e);
  };

  function attachOpponent(slot: Slot, uniqueId: string) {
    if (!connectOpponent || demo || !uniqueId || slot.opponent?.uniqueId === uniqueId) return;
    clearTimeout(slot.opponentStopTimer);
    void slot.opponent?.stop();
    const src = new RoomSource(uniqueId, 'right', env.EULER_API_KEY, 3);
    slot.opponent = src;
    src.on('event', e => route(slot, e));
    src.on('state', st => { slot.session.opponentRoomLive = st === 'live'; if (st === 'live') slot.session.pk.rightAttribution = 'opponent_room'; });
    src.start();
    console.info(JSON.stringify({ session: slot.session.id, opponent_room: uniqueId, action: 'connect' }));
  }

  function handlePk(slot: Slot, kind: Parameters<PkTracker['handle']>[0], d: any, room: string) {
    for (const e of slot.tracker.handle(kind, d, room)) {
      if (slot.tracker.hostId) slot.session.setHostUserId(slot.tracker.hostId);
      console.info(JSON.stringify({ session: slot.session.id, pk_event: e.type, battleId: (e as any).battleId }));
      route(slot, e);
      if (e.type === 'opponent_identified') attachOpponent(slot, e.opponent.uniqueId);
      if (e.type === 'pk_started') {
        // Correlate with an Auto Accept click reported by the tablet in the last 90 s.
        const recent = slot.device.find(r => r.kind === 'pk_accept_clicked' && Date.now() - r.at < 90_000);
        if (recent) { slot.verifiedAccepts++; recent.detail = `${recent.detail} | verified: pk_started ${e.battleId}`.slice(0, 200); }
      }
      if (e.type === 'pk_ended' && slot.opponent) {
        clearTimeout(slot.opponentStopTimer);
        slot.opponentStopTimer = setTimeout(() => { void slot.opponent?.stop(); slot.opponent = undefined; slot.session.opponentRoomLive = false; }, 30_000);
      }
    }
  }

  for (const host of hosts) {
    const session = new Session(host, rules, { name: env.HOST_DISPLAY_NAME || host, handle: host }, mode);
    session.restore(saved[host]);
    const slot: Slot = { session, tracker: new PkTracker(host), device: [], dumps: [], lastSimAt: 0, verifiedAccepts: 0 };
    slots.set(host, slot);
    if (!demo) {
      const src = new RoomSource(host, 'left', env.EULER_API_KEY);
      slot.host = src;
      src.on('event', e => route(slot, e));
      src.on('pk', (kind, d, room) => handlePk(slot, kind, d, room));
      src.on('connected', ({ ownerUserId }) => { if (ownerUserId) { slot.tracker.setHostUserId(ownerUserId); session.setHostUserId(ownerUserId); } });
      src.on('state', st => console.info(JSON.stringify({ session: host, host_room: st })));
      src.start();
    }
  }
  const defaultId = hosts[0];
  const demoTimers = demo ? [...slots.values()].map(slot => demoTraffic(e => route(slot, e))) : [];
  if (demo) for (const slot of slots.values()) slot.session.creators.right = { name: 'RIVAL (SIM)', handle: '' };

  // ---------- http ----------
  const publicFiles = new Set((await readdir(PUBLIC, { recursive: true })).map(f => '/' + String(f).replace(/\\/g, '/')));
  const json = (res: http.ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const bearer = (req: http.IncomingMessage) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const authorized = (req: http.IncomingMessage, ...tokens: string[]) => { const t = bearer(req); return !!t && tokens.some(k => k && safeEq(t, k)); };
  const body = (req: http.IncomingMessage) => new Promise<any>((ok, fail) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', c => { size += c.length; if (size > 65536) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { fail(new Error('bad json')); } });
    req.on('error', fail);
  });
  const slotOf = (id: string | null) => slots.get(clean(id || defaultId).replace(/^@/, ''));

  const diagnostics = (slot: Slot, url?: URL) => ({
    instance, uptimeSec: Math.floor((Date.now() - started) / 1000), demo, mode: slot.session.mode, allowSim,
    simulatedRecently: demo || Date.now() - slot.lastSimAt < 60_000,
    host: slot.host?.diagnostics() ?? null, opponent: slot.opponent?.diagnostics() ?? null,
    pk: slot.session.pk, tracker: slot.tracker.state, counters: slot.session.counters,
    samples: url?.searchParams.get('samples') === '1' ? [...(slot.host?.samples ?? []), ...(slot.opponent?.samples ?? [])] : undefined,
    device: slot.device.slice(-30), dumps: url?.searchParams.get('dumps') === '1' ? slot.dumps : slot.dumps.length, verifiedAccepts: slot.verifiedAccepts,
    clients: wss.clients.size, rules: { giftTiers: rules.giftTiers, combo: rules.combo, giftIdMapSize: Object.keys(rules.giftIdMap).length },
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (path === '/healthz') return json(res, 200, { ok: true, instance, demo, sessions: [...slots.values()].map(s => ({ id: s.session.id, host: s.host?.state ?? 'demo', pk: s.session.pk.phase, phase: s.session.battle.phase })) });
      if (req.method === 'GET' && path === '/api/sessions') return json(res, 200, [...slots.keys()]);
      if (req.method === 'GET' && path === '/api/state') { const s = slotOf(url.searchParams.get('session')); return s ? json(res, 200, { ...s.session.snapshot(), simulated: diagnostics(s).simulatedRecently }) : json(res, 404, { error: 'unknown session' }); }
      if (req.method === 'GET' && path === '/api/diagnostics') {
        if ((adminToken || deviceToken) && !authorized(req, adminToken, deviceToken)) return json(res, 401, { error: 'token required' });
        const s = slotOf(url.searchParams.get('session')); return s ? json(res, 200, diagnostics(s, url)) : json(res, 404, { error: 'unknown session' });
      }
      if (req.method === 'POST' && path === '/api/control') {
        if (!authorized(req, adminToken, deviceToken)) return json(res, 401, { error: 'token required' });
        const b = await body(req); const s = slotOf(b.session);
        if (!s) return json(res, 404, { error: 'unknown session' });
        if (b.action === 'start') s.session.battle.start(Number(b.durationSec) || rules.durationSec);
        else if (b.action === 'stop') s.session.battle.stop();
        else if (b.action === 'mode' && (b.mode === 'pk' || b.mode === 'continuous')) { s.session.mode = b.mode; if (b.mode === 'continuous' && s.session.battle.phase === 'waiting') s.session.battle.start(); }
        else return json(res, 400, { error: 'unknown action' });
        return json(res, 200, { ok: true, phase: s.session.battle.phase, mode: s.session.mode });
      }
      if (req.method === 'POST' && path === '/api/sim') {
        if (!allowSim) return json(res, 403, { error: 'simulation disabled (set ALLOW_SIM=true)' });
        if (adminToken && !authorized(req, adminToken)) return json(res, 401, { error: 'admin token required' });
        const b = await body(req); const s = slotOf(b.session);
        if (!s) return json(res, 404, { error: 'unknown session' });
        const list: SimInput[] = Array.isArray(b.events) ? b.events.slice(0, 200) : [];
        let n = 0;
        for (const i of list) if (i && (i.side === 'left' || i.side === 'right') && ['like', 'gift', 'follow', 'membership', 'viewer_join'].includes(i.type)) { route(s, simEvent(i)); n++; }
        return json(res, 200, { ok: true, applied: n });
      }
      if (req.method === 'POST' && path === '/api/device/report') {
        if (!deviceToken || !authorized(req, deviceToken)) return json(res, 401, { error: 'device token required' });
        const b = await body(req); const s = slotOf(b.session);
        if (!s) return json(res, 404, { error: 'unknown session' });
        const kinds = ['pk_invitation_seen', 'pk_accept_clicked', 'pk_accept_failed', 'pk_accept_skipped', 'service_state', 'ui_capture'];
        if (!kinds.includes(b.kind)) return json(res, 400, { error: 'unknown kind' });
        s.device.push({ at: Date.now(), kind: b.kind, inviter: clean(b.inviter, 64), detail: clean(b.detail, 200), mode: clean(b.mode, 12) });
        if (s.device.length > 100) s.device.shift();
        if (b.kind === 'ui_capture' && typeof b.dump === 'string') {
          // Keep control characters out but preserve line breaks of the dump.
          s.dumps.push({ at: Date.now(), reason: clean(b.detail, 120), dump: String(b.dump).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, 12000) });
          if (s.dumps.length > 8) s.dumps.shift();
        }
        return json(res, 200, { ok: true, pk: s.session.pk.phase, battle: s.session.battle.phase });
      }
      if (req.method === 'GET') {
        const file = path === '/' ? '/index.html' : path;
        if (publicFiles.has(file)) {
          const data = await readFile(join(PUBLIC, file));
          res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
          return res.end(data);
        }
      }
      res.writeHead(404); res.end('Not found');
    } catch (e: any) {
      if (!res.headersSent) json(res, 400, { error: clean(e?.message || 'bad request', 80) });
    }
  });

  // ---------- websocket ----------
  const maxClients = Math.max(1, Number(env.MAX_CLIENTS) || 30);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const subs = new Map<WebSocket, string>();
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const slot = slotOf(url.searchParams.get('session'));
    if (url.pathname !== '/ws' || !slot || (origins.length && !origins.includes(String(req.headers.origin))) || wss.clients.size >= maxClients) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => { subs.set(ws, slot.session.id); wss.emit('connection', ws, req); });
  });
  wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    const slot = slots.get(subs.get(ws)!)!;
    ws.send(JSON.stringify({ type: 'hello', instance, session: slot.session.id, rules: { giftTiers: rules.giftTiers, follow: rules.follow, membership: rules.membership } }));
    let messages = 0;
    const limiter = setInterval(() => { messages = 0; }, 10_000);
    ws.on('message', bytes => {
      // Liveness only: clients can never mint likes, gifts or follows.
      if (++messages > 50) { ws.close(1008, 'Too many messages'); return; }
      try { const d = JSON.parse(bytes.toString()); if (d.type === 'ping') ws.send(JSON.stringify({ type: 'pong', at: Date.now(), t: d.t })); } catch { /* ignored */ }
    });
    ws.on('close', () => { clearInterval(limiter); subs.delete(ws); });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, 30_000);

  // ---------- simulation loop (10 Hz) ----------
  let tickNo = 0;
  const loop = setInterval(() => {
    tickNo++;
    for (const slot of slots.values()) {
      slot.session.tick();
      const fx = slot.session.battle.drainFx();
      const snap = slot.session.snapshot();
      const msg = JSON.stringify({ type: 'state', tick: tickNo, simulated: demo || Date.now() - slot.lastSimAt < 60_000, s: snap, fx });
      for (const [ws, id] of subs) {
        if (id !== slot.session.id || ws.readyState !== WebSocket.OPEN) continue;
        if (ws.bufferedAmount > 256 * 1024) continue; // slow client: skip frames, it will catch up with the next snapshot
        ws.send(msg);
      }
    }
  }, 100);
  const saver = setInterval(() => { void persist(); }, 30_000);

  await new Promise<void>(ok => server.listen(Number(env.PORT) || 3000, '0.0.0.0', ok));
  const port = (server.address() as any).port;
  console.info(`NIGHTKEEP PK BATTLE listening on ${port}; ${demo ? 'DEMO (simulated)' : hosts.map(h => '@' + h).join(', ')}; mode=${mode}`);

  async function close() {
    clearInterval(loop); clearInterval(heartbeat); clearInterval(saver);
    for (const t of demoTimers) clearInterval(t);
    for (const s of slots.values()) { clearTimeout(s.opponentStopTimer); await s.host?.stop(); await s.opponent?.stop(); }
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    await persist();
    await new Promise(ok => server.close(ok));
  }
  return { server, port, close, slots, route: (id: string, e: NormalizedEvent) => { const s = slots.get(id); if (s) route(s, e); }, handlePk: (id: string, kind: any, d: any) => { const s = slots.get(id); if (s) handlePk(s, kind, d, id); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(resolve(process.argv[1])))) {
  startServer().then(app => {
    for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, () => {
      const hard = setTimeout(() => process.exit(1), 8000); hard.unref();
      void app.close().then(() => process.exit(0));
    });
  }).catch(e => { console.error(clean(e?.message, 200)); process.exitCode = 1; });
}

export type { Side };

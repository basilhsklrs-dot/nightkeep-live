/** Castle LIVE — Node 22+, ESM. No chat listeners and no client game commands. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const clean = (v, n = 64) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
const positive = (v, max = 100000) => Math.max(1, Math.min(max, Math.floor(Number(v) || 1)));
export const username = d => clean(d.user?.uniqueId || d.user?.displayId || d.uniqueId || d.user?.nickname || 'viewer');
export const giftActions = {
  rose: 'heal', 'tiktok coin': 'heal', coin: 'heal', 'heart me':'member', 'member heart':'member', 'membership heart':'member', 'καρδιά μέλους':'member',
  'finger heart': 'shield', doughnut: 'wave', donut: 'wave', 'ice cream': 'wave',
  cap: 'mini', sunglasses: 'mini', 'drama queen': 'dragon', lion: 'dragon',
  universe: 'dragon', 'tiktok universe': 'dragon'
};
export const giftSkins={rose:'rose','tiktok coin':'rose',coin:'rose','heart me':'member','member heart':'member','membership heart':'member','καρδιά μέλους':'member','finger heart':'heart',doughnut:'goblin',donut:'goblin','ice cream':'frost',cap:'armored',sunglasses:'shadow','drama queen':'queen',lion:'fire',universe:'cosmic','tiktok universe':'cosmic'};
export const skinActions={rose:'heal',heart:'shield',goblin:'wave',frost:'wave',armored:'mini',shadow:'mini',queen:'dragon',fire:'dragon',cosmic:'dragon',member:'member'};
export const defaultSkins={heal:'rose',shield:'heart',wave:'goblin',mini:'armored',dragon:'fire',member:'member'};
/** Uses real gift metadata; optional per-region numeric ID overrides come from env. */
export function giftInfo(d, overrides = {}) {
  const id = String(d.giftId ?? d.gift?.id ?? '');
  const name = clean(d.gift?.name || d.giftName || d.extendedGiftInfo?.name || `Gift #${id}`);
  const key=name.trim().toLowerCase(),override=overrides[id];
  const action=(typeof override==='string'?override:override?.action)||giftActions[key]||null;
  const wanted=(typeof override==='object'?override?.skin:null)||giftSkins[key];
  const skin=skinActions[wanted]===action?wanted:defaultSkins[action]||null;
  const coins=Number(d.gift?.diamondCount ?? d.extendedGiftInfo?.diamondCount ?? d.gift?.diamond_count ?? d.diamondCount ?? 0);
  return { giftId: id, giftName: name, action:action||'value',skin,coins:Number.isFinite(coins)&&coins>0?Math.min(100000,coins):0 };
}
export class Normalizer {
  constructor(overrides = {}, now = () => Date.now()) { this.ids = new Map(); this.streaks = new Map(); this.overrides = overrides; this.now = now; }
  prune(map, ttl) {
    const now = this.now();
    for (const [key, v] of map) if (now - v.at > ttl) map.delete(key);
    while (map.size > 10000) map.delete(map.keys().next().value);
  }
  normalize(type, d, room = '') {
    this.prune(this.ids, 600000); this.prune(this.streaks, 120000);
    const msgId = d.common?.msgId || d.msgId || d.msgIdStr;
    // Gift streak updates can reuse msgId: their cumulative count is deduplicated below.
    if (type !== 'gift' && msgId) {
      const key = `${room}:${type}:${msgId}`;
      if (this.ids.has(key)) return null;
      this.ids.set(key, { at: this.now() });
    }
    const user = username(d);
    const displayName = clean(d.user?.nickname || d.user?.displayName || d.nickname || user, 64) || user;
    if (type === 'chat'){const command=clean(d.comment||d.text||'',64).trim().toLowerCase();if(/^(1|2|defender|defend|sieger|siege|attacker|attack|team defender|team sieger)$/.test(command))return {type:'team',user,displayName,team:command==='2'||/sieg|attack/.test(command)?'sieger':'defender'};return null;}
    if (type === 'join') return {type:'join',user,displayName};
    if (type === 'like') return { type: 'like', user, displayName, count: positive(d.count ?? d.likeCount) };
    if (type === 'follow') return { type: 'follow', user, displayName, count: 1 };
    if (type !== 'gift') return null;
    const info = giftInfo(d, this.overrides);

    const count = positive(d.repeatCount);
    const streak = Number(d.gift?.type ?? d.giftType ?? d.extendedGiftInfo?.type) === 1;
    if (streak) {
      // groupId is the authoritative combo identity. Fallback resets after final/timeout.
      const rawGroup=d.groupId??d.gift?.groupId;
      const group=rawGroup!=null&&String(rawGroup)!=='0'?String(rawGroup):'';
      const key = `${room}:${d.user?.userId || user}:${info.giftId}:${group || 'active'}`;
      let old = this.streaks.get(key);
      const ended = d.repeatEnd === true || Number(d.repeatEnd) === 1;
      if (!group && old?.ended && !ended && count <= old.count) old = null;
      const delta = Math.max(0, count - (old?.count || 0));
      const comboId=old?.comboId||randomUUID();
      this.streaks.set(key, { at: this.now(), count: Math.max(count, old?.count || 0), ended,comboId });
      if (!delta) return null;
      return { type: 'gift', user, displayName, count: delta,comboId,comboTotal:Math.max(count,old?.count||0), ...info };
    }
    if (msgId) {
      const key = `${room}:gift:${msgId}`;
      if (this.ids.has(key)) return null;
      this.ids.set(key, { at: this.now() });
    }
    return { type: 'gift', user, displayName, count,comboId:randomUUID(),comboTotal:count, ...info };
  }
}

export async function startServer(env = process.env) {
  const { WebSocketServer, WebSocket } = await import('ws');
  const demo = env.DEMO_MODE === 'true' || process.argv.includes('--demo');
  const streamer = clean(env.TIKTOK_USERNAME || '').replace(/^@/, '');
  if (!demo && !/^[\w.]{2,64}$/.test(streamer)) throw Error('Set TIKTOK_USERNAME in .env (without @), or run npm run demo.');
  const overrides = JSON.parse(env.GIFT_ID_MAP || '{}');
  for(const value of Object.values(overrides)){const action=typeof value==='string'?value:value?.action;if(!defaultSkins[action])throw Error('Invalid GIFT_ID_MAP action');if(typeof value==='object'&&value.skin&&skinActions[value.skin]!==action)throw Error('Gift skin does not match action');}
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const instance = randomUUID();
  let seq = 0, stopping = false, connection, reconnectTimer, failures = 0, connecting = false;
  let generation = 0, room = '', lastEventAt = null;
  const history = [], normalizer = new Normalizer(overrides);
  let status = { state: demo ? 'demo' : 'connecting', streamer, demo, nextRetryAt: null };
  const maxClients = Math.max(1, Number(env.MAX_CLIENTS) || 20);
  const send = (ws, data) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 512 * 1024) { ws.close(1013, 'Slow connection; reconnect to replay'); return; }
    ws.send(JSON.stringify(data));
  };
  const broadcast = data => { for (const ws of wss.clients) send(ws, data); };
  const updateStatus = (state, extra = {}) => {
    status = { state, streamer, demo, nextRetryAt: null, ...extra };
    broadcast({ type: 'status', ...status });
    console.info(JSON.stringify({ connection: state, nextRetryAt: status.nextRetryAt }));
  };
  const emit = event => {
    if (!event) return;
    const packet = { ...event, instance, seq: ++seq, at: Date.now() };
    lastEventAt = packet.at;
    if(packet.type==='gift') console.info(JSON.stringify({event:'gift_received',user:packet.user,displayName:packet.displayName,giftId:packet.giftId,giftName:packet.giftName,count:packet.count,coinsPerGift:packet.coins,totalCoins:(packet.coins||0)*(packet.count||1),action:packet.action,seq:packet.seq}));
    history.push(packet);
    while (history.length > 2000 || (history[0] && Date.now() - history[0].at > 300000)) history.shift();
    broadcast(packet);
  };
  const htmlPath = new URL('./public/index.html', import.meta.url);
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...status, lastEventAt, uptime: Math.floor(process.uptime()) })); return;
    }
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      try { const html = await readFile(htmlPath); res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); res.end(html); }
      catch { res.writeHead(500); res.end('Frontend missing'); }
      return;
    }
    res.writeHead(404); res.end('Not found');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws' || (origins.length && !origins.includes(req.headers.origin)) || wss.clients.size >= maxClients) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws, req) => {
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    const url = new URL(req.url, 'http://localhost');
    const oldInstance = url.searchParams.get('instance');
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    const earliest = history[0]?.seq ?? seq + 1;
    const replayable = oldInstance === instance && after <= seq && after >= earliest - 1;
    send(ws, { type: 'hello', instance, seq, replayable, gap: Boolean(oldInstance && !replayable), ...status });
    // First visit starts now; a matching saved checkpoint resumes within the replay window.
    if (replayable) for (const packet of history) if (packet.seq > after) send(ws, packet);
    let lastPing = 0, messages = 0;
    ws.on('message', bytes => {
      // Receive only liveness messages. Clients cannot mint likes, gifts or follows.
      if (++messages > 100) { ws.close(1008, 'Too many messages'); return; }
      try {
        const data = JSON.parse(bytes.toString());
        if (data.type === 'ping' && Date.now() - lastPing > 1000) { lastPing = Date.now(); send(ws, {type:'pong', at:lastPing, status, lastEventAt}); }
      } catch { /* malformed messages have no game effect */ }
    });
    const limiter = setInterval(() => { messages = 0; }, 30000);
    ws.on('close', () => clearInterval(limiter));
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 30000);
  async function dispose() {
    generation++;
    const old = connection; connection = undefined;
    if (old) { old.removeAllListeners(); old.on('error', () => {}); try { await old.disconnect(); } catch {} }
  }
  function retry() {
    if (stopping || reconnectTimer) return;
    const ms = Math.min(300000, 5000 * 2 ** Math.min(failures++, 6)) + Math.random() * 2000;
    updateStatus('offline', { nextRetryAt: Date.now() + ms });
    reconnectTimer = setTimeout(() => { reconnectTimer = undefined; if(connecting){ retry(); return; } void connect(); }, ms);
  }
  async function connect() {
    if (connecting || stopping) return;
    connecting = true;
    await dispose(); const ticket = generation;
    updateStatus('connecting');
    try {
      const { TikTokLiveConnection, WebcastEvent, ControlEvent } = await import('tiktok-live-connector');
      if (ticket !== generation || stopping) return;
      connection = new TikTokLiveConnection(streamer, {
        enableExtendedGiftInfo: false, processInitialData: false,
        ...(env.EULER_API_KEY ? { signApiKey: env.EULER_API_KEY } : {})
      });
      const current = connection;
      const valid = () => ticket === generation && !stopping;
      current.on(ControlEvent.ERROR, () => { if (valid()) console.warn('TikTok connection error; monitoring/retrying.'); });
      current.on(ControlEvent.DISCONNECTED, () => { if (valid()) retry(); });
      current.on(WebcastEvent.STREAM_END, () => { if (valid()) { void dispose(); retry(); } });
      for (const [key, type] of [['LIKE','like'],['FOLLOW','follow'],['GIFT','gift'],['ROOM_USER','join'],['CHAT','chat']]) {
        current.on(WebcastEvent[key], d => { if (valid()) emit(normalizer.normalize(type, d, room)); });
      }
      let deadline;
      const pending = current.connect();
      // A late resolve after a timeout must not leave an abandoned connection alive.
      pending.then(() => { if(!valid()) void current.disconnect().catch(()=>{}); }, () => {});
      let state;
      try {
        state = await Promise.race([pending,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Connect deadline exceeded')),60000);})]);
      } finally { clearTimeout(deadline); }
      if (!valid()) { try { await current.disconnect(); } catch {} return; }
      room = String(state.roomId || ''); failures = 0;
      clearTimeout(reconnectTimer); reconnectTimer = undefined;
      updateStatus('live');
    } catch (error) {
      // Never log raw error objects: these can contain signed URLs or headers.
      console.warn(`TikTok connect failed (${clean(error?.name || 'Error')}); streamer may be offline, rate limited or blocked.`);
      if (ticket === generation && !stopping) { await dispose(); retry(); }
    } finally { connecting = false; }
  }
  const watchdog=setInterval(()=>{
    if(!demo&&!stopping&&!connecting&&status.state==='live'&&!connection?.isConnected){
      updateStatus('offline');void dispose().then(retry);
    }
  },30000);
  let demoTimer;
  if (demo) {
    let step = 0;
    const actions = ['heal','shield','wave','mini','dragon'];
    demoTimer = setInterval(() => {
      step++;
      if (step % 11 === 0) emit({type:'gift', action:'dragon', user:'demo_dragon', count:1, giftName:'Universe'});
      else if (step % 3 === 0) { const action = actions[Math.floor(Math.random()*4)]; emit({type:'gift',action,user:'demo_gifter',count:1,giftName:action}); }
      else if (step % 2 === 0) emit({type:'follow',user:`knight_${step}`,count:1});
      else emit({type:'like',user:'demo_viewer',count:25});
    }, 4500);
  } else void connect();
  await new Promise(resolve => server.listen(Number(env.PORT) || 3000, '0.0.0.0', resolve));
  console.info(`Castle LIVE listening on port ${server.address().port}; ${demo ? 'DEMO' : '@' + streamer}`);
  async function close() {
    if (stopping) return; stopping = true;
    clearTimeout(reconnectTimer); clearInterval(demoTimer); clearInterval(heartbeat); clearInterval(watchdog);
    for (const ws of wss.clients) ws.terminate();
    wss.close(); await dispose();
    await new Promise(resolve => server.close(resolve));
  }
  return { server, wss, close, emit };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(resolve(process.argv[1])))) {
  startServer().then(app => {
    for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => {
      const hardExit = setTimeout(() => process.exit(1), 8000); hardExit.unref();
      app.close().then(() => process.exit(0));
    });
  }).catch(error => { console.error(clean(error.message, 200)); process.exitCode = 1; });
}
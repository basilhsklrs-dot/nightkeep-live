// NIGHTKEEP PK BATTLE — renderer. Portrait 1000x1600 design space, TikTok-safe HUD.
import { TEAM, KINDS, SIZE, buildSprites, buildCastle } from './sprites.js';
import { Audio } from './audio.js';

const W = 1000, H = 1600;
// TikTok overlays: top ~13% (host pill / PK bar), bottom ~30% (comments, gift bar), right column icons.
const SAFE = { top: 212, bottom: 1140, right: 880 };
const GROUND = { far: 800, near: 985 };
const simX = x => 60 + x * 0.88; // sim field 0..1000 -> screen
const laneY = l => GROUND.far + l * (GROUND.near - GROUND.far);
const laneS = l => 0.78 + l * 0.34;
const CASTLE_X = { left: 18, right: 762 };

const params = new URLSearchParams(location.search);
const session = params.get('session') || '';
const debug = params.get('debug') === '1';
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d', { alpha: false });
const audio = new Audio();
audio.enabled = params.get('sound') !== '0';
let scale = 1, offX = 0, offY = 0, quality = 1;

const sprites = buildSprites();
const castles = { left: [0, 1, 2, 3].map(s => buildCastle('left', s)), right: [0, 1, 2, 3].map(s => buildCastle('right', s)) };
let bg = null;

// ---------- state ----------
let state = null, prevPhase = '', simulated = false, connected = false, lastMsgAt = 0;
const units = new Map(); // id -> render state
const particles = [], texts = [], projectiles = [], banners = [];
const shake = { left: 0, right: 0, screen: 0 };
const hpView = { left: 1, right: 1, ls: 0, rs: 0 };
const scoreView = { left: 0, right: 0 };
let flash = { left: 0, right: 0 };
let tipIndex = 0, tipAt = 0, rules = null, lastCountdown = -1, intensity = 0;

// ---------- layout ----------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = innerWidth, ch = innerHeight;
  // Cap backing store to ~1.3x design pixels for tablet GPUs.
  const fit = Math.min(cw / W, ch / H);
  const px = Math.min(dpr, 1.3 / fit) * quality;
  cvs.width = Math.round(cw * px); cvs.height = Math.round(ch * px);
  cvs.style.width = cw + 'px'; cvs.style.height = ch + 'px';
  scale = fit * px; offX = (cvs.width - W * scale) / 2; offY = (cvs.height - H * scale) / 2;
  bg = buildBackground();
}
addEventListener('resize', resize);

function buildBackground() {
  const c = document.createElement('canvas'); c.width = cvs.width; c.height = cvs.height;
  const g = c.getContext('2d');
  g.fillStyle = '#07051a'; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(scale, 0, 0, scale, offX, offY);
  const ext = 800; // paint beyond the design box so letterbox areas look intentional
  const sky = g.createLinearGradient(0, -ext, 0, GROUND.far);
  sky.addColorStop(0, '#05031a'); sky.addColorStop(0.45, '#1b0f4a'); sky.addColorStop(0.8, '#4a1d6b'); sky.addColorStop(1, '#a3437a');
  g.fillStyle = sky; g.fillRect(-ext, -ext, W + ext * 2, GROUND.far + ext);
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.7})`; const r = rnd() * 1.8 + 0.3; g.beginPath(); g.arc(-ext + rnd() * (W + ext * 2), -ext + rnd() * (GROUND.far - 200 + ext), r, 0, 7); g.fill(); }
  // moon
  const mg = g.createRadialGradient(500, 470, 10, 500, 470, 160); mg.addColorStop(0, 'rgba(255,240,220,.95)'); mg.addColorStop(0.35, 'rgba(255,200,230,.35)'); mg.addColorStop(1, 'rgba(255,150,200,0)');
  g.fillStyle = mg; g.beginPath(); g.arc(500, 470, 160, 0, 7); g.fill();
  g.fillStyle = '#fff3e6'; g.beginPath(); g.arc(500, 470, 46, 0, 7); g.fill();
  // mountain layers
  const ridge = (y, amp, col, seedv) => { seed = seedv; g.fillStyle = col; g.beginPath(); g.moveTo(-ext, GROUND.far + 10); for (let x = -ext; x <= W + ext; x += 40) g.lineTo(x, y - rnd() * amp - Math.sin(x / 160) * amp * 0.4); g.lineTo(W + ext, GROUND.far + 10); g.closePath(); g.fill(); };
  ridge(700, 120, '#2a1650', 7); ridge(760, 70, '#1e0f3b', 9); ridge(795, 30, '#140a2a', 11);
  // ground with perspective
  const gr = g.createLinearGradient(0, GROUND.far - 10, 0, H + ext);
  gr.addColorStop(0, '#2d2140'); gr.addColorStop(0.12, '#3a2a35'); gr.addColorStop(0.4, '#1d1426'); gr.addColorStop(1, '#0a0612');
  g.fillStyle = gr; g.fillRect(-ext, GROUND.far - 10, W + ext * 2, H + ext);
  // dirt road
  g.fillStyle = 'rgba(160,110,80,.22)'; g.beginPath(); g.moveTo(120, GROUND.far + 10); g.lineTo(880, GROUND.far + 10); g.lineTo(940, GROUND.near + 30); g.lineTo(60, GROUND.near + 30); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
  for (let i = 0; i <= 12; i++) { const t = i / 12; g.beginPath(); g.moveTo(120 + t * 760, GROUND.far + 10); g.lineTo(60 + t * 880, GROUND.near + 30); g.stroke(); }
  for (let i = 0; i < 5; i++) { const y = GROUND.far + 10 + (i / 4) ** 1.3 * (GROUND.near + 20 - GROUND.far); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // midline glow
  const mid = g.createLinearGradient(0, GROUND.far, 0, GROUND.near + 40); mid.addColorStop(0, 'rgba(255,255,255,0)'); mid.addColorStop(1, 'rgba(255,255,255,.12)');
  g.fillStyle = mid; g.fillRect(497, GROUND.far, 6, GROUND.near - GROUND.far + 40);
  // grass tufts
  seed = 5; for (let i = 0; i < 160; i++) { const x = rnd() * W, y = GROUND.far + rnd() * (H - GROUND.far); g.strokeStyle = `rgba(90,140,90,${0.15 + rnd() * 0.25})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 8); g.moveTo(x, y); g.lineTo(x + 3, y - 9); g.stroke(); }
  // team ambient glow at castles
  for (const [side, x] of [['left', 100], ['right', 900]]) { const tg = g.createRadialGradient(x, 900, 20, x, 900, 380); tg.addColorStop(0, TEAM[side].glow + '0.28)'); tg.addColorStop(1, TEAM[side].glow + '0)'); g.fillStyle = tg; g.fillRect(x - 380, 520, 760, 760); }
  return c;
}

// ---------- effects ----------
const rand = (a, b) => a + Math.random() * (b - a);
function emit(x, y, n, opt) {
  const cap = quality < 1 ? 350 : 650;
  for (let i = 0; i < n && particles.length < cap; i++) {
    const a = opt.angle != null ? opt.angle + rand(-opt.spread, opt.spread) : rand(0, Math.PI * 2), sp = rand(opt.speed * 0.3, opt.speed);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(opt.life * 0.6, opt.life), max: opt.life, size: rand(opt.size * 0.5, opt.size), color: opt.color, grav: opt.grav ?? 0, add: opt.add ?? true, drag: opt.drag ?? 0.92 });
  }
}
function floatText(x, y, text, color, size = 30, life = 1) { if (texts.length < 60) texts.push({ x, y, text, color, size, life, max: life }); }
function banner(text, color = '#fff', sub = '', dur = 1.8) { banners.push({ text, color, sub, t: 0, dur }); if (banners.length > 3) banners.shift(); }
function explosion(x, y, r, side) {
  const col = side ? TEAM[side].main : '#ffb347';
  emit(x, y, Math.round(r * 0.6), { speed: r * 6, life: 0.7, size: 10, color: '#ffd27a' });
  emit(x, y, Math.round(r * 0.4), { speed: r * 4, life: 0.9, size: 14, color: col });
  emit(x, y, Math.round(r * 0.25), { speed: r * 2, life: 1.6, size: 26, color: 'rgba(60,40,60,.6)', add: false, grav: -40, drag: 0.96 });
  particles.push({ ring: true, x, y, r: 4, max: r * 1.4, life: 0.4, maxLife: 0.4, color: col });
  shake.screen = Math.min(18, shake.screen + r / 10);
}

function handleFx(list) {
  for (const f of list) {
    switch (f.k) {
      case 'spawn': {
        const x = f.side === 'left' ? simX(120) : simX(880);
        emit(x, laneY(0.5) - 30, f.kind === 'boss' ? 60 : 14, { speed: 260, life: 0.6, size: 7, color: TEAM[f.side].light });
        if (f.kind !== 'soldier' && f.by) floatText(x, laneY(0.5) - 120, f.by, TEAM[f.side].light, 26, 1.6);
        audio.play('spawn'); break;
      }
      case 'hit': { const x = simX(f.x), y = laneY(f.lane / 100) - 30; emit(x, y, 4, { speed: 180, life: 0.35, size: 5, color: '#fff2c0' }); if (f.dmg >= 20) floatText(x + rand(-10, 10), y - 30, f.dmg, f.side === 'left' ? TEAM.left.light : TEAM.right.light, f.dmg > 150 ? 40 : 26, 0.8); audio.play('hit'); break; }
      case 'proj': projectiles.push({ ...f, t: 0, dur: f.kind === 'meteor' ? 0.75 : f.kind === 'fire' ? 0.5 : 0.35 }); audio.play(f.kind === 'arrow' ? 'arrow' : 'fire'); break;
      case 'boom': setTimeout(() => { explosion(simX(f.x), laneY(0.5) - 10, f.r, f.side); audio.play('boom'); }, f.r > 80 ? 700 : 450); break;
      case 'castle': {
        shake[f.side] = Math.min(14, shake[f.side] + 3 + f.dmg / 120); flash[f.side] = 1;
        const x = f.side === 'left' ? 140 : 860;
        emit(x, rand(700, 900), 8, { speed: 240, life: 0.6, size: 7, color: '#d9c7b0', grav: 600 });
        floatText(x + rand(-30, 30), rand(640, 700), '-' + f.dmg, '#ffdf5e', f.dmg > 300 ? 46 : 32, 0.9);
        audio.play('castle'); break;
      }
      case 'shield': banner('SHIELD UP!', TEAM[f.side].light, f.by, 1.2); emit(f.side === 'left' ? 110 : 890, 760, 40, { speed: 300, life: 0.9, size: 8, color: '#9ff7ff' }); audio.play('shield'); break;
      case 'boss': banner('BOSS INCOMING!', TEAM[f.side].main, `${f.by} summoned a TITAN`, 2.4); shake.screen = 16; audio.play('boss'); break;
      case 'combo': banner(f.label, '#ffd34d', `${f.by} • ${f.total} gifts`, 1.6); audio.play('combo'); break;
      case 'kill': emit(simX(f.x), laneY(f.lane / 100) - 30, f.kind === 'boss' ? 80 : 12, { speed: f.kind === 'boss' ? 500 : 220, life: 0.8, size: f.kind === 'boss' ? 16 : 7, color: TEAM[f.side].main }); if (f.kind === 'boss') explosion(simX(f.x), laneY(f.lane / 100) - 60, 120, f.side); break;
      case 'banner': if (f.text === 'FIGHT!') { banner('FIGHT!', '#ffffff', 'SEND GIFTS TO ATTACK!', 1.4); audio.play('go'); } else if (f.text === 'VICTORY!') { audio.play('win'); } else if (f.text !== 'WHO WILL WIN?') banner(f.text, f.side ? TEAM[f.side].main : '#fff'); break;
      case 'destroyed': { const x = f.side === 'left' ? 120 : 880; for (let i = 0; i < 6; i++) setTimeout(() => explosion(x + rand(-80, 80), rand(640, 940), 110, null), i * 180); shake.screen = 26; audio.play('destroyed'); break; }
    }
  }
}

// ---------- network ----------
let ws, retry = 0, pingTimer;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws${session ? `?session=${encodeURIComponent(session)}` : ''}`);
  ws.onopen = () => { connected = true; retry = 0; clearInterval(pingTimer); pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'ping', t: Date.now() })), 15000); };
  ws.onmessage = m => {
    let d; try { d = JSON.parse(m.data); } catch { return; }
    lastMsgAt = performance.now();
    if (d.type === 'hello') { rules = d.rules; return; }
    if (d.type !== 'state') return;
    simulated = d.simulated; applyState(d.s); handleFx(d.fx || []);
  };
  ws.onclose = () => { connected = false; clearInterval(pingTimer); setTimeout(connect, Math.min(10000, 500 * 2 ** retry++)); };
  ws.onerror = () => ws.close();
}

function applyState(s) {
  const now = performance.now();
  const seen = new Set();
  for (const [id, side, k, x, lane, hp, st] of s.battle.units) {
    seen.add(id);
    let u = units.get(id);
    const sx = simX(x);
    if (!u) { u = { id, side: side ? 'right' : 'left', kind: KINDS[k], x: sx, from: sx, to: sx, t0: now, lane: lane / 100, hp, st, born: now, phase: Math.random() * 6 }; units.set(id, u); }
    else { u.from = u.x; u.to = sx; u.t0 = now; u.hp = hp; u.st = st; }
  }
  for (const id of units.keys()) if (!seen.has(id)) units.delete(id);
  const b = s.battle;
  if (b.phase !== prevPhase) {
    if (b.phase === 'countdown') { units.clear(); hpView.left = hpView.right = 1; }
    prevPhase = b.phase;
  }
  if (b.phase === 'countdown' && b.phaseLeft !== lastCountdown) { lastCountdown = b.phaseLeft; audio.play('beep'); }
  state = s;
}

// ---------- drawing ----------
function txt(t, x, y, size, color, align = 'center', weight = 900, stroke = 6) {
  ctx.font = `${weight} ${size}px "Lilita One", "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = 'rgba(10,4,24,.92)'; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y); }
  ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function pill(x, y, w, h, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke(); } }
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
const clip = (s, n) => (s || '').length > n ? s.slice(0, n - 1) + '…' : (s || '');

function drawCastle(side, t) {
  const c = state.battle.castles[side], frac = c.hp / c.max;
  const stage = frac > 0.7 ? 0 : frac > 0.4 ? 1 : frac > 0.01 ? 2 : 3;
  const img = castles[side][stage], sh = shake[side];
  const x = CASTLE_X[side] + rand(-sh, sh), y = 990 - 380 + rand(-sh, sh) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x + 110, 990, 120, 22, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.drawImage(img, x, y, 220, 380);
  if (flash[side] > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = flash[side] * 0.5; ctx.drawImage(img, x, y, 220, 380); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  if (c.shield > 0) {
    const a = 0.25 + 0.1 * Math.sin(t * 4), r = 190 + Math.min(40, c.shield / 150);
    const g = ctx.createRadialGradient(x + 110, y + 260, r * 0.6, x + 110, y + 260, r);
    g.addColorStop(0, 'rgba(120,240,255,0)'); g.addColorStop(0.85, `rgba(120,240,255,${a})`); g.addColorStop(1, 'rgba(200,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 110, y + 260, r, Math.PI, 0); ctx.fill();
  }
  if (stage >= 2 && Math.random() < 0.25 * quality) emit(x + rand(30, 190), y + rand(80, 200), 1, { speed: 20, life: 2, size: 20, color: 'rgba(40,30,45,.5)', add: false, grav: -50, drag: 0.98 });
  if (stage >= 1 && Math.random() < 0.15 * quality) emit(x + rand(30, 190), y + rand(120, 220), 1, { speed: 30, life: 0.8, size: 9, color: '#ff8a3d', grav: -80 });
  ctx.restore();
}

function drawUnit(u, now, t) {
  const k = Math.min(1, (now - u.t0) / 110);
  u.x = u.from + (u.to - u.from) * k;
  const s = laneS(u.lane), y = laneY(u.lane), size = SIZE[u.kind] * s;
  const frames = sprites[`${u.side}:${u.kind}`];
  const pose = u.st === 1 ? (Math.sin(t * 9 + u.phase) > 0.2 ? 2 : 0) : (Math.floor(t * 7 + u.phase) % 2);
  const bob = u.st === 0 ? Math.abs(Math.sin(t * 7 + u.phase)) * 3 * s : 0;
  const pop = Math.min(1, (now - u.born) / 200);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(u.x, y, size * 0.3, size * 0.08, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  if (u.kind === 'boss' || u.kind === 'knight') { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(u.x, y - size * 0.4, 4, u.x, y - size * 0.4, size * 0.6); g.addColorStop(0, TEAM[u.side].glow + '.35)'); g.addColorStop(1, TEAM[u.side].glow + '0)'); ctx.fillStyle = g; ctx.fillRect(u.x - size * 0.6, y - size, size * 1.2, size); ctx.globalCompositeOperation = 'source-over'; }
  const d = size * pop;
  ctx.drawImage(frames[pose], u.x - d / 2, y - d - bob, d, d);
  if (u.hp < 100 || u.kind === 'boss') {
    const bw = u.kind === 'boss' ? 120 * s : 34 * s, by = y - size - 8;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(u.x - bw / 2 - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = u.hp > 50 ? '#5dff8f' : u.hp > 25 ? '#ffd34d' : '#ff4d4d'; ctx.fillRect(u.x - bw / 2, by, bw * u.hp / 100, 5);
  }
}

function drawProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.t += dt;
    const k = Math.min(1, p.t / p.dur), fx = simX(p.from), tx = simX(p.to), ty = laneY(p.lane / 100 || 0.5) - 30;
    let x, y;
    if (p.kind === 'meteor') { x = tx + (1 - k) * (p.side === 'left' ? -260 : 260); y = 380 + (ty - 380) * k * k; }
    else { x = fx + (tx - fx) * k; const h = p.kind === 'arrow' ? 90 : 180; y = (laneY(0.5) - 60) + (ty - laneY(0.5) + 60) * k - Math.sin(k * Math.PI) * h; }
    const col = TEAM[p.side];
    if (p.kind === 'arrow') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (tx > fx ? 18 : -18), y + 4); ctx.stroke(); }
    else {
      const r = p.kind === 'meteor' ? 30 : 16;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 2, x, y, r * 2); g.addColorStop(0, '#fff6d0'); g.addColorStop(0.3, p.kind === 'meteor' ? '#ff7a2a' : col.main); g.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      emit(x, y, quality < 1 ? 1 : 2, { speed: 60, life: 0.5, size: r * 0.6, color: p.kind === 'meteor' ? '#ff9a3d' : col.light });
    }
    if (k >= 1) projectiles.splice(i, 1);
  }
}

function drawParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    if (p.ring) { const k = 1 - p.life / p.maxLife; ctx.strokeStyle = p.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 8 * (1 - k) + 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.max * k, p.max * k * 0.45, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; continue; }
    p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = p.life / p.max;
    ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    ctx.globalAlpha = a; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.add ? a : 2 - a), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let i = texts.length - 1; i >= 0; i--) {
    const f = texts[i]; f.life -= dt; if (f.life <= 0) { texts.splice(i, 1); continue; }
    const k = 1 - f.life / f.max; ctx.globalAlpha = Math.min(1, f.life * 3);
    txt(String(f.text), f.x, f.y - k * 60, f.size * (k < 0.15 ? 0.6 + k * 2.7 : 1), f.color, 'center', 900, 6);
  }
  ctx.globalAlpha = 1;
}

function healthBar(x, y, w, side, frac, shieldFrac, t) {
  const v = hpView;
  v[side] += (frac - v[side]) * 0.12;
  const T = TEAM[side], right = side === 'right';
  pill(x - 3, y - 3, w + 6, 34, 'rgba(10,4,24,.85)', 'rgba(255,255,255,.18)');
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, 28, 14); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, w, 28);
  const lag = right ? x + w * (1 - Math.max(v[side], frac)) : x;
  ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6; ctx.fillRect(lag, y, w * Math.max(v[side], frac), 28); ctx.globalAlpha = 1;
  const fw = w * frac, fx = right ? x + w - fw : x;
  const g = ctx.createLinearGradient(0, y, 0, y + 28); g.addColorStop(0, T.light); g.addColorStop(0.5, T.main); g.addColorStop(1, T.dark);
  ctx.fillStyle = g; ctx.fillRect(fx, y, fw, 28);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 6; i++) { const sx = ((t * 60 + i * 60) % (w + 40)) - 20; ctx.fillRect(right ? x + w - sx : x + sx, y, 8, 28); }
  if (shieldFrac > 0) { ctx.fillStyle = 'rgba(140,245,255,.75)'; const sw = w * Math.min(1, shieldFrac); ctx.fillRect(right ? x + w - sw : x, y, sw, 7); }
  ctx.restore();
  txt(`${Math.ceil(frac * 100)}%`, x + w / 2, y + 15, 20, '#fff', 'center', 900, 4);
}

function drawHud(t) {
  const s = state, b = s.battle;
  const L = s.creators.left, R = s.creators.right;
  // Creator plates
  const plate = (side, x, align) => {
    const T = TEAM[side], c = s.creators[side];
    const grad = ctx.createLinearGradient(x, 0, x + (align === 'left' ? 380 : -380), 0); grad.addColorStop(0, T.main); grad.addColorStop(1, T.glow + '0)');
    ctx.fillStyle = grad; ctx.fillRect(align === 'left' ? x : x - 380, SAFE.top, 380, 62);
    txt(clip((c.name || T.name).toUpperCase(), 16), align === 'left' ? x + 16 : x - 16, SAFE.top + 22, 30, '#fff', align, 900, 5);
    txt(c.handle ? '@' + clip(c.handle, 20) : side === 'left' ? 'HOST' : 'OPPONENT', align === 'left' ? x + 16 : x - 16, SAFE.top + 50, 18, T.light, align, 700, 3);
  };
  plate('left', 0, 'left'); plate('right', W, 'right');
  // Timer
  const tl = b.phase === 'battle' ? b.timeLeft : b.phase === 'countdown' ? s.battle.timeLeft : 0;
  const mm = Math.floor(tl / 60), ss = String(tl % 60).padStart(2, '0');
  const urgent = b.phase === 'battle' && tl <= 30;
  const pulse = urgent ? 1 + 0.08 * Math.sin(t * 10) : 1;
  ctx.save(); ctx.translate(500, SAFE.top + 40); ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.roundRect(-92, -38, 184, 76, 22); const tg = ctx.createLinearGradient(0, -38, 0, 38); tg.addColorStop(0, urgent ? '#ff4d4d' : '#3b2a7a'); tg.addColorStop(1, urgent ? '#7a0f1f' : '#140b33'); ctx.fillStyle = tg; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#ffd34d'; ctx.stroke();
  txt(b.phase === 'waiting' ? '--:--' : `${mm}:${ss}`, 0, 2, 46, '#fff', 'center', 900, 6);
  ctx.restore();
  // What kind of match this is: never call a Creator Battle an official PK.
  const label = s.match === 'pk' ? 'TIKTOK PK' : s.match === 'creator_battle' ? 'CREATOR BATTLE' : 'VS';
  txt(label, 500, SAFE.top + 97, label === 'VS' ? 26 : 15, '#ffd34d', 'center', 900, 4);
  // Castle health bars
  healthBar(24, SAFE.top + 82, 420, 'left', b.castles.left.hp / b.castles.left.max, b.castles.left.shield / 6000, t);
  healthBar(556, SAFE.top + 82, 420, 'right', b.castles.right.hp / b.castles.right.max, b.castles.right.shield / 6000, t);
  // Battle score tug bar
  scoreView.left += (b.score.left - scoreView.left) * 0.15; scoreView.right += (b.score.right - scoreView.right) * 0.15;
  const tot = Math.max(1, scoreView.left + scoreView.right), split = 24 + 952 * (tot <= 1 ? 0.5 : scoreView.left / tot);
  const by = SAFE.top + 130;
  ctx.save(); ctx.beginPath(); ctx.roundRect(24, by, 952, 40, 20); ctx.clip();
  let g = ctx.createLinearGradient(0, by, 0, by + 40); g.addColorStop(0, TEAM.left.light); g.addColorStop(0.5, TEAM.left.main); g.addColorStop(1, TEAM.left.dark); ctx.fillStyle = g; ctx.fillRect(24, by, split - 24, 40);
  g = ctx.createLinearGradient(0, by, 0, by + 40); g.addColorStop(0, TEAM.right.light); g.addColorStop(0.5, TEAM.right.main); g.addColorStop(1, TEAM.right.dark); ctx.fillStyle = g; ctx.fillRect(split, by, 976 - split, 40);
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.roundRect(24, by, 952, 40, 20); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; const sg = ctx.createRadialGradient(split, by + 20, 2, split, by + 20, 40); sg.addColorStop(0, 'rgba(255,255,255,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = sg; ctx.fillRect(split - 40, by - 20, 80, 80); ctx.globalCompositeOperation = 'source-over';
  txt(fmt(b.score.left), 44, by + 21, 28, '#fff', 'left', 900, 5);
  txt(fmt(b.score.right), 956, by + 21, 28, '#fff', 'right', 900, 5);
  txt('GAME SCORE', 500, by + 21, 16, 'rgba(255,255,255,.85)', 'center', 800, 4);
  // Official PK score (only when TikTok actually provides it)
  const off = s.pk.officialScore;
  let row = by + 58;
  if (off.left != null || off.right != null) {
    pill(250, row - 16, 500, 32, 'rgba(10,4,24,.75)', 'rgba(255,211,77,.6)');
    txt(`TIKTOK PK SCORE  ${fmt(off.left ?? 0)}  :  ${fmt(off.right ?? 0)}`, 500, row, 18, '#ffd34d', 'center', 800, 3);
    row += 38;
  }
  // Rotating gift guide
  if (rules && t - tipAt > 3.2) { tipAt = t; tipIndex = (tipIndex + 1) % (rules.giftTiers.length + 2); }
  let tip;
  if (!rules) tip = 'SEND GIFTS TO ATTACK!';
  else if (tipIndex < rules.giftTiers.length) { const g2 = rules.giftTiers[tipIndex]; tip = `${g2.minCoins}+ COIN GIFT = ${g2.label.toUpperCase()}`; }
  else tip = tipIndex === rules.giftTiers.length ? `FOLLOW = +${rules.follow.count} SOLDIERS` : 'COMBOS x10 x50 x100 = BONUS ATTACKS!';
  pill(220, row - 18, 560, 36, 'rgba(255,211,77,.92)', '#120a1c');
  txt('🎁 ' + tip, 500, row + 1, 20, '#1a0b2e', 'center', 900, 0);
  // Simulation badge
  if (simulated) { pill(24, row - 18, 170, 36, 'rgba(255,80,80,.9)', '#fff'); txt('SIMULATION', 109, row + 1, 18, '#fff', 'center', 900, 0); }
  if (!connected || performance.now() - lastMsgAt > 4000) { pill(806, row - 18, 170, 36, 'rgba(0,0,0,.8)', '#ff6b6b'); txt('RECONNECTING', 891, row + 1, 16, '#ff9b9b', 'center', 900, 0); }

  // Energy bars + prompt (below battlefield, above TikTok comments)
  const ey = 1012;
  for (const side of ['left', 'right']) {
    const x = side === 'left' ? 24 : 520, w = 456, e = b.energy[side] / 100, T = TEAM[side];
    pill(x, ey, w, 30, 'rgba(10,4,24,.8)', 'rgba(255,255,255,.15)');
    if (e > 0) { ctx.save(); ctx.beginPath(); ctx.roundRect(x, ey, w, 30, 15); ctx.clip(); const eg = ctx.createLinearGradient(x, 0, x + w, 0); eg.addColorStop(0, T.dark); eg.addColorStop(1, '#ffe66d'); ctx.fillStyle = eg; ctx.fillRect(side === 'left' ? x : x + w - w * e, ey, w * e, 30); ctx.restore(); }
    txt(`⚡ ENERGY ${Math.round(e * 100)}%${e > 0.05 ? `  +${Math.round(e * 50)}% DMG` : ''}`, x + w / 2, ey + 16, 18, '#fff', 'center', 900, 4);
  }
  const prompts = ['TAP TO POWER UP YOUR TEAM!', 'SEND GIFTS TO ATTACK!', 'SUPPORT YOUR CREATOR!', 'WHO WILL WIN?'];
  const pr = b.phase === 'waiting' ? (s.pk.phase === 'invited' ? 'PK INVITATION RECEIVED…' : s.rival ? 'CREATOR BATTLE STARTING…' : 'WAITING FOR PK BATTLE…') : b.phase === 'ended' ? 'NEXT BATTLE SOON!' : prompts[Math.floor(t / 3) % prompts.length];
  const pp = 1 + 0.04 * Math.sin(t * 5);
  ctx.save(); ctx.translate(500, ey + 62); ctx.scale(pp, pp); txt(pr, 0, 0, 38, '#ffe66d', 'center', 900, 8); ctx.restore();
  // Top supporters
  const ty = 1128;
  for (const side of ['left', 'right']) {
    const list = (b.top[side] || []).slice(0, 3), x = side === 'left' ? 24 : 520, T = TEAM[side];
    ctx.fillStyle = 'rgba(10,4,24,.72)'; ctx.beginPath(); ctx.roundRect(x, ty - 18, 456, 36, 12); ctx.fill();
    const label = list.length ? list.map((c, i) => `${['🥇', '🥈', '🥉'][i]} ${clip(c.name, 9)}`).join('  ') : 'BE THE FIRST SUPPORTER!';
    txt(label, x + 228, ty, 18, T.light, 'center', 800, 3);
  }
  // Activity feed (non-essential: may sit under TikTok comments)
  const feed = (s.feed || []).slice(-4);
  feed.forEach((f, i) => { ctx.globalAlpha = 0.45 + 0.55 * ((i + 1) / feed.length); txt(clip(f.text, 38), f.side === 'left' ? 30 : 970, 1185 + i * 34, 22, TEAM[f.side].light, f.side === 'left' ? 'left' : 'right', 800, 4); });
  ctx.globalAlpha = 1;
}

function drawCenter(t, dt) {
  const b = state.battle;
  if (b.phase === 'countdown') {
    const n = b.phaseLeft; const k = (t * 2) % 1;
    ctx.save(); ctx.translate(500, 640); ctx.scale(1.4 - k * 0.3, 1.4 - k * 0.3); txt(n > 0 ? String(n) : 'GO!', 0, 0, 160, '#ffe66d', 'center', 900, 14); ctx.restore();
    txt('WHO WILL WIN?', 500, 760, 44, '#fff', 'center', 900, 8);
  }
  if (b.phase === 'waiting') {
    ctx.fillStyle = 'rgba(5,2,20,.45)'; ctx.fillRect(0, 430, W, 330);
    txt('NIGHTKEEP PK BATTLE', 500, 520, 62, '#fff', 'center', 900, 10);
    txt('TWO CASTLES — ONE BATTLEFIELD', 500, 590, 30, '#ffd34d', 'center', 900, 6);
    txt(state.pk.phase === 'invited' ? 'PK INVITATION DETECTED' : state.rival ? `NEXT BATTLE VS @${clip(state.rival, 18).toUpperCase()}` : 'THE BATTLE STARTS WITH THE NEXT PK', 500, 650, 26, '#cfc6ff', 'center', 800, 5);
    if (b.reserve) txt(`${b.reserve} REINFORCEMENTS READY`, 500, 700, 26, TEAM.left.light, 'center', 800, 5);
  }
  if (b.phase === 'ended' && b.result) {
    const w = b.result.winner, col = w === 'draw' ? '#fff' : TEAM[w].main;
    ctx.fillStyle = 'rgba(5,2,20,.55)'; ctx.fillRect(0, 430, W, 340);
    txt(w === 'draw' ? 'DRAW!' : 'VICTORY!', 500, 510, 96, col, 'center', 900, 12);
    txt(w === 'draw' ? 'WHAT A BATTLE!' : `${clip((state.creators[w].name || '').toUpperCase(), 18)} WINS`, 500, 590, 44, '#fff', 'center', 900, 8);
    txt(`${fmt(b.result.score.left)}  —  ${fmt(b.result.score.right)}`, 500, 650, 40, '#ffd34d', 'center', 900, 7);
    const mvp = w !== 'draw' && b.top[w]?.[0];
    if (mvp) txt(`MVP: ${clip(mvp.name, 16)} (${fmt(mvp.points)})`, 500, 710, 30, TEAM[w].light, 'center', 900, 6);
    if (Math.random() < 0.3 * quality) emit(rand(100, 900), 420, 3, { speed: 200, life: 2, size: 7, color: ['#ffd34d', '#ff3b6b', '#2fa8ff', '#fff'][Math.floor(rand(0, 4))], grav: 260, angle: Math.PI / 2, spread: 1.2, add: false, drag: 0.99 });
  }
  // banners
  for (let i = banners.length - 1; i >= 0; i--) {
    const bn = banners[i]; bn.t += dt; if (bn.t > bn.dur) { banners.splice(i, 1); continue; }
    const k = bn.t / bn.dur, sc = k < 0.12 ? 0.4 + k / 0.12 * 0.75 : k < 0.2 ? 1.15 - (k - 0.12) * 1.9 : 1;
    ctx.save(); ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1; ctx.translate(500, 455 + i * 90); ctx.scale(sc, sc);
    txt(bn.text, 0, 0, 70, bn.color, 'center', 900, 10); if (bn.sub) txt(clip(bn.sub, 34), 0, 50, 26, '#fff', 'center', 800, 5);
    ctx.restore();
  }
}

// ---------- main loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 60, lowFor = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 40) lowFor++; else lowFor = 0; if (lowFor >= 3 && quality > 0.7) { quality = 0.7; resize(); } }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bg) ctx.drawImage(bg, 0, 0);
  if (!state) { ctx.setTransform(scale, 0, 0, scale, offX, offY); txt('CONNECTING…', 500, 800, 48, '#fff'); return; }
  const ss = shake.screen; shake.screen *= 0.88; shake.left *= 0.85; shake.right *= 0.85; flash.left = Math.max(0, flash.left - dt * 4); flash.right = Math.max(0, flash.right - dt * 4);
  ctx.setTransform(scale, 0, 0, scale, offX + rand(-ss, ss) * scale, offY + rand(-ss, ss) * scale);
  drawCastle('left', t); drawCastle('right', t);
  const list = [...units.values()].sort((a, b) => a.lane - b.lane);
  for (const u of list) drawUnit(u, now, t);
  drawProjectiles(dt);
  drawParticles(dt);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  drawCenter(t, dt);
  drawHud(t);
  const b = state.battle;
  intensity = b.phase === 'battle' ? Math.min(1, units.size / 40 + (b.timeLeft <= 30 ? 0.5 : 0) + (particles.length / 600)) : 0;
  audio.music_tick(b.phase === 'battle' || b.phase === 'countdown', intensity);
  if (debug) txt(`${fps.toFixed(0)} fps q${quality} u${units.size} p${particles.length}`, 20, 1580, 20, '#0f0', 'left', 700, 3);
}

// Android bridge + browser audio unlock
window.NK = { setSound: on => audio.setEnabled(on), state: () => state, reload: () => location.reload() };
addEventListener('pointerdown', () => audio.resume(), { once: false });
resize(); connect(); requestAnimationFrame(frame);
setTimeout(() => audio.resume(), 500);

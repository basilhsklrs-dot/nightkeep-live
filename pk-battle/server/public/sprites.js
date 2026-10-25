// Procedurally painted sprites, pre-rendered once into offscreen canvases (cheap to blit on tablets).
export const TEAM = {
  left: { main: '#ff3b6b', dark: '#8f0f33', light: '#ffb3c6', glow: 'rgba(255,59,107,', name: 'RED' },
  right: { main: '#2fa8ff', dark: '#0b4c8c', light: '#b8e2ff', glow: 'rgba(47,168,255,', name: 'BLUE' },
};
export const KINDS = ['soldier', 'archer', 'elite', 'knight', 'boss'];
export const SIZE = { soldier: 64, archer: 64, elite: 84, knight: 96, boss: 150 };
const RES = 2; // sprite supersampling

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w * RES; c.height = h * RES; const g = c.getContext('2d'); g.scale(RES, RES); return [c, g]; }
function shade(g, x, y, r, c1, c2) { const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); gr.addColorStop(0, c1); gr.addColorStop(1, c2); return gr; }
function blob(g, x, y, rx, ry, fill, stroke = '#120a1c', lw = 2.2) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); } }
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

/** One frame of a humanoid. pose: 0/1 walk, 2 attack. dir: 1 faces right. */
function humanoid(g, s, team, kind, pose) {
  const T = TEAM[team], cx = s / 2, base = s * 0.92, k = s / 64;
  const step = pose === 0 ? 1 : pose === 1 ? -1 : 0, atk = pose === 2;
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  // legs
  g.strokeStyle = '#1b1028'; g.lineWidth = 5 * k;
  g.beginPath(); g.moveTo(cx - 4 * k, base - 16 * k); g.lineTo(cx - 5 * k + step * 4 * k, base - 2 * k); g.stroke();
  g.beginPath(); g.moveTo(cx + 4 * k, base - 16 * k); g.lineTo(cx + 5 * k - step * 4 * k, base - 2 * k); g.stroke();
  // cape for knight/elite
  if (kind === 'knight' || kind === 'elite') {
    g.fillStyle = T.dark; g.beginPath(); g.moveTo(cx - 9 * k, base - 36 * k); g.quadraticCurveTo(cx - 20 * k, base - 18 * k, cx - 16 * k + step * 2 * k, base - 6 * k); g.lineTo(cx - 2 * k, base - 14 * k); g.closePath(); g.fill();
  }
  // body
  rr(g, cx - 10 * k, base - 38 * k, 20 * k, 24 * k, 7 * k); g.fillStyle = shade(g, cx, base - 28 * k, 18 * k, T.light, T.main); g.fill(); g.lineWidth = 2.2; g.strokeStyle = '#120a1c'; g.stroke();
  // belt
  g.fillStyle = '#2a1a10'; g.fillRect(cx - 10 * k, base - 20 * k, 20 * k, 3.5 * k);
  if (kind === 'elite' || kind === 'knight') { g.fillStyle = '#ffd34d'; g.fillRect(cx - 2.5 * k, base - 21 * k, 5 * k, 5.5 * k); }
  // head + helmet
  blob(g, cx, base - 46 * k, 9 * k, 9 * k, shade(g, cx, base - 46 * k, 10 * k, '#ffe2c4', '#d99a6c'));
  g.beginPath(); g.arc(cx, base - 48 * k, 10 * k, Math.PI, 0); g.closePath();
  g.fillStyle = kind === 'archer' ? '#3f7f3a' : shade(g, cx, base - 52 * k, 10 * k, '#f2f4ff', '#7b86a8'); g.fill(); g.stroke();
  if (kind !== 'archer') { g.fillStyle = '#120a1c'; g.fillRect(cx + 1 * k, base - 48 * k, 8 * k, 2.2 * k); }
  else { g.fillStyle = '#120a1c'; g.beginPath(); g.arc(cx + 4 * k, base - 46 * k, 1.6 * k, 0, 7); g.fill(); }
  // plume
  if (kind === 'elite' || kind === 'knight') { g.fillStyle = T.main; g.beginPath(); g.moveTo(cx - 2 * k, base - 57 * k); g.quadraticCurveTo(cx - 14 * k, base - 66 * k, cx - 16 * k, base - 52 * k); g.quadraticCurveTo(cx - 8 * k, base - 56 * k, cx - 2 * k, base - 57 * k); g.fill(); g.stroke(); }
  // weapon arm
  g.strokeStyle = '#1b1028'; g.lineWidth = 4.5 * k;
  const hx = cx + (atk ? 15 : 9) * k, hy = base - (atk ? 36 : 28) * k;
  g.beginPath(); g.moveTo(cx + 6 * k, base - 34 * k); g.lineTo(hx, hy); g.stroke();
  if (kind === 'archer') {
    g.strokeStyle = '#7a4a1e'; g.lineWidth = 3 * k; g.beginPath(); g.arc(hx, hy, 12 * k, -1.2, 1.2); g.stroke();
    g.strokeStyle = '#eee'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx + 12 * k * Math.cos(-1.2), hy + 12 * k * Math.sin(-1.2)); g.lineTo(hx - (atk ? 6 : 0) * k, hy); g.lineTo(hx + 12 * k * Math.cos(1.2), hy + 12 * k * Math.sin(1.2)); g.stroke();
  } else {
    const len = (kind === 'knight' ? 30 : kind === 'elite' ? 24 : 18) * k, ang = atk ? -0.25 : -1.1;
    g.strokeStyle = '#2a1a10'; g.lineWidth = 3 * k; g.beginPath(); g.moveTo(hx - 3 * k * Math.cos(ang), hy - 3 * k * Math.sin(ang)); g.lineTo(hx + 3 * k * Math.cos(ang), hy + 3 * k * Math.sin(ang)); g.stroke();
    const gr = g.createLinearGradient(hx, hy, hx + len * Math.cos(ang), hy + len * Math.sin(ang)); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, kind === 'knight' ? '#ffd34d' : '#b9c3dd');
    g.strokeStyle = gr; g.lineWidth = (kind === 'knight' ? 4.5 : 3.5) * k; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + len * Math.cos(ang), hy + len * Math.sin(ang)); g.stroke();
  }
  // shield arm
  if (kind !== 'archer') {
    const sx = cx - 9 * k, sy = base - 28 * k, r = (kind === 'soldier' ? 8 : 10) * k;
    g.beginPath(); g.moveTo(sx - r, sy - r); g.lineTo(sx + r * 0.6, sy - r); g.lineTo(sx + r * 0.6, sy + r * 0.2); g.quadraticCurveTo(sx - r * 0.2, sy + r * 1.3, sx - r, sy + r * 0.2); g.closePath();
    g.fillStyle = shade(g, sx, sy, r * 1.4, T.light, T.dark); g.fill(); g.lineWidth = 2; g.strokeStyle = '#120a1c'; g.stroke();
    g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(sx - r * 0.2, sy - r * 0.15, r * 0.25, 0, 7); g.fill();
  }
  g.restore();
}

function boss(g, s, team, pose) {
  const T = TEAM[team], cx = s / 2, base = s * 0.95, k = s / 190, atk = pose === 2, step = pose === 0 ? 1 : pose === 1 ? -1 : 0;
  g.save(); g.lineJoin = 'round';
  // legs
  for (const side of [-1, 1]) { rr(g, cx + side * 26 * k - 13 * k + step * side * 4 * k, base - 50 * k, 26 * k, 50 * k, 8 * k); g.fillStyle = shade(g, cx + side * 26 * k, base - 30 * k, 30 * k, '#6d6a86', '#2b2840'); g.fill(); g.lineWidth = 3; g.strokeStyle = '#0d0816'; g.stroke(); }
  // body (rock golem with team crystals)
  g.beginPath(); g.moveTo(cx - 55 * k, base - 50 * k); g.lineTo(cx - 62 * k, base - 120 * k); g.lineTo(cx - 30 * k, base - 150 * k); g.lineTo(cx + 30 * k, base - 152 * k); g.lineTo(cx + 64 * k, base - 118 * k); g.lineTo(cx + 54 * k, base - 50 * k); g.closePath();
  g.fillStyle = shade(g, cx, base - 100 * k, 90 * k, '#8d8aa8', '#2e2b45'); g.fill(); g.lineWidth = 3.5; g.strokeStyle = '#0d0816'; g.stroke();
  g.fillStyle = T.main; g.shadowColor = T.main; g.shadowBlur = 18;
  for (const [x, y, r] of [[0, -105, 16], [-34, -80, 9], [36, -86, 10], [-14, -138, 7]]) { g.beginPath(); g.moveTo(cx + x * k, base + (y - r) * k); g.lineTo(cx + (x + r * 0.7) * k, base + y * k); g.lineTo(cx + x * k, base + (y + r) * k); g.lineTo(cx + (x - r * 0.7) * k, base + y * k); g.closePath(); g.fill(); }
  g.shadowBlur = 0;
  // head
  rr(g, cx - 24 * k, base - 182 * k, 48 * k, 36 * k, 10 * k); g.fillStyle = shade(g, cx, base - 165 * k, 34 * k, '#a5a2c0', '#3a3655'); g.fill(); g.stroke();
  g.fillStyle = T.light; g.shadowColor = T.main; g.shadowBlur = 14; g.fillRect(cx - 4 * k, base - 170 * k, 22 * k, 7 * k); g.shadowBlur = 0;
  // arms
  for (const side of [-1, 1]) {
    const up = atk && side === 1 ? -40 : 0;
    rr(g, cx + side * 66 * k - 16 * k, base - (128 - up * 0.5) * k + up * k, 32 * k, 74 * k, 12 * k);
    g.fillStyle = shade(g, cx + side * 66 * k, base - 100 * k, 40 * k, '#7f7c9a', '#25223a'); g.fill(); g.stroke();
  }
  g.restore();
}

export function buildSprites() {
  const out = {};
  for (const team of ['left', 'right']) for (const kind of KINDS) {
    const s = SIZE[kind]; out[`${team}:${kind}`] = [0, 1, 2].map(pose => {
      const [c, g] = canvas(s, s);
      if (team === 'right') { g.translate(s, 0); g.scale(-1, 1); }
      if (kind === 'boss') boss(g, s, team, pose); else humanoid(g, s, team, kind, pose);
      return c;
    });
  }
  return out;
}

/** Castle sprite at a damage stage 0 (intact) .. 3 (ruined). */
export function buildCastle(team, stage) {
  const T = TEAM[team], W = 220, H = 380; const [c, g] = canvas(W, H);
  if (team === 'right') { g.translate(W, 0); g.scale(-1, 1); }
  const stone = y => { const gr = g.createLinearGradient(0, y, 0, H); gr.addColorStop(0, '#9b98b8'); gr.addColorStop(1, '#3b3854'); return gr; };
  const bricks = (x, y, w, h) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = 'rgba(20,10,35,.35)'; g.lineWidth = 1.2; for (let yy = y; yy < y + h; yy += 14) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); for (let xx = x + ((yy / 14) % 2) * 12; xx < x + w; xx += 24) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 14); g.stroke(); } } g.restore(); };
  const crenel = (x, y, w, n) => { const cw = w / (n * 2 - 1); for (let i = 0; i < n; i++) { g.fillRect(x + i * cw * 2, y - 14, cw, 14); g.strokeRect(x + i * cw * 2, y - 14, cw, 14); } };
  g.lineWidth = 3; g.strokeStyle = '#120a1c';
  const cut = [0, 40, 95, 170][stage];
  // keep (back tower)
  g.fillStyle = stone(80); g.fillRect(70, 80 + cut, 90, 300 - cut); g.strokeRect(70, 80 + cut, 90, 300 - cut); bricks(70, 80 + cut, 90, 300 - cut);
  if (stage < 2) { g.fillStyle = stone(60); crenel(70, 80 + cut, 90, 4); g.fillStyle = T.main; g.beginPath(); g.moveTo(115, 80 + cut - 14); g.lineTo(115, 18 + cut); g.stroke(); g.beginPath(); g.moveTo(117, 18 + cut); g.quadraticCurveTo(140, 26 + cut, 160, 22 + cut); g.lineTo(150, 36 + cut); g.quadraticCurveTo(135, 40 + cut, 117, 38 + cut); g.closePath(); g.fill(); g.stroke(); }
  // front wall
  const wallTop = 200 + cut * 0.5;
  g.fillStyle = stone(wallTop); g.fillRect(10, wallTop, 200, H - wallTop); g.strokeRect(10, wallTop, 200, H - wallTop); bricks(10, wallTop, 200, H - wallTop);
  g.fillStyle = stone(wallTop - 20); if (stage < 3) crenel(10, wallTop, 200, 7);
  // side towers
  for (const tx of [0, 160]) {
    const tt = 150 + cut * (tx ? 0.9 : 0.6);
    g.fillStyle = stone(tt); g.fillRect(tx, tt, 60, H - tt); g.strokeRect(tx, tt, 60, H - tt); bricks(tx, tt, 60, H - tt);
    if (stage < 3) { g.fillStyle = T.dark; g.beginPath(); g.moveTo(tx - 6, tt); g.lineTo(tx + 30, tt - 52); g.lineTo(tx + 66, tt); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = '#ffcf6a'; g.shadowColor = '#ffb030'; g.shadowBlur = 12; rr(g, tx + 22, tt + 30, 16, 26, 8); g.fill(); g.shadowBlur = 0;
  }
  // gate + banner
  g.fillStyle = '#2a1a10'; g.beginPath(); g.moveTo(80, H); g.lineTo(80, H - 70); g.arc(110, H - 70, 30, Math.PI, 0); g.lineTo(140, H); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#6b4a2a'; g.lineWidth = 2; for (let x = 88; x < 140; x += 10) { g.beginPath(); g.moveTo(x, H - 92); g.lineTo(x, H); g.stroke(); }
  g.fillStyle = T.main; g.strokeStyle = '#120a1c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(30, wallTop + 22); g.lineTo(62, wallTop + 22); g.lineTo(62, wallTop + 92); g.lineTo(46, wallTop + 80); g.lineTo(30, wallTop + 92); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(46, wallTop + 46, 7, 0, 7); g.fill();
  // cracks / scorch
  if (stage > 0) {
    g.strokeStyle = 'rgba(15,5,25,.85)'; g.lineWidth = 2.5;
    const cracks = stage * 5; let seed = team === 'left' ? 7 : 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < cracks; i++) { let x = 20 + rnd() * 180, y = wallTop + rnd() * (H - wallTop - 40); g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 24; y += 6 + rnd() * 12; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(20,10,10,.25)'; for (let i = 0; i < stage * 3; i++) { g.beginPath(); g.arc(20 + rnd() * 180, wallTop + rnd() * 160, 10 + rnd() * 20, 0, 7); g.fill(); }
  }
  return c;
}

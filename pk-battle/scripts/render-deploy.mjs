#!/usr/bin/env node
/**
 * Creates (or updates) the separate "nightkeep-pk-battle" Render web service.
 * - Never modifies the existing NIGHTKEEP service: it only READS its EULER_API_KEY
 *   (and TIKTOK_USERNAME) to copy them into the new service.
 * - Secrets are never printed.
 * Usage: RENDER_API_KEY=... node pk-battle/scripts/render-deploy.mjs [--branch <b>] [--source <service-name-substring>]
 */
import { randomBytes } from 'node:crypto';

const KEY = process.env.RENDER_API_KEY;
if (!KEY) { console.error('RENDER_API_KEY is not set'); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BRANCH = arg('--branch', 'claude/tiktok-pk-battle-game-b0y3gv');
const SOURCE = arg('--source', '');
const NAME = 'nightkeep-pk-battle';
const REPO = 'https://github.com/basilhsklrs-dot/nightkeep-live';

async function api(path, init = {}) {
  const r = await fetch(`https://api.render.com/v1${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const list = async path => (await api(path)).map(x => Object.values(x).find(v => v && typeof v === 'object' && 'id' in v) ?? x);

const owners = await list('/owners?limit=20');
console.log('owners:', owners.map(o => `${o.name} (${o.type})`).join(', '));
const services = await list('/services?limit=100');
console.log('services:', services.map(s => `${s.name} [${s.type}] ${s.repo ?? ''} ${s.branch ?? ''}`).join('\n  '));

// The existing NIGHTKEEP service: same repo, not ours.
const source = services.find(s => s.name !== NAME && (SOURCE ? s.name.includes(SOURCE) : (s.repo || '').includes('nightkeep-live')));
if (!source) throw new Error('Could not find the existing NIGHTKEEP service (use --source)');
const srcEnv = Object.fromEntries((await list(`/services/${source.id}/env-vars?limit=100`)).map(e => [e.key, e.value]));
console.log(`source service: ${source.name}; env keys: ${Object.keys(srcEnv).join(', ')}`);
if (!srcEnv.EULER_API_KEY) console.warn('WARNING: source has no EULER_API_KEY; TikTok connection may be rate limited');

const token = () => randomBytes(24).toString('base64url');
const env = {
  TIKTOK_USERNAME: srcEnv.TIKTOK_USERNAME || 'nightkeep.live',
  GAME_MODE: 'pk',
  ALLOW_SIM: 'false',
  ...(srcEnv.EULER_API_KEY ? { EULER_API_KEY: srcEnv.EULER_API_KEY } : {}),
};

let svc = services.find(s => s.name === NAME);
if (!svc) {
  const created = await api('/services', { method: 'POST', body: JSON.stringify({
    type: 'web_service', name: NAME, ownerId: source.ownerId ?? owners[0].id, repo: REPO, branch: BRANCH, rootDir: 'pk-battle/server', autoDeploy: 'yes',
    envVars: Object.entries({ ...env, ADMIN_TOKEN: token(), DEVICE_TOKEN: token() }).map(([key, value]) => ({ key, value })),
    serviceDetails: { runtime: 'node', plan: 'free', region: source.serviceDetails?.region ?? 'frankfurt', healthCheckPath: '/healthz',
      envSpecificDetails: { buildCommand: 'npm ci && npm run build', startCommand: 'npm start' } },
  }) });
  svc = created.service ?? created;
  console.log(`created ${NAME} (${svc.id})`);
} else {
  const cur = Object.fromEntries((await list(`/services/${svc.id}/env-vars?limit=100`)).map(e => [e.key, e.value]));
  const merged = { ADMIN_TOKEN: cur.ADMIN_TOKEN || token(), DEVICE_TOKEN: cur.DEVICE_TOKEN || token(), ...cur, ...env };
  await api(`/services/${svc.id}/env-vars`, { method: 'PUT', body: JSON.stringify(Object.entries(merged).map(([key, value]) => ({ key, value }))) });
  await api(`/services/${svc.id}`, { method: 'PATCH', body: JSON.stringify({ branch: BRANCH }) });
  await api(`/services/${svc.id}/deploys`, { method: 'POST', body: JSON.stringify({ clearCache: 'do_not_clear' }) });
  console.log(`updated ${NAME} (${svc.id}) and triggered deploy`);
}

// Wait for the deploy to finish.
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 10000));
  const [d] = await list(`/services/${svc.id}/deploys?limit=1`);
  process.stdout.write(`deploy: ${d?.status}\n`);
  if (['live', 'build_failed', 'update_failed', 'canceled', 'deactivated'].includes(d?.status)) break;
}
const fresh = await api(`/services/${svc.id}`);
const url = fresh.serviceDetails?.url;
console.log(`URL: ${url}`);
if (url) { const h = await fetch(`${url}/healthz`); console.log(`healthz: ${h.status} ${(await h.text()).slice(0, 300)}`); }
console.log('DEVICE_TOKEN is stored in Render > nightkeep-pk-battle > Environment (not printed here).');

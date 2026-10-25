# NIGHTKEEP PK BATTLE

A two-creator TikTok LIVE game for PK Battles: **Two Castles — One Battlefield**. This is a separate project from the production NIGHTKEEP game (`/server.js`), which this folder does not touch.

```
pk-battle/
  server/    Node 22 + TypeScript, WebSocket, server-authoritative engine, canvas client (public/)
  android/   Kotlin app: full-screen game WebView + optional PK Auto Accept AccessibilityService
  docs/      FEASIBILITY-el.md, EVENTS.md, INSTALL-el.md
```

## Architecture

```
TikTok LIVE (host room)  ──EulerStream──▶ RoomSource(left)  ─┐
TikTok LIVE (opponent)   ──EulerStream──▶ RoomSource(right) ─┼▶ Normalizer ─▶ Session ─▶ Battle (10 Hz) ─▶ WS snapshots ─▶ game.js
LinkMicBattle / Armies   ───────────────▶ PkTracker ─────────┘        ▲                                      (Android WebView)
Android AccessibilityService ── /api/device/report ───────────────────┘ (invitation seen / accept clicked → verified by pk_started)
```

- `src/normalizer.ts` converts raw events into internal events, handles combo deltas and protects against replays (ported from NIGHTKEEP).
- `src/pk.ts` reads PK lifecycle, opponent and official scores (read-only).
- `src/engine/rules.ts` holds the configurable event→action rules: gift tiers by verified coin value, likes, follows, membership and combos.
- `src/engine/battle.ts` is the game simulation itself. Another game theme can replace it without changing the TikTok integration.
- `src/session.ts` runs one PK session per host. The server can run several sessions at once (`TIKTOK_USERNAMES=a,b`).

## HTTP API

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | Liveness |
| `GET /api/state?session=` | none | Public game snapshot |
| `GET /api/diagnostics?session=` | ADMIN or DEVICE token | Connections, per-event raw counts, PK, device reports |
| `POST /api/control` `{action:start\|stop\|mode}` | ADMIN or DEVICE token | Start/stop controls |
| `POST /api/sim` `{events:[…]}` | demo or `ALLOW_SIM=true` (+ADMIN token) | Simulated events (shows SIMULATION badge) |
| `POST /api/device/report` | DEVICE token | Auto Accept telemetry from the tablet |
| `WS /ws?session=` | none | `hello`, then `state` at 10 Hz (snapshot + fx). Clients cannot send game actions |

## Development

```bash
cd pk-battle/server && npm ci && npm test        # 14 tests (tests/*.spec.mjs)
DEMO_MODE=true npm run build && npm run demo     # http://localhost:3000/?debug=1
cd pk-battle/android && gradle :app:testDebugUnitTest :app:assembleDebug
```

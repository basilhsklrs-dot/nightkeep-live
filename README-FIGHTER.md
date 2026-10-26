# NIGHTKEEP — Aura Fighter

Root URL now renders a portrait 3D fighter instead of Bumper Bots. Existing TikTok connection, normalization and WebSocket transport are retained. Outbound chat remains disabled. No client can create LIVE likes or gifts.

- Likes queue quick light strikes; gifts take priority.
- Gift technique is selected by per-gift coin value: 1–4 Rose Burst, 5–19 Photon Strike, 20–99 Thunder Break, 100–499 Solar Cannon, 500+ Cosmic Nova. Rose is explicitly Rose Burst. Unknown metadata falls back to Rose Burst.
- `count` is the incremental number of gifts; `comboTotal` is cumulative. The same gift retains its technique as the combo grows. Effects scale logarithmically and attacks/particles are bounded to protect the tablet.
- Follow notices and Top 3 supporter names use real normalized events. Scores in the Top 3 are local support points, not TikTok PK points.
- PK scores use v3 `armies[anchorId].hostscore` or `battleResult[anchorId].score`. Host identity comes from room owner data (`id_str` preferred); optional `TIKTOK_HOST_ID` is available if a provider omits it. Never convert 64-bit IDs to numbers.
- Only verified 1v1 scores drive the aura. Unknown/partial/multi-host scores show “waiting”; after 60 seconds without a verified score or on disconnect the aura returns to neutral. Actual end-to-end TikTok PK telemetry still requires a live battle test.
- OPEN action 4 starts a PK; FINISH 5 / CUT_SHORT 6 / LEAVE_LINKMIC 11 ends it. Invitations are not treated as a started battle.
- `/healthz` exposes build version and whether recent PK telemetry was verified, without secrets.
- `/?demo=1` is an explicitly labelled local simulation. The root URL never generates fake attacks. `?clean=1` hides browser controls. Sound is optional and needs a browser gesture; the Android camera transport is video only.

## Validation

`npm install && npm test` — normalizer/combo, attack queues, PK attribution, invalid payloads, aura freshness, WebSocket delivery/replay and rejection of client gift injection. Browser check at 480×853 and wide viewport; production endpoint and module verification after Render reports live.

## Android source

The separate NIGHTKEEP Live Camera TEST3 changes the actual encoder buffer to 1280×720 while centering a 720×1280 WebView and rotating it counter-clockwise. This compensates for the observed clockwise sensor transform on the Xiaomi tablet. Unlike TEST2 it does not rely on decoder rotation metadata. Header dimensions are read from the codec format; the decoder supports portrait and landscape. The UI offers 270/0/90/180 degree correction, applied after Stop and Start. TikTok must be re-patched once with TEST3 to update its embedded decoder. Native orientation remains unverified until tested on the tablet.

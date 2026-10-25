# NIGHTKEEP independent autochat feasibility experiment

Status: **PROTOTYPE ONLY; NOT VERIFIED AGAINST LIVE TIKTOK**.

Production `main` remains unchanged. This directory has no import or startup coupling to `server.js`. Do not enable outbound sending until a browser-based manual test has verified both the login session and correct LIVE chat controls.

No Eulerstream premium is used. This is not an officially supported TikTok posting API. Browser posting may fail due to TikTok changes or anti-automation rules. Avoid stealth plugins, interception, CAPTCHA bypasses, rate-limit evasion, and storing session IDs in source control.

From this folder:

```
npm install
npm test
TIKTOK_USERNAME=nightkeep.live AUTOCHAT_SEND_ENABLED=true node bot.js
```

By default the latter does a **dry run only**, with no browser launched and no posting.

A controlled LIVE test requires a dedicated machine/container with Chromium, a user-authorized logged-in browser profile, verified input and submit selectors, `AUTOCHAT_DRY_RUN=false`, `AUTOCHAT_CONFIRM_LIVE=true`, and a manual check of the first posted comment. The profile must be stored securely outside Git and never shared in a chat.

The four-minute minimum interval is enforced internally. Clicking the submit control is logged as attempted, **not confirmed delivery**. The experiment is not ready for production integration.

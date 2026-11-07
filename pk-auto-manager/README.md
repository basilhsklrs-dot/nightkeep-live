# AURA PK Auto Manager — Android integration plan

This is a separate Android Accessibility companion, NOT a TikTok invitation API. PK score telemetry in `pk-telemetry.js` is read-only and cannot accept or send invitations.

## State machine
IDLE -> INCOMING_INVITE -> ACCEPT -> CONNECTED -> MATCH_INVITE -> ACTIVE_PK -> ENDED -> IDLE.
When idle, search for the official Co-host menu, choose an eligible creator, and send one invitation. Apply cooldown and never repeatedly invite the same creator.

## Safety constraints
- Only inspect the official TikTok package; require user-enabled Accessibility permission.
- Do not auto-confirm unrelated dialogs, payments, login, or permissions.
- Do not click blindly by absolute coordinates.
- Stop if interface language/layout changes or the target button is ambiguous.
- Explicit start/stop control and rate-limited retries.
- Observe score/status from existing telemetry only; it does not grant UI control.

## Current status
Design scaffold only. There is no tested Android Accessibility implementation or installable APK in this repository. Android package/UI hierarchy inspection and on-device testing are required before shipping.


Build note: v0.3 co-host navigation test build; screen-position actions require verification on the target tablet.

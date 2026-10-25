# Normalized event capability matrix

Internal schema (`server/src/types.ts`). Source for all real events: `tiktok-live-connector@2.5.0` WebSocket, signed by EulerStream (`EULER_API_KEY`). Authentication is the EulerStream API key only; no TikTok session cookie is used or stored.

"Test result" legend: **unit** = covered by automated tests with recorded payload shapes; **live-pending** = must be confirmed during a real LIVE (the `/api/diagnostics` `host.seen` counters show per-type raw counts for this).

| Internal event | Raw source | Availability | Payload used | Reliability / notes | Test result |
|---|---|---|---|---|---|
| `viewer_join` | `member` (WebcastMemberMessage) | Available on public rooms | user.uniqueId/nickname | Sampled by TikTok on big rooms | unit; live-pending |
| `like` | `like` (WebcastLikeMessage) | Available | `count` per batch | TikTok batches likes. The server converts them to energy and soldiers (per `likesPerSoldier`) and the client gets a 10 Hz snapshot, so likes never cause per-event traffic | unit; live-pending |
| `follow` | `follow` (WebcastSocialMessage) | Available | user | Deduplicated by message id and by viewer (one bonus per viewer per 6 h) | unit; live-pending |
| `gift` | `gift` (WebcastGiftMessage) | Available | giftId, gift.name, gift.diamondCount, gift.type, repeatCount, repeatEnd, groupId | `diamondCount` is the verified coin value used for tiers. `GIFT_ID_MAP` can override by verified id | unit; live-pending |
| `gift_combo` | same `gift` stream (`gift.type==1`) | Available | groupId + cumulative repeatCount | Cumulative updates become deltas (a 20x combo counts 20). Replays are ignored and combo bonuses fire once per threshold. Exposed as `comboId`, `comboTotal` and `comboEnded` on `gift` | unit (20x with duplicates, skipped updates); live-pending |
| `membership` | `subNotify`, `superFanJoin` | Depends on the creator having subscriptions/Super Fan | user, subMonth | Unknown frequency | unit (sim); live-pending |
| `pk_invitation` | `linkMicBattle` action=INVITE(1) | **Uncertain**: invitations may only go to the invited creator's app, not the room stream | battleId, anchorsInfo | The tablet's AccessibilityService is the primary invitation detector (`/api/device/report pk_invitation_seen`) | unit; live-pending |
| `pk_started` | `linkMicBattle` action=OPEN(4)/ACCEPT(7) or `battleSettings.status=1` | Expected available (the NIGHTKEEP PK banner already used this) | battleId, duration, startTimeMs | The game timer syncs to the official PK end time | unit; live-pending |
| `pk_score_updated` | `linkMicArmies` | Expected available | armies[anchorId].hostscore, userArmies | **Official TikTok PK score**, displayed as is and never modified | unit; live-pending |
| `pk_ended` | `linkMicBattle` FINISH/CUT_SHORT/status≥2, `linkMicBattlePunishFinish` | Expected available | battleResult (win/lose/draw) | Ends the game battle in `pk` mode | unit; live-pending |
| `opponent_identified` | `linkMicBattle.anchorsInfo` | Expected available | userId, displayId, nickName, roomId | Triggers the second connection to the opponent's room (RIGHT team) | unit; live-pending |

Graceful degradation:
- No PK events: in `pk` mode the game waits ("WAITING FOR PK BATTLE…"), and gifts become queued reinforcements. In `continuous` mode it battles non-stop.
- Opponent room unreachable: RIGHT team is driven by the official opponent score delta (see FEASIBILITY-el.md §4).
- No official score: only the GAME SCORE is shown, and the "TIKTOK PK SCORE" pill stays hidden.
- Simulator events (`source:'sim'`) are only accepted when `DEMO_MODE=true` or `ALLOW_SIM=true` with `ADMIN_TOKEN`, and they turn on the on-screen SIMULATION badge.

/**
 * Internal normalized event schema. These names are OUR schema; they do not
 * imply that TikTok/EulerStream delivers every event (see docs/EVENTS.md).
 */
export type Side = 'left' | 'right';

export interface ViewerRef {
  user: string;          // stable handle (uniqueId) when available
  userId?: string;       // numeric TikTok id when available
  displayName: string;
}

interface Base {
  /** Which connected room produced the event (host or opponent uniqueId). */
  room: string;
  /** Team attributed from the room the event came from. Never guessed. */
  side: Side;
  /** Origin of the event: real TikTok connection or the simulator. */
  source: 'tiktok' | 'sim';
  at: number;
}

export type NormalizedEvent =
  | (Base & ViewerRef & { type: 'viewer_join' })
  | (Base & ViewerRef & { type: 'like'; count: number })
  | (Base & ViewerRef & { type: 'follow' })
  | (Base & ViewerRef & { type: 'membership'; level?: number })
  | (Base & ViewerRef & {
      type: 'gift';
      giftId: string;
      giftName: string;
      coins: number;        // diamond value per single gift, 0 when unknown
      count: number;        // NEW gifts in this packet (combo deltas, never cumulative)
      comboId: string;
      comboTotal: number;   // cumulative count of the combo so far
      comboEnded: boolean;
    })
  | (Base & { type: 'pk_invitation'; battleId: string; inviter?: AnchorInfo })
  | (Base & { type: 'pk_started'; battleId: string; durationSec: number | null; startedAtMs: number | null; anchors: AnchorInfo[] })
  | (Base & { type: 'pk_score_updated'; battleId: string; scores: Record<string, number>; supporters: Record<string, SupporterScore[]> })
  | (Base & { type: 'pk_ended'; battleId: string; reason: string; results: Record<string, string> })
  | (Base & { type: 'opponent_identified'; battleId: string; opponent: AnchorInfo });

export interface AnchorInfo {
  userId: string;
  uniqueId: string;   // TikTok handle (displayId)
  nickname: string;
  roomId: string;
}

export interface SupporterScore { userId: string; nickname: string; score: number }

export type EventType = NormalizedEvent['type'];

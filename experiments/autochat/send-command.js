/**
 * Internal one-shot outbound instruction for NIGHTKEEP autochat experiment.
 * No production integration. Requires explicitly provided authenticated sender.
 */
export async function sendChatCommand({sender, message, roomId, enabled=false, live=false}={}) {
  if (!enabled) return {ok:false,code:'DISABLED'};
  if (!live) return {ok:false,code:'NOT_LIVE'};
  if (typeof sender !== 'function') return {ok:false,code:'NO_AUTHENTICATED_SENDER'};
  if (typeof message !== 'string' || !message.trim() || message.length>140) return {ok:false,code:'INVALID_MESSAGE'};
  if (typeof roomId !== 'string' || !/^\d+$/.test(roomId)) return {ok:false,code:'INVALID_ROOM'};
  try {
    const response=await sender(message,roomId);
    return {ok:true,code:'SENDER_ACCEPTED',response:response??null};
  } catch(error) {
    const reason=String(error?.name||'SendError');
    return {ok:false,code:reason==='PremiumFeatureError'?'PREMIUM_REQUIRED':'SENDER_FAILED',reason};
  }
}

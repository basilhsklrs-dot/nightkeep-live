import {sendChatCommand} from './send-command.js';

/**
 * One-shot sender wiring. Caller injects an authenticated Playwright page.
 * No direct TikTok endpoint or session cookies; no production changes.
 */
export async function sendViaBrowser({page,roomId,message,inputSelector,submitSelector,liveConfirmed=false,enabled=false}={}) {
  if (!page || typeof page.locator !== 'function') return {ok:false,code:'NO_BROWSER_SESSION'};
  if (!inputSelector || !submitSelector) return {ok:false,code:'UNVERIFIED_CHAT_CONTROLS'};
  const sender=async text=>{
    const editor=page.locator(inputSelector);
    const submit=page.locator(submitSelector);
    if(await editor.count()!==1 || await submit.count()!==1 || !await editor.isVisible() || !await submit.isVisible())
      throw Object.assign(new Error('Chat controls missing'),{name:'ChatControlError'});
    await editor.fill(text);
    await submit.click();
    return {clicked:true,deliveryVerified:false};
  };
  const result=await sendChatCommand({sender,message,roomId,enabled,live:liveConfirmed});
  return result.ok?{...result,deliveryVerified:false}:result;
}

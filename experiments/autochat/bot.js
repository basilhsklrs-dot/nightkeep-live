/**
 * Isolated browser prototype. Default mode is dry-run.
 * Does not run in the NIGHTKEEP server; never imports production game modules.
 * Uses a pre-authenticated local browser profile. No password or cookie injection.
 */
import { pathToFileURL } from 'node:url';

export const messages = Object.freeze([
  '⚔️ NIGHTKEEP: Type 1 for Defenders or 2 for Siegers!',
  '❤️ Tap the LIVE to support your team!',
  '🎁 Gifts trigger powers in NIGHTKEEP!'
]);

export function planMessages({enabled=false, live=false, messages: content=messages, index=0}={}) {
  if (!enabled || !live) return {send:false,reason:enabled?'live-not-confirmed':'disabled'};
  if (!Array.isArray(content)||!content.length) return {send:false,reason:'no-messages'};
  return {send:true,text:String(content[index % content.length]).slice(0,140)};
}

export async function run({env=process.env, launcher}={}) {
  const enabled=env.AUTOCHAT_SEND_ENABLED==='true';
  const dryRun=env.AUTOCHAT_DRY_RUN!=='false';
  const username=String(env.TIKTOK_USERNAME||'').trim().replace(/^@/,'');
  if(!/^[\w.]{2,64}$/.test(username)) throw Error('Invalid TIKTOK_USERNAME');
  const url='https://www.tiktok.com/@'+username+'/live';
  const intervalMs=Math.max(240000,Number(env.AUTOCHAT_INTERVAL_MS)||240000);
  const executable=launcher || (async()=>{
    const {chromium}=await import('playwright');
    if (!env.AUTOCHAT_USER_DATA_DIR) throw Error('AUTOCHAT_USER_DATA_DIR required: use an existing authenticated profile, not a password or session cookie');
    return chromium.launchPersistentContext(env.AUTOCHAT_USER_DATA_DIR,{headless:env.AUTOCHAT_HEADLESS!=='false'});
  });
  if (!enabled) return {state:'disabled',url};
  if (dryRun) return {state:'dry-run',url,planned:messages};
  const context=await executable();
  const page=context.pages()[0]||await context.newPage();
  let index=0;
  try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    // Never guess TikTok's dynamic selectors: operator must verify the current UI.
    const selector=env.AUTOCHAT_INPUT_SELECTOR;
    const submitSelector=env.AUTOCHAT_SUBMIT_SELECTOR;
    if (!selector||!submitSelector) throw Error('Selectors not verified; no outbound comments attempted');
    const editor=page.locator(selector);
    const submit=page.locator(submitSelector);
    if(await editor.count()!==1 || await submit.count()!==1) throw Error('Chat controls unavailable or ambiguous; no outbound comments attempted');
    if(!await editor.isVisible() || !await submit.isVisible()) throw Error('Chat controls not visible; no outbound comments attempted');
    if(env.AUTOCHAT_CONFIRM_LIVE!=='true') throw Error('Live state not independently confirmed; no outbound comments attempted');
    const sendOnce=async()=>{
      const task=planMessages({enabled:true,live:true,index});
      if(!task.send)return;
      await editor.fill(task.text);
      await submit.click();
      index++;
      console.log(JSON.stringify({event:'autochat_attempted',messageNumber:index}));
    };
    await sendOnce();
    const timer=setInterval(()=>{void sendOnce().catch(e=>{console.error('Autochat stopped:',e.name);clearInterval(timer);});},intervalMs);
    return {state:'running',stop:async()=>{clearInterval(timer);await context.close();}};
  } catch(e){await context.close();throw e;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  run().then(r=>console.log(JSON.stringify({state:r.state,url:r.url,planned:r.planned}))).catch(e=>{console.error(e.message);process.exitCode=1;});
}

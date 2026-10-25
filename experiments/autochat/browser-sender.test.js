import test from 'node:test';
import assert from 'node:assert/strict';
import {sendViaBrowser} from './browser-sender.js';
const base={roomId:'12345',message:'NIGHTKEEP TEST',inputSelector:'#input',submitSelector:'#send',enabled:true,liveConfirmed:true};
test('no authenticated page refuses to send',async()=>assert.equal((await sendViaBrowser(base)).code,'NO_BROWSER_SESSION'));
test('unverified selectors refuse to send',async()=>assert.equal((await sendViaBrowser({...base,page:{locator(){}} ,inputSelector:''})).code,'UNVERIFIED_CHAT_CONTROLS'));
test('one click only, never claims delivery',async()=>{
 const calls=[];
 const page={locator(selector){return {count:async()=>1,isVisible:async()=>true,fill:async t=>calls.push(['fill',selector,t]),click:async()=>calls.push(['click',selector])};}};
 const res=await sendViaBrowser({...base,page});
 assert.equal(res.ok,true);assert.equal(res.deliveryVerified,false);
 assert.deepEqual(calls,[['fill','#input','NIGHTKEEP TEST'],['click','#send']]);
});
test('offline refuses',async()=>{let calls=0;const page={locator(){calls++;return{}}};const result=await sendViaBrowser({...base,page,liveConfirmed:false});assert.equal(result.code,'NOT_LIVE');assert.equal(calls,0);});

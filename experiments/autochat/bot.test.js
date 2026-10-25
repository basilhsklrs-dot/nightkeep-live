import test from 'node:test';
import assert from 'node:assert/strict';
import {planMessages,run,messages} from './bot.js';
test('disabled by default',async()=>assert.equal((await run({env:{TIKTOK_USERNAME:'nightkeep.live'}})).state,'disabled'));
test('dry-run never starts a browser',async()=>{
 let launches=0;
 const result=await run({env:{TIKTOK_USERNAME:'nightkeep.live',AUTOCHAT_SEND_ENABLED:'true'},launcher:async()=>{launches++;throw Error('must not launch');}});
 assert.equal(result.state,'dry-run');assert.equal(launches,0);
});
test('never sends offline or when disabled',()=>{
 assert.equal(planMessages({enabled:false,live:true}).send,false);
 assert.equal(planMessages({enabled:true,live:false}).send,false);
});
test('rotates messages',()=>{
 assert.equal(planMessages({enabled:true,live:true,index:messages.length}).text,messages[0]);
});
test('invalid account refuses to start',async()=>{
 await assert.rejects(run({env:{TIKTOK_USERNAME:'bad/handle'}}),/Invalid/);
});

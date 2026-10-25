import test from 'node:test';
import assert from 'node:assert/strict';
import {sendChatCommand} from './send-command.js';
const base={message:'NIGHTKEEP TEST',roomId:'1234',enabled:true,live:true};
test('disabled never invokes sender',async()=>{let calls=0;const r=await sendChatCommand({...base,enabled:false,sender:async()=>{calls++;}});assert.equal(calls,0);assert.equal(r.code,'DISABLED');});
test('requires live',async()=>assert.equal((await sendChatCommand({...base,live:false})).code,'NOT_LIVE'));
test('requires sender',async()=>assert.equal((await sendChatCommand(base)).code,'NO_AUTHENTICATED_SENDER'));
test('dispatches exactly once to injected authenticated sender',async()=>{const sent=[];const r=await sendChatCommand({...base,sender:async(...a)=>{sent.push(a);return {accepted:true};}});assert.equal(r.ok,true);assert.deepEqual(sent,[['NIGHTKEEP TEST','1234']]);});
test('reports premium restriction',async()=>{const r=await sendChatCommand({...base,sender:async()=>{throw Object.assign(new Error('restricted'),{name:'PremiumFeatureError'});}});assert.equal(r.code,'PREMIUM_REQUIRED');});

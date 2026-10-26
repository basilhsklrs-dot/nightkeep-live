import {test} from 'node:test';import assert from 'node:assert/strict';
import {FighterEngine,techniqueFor,auraFor} from './public/fighter-engine.js';import {normalizePK} from './pk-telemetry.js';import {Normalizer} from './server.js';
test('Rose combo keeps its technique even at x100',()=>{assert.equal(techniqueFor({giftName:'Rose',coins:1,comboTotal:100}).name,'ROSE BURST');assert.equal(techniqueFor({coins:500}).name,'COSMIC NOVA');});
test('cumulative streak counted once and upgrades same attack',()=>{const n=new Normalizer(),g=new FighterEngine(()=>100),base={user:{uniqueId:'ally'},giftId:1,giftName:'Rose',giftType:1,groupId:'g',diamondCount:1};for(const count of [1,2,2,10,10]){const e=n.normalize('gift',{...base,repeatCount:count});if(e)g.accept(e);}assert.equal(g.gifts,10);assert.equal(g.queue.length,1);assert.equal(g.next().combo,10);assert.equal(g.supporters.get('ally').points,100);});
test('gift priority and unknown gift fallback',()=>{const g=new FighterEngine();g.accept({type:'like',user:'a',count:20});g.accept({type:'gift',user:'b',giftName:'Unknown',count:1,coins:25});assert.equal(g.next().name,'THUNDER BREAK');});
test('queues stay bounded',()=>{const g=new FighterEngine();for(let i=0;i<1200;i++)g.accept({type:'gift',user:'u'+i,count:1,coins:1});assert.ok(g.queue.length<=18);assert.ok(g.supporters.size<=500);});
test('aura follows lead and requires fresh scores',()=>{assert.ok(auraFor(1000,100).strength>auraFor(550,450).strength);assert.ok(auraFor(400,600).strength<auraFor(500,500).strength);assert.equal(auraFor(100,1000).strength,0);let at=0;const g=new FighterEngine(()=>at);g.connected=true;g.accept({type:'pk',phase:'update',scoresVerified:true,ownScore:1000,opponentScore:100});assert.ok(g.aura().level>0);at=60001;assert.equal(g.aura().level,0);g.accept({type:'pk',phase:'end'});assert.equal(g.pk,null);});
test('PK matches owner id and authoritative totals',()=>{const d={battleId:'1',armies:{'123':{hostscore:'75'},'456':{hostscore:'100'}}};const p=normalizePK('LINK_MIC_ARMIES',d,'456');assert.equal(p.ownScore,100);assert.equal(p.opponentScore,75);assert.equal(p.scoresVerified,true);assert.equal(normalizePK('LINK_MIC_ARMIES',d,'789').scoresVerified,false);});
test('partial multi-host and unsafe scores never guessed',()=>{for(const armies of [{'1':{hostscore:'1'}},{'1':{hostscore:'1'},'2':{hostscore:'2'},'3':{hostscore:'3'}},{'1':{hostscore:'-1'},'2':{hostscore:'2'}},{'1':{hostscore:'9007199254740993'},'2':{hostscore:'2'}}])assert.equal(normalizePK('LINK_MIC_ARMIES',{armies},'1').scoresVerified,false);});
test('invite not start, OPEN starts, FINISH ends',()=>{assert.equal(normalizePK('LINK_MIC_BATTLE',{action:1},'1'),null);assert.equal(normalizePK('LINK_MIC_BATTLE',{action:4},'1').phase,'start');assert.equal(normalizePK('LINK_MIC_BATTLE',{action:5},'1').phase,'end');});
test('WebSocket delivers gifts, replays checkpoints, and rejects client-generated gifts',async()=>{
 const {startServer}=await import('./server.js');const {WebSocket}=await import('ws');const app=await startServer({DEMO_MODE:'true',PORT:'3137'});
 let ws;try{
  ws=new WebSocket('ws://127.0.0.1:3137/ws');const messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));
  await new Promise(r=>ws.once('open',r));await new Promise(r=>setTimeout(r,25));const hello=messages.find(x=>x.type==='hello');assert.ok(hello.instance);
  app.emit({type:'gift',user:'real',giftName:'Rose',count:1,coins:1,comboId:'r',comboTotal:1});await new Promise(r=>setTimeout(r,25));assert.equal(messages.filter(x=>x.type==='gift').length,1);
  ws.send(JSON.stringify({type:'gift',user:'fake',count:999}));await new Promise(r=>setTimeout(r,25));assert.equal(messages.filter(x=>x.user==='fake').length,0);
  ws.close();await new Promise(r=>ws.once('close',r));
  ws=new WebSocket(`ws://127.0.0.1:3137/ws?instance=${hello.instance}&after=0`);const replay=[];ws.on('message',b=>replay.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));await new Promise(r=>setTimeout(r,25));assert.equal(replay.find(x=>x.type==='hello').replayable,true);assert.equal(replay.filter(x=>x.type==='gift').length,1);
 }finally{ws?.terminate();await app.close();}
});

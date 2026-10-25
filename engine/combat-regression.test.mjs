import test from 'node:test';
import assert from 'node:assert/strict';
import {stepCombat,nearestTarget,separate,distance} from './combat-engine.js';
const unit=(id,team,x,y,extra={})=>({id,team,x,y,hp:100,damage:10,range:34,aggroRange:400,speed:30,cooldown:0,windup:0,...extra});
test('targeting ignores allies and dead units',()=>{
 const a=unit('a','defender',0,350), ally=unit('ally','defender',1,350),dead=unit('dead','sieger',2,350,{hp:0}),foe=unit('foe','sieger',50,350);
 assert.equal(nearestTarget(a,[ally,dead,foe]),foe);
});
test('no damage outside range',()=>{
 const a=unit('a','defender',0,350,{speed:0}),b=unit('b','sieger',200,350,{speed:0});
 const state={time:0,units:[a,b]};for(let i=0;i<90;i++)stepCombat(state,1/30,{rng:()=>.99});
 assert.equal(a.hp,100);assert.equal(b.hp,100);
});
test('melee impacts once per windup',()=>{
 const a=unit('a','defender',0,350,{damage:11}),b=unit('b','sieger',25,350,{damage:0,cooldown:999});
 const state={time:0,units:[a,b]};let hits=0;
 for(let i=0;i<16;i++)hits+=stepCombat(state,1/30,{rng:()=>.99}).filter(e=>e.type==='impact'&&e.source==='a').length;
 assert.equal(hits,1);assert.equal(b.hp,89);
});
test('projectile damages only on impact',()=>{
 const a=unit('a','defender',0,350,{ranged:true,range:220,projectileSpeed:30}),b=unit('b','sieger',180,350,{speed:0,cooldown:999});
 const state={time:0,units:[a,b]};let fired=false;
 for(let i=0;i<20;i++){const ev=stepCombat(state,1/30,{rng:()=>.99});if(ev.some(e=>e.type==='projectile')){fired=true;break;}}
 assert.ok(fired);assert.equal(b.hp,100);
 for(let i=0;i<220;i++)stepCombat(state,1/30,{rng:()=>.99});
 assert.ok(b.hp<100);
});
test('two dimensional separation and bounded y',()=>{
 const a=unit('a','defender',100,350),b=unit('b','defender',100,350);
 for(let i=0;i<40;i++)separate([a,b],1/30);
 assert.ok(distance(a,b)>5);assert.ok(a.y>=334&&a.y<=390&&b.y>=334&&b.y<=390);
});
test('death occurs once',()=>{
 const a=unit('a','defender',0,350,{damage:150}),b=unit('b','sieger',20,350,{hp:40,cooldown:999});
 const state={time:0,units:[a,b]};let deaths=0;
 for(let i=0;i<120;i++)deaths+=stepCombat(state,1/30,{rng:()=>.99}).filter(e=>e.type==='death'&&e.target==='b').length;
 assert.equal(b.hp,0);assert.equal(deaths,1);
});
test('simulation scales to 60 units without invalid coordinates',()=>{
 const units=Array.from({length:60},(_,i)=>unit(String(i),i<30?'defender':'sieger',i<30?110+i%6*6:300+i%6*6,340+Math.floor(i%10)*5));
 const state={time:0,units};for(let i=0;i<150;i++)stepCombat(state,1/30,{rng:()=>.99});
 for(const u of units){assert.ok(Number.isFinite(u.x)&&Number.isFinite(u.y));assert.ok(u.hp>=0);}
});

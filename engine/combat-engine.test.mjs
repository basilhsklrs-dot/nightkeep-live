import assert from 'node:assert/strict';
import {stepCombat,nearestTarget,separate} from './combat-engine.js';
const unit=(id,team,x,y)=>({id,team,x,y,hp:100,damage:10,range:34,aggroRange:250,speed:30,cooldown:0,windup:0});
{
 const a=unit('a','defender',0,350),b=unit('b','sieger',200,350);
 assert.equal(nearestTarget(a,[b]),b);
 const state={time:0,units:[a,b]};
 for(let i=0;i<300;i++)stepCombat(state,1/30,{rng:()=>.99});
 assert.ok(a.hp<100 || b.hp<100,'combat must apply damage on collision');
}
{
 const a=unit('a','defender',0,350),b=unit('b','sieger',100,350);
 const state={time:0,units:[a,b]};
 stepCombat(state,1/30);
 assert.equal(b.hp,100,'out-of-range hit forbidden');
}
{
 const a=unit('a','defender',0,350),b=unit('b','defender',0,350);
 separate([a,b],1/30);assert.ok(a.y!==b.y,'overlapping actors separate');
}
console.log('NIGHTKEEP 2.0 combat kernel tests PASS');

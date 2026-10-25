/* NIGHTKEEP 2.0 — deterministic combat simulation kernel.
   No DOM, TikTok, persistence, browser or renderer dependencies.
   Coordinates are logical world-space. */
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y-b.y)*1.65);
export function nearestTarget(actor, units, {range=Infinity, team=null}={}){
 let best=null, dBest=range;
 for(const u of units){
  if(!u||u===actor||u.hp<=0||(team&&u.team===team))continue;
  const d=distance(actor,u);
  if(d<dBest){best=u;dBest=d;}
 }
 return best;
}
export function separate(units, dt, {radius=19,strength=12,bounds=[334,390]}={}){
 const alive=units.filter(u=>u&&u.hp>0&&!u.boss);
 const corrections=new Map();
 for(const a of alive){
  let push=0;
  for(const b of alive){
   if(a===b)continue;
   const dx=a.x-b.x,dy=a.y-b.y;
   const d=Math.hypot(dx,dy);
   if(d<radius)push+=(dy||(((a.id||0)>(b.id||0))?1:-1))*(radius-d)/Math.max(d,1);
  }
  corrections.set(a,clamp(push*dt*strength,-strength*dt,strength*dt));
 }
 for(const [a,d] of corrections)a.y=clamp(a.y+d,bounds[0],bounds[1]);
}
export function stepCombat(state,dt,{rng=Math.random}={}){
 const events=[],alive=state.units.filter(u=>u.hp>0),t=state.time+dt;
 for(const u of alive){
  u.cooldown=Math.max(0,(u.cooldown||0)-dt);
  u.animationUntil ||=0;
  if(u.windup>0){
   u.windup-=dt;
   if(u.windup<=0){
    const target=alive.find(v=>v.id===u.targetId);
    if(target&&target.hp>0&&distance(u,target)<=u.range+5){
     const critical=rng()< (u.critChance||0);
     const damage=Math.max(1,Math.round((u.damage||8)*(critical?1.5:1)));
     target.hp=Math.max(0,target.hp-damage);
     target.hitUntil=t+.25; target.animation='hit';
     events.push({type:'impact',source:u.id,target:target.id,damage,critical});
     if(target.hp===0){target.animation='death';events.push({type:'death',target:target.id,killer:u.id});}
    }else events.push({type:'miss',source:u.id});
    u.windup=0;u.animation='recover';u.animationUntil=t+.18;
   }
   continue;
  }
  const enemies=alive.filter(v=>v.team!==u.team&&v.hp>0);
  const previous=enemies.find(v=>v.id===u.targetId);
  const target=previous&&distance(u,previous)<u.aggroRange*1.25?previous:nearestTarget(u,enemies,{range:u.aggroRange});
  u.targetId=target?.id||null;
  if(!target){u.animation='idle';continue;}
  const d=distance(u,target);
  if(u.ranged&&d<u.range*.42){
   const speed=(u.speed||30)*dt;
   const dx=(target.x-u.x)/Math.max(d,.001),dy=(target.y-u.y)/Math.max(d,.001);
   u.x-=dx*speed;u.y-=dy*speed;u.animation='retreat';
  }else if(d>u.range){
   const speed=(u.speed||30)*dt;
   const desired=u.ranged?Math.max(u.range*.68,u.range-15):u.range*.82;
   const travel=Math.min(speed,Math.max(0,d-desired));
   const dx=(target.x-u.x)/Math.max(d,.001),dy=(target.y-u.y)/Math.max(d,.001);
   u.x+=dx*travel;u.y+=dy*travel;u.animation='walk';
  }else if(u.cooldown<=0){
   u.windup=u.ranged?.42:.22;
   u.cooldown=u.ranged?2.1:1.1;
   u.animation=u.ranged?'draw':'attack';
   u.animationUntil=t+u.windup;
   events.push({type:'windup',source:u.id,target:target.id});
  }else u.animation=(u.hitUntil||0)>t?'hit':'guard';
 }
 separate(alive,dt);
 state.time=t;
 return events;
}

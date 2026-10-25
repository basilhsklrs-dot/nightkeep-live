/* NIGHTKEEP Personal Champion — authentic viewer, no synthetic participants.
   Original procedural vector visuals are a fallback, NOT prerendered 3D sheets. */
'use strict';
(function(){
 const EVENT_MS=45000, COOLDOWN_MS=180000, ACTIVITY_MS=150000;
 const state=game.personalChampion ||= {until:0,nextAt:Date.now()+90000,history:[]};
 const seen=new Map();
 function userOf(u){return u?.name||u?.user||''}
 function sideOf(u){return u?.siegerHero?'sieger':'defender'}
 function findFighter(id,team){
  return team==='sieger'?game.enemies.find(e=>e.siegerHero&&e.user===id&&e.hp>0):
    game.defenders.find(d=>d.name===id&&d.hp>0);
 }
 function finish(reason){
  if(!state.user)return;
  const u=findFighter(state.user,state.team);
  if(u&&u.championOriginal){
   const prev=u.championOriginal;
   u.maxHp=Math.max(1,prev.maxHp);
   u.hp=Math.min(u.hp,u.maxHp);
   u.damage=prev.damage;
   delete u.championOriginal;
   delete u.personalChampion;
  }
  if(game.heroes?.[state.user]){
   game.heroes[state.user].championWins=(game.heroes[state.user].championWins||0)+(reason==='survived'?1:0);
  }
  if(reason==='survived')grantXp(state.user,45);
  feed(displayHeroName(state.user),'CHAMPION '+reason.toUpperCase(),state.team==='sieger'?'#ff9aa9':'#a0dbff');
  state.history ||= [];
  state.history.push({user:state.user,team:state.team,at:Date.now(),result:reason});
  state.history=state.history.slice(-30);
  state.user=null;state.team=null;state.until=0;state.nextAt=Date.now()+COOLDOWN_MS;
 }
 function start(){
  const now=Date.now();
  const candidates=[];
  for(const team of ['defender','sieger']){
   const fighters=team==='defender'?game.defenders:game.enemies.filter(e=>e.siegerHero);
   for(const u of fighters){
    const id=userOf(u),h=game.heroes?.[id],p=(game.players||[]).find(p=>p.user===id);
    if(!id||id==='viewer'||!h||!u.hp||u.hp<=0||!(u.activeUntil>now)||!(seen.get(id)>now-ACTIVITY_MS))continue;
    const score=Math.min(150,(p?.damage||0)/80+(p?.siegeDamage||0)/80)+
     Math.min(80,(p?.kills||0)*10+(p?.siegeKOs||0)*10)+
     Math.min(60,(h.level||1)*4)+Math.min(50,Math.sqrt(p?.likes||0)*4)+
     (h.following?12:0)+(h.member?12:0)+Math.min(20,Math.sqrt(p?.giftPoints||0));
    candidates.push({id,team,u,score:score+Math.random()*14});
   }
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length){state.nextAt=now+30000;return}
  const chosen=candidates[0],u=chosen.u;
  state.user=chosen.id;state.team=chosen.team;state.until=now+EVENT_MS;state.lastAbilityAt=0;
  u.championOriginal={maxHp:u.maxHp||100,damage:u.damage||20};
  u.personalChampion=true;u.maxHp=Math.round(u.championOriginal.maxHp*2.1);
  u.hp=Math.min(u.maxHp,Math.max(u.hp,u.championOriginal.maxHp)+u.championOriginal.maxHp);
  u.damage=Math.round(u.championOriginal.damage*1.5);
  game.featureAnnouncement={title:'⚔ PERSONAL CHAMPION',detail:displayHeroName(chosen.id)+' — '+chosen.team.toUpperCase(),until:now+5000};
  feed(displayHeroName(chosen.id),'SELECTED AS '+chosen.team.toUpperCase()+' CHAMPION','#f5cc73');
  beep('boss');
 }
 const originalEvent=applyEvent;
 applyEvent=function(e){
  if(e&&e.user&&['join','like','follow','member','gift','team'].includes(e.type))seen.set(String(e.user).slice(0,64),Date.now());
  return originalEvent(e);
 };
 function ability(){
  const now=Date.now();if(now-(state.lastAbilityAt||0)<9000)return;
  const u=findFighter(state.user,state.team);
  if(!u||u.hp<=0){finish('defeated');return}
  state.lastAbilityAt=now;
  if(state.team==='defender'){
   const enemies=game.enemies.filter(e=>e.hp>0&&!e.worldBoss);
   for(const e of enemies.slice(0,5)){
    e.hp-=Math.max(12,u.damage*.65);
    if(e.hp<=0)e.lastHitOwner=state.user;
   }
   game.shield=Math.max(game.shield||0,2.5);
   for(const d of game.defenders.filter(d=>d.hp>0).slice(0,12))d.hp=Math.min(d.maxHp||100,d.hp+14);
   feed(displayHeroName(state.user),'SHIELD BURST · RALLY · HEAVY STRIKE','#a0dbff');
  }else{
   game.siegeBoost=Math.max(game.siegeBoost||0,28);
   for(const e of game.enemies.filter(e=>e.hp>0&&e.siegerHero).slice(0,12))e.hp=Math.min(e.maxHp||100,e.hp+16);
   const targets=[...(game.militia||[]),...game.defenders].filter(d=>d.hp>0);
   for(const d of targets.slice(0,5))d.hp-=Math.max(10,u.damage*.5);
   game.hp=Math.max(0,game.hp-Math.min(65,u.damage*.6));
   feed(displayHeroName(state.user),'WAR CRY · RAGE CHARGE · GROUND SMASH','#ff9aa9');
  }
  game.featureAnnouncement={title:displayHeroName(state.user),detail:state.team==='defender'?'SHIELD BURST!':'GROUND SMASH!',until:now+1800};
  game.shake=Math.max(game.shake||0,.5);
 }
 const originalUpdate=update;
 update=function(dt){
  const now=Date.now();
  if(state.user){
   const u=findFighter(state.user,state.team);
   if(!u||u.hp<=0)finish('defeated');
   else if(now>=state.until)finish('survived');
   else ability();
  }else if(now>=(state.nextAt||0))start();
  return originalUpdate(dt);
 };
 const originalDrawEnemy=drawEnemy;
 drawEnemy=function(e,x=e.x,y=e.y,portraitView=false){
  originalDrawEnemy(e,x,y,portraitView);
  if(e.personalChampion){ctx.save();ctx.strokeStyle='#ffb16a';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y-22,22+Math.sin(game.time*6)*3,39,0,0,Math.PI*2);ctx.stroke();ctx.restore()}
 };
 window.nightkeepChampionStatus=()=>({user:state.user||null,team:state.team||null,until:state.until||0,nextAt:state.nextAt||0});
})();

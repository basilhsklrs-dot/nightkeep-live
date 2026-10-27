export const TECHNIQUES = [
  {name:'ROSE BURST',color:0xff4f94,duration:1.15,kind:'orb'},
  {name:'PHOTON STRIKE',color:0x42e5ff,duration:1.35,kind:'dash'},
  {name:'THUNDER BREAK',color:0x9e8aff,duration:1.65,kind:'lightning'},
  {name:'SOLAR CANNON',color:0xffbf49,duration:1.95,kind:'beam'},
  {name:'COSMIC NOVA',color:0xe69cff,duration:2.5,kind:'nova'}
];
export function techniqueFor(e){
  const coins=Math.max(0,Number(e.coins)||0),name=String(e.giftName||'').toLowerCase();
  // A combo amplifies the gift's own technique; it never substitutes a pricier gift.
  const tier=/^(rose|τριαντάφυλλο)$/.test(name)?0:coins>=500?4:coins>=100?3:coins>=20?2:coins>=5?1:0;
  return {...TECHNIQUES[tier],tier};
}
export function comboProfile(count){
  const combo=Math.max(1,Math.min(100000,Math.floor(Number(count)||1))),stage=combo>=20?3:combo>=10?2:combo>=5?1:0;
  return {stage,power:Math.min(3.4,1+Math.log2(combo)*.32),shots:combo,finisher:stage>=2,label:['SINGLE STRIKE','MULTI STRIKE','POWER FINISH','OVERDRIVE FINISH'][stage]};
}
// One scheduled strike per gift. Frame budgets defer work; they never discard strikes.
export class AttackRun{
  constructor(a,now){
    this.target=a.kind==='tap'?1:comboProfile(a.combo).shots;
    this.emitted=Math.min(this.target,a.emitted||0);this.startedAt=now;
    this.windup=a.kind==='tap'?100:Math.min(420,a.duration*250);
    this.nextAt=now+this.windup;this.lastShotAt=null;
  }
  get interval(){return 1000/Math.min(80,4+Math.sqrt(this.target)*2.5);}
  extend(total,now){const next=comboProfile(total).shots;if(next>this.target){if(this.emitted>=this.target)this.nextAt=Math.max(now,this.nextAt);this.target=next;}}
  due(now){
    const shots=[];
    while(this.emitted<this.target&&now>=this.nextAt&&shots.length<4){
      const index=this.emitted++;this.lastShotAt=now;
      shots.push({index,final:this.emitted===this.target&&comboProfile(this.target).finisher});
      this.nextAt+=this.interval;
    }
    return shots;
  }
  phase(now){return this.lastShotAt===null?Math.min(.3,(now-this.startedAt)/this.windup*.3):.3+Math.min(.7,(now-this.lastShotAt)/Math.max(150,this.interval)*.7);}
  done(now){return this.emitted>=this.target&&this.lastShotAt!==null&&now-this.lastShotAt>=450;}
}
export function auraFor(own,other){
  if(!Number.isFinite(own)||!Number.isFinite(other)||own<0||other<0)return {level:0,strength:0,lead:0};
  const lead=own-other,strength=Math.max(0,Math.min(1,.24+lead/Math.max(50,own+other)*1.65));
  return {lead,strength,level:strength<.06?0:strength<.3?1:strength<.55?2:strength<.8?3:4};
}
const rank=map=>[...map.values()].filter(p=>p.points>0).sort((a,b)=>(b.coins||0)-(a.coins||0)||b.points-a.points).slice(0,3).map(p=>({...p}));
export class FighterEngine{
  constructor(now=()=>Date.now()){
    this.now=now;this.queue=[];this.deferredGifts=[];this.combos=new Map();this.supporters=new Map();this.battleSupporters=new Map();this.closedBattles=new Set();
    this.likes=0;this.gifts=0;this.energy=0;this.pk=null;this.connected=false;this.notice=null;this.tapPending=0;this.result=null;this.spotlight=null;this.activeCombo=null;this.greeting=null;
  }
  accept(e){
    const at=this.now();
    if(e.type==='pk'){
      const id=String(e.battleId||'');
      if(id&&this.closedBattles.has(id)){
        const refinement=e.phase==='end'&&this.result?.battleId===id&&this.result.outcome==='unknown'&&!this.pk&&this.now()<this.result.expiresAt&&e.scoresVerified;
        if(!refinement)return;
      }
      if(e.phase==='end'){
        if(this.pk?.battleId&&id&&id!==this.pk.battleId)return;
        // Only explicit final, verified totals can announce victory. A previous lead is not a result.
        const valid=e.scoresVerified&&Number.isSafeInteger(e.ownScore)&&Number.isSafeInteger(e.opponentScore)&&e.ownScore>=0&&e.opponentScore>=0;
        this.result={battleId:id||this.pk?.battleId||'',at,expiresAt:at+10000,outcome:valid?(e.ownScore>e.opponentScore?'win':e.ownScore<e.opponentScore?'loss':'draw'):'unknown',ownScore:valid?e.ownScore:null,opponentScore:valid?e.opponentScore:null,leaders:rank(this.battleSupporters)};
        if(id){this.closedBattles.add(id);if(this.closedBattles.size>32)this.closedBattles.delete(this.closedBattles.values().next().value);}
        this.pk=null;this.queue=[];this.deferredGifts=[];this.activeCombo=null;this.notice={title:'BATTLE COMPLETE',detail:'Thank you, fighters',at};return;
      }
      if(!this.pk||(id&&id!==this.pk.battleId)){
        this.battleSupporters.clear();this.result=null;
        // Do not carry prior totals into a new battle or replay old gifts in its opening.
        this.pk={};this.queue=[];this.deferredGifts=[];this.activeCombo=null;
      }
      this.pk={...this.pk,...e,receivedAt:at};return;
    }
    if(!e.user)return;
    let p=this.supporters.get(e.user);
    if(!p){p={name:e.displayName||e.user,points:0,coins:0};this.supporters.set(e.user,p);}
    p.name=e.displayName||p.name;p.at=at;
    const count=Math.max(1,Math.min(100000,Number(e.count)||1));let points=0,coins=0;
    if(e.type==='like'){
      this.likes+=count;points=count;this.energy=Math.min(100,this.energy+count*.12);this.tapPending=Math.min(100,this.tapPending+count);
      if(!this.queue.some(a=>a.kind==='tap'))this.queue.push({kind:'tap',name:'LIGHT STRIKE',color:0x80eaff,duration:.46,combo:Math.min(10,this.tapPending),by:p.name,user:e.user,tier:-1,at});
    }else if(e.type==='gift'){
      const technique=techniqueFor(e),id=e.comboId||null,old=id?this.combos.get(id):null;
      const total=Math.max(count,Number(e.comboTotal)||count,old?.total||0);
      if(old&&total<=old.total)return;
      if(id)this.combos.set(id,{total,emitted:old?.emitted||0,at});
      this.gifts+=count;coins=Math.max(1,Number(e.coins)||1)*count;points=coins*10;this.energy=Math.min(100,this.energy+count*2);
      const queued=id&&[...this.queue,...this.deferredGifts].find(a=>a.comboId===id);
      if(queued){queued.combo=total;queued.at=at;}
      else if(!id||this.activeCombo!==id){this.queue=this.queue.filter(a=>a.kind!=='tap');this.queue.push({...technique,combo:total,comboId:id,by:p.name,user:e.user,gift:e.giftName||'GIFT',at});}
      this.spotlight={name:p.name,gift:e.giftName||'GIFT',combo:total,technique:technique.name,color:technique.color,at};
      this.notice={title:technique.name,detail:`${p.name} · ${e.giftName||'GIFT'} ×${total}`,at};
    }else if(e.type==='follow'){
      this.greeting={name:p.name,at,kind:'follow'};this.energy=Math.min(100,this.energy+10);points=100;this.notice={title:'NEW ALLY',detail:`${p.name} followed`,at};
    }else if(e.type==='join'){this.greeting={name:p.name,at,kind:'join'};this.notice={title:'WELCOME, FIGHTER',detail:p.name,at};}
    p.points+=points;p.coins+=coins;
    if(this.pk&&points){const b=this.battleSupporters.get(e.user)||{name:p.name,points:0,coins:0};b.name=p.name;b.points+=points;b.coins+=coins;this.battleSupporters.set(e.user,b);}
    while(this.queue.length>18){const i=this.queue.findIndex(a=>a.kind==='tap');if(i>=0)this.queue.splice(i,1);else this.deferredGifts.push(this.queue.pop());}
    for(const [key,c] of this.combos)if(at-c.at>120000&&key!==this.activeCombo&&![...this.queue,...this.deferredGifts].some(a=>a.comboId===key))this.combos.delete(key);
    for(const map of [this.supporters,this.battleSupporters])if(map.size>500){const ranked=[...map.entries()].sort((a,b)=>b[1].points-a[1].points);map.clear();for(const [key,value]of ranked.slice(0,400))map.set(key,value);}
  }
  next(){const at=this.now();while(this.queue.length||this.deferredGifts.length){while(this.queue.length<18&&this.deferredGifts.length)this.queue.push(this.deferredGifts.shift());const a=this.queue.shift();if(a.kind!=='tap'||at-a.at<20000){if(a.kind==='tap')this.tapPending=0;const c=a.comboId&&this.combos.get(a.comboId);a.emitted=c?.emitted||0;if(c)a.combo=c.total;if(a.kind!=='tap'&&a.emitted>=a.combo)continue;this.activeCombo=a.comboId||null;return a;}}return null;}
  recordShots(a,emitted){if(a.comboId){const c=this.combos.get(a.comboId);if(c)c.emitted=Math.max(c.emitted||0,Math.min(c.total,emitted));}}
  complete(){this.activeCombo=null;}
  aura(){return this.connected&&this.pk?.scoresVerified&&this.now()-this.pk.receivedAt<60000?auraFor(this.pk.ownScore,this.pk.opponentScore):{level:0,strength:0,lead:0};}
  leaders(){return rank(this.pk?this.battleSupporters:this.supporters);}
  waiting(){return [...this.queue,...this.deferredGifts].filter(a=>a.kind!=='tap').map(a=>{const c=a.comboId&&this.combos.get(a.comboId);return {...a,remaining:(c?.total||a.combo)-(c?.emitted||0)};}).filter(a=>a.remaining>0);}
  activeResult(){return this.result&&this.now()<this.result.expiresAt?this.result:null;}
}

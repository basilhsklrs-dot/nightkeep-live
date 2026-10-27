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
  const combo=Math.max(1,Number(count)||1),stage=combo>=20?3:combo>=10?2:combo>=5?1:0;
  return {stage,power:Math.min(3.4,1+Math.log2(combo)*.32),shots:[1,3,4,5][stage],finisher:stage>=2,label:['SINGLE STRIKE','MULTI STRIKE','POWER FINISH','OVERDRIVE FINISH'][stage]};
}
export function auraFor(own,other){
  if(!Number.isFinite(own)||!Number.isFinite(other)||own<0||other<0)return {level:0,strength:0,lead:0};
  const lead=own-other,strength=Math.max(0,Math.min(1,.24+lead/Math.max(50,own+other)*1.65));
  return {lead,strength,level:strength<.06?0:strength<.3?1:strength<.55?2:strength<.8?3:4};
}
const rank=map=>[...map.values()].filter(p=>p.points>0).sort((a,b)=>(b.coins||0)-(a.coins||0)||b.points-a.points).slice(0,3).map(p=>({...p}));
export class FighterEngine{
  constructor(now=()=>Date.now()){
    this.now=now;this.queue=[];this.combos=new Map();this.supporters=new Map();this.battleSupporters=new Map();this.closedBattles=new Set();
    this.likes=0;this.gifts=0;this.energy=0;this.pk=null;this.connected=false;this.notice=null;this.tapPending=0;this.result=null;this.spotlight=null;this.activeCombo=null;
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
        this.pk=null;this.queue=[];this.activeCombo=null;this.notice={title:'BATTLE COMPLETE',detail:'Thank you, fighters',at};return;
      }
      if(!this.pk||(id&&id!==this.pk.battleId)){
        this.battleSupporters.clear();this.result=null;
        // Do not carry prior totals into a new battle or replay old gifts in its opening.
        this.pk={};this.queue=[];this.activeCombo=null;
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
      if(id)this.combos.set(id,{total,at});
      this.gifts+=count;coins=Math.max(1,Number(e.coins)||1)*count;points=coins*10;this.energy=Math.min(100,this.energy+count*2);
      const queued=id&&this.queue.find(a=>a.comboId===id);
      if(queued){queued.combo=total;queued.at=at;}
      else if(!id||this.activeCombo!==id){this.queue=this.queue.filter(a=>a.kind!=='tap');this.queue.push({...technique,combo:total,comboId:id,by:p.name,user:e.user,gift:e.giftName||'GIFT',at});}
      this.spotlight={name:p.name,gift:e.giftName||'GIFT',combo:total,technique:technique.name,color:technique.color,at};
      this.notice={title:technique.name,detail:`${p.name} · ${e.giftName||'GIFT'} ×${total}`,at};
    }else if(e.type==='follow'){
      this.energy=Math.min(100,this.energy+10);points=100;this.notice={title:'NEW ALLY',detail:`${p.name} followed`,at};
    }else if(e.type==='join'){this.notice={title:'WELCOME, FIGHTER',detail:p.name,at};}
    p.points+=points;p.coins+=coins;
    if(this.pk&&points){const b=this.battleSupporters.get(e.user)||{name:p.name,points:0,coins:0};b.name=p.name;b.points+=points;b.coins+=coins;this.battleSupporters.set(e.user,b);}
    while(this.queue.length>18){const i=this.queue.findIndex(a=>a.kind==='tap');this.queue.splice(i<0?0:i,1);}
    for(const [key,c] of this.combos)if(at-c.at>120000)this.combos.delete(key);
    for(const map of [this.supporters,this.battleSupporters])if(map.size>500){const ranked=[...map.entries()].sort((a,b)=>b[1].points-a[1].points);map.clear();for(const [key,value]of ranked.slice(0,400))map.set(key,value);}
  }
  next(){const at=this.now();while(this.queue.length){const a=this.queue.shift();if(at-a.at<20000){if(a.kind==='tap')this.tapPending=0;this.activeCombo=a.comboId||null;return a;}}return null;}
  complete(){this.activeCombo=null;}
  aura(){return this.connected&&this.pk?.scoresVerified&&this.now()-this.pk.receivedAt<60000?auraFor(this.pk.ownScore,this.pk.opponentScore):{level:0,strength:0,lead:0};}
  leaders(){return rank(this.pk?this.battleSupporters:this.supporters);}
  activeResult(){return this.result&&this.now()<this.result.expiresAt?this.result:null;}
}

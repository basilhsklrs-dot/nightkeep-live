export const TECHNIQUES = [
  {name:'ROSE BURST',color:0xff4f94,duration:1.05,kind:'orb'},
  {name:'PHOTON STRIKE',color:0x42e5ff,duration:1.25,kind:'dash'},
  {name:'THUNDER BREAK',color:0x9e8aff,duration:1.5,kind:'lightning'},
  {name:'SOLAR CANNON',color:0xffbf49,duration:1.8,kind:'beam'},
  {name:'COSMIC NOVA',color:0xe69cff,duration:2.3,kind:'nova'}
];
export function techniqueFor(e){
  const coins=Math.max(0,Number(e.coins)||0);
  const name=String(e.giftName||'').toLowerCase();
  // The technique belongs to ONE gift. Combo size never changes its identity.
  const tier=/^(rose|τριαντάφυλλο)$/.test(name)?0:coins>=500?4:coins>=100?3:coins>=20?2:coins>=5?1:0;
  return {...TECHNIQUES[tier],tier};
}
export function auraFor(own,other){
  if(!Number.isFinite(own)||!Number.isFinite(other)||own<0||other<0)return {level:0,strength:0,lead:0};
  const lead=own-other,ratio=lead/Math.max(50,own+other);
  const strength=Math.max(0,Math.min(1,.24+ratio*1.65));
  return {lead,strength,level:strength<.06?0:strength<.3?1:strength<.55?2:strength<.8?3:4};
}
export class FighterEngine{
  constructor(now=()=>Date.now()){
    this.now=now;this.queue=[];this.combos=new Map();this.supporters=new Map();this.likes=0;this.gifts=0;this.energy=0;
    this.pk=null;this.connected=false;this.notice=null;this.tapPending=0;
  }
  accept(e){
    const at=this.now();
    if(e.type==='pk'){
      if(e.phase==='end'){this.pk=null;this.notice={title:'BATTLE COMPLETE',detail:'Thank you, fighters',at};return;}
      const old=this.pk;
      if(old&&e.battleId&&old.battleId!==e.battleId)this.pk=null;
      this.pk={...(this.pk||{}),...e,receivedAt:at};return;
    }
    if(!e.user)return;
    let p=this.supporters.get(e.user);
    if(!p){p={name:e.displayName||e.user,points:0};this.supporters.set(e.user,p);}
    p.name=e.displayName||p.name;p.at=at;
    const count=Math.max(1,Math.min(100000,Number(e.count)||1));
    if(e.type==='like'){
      this.likes+=count;p.points+=count;this.energy=Math.min(100,this.energy+count*.12);this.tapPending=Math.min(100,this.tapPending+count);
      if(!this.queue.some(a=>a.kind==='tap'))this.queue.push({kind:'tap',name:'LIGHT STRIKE',color:0x80eaff,duration:.46,combo:Math.min(10,this.tapPending),by:p.name,tier:-1,at});
    }else if(e.type==='gift'){
      const technique=techniqueFor(e),id=e.comboId||null;
      const old=id?this.combos.get(id):null;
      const total=Math.max(count,Number(e.comboTotal)||count,old?.total||0);
      if(old&&total<=old.total)return;
      const combo={total,at};if(id)this.combos.set(id,combo);
      this.gifts+=count;p.points+=Math.max(1,Number(e.coins)||1)*count*10;this.energy=Math.min(100,this.energy+count*2);
      const queued=id&&this.queue.find(a=>a.comboId===id);
      if(queued){queued.combo=total;queued.at=at;}
      else{
        // Gifts take priority over pending likes; the queue remains bounded under load.
        this.queue=this.queue.filter(a=>a.kind!=='tap');
        this.queue.push({...technique,combo:total,comboId:id,by:p.name,gift:e.giftName||'GIFT',at});
      }
      this.notice={title:technique.name,detail:`${p.name} · ${e.giftName||'GIFT'} ×${total}`,at};
    }else if(e.type==='follow'){
      this.energy=Math.min(100,this.energy+10);p.points+=100;this.notice={title:'NEW ALLY',detail:`${p.name} followed`,at};
    }else if(e.type==='join'){this.notice={title:'WELCOME, FIGHTER',detail:p.name,at};}
    while(this.queue.length>18){const i=this.queue.findIndex(a=>a.kind==='tap');this.queue.splice(i<0?0:i,1);}
    for(const [key,c] of this.combos)if(at-c.at>120000)this.combos.delete(key);
    if(this.supporters.size>500){const ranked=[...this.supporters.entries()].sort((a,b)=>b[1].points-a[1].points);this.supporters=new Map(ranked.slice(0,400));}
  }
  next(){const at=this.now();while(this.queue.length){const a=this.queue.shift();if(at-a.at<20000){if(a.kind==='tap')this.tapPending=0;return a;}}return null;}
  aura(){return this.connected&&this.pk?.scoresVerified&&this.now()-this.pk.receivedAt<60000?auraFor(this.pk.ownScore,this.pk.opponentScore):{level:0,strength:0,lead:0};}
  leaders(){return [...this.supporters.values()].filter(p=>p.points>0).sort((a,b)=>b.points-a.points).slice(0,3);}
}

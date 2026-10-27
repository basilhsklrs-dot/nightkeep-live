// Server-only outbound chat. Never consumes replayed or simulated events.
const safe=(s,n=32)=>String(s??'').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim().slice(0,n);
export const GUIDANCE=[
  '👊 TAP TAP to power our fighter! Your likes trigger light attacks.',
  '🌹 Each gift has its own attack. Combo ×7 = 7 attacks, ×8 = 8, and so on!',
  '⚡ Our aura follows the verified battle score. Your support powers the fight!',
  '🏆 Thank you, allies! Top gift supporters appear on our fighter’s podium.'
];
export class LiveChat {
  constructor({send,ready,now=Date.now,log=()=>{},enabled=true}){
    Object.assign(this,{send,ready,now,log,enabled});this.room='';this.pending=new Map();this.seen=new Map();this.sending=false;this.failures=0;this.paused=false;this.sent=0;this.index=0;this.lastAttempt=-Infinity;this.lastGift=-Infinity;this.attempts=[];this.guidanceAt=Infinity;
  }
  setRoom(room){if(this.room===room)return;this.room=room;this.pending.clear();this.seen.clear();this.guidanceAt=this.now()+300000;}
  gift(e){
    if(!this.enabled||!this.room||e.type!=='gift'||!e.user)return;
    const t=this.now(),key=String(e.comboId||e.seq||'');if(!key)return;
    const total=Math.max(1,Math.floor(Number(e.comboTotal??e.count)||1));
    const prev=this.seen.get(key);if(prev&&prev.total>=total)return;
    this.seen.set(key,{total,at:t});this.lastGift=t;
    for(const [k,v]of this.seen)if(t-v.at>600000)this.seen.delete(k);
    while(this.seen.size>10000)this.seen.delete(this.seen.keys().next().value);
    const old=this.pending.get(key);
    // Don't repeat every cumulative count already acknowledged in chat.
    if(prev&&!old)return;
    if(!old&&this.pending.size>=200)return;
    this.pending.set(key,{name:safe(e.displayName||e.user),gift:safe(e.giftName||'gift',24),total,first:old?.first??t,at:t});
  }
  summary(){return {enabled:this.enabled,configured:this.ready(),paused:this.paused,pending:this.pending.size,sent:this.sent,failures:this.failures,guidanceSeconds:300,minMessageSeconds:8,maxMessagesPerMinute:6};}
  async tick(){
    const t=this.now();
    if(!this.enabled||this.paused||this.sending||!this.room||!this.ready())return;
    this.attempts=this.attempts.filter(at=>t-at<60000);
    if(t-this.lastAttempt<8000||this.attempts.length>=6)return;
    for(const[k,v]of this.pending)if(t-v.at>60000)this.pending.delete(k);
    const gifts=[...this.pending].filter(([,v])=>t-v.at>=1200||t-v.first>=5000).slice(0,3);
    let text,kind;
    if(gifts.length){
      text='⚡ Thank you '+gifts.map(([,v])=>`${v.name}: ${v.gift} ×${v.total}`).join(' · ')+'! Your support powers our fighter!';kind='thanks';
      for(const[k]of gifts)this.pending.delete(k);
    }else{
      if(this.pending.size||t<this.guidanceAt||t-this.lastGift<45000)return;
      text=GUIDANCE[this.index++%GUIDANCE.length];kind='guidance';this.guidanceAt=t+300000;
    }
    this.sending=true;this.lastAttempt=t;this.attempts.push(t);const room=this.room;
    try{
      // A failed/uncertain send is never replayed: it may already have reached chat.
      const result=await this.send(text.slice(0,200),room);
      if(result?.status_code!=null&&Number(result.status_code)!==0)throw new Error('ChatRejected');
      this.failures=0;this.sent++;this.log({event:'live_chat_sent',kind});
    }catch(error){
      this.failures++;if(this.failures>=3)this.paused=true;
      this.log({event:'live_chat_failed',kind,count:this.failures,paused:this.paused});
    }finally{this.sending=false;}
  }
}

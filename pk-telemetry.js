// Field names and action values from tiktok-live-proto v3, installed with connector 2.5.0.
// Unknown/multi-host payloads deliberately yield no scores rather than guessed totals.
const score=v=>typeof v==='string'&&/^\d+$/.test(v)||typeof v==='number'&&Number.isInteger(v)&&v>=0?Number.isSafeInteger(Number(v))?Number(v):null:null;
export function normalizePK(source,payload,hostId){
  const d=payload?.data||payload||{},settings=d.battleSettings||d.battleSetting;
  const action=Number(d.action);
  const end=source==='LINK_MIC_BATTLE_PUNISH_FINISH'||source==='LINK_MIC_BATTLE'&&[5,6,11].includes(action);
  const start=source==='LINK_MIC_BATTLE'&&action===4;
  if(source==='LINK_MIC_BATTLE'&&!end&&!start)return null;
  const packet={type:'pk',phase:end?'end':start?'start':'update',source,battleId:String(d.battleId||settings?.battleId||''),scoresVerified:false};
  const duration=Number(settings?.duration);if(duration>0&&duration<3600)packet.duration=duration;
  const started=Number(settings?.startTimeMs);if(started>0&&Number.isSafeInteger(started))packet.startedAt=started;
  if(end)return packet;
  // Accept only 1v1 anchor totals, never the contribution lists of individual gifters.
  const armies=Array.isArray(d.armies)?Object.fromEntries(d.armies.map(x=>[x.key,x.value])):d.armies;
  let entries=Object.entries(armies||{}).map(([id,a])=>[String(a?.anchorIdStr||id),score(a?.hostscore)]);
  if(entries.length!==2||entries.some(([,s])=>s===null)){
    entries=Object.entries(d.battleResult||{}).map(([id,a])=>[String(a?.userId||id),score(a?.score)]);
  }
  const host=String(hostId||'');
  if(entries.length===2&&entries.every(([,s])=>s!==null)&&entries[0][0]!==entries[1][0]&&host){
    const own=entries.find(x=>x[0]===host),other=entries.find(x=>x[0]!==host);
    if(own&&other){packet.ownScore=own[1];packet.opponentScore=other[1];packet.scoresVerified=true;}
  }
  return packet;
}

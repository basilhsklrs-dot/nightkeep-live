import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
const streamer=(process.env.TIKTOK_USERNAME||'aisxr0s').replace(/^@/,'');
const demo=process.env.DEMO_MODE==='true';
let lastError='';
const server=http.createServer(async(req,res)=>{
 if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,streamer,mode:demo?'demo':'real',status,room,connected:status==='live',lastError}));return;}
 if(req.method==='GET' && !new URL(req.url,'http://localhost').pathname.startsWith('/api/') && !new URL(req.url,'http://localhost').pathname.startsWith('/healthz')){try{let h=await readFile(new URL('./public/index.html',import.meta.url));res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(h);}catch{res.writeHead(500);res.end('Frontend missing')}return;}
 res.writeHead(404);res.end('Not found');
});
let status=demo?'demo':'connecting',room='',connection=null,attempt=0;
const wss=new WebSocketServer({server,path:'/ws'});
const send=(o)=>{let s=JSON.stringify(o);for(let c of wss.clients)if(c.readyState===1)c.send(s);};
wss.on('connection',ws=>ws.send(JSON.stringify({type:'status',status,streamer,room})));
const lastStreaks=new Map();
function evt(kind,d){
 const user=String(d.user?.uniqueId||d.uniqueId||d.user?.nickname||'viewer').slice(0,60);
 if(kind==='like'){send({type:'like',user,count:Math.max(1,Math.min(1000,Number(d.count)||1))});return;}
 if(kind==='follow'){send({type:'follow',user,count:1});return;}
 const name=String(d.gift?.name||d.giftName||'').toLowerCase().trim();
 const action=({'rose':'heal','finger heart':'shield','doughnut':'wave','donut':'wave','ice cream':'wave','cap':'mini','sunglasses':'mini','lion':'dragon','drama queen':'dragon','universe':'dragon','tiktok universe':'dragon'})[name];
 if(!action)return;
 const id=String(d.giftId||d.gift?.id||name);
 const isStreak=Number(d.gift?.type??d.giftType)===1;
 const total=Math.max(1,Number(d.repeatCount)||1);
 const key=[room,user,id,String(d.groupId||'')].join('|');
 let count=total;
 if(isStreak){const prev=lastStreaks.get(key)||0;count=Math.max(0,total-prev);lastStreaks.set(key,total);if(d.repeatEnd||lastStreaks.size>5000)lastStreaks.delete(key);}
 if(count)send({type:'gift',user,name,action,count,comboTotal:total});
}
async function connect(){
 if(demo)return;
 status='connecting';send({type:'status',status,streamer});
 try{
  if(connection)try{await connection.disconnect()}catch{}
  connection=new TikTokLiveConnection(streamer,{enableExtendedGiftInfo:false});
  connection.on(WebcastEvent.LIKE,d=>evt('like',d));
  connection.on(WebcastEvent.FOLLOW,d=>evt('follow',d));
  connection.on(WebcastEvent.GIFT,d=>evt('gift',d));
  connection.on('disconnected',()=>{status='disconnected';send({type:'status',status});retry()});
  connection.on('error',e=>console.warn('TikTok error',String(e?.message||JSON.stringify(e)).slice(0,300)));
  const result=await connection.connect();
  room=String(result?.roomId||'');status='live';lastError='';attempt=0;send({type:'status',status,streamer,room});
 }catch(err){status='offline';lastError=String(err?.message||err).slice(0,300);console.warn('TikTok not connected',lastError);send({type:'status',status,error:lastError});retry();}
}
let timer=null;
function retry(){if(timer)return;const wait=Math.min(60000,5000*2**Math.min(attempt++,4));timer=setTimeout(()=>{timer=null;connect()},wait)}
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>{console.log('Nightkeep started',streamer,server.address().port);connect()});

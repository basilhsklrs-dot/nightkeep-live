import * as THREE from '/three.module.js';
import {FighterEngine} from '/fighter-engine.js';
const $=s=>document.querySelector(s), params=new URLSearchParams(location.search), demo=params.get('demo')==='1';
const engine=new FighterEngine();let attack=null,attackAt=0,last=performance.now(),auraStrength=0,level=0,shake=0,ws,retry=0,instance='',seq=0,noticeAt=0,lastHud=0;
if(demo){document.body.classList.add('demo');$('#demo').style.display='block';}
if(params.get('clean')==='1')document.body.classList.add('clean');
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){$('#fatal').style.display='block';$('#fatal').textContent='3D renderer unavailable. Enable WebGL and reopen the page.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;$('#stage').append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x060914);scene.fog=new THREE.FogExp2(0x080d21,.045);
const camera=new THREE.PerspectiveCamera(33,1,.1,100);camera.position.set(0,3.4,14.8);camera.lookAt(0,2.7,0);
const baseCamera=camera.position.clone();
scene.add(new THREE.HemisphereLight(0xa7dfff,0x181023,2.6));
const key=new THREE.DirectionalLight(0xe0eeff,4.4);key.position.set(-4,6,6);scene.add(key);
const rim=new THREE.DirectionalLight(0x8754ff,5);rim.position.set(4,4,-3);scene.add(rim);
const powerLight=new THREE.PointLight(0x57ddff,0,10);powerLight.position.set(0,2,1.2);scene.add(powerLight);
const standard=(color,metalness=.3)=>new THREE.MeshStandardMaterial({color,metalness,roughness:.45});
const suit=standard(0x171e3e,.65),armor=standard(0x414c81,.65),skin=standard(0xe4ad90,.05),boot=standard(0x101526,.55),gold=standard(0xebad50,.65),hair=standard(0xe2e9f9,.4),black=standard(0x07101e,.1);
const glow=new THREE.MeshBasicMaterial({color:0x6ce8ff});
function mesh(geometry,material,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
const floor=mesh(new THREE.CylinderGeometry(4.7,5,.4,64),standard(0x121b34,.8),scene,0,-.3,0);
const ringMat=new THREE.MeshBasicMaterial({color:0x4395cb,transparent:true,opacity:.65});
for(const r of [2.7,3.8,4.55]){const m=mesh(new THREE.TorusGeometry(r,.018,6,96),ringMat,scene,0,-.065,0);m.rotation.x=Math.PI/2;}
const grid=new THREE.GridHelper(30,28,0x254269,0x121e36);grid.position.y=-.48;scene.add(grid);
for(let i=0;i<12;i++){const angle=i*Math.PI/6;const p=mesh(new THREE.BoxGeometry(.24,3+i%3,.3),standard(0x151c36,.8),scene,Math.sin(angle)*7,1,Math.cos(angle)*7);mesh(new THREE.BoxGeometry(.05,2,.04),glow,p,0,.4,.17);}
const hero=new THREE.Group();scene.add(hero);hero.rotation.y=1.30; // Face the rival on the viewer's right.
const body=new THREE.Group();hero.add(body);
const torso=mesh(new THREE.CylinderGeometry(.56,.38,1.15,6),suit,body,0,2.45,0);torso.scale.z=.68;
mesh(new THREE.SphereGeometry(.56,16,10),armor,body,0,2.75,0).scale.set(1,.56,.65);
const emblem=mesh(new THREE.OctahedronGeometry(.16),glow,body,0,2.72,.39);emblem.scale.y=1.5;
mesh(new THREE.CylinderGeometry(.42,.42,.18,8),gold,body,0,1.93,0).scale.z=.8;
const head=new THREE.Group();head.position.set(0,3.27,0);body.add(head);
mesh(new THREE.SphereGeometry(.36,12,10),skin,head,0,.08,0).scale.set(.88,1.08,.78);
mesh(new THREE.SphereGeometry(.35,12,8),hair,head,0,.36,-.06).scale.set(1,.6,.92);
for(let i=0;i<7;i++){const angle=(i-3)*.25;const spike=mesh(new THREE.ConeGeometry(.17,.65+(i%3)*.12,4),hair,head,Math.sin(angle)*.35,.67,-.08+Math.abs(i-3)*.025);spike.rotation.z=-angle;}
for(const side of [-1,1]){mesh(new THREE.BoxGeometry(.17,.065,.025),black,head,side*.16,.11,.255);mesh(new THREE.BoxGeometry(.055,.065,.035),glow,head,side*.13,.11,.27);const brow=mesh(new THREE.BoxGeometry(.21,.05,.03),hair,head,side*.16,.21,.26);brow.rotation.z=side*.17;}
mesh(new THREE.BoxGeometry(.16,.025,.025),black,head,0,-.13,.26);
function limb(x,y,z,upper,lower,mat,endMat,parent){const joint=new THREE.Group();joint.position.set(x,y,z);parent.add(joint);mesh(new THREE.CylinderGeometry(upper*.85,upper,lower,8),mat,joint,0,-lower/2,0);const bend=new THREE.Group();bend.position.y=-lower;joint.add(bend);mesh(new THREE.CylinderGeometry(upper,upper*.8,lower*.85,8),mat,bend,0,-lower*.4,0);mesh(new THREE.BoxGeometry(upper*2.5,upper*2.2,upper*2.8),endMat,bend,0,-lower*.85,.06);return {joint,bend};}
const left=limb(-.67,2.85,0,.18,.56,suit,armor,body),right=limb(.67,2.85,0,.18,.56,suit,armor,body);
for(const l of [left,right]){mesh(new THREE.SphereGeometry(.27,12,8),armor,l.joint);mesh(new THREE.TorusGeometry(.19,.035,6,16),glow,l.bend,0,-.32,0).rotation.x=Math.PI/2;}
const legL=limb(-.27,1.85,0,.24,.76,suit,boot,hero),legR=limb(.27,1.85,0,.24,.76,suit,boot,hero);legL.joint.rotation.z=-.14;legR.joint.rotation.z=.14;
// Floating armour tails give motion without a downloaded skeleton or animation runtime.
const tails=[];for(const side of [-1,1]){const t=mesh(new THREE.BoxGeometry(.26,.85,.08),armor,body,side*.44,1.58,-.2);t.rotation.z=side*.22;tails.push(t);}
const aura=new THREE.Group();scene.add(aura);const auraMeshes=[];
for(let i=0;i<24;i++){const a=i*Math.PI*2/24,m=mesh(new THREE.ConeGeometry(.13,.9,4,1,true),new THREE.MeshBasicMaterial({color:0x55dfff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}),aura,Math.cos(a)*.85,1.1+(i%5)*.4,Math.sin(a)*.55);auraMeshes.push({m,a,seed:i*.83});}
const auraShader=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{time:{value:0},strength:{value:0},tint:{value:new THREE.Color(0x55ddff)}},vertexShader:`varying vec3 vN;varying vec3 vV;varying vec2 vUV;uniform float time;void main(){vUV=uv;vec3 p=position;p.x+=.07*sin(p.y*8.-time*4.);p.z+=.04*cos(p.y*11.-time*5.);vec4 mv=modelViewMatrix*vec4(p,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying vec3 vN;varying vec3 vV;varying vec2 vUV;uniform float time;uniform float strength;uniform vec3 tint;void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.);float flame=.65+.35*sin(vUV.x*75.+vUV.y*24.-time*8.);float alpha=strength*rim*flame*.55;gl_FragColor=vec4(tint,alpha);}`});
const auraShell=mesh(new THREE.SphereGeometry(1,32,32),auraShader,aura,0,2.05,0);auraShell.scale.set(1.12,2.25,.8);
const auraRing=mesh(new THREE.TorusGeometry(1.3,.05,6,64),new THREE.MeshBasicMaterial({color:0x54ddff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),aura,0,.07,0);auraRing.rotation.x=Math.PI/2;
const auraColors=[0x4dbbff,0x5de7ff,0xffd16c,0xa591ff,0xf2b9ff];
const lightning=new THREE.Group();scene.add(lightning);
for(let i=0;i<5;i++){const points=[];for(let j=0;j<9;j++)points.push(new THREE.Vector3((i%2?1:-1)*(.7+(j%2)*.22),.2+j*.45,(i-2)*.22));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xd3beff,transparent:true,opacity:0,blending:THREE.AdditiveBlending}));lightning.add(line);}
const fx=[];const sphereGeo=new THREE.SphereGeometry(1,14,10),sparkGeo=new THREE.OctahedronGeometry(1),ringGeo=new THREE.TorusGeometry(1,.05,6,40);
function effect(kind,color,power=1,dir=1){const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});let m;
 if(kind==='lightning'){
 const points=[];for(let j=0;j<15;j++)points.push(new THREE.Vector3(j*.28,Math.sin(j*7)*.32*power,Math.cos(j)*.1));
 m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending}));m.position.set(.45,2.6,.6);scene.add(m);mat.dispose();
 }else if(kind==='beam'){m=mesh(new THREE.CylinderGeometry(.2*power,.35*power,5.5,12),mat,scene,dir*(.9+5.5/2),2.6,.4);m.rotation.z=Math.PI/2;}
 else if(kind==='ring'||kind==='nova'){m=mesh(ringGeo,mat,scene,0,2.2,.6);m.scale.setScalar(kind==='nova'?.4:.7);}
 else{m=mesh(kind==='spark'?sparkGeo:sphereGeo,mat,scene,dir*.6,2.55,.7);m.scale.setScalar(kind==='spark'?.07:.16*power);}
 fx.push({m,kind,life:kind==='beam'?.6:kind==='nova'?1.25:.85,total:kind==='beam'?.6:kind==='nova'?1.25:.85,power,dir,vx:kind==='spark'?(.8+Math.random()*5):dir*4,vy:kind==='spark'?(Math.random()-.5)*6:0});
 while(fx.length>80){const f=fx.shift();scene.remove(f.m);f.m.material.dispose();if(f.kind==='beam'||f.kind==='lightning')f.m.geometry.dispose();}
}
let audio,muted=true;function tone(tier){if(muted||!audio)return;try{const o=audio.createOscillator(),g=audio.createGain();o.type=tier>2?'sawtooth':'sine';o.frequency.setValueAtTime(160+tier*95,audio.currentTime);o.frequency.exponentialRampToValueAtTime(40,audio.currentTime+.22);g.gain.setValueAtTime(.12,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.25);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.26);}catch{}}
$('#sound').onclick=()=>{if(!audio)audio=new AudioContext();audio.resume();muted=!muted;$('#sound').textContent=muted?'Sound off':'Sound on';};
$('#fullscreen').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();};
function begin(a,now){attack=a;attackAt=now;shake=a.tier>=2?.055*(a.tier+1):.015;
 const visual=Math.min(3.4,1+Math.log2(Math.max(1,a.combo))*.32);
 a.visual=visual;a.fired=false;const panel=$('#technique');panel.classList.add('show');panel.querySelector('strong').textContent=a.name;panel.querySelector('strong').style.color='#'+new THREE.Color(a.color).getHexString();panel.querySelector('span').textContent=a.kind==='tap'?`${a.by} · TAP TAP`:`${a.by} · ${a.gift} ×${a.combo}`;
 $('#combo').classList.toggle('show',a.combo>1&&a.kind!=='tap');$('#combo').firstChild.textContent='×'+a.combo;tone(a.tier+1);
}
function draw(now){const dt=Math.min(.05,(now-last)/1000);last=now;const t=now/1000;
 if(!attack){const a=engine.next();if(a)begin(a,now);}
 const p=attack?Math.min(1,(now-attackAt)/(attack.duration*1000)):0,hit=attack?Math.sin(Math.PI*p):0;
 hero.position.y=Math.sin(t*2)*.035;hero.position.x=attack?.kind==='dash'?Math.sin(p*Math.PI)*.8:0;
 body.rotation.z=Math.sin(t*1.4)*.018;body.rotation.y=attack?.08+hit*.12:Math.sin(t*.7)*.04;
 left.joint.rotation.z=.32;right.joint.rotation.z=-.32;left.joint.rotation.x=-.15;right.joint.rotation.x=-.2;left.bend.rotation.x=-.75;right.bend.rotation.x=-.9;
 if(attack){right.joint.rotation.x=-.2-hit*1.5;right.joint.rotation.z=-.32-hit*.5;right.bend.rotation.x=-.9+hit*.85;left.joint.rotation.x=-.15-hit*.8;if(attack.kind==='beam'||attack.kind==='nova'){left.joint.rotation.x=-.2-hit*1.4;left.joint.rotation.z=.3-hit*.3;}
 if(p>.36&&!attack.fired){attack.fired=true;const k=attack.kind;effect(k==='tap'?'orb':k,attack.color,attack.visual);effect('ring',attack.color,attack.visual);for(let i=0;i<Math.min(30,5+attack.tier*3+Math.floor(attack.visual*4));i++)effect('spark',attack.color,attack.visual);if(attack.combo>=3){for(let n=0;n<Math.min(5,Math.floor(Math.log2(attack.combo)));n++)effect(attack.kind==='lightning'?'lightning':'orb',attack.color,attack.visual*(.7+n*.08),1);}if(attack.combo>=5){effect('orb',attack.color,attack.visual,1);effect('nova',attack.color,attack.visual);} }
 if(p>=1){attack=null;$('#technique').classList.remove('show');$('#combo').classList.remove('show');}}
 for(let i=0;i<tails.length;i++)tails[i].rotation.x=Math.sin(t*2+i)*.12;
 const au=engine.aura();auraStrength+=(au.strength-auraStrength)*Math.min(1,dt*2.8);level=au.level;
 const color=auraColors[level];auraShader.uniforms.time.value=t;auraShader.uniforms.strength.value=auraStrength;auraShader.uniforms.tint.value.setHex(color);powerLight.color.setHex(color);powerLight.intensity=auraStrength*8;emblem.material.color.setHex(auraStrength>.05?color:0x70d7ef);
 for(const {m,a,seed} of auraMeshes){const wave=(Math.sin(t*4+seed)+1)/2;m.material.color.setHex(color);m.material.opacity=auraStrength*(.015+wave*.035);m.position.y=.4+((t*.8+seed)%3.5);m.position.x=Math.cos(a+t*.12)*(.75+auraStrength*.35);m.position.z=Math.sin(a+t*.12)*.6;m.scale.set(.7+wave*.6,.6+auraStrength*1.6,.7);}
 hair.color.setHex(level>=3?auraColors[level]:0xe2e9f9);for(let i=0;i<lightning.children.length;i++){const bolt=lightning.children[i];bolt.material.opacity=level>=3?((Math.sin(t*17+i*3)>.1)?.75:0):0;bolt.rotation.y=t*.8+i;}
 auraRing.material.opacity=auraStrength*.9;auraRing.material.color.setHex(color);auraRing.scale.setScalar(1+Math.sin(t*4)*.04+auraStrength*.2);
 for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.life-=dt;const q=1-f.life/f.total;f.m.material.opacity=Math.max(0,1-q);if(f.kind==='ring'||f.kind==='nova'){f.m.scale.setScalar(.4+q*f.power*(f.kind==='nova'?2.8:1.1));f.m.rotation.z+=dt;}else if(f.kind==='lightning'){f.m.scale.y=1+Math.sin(q*22)*.4;}else if(f.kind==='beam'){f.m.scale.x=1+Math.sin(q*Math.PI)*f.power*.4;}else{f.m.position.x+=f.vx*dt;f.m.position.y+=f.vy*dt;if(f.kind!=='spark')f.m.scale.multiplyScalar(1+dt*.7);}
 if(f.life<=0){scene.remove(f.m);f.m.material.dispose();if(f.kind==='beam'||f.kind==='lightning')f.m.geometry.dispose();fx.splice(i,1);}}
 shake*=Math.max(0,1-dt*7);camera.position.copy(baseCamera);camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;
 renderer.render(scene,camera);if(now-lastHud>250){hud();lastHud=now;}requestAnimationFrame(draw);
}
function hud(){const pk=engine.pk,fresh=engine.connected&&pk?.scoresVerified&&Date.now()-pk.receivedAt<60000;
 $('#our-score').textContent=fresh?pk.ownScore.toLocaleString():'—';$('#their-score').textContent=fresh?pk.opponentScore.toLocaleString():'—';
 $('#score-meter').style.width=fresh?((pk.ownScore+pk.opponentScore?pk.ownScore/(pk.ownScore+pk.opponentScore):.5)*100)+'%':'50%';
 $('#battle-state').textContent=fresh?(pk.ownScore>pk.opponentScore?'LEADING':pk.ownScore<pk.opponentScore?'COMEBACK':'EVEN'):pk?'SYNCING':'STANDBY';
 $('#score-note').textContent=fresh?'VERIFIED PK SCORE · AURA FOLLOWS THE LEAD':pk?'PK detected · waiting for both scores':'Waiting for verified PK scores';
 const labels=['AWAITING YOUR ENERGY','ENERGY AWAKENING','RADIANT FORCE','SOLAR ASCENT','COSMIC OVERDRIVE'];$('#aura-label').textContent=fresh?(level===0?'RECLAIM THE LEAD':labels[level]):'YOUR SUPPORT. OUR POWER.';$('#aura-label').style.color=fresh?'#'+new THREE.Color(auraColors[level]).getHexString():'#a4b4d6';
 if(pk?.startedAt&&pk.duration){const seconds=Math.max(0,Math.ceil((pk.startedAt+pk.duration*1000-Date.now())/1000));$('#timer').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}else $('#timer').textContent='PK BATTLE';
 const leaders=engine.leaders(),nodes=$('#supporters').children;for(let i=0;i<3;i++)nodes[i].querySelector('span').textContent=leaders[i]?.name||['Your name here','Join the fight','Power our fighter'][i];
 if(engine.notice&&engine.notice.at!==noticeAt){noticeAt=engine.notice.at;$('#notice').textContent=engine.notice.title+' · '+engine.notice.detail;}$('#notice').classList.toggle('show',Date.now()-noticeAt<3200);
}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w/h>.9?33:42;camera.position.z=w/h>.9?11:Math.max(10.8,8.1/(w/h));baseCamera.copy(camera.position);camera.lookAt(0,2.55,0);camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
function status(s,live=false){$('#connection').textContent=s;$('#connection').classList.toggle('live',live);engine.connected=live;}
function connect(){const u=new URL('/ws',location.href);u.protocol=location.protocol==='https:'?'wss:':'ws:';if(instance){u.searchParams.set('instance',instance);u.searchParams.set('after',seq);}
 ws=new WebSocket(u);ws.onopen=()=>{retry=0;status('SERVER CONNECTED');};ws.onmessage=({data})=>{try{const e=JSON.parse(data);
 if(e.type==='hello'){if(e.instance!==instance){instance=e.instance;seq=0;engine.queue=[];engine.combos.clear();engine.pk=null;}status(e.demo?'SERVER DEMO':e.state==='live'?'LIVE CONNECTED':e.state==='connecting'?'CONNECTING TIKTOK':'TIKTOK OFFLINE',e.state==='live'||e.demo);if(!e.replayable)seq=e.seq;return;}
 if(e.type==='status'){status(e.demo?'SERVER DEMO':e.state==='live'?'LIVE CONNECTED':e.state==='connecting'?'CONNECTING TIKTOK':'TIKTOK OFFLINE',e.state==='live'||e.demo);return;}
 if(e.type==='pong'){if(e.status)status(e.status.state==='live'?'LIVE CONNECTED':'TIKTOK '+e.status.state.toUpperCase(),e.status.state==='live'||e.status.demo);return;}
 if(e.snapshot){engine.accept({...e,receivedAt:e.at});return;}
 if(e.seq&&e.seq<=seq)return;if(e.seq)seq=e.seq;if(!e.at||Date.now()-e.at<20000||e.type==='pk')engine.accept(e);
 }catch(err){console.warn('Event rejected:',err.message);}};
 ws.onclose=()=>{status('RECONNECTING');engine.queue=[];setTimeout(connect,Math.min(15000,1000*2**Math.min(retry++,4)));};ws.onerror=()=>ws.close();}
setInterval(()=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'ping'}));},15000);
if(demo){status('DEMO PREVIEW',true);let step=0;setInterval(()=>{step++;const coins=[1,5,20,100,500][Math.floor(step/2)%5];engine.accept({type:step%3===0?'like':'gift',user:'preview',displayName:'Demo supporter',giftName:coins===1?'Rose':'Demo gift',coins,count:1,comboId:'demo-'+Math.floor(step/2),comboTotal:step%2?1:10});engine.accept({type:'pk',battleId:'demo',phase:'update',scoresVerified:true,ownScore:Math.round(500+400*Math.sin(step*.4)),opponentScore:450});},2800);}else connect();
requestAnimationFrame(draw);

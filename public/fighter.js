import * as THREE from '/three.module.js';
import {FighterEngine,comboProfile,AttackRun} from '/fighter-engine.js';
const $=s=>document.querySelector(s), params=new URLSearchParams(location.search), demo=params.get('demo')==='1';
const engine=new FighterEngine();let attack=null,attackAt=0,last=performance.now(),auraStrength=0,level=0,shake=0,ws,retry=0,instance='',seq=0,noticeAt=0,lastHud=0,lastForm=0,lastLead=0,lastResult=0,lastConfetti=0;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
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
for(let i=0;i<12;i++){const angle=i*Math.PI/6;if(Math.cos(angle)>0)continue;const p=mesh(new THREE.BoxGeometry(.24,3+i%3,.3),standard(0x151c36,.8),scene,Math.sin(angle)*7,1,Math.cos(angle)*7);mesh(new THREE.BoxGeometry(.05,2,.04),glow,p,0,.4,.17);}
const hero=new THREE.Group();scene.add(hero);hero.rotation.y=1.08;hero.position.x=-.42;hero.scale.setScalar(1.0); // Face the rival on the viewer's right.
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
const auraColors=[0x4dbbff,0x5de7ff,0x9c9bff,0xffd16c,0xe9b3ff];
const lightning=new THREE.Group();scene.add(lightning);
for(let i=0;i<5;i++){const points=[];for(let j=0;j<9;j++)points.push(new THREE.Vector3((i%2?1:-1)*(.7+(j%2)*.22),.2+j*.45,(i-2)*.22));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xd3beff,transparent:true,opacity:0,blending:THREE.AdditiveBlending}));lightning.add(line);}
// Small shared geometries and a strict FX budget keep the Android source responsive.
const fx=[],sphereGeo=new THREE.SphereGeometry(1,12,8),sparkGeo=new THREE.OctahedronGeometry(1),ringGeo=new THREE.TorusGeometry(1,.045,5,32);
const maxFX=76;let rightEdge=2.4;
const forms=['DORMANT','AWAKENED','RADIANT','SOLAR ASCENT','COSMIC OVERDRIVE'];
const charge=mesh(sphereGeo,new THREE.MeshBasicMaterial({color:0x6ce8ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),scene);
const trails=[];for(let i=0;i<4;i++){const m=mesh(new THREE.BoxGeometry(.55,.025,.025),new THREE.MeshBasicMaterial({color:0x6ce8ff,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),scene);trails.push(m);}
const armorTrim=[];for(const side of [-1,1]){const material=new THREE.MeshBasicMaterial({color:0x6ce8ff,transparent:true,opacity:0});const m=mesh(new THREE.TorusGeometry(.28,.025,6,20),material,side<0?left.joint:right.joint);m.rotation.x=Math.PI/2;armorTrim.push(m);}
function material(color){return new THREE.MeshBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false});}
function removeFX(f){scene.remove(f.m);f.m.traverse(o=>{if(o.material)o.material.dispose();if(o.userData.ownGeometry)o.geometry.dispose();});}
function addFX(m,kind,life,extra={}){scene.add(m);fx.push({m,kind,life,total:life,...extra});while(fx.length>maxFX){const cosmetic=fx.findIndex(f=>!['projectile','beam','bolt'].includes(f.kind));removeFX(fx.splice(cosmetic<0?0:cosmetic,1)[0]);}}
function orb(x,y,color,size=.15){const m=new THREE.Group(),core=new THREE.Mesh(sphereGeo,material(color));core.scale.setScalar(size);m.add(core);const halo=new THREE.Mesh(ringGeo,material(color));halo.scale.setScalar(size*1.5);m.add(halo);m.position.set(x,y,.7);return m;}
function ring(x,y,color,power=1){const m=new THREE.Mesh(ringGeo,material(color));m.position.set(x,y,.7);addFX(m,'ring',.55,{power});}
function sparks(x,y,color,n=8,power=1,celebrate=false){for(let i=0;i<n;i++){const m=new THREE.Mesh(sparkGeo,material(color));m.position.set(x,y,.65+Math.random()*.4);m.scale.setScalar(.025+Math.random()*.035);addFX(m,celebrate?'confetti':'spark',celebrate?1.8:.55,{vx:celebrate?(Math.random()-.5)*2:.5+Math.random()*3,vy:celebrate?1+Math.random()*2:(Math.random()-.5)*3,power});}}
function impact(color,power=1,final=false){document.body.style.setProperty('--attack-color','#'+new THREE.Color(color).getHexString());const panel=$('#impact');panel.classList.remove('hit');void panel.offsetWidth;panel.classList.add('hit');ring(rightEdge,2.65,color,power);sparks(rightEdge-.06,2.65,color,final?14:6,power);if(final){const el=$('#finisher');el.textContent=power>2.5?'OVERDRIVE FINISH':'POWER FINISH';el.classList.remove('show');void el.offsetWidth;el.classList.add('show');}shake=Math.max(shake,reducedMotion?0:final?.055:.015);}
function shoot(a,index=0,final=false){
 const beamLife=final?.35:Math.min(.3,a.run.interval/1000*.7);
 const profile=a.profile,power=profile.power*(final?1.25:1),color=a.color,x=hero.position.x+.54,y=2.65+hero.position.y+(index%2?.12:-.03),end=Math.max(x+.5,rightEdge),length=end-x;
 if(a.kind==='lightning'){
  const points=[];for(let j=0;j<=16;j++)points.push(new THREE.Vector3(x+length*j/16,y+(j===0||j===16?0:Math.sin(j*9+index)*.15*power),.7));
  const m=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:1,blending:THREE.AdditiveBlending}));m.userData.ownGeometry=true;addFX(m,'bolt',.35,{power});impact(color,power,final);
 }else if(a.kind==='beam'){
  const m=new THREE.Mesh(new THREE.BoxGeometry(length,.09*power*(final?1.7:1),.08*power),material(color));m.userData.ownGeometry=true;m.position.set(x+length/2,y,.7);addFX(m,'beam',beamLife,{power});
  const core=new THREE.Mesh(new THREE.BoxGeometry(length,.035*power,.035),material(0xfff4d4));core.userData.ownGeometry=true;core.position.copy(m.position);addFX(core,'beam',beamLife,{power});impact(color,power,final);
 }else{
  const m=orb(x,y,color,(a.kind==='tap'?.085:a.kind==='nova'?.24:.14)*power);
  if(a.kind==='dash'){const tail=new THREE.Mesh(new THREE.ConeGeometry(.09*power,.8*power,5),material(color));tail.rotation.z=-Math.PI/2;tail.position.x=-.3*power;tail.userData.ownGeometry=true;m.add(tail);}
  if(a.kind==='orb'){for(let i=0;i<4;i++){const petal=new THREE.Mesh(sparkGeo,material(color));petal.position.set(0,Math.cos(i*Math.PI/2)*.2*power,Math.sin(i*Math.PI/2)*.2*power);petal.scale.set(.06,.14,.04);m.add(petal);}}
  if(a.kind==='nova'){for(let i=0;i<2;i++){const halo=new THREE.Mesh(ringGeo,material(i?0xffffff:color));halo.scale.setScalar(.33*power);halo.rotation.y=i*Math.PI/2;m.add(halo);}}
  addFX(m,'projectile',.32,{x,end,y,color,power,final});
 }
 ring(x,y,color,power*.5);sparks(x,y,color,a.kind==='tap'?2:5,power);tone(a.tier+1,final);
}
let audio,muted=true;
function tone(tier,final=false){if(muted||!audio)return;try{const o=audio.createOscillator(),g=audio.createGain();o.type=tier>2?'triangle':'sine';o.frequency.setValueAtTime(180+tier*80,audio.currentTime);o.frequency.exponentialRampToValueAtTime(final?38:65,audio.currentTime+.25);g.gain.setValueAtTime(final?.12:.07,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.3);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.32);}catch{}}
$('#sound').onclick=()=>{if(!audio)audio=new AudioContext();audio.resume();muted=!muted;$('#sound').textContent=muted?'Sound off':'Sound on';};
$('#fullscreen').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();};
function pulseForm(message,color){const el=$('#transformation');el.textContent=message;el.style.color='#'+new THREE.Color(color).getHexString();el.classList.remove('show');void el.offsetWidth;el.classList.add('show');ring(hero.position.x,2.3,color,1.5);}
function showDonor(a){const el=$('#donor');el.classList.toggle('show',a.kind!=='tap');el.querySelector('b').textContent=a.by;el.querySelector('span').textContent=`${a.gift||'GIFT'} ×${a.combo}`;el.style.setProperty('--attack-color','#'+new THREE.Color(a.color).getHexString());}
function begin(a,now){
 attack=a;attackAt=now;a.profile=comboProfile(a.kind==='tap'?1:a.combo);a.run=new AttackRun(a,now);a.shots=a.run.emitted;
 // The last strike is enhanced within the gift count, never added as a bonus shot.
 const panel=$('#technique');panel.classList.add('show');panel.querySelector('strong').textContent=a.name;panel.querySelector('strong').style.color='#'+new THREE.Color(a.color).getHexString();panel.querySelector('span').textContent=a.kind==='tap'?`${a.by} · TAP TAP`:`${a.by} · ${a.gift} ×${a.combo}`;panel.querySelector('em').textContent=a.kind==='tap'?'EVERY TAP COUNTS':a.profile.label;
 $('#combo').classList.toggle('show',a.combo>1&&a.kind!=='tap');$('#combo').dataset.stage=a.profile.stage;$('#combo b').textContent='×'+a.combo;showDonor(a);
}
function showResult(result){
 lastResult=result.at;attack=null;charge.material.opacity=0;$('#technique').classList.remove('show');$('#combo').classList.remove('show');$('#donor').classList.remove('show');
 const panel=$('#result');panel.classList.add('show');panel.dataset.outcome=result.outcome;
 panel.querySelector('h1').textContent={win:'VICTORY',loss:'WE RISE AGAIN',draw:'HONOURS EVEN',unknown:'BATTLE COMPLETE'}[result.outcome];
 panel.querySelector('h1').style.color=result.outcome==='win'?'#ffe1a0':'#b9d8ff';$('#result-score').textContent=result.ownScore===null?'Final score not received':`${result.ownScore.toLocaleString()} — ${result.opponentScore.toLocaleString()}`;
 const podium=$('#podium');podium.replaceChildren();for(let i=0;i<3;i++){const p=result.leaders[i],card=document.createElement('div'),label=document.createElement('small'),name=document.createElement('b'),detail=document.createElement('span');label.textContent=i===0?'01 · TEAM MVP':`0${i+1} · TOP ALLY`;name.textContent=p?.name||'TEAM SUPPORT';detail.textContent=p?(p.coins?`${p.coins.toLocaleString()} gift coins`:'TAP POWER'):'THANK YOU';card.append(label,name,detail);podium.append(card);}
}
function draw(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;const t=now/1000,result=engine.activeResult(),victory=result?.outcome==='win';
 if(result&&result.at!==lastResult)showResult(result);if(!result)$('#result').classList.remove('show');
 if(!attack&&!result){const a=engine.next();if(a)begin(a,now);}
 if(attack?.comboId){const c=engine.combos.get(attack.comboId);if(c&&c.total>attack.combo){attack.combo=c.total;attack.profile=comboProfile(c.total);attack.run.extend(c.total,now);$('#combo b').textContent='×'+c.total;$('#combo').dataset.stage=attack.profile.stage;$('#combo').classList.add('show');$('#technique span').textContent=`${attack.by} · ${attack.gift} ×${c.total}`;$('#technique em').textContent=attack.profile.label;showDonor(attack);}}
 const p=attack?attack.run.phase(now):0,hit=attack?Math.sin(Math.PI*p):0;
 const au=engine.aura();auraStrength+=(au.strength-auraStrength)*Math.min(1,dt*2.8);level=au.level;
 const levitation=level>=3?.12+(level-3)*.09:0;
 hero.position.set(-.42+(attack?.kind==='dash'?Math.sin(p*Math.PI)*.42:0),Math.sin(t*2)*.025+levitation,0);
 hero.rotation.y=1.08+(victory?Math.sin(t*2)*.15:0);body.rotation.z=Math.sin(t*1.4)*.018;body.rotation.y=attack?.08+hit*.12:Math.sin(t*.7)*.04;
 left.joint.rotation.set(-.2,0,.32);right.joint.rotation.set(-.22,0,-.32);left.bend.rotation.x=-.85;right.bend.rotation.x=-.95;
 legL.joint.rotation.x=Math.sin(t*1.4)*.025;legR.joint.rotation.x=-Math.sin(t*1.4)*.025;
 if(level>=2){left.bend.rotation.x-=.12;right.bend.rotation.x-=.12;}
 charge.material.opacity=0;
 if(attack){
  const k=attack.kind,wind=Math.sin(Math.min(1,p/.3)*Math.PI/2),strike=Math.max(0,Math.sin((p-.2)*Math.PI));
  if(k==='tap'||k==='orb'){right.joint.rotation.x-=strike*1.7;right.bend.rotation.x+=strike*.9;left.joint.rotation.x-=wind*.25;}
  if(k==='dash'){hero.position.y+=hit*.08;body.rotation.z=-hit*.16;right.joint.rotation.x-=hit*1.8;right.bend.rotation.x+=hit*.9;left.joint.rotation.x+=hit*.6;legL.joint.rotation.x=-hit*.55;legR.joint.rotation.x=hit*.35;}
  if(k==='lightning'){right.joint.rotation.x=-.3-wind*2.1;right.bend.rotation.x=-.6+hit*.5;left.joint.rotation.x=-.4-hit;}
  if(k==='beam'||k==='nova'){left.joint.rotation.x=-.3-strike*1.5;right.joint.rotation.x=-.3-strike*1.5;left.joint.rotation.z=.18;right.joint.rotation.z=-.18;left.bend.rotation.x=-.7+strike*.6;right.bend.rotation.x=-.7+strike*.6;body.rotation.x=-hit*.06;if(k==='nova')hero.position.y+=hit*.22;}
  else body.rotation.x=0;
  if(k!=='tap'&&p<.32){charge.position.set(hero.position.x+.55,2.65+hero.position.y,.7);charge.material.color.setHex(attack.color);charge.material.opacity=wind*.7;charge.scale.setScalar(.06+wind*.19*attack.profile.power);}
  for(const shot of attack.run.due(now))shoot(attack,shot.index,shot.final);
  attack.shots=attack.run.emitted;engine.recordShots(attack,attack.shots);
  $('#combo small').textContent=`${attack.shots} / ${attack.run.target} HITS`;
  if(attack.kind!=='tap')$('#technique em').textContent=`${attack.profile.label} · ${attack.shots} / ${attack.run.target} HITS`;
  if(attack.run.done(now)){engine.complete();attack=null;$('#technique').classList.remove('show');$('#combo').classList.remove('show');}
 }else body.rotation.x=0;
 if(victory){hero.position.y+=Math.abs(Math.sin(t*3))*.12;right.joint.rotation.x=-2.8;right.bend.rotation.x=-.2;left.joint.rotation.x=-1.7;if(now-lastConfetti>220){lastConfetti=now;sparks((Math.random()-.5)*2,2.2,Math.random()>.5?0xffd989:0x83eaff,5,1,true);}}
 for(let i=0;i<tails.length;i++)tails[i].rotation.x=Math.sin(t*2+i)*(.1+level*.035);
 const color=auraColors[level];aura.position.x=hero.position.x;aura.position.y=hero.position.y;lightning.position.copy(aura.position);
 auraShader.uniforms.time.value=t;auraShader.uniforms.strength.value=auraStrength;auraShader.uniforms.tint.value.setHex(color);powerLight.position.x=hero.position.x;powerLight.color.setHex(color);powerLight.intensity=auraStrength*7;emblem.material.color.setHex(auraStrength>.05?color:0x70d7ef);
 armor.emissive.setHex(color);armor.emissiveIntensity=auraStrength*.25;suit.emissive.setHex(color);suit.emissiveIntensity=auraStrength*.07;
 for(const m of armorTrim){m.material.color.setHex(color);m.material.opacity=level>=2?auraStrength*.85:0;}
 for(const {m,a,seed}of auraMeshes){const wave=(Math.sin(t*4+seed)+1)/2;m.material.color.setHex(color);m.material.opacity=auraStrength*(.02+wave*.05);m.position.set(Math.cos(a+t*.12)*(.75+auraStrength*.35),.4+((t*.8+seed)%3.5),Math.sin(a+t*.12)*.6);m.scale.set(.7+wave*.6,.6+auraStrength*1.6,.7);}
 hair.color.setHex(level>=3?color:0xe2e9f9);for(let i=0;i<lightning.children.length;i++){const bolt=lightning.children[i];bolt.material.color.setHex(color);bolt.material.opacity=level>=3&&Math.sin(t*(reducedMotion?2:12)+i*3)>.15?.6:0;bolt.rotation.y=t*.5+i;}
 auraRing.material.opacity=auraStrength*.8;auraRing.material.color.setHex(color);auraRing.scale.setScalar(1+Math.sin(t*4)*.025+auraStrength*.15);
 for(let i=0;i<trails.length;i++){const m=trails[i];m.material.opacity=attack?.kind==='dash'?hit*.65:0;m.position.set(hero.position.x-.25-i*.12,1.8+i*.28,.5);}
 if(level!==lastForm){if(level>lastForm)pulseForm(forms[level]+' · TRANSFORMATION',color);else if(lastForm>0)pulseForm(level===0?'AURA FADING · RISE AGAIN':'AURA SHIFT · '+forms[level],color);document.body.dataset.form=level;lastForm=level;}
 if(au.lead>0&&lastLead<0)pulseForm('COMEBACK · THE LEAD IS OURS',color);lastLead=au.lead;
 const pendingImpacts=[];
 for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.life-=dt;const q=Math.max(0,Math.min(1,1-f.life/f.total));f.m.traverse(o=>{if(o.material)o.material.opacity=f.kind==='projectile'?1:Math.max(0,1-q);});
  if(f.kind==='projectile'){f.m.position.x=f.x+(f.end-f.x)*q;f.m.rotation.x+=dt*4;f.m.rotation.z+=dt*3;}
  else if(f.kind==='ring'){f.m.scale.setScalar(.05+q*f.power*.65);f.m.rotation.z+=dt;}
  else if(f.kind==='spark'||f.kind==='confetti'){f.m.position.x+=f.vx*dt;f.m.position.y+=f.vy*dt;if(f.kind==='confetti'){f.vy-=dt*3;f.m.rotation.z+=dt*3;}}
  else if(f.kind==='beam')f.m.scale.y=1+Math.sin(q*Math.PI)*.4;
  if(f.life<=0){if(f.kind==='projectile')pendingImpacts.push(f);removeFX(f);fx.splice(i,1);}
 }
 for(const f of pendingImpacts)impact(f.color,f.power,f.final);
 // Gift attribution survives the motion briefly, but never overwrites an attack in progress.
 if(!attack&&engine.spotlight&&Date.now()-engine.spotlight.at>4500)$('#donor').classList.remove('show');
 shake*=Math.max(0,1-dt*9);camera.position.copy(baseCamera);camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;
 renderer.render(scene,camera);if(now-lastHud>200){hud();lastHud=now;}requestAnimationFrame(draw);
}
function hud(){
 const pk=engine.pk,fresh=engine.connected&&pk?.scoresVerified&&Date.now()-pk.receivedAt<60000;
 $('#our-score').textContent=fresh?pk.ownScore.toLocaleString():'—';$('#their-score').textContent=fresh?pk.opponentScore.toLocaleString():'—';$('#score-meter').style.width=fresh?((pk.ownScore+pk.opponentScore?pk.ownScore/(pk.ownScore+pk.opponentScore):.5)*100)+'%':'50%';
 $('#battle-state').textContent=fresh?(pk.ownScore>pk.opponentScore?'LEADING':pk.ownScore<pk.opponentScore?'COMEBACK':'EVEN'):pk?'SYNCING':'STANDBY';
 $('#score-note').textContent=fresh?(demo?'SIMULATED PK SCORES · PREVIEW':'OFFICIAL PK SCORE · AURA FOLLOWS THE LEAD'):pk?'PK detected · waiting for both scores':'Waiting for verified PK scores';
 $('#aura-label b').textContent=fresh?(level===0?'RECLAIM THE LEAD':forms[level]):'YOUR SUPPORT. OUR POWER.';$('#aura-label').style.color=fresh?'#'+new THREE.Color(auraColors[level]).getHexString():'#b1c5e4';$('#form-line').textContent=fresh?'FORM '+level+' / 4':'TAP TO STRIKE · GIFTS UNLEASH SIGNATURES';
 if(pk?.startedAt&&pk.duration){const seconds=Math.max(0,Math.ceil((pk.startedAt+pk.duration*1000-Date.now())/1000));$('#timer').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}else $('#timer').textContent='PK BATTLE';
 const leaders=engine.leaders(),nodes=$('#supporters').children;for(let i=0;i<3;i++)nodes[i].querySelector('span').textContent=leaders[i]?.name||['Your name here','Join the fight','Power our fighter'][i];
 if(engine.notice&&engine.notice.at!==noticeAt){noticeAt=engine.notice.at;$('#notice').textContent=engine.notice.title+' · '+engine.notice.detail;}$('#notice').classList.toggle('show',!attack&&!$('#donor').classList.contains('show')&&Date.now()-noticeAt<2600);
}
function resize(){
 const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;const square=w/h>=.8&&w/h<=1.2;camera.fov=w/h>1.2?38:42;camera.position.set(0,square?3.8:3.0,square?15.5:w/h>1.2?10.2:10.6);camera.lookAt(0,square?3.55:2.55,0);camera.updateProjectionMatrix();baseCamera.copy(camera.position);
 const point=new THREE.Vector3(.98,0,.5).unproject(camera),direction=point.sub(camera.position).normalize();rightEdge=camera.position.x+direction.x*(.7-camera.position.z)/direction.z;
}
addEventListener('resize',resize);resize();
function status(s,live=false){$('#connection').textContent=s;$('#connection').classList.toggle('live',live);engine.connected=live;}
function connect(){const u=new URL('/ws',location.href);u.protocol=location.protocol==='https:'?'wss:':'ws:';if(instance){u.searchParams.set('instance',instance);u.searchParams.set('after',seq);}
 ws=new WebSocket(u);ws.onopen=()=>{retry=0;status('SERVER CONNECTED');};ws.onmessage=({data})=>{try{const e=JSON.parse(data);
 if(e.type==='hello'){if(e.instance!==instance){instance=e.instance;seq=0;engine.queue=[];engine.deferredGifts=[];engine.combos.clear();engine.pk=null;engine.result=null;engine.battleSupporters.clear();engine.closedBattles.clear();}status(e.demo?'SERVER DEMO':e.state==='live'?'LIVE CONNECTED':e.state==='connecting'?'CONNECTING TIKTOK':'TIKTOK OFFLINE',e.state==='live'||e.demo);if(!e.replayable)seq=e.seq;return;}
 if(e.type==='status'){status(e.demo?'SERVER DEMO':e.state==='live'?'LIVE CONNECTED':e.state==='connecting'?'CONNECTING TIKTOK':'TIKTOK OFFLINE',e.state==='live'||e.demo);return;}
 if(e.type==='pong'){if(e.status)status(e.status.state==='live'?'LIVE CONNECTED':'TIKTOK '+e.status.state.toUpperCase(),e.status.state==='live'||e.status.demo);return;}
 if(e.snapshot){engine.accept(e);return;}if(e.seq&&e.seq<=seq)return;if(e.seq)seq=e.seq;if(!e.at||Date.now()-e.at<20000||e.type==='pk')engine.accept(e);
 }catch(err){console.warn('Event rejected:',err.message);}};
 ws.onclose=()=>{status('RECONNECTING');engine.queue=engine.queue.filter(a=>a.kind!=='tap');setTimeout(connect,Math.min(15000,1000*2**Math.min(retry++,4)));};ws.onerror=()=>ws.close();}
setInterval(()=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'ping'}));},15000);
if(demo){
 status('DEMO PREVIEW',true);let step=0,cycle=0;
 // Preview stays entirely local. It neither joins TikTok nor sends viewer events to the server.
 window.fighterDemo={engine,hero,camera,renderer,fx,get attack(){return attack;},get rightEdge(){return rightEdge;}};
 if(params.get('manual')!=='1')setInterval(()=>{
  step++;const phase=step%14,id='demo-'+cycle;
  if(phase===1)engine.accept({type:'pk',battleId:id,phase:'start',scoresVerified:true,ownScore:450,opponentScore:500});
  if(phase>0&&phase<12){const coins=[1,5,20,100,500][Math.floor((phase-1)/2)%5];engine.accept({type:phase===2?'like':'gift',user:'preview-'+phase%3,displayName:['MARIA','NIKOS','ELENA'][phase%3],giftName:coins===1?'Rose':'Demo gift',coins,count:1,comboId:id+'-'+phase,comboTotal:phase%2?1:20});engine.accept({type:'pk',battleId:id,phase:'update',scoresVerified:true,ownScore:phase<5?450:phase<9?700:1400,opponentScore:500});}
  if(phase===12)engine.accept({type:'pk',battleId:id,phase:'end',scoresVerified:true,ownScore:1400,opponentScore:500});
  if(phase===0)cycle++;
 },3000);
}else connect();
requestAnimationFrame(draw);

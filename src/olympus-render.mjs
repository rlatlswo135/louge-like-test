import { getStats } from './game.mjs';
import { AERGIA_RULES, AERGIA_DEBRIS_ANGLES } from './aergia.mjs';
import { getHazardProgress } from './systems/geometry.mjs';

const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const paths={floor:'aergia-temple-v2.png',boss:'aergia-atlas-v4.png',hero:'olympus-warrior-v1.png',debris:'temple-shard-v1.png'};

export async function loadOlympusArt(win) {
  const entries=await Promise.all(Object.entries(paths).map(async([key,name])=>{
    const image=new win.Image();image.src=new URL(`../assets/art/${name}`,import.meta.url).href;
    await image.decode();
    if(key==='floor'||key==='debris')return [key,{image}];
    const canvas=win.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const data=ctx.getImageData(0,0,image.width,image.height).data,frames=[];
    for(let i=0;i<16;i++){
      const x0=Math.round(i%4*image.width/4),x1=Math.round((i%4+1)*image.width/4);
      // The raised bundle crosses the generated atlas's nominal row gutter.
      // Hand-checked boundaries keep its top and remove it from the crouch pose.
      const top=key==='hero'&&i===14?900/1280:key==='boss'&&i===12?940/1280:Math.floor(i/4)/4;
      const bottom=key==='hero'&&i===10?900/1280:key==='boss'&&i===8?940/1280:(Math.floor(i/4)+1)/4;
      const y0=Math.round(top*image.height),y1=Math.round(bottom*image.height);
      let l=x1,r=x0,t=y1,b=y0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*image.width+x)*4+3]>40){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
      frames.push({x:l,y:t,w:r-l+1,h:b-t+1,pivot:(x0+x1)/2});
    }
    return [key,{image,frames,unit:(key==='hero'?88:152)/frames[key==='hero'?0:3].h}];
  }));
  return Object.fromEntries(entries);
}

export function cameraFor(run,reduced=false) {
  const o=run.olympus;
  if(reduced)return {x:640,y:360,zoom:1};
  if(o.phase==='intro'){
    const out=smooth((o.phaseTime-4.5)/2.1);
    return {x:640,y:245+115*out,zoom:1.55-.55*out};
  }
  if(o.phase==='smash')return {x:640,y:360,zoom:1+.055*Math.sin(clamp(o.phaseTime/.55)*Math.PI)};
  return {x:640,y:360,zoom:1};
}
export function screenToOlympus(view,x,y) {
  return {x:((x-view.left)/view.scale-640-view.shakeX)/view.camera.zoom+view.camera.x,
    y:((y-view.top)/view.scale-360-view.shakeY)/view.camera.zoom+view.camera.y};
}
export function worldToOlympus(view,x,y) {
  return {x:view.left+(640+view.shakeX+(x-view.camera.x)*view.camera.zoom)*view.scale,
    y:view.top+(360+view.shakeY+(y-view.camera.y)*view.camera.zoom)*view.scale};
}
export function createOlympusView(canvas,art) {
  return {canvas,g:canvas.getContext('2d'),art,width:0,height:0,ratio:1,scale:1,left:0,top:0,
    camera:{x:640,y:360,zoom:1},shakeX:0,shakeY:0,reduced:false};
}
export function resizeOlympus(view,width,height,ratio=1) {
  view.width=width;view.height=height;view.ratio=Math.min(2,ratio);
  view.canvas.width=Math.round(width*view.ratio);view.canvas.height=Math.round(height*view.ratio);
  view.scale=Math.min(width/1280,height/720);
  view.left=(width-1280*view.scale)/2;view.top=(height-720*view.scale)/2;
}
function ellipse(g,x,y,rx,ry,color){g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fillStyle=color;g.fill();}
function stroke(g,points,color,width=1){g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=width;g.stroke();}
function sprite(g,atlas,index,x,y,flip=false,scaleY=1,alpha=1,rotation=0) {
  const f=atlas.frames[index],u=atlas.unit;
  g.save();g.translate(x,y);g.rotate(rotation);g.scale(flip?-1:1,scaleY);g.globalAlpha*=alpha;
  g.drawImage(atlas.image,f.x,f.y,f.w,f.h,(f.x-f.pivot)*u,-f.h*u,f.w*u,f.h*u);
  g.restore();
}
export function aergiaPose(run) {
  const o=run.olympus;
  if(run.status==='won')return 15;
  if(o.phase==='intro')return o.phaseTime<1.9?0:o.phaseTime<3.25?1:o.phaseTime<4.9?2:Math.floor(o.phaseTime*5)%2+4;
  if(o.phase==='sleep'||o.phase==='smash')return 14;
  if(o.phase==='wipe')return o.phaseTime<AERGIA_RULES.wipeWindup*.8?12:13;
  if(o.phase==='stunned')return 15;
  if(o.phase==='rebuke')return o.phaseTime<AERGIA_RULES.pushDuration?11:o.phaseTime<AERGIA_RULES.rebukeWindup-1e-9?12:13;
  if(o.phase==='centering')return Math.floor(o.phaseTime*5)%2+4;
  if(o.grab)return 11;
  const a=o.action;
  if(!a)return o.nextAttack>.15&&Math.hypot(run.player.x-run.boss.x,run.player.y-run.boss.y)>160?4+Math.floor(o.walkTime*5)%2:3;
  const fired=o.actionTime>=a.windup-1e-9;
  return {sweep:fired?7:6,punish:fired?7:6,charge:fired?5:6,debris:fired?9:8,chains:fired?11:10,cross:fired?13:12,slam:fired?13:12}[a.kind];
}
export function warriorPose(run) {
  const p=run.player,o=run.olympus;
  if(o.phase==='smash')return o.phaseTime<.35?14:15;
  if(o.carrying)return 14;
  if(p.hurtFlash>.12||run.status==='dead'||o.phase==='rebuke'&&o.controlsLocked)return 12;
  if(p.dodgeTime>0)return p.dodgeTime>.2?8:p.dodgeTime>.07?9:10;
  if(p.swing){const t=p.swing.t/.22;return t<.18?4:p.swing.shape==='line'?7:5+(p.swing.beat||0)%2;}
  return p.moving?1+Math.floor(run.time*9)%3:0;
}
function warning(g,h,time) {
  if(h.t<0)return;
  const progress=getHazardProgress(h),active=h.phase==='active';
  if(h.shape==='field'){
    const fade=active?clamp(1-(h.t-h.windup)/h.active):1;
    g.save();g.beginPath();g.rect(0,0,1280,720);
    for(const s of h.safe){g.moveTo(s.x+s.radius,s.y);g.arc(s.x,s.y,s.radius,0,TAU);}
    g.fillStyle=`rgba(164,42,29,${active?.5*fade:.08+progress*.22})`;g.fill('evenodd');g.clip('evenodd');
    if(active){
      g.globalAlpha=fade;g.shadowColor='#eab284';g.shadowBlur=10;
      for(let i=0;i<18;i++){
        const a=i*TAU/18,dx=Math.cos(a),dy=Math.sin(a),points=[];
        for(let d=0;d<1500;d+=40)points.push([h.x+dx*d-dy*Math.sin(d+i)*12,h.y+dy*d+dx*Math.sin(d+i)*12]);
        stroke(g,points,'#f5c5a1',5);stroke(g,points,'#44332f',2);
      }
    }
    g.restore();g.save();
    for(const s of h.safe){
      g.beginPath();g.arc(s.x,s.y,s.radius,0,TAU);g.strokeStyle='#c1cdb0';g.lineWidth=3;g.stroke();
      if(!active){g.beginPath();g.arc(s.x,s.y,s.radius,-Math.PI/2,-Math.PI/2+TAU*progress);g.strokeStyle='#fff0cb';g.lineWidth=5;g.stroke();}
    }
    g.restore();return;
  }
  g.save();g.translate(h.x,h.y);g.lineJoin='round';
  if(h.shape==='lane')g.rotate(h.angle);
  g.beginPath();
  if(h.shape==='sector'){g.moveTo(0,0);g.arc(0,0,h.radius,h.angle-h.halfAngle,h.angle+h.halfAngle);g.closePath();}
  else if(h.shape==='lane')g.rect(0,-h.width/2,h.length,h.width);
  else g.arc(0,0,h.radius,0,TAU);
  if(!active){
    g.fillStyle=`rgba(140,44,27,${.06+progress*.14})`;g.fill();
    g.strokeStyle=`rgba(245,163,104,${.35+progress*.6})`;g.lineWidth=2;g.stroke();
    // A thin advancing edge communicates timing without an opaque debug overlay.
    g.beginPath();
    if(h.shape==='lane'){g.moveTo(h.length*progress,-h.width/2);g.lineTo(h.length*progress,h.width/2);}
    else if(h.shape==='sector')g.arc(0,0,h.radius*progress,h.angle-h.halfAngle,h.angle+h.halfAngle);
    else g.arc(0,0,h.radius*progress,0,TAU);
    g.strokeStyle='#ffe1ac';g.lineWidth=2;g.stroke();
  }else if(!h.charge){
    g.clip();const fade=clamp(1-(h.t-h.windup)/h.active);
    g.globalAlpha=fade;g.strokeStyle='#ffdf9e';g.shadowColor='#e77c39';g.shadowBlur=12;g.lineWidth=5;
    if(h.shape==='sector'){g.beginPath();g.arc(0,0,h.radius*.87,h.angle-h.halfAngle,h.angle+h.halfAngle);g.stroke();}
    else if(h.shape==='lane'){
      const pts=[];for(let i=0;i<h.length;i+=22)pts.push([i,Math.sin(i*.49+time)*13]);stroke(g,pts,'#ffdc96',5);
      stroke(g,pts,'#6a3727',2);
    }else {g.beginPath();g.arc(0,0,h.radius*.85,0,TAU);g.stroke();}
  }
  g.restore();
}
function chainLinks(g,end){
  for(let x=8,i=0;x<end;x+=12,i++){
    const h=i%2?2:5;
    g.beginPath();g.roundRect(x-8,-h,16,h*2,h);
    g.strokeStyle='#10151b';g.lineWidth=5;g.stroke();g.strokeStyle='#89949e';g.lineWidth=2.5;g.stroke();
    stroke(g,[[x-4,-h],[x+3,-h]],'#d2d9de',1);
  }
  if(end>0){g.beginPath();g.moveTo(end-9,-6);g.lineTo(end+8,0);g.lineTo(end-9,6);g.closePath();g.fillStyle='#717d89';g.fill();g.strokeStyle='#161c23';g.lineWidth=2;g.stroke();}
}
function chains(g,run) {
  const o=run.olympus,b=run.boss,a=o.action;
  if(o.grab){
    const dx=run.player.x-b.x,dy=run.player.y-b.y+5;
    g.save();g.translate(b.x,b.y-35);g.rotate(Math.atan2(dy,dx));chainLinks(g,Math.hypot(dx,dy));g.restore();return;
  }
  if(a?.kind!=='chains')return;
  const t=o.actionTime,live=t>=a.windup;
  const extend=clamp((t-a.windup)/a.active),retract=1-clamp((t-a.windup-a.active)/a.active);
  g.save();g.translate(b.x,b.y);
  for(let i=0;i<8;i++){
    const angle=o.angle+i*TAU/8,length=o.chainLengths[i];g.save();g.rotate(angle);
    if(!live){
      g.setLineDash([5,13]);stroke(g,[[40,0],[length,0]],'#eed3a866',1.5);g.setLineDash([]);
      ellipse(g,48,0,4+3*clamp(t/a.windup),4,'#ffd291');
    }else{
      chainLinks(g,length*extend*retract);
    }
    g.restore();
  }g.restore();
}
function debrisAim(g,run){
  const o=run.olympus,a=o.action;if(a?.kind!=='debris'||o.actionTime>=a.windup)return;
  const progress=clamp(o.actionTime/a.windup),b=run.boss;
  g.save();g.translate(b.x,b.y);g.globalAlpha=.4+progress*.55;
  const gradient=g.createLinearGradient(30,0,720,0);gradient.addColorStop(0,'#e1c3a1');gradient.addColorStop(1,'#b6927100');
  for(const offset of AERGIA_DEBRIS_ANGLES[(a.index??0)%2]){
    g.save();g.rotate(o.angle+offset);g.setLineDash([8,10]);stroke(g,[[40,0],[720,0]],gradient,2);g.setLineDash([]);
    stroke(g,[[95,-7],[108,0],[95,7]],'#e1c3a1',2);g.restore();
  }
  g.restore();
}
function sleepTimer(g,run){
  const o=run.olympus,b=run.boss;if(o.phase!=='sleep'&&o.phase!=='wipe')return;
  const wipe=o.phase==='wipe',left=Math.max(0,o.collectDuration-o.phaseTime),width=184,x=b.x-width/2,y=b.y-118;
  const color=wipe||left<=5?'#d97059':o.carrying?'#bdc79b':'#cdb780';
  g.save();g.textAlign='center';g.font='600 12px system-ui';g.fillStyle='#151718ee';g.fillRect(x-10,y-32,width+20,49);
  g.fillStyle=color;g.fillText(wipe?'파편 수집 실패 · 전멸 공격':o.carrying?'수집 완료 · 내려찍기':`수집 제한  ${left.toFixed(1)}초`,b.x,y-12);
  g.fillStyle='#39372f';g.fillRect(x,y,width,5);g.fillStyle=color;g.fillRect(x,y,width*(wipe?clamp(o.phaseTime/AERGIA_RULES.wipeWindup):o.carrying?1:left/o.collectDuration),5);g.restore();
}
function wipeEffect(g,run){
  const o=run.olympus;if(o.phase!=='wipe')return;
  const t=clamp(o.phaseTime/AERGIA_RULES.wipeWindup),b=run.boss;
  g.save();g.fillStyle=`rgba(138,38,29,${t*.3})`;g.fillRect(0,0,1280,720);
  for(let i=0;i<3;i++){g.beginPath();g.arc(b.x,b.y,30+t*(650+i*150),0,TAU);g.strokeStyle=`rgba(240,107,70,${.2+t*.5})`;g.lineWidth=4+i*3;g.stroke();}g.restore();
}
function rock(g,x,y,size=1,glow=false,angle=0,atlas=null) {
  g.save();g.translate(x,y);g.rotate(angle);g.scale(size,size);
  if(glow){g.shadowColor='#ffdc84';g.shadowBlur=18;}
  if(atlas){
    const u=atlas.image.width/1280;
    // Reuse painted marble from the carried bundle to match the temple materials.
    g.drawImage(atlas.image,716*u,918*u,93*u,87*u,-21,-28,43,40);
    g.restore();return;
  }
  g.beginPath();[[-18,1],[-12,-19],[6,-24],[22,-9],[16,7],[-3,11]].forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();
  g.fillStyle='#cfbd9d';g.fill();g.strokeStyle='#594a3e';g.lineWidth=2;g.stroke();g.shadowBlur=0;
  stroke(g,[[-12,-19],[0,-4],[22,-9]],'#f9e7c7',3);stroke(g,[[0,-4],[-3,11]],'#998a72',2);
  g.restore();
}
function fragments(g,run,art) {
  const o=run.olympus;
  if(!['sleep','smash'].includes(o.phase))return;
  for(const f of o.fragments){
    if(f.collected)continue;
    const t=o.phaseTime-f.delay;if(t<0)continue;
    ellipse(g,f.x,f.y,26,12,'#30261c55');
    const fall=clamp(t/f.fall);
    if(!f.landed)rock(g,f.x,f.y-(1-fall*fall)*250,1.3,false,(1-fall)*.8,art.hero);
    else{
      const glow=.65+.2*Math.sin(run.time*3+f.id);g.save();g.globalAlpha=glow;
      ellipse(g,f.x,f.y,30,15,'#ffe4a330');g.restore();rock(g,f.x,f.y,1,true,0,art.hero);
      g.font='600 10px system-ui';g.textAlign='center';g.fillStyle='#fff1cb';g.fillText('신전 파편',f.x,f.y+28);
    }
  }
}
function swordTrail(g,run,stats) {
  const p=run.player,s=p.swing;if(!s||run.olympus.carrying)return;
  const t=clamp(s.t/.22),range=s.reach||stats.reach;
  g.save();g.translate(p.x,p.y);g.rotate(s.angle);g.globalAlpha=Math.sin(t*Math.PI);g.lineCap='round';
  g.shadowColor='#f6ddad';g.shadowBlur=12;
  if(s.shape==='line'){
    const tip=range*clamp(t*2);stroke(g,[[Math.max(20,tip-60),0],[tip,0]],'#fff3d4',4);
  }else{
    const angle=-1.05+t*2.1;
    for(let i=0;i<3;i++){g.beginPath();g.arc(0,0,range-i*7,angle-.72,angle);g.strokeStyle=i?'#e3c08266':'#fff3d4';g.lineWidth=i?3:5;g.stroke();}
  }
  g.restore();
}
function dialogue(g,run) {
  const o=run.olympus;
  let line=o.dialogueUntil>run.time?o.dialogue:'';
  if(o.phase==='intro')line=o.phaseTime<1.8?'…':o.phaseTime<3.25?'또 기도야?':o.phaseTime<5?'하아… 귀찮게.':'';
  if(!line)return;
  const b=run.boss,y=Math.max(86,b.y-180);
  g.save();g.font='600 16px system-ui';g.textAlign='center';const w=g.measureText(line).width+34;
  g.fillStyle='#191710e8';g.strokeStyle='#bc976478';g.lineWidth=1;g.beginPath();g.roundRect(b.x-w/2,y-23,w,37,6);g.fill();g.stroke();
  g.fillStyle='#f6e7cc';g.fillText(line,b.x,y+2);g.restore();
}
export function renderOlympus(view,run) {
  const g=view.g,{width:w,height:h,ratio}=view,o=run.olympus,p=run.player,b=run.boss,t=run.time,stats=getStats(run);
  view.camera=cameraFor(run,view.reduced);
  view.shakeX=view.reduced?0:Math.sin(t*103)*run.feedback.shake*5;
  view.shakeY=view.reduced?0:Math.cos(t*137)*run.feedback.shake*3;
  g.setTransform(ratio,0,0,ratio,0,0);g.fillStyle='#11110e';g.fillRect(0,0,w,h);
  g.save();g.translate(view.left,view.top);g.scale(view.scale,view.scale);
  g.beginPath();g.rect(0,0,1280,720);g.clip();
  g.translate(640+view.shakeX,360+view.shakeY);g.scale(view.camera.zoom,view.camera.zoom);g.translate(-view.camera.x,-view.camera.y);
  g.drawImage(view.art.floor.image,0,0,1280,720);
  // Warm temple light, readable feet, and dust; visual motion never touches combat RNG.
  g.fillStyle='#0b12230c';g.fillRect(0,0,1280,720);
  for(let i=0;i<23;i++){const x=(i*137+t*7)%1250,y=100+(i*97+t*3)%520;ellipse(g,x,y,1.2,1.2,'#fff0ca66');}
  for(const hazard of run.hazards)warning(g,hazard,t);
  chains(g,run);debrisAim(g,run);fragments(g,run,view.art);wipeEffect(g,run);
  const drawBoss=()=>{
    const pose=aergiaPose(run),breath=view.reduced?1:1+Math.sin(t*1.8)*.008;
    ellipse(g,b.x,b.y+1,pose===14?77:49,18,'#30221677');
    sprite(g,view.art.boss,pose,b.x,b.y,b.faceX<-.1,breath,run.status==='won'?.55:1);
    if(o.phase==='sleep'){
      g.font='italic 18px Georgia';g.fillStyle='#ead4a4';g.textAlign='center';g.fillText('z',b.x+60,b.y-60-Math.sin(t*2)*6);g.fillText('Z',b.x+75,b.y-85-Math.sin(t*2+1)*8);
    }
    if(o.phase==='stunned')for(let i=0;i<3;i++){
      const a=t*2+i*TAU/3;g.save();g.translate(b.x+Math.cos(a)*31,b.y-98+Math.sin(a)*8);g.rotate(a);g.fillStyle='#ffe399';g.fillRect(-3,-3,6,6);g.restore();
    }
    if(b.hitFlash>0){g.save();g.globalAlpha=b.hitFlash;ellipse(g,b.x,b.y-50,23,33,'#fff5d7');g.restore();}
  };
  const drawHero=()=>{
    ellipse(g,p.x,p.y+1,22,9,'#241e1e88');
    if(p.dodgeTime>0&&!view.reduced)for(let i=2;i>0;i--)sprite(g,view.art.hero,9,p.x-p.dodgeX*i*14,p.y-p.dodgeY*i*14,p.faceX<0,1,.14);
    sprite(g,view.art.hero,warriorPose(run),p.x,p.y,p.faceX<-.1,1,run.status==='dead'?.65:1);
    swordTrail(g,run,stats);
    // A small direction tick marks the player's feet, never an attack hitbox.
    g.beginPath();g.arc(p.x,p.y,21,Math.atan2(p.faceY,p.faceX)-.25,Math.atan2(p.faceY,p.faceX)+.25);g.strokeStyle='#fff0c888';g.lineWidth=2;g.stroke();
    if(o.carrying&&Math.hypot(p.x-b.x,p.y-b.y)<145){g.font='600 13px system-ui';g.textAlign='center';g.fillStyle='#fff1b7';g.fillText('좌클릭 · 내려찍기',p.x,p.y+28);}
  };
  if(p.y<b.y){drawHero();drawBoss();}else{drawBoss();drawHero();}
  for(const q of run.projectiles){
    if(q.kind==='debris'){
      const velocity=Math.hypot(q.vx,q.vy)||1,dx=q.vx/velocity,dy=q.vy/velocity;
      g.save();g.lineCap='round';
      for(let i=4;i>0;i--)stroke(g,[[q.x-dx*i*13,q.y-dy*i*13],[q.x-dx*(i-1)*13,q.y-dy*(i-1)*13]],`rgba(185,173,150,${(5-i)*.1})`,2+(5-i)*2);
      ellipse(g,q.x,q.y+14,13,5,'#16151d99');g.translate(q.x,q.y);g.rotate(t*9);
      g.drawImage(view.art.debris.image,-12,-13,24,26);g.restore();
    }
  }
  for(const q of run.particles){
    g.save();g.globalAlpha=clamp(q.life/q.maxLife);g.fillStyle=q.color;
    if(q.text){g.font='bold 19px Georgia';g.textAlign='center';g.shadowColor='#231c14';g.shadowBlur=4;g.fillText(q.text,q.x,q.y-70);}
    else if(q.type==='impact'){g.beginPath();g.arc(q.x,q.y,25*(1-q.life/q.maxLife),0,TAU);g.strokeStyle=q.color;g.lineWidth=3;g.stroke();}
    else{g.translate(q.x,q.y);g.rotate(q.life*4);g.fillRect(-2,-2,4,4);}g.restore();
  }
  dialogue(g,run);sleepTimer(g,run);g.restore();
  const vignette=g.createRadialGradient(w/2,h*.47,h*.22,w/2,h/2,h*.8);vignette.addColorStop(0,'#080e1200');vignette.addColorStop(1,'#080d1694');g.fillStyle=vignette;g.fillRect(0,0,w,h);
  if(run.feedback.flash>0){g.fillStyle=`rgba(156,32,23,${run.feedback.flash*.13})`;g.fillRect(0,0,w,h);}
}

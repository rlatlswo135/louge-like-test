import { ENCOUNTER_ROCKS, ENCOUNTER_SEALS, ENCOUNTER_SIGILS } from './encounters.mjs';
// Canvas presentation only. Hazard paths and camera mappings use simulation geometry.
import { ARENA, PLAYER, CLASSES } from './content.mjs';
import { getHazardProgress, getStats, getStorm, playerInvulnerable } from './game.mjs';
import { drawBossArt, drawHero } from './art.mjs';
import { paintStageArena } from './arena-art.mjs';
import { stageTheme } from './stages.mjs';
import { BOSS_SHOT_STYLES, paintBossShot, paintGroundResidue, paintFlameBrush } from './combat-fx.mjs';
import { TIMING_WINDOW, timingSuccess } from './attack-rhythm.mjs';
const TAU = Math.PI * 2;
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));

export function createView(canvas) {
  return { canvas, ctx: canvas.getContext('2d'), scale: 1, offsetX: 0, offsetY: 0, width: 0, height: 0,
    shakeX: 0, shakeY: 0, reducedMotion: false, floor: null, floorColor: null, shots: new Map() };
}
export function resizeView(view, width, height, dpr) {
  view.width = Math.max(1, Math.round(width * dpr)); view.height = Math.max(1, Math.round(height * dpr));
  if (view.canvas.width !== view.width || view.canvas.height !== view.height) {
    view.canvas.width = view.width; view.canvas.height = view.height;
  }
  view.scale = Math.min(view.width / ARENA.width, view.height / ARENA.height);
  view.offsetX = (view.width - ARENA.width * view.scale) / 2;
  view.offsetY = (view.height - ARENA.height * view.scale) / 2;
  view.dpr = dpr; view.shakeX = view.shakeY = 0;
}
export function screenToWorld(view, x, y) {
  return { x: (x * (view.dpr || 1) - view.offsetX - view.shakeX) / view.scale,
    y: (y * (view.dpr || 1) - view.offsetY - view.shakeY) / view.scale };
}
export function worldToScreen(view, x, y) {
  return { x: (x * view.scale + view.offsetX + view.shakeX) / (view.dpr || 1),
    y: (y * view.scale + view.offsetY + view.shakeY) / (view.dpr || 1) };
}
function surface(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
  return null;
}
const flameBrushes=[];
function groundFlameBrush(){
  if(flameBrushes.length===3)return flameBrushes;
  for(let frame=0;frame<3;frame++){
    const canvas=surface(64,96);if(!canvas)return null;
    const g=canvas.getContext('2d');g.translate(32,80);paintFlameBrush(g,frame);flameBrushes[frame]=canvas;
  }
  return flameBrushes;
}
function line(g, points, color, width = 1) {
  g.beginPath(); points.forEach(([x,y], i) => i ? g.lineTo(x,y) : g.moveTo(x,y));
  g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
function ring(g, x, y, radius, color, width = 1) {
  g.beginPath(); g.arc(x,y,radius,0,TAU); g.strokeStyle = color; g.lineWidth = width; g.stroke();
}
function polygon(g, points, color) {
  g.beginPath(); points.forEach(([x,y], i) => i ? g.lineTo(x,y) : g.moveTo(x,y)); g.closePath(); g.fillStyle = color; g.fill();
}
function buildFloor(theme) {
  const canvas=surface(ARENA.width,ARENA.height);
  if(canvas)paintStageArena(canvas.getContext('2d'),theme);
  return canvas;
}
function hazardPath(g,h,progress=1) {
  g.beginPath();
  if(h.shape==='field'){
    g.rect(0,0,ARENA.width,ARENA.height);
    for(const s of h.safe||[]){g.moveTo(s.x+s.radius,s.y);g.arc(s.x,s.y,s.radius,0,TAU,true);}return;
  }
  const inner=h.shape==='ring'?h.innerRadius:0;
  // Grow by area, not opacity; the full outline always remains fixed.
  const radius=h.shape==='lane'?0:Math.sqrt(inner*inner+(h.radius*h.radius-inner*inner)*progress);
  if(h.shape==='lane'&&h.charge){
    const r=h.width/2;g.moveTo(0,-r);g.lineTo(h.length*progress,-r);g.arc(h.length*progress,0,r,-Math.PI/2,Math.PI/2);
    g.lineTo(0,r);g.arc(0,0,r,Math.PI/2,Math.PI*1.5);g.closePath();
  }
  else if(h.shape==='lane') g.rect(0,-h.width/2,h.length*progress,h.width);
  else if(h.shape==='sector'){g.moveTo(0,0);g.arc(0,0,radius,h.angle-h.halfAngle,h.angle+h.halfAngle);g.closePath();}
  else if(h.shape==='ring'){
    const gap=h.gapHalfAngle||0, angle=h.gapAngle||0;
    g.arc(0,0,radius,angle+gap,angle+TAU-gap);
    if(!gap){g.closePath();g.moveTo(Math.cos(angle)*inner,Math.sin(angle)*inner);}
    g.arc(0,0,inner,angle+TAU-gap,angle+gap,true);g.closePath();
  }else g.arc(0,0,radius,0,TAU);
}
export function drawHazard(g,h,time,reduced,material='fire') {
  const active=h.phase==='active', future=h.t<0, progress=getHazardProgress(h);
  if(active&&h.charge&&h.body){
    g.save();ring(g,h.body.x,h.body.y,h.body.radius,'#ff8d75',3);g.restore();return;
  }
  if(h.gaze){
    g.save();g.translate(h.x,Math.max(42,h.y-138));g.strokeStyle=active?'#ff7464':'#efcf9c';g.fillStyle='#0a1015';g.lineWidth=3;
    g.beginPath();g.moveTo(-23,0);g.quadraticCurveTo(0,-22,23,0);g.quadraticCurveTo(0,22,-23,0);g.fill();g.stroke();
    ring(g,0,0,6,h.phase==='active'?'#ff7464':'#efcf9c',3);
    g.beginPath();g.arc(0,0,30,-Math.PI/2,-Math.PI/2+TAU*progress);g.stroke();g.restore();return;
  }
  if(h.shape==='field'){
    g.save();hazardPath(g,h);g.fillStyle=active?'#dd6e4c66':`rgba(226,151,70,${.08+progress*.16})`;g.fill('evenodd');
    for(const s of h.safe||[]){
      g.beginPath();g.arc(s.x,s.y,s.radius,0,TAU);g.fillStyle='#e9d4a51c';g.fill();
      ring(g,s.x,s.y,s.radius,'#f2d298',3);ring(g,s.x,s.y,s.radius-6,'#f2d29866',1);
      // A quiet gold refuge contrasts with the surrounding impact, without floor labels.
      for(let i=0;i<4;i++){const a=i*Math.PI/2;g.beginPath();g.arc(s.x,s.y,s.radius-12,a-.12,a+.12);g.strokeStyle='#fff1c2';g.lineWidth=2;g.stroke();}
    }
    g.restore();return;
  }
  const spent=active&&h.resolved&&!h.persistent&&h.pattern!=='pool';
  const color=spent?'#a89c88':active?'#ff7563':h.projectile?'#80d8f4':h.raid?'#dcc0ff':'#ffc16e';
  if(spent){
    g.save();g.translate(h.x,h.y);if(h.shape==='lane')g.rotate(h.angle);hazardPath(g,h);
    g.globalAlpha=.22*clamp(1-(h.t-h.windup)/h.active);g.strokeStyle=color;g.lineWidth=1;g.stroke();g.restore();return;
  }
  g.save();g.translate(h.x,h.y);if(h.shape==='lane')g.rotate(h.angle);
  if(active&&(h.persistent||h.pattern==='pool')){
    g.save();hazardPath(g,h);g.clip();paintGroundResidue(g,h,time,material,reduced,['fire','steel','stone','cannon'].includes(material)?groundFlameBrush():null);g.restore();
    hazardPath(g,h);g.strokeStyle=material==='fire'?'#b86a392b':material==='water'?'#7dac9666':'#bec7e466';g.lineWidth=1.2;g.stroke();
    g.restore();return;
  }
  hazardPath(g,h);g.globalAlpha=future?.035:active&&!h.projectile?.4:.075;g.fillStyle=color;g.fill();
  if(!active&&progress>0){
    hazardPath(g,h,progress);g.globalAlpha=h.projectile?.25:.38;g.fill();
    g.globalAlpha=.8;g.strokeStyle=color;g.lineWidth=1.5;g.stroke();
  }
  hazardPath(g,h);g.globalAlpha=future?.35:.95;
  g.setLineDash(active&&!h.projectile?[]:[10,6]);
  g.strokeStyle=color;g.lineWidth=active||h.raid?3:2;g.stroke();g.setLineDash([]);
  if(h.projectile){
    // Filled blue corridor predicts travel; only the emitted projectile deals damage.
    g.globalAlpha=future?.25:.8;
    for(let x=55;x<h.length;x+=95)line(g,[[x-7,-5],[x,0],[x-7,5]],color,1.5);
  }else if(active){
    g.save();g.clip();g.globalAlpha=.2;
    const extent=h.shape==='lane'?h.length:h.radius;
    const heat=g.createLinearGradient(0,-extent,0,extent);
    heat.addColorStop(0,'#ffdab600');heat.addColorStop(.5,'#fff0d3');heat.addColorStop(1,'#ffb28000');
    g.fillStyle=heat;g.fillRect(-extent,-extent,extent*3,extent*2);g.restore();
    const flash=clamp(1-(h.t-h.windup)/.18);
    hazardPath(g,h);g.globalAlpha=(reduced?.35:.8)*flash;g.strokeStyle='#fff4da';g.lineWidth=5;g.stroke();
  }
  if(!active&&!h.raid){
    const x=h.shape==='lane'?Math.min(75,h.length/2):0;
    g.globalAlpha=future?.5:1;
    ring(g,x,0,12,'#111c29',5);
    g.beginPath();g.arc(x,0,12,-Math.PI/2,-Math.PI/2+TAU*progress);g.strokeStyle=color;g.lineWidth=3;g.stroke();
    g.fillStyle='#fff0ca';g.font='bold 11px sans-serif';g.textAlign='center';
    if(future)g.fillText(String((h.sequenceIndex??h.volleyIndex??0)+1),x,-18);
  }
  if(h.sweep&&!active){
    g.save();g.rotate(h.sweep*h.active);g.globalAlpha=.45;g.setLineDash([5,9]);
    line(g,[[0,0],[h.length,0]],'#e8bdff',2);g.setLineDash([]);g.restore();
  }
  if(h.ghost){g.globalAlpha=.75;ring(g,0,0,19,'#e4ddff',2);line(g,[[-8,-12],[8,12]],'#e4ddff',3);}
  if(h.counterable){g.globalAlpha=1;ring(g,0,0,30,progress>.6?'#78f0e7':'#718b93',4);}
  g.restore();
}
function shotSprite(view,q,style,frame=0) {
  const key=style?`boss:${style}:${q.radius}:${frame}:${q.owner}`:`${q.owner}:${q.kind}:${q.radius}:${q.color}`;
  if(view.shots.has(key))return view.shots.get(key);
  if(style){
    const c=surface(128,80);if(!c)return null;
    const g=c.getContext('2d');g.translate(80,40);paintBossShot(g,style,q.radius,frame,q.owner==='player');
    if(view.shots.size>=32)view.shots.delete(view.shots.keys().next().value);
    view.shots.set(key,c);return c;
  }
  const c=surface(96,64);if(!c)return null;
  const g=c.getContext('2d'),r=q.radius||6,color=q.color||'#f0a875';g.translate(50,32);
  g.shadowColor=color;g.shadowBlur=10;g.fillStyle=color;g.strokeStyle=color;
  if(q.kind==='flamethrower'){
    g.shadowBlur=0;const flame=g.createRadialGradient(8,0,1,0,0,24);
    flame.addColorStop(0,'#fff2cd');flame.addColorStop(.3,'#ffc46d');flame.addColorStop(.65,'#c85d36cc');flame.addColorStop(1,'#92281700');
    g.fillStyle=flame;g.beginPath();g.moveTo(-30,-3);g.bezierCurveTo(-8,-18,16,-17,21,0);g.bezierCurveTo(16,14,-12,17,-30,-3);g.fill();
  }else if(q.owner==='boss'||['fire','water','lightning'].includes(q.kind)){
    if(q.kind==='lightning')line(g,[[-26,0],[-16,-5],[-8,4],[0,-4],[10,0]],color,3);
    else {g.beginPath();g.ellipse(0,0,r,r*.85,0,0,TAU);g.fill();line(g,[[-r*3,0],[0,0]],`${color}80`,r*.7);}
    g.shadowBlur=0;g.fillStyle='#fff9d7';g.beginPath();g.arc(1,-1,Math.max(2,r*.38),0,TAU);g.fill();
  }else if(q.kind==='cannon'||q.kind==='fragment-shell'||q.kind==='fragment'||q.kind==='boomerang'){
    g.shadowBlur=0;
    if(q.kind==='cannon'||q.kind==='fragment-shell'){
      const shell=g.createRadialGradient(-3,-3,1,0,0,11);shell.addColorStop(0,'#c7c4ae');shell.addColorStop(.45,'#59636a');shell.addColorStop(1,'#151d26');
      g.fillStyle=shell;g.beginPath();g.arc(0,0,10,0,TAU);g.fill();
      line(g,[[-27,0],[-11,0]],'#eab56b70',3);line(g,[[-20,-3],[-13,-2]],'#ffe1a770',1);
    }else if(q.kind==='fragment'){
      polygon(g,[[-7,-3],[5,-4],[11,0],[2,4],[-6,2]],'#b6b9ac');line(g,[[-18,0],[-7,0]],'#e5b37288',2);
    }else{
      g.strokeStyle='#c9d5d1';g.lineWidth=3;g.beginPath();g.arc(0,0,13,-1.1,1.1);g.stroke();
      polygon(g,[[10,-7],[17,0],[10,7],[12,0]],'#edf0dc');
    }
  }else{
    const arrow=['bow','crossbow'].includes(q.kind), gun=['revolver','sniper','shotgun','machinegun','dual-pistols','flamethrower'].includes(q.kind);
    line(g,[[-25,0],[12,0]],color,arrow?3:q.kind==='sniper'?2.5:1.5);g.shadowBlur=0;
    polygon(g,[[arrow?18:14,0],[arrow?5:-1,arrow?-3:-1],[arrow?5:-1,arrow?3:1]],arrow?'#fff0c3':'#f7d79b');
    if(arrow){line(g,[[-13,0],[-23,-7]],'#fff0c3',2);line(g,[[-13,0],[-23,7]],color,2);line(g,[[-17,0],[-24,0]],'#fff9de',.8);}
    else if(gun){line(g,[[-25,-2],[7,-2]],'#fff4cf',.8);}
  }
  if(view.shots.size>=32)view.shots.delete(view.shots.keys().next().value);
  view.shots.set(key,c);return c;
}
function drawStorm(g,state,time,reduced) {
  if(!state)return;
  const storm=getStorm(state);if(!storm.active)return;
  const {x,y,radius,outside,progress}=storm;
  g.save();g.beginPath();g.rect(0,0,ARENA.width,ARENA.height);g.arc(x,y,radius,0,TAU,true);g.fillStyle=outside?'#8b302b38':'#10192220';g.fill('evenodd');
  g.save();g.beginPath();g.rect(0,0,ARENA.width,ARENA.height);g.arc(x,y,radius,0,TAU,true);g.clip('evenodd');
  const fog=g.createRadialGradient(x,y,radius,x,y,radius+140);
  fog.addColorStop(0,outside?'#a3393670':'#6e657455');fog.addColorStop(.25,'#1b17296e');fog.addColorStop(1,'#090813b0');
  g.fillStyle=fog;g.fillRect(0,0,ARENA.width,ARENA.height);g.restore();
  g.globalAlpha=outside?.95:.72;g.setLineDash(outside||reduced?[]:[12,7]);
  g.strokeStyle=outside?'#ff7869':'#d9e5ca';g.lineWidth=outside?5:3;
  g.beginPath();g.arc(x,y,radius,0,TAU);g.stroke();g.setLineDash([]);
  g.globalAlpha=.65;g.beginPath();g.arc(x,y,radius+7+(reduced?0:Math.sin(time*4)*2),-Math.PI/2,-Math.PI/2+TAU*clamp(progress));g.strokeStyle='#ffe2a0';g.lineWidth=2;g.stroke();
  g.restore();
}
function drawProjectiles(g,view,state) {
  const style=BOSS_SHOT_STYLES[state.tutorial?0:state.stage||0],frame=view.reducedMotion?0:Math.floor(state.time*10)%3;
  for(const q of state.projectiles){
    const boss=q.owner==='boss'||q.kind==='encounter-orb',sprite=shotSprite(view,q,boss?style:null,frame);
    g.save();g.translate(q.x,q.y);g.rotate(Math.atan2(q.vy,q.vx));
    // Solid material cores keep their shape on bright floors; glow is baked into the cache.
    g.globalCompositeOperation=!boss&&['fire','water','lightning','flamethrower'].includes(q.kind)?'lighter':'source-over';
    if(sprite)g.drawImage(sprite,boss?-80:-50,boss?-40:-32);g.restore();
  }
}
export function drawUniqueAttacks(g,state,reduced){
  for(const a of state.attacks||[]){
    if(a.kind==='emitter'||!Number.isFinite(a.x)||!Number.isFinite(a.y))continue;
    const warm=clamp(a.windup>0?a.t/a.windup:1),color=a.color||'#b8a4ef';
    g.save();
    const shape=a.shape||(a.kind==='meteor'?'circle':'lane');
    const geometry={...a,shape,angle:a.angle||0,length:a.length||30,width:a.width||8,radius:a.radius||30,halfAngle:a.halfAngle||1};
    g.save();g.translate(a.x,a.y);if(shape==='lane')g.rotate(geometry.angle);
    hazardPath(g,geometry);
    g.fillStyle=color;g.globalAlpha=warm<1?.08:.2;g.fill();
    g.globalAlpha=a.secondary?.5:.9;g.strokeStyle=color;g.lineWidth=warm<1?2:4;g.setLineDash(warm<1?[5,5]:[]);g.stroke();g.restore();
    if(a.kind==='meteor'){
      ring(g,a.x,a.y,(a.radius||30)*Math.max(.1,warm),color,2);
      if(warm>=1){g.fillStyle='#fff1c7';g.beginPath();g.arc(a.x,a.y,6,0,TAU);g.fill();}
    }
    if(a.weapon?.elastic){const reach=a.shape==='lane'?a.length:a.radius;line(g,[[a.x,a.y],[a.x+Math.cos(a.angle)*reach,a.y+Math.sin(a.angle)*reach]],color,7);}
    if(a.kind==='echo'&&a.shape==='sector'){
      g.translate(a.x,a.y);g.globalAlpha=.25;drawHero(g,{classId:state.cls.id,weaponId:a.weapon?.id||state.weapon.id,color},1,0,{weaponAngle:a.angle,attackProgress:.6,reducedMotion:true});
    }
    g.restore();
  }
}
function drawEncounter(g,state){
  const e=state.encounter;if(!e)return;
  g.save();
  if(e.kind==='cover'){
    for(const r of ENCOUNTER_ROCKS){
      const a=Math.atan2(r.y-360,r.x-640),gap=Math.asin(r.r/Math.hypot(r.x-640,r.y-360));
      g.beginPath();g.moveTo(r.x,r.y);g.lineTo(640+Math.cos(a-gap)*1600,360+Math.sin(a-gap)*1600);g.lineTo(640+Math.cos(a+gap)*1600,360+Math.sin(a+gap)*1600);g.closePath();
      g.fillStyle='#6dcc9c44';g.fill();g.strokeStyle='#91dbaa88';g.lineWidth=2;g.stroke();
      const {x,y,r:radius}=r;
      const stone=g.createLinearGradient(x-radius,y-radius,x+radius,y+radius);stone.addColorStop(0,'#a09f8c');stone.addColorStop(.38,'#535c59');stone.addColorStop(1,'#171e24');
      g.fillStyle='#05080b9c';g.beginPath();g.ellipse(x+3,y+8,radius+4,radius*.8,0,0,TAU);g.fill();
      polygon(g,[[x-radius,y],[x-radius*.65,y-radius*.75],[x+radius*.15,y-radius],[x+radius*.8,y-radius*.5],[x+radius,y],[x+radius*.65,y+radius*.7],[x-radius*.45,y+radius*.8]],stone);
      line(g,[[x-radius*.65,y-radius*.75],[x-radius*.1,y-radius*.35],[x+radius*.8,y-radius*.5]],'#d7cfb650',1);
    }
    if(e.active)ring(g,640,360,30+Math.max(0,1-(e.pulseAt-e.elapsed)/2.4)*200,'#b1dfff',3);
  }else if(e.active&&e.kind==='seals'){
    for(const [i,r] of ENCOUNTER_SEALS.entries()){
      g.globalAlpha=e.sealMask&(1<<i)?.25:1;ring(g,r.x,r.y,r.r,'#e7c58b',2);
      polygon(g,[[r.x-12,r.y+13],[r.x-10,r.y-13],[r.x,r.y-23],[r.x+10,r.y-13],[r.x+12,r.y+13]],'#41494a');
      polygon(g,[[r.x,r.y-18],[r.x+5,r.y-6],[r.x,r.y+7],[r.x-5,r.y-6]],'#e7c58b');
    }
  }else if(e.active&&e.kind==='sigils'){
    for(const [i,r] of ENCOUNTER_SIGILS.entries()){
      g.globalAlpha=e.sigilMask&(1<<i)?.2:1;ring(g,r.x,r.y,r.r,'#75e6d2',2);
      polygon(g,[[r.x,r.y-20],[r.x+12,r.y],[r.x,r.y+20],[r.x-12,r.y]],'#647e79');
      line(g,[[r.x,r.y-17],[r.x+5,r.y],[r.x,r.y+17]],'#bcf0cf',2);
    }
  }
  if(e.active){ring(g,state.boss.x,state.boss.y,state.boss.def.radius+12,'#a4f1e0',2);}
  g.restore();
}
function drawPlayer(g,state,time,reduced,stats) {
  const p=state.player, facing=p.faceX<0?-1:1, weapon=stats.weapon||state.weapon;
  const config={classId:state.cls.id,weaponId:weapon.id==='fragment-shell'?'cannon':['beam','meteor'].includes(weapon.id)?'staff':weapon.id,color:weapon.color};
  const dodgeKind=(stats.dodge||state.cls.dodge)?.kind||'step';
  ring(g,p.x,p.y,PLAYER.radius+3,'#cab58955',1);
  if(p.guardTime>0||p.counterTime>0){
    const a=Math.atan2(p.guardY||0,p.guardX||0);
    g.save();g.beginPath();g.arc(p.x,p.y,29,a-Math.PI/2,a+Math.PI/2);
    g.strokeStyle=p.counterTime>0?'#effff4':'#9edecd';g.lineWidth=p.counterTime>0?5:3;g.stroke();
    g.font='600 10px sans-serif';g.textAlign='center';g.fillStyle='#c9f8e9';g.fillText(p.counterTime>0?'COUNTER':'Q',p.x,p.y+36);g.restore();
  }
  if(p.dodgeTime>0&&!reduced)for(let i=3;i>0;i--){g.save();g.globalAlpha=.1*(4-i);g.translate(p.x-p.dodgeX*i*15,p.y-p.dodgeY*i*15);g.scale(facing,1);drawHero(g,config,1,time,{dodgeTime:p.dodgeTime,dodgeKind});g.restore();}
  const t=p.swing?clamp(p.swing.t/(weapon.swingTime||.2)):0;
  if(weapon.kind==='projectile'){
    const angle=Math.atan2(p.faceY,p.faceX), charged=['bow','crossbow'].includes(weapon.id);
    const power=charged&&stats.chargeTime?clamp((p.charge||0)/stats.chargeTime):1;
    const range=stats.reach*(charged?.55+.45*power:1), ex=p.x+Math.cos(angle)*range,ey=p.y+Math.sin(angle)*range;
    g.save();g.globalAlpha=charged?.26:.13;line(g,[[p.x,p.y],[ex,ey]],weapon.color,charged?2:1);
    if(charged&&power<1){
      const fx=p.x+Math.cos(angle)*stats.reach,fy=p.y+Math.sin(angle)*stats.reach;
      g.setLineDash([4,6]);line(g,[[ex,ey],[fx,fy]],weapon.color,1);g.setLineDash([]);
      line(g,[[fx-Math.sin(angle)*7,fy+Math.cos(angle)*7],[fx+Math.sin(angle)*7,fy-Math.cos(angle)*7]],weapon.color,2);
    }
    g.globalAlpha=charged?.85:.65;ring(g,ex,ey,charged?5+power*5:4,weapon.color,charged?2:1.5);
    if(charged&&(p.charge||0)>0){g.globalAlpha=.25+.45*power;ring(g,p.x,p.y,PLAYER.radius+7+power*9,weapon.color,2);}
    g.restore();
  }
  if(p.swing&&weapon.kind==='melee'){
    const angle=p.swing.angle, reach=p.swing.reach||stats.reach;
    const thrust=p.swing.shape==='lane'||['spear','punch','kick','dagger'].includes(weapon.id);
    g.save();g.globalCompositeOperation='lighter';g.globalAlpha=.68*(1-t);
    if(thrust){
      const kick=weapon.id==='kick', fist=['punch','dagger'].includes(weapon.id);
      const end=reach*(.78+.22*Math.sin(t*Math.PI));
      const nx=Math.cos(angle),ny=Math.sin(angle),px=-ny,py=nx;
      if(kick){
        line(g,[[p.x+px*10,p.y+py*10],[p.x+nx*end+px*14,p.y+ny*end+py*14],[p.x+nx*end-px*14,p.y+ny*end-py*14],[p.x-px*10,p.y-py*10]],'#fff0bc',4);
        line(g,[[p.x+nx*8,p.y+ny*8],[p.x+nx*end,p.y+ny*end]],weapon.color,13);
      }else{
        line(g,[[p.x+nx*8+px*(fist?7:3),p.y+ny*8+py*(fist?7:3)],[p.x+nx*end+px*(fist?7:3),p.y+ny*end+py*(fist?7:3)]],weapon.color,fist?17:8);
        line(g,[[p.x+nx*8-px*(fist?7:3),p.y+ny*8-py*(fist?7:3)],[p.x+nx*end-px*(fist?7:3),p.y+ny*end-py*(fist?7:3)]],'#fff2d9',fist?4:3);
      }
      if(fist){const x=p.x+nx*end,y=p.y+ny*end;ring(g,x,y,10+4*Math.sin(t*Math.PI),'#fff3cf',3);}
    }else{
      const start=angle-weapon.arc/2, end=start+weapon.arc*Math.min(1,t+.5);
      const trail=g.createRadialGradient(p.x,p.y,reach*.5,p.x,p.y,reach);
      trail.addColorStop(0,'#e7e2c600');trail.addColorStop(.65,`${weapon.color}25`);trail.addColorStop(1,'#e8ede1aa');
      g.beginPath();g.arc(p.x,p.y,reach,start,end);g.arc(p.x,p.y,reach*.56,end,start,true);g.closePath();g.fillStyle=trail;g.fill();
      g.beginPath();g.arc(p.x,p.y,reach,start,end);g.strokeStyle='#ecf0e3';g.lineWidth=2.5;g.stroke();
      if(stats.fusion){g.beginPath();g.arc(p.x,p.y,reach*.82,start,end);g.strokeStyle='#cfb4ff80';g.lineWidth=3;g.stroke();}
    }g.restore();
  }
  g.save();g.translate(p.x,p.y);g.scale(facing,1);
  const weaponAngle=Math.atan2(p.faceY,p.faceX*facing);
  if(p.hurtFlash>0)g.globalAlpha=.7;
  const uniqueIds=stats.uniqueIds||[], uniqueId=uniqueIds.includes('one-cut')?'one-cut':uniqueIds[0];
  drawHero(g,config,1,time,{weaponAngle,guardTime:p.guardTime,guardKind:stats.counter?.kind,attackProgress:t,comboStep:p.comboStep||p.attackStep,fused:!!stats.fusion,uniqueId,timingMeter:stats.timingMeter,timingPhase:p.timingPhase,heat:p.heat,muzzle:(p.recoilTime||0)>0,lean:p.dodgeTime>0?p.dodgeX*.16:0,walk:p.moving,charge:p.charge||0,chargeRatio:stats.chargeTime?clamp((p.charge||0)/stats.chargeTime):0,reloadTime:p.reloadTime||0,dodgeTime:p.dodgeTime||0,dodgeKind,dodgeProgress:(stats.dodge||state.cls.dodge).duration?1-p.dodgeTime/(stats.dodge||state.cls.dodge).duration:0,dodgeDirection:(p.dodgeX||facing)*facing,dodgeFromX:p.dodgeFromX,dodgeFromY:p.dodgeFromY,hurtFlash:p.hurtFlash||0,reducedMotion:reduced});g.restore();
  if(stats.timingMeter){
    const x=p.x-38,y=p.y+30,phase=clamp(p.timingPhase||0),width=76;
    g.fillStyle='#071016';g.fillRect(x-2,y-2,width+4,11);
    g.fillStyle='#26333d';g.fillRect(x,y,width,7);g.fillStyle=timingSuccess(phase)?'#bcffe0':'#7fe0b6';
    g.fillRect(x+width*TIMING_WINDOW.start,y,width*(TIMING_WINDOW.end-TIMING_WINDOW.start),7);
    g.fillStyle='#fff0bc';g.fillRect(x+Math.round(phase*(width-2)),y-3,2,13);
  }
  if((p.heat||0)>0){g.fillStyle='#231a18';g.fillRect(p.x-16,p.y+PLAYER.radius+8,32,4);g.fillStyle='#ff7758';g.fillRect(p.x-15,p.y+PLAYER.radius+9,30*clamp(p.heat),2);}
  if((state.boss.wetStacks||0)>0){
    for(let i=0;i<3;i++)ring(g,state.boss.x-10+i*10,Math.max(14,state.boss.y-state.boss.def.radius*2.8-16),3,i<state.boss.wetStacks?'#b0eafa':'#24343f',3);
  }
  if(p.shield>0){ring(g,p.x,p.y,PLAYER.radius+10,'#91d9eb88',1.5);g.fillStyle='#b9f2ef';g.fillRect(p.x-2,p.y-PLAYER.radius-12,4,4);}
  if(playerInvulnerable(state))ring(g,p.x,p.y,PLAYER.radius+6,'#d5fff4',2);
}
// Draw last: health and charge never disappear behind a boss, hit flash or projectile.
export function drawPlayerStatus(g,state,stats=getStats(state)){
  const p=state.player,x=clamp(p.x,36,ARENA.width-36),y=Math.max(25,p.y-84),ratio=clamp(p.hp/p.maxHp);
  g.save();g.fillStyle='#060c12ee';g.fillRect(x-30,y-2,60,9);
  g.strokeStyle='#b4bba866';g.lineWidth=1;g.strokeRect(x-30.5,y-2.5,61,10);
  g.fillStyle=ratio<=.3?'#f16f62':'#98d7b2';g.fillRect(x-28,y,56*ratio,5);
  if(p.shield>0){g.fillStyle='#b4e8f5';g.fillRect(x-28,y-2,56*clamp(p.shield/p.maxHp),2);}
  if(ratio<=.3||p.hurtFlash>0){g.font='600 11px sans-serif';g.textAlign='center';g.lineWidth=3;g.strokeStyle='#060c12';const text=String(Math.ceil(p.hp));g.strokeText(text,x,y-7);g.fillStyle='#ffe7de';g.fillText(text,x,y-7);}
  if(stats.chargeTime&&((p.charge||0)>0||(p.chargeFlash||0)>0)){
    const charge=p.charge>0?clamp(p.charge/stats.chargeTime):(p.chargeShotPower||1),cx=clamp(p.x+39,10,ARENA.width-28),cy=clamp(p.y-30,18,ARENA.height-60);
    const full=charge>=.98,color=full?'#fff1aa':'#8cdef0';
    g.fillStyle='#071119ee';g.fillRect(cx-3,cy-2,9,44);g.fillStyle=color;g.fillRect(cx,cy+38*(1-charge),3,38*charge);
    for(let i=1;i<4;i++){g.fillStyle='#06101899';g.fillRect(cx,cy+i*9.5,3,1);}
    g.font='700 10px sans-serif';g.textAlign='center';g.strokeStyle='#071119';g.lineWidth=3;
    const text=full?'완충':`${Math.round(charge*100)}%`;g.strokeText(text,cx+2,cy-7);g.fillStyle=color;g.fillText(text,cx+2,cy-7);
  }
  if(stats.magazine){
    g.fillStyle='#060c12dc';g.fillRect(x-20,y+10,40,4);
    g.fillStyle=p.reloadTime>0?'#e8c086':'#b5bfbd';g.fillRect(x-20,y+10,40*(p.reloadTime>0?1-p.reloadTime/stats.reloadTime:p.ammo/stats.magazine),3);
  }
  g.restore();
}
export function getBossMotion(state,reducedMotion=false) {
  const b=state.boss;
  // A lingering pool must not hide the next cast's anticipation or replay its impact.
  let cue=state.hazards.findLast(h=>h.phase==='active'&&h.t-h.windup<Math.min(.24,h.active));
  if(!cue) for(const h of state.hazards) {
    if(h.phase==='warn'&&(!cue||h.windup-h.t<cue.windup-cue.t))cue=h;
  }
  const facing=b.faceX<0?-1:1;
  const angle=cue?(cue.angle??Math.atan2(cue.y-b.y,cue.x-b.x)):Math.atan2(b.faceY,b.faceX);
  return { anticipation:cue?.phase==='warn'?getHazardProgress(cue):0,
    strike:cue?.phase==='active'?clamp((cue.t-cue.windup)/Math.min(.24,cue.active)):null,
    recovery:b.state==='recover'?clamp(1-b.timer/(b.pattern?.recover||1.6)):null,
    shape:cue?.shape,major:!!cue?.raid,
    angle:Math.atan2(Math.sin(angle),Math.cos(angle)*facing),
    moving:b.state==='idle'&&Math.hypot(state.player.x-b.x,state.player.y-b.y)>b.def.radius+PLAYER.radius+40,
    reducedMotion };
}
function drawParticles(g,state,reduced) {
  for(const q of state.particles){
    g.save();g.globalAlpha=clamp(q.life/q.maxLife);g.fillStyle=q.color||'#f1d199';
    if(q.text){g.font=`600 ${q.size||18}px Georgia,serif`;g.textAlign='center';g.lineWidth=3;g.strokeStyle='#0d1720';g.strokeText(q.text,q.x,q.y-28);g.fillText(q.text,q.x,q.y-28);}
    else if(q.type==='bossImpact'){
      if(q.shape==='field'||q.gaze){g.restore();continue;}
      const progress=1-q.life/q.maxLife;
      g.translate(q.x,q.y);g.globalAlpha*=reduced?.22:.55;
      g.strokeStyle=q.color;g.lineWidth=3;
      if(q.shape==='muzzle'){
        g.rotate(q.angle);const r=12+(reduced?0:progress*24);
        line(g,[[-5,-r],[r*.7,0],[-5,r]],'#ffe9bd',3);
      }else if(q.shape==='lane'){
        g.rotate(q.angle);
        const points=Array.from({length:9},(_,i)=>[q.length*i/8,Math.sin(i*7)*q.width*.2]);
        line(g,points,'#fff0c8',3);line(g,[[0,0],[q.length,0]],q.color,7*(1-progress));
      }else{
        hazardPath(g,q,reduced?1:.6+.4*progress);g.stroke();
        if(q.shape==='circle') for(let i=0;i<8;i++){
          const a=i*TAU/8,r=q.radius*(.55+.4*progress);
          line(g,[[Math.cos(a)*r*.8,Math.sin(a)*r*.8],[Math.cos(a)*r,Math.sin(a)*r]],'#f4d6a5',2);
        }
      }
    }else if(q.type==='impact'){
      const r=8+(1-q.life/q.maxLife)*32;ring(g,q.x,q.y,r,q.color,1.5);
      line(g,[[q.x-r*.7,q.y],[q.x+r*.7,q.y]],'#fff1d8',2);line(g,[[q.x,q.y-r*.7],[q.x,q.y+r*.7]],'#fff1d8',2);
    }else if(q.type==='meleeImpact'){
      g.globalCompositeOperation='lighter';g.translate(q.x,q.y);g.rotate(q.angle||0);
      const progress=1-q.life/q.maxLife,r=7+progress*20,size=q.size||10;
      if(q.unique){ring(g,0,0,r*1.8,'#d8b7ff',5);line(g,[[-size*.8,-size*.6],[size*.8,size*.6]],'#f4e7ff',5);}
      g.globalAlpha*=1-progress*.35;ring(g,0,0,r,q.color,2.5);
      for(let i=0;i<7;i++){const a=(i-3)*.22;line(g,[[Math.cos(a)*4,Math.sin(a)*4],[Math.cos(a)*(r+size),Math.sin(a)*(r+size)]],'#fff4d2',i===3?3:1.5);}
    }else{g.globalCompositeOperation='lighter';g.translate(q.x,q.y);g.rotate(Math.atan2(q.vy,q.vx));g.fillRect(-3,-1,6,2);}
    g.restore();
  }
}
function dangerEdges(g,view,state,time) {
  if(!state)return;
  const ratio=state.player.hp/state.player.maxHp;
  const low=ratio<=.3 ? .16+(1-ratio/.3)*.4 : 0;
  const strength=Math.max(low,state.feedback.flash*.7);
  if(!strength)return;
  const pulse=view.reducedMotion?1:.94+Math.sin(time*5)*.06;
  const gradient=g.createLinearGradient(0,0,view.width,0);
  for(const [at,alpha] of [[0,strength],[.15,strength*.28],[.35,0],[.65,0],[.85,strength*.28],[1,strength]])gradient.addColorStop(at,`rgba(165,25,31,${alpha*pulse})`);
  g.setTransform(1,0,0,1,0,0);g.fillStyle=gradient;g.fillRect(0,0,view.width,view.height);
}
export function renderFrame(view,state,time) {
  const g=view.ctx,reduced=view.reducedMotion,theme=stageTheme(state),color=theme.name;
  g.setTransform(1,0,0,1,0,0);g.fillStyle='#070e15';g.fillRect(0,0,view.width,view.height);
  if(!view.floor||view.floorColor!==color){view.floor=buildFloor(theme);view.floorColor=color;}
  const melee=state?clamp(state.feedback.melee||0):0;
  const kick=state?Math.max(state.player.hurtFlash/.25*7,state.boss.hitFlash/.12*1.8,melee*13):0;
  view.shakeX=reduced?0:Math.sin(time*83)*kick*view.scale;
  view.shakeY=reduced?0:Math.cos(time*71)*kick*.6*view.scale;
  g.setTransform(view.scale,0,0,view.scale,view.offsetX+view.shakeX,view.offsetY+view.shakeY);
  if(view.floor)g.drawImage(view.floor,0,0,ARENA.width,ARENA.height);
  drawStorm(g,state,time,reduced);
  g.save();g.beginPath();g.rect(0,0,ARENA.width,ARENA.height);g.clip();
  for(let i=0;i<20;i++){
    const t=reduced?0:time;g.globalAlpha=.13+i%3*.06;g.fillStyle=i%3?'#dcbe82':'#8dc6c9';
    g.fillRect((i*177+Math.sin(t*.3+i)*14+ARENA.width)%ARENA.width,((i*139-t*(4+i%4))%ARENA.height+ARENA.height)%ARENA.height,1.6,1.6);
  }g.globalAlpha=1;
  if(state){
    const stats=getStats(state);
    for(const h of state.hazards)drawHazard(g,h,time,reduced,stageTheme(state).sound);
    drawEncounter(g,state);
    const b=state.boss;
    const motion=getBossMotion(state,reduced);
    const boss=()=>{
      if(b.hp<=0)return;
      if(b.raid){
        g.save();g.globalAlpha=.8;g.setLineDash([8,5]);
        ring(g,b.x,b.y,b.def.radius+18,'#c4b0fb',3);g.setLineDash([]);
        ring(g,b.x,b.y,b.def.radius+23,'#c4b0fb',1);g.restore();
      }
      const elapsed=b.pattern?b.pattern.active-b.timer:0;
      const path=b.state==='active'&&b.chargePaths?.findLast(p=>p.start<=elapsed&&elapsed<p.start+p.duration);
      if(path&&!reduced) for(let i=2;i>0;i--){
        const distance=Math.min(i*22,path.length*clamp((elapsed-path.start)/path.duration));
        g.save();g.globalAlpha=.09*(3-i);g.translate(b.x-Math.cos(path.angle)*distance,b.y-Math.sin(path.angle)*distance);
        g.scale(b.faceX<0?-1:1,1);drawBossArt(g,b.def.artId||b.def.id,b.def.radius,b,time,motion);g.restore();
      }
      g.save();g.translate(b.x,b.y);g.scale(b.faceX<0?-1:1,1);
      drawBossArt(g,b.def.artId||b.def.id,b.def.radius,b,time,motion);
      if(b.hitFlash>0){g.globalCompositeOperation='screen';g.globalAlpha=b.hitFlash/.12*.45;drawBossArt(g,b.def.artId||b.def.id,b.def.radius,b,time,motion);}
      g.restore();
    };
    if(b.raid?.kind==='memory'&&b.raid.round===0)for(const [i,s] of (b.raid.memory||[]).entries()){
      ring(g,s.x,s.y,s.radius,'#e9d7ab88',2);g.fillStyle='#f3e2bf';g.font='600 22px Georgia';g.textAlign='center';g.fillText(['Ⅰ','Ⅱ','Ⅲ'][i],s.x,s.y+7);
    }
    if(b.raid?.counterWindow){
      ring(g,b.x,b.y,b.def.radius+14,'#dceafa55',1);
      const facing=Math.atan2(b.faceY,b.faceX);g.beginPath();g.arc(b.x,b.y,b.def.radius+18,facing-Math.PI/2,facing+Math.PI/2);g.strokeStyle='#dceafa';g.lineWidth=5;g.stroke();
    }
    if(b.y>state.player.y){drawPlayer(g,state,time,reduced,stats);boss();}else{boss();drawPlayer(g,state,time,reduced,stats);}
    drawUniqueAttacks(g,state,reduced);drawProjectiles(g,view,state);drawParticles(g,state,reduced);
    drawPlayerStatus(g,state,stats);
  }
  g.restore();dangerEdges(g,view,state,time);
}
export function drawPortrait(canvas,{classId='warrior',weaponId='sword',bossId=null}={}) {
  const g=canvas.getContext('2d');if(!g)return;
  const w=canvas.width,h=canvas.height;g.clearRect(0,0,w,h);g.save();g.translate(w*(bossId ? .5 : .47),h*(bossId ? .65 : .74));
  // Portraits use the same complete, high-resolution silhouette as combat.
  if(bossId)drawBossArt(g,bossId,Math.min(w,h)*.21,{phase:bossId==='rift-lord'?2:1},0);
  else{
    const cls=CLASSES.find(c=>c.id===classId),weapon=cls?.weapons.find(w=>w.id===weaponId);
    drawHero(g,{classId,weaponId,color:weapon?.color||cls?.color},Math.min(w/125,h/100)*.94,0,{weaponAngle:-.28});
  }g.restore();
}

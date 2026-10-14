import { ARENA, PLAYER } from './content.mjs';
import { spawnHazard, burst } from './systems/effects.mjs';
import { playerInvulnerable } from './systems/combat.mjs';
import { getStats } from './systems/stats.mjs';
import { segmentHitsCircle } from './systems/geometry.mjs';
import { BossEncounter, BossEntrance, BossAttackSet, OncePerFightMechanic } from './boss-encounter.mjs';
import type { RunState as BaseRunState, InputState, Hazard, BossDefinition } from './types.mjs';
import type { AergiaState, AergiaAction } from './olympus-types.mjs';
type RunState = BaseRunState & { olympus: AergiaState };

const TAU = Math.PI * 2;
export const AERGIA_RULES = Object.freeze({ hp: 3600, threshold: .5, fragments: 6, stun: 2.5, pickupRadius: 34, smashRange: 145, intro: 6.8,
  sweepRange:330, chargeDistance:650, debrisSpeed:700, debrisKeepOut:210, collectDuration:16, wipeWindup:1.6, enrageSpeed:1.3,
  chainPull:.12, rebukeWindup:2, rebukeActive:.35, rebukeRecovery:.65, safeRadius:150, pushDistance:300, pushDuration:.22 });
// Alternate broad fans; a center branch prevents standing still in a permanent gap.
export const AERGIA_DEBRIS_ANGLES = Object.freeze([Object.freeze([-.9,-.45,0,.45]),Object.freeze([-.45,0,.45,.9])]);
export const aergiaSpeed = (state:RunState) => state.olympus.enraged ? AERGIA_RULES.enrageSpeed : 1;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function createAergiaState(): AergiaState {
  return { number:1, phase:'intro', phaseTime:0, introDuration:AERGIA_RULES.intro, gimmickUsed:false, gimmickCount:0,
    enraged:false,collectDuration:AERGIA_RULES.collectDuration,fragments:[], collected:0, carrying:false, smashHeld:false, controlsLocked:true, action:null, actionTime:0, fired:false,
    queue:[], lastFamily:-1, nextAttack:1.3, angle:Math.PI/2, origin:{x:640,y:180}, destination:{x:640,y:300},
    chainLengths:[], chainCaught:false, grab:null, stunDuration:AERGIA_RULES.stun, smashImpact:false, walkTime:0, dialogue:'', dialogueUntil:0 };
}
export function aergiaDamageFloor(state: RunState): number {
  const o=state.olympus;
  if(!o) return 0;
  if(['intro','centering','sleep','smash','wipe'].includes(o.phase)) return state.boss.hp;
  return o.gimmickUsed ? 0 : state.boss.maxHp*AERGIA_RULES.threshold;
}
function say(state: RunState, line: string, duration=2.3) {
  state.olympus.dialogue=line; state.olympus.dialogueUntil=state.time+duration;
}
function clearAttacks(state: RunState) {
  state.hazards=[]; state.projectiles=[]; state.attacks=[];
  state.boss.pattern=null; state.boss.combo=null; state.boss.raid=null; state.boss.chargePaths=[];
  state.player.swing=null; state.player.charge=0;
}
export function finishAergiaIntro(state: RunState) {
  const o=state.olympus;
  if(!o||o.phase!=='intro')return;
  o.phase='combat'; o.phaseTime=0; o.controlsLocked=false; o.nextAttack=1.1;
  state.boss.x=640; state.boss.y=280; state.boss.state='idle'; state.stageTime=0;
  state.events.push({type:'olympusIntroEnd'}); say(state,'하아… 꼭 일어나야겠어?');
}
export function updateAergiaIntro(state: RunState, input: InputState, dt:number) {
  const o=state.olympus;
  o.phaseTime+=dt; state.time+=dt;
  const t=o.phaseTime;
  state.boss.y=180+100*clamp((t-4.8)/1.5,0,1);
  input.attackPressed=false; input.dodge=false; input.counter=false;
  state.player.attackHeld=!!input.attack;
  if(t>=o.introDuration)finishAergiaIntro(state);
}
function beginSleep(state:RunState) {
  const o=state.olympus;
  o.phase='centering'; o.phaseTime=0;
  o.origin={x:state.boss.x,y:state.boss.y}; o.action=null; o.queue=[]; o.grab=null; o.chainLengths=[];
  o.controlsLocked=false; clearAttacks(state); say(state,'귀찮네, 진짜.',3.1);
  state.events.push({type:'olympusSleep'});
}
function createFragments(state:RunState) {
  const o=state.olympus;
  // A reachable ring, well inside the temple. Fixed slots prevent unlucky overlaps.
  const slots=[[380,245],[640,190],[900,245],[930,475],[640,550],[350,475]];
  o.fragments=slots.map(([x,y],id)=>({id,x,y,delay:.6+id*.48,fall:1.1,landed:false,collected:false}));
  for(const f of o.fragments)spawnHazard(state,{shape:'circle',x:f.x,y:f.y,radius:48,t:-f.delay,windup:f.fall,active:.18,damage:18,
    phase:'warn',pattern:'aergia-rubble',visual:'rubble',sourceX:state.boss.x,sourceY:state.boss.y});
}
function beginAction(state:RunState, action:AergiaAction, dt:number) {
  const o=state.olympus,b=state.boss,p=state.player;
  const speed=aergiaSpeed(state);
  action={...action,windup:action.windup/speed,active:action.active/speed,recovery:action.recovery/speed};
  // A wall-side boss must still leave time to return from the opposite corner.
  if(action.kind==='slam'){
    const x=Math.abs(p.x-b.x),y=Math.abs(p.y-b.y),walk=Math.max(x,y)+(Math.SQRT2-1)*Math.min(x,y);
    const stats=getStats(state),dodge=p.dodgeCooldown<=0&&p.dodgeTime<=0?Math.max(0,stats.dodge.distance-stats.speed*stats.dodge.duration):0;
    action.windup=Math.max(action.windup,(walk-AERGIA_RULES.safeRadius+PLAYER.radius-dodge)/stats.speed+.3);
  }
  o.action=action; o.actionTime=0; o.fired=false; o.origin={x:b.x,y:b.y};
  o.angle=Math.atan2(p.y-b.y,p.x-b.x); b.faceX=Math.cos(o.angle); b.faceY=Math.sin(o.angle);
  b.state='windup'; b.pattern={id:`aergia-${action.kind}`,name:action.kind,windup:action.windup,active:action.active,recover:action.recovery};
  const h:Hazard={x:b.x,y:b.y,sourceX:b.x,sourceY:b.y,angle:o.angle,t:-dt,phase:'warn',windup:action.windup,active:action.active,damage:21,pattern:`aergia-${action.kind}`,visual:action.kind};
  if(action.kind==='sweep'||action.kind==='punish')spawnHazard(state,{...h,shape:'sector',radius:action.kind==='punish'?150:AERGIA_RULES.sweepRange,halfAngle:.95,damage:action.kind==='punish'?28:20});
  if(action.kind==='charge'){
    const dx=Math.cos(o.angle),dy=Math.sin(o.angle);
    const distance=Math.max(0,Math.min(AERGIA_RULES.chargeDistance,
      Math.abs(dx)<1e-9?Infinity:((dx>0?1180:100)-b.x)/dx,
      Math.abs(dy)<1e-9?Infinity:((dy>0?625:130)-b.y)/dy));
    o.destination={x:b.x+dx*distance,y:b.y+dy*distance};
    spawnHazard(state,{...h,shape:'lane',angle:o.angle,width:70,length:Math.hypot(o.destination.x-b.x,o.destination.y-b.y),charge:true,damage:27});
  }
  if(action.kind==='cross'){
    const group={hit:false};
    const offset=action.index===1?Math.PI/4:0;
    for(let i=0;i<4;i++)spawnHazard(state,{...h,shape:'lane',angle:offset+i*Math.PI/2,width:66,length:1100,damage:25,hitGroup:group});
  }
  if(action.kind==='debris')spawnHazard(state,{...h,shape:'circle',radius:AERGIA_RULES.debrisKeepOut,damage:19});
  if(action.kind==='slam')spawnHazard(state,{...h,shape:'field',safe:[{x:b.x,y:b.y,radius:AERGIA_RULES.safeRadius}],damage:55,counterable:false});
  if(action.kind==='chains'){
    o.chainCaught=false; o.chainLengths=[];
    o.angle=Math.atan2(p.y-b.y,p.x-b.x);
    for(let i=0;i<8;i++){
      const angle=o.angle+i*TAU/8,dx=Math.cos(angle),dy=Math.sin(angle);
      o.chainLengths.push(Math.min(dx>0?(ARENA.width-32-b.x)/dx:dx<0?(32-b.x)/dx:Infinity,dy>0?(ARENA.height-32-b.y)/dy:dy<0?(32-b.y)/dy:Infinity));
    }
    say(state,'움직이기 싫은데. 네가 와.');
  }
}
function nextFamily(state:RunState):AergiaAction[] {
  const o=state.olympus;
  const choices=[0,1,2,3].filter(kind=>kind!==o.lastFamily);
  const kind=choices[Math.floor(state.combatRng()*choices.length)];o.lastFamily=kind;
  if(kind===0){
    const combo:AergiaAction[]=[0,1,2].map(index=>({kind:'sweep',index,windup:[.72,.6,.8][index],active:.16,recovery:.2}));
    combo.push({kind:'charge',windup:.95,active:.46,recovery:.35,index:3});return combo;
  }
  if(kind===1){
    const combo:AergiaAction[]=[0,1,2].map(index=>({kind:'debris',index,windup:index===0?.85:.38,active:.1,recovery:.04}));
    combo.push({kind:'slam',windup:1.2,active:.35,recovery:.45});return combo;
  }
  if(kind===2)return [{kind:'chains',windup:1.05,active:.08,recovery:.32}];
  return [{kind:'cross',index:0,windup:1.12,active:.16,recovery:.06},{kind:'cross',index:1,windup:.51,active:.16,recovery:.45}];
}
function updateCombat(state:RunState,dt:number) {
  const o=state.olympus,b=state.boss,p=state.player;
  if(o.grab){
    o.grab.time+=dt; const t=clamp(o.grab.time/(AERGIA_RULES.chainPull/aergiaSpeed(state)),0,1),ease=1-(1-t)*(1-t);
    p.x=o.grab.from.x+(o.grab.to.x-o.grab.from.x)*ease; p.y=o.grab.from.y+(o.grab.to.y-o.grab.from.y)*ease;
    p.dodgeTime=0; o.controlsLocked=true;
    if(t===1){o.grab=null;o.controlsLocked=false;o.action=null;o.queue=[];beginAction(state,{kind:'punish',windup:.68,active:.18,recovery:.45},dt);}
    return;
  }
  o.controlsLocked=false;
  if(!o.action){
    o.nextAttack-=dt;
    const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy);
    if(d>160&&o.nextAttack>.15){const move=Math.min(d-160,53*aergiaSpeed(state)*dt);b.x+=dx/d*move;b.y+=dy/d*move;o.walkTime+=dt*aergiaSpeed(state);b.faceX=dx/d;b.faceY=dy/d;}
    if(o.nextAttack<=0){if(!o.queue.length)o.queue=nextFamily(state);beginAction(state,o.queue.shift(),dt);}
    return;
  }
  const a=o.action; const before=o.actionTime; o.actionTime+=dt;
  b.timer=Math.max(0,a.windup-o.actionTime);
  b.state=o.actionTime<a.windup-1e-9?'windup':o.actionTime<a.windup+a.active?'active':'recover';
  if(o.actionTime>=a.windup-1e-9&&!o.fired){
    o.fired=true;
    if(a.kind==='chains')state.events.push({type:'bossAttack',shape:'lane',bossId:'aergia',kind:a.kind});
    if(a.kind==='debris'){
      const speed=AERGIA_RULES.debrisSpeed*aergiaSpeed(state),life=Math.hypot(ARENA.width,ARENA.height)/speed;
      for(const offset of AERGIA_DEBRIS_ANGLES[(a.index??0)%2]){
        const angle=o.angle+offset;
        state.projectiles.push({owner:'boss',kind:'debris',x:b.x,y:b.y,prevX:b.x,prevY:b.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
          radius:12,life,maxLife:life,damage:19,color:'#ada699'});
      }
    }
    if(a.kind==='cross'||a.kind==='slam'){state.feedback.shake=a.kind==='slam'?1:.7;burst(state,b.x,b.y,a.kind==='slam'?32:18,'#b7a694',260);}
  }
  if(a.kind==='charge'&&o.actionTime>=a.windup){
    const t=clamp((o.actionTime-a.windup)/a.active,0,1);
    b.x=o.origin.x+(o.destination.x-o.origin.x)*t;b.y=o.origin.y+(o.destination.y-o.origin.y)*t;
  }
  if(a.kind==='chains'&&!o.chainCaught&&o.actionTime>=a.windup&&before<a.windup+a.active){
    const t0=clamp((before-a.windup)/a.active,0,1),t1=clamp((o.actionTime-a.windup)/a.active,0,1);
    for(let i=0;i<8;i++){
      const angle=o.angle+i*TAU/8,dx=Math.cos(angle),dy=Math.sin(angle),length=o.chainLengths[i];
      if(segmentHitsCircle(b.x+dx*length*t0,b.y+dy*length*t0,b.x+dx*length*t1,b.y+dy*length*t1,p.x,p.y,PLAYER.radius+9)&&!playerInvulnerable(state)){
        o.chainCaught=true;o.grab={from:{x:p.x,y:p.y},to:{x:clamp(b.x+Math.cos(o.angle)*88,100,1180),y:clamp(b.y+Math.sin(o.angle)*88,130,630)},time:0};
        o.controlsLocked=true;p.dodgeTime=0;p.swing=null;state.attacks=[];say(state,'거기 가만히 있어.');state.events.push({type:'olympusChain'});break;
      }
    }
  }
  if(o.actionTime>=a.windup+a.active+a.recovery&&!o.grab){o.action=null;b.pattern=null;b.state='idle';o.nextAttack=(o.queue.length?.06:.45)/aergiaSpeed(state);}
}
export class AergiaSlumber extends OncePerFightMechanic {
  damageFloor(state:RunState):number { return aergiaDamageFloor(state); }
  update(state:RunState,input:InputState,dt:number):boolean {
  const o=state.olympus,b=state.boss,p=state.player;
  if(!o.gimmickUsed&&b.hp<=b.maxHp*AERGIA_RULES.threshold&&this.claim(state))beginSleep(state);
  if(o.phase==='centering'){
    const t=clamp(o.phaseTime/1.5,0,1),ease=t*t*(3-2*t);
    b.x=o.origin.x+(640-o.origin.x)*ease;b.y=o.origin.y+(350-o.origin.y)*ease;b.state='sleep';
    if(t===1){o.phase='sleep';o.phaseTime=0;createFragments(state);}
  }else if(o.phase==='sleep'){
    o.controlsLocked=false;
    // The deadline is for collecting, not for an extra unannounced smash timer.
    if(!o.carrying&&o.phaseTime>=o.collectDuration){
      o.phase='wipe';o.phaseTime=0;b.state='windup';clearAttacks(state);
      say(state,'기도도, 너도… 전부 귀찮아.',AERGIA_RULES.wipeWindup);state.events.push({type:'olympusWipe'});return true;
    }
    for(const f of o.fragments){
      if(!f.landed&&o.phaseTime>=f.delay+f.fall){f.landed=true;state.feedback.shake=Math.max(state.feedback.shake,.32);burst(state,f.x,f.y,10,'#d7b783',100);}
      // Land first; pickup begins after the damaging impact has ended.
      if(f.landed&&!f.collected&&o.phaseTime>f.delay+f.fall+.22&&Math.hypot(p.x-f.x,p.y-f.y)<AERGIA_RULES.pickupRadius){
        f.collected=true;o.collected++;state.events.push({type:'olympusPickup'});
        if(o.collected===AERGIA_RULES.fragments){o.carrying=true;o.smashHeld=!!input.attack;state.attacks=[];p.swing=null;}
      }
    }
    const fresh=input.attackPressed||(input.attack&&!o.smashHeld);
    if(o.carrying&&fresh&&Math.hypot(p.x-b.x,p.y-b.y)<=AERGIA_RULES.smashRange){
      o.phase='smash';o.phaseTime=0;o.controlsLocked=true;o.smashImpact=false;o.smashHeld=true;state.attacks=[];p.swing=null;
    }
    o.smashHeld=!!input.attack;
  }else if(o.phase==='smash'){
    o.controlsLocked=true;
    if(o.phaseTime>=.55&&!o.smashImpact){
      o.smashImpact=true;o.carrying=false;o.phase='stunned';o.phaseTime=0;b.state='stunned';
      state.feedback.shake=1;state.feedback.melee=1;
      burst(state,b.x,b.y,28,'#e3c49b',280);say(state,'으악! 잠 좀 자자!',2.8);state.events.push({type:'olympusSmash'});
    }
  }else if(o.phase==='stunned'){
    o.controlsLocked=o.phaseTime<.28;
    if(!input.attack)o.smashHeld=false;
    if(o.phaseTime>=o.stunDuration-1e-9){
      o.phase='rebuke';o.phaseTime=0;o.controlsLocked=true;o.enraged=true;o.fired=false;clearAttacks(state);
      const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy);
      o.origin={x:p.x,y:p.y};
      o.destination={x:clamp(p.x+(d?dx/d:0)*AERGIA_RULES.pushDistance,100,1180),y:clamp(p.y+(d?dy/d:1)*AERGIA_RULES.pushDistance,130,625)};
      p.dodgeTime=0;p.guardTime=0;b.state='windup';state.feedback.shake=.65;
      say(state,'귀찮아!',AERGIA_RULES.rebukeWindup+AERGIA_RULES.rebukeActive);state.events.push({type:'olympusEnrage'});
      // World advances hazards later in this step; keep the warning clock aligned with phaseTime.
      spawnHazard(state,{shape:'field',x:b.x,y:b.y,safe:[{x:b.x,y:b.y,radius:AERGIA_RULES.safeRadius}],
        t:-dt,windup:AERGIA_RULES.rebukeWindup,active:AERGIA_RULES.rebukeActive,damage:65,phase:'warn',
        pattern:'aergia-rebuke',visual:'rebuke',counterable:false});
    }
  }else if(o.phase==='rebuke'){
    const push=clamp(o.phaseTime/AERGIA_RULES.pushDuration,0,1);
    if(o.controlsLocked){
      const ease=1-(1-push)**3;
      p.x=o.origin.x+(o.destination.x-o.origin.x)*ease;p.y=o.origin.y+(o.destination.y-o.origin.y)*ease;
      p.dodgeTime=0;o.controlsLocked=push<1;
    }
    if(o.phaseTime>=AERGIA_RULES.rebukeWindup-1e-9&&!o.fired){
      o.fired=true;b.state='active';state.feedback.shake=1;
      burst(state,b.x,b.y,32,'#a3988e',300);
    }
    if(o.phaseTime>=AERGIA_RULES.rebukeWindup+AERGIA_RULES.rebukeActive)b.state='recover';
    if(o.phaseTime>=AERGIA_RULES.rebukeWindup+AERGIA_RULES.rebukeActive+AERGIA_RULES.rebukeRecovery){
      o.phase='combat';o.phaseTime=0;o.controlsLocked=false;o.nextAttack=1.2/aergiaSpeed(state);b.state='idle';
    }
  }else if(o.phase==='wipe'){
    if(o.phaseTime>=AERGIA_RULES.wipeWindup){
      // A failed raid objective is lethal even through dodge invulnerability/shields.
      const damage=p.hp;p.hp=0;state.hitsTaken++;state.feedback.flash=1;state.feedback.shake=1;
      state.events.push({type:'playerHit',damage},{type:'olympusSmash'});b.state='active';
    }
  }else return false;
  if(state.player.hp<=0){o.grab=null;o.controlsLocked=false;}
  return true;
  }
}
export class AergiaEntrance extends BossEntrance {
  update(state:RunState,input:InputState,dt:number):void { updateAergiaIntro(state,input,dt); }
  finish(state:RunState):void { finishAergiaIntro(state); }
}
export class AergiaAttacks extends BossAttackSet {
  update(state:RunState,dt:number):void { updateCombat(state,dt); }
}
export class AergiaEncounter extends BossEncounter {
  createState():AergiaState { return createAergiaState(); }
  readonly definition:BossDefinition = {
    id:'aergia',name:'아에르기아',title:'기도를 외면한 태만의 신',color:'#bd8559',hp:AERGIA_RULES.hp,speed:53,idle:1.2,radius:48,
    patterns:[],special:false,phaseThresholds:[],arena:{name:'응답 없는 기도의 신전',biome:0,motif:'olympus',music:'drums',sound:'stone'}
  };
  constructor(){super(new AergiaEntrance(),new AergiaAttacks(),new AergiaSlumber());}
}

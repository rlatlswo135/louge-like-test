import { BossEncounter, BossEntrance, BossAttackSet, OncePerFightMechanic } from './boss-encounter.mjs';
import { spawnHazard, burst } from './systems/effects.mjs';
import { MOMOS_CLOVER, MOMOS_HEART, MOMOS_SUIT_RADIUS, momosSuitWindup, momosDiamonds } from './momos-shapes.mjs';
export { MOMOS_CLOVER, MOMOS_HEART } from './momos-shapes.mjs';
import { hurtPlayer } from './systems/combat.mjs';
import { cancelPlayerActions } from './systems/player.mjs';
import type { HitTarget } from './boss-encounter.mjs';
import type { RunState as BaseRunState, InputState, BossDefinition, Hazard, Attack } from './types.mjs';
import type { MomosState, MomosAction, CardSuit } from './olympus-types.mjs';
type RunState = BaseRunState & { olympus: MomosState };

export const MOMOS_RULES = Object.freeze({hp:3200,threshold:.5,intro:5.8,stun:2.2,cardHold:.8,shuffle:.85,answer:16,wrongDamage:75,
  daggerCount:18,daggerSpeed:390,bicycleDistance:620,bicycleTravel:.28,blastDelay:.28,blastRadius:155,hammerRadius:72,cloverRadius:MOMOS_SUIT_RADIUS,rearOffset:58,rearRadius:25});

export function createMomosState():MomosState {
  return {number:2,phase:'intro',phaseTime:0,introDuration:MOMOS_RULES.intro,gimmickUsed:false,gimmickCount:0,enraged:false,
    controlsLocked:true,action:null,actionTime:0,fired:false,queue:[],lastFamily:-1,nextAttack:1.1,angle:Math.PI/2,
    origin:{x:640,y:180},destination:{x:640,y:280},walking:false,walkTime:0,dialogue:'',dialogueUntil:0,stunDuration:MOMOS_RULES.stun,
    round:0,successes:0,sequence:[],cards:[],accepted:0,shown:-1,cardArmed:false,answerDuration:MOMOS_RULES.answer,roundCorrect:false,rearOnly:false};
}
function say(state:RunState,line:string,duration=2.2){state.olympus.dialogue=line;state.olympus.dialogueUntil=state.time+duration;}
export class MomosEntrance extends BossEntrance {
  update(state:RunState,input:InputState,dt:number):void {
    const o=state.olympus,before=o.phaseTime;o.phaseTime+=dt;state.time+=dt;
    const out=clamp((o.phaseTime-3.2)/2);state.boss.y=180+100*out*out*(3-2*out);
    input.attackPressed=false;input.dodge=false;input.counter=false;
    if(before<1.2&&o.phaseTime>=1.2)state.events.push({type:'momosEntrance'});
    if(o.phaseTime>=o.introDuration)this.finish(state);
  }
  finish(state:RunState):void {
    const o=state.olympus;if(o.phase!=='intro')return;
    o.phase='combat';o.phaseTime=0;o.controlsLocked=false;o.nextAttack=1.1;
    state.boss.x=640;state.boss.y=280;state.boss.faceX=0;state.boss.faceY=1;state.boss.state='idle';state.stageTime=0;
    say(state,'짠! 오늘의 웃음거리는… 너!');state.events.push({type:'momosEntranceEnd'});
  }
}
const TAU=Math.PI*2;
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
function nextFamily(state:RunState):MomosAction[] {
  const o=state.olympus,choices=[0,1,2,3,4,5,6,7].filter(n=>n!==o.lastFamily);
  const n=choices[Math.floor(state.combatRng()*choices.length)];o.lastFamily=n;
  if(n===0)return [0,1,2,3,4].map(index=>({kind:'daggers',index,windup:index===0?.9:.23,active:.04,recovery:index===4?.45:.03}));
  if(n===1)return [{kind:'bicycle',windup:.9,active:MOMOS_RULES.bicycleTravel,recovery:1.9}];
  if(n===4)return [0,1].map(index=>({kind:'bicycle',index,rush:true,windup:index===0?.75:.42,active:MOMOS_RULES.bicycleTravel,recovery:index===0?.03:.4}));
  if(n===2)return [0,1,2,3,4].map(index=>({kind:'hammer',index,windup:index===0?.72:.55,active:.14,recovery:index===4?.65:.06}));
  if(n===6)return [0,1].map(index=>({kind:'diamond',index,windup:index===0?.95:.78,active:.16,recovery:index===0?.04:.4}));
  if(n===7)return [0,1,2].map(index=>({kind:'spade',index,windup:index===0?.8:.5,active:.14,recovery:index===2?.4:.04}));
  const kind=n===5?'heart':'clover';
  return [{kind,index:0,windup:.85,active:.14,recovery:.04},{kind,index:1,windup:.65,active:.16,recovery:.4}];
}
function beginAction(state:RunState,action:MomosAction,dt:number):void {
  const o=state.olympus,b=state.boss,p=state.player;
  action={...action};
  const suit:Partial<Hazard>=action.kind==='clover'||action.kind==='heart'?{shape:'polygon',x:640,y:365,
    vertices:action.kind==='clover'?MOMOS_CLOVER:MOMOS_HEART,invert:action.kind==='heart'?action.index===0:action.index===1}:null;
  if(suit)action.windup=momosSuitWindup(state,{...suit,windup:action.windup});
  o.action=action;o.actionTime=0;o.fired=false;o.origin={x:b.x,y:b.y};
  if(action.kind!=='daggers'||!action.index)o.angle=Math.atan2(p.y-b.y,p.x-b.x);
  b.faceX=Math.cos(o.angle);b.faceY=Math.sin(o.angle);b.state='windup';
  b.pattern={id:`momos-${action.kind}`,name:action.kind,windup:action.windup,active:action.active,recover:action.recovery};
  const h:Hazard={x:b.x,y:b.y,sourceX:b.x,sourceY:b.y,angle:o.angle,t:-dt,phase:'warn',windup:action.windup,active:action.active,
    damage:23,pattern:`momos-${action.kind}`,visual:action.kind};
  if(action.kind==='bicycle'){
    const dx=b.faceX,dy=b.faceY,d=Math.max(0,Math.min(MOMOS_RULES.bicycleDistance,
      Math.abs(dx)<1e-9?Infinity:((dx>0?1180:100)-b.x)/dx,Math.abs(dy)<1e-9?Infinity:((dy>0?625:130)-b.y)/dy));
    o.destination={x:b.x+dx*d,y:b.y+dy*d};
    spawnHazard(state,{...h,shape:'lane',width:72,length:d,charge:true,damage:26});
    if(!action.rush)spawnHazard(state,{...h,x:o.destination.x,y:o.destination.y,shape:'circle',radius:MOMOS_RULES.blastRadius,
      windup:action.windup+action.active+MOMOS_RULES.blastDelay,active:.22,damage:36,visual:'bicycle-blast',counterable:false});
  }else if(action.kind==='hammer'){
    o.destination={x:clamp(p.x,100,1180),y:clamp(p.y,130,625)};
    spawnHazard(state,{...h,...o.destination,shape:'circle',radius:MOMOS_RULES.hammerRadius,damage:23});
  }else if(suit)spawnHazard(state,{...h,...suit,damage:action.index===1?38:28,counterable:false});
  else if(action.kind==='diamond')for(const diamond of momosDiamonds(action.index,h))spawnHazard(state,diamond);
  else if(action.kind==='spade')spawnHazard(state,{...h,shape:'lane',length:1100,width:88,distance:clamp(Math.hypot(p.x-b.x,p.y-b.y),120,700),damage:29,counterable:false});
}
function releaseWheels(state:RunState,dt:number):void {
  const b=state.boss,p=state.player,aim=Math.atan2(p.y-b.y,p.x-b.x),reach=clamp(Math.hypot(p.x-b.x,p.y-b.y),150,300);
  for(let wheel=0;wheel<2;wheel++){
    const angle=aim+(wheel?1:-1)*.36;let from={x:b.x,y:b.y},delay=wheel*.14;
    for(let bounce=0;bounce<3;bounce++){
      const distance=reach+bounce*115,flight=[.52,.42,.36][bounce];
      const x=clamp(b.x+Math.cos(angle)*distance,100,1180),y=clamp(b.y+Math.sin(angle)*distance,130,625);
      spawnHazard(state,{shape:'circle',x,y,sourceX:from.x,sourceY:from.y,radius:66-bounce*6,
        t:-dt-delay,windup:flight,active:.12,phase:'warn',damage:26-bounce*3,counterable:false,
        pattern:'momos-wheel',visual:'wheel-bomb',volleyIndex:wheel,sequenceIndex:bounce,delay});
      from={x,y};delay+=flight;
    }
  }
}
export class MomosAttacks extends BossAttackSet {
  update(state:RunState,dt:number):void {
    const o=state.olympus,b=state.boss,p=state.player;o.walking=false;
    if(!o.action){
      const room=MOMOS_RULES.rearOffset+MOMOS_RULES.rearRadius+8;
      const inset=(x:number,y:number)=>({x:clamp(x,100+room,1180-room),y:clamp(y,130+room,625-room)});
      const safe=inset(b.x,b.y),gap=Math.hypot(safe.x-b.x,safe.y-b.y);
      // Finish committed combos first; never turn a rear-only weakpoint into an unreachable wall.
      if(o.rearOnly&&!o.queue.length&&gap>1e-6){
        const move=Math.min(1,210*dt/gap);b.x+=(safe.x-b.x)*move;b.y+=(safe.y-b.y)*move;
        o.walking=true;o.walkTime+=dt;o.nextAttack=Math.max(o.nextAttack,.3);return;
      }
      o.nextAttack-=dt;const dx=p.x-b.x,dy=p.y-b.y,d=Math.hypot(dx,dy);
      if(d>190&&o.nextAttack>.16){
        const step=Math.min(d-190,78*dt);b.x+=dx/d*step;b.y+=dy/d*step;
        if(o.rearOnly)Object.assign(b,inset(b.x,b.y));
        b.faceX=dx/d;b.faceY=dy/d;o.walking=true;o.walkTime+=dt;
      }
      if(o.nextAttack<=0){if(!o.queue.length)o.queue=nextFamily(state);beginAction(state,o.queue.shift(),dt);}return;
    }
    const a=o.action;o.actionTime+=dt;b.timer=Math.max(0,a.windup-o.actionTime);
    b.state=o.actionTime<a.windup-1e-9?'windup':o.actionTime<a.windup+a.active?'active':'recover';
    if(a.kind==='hammer'){
      const t=clamp(o.actionTime/a.windup),s=t*t*(3-2*t);
      b.x=o.origin.x+(o.destination.x-o.origin.x)*s;b.y=o.origin.y+(o.destination.y-o.origin.y)*s;
    }
    if(a.kind==='bicycle'&&o.actionTime>=a.windup){
      const t=clamp((o.actionTime-a.windup)/a.active);
      b.x=o.origin.x+(o.destination.x-o.origin.x)*t;b.y=o.origin.y+(o.destination.y-o.origin.y)*t;
    }
    if(a.kind==='bicycle'&&!a.rush&&o.actionTime>=a.windup+a.active+MOMOS_RULES.blastDelay-1e-9&&state.hazards.some(h=>h.visual==='bicycle-blast'&&h.phase==='warn'))releaseWheels(state,dt);
    if(!o.fired&&o.actionTime>=a.windup-1e-9){
      o.fired=true;
      if(a.kind==='daggers'){
        const life=4,speed=MOMOS_RULES.daggerSpeed;
        for(let i=0;i<MOMOS_RULES.daggerCount;i++){
          const angle=o.angle+i*TAU/MOMOS_RULES.daggerCount+(a.index??0)*.1;
          state.projectiles.push({owner:'boss',kind:'momos-dagger',x:b.x,y:b.y,prevX:b.x,prevY:b.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
            radius:6,life,maxLife:life,damage:13,color:'#c5b8a1'});
        }
        state.events.push({type:'bossAttack',bossId:'momos',kind:'daggers'});
      }
      if(a.kind==='hammer'||a.kind==='clover'||a.kind==='heart'){
        state.feedback.shake=a.kind==='hammer'?.45:.6;burst(state,b.x,b.y,12,'#b59a78',180);
      }
    }
    if(o.actionTime>=a.windup+a.active+a.recovery){o.action=null;b.pattern=null;b.state='idle';o.nextAttack=o.queue.length?.06:.55;}
  }
}
export const MOMOS_SUITS=Object.freeze({heart:{symbol:'♥',name:'하트',color:'#ca887b'},diamond:{symbol:'♦',name:'다이아몬드',color:'#ca887b'},
  club:{symbol:'♣',name:'클로버',color:'#cad1bd'},spade:{symbol:'♠',name:'스페이드',color:'#cad1bd'}});
function clearAttacks(state:RunState):void {
  state.hazards=[];state.projectiles=[];state.attacks=[];cancelPlayerActions(state);
  state.boss.pattern=null;state.boss.combo=null;state.boss.raid=null;state.boss.chargePaths=[];
  state.olympus.action=null;state.olympus.queue=[];
}
function shuffled(state:RunState):CardSuit[] {
  const suits:CardSuit[]=['heart','diamond','club','spade'];
  for(let i=suits.length-1;i>0;i--){const j=Math.floor(state.combatRng()*(i+1));[suits[i],suits[j]]=[suits[j],suits[i]];}return suits;
}
function showQuestion(state:RunState):void {
  const o=state.olympus,sequence=shuffled(state);clearAttacks(state);
  if(sequence.every((s,i)=>s===o.sequence[i]))sequence.push(sequence.shift());
  o.sequence=sequence;o.phase='cards-show';o.phaseTime=0;o.round++;o.accepted=0;o.shown=-1;o.cardArmed=false;o.roundCorrect=false;
  const slots=[[350,365],[540,510],[740,365],[930,510]];
  o.cards=shuffled(state).map((suit,i)=>({suit,x:slots[i][0],y:slots[i][1],struck:false}));
  say(state,o.round===1?'눈 크게 떠! 머리는 장식 아니지?':'한 번 더! 이번엔 안 봐준다?',2.5);
}
function endQuestion(state:RunState,correct:boolean,timeout=false):void {
  const o=state.olympus;o.roundCorrect=correct;o.cardArmed=false;o.phase='cards-result';o.phaseTime=0;
  if(correct){o.successes++;say(state,'어라? 그걸 기억했어?!',1.2);state.events.push({type:'momosCardCorrect',final:true});}
  else {hurtPlayer(state,MOMOS_RULES.wrongDamage);say(state,timeout?'생각하다 해 뜨겠다!':'땡! 박수 대신 이거나 받아!',1.2);state.events.push({type:'momosCardWrong'});}
}
export function momosRearTarget(state:BaseRunState):HitTarget {
  const b=state.boss;return {x:b.x-b.faceX*MOMOS_RULES.rearOffset,y:b.y-b.faceY*MOMOS_RULES.rearOffset,r:MOMOS_RULES.rearRadius};
}
export class MomosCards extends OncePerFightMechanic {
  damageFloor(state:RunState):number {
    const o=state.olympus;
    if(o.phase!=='combat'&&o.phase!=='stunned')return state.boss.hp;
    return o.gimmickUsed?0:state.boss.maxHp*MOMOS_RULES.threshold;
  }
  update(state:RunState,input:InputState,_dt:number):boolean {
    const o=state.olympus,b=state.boss;
    if(!o.gimmickUsed&&b.hp<=b.maxHp*MOMOS_RULES.threshold&&this.claim(state)){
      clearAttacks(state);o.phase='centering';o.phaseTime=0;o.origin={x:b.x,y:b.y};o.controlsLocked=false;
      say(state,'잠깐! 관객 참여 시간!',2.2);state.events.push({type:'momosCardsBegin'});
    }
    if(o.phase==='centering'){
      const t=clamp(o.phaseTime/.7);b.x=o.origin.x+(640-o.origin.x)*t;b.y=o.origin.y+(245-o.origin.y)*t;
      b.faceX=0;b.faceY=1;if(t===1)showQuestion(state);
    }else if(o.phase==='cards-show'){
      const shown=Math.floor(o.phaseTime/MOMOS_RULES.cardHold);
      if(shown<4&&shown!==o.shown){o.shown=shown;state.events.push({type:'momosCardShow',count:shown+1});}
      if(o.phaseTime>=4*MOMOS_RULES.cardHold-1e-9){o.phase='cards-shuffle';o.phaseTime=0;state.events.push({type:'momosShuffle'});}
    }else if(o.phase==='cards-shuffle'){
      if(o.phaseTime>=MOMOS_RULES.shuffle-1e-9){o.phase='cards-answer';o.phaseTime=0;o.cardArmed=!input.attack;clearAttacks(state);say(state,'자, 보여준 순서대로 쳐 봐!',2.3);}
    }else if(o.phase==='cards-answer'){
      if(!input.attack)o.cardArmed=true;
      if(o.phaseTime>=o.answerDuration)endQuestion(state,false,true);
    }else if(o.phase==='cards-result'){
      if(o.phaseTime>=.85){
        if(o.round<2)showQuestion(state);
        else{
          clearAttacks(state);o.cards=[];o.phaseTime=0;
          if(o.successes===2){o.rearOnly=true;o.phase='stunned';b.state='stunned';say(state,'내 등은 보지 마! 거긴 대본에 없어!',3.2);state.events.push({type:'momosRearOpen'});}
          else{o.phase='combat';b.state='idle';o.nextAttack=1; say(state,'좋아, 시험 끝! 이제 맞을 차례!',2.3);}
        }
      }
    }else if(o.phase==='stunned'){
      if(o.phaseTime>=o.stunDuration-1e-9){o.phase='combat';o.phaseTime=0;o.nextAttack=.7;b.state='idle';}
    }else return false;
    return true;
  }
  strikeTargets(state:RunState,hitTest:(target:HitTarget)=>boolean,attack:Attack):number {
    const o=state.olympus;if(o.phase!=='cards-answer'||!o.cardArmed||attack.secondary)return 0;
    const struck=o.cards.filter(c=>!c.struck&&hitTest({...c,r:34}));if(!struck.length)return 0;
    o.cardArmed=false;
    for(const c of struck)c.struck=true;
    if(struck.length!==1||struck[0].suit!==o.sequence[o.accepted])endQuestion(state,false);
    else{
      o.accepted++;burst(state,struck[0].x,struck[0].y,10,'#c7cfa7',90);
      if(o.accepted===4)endQuestion(state,true);else state.events.push({type:'momosCardCorrect',count:o.accepted});
    }
    return struck.length;
  }
}
export class MomosEncounter extends BossEncounter {
  createState():MomosState{return createMomosState();}
  readonly definition:BossDefinition={id:'momos',name:'모모스',title:'비난과 조롱의 가면',color:'#b59978',hp:MOMOS_RULES.hp,speed:78,idle:.65,radius:36,
    patterns:[],special:false,phaseThresholds:[],arena:{name:'웃음이 끊긴 폐극장',biome:0,motif:'olympus',music:'abyss',sound:'wood'}};
  constructor(){super(new MomosEntrance(),new MomosAttacks(),new MomosCards());}
  hitTarget(state:RunState):HitTarget {return state.olympus.rearOnly?momosRearTarget(state):super.hitTarget(state);}
  blocksMovement(state:RunState):boolean {
    const o=state.olympus,a=o.action;return a?.kind!=='hammer'||o.actionTime>=a.windup-1e-9;
  }
  canHit(state:RunState,attack?:Attack):boolean {
    if(!state.olympus.rearOnly)return true;
    const b=state.boss,x=attack?.originX??attack?.x??state.player.x,y=attack?.originY??attack?.y??state.player.y;
    return (x-b.x)*b.faceX+(y-b.y)*b.faceY < -b.def.radius*.35;
  }
}

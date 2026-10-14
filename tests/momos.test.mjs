import test from 'node:test';
import assert from 'node:assert/strict';
import {createOlympusRun} from '../public/src/olympus.mjs';
import {encounterFor} from '../public/src/olympus-encounters.mjs';
import {createInput} from '../public/src/game.mjs';
import {MOMOS_RULES} from '../public/src/momos.mjs';
import {hazardHitsCircle} from '../public/src/systems/geometry.mjs';
import {hitBoss,queueAttack} from '../public/src/systems/combat.mjs';
import {createOlympusView,resizeOlympus,renderOlympus,screenToOlympus,worldToOlympus} from '../public/src/olympus-render.mjs';
import {momosPose} from '../public/src/momos-render.mjs';

const advance=(r,seconds,input=createInput())=>{for(let i=0;i<Math.ceil(seconds*60);i++)r.step(input);};
function fight(seed=31){const r=createOlympusRun(2,seed);encounterFor(r).entrance.finish(r);return r;}
function family(r,n){const rng=r.combatRng;r.combatRng=()=>(n+.5)/8;r.olympus.lastFamily=-1;r.olympus.nextAttack=0;r.step(createInput());r.combatRng=rng;}

test('02 opens its own protected entrance and combat, without changing 01',()=>{
  const r=createOlympusRun(2),one=createOlympusRun(1);
  assert.equal(r.boss.def.id,'momos');assert.equal(r.olympus.number,2);
  assert.equal(r.olympus.phase,'intro');assert.equal(r.stageTime,0);
  const hp=r.player.hp;advance(r,2,{...createInput(),up:true,attack:true});
  assert.equal(r.player.hp,hp);assert.equal(r.player.y,580);assert.equal(r.stageTime,0);
  encounterFor(r).entrance.finish(r);assert.equal(r.olympus.phase,'combat');
  assert.equal(r.olympus.controlsLocked,false);assert.equal(one.boss.def.id,'aergia');
  assert.notEqual(r.olympus,createOlympusRun(2).olympus);
});

test('radial knives fire five rotating waves, never before their warning',()=>{
  const r=fight();r.player.hp=1e6;family(r,0);assert.equal(r.olympus.action.kind,'daggers');
  advance(r,r.olympus.action.windup-1/60);assert.equal(r.projectiles.length,0);r.step(createInput());
  assert.equal(r.projectiles.length,MOMOS_RULES.daggerCount);
  assert.equal(new Set(r.projectiles.map(q=>Math.atan2(q.vy,q.vx).toFixed(4))).size,MOMOS_RULES.daggerCount);
  for(const q of r.projectiles)assert.ok(Math.abs(Math.hypot(q.vx,q.vy)-MOMOS_RULES.daggerSpeed)<1e-8);
  for(let i=0;i<240&&(r.olympus.action||r.olympus.queue.length);i++)r.step(createInput());
  assert.equal(r.events.filter(e=>e.type==='bossAttack'&&e.kind==='daggers').length,5);
});
test('bicycle locks its straight path and explodes only after reaching the warned endpoint',()=>{
  const r=fight();family(r,1);assert.equal(r.olympus.action.kind,'bicycle');
  const end={...r.olympus.destination},lane=r.hazards.find(h=>h.charge),blast=r.hazards.find(h=>h.visual==='bicycle-blast');
  assert.deepEqual({x:blast.x,y:blast.y},end);assert.equal(blast.radius,MOMOS_RULES.blastRadius);
  r.player.x=300;r.player.y=500;const hp=r.player.hp;
  advance(r,lane.windup+lane.active);assert.ok(Math.hypot(r.boss.x-end.x,r.boss.y-end.y)<1e-6);
  assert.equal(blast.phase,'warn');assert.equal(r.player.hp,hp);
  r.player.x=end.x-100;r.player.y=end.y;advance(r,.42);assert.equal(blast.phase,'active');assert.ok(r.player.hp<hp);
  const hits=r.hitsTaken;advance(r,.2);assert.equal(r.hitsTaken,hits);
});
test('faster bicycle sheds two wheels that land and burst three times at their locked marks',()=>{
  const r=fight();r.player.hp=1e6;family(r,1);const a=r.olympus.action,end={...r.olympus.destination};
  assert.ok(a.active<=.28,'faster than the old .46 second travel');
  advance(r,a.windup+a.active+.2);assert.equal(r.hazards.filter(h=>h.visual==='wheel-bomb').length,0);
  for(let i=0;i<30&&!r.hazards.some(h=>h.visual==='wheel-bomb');i++)r.step(createInput());
  const wheels=r.hazards.filter(h=>h.visual==='wheel-bomb');assert.equal(wheels.length,6);
  for(const side of [0,1]){
    const path=wheels.filter(h=>h.volleyIndex===side).sort((a,b)=>a.sequenceIndex-b.sequenceIndex);
    assert.equal(path.length,3);let from=end;
    for(const h of path){assert.deepEqual({x:h.sourceX,y:h.sourceY},from);assert.ok(h.x>=100&&h.x<=1180&&h.y>=130&&h.y<=625);from={x:h.x,y:h.y};}
  }
  const locked=wheels.map(h=>[h.x,h.y]);r.player.x=110;r.player.y=140;
  for(let i=0;i<150&&(r.olympus.action||r.hazards.length);i++)r.step(createInput());
  assert.deepEqual(wheels.map(h=>[h.x,h.y]),locked);
  assert.equal(r.events.filter(e=>e.type==='bossAttack'&&e.kind==='wheel-bomb').length,6);
  assert.equal(r.hazards.length,0);
});
test('card transition, death and victory cancel deferred wheel landings',()=>{
  for(const end of ['cards','death','victory']){
    const r=fight();family(r,1);advance(r,1.5);
    assert.ok(r.hazards.some(h=>h.visual==='wheel-bomb'&&h.t<0));
    if(end==='cards')hitBoss(r,1e5,'white');
    else if(end==='death')r.player.hp=0;
    else {r.olympus.gimmickUsed=true;hitBoss(r,1e5,'white');}
    r.step(createInput());assert.equal(r.hazards.length,0);
    assert.equal(r.projectiles.length,0);
    assert.equal(end==='cards'?r.olympus.phase:r.status,end==='cards'?'centering':end==='death'?'dead':'won');
  }
});
test('double bicycle reacquires and locks a quick second charge without explosion decoys',()=>{
  const r=fight();r.player.hp=1e6;family(r,4);
  assert.equal(r.olympus.action.kind,'bicycle');assert.equal(r.olympus.action.rush,true);
  const first=r.olympus.action,end={...r.olympus.destination};r.player.x=360;r.player.y=350;
  advance(r,first.windup+first.active);assert.ok(Math.hypot(r.boss.x-end.x,r.boss.y-end.y)<1e-6);
  for(let i=0;i<60&&r.olympus.action?.index!==1;i++)r.step(createInput());
  const second=r.olympus.action;assert.equal(second.index,1);assert.ok(second.windup<=.42&&second.active<=.28);
  const expected=Math.atan2(r.player.y-r.boss.y,r.player.x-r.boss.x);assert.ok(Math.abs(expected-r.olympus.angle)<1e-9);
  const locked={...r.olympus.destination};r.player.x=1000;r.player.y=480;advance(r,second.windup+second.active);
  assert.ok(Math.hypot(r.boss.x-locked.x,r.boss.y-locked.y)<1e-6);
  assert.equal(r.events.filter(e=>e.type==='bossAttack'&&e.kind==='bicycle').length,2);
  assert.equal(r.events.some(e=>['bicycle-blast','wheel-bomb'].includes(e.kind)),false);
  assert.equal(r.hazards.some(h=>['bicycle-blast','wheel-bomb'].includes(h.visual)),false);
});
test('hammer follows five freshly locked landing circles, not a moving target',()=>{
  const r=fight();r.player.hp=1e6;family(r,2);assert.equal(r.olympus.action.kind,'hammer');
  const landing={...r.olympus.destination},first=r.hazards[0];r.player.x=300;r.player.y=400;
  advance(r,.3);assert.deepEqual({x:first.x,y:first.y},landing);
  const landings=[];let last;
  for(let i=0;i<360&&(r.olympus.action||r.olympus.queue.length);i++){
    const a=r.olympus.action;if(a&&a!==last){landings.push(a.index);last=a;}r.step(createInput());
  }
  assert.deepEqual(landings,[0,1,2,3,4]);
  assert.equal(r.events.filter(e=>e.type==='bossAttack'&&e.kind==='hammer').length,5);
});
test('the airborne hammer body cannot pin native-style walking under the next landing marker',()=>{
  for(const [x,y] of [[640,580],[100,130],[1180,625]]){
    const r=fight();r.player.x=x;r.player.y=y;family(r,2);const hp=r.player.hp;
    for(let index=0;index<5;index++){
      advance(r,.2);const p=r.player;
      const directions=[['left',p.x-100],['right',1180-p.x],['up',p.y-130],['down',625-p.y]].sort((a,b)=>b[1]-a[1]);
      const input={...createInput(),[directions[0][0]]:true};
      for(let n=0;n<130&&(r.olympus.action?.index===index||!r.olympus.action&&r.olympus.queue.length>0);n++)r.step(input);
      assert.equal(r.player.hp,hp,`start ${x},${y}, hammer ${index+1}`);
    }
  }
});
test('clover uses one actual outline for inside-first and outside-second collision',()=>{
  const r=fight();r.player.hp=1e6;family(r,3);
  const inner=r.hazards[0];assert.equal(inner.shape,'polygon');assert.equal(inner.invert,false);
  assert.equal(hazardHitsCircle(inner,640,365,16),true);assert.equal(hazardHitsCircle(inner,1100,600,16),false);
  for(let i=0;i<240&&r.olympus.action?.index!==1;i++)r.step(createInput());
  const outer=r.hazards.find(h=>h.invert);assert.ok(outer);assert.deepEqual(outer.vertices,inner.vertices);
  assert.equal(hazardHitsCircle(outer,640,365,16),false);assert.equal(hazardHitsCircle(outer,1100,600,16),true);
  for(const p of inner.vertices){assert.equal(hazardHitsCircle(inner,p.x,p.y,16),true);assert.equal(hazardHitsCircle(outer,p.x,p.y,16),true);}
});

test('clover switches faster at its edge; heart reverses the safe and dangerous sides',()=>{
  for(const [n,kind,inverted] of [[3,'clover',false],[5,'heart',true]]){
    const r=fight();r.player.hp=1e6;r.player.x=640;r.player.y=365;family(r,n);
    assert.equal(r.olympus.action.kind,kind);assert.ok(r.olympus.action.windup<=.85);
    const first=r.hazards[0];assert.equal(first.invert,inverted);
    assert.equal(hazardHitsCircle(first,640,365,16),!inverted);
    assert.equal(hazardHitsCircle(first,1100,600,16),inverted);
    r.player.x=940;r.player.y=430;
    for(let i=0;i<180&&r.olympus.action?.index!==1;i++)r.step(createInput());
    const second=r.hazards.find(h=>h.visual===kind);assert.ok(second);
    assert.equal(second.invert,!inverted);assert.deepEqual(second.vertices,first.vertices);
    assert.ok(second.windup<.9,'nearby edge must not require a slow trip to the shape center');
  }
});

test('diamond lattices leave full-foot gaps, shift those gaps, and deal one hit for overlaps',()=>{
  const r=fight();r.player.hp=1e6;r.player.x=190;r.player.y=130;family(r,6);
  assert.equal(r.olympus.action.kind,'diamond');const first=[...r.hazards];assert.equal(first.length,28);
  assert.ok(first.every(h=>h.shape==='polygon'&&h.vertices.length===4));
  assert.ok(first.every(h=>!hazardHitsCircle(h,190,212.5,16)),'visible hole must fit the whole player');
  assert.ok(first.filter(h=>hazardHitsCircle(h,190,130,16)).length>=2);
  advance(r,r.olympus.action.windup+1/60);assert.equal(r.hitsTaken,1,'overlap is not stacked damage');
  for(let i=0;i<120&&r.olympus.action?.index!==1;i++)r.step(createInput());
  const second=r.hazards.filter(h=>h.visual==='diamond');assert.equal(second.length,32);
  assert.ok(second.some(h=>hazardHitsCircle(h,190,212.5,16)),'old hole becomes danger');
  assert.ok(second.every(h=>!hazardHitsCircle(h,100,130,16)),'new hole remains reachable');
});

test('three spade execution lances lock separately and allow lateral walking after reaction',()=>{
  const r=fight();r.player.x=640;r.player.y=500;family(r,7);const hp=r.player.hp;
  assert.equal(r.olympus.action.kind,'spade');
  for(let index=0;index<3;index++){
    const a=r.olympus.action,h=r.hazards.find(h=>h.visual==='spade');assert.equal(a.index,index);
    assert.equal(h.shape,'lane');assert.equal(h.width,88);
    const angle=h.angle;advance(r,.2);const left={x:-Math.sin(angle),y:Math.cos(angle)};
    const side=r.player.x+left.x*120<110||r.player.x+left.x*120>1170||r.player.y+left.y*120<140||r.player.y+left.y*120>615?-1:1;
    const input={...createInput(),left:left.x*side<-.38,right:left.x*side>.38,up:left.y*side<-.38,down:left.y*side>.38};
    for(let n=0;n<100&&(r.olympus.action===a||!r.olympus.action&&r.olympus.queue.length);n++)r.step(input);
    assert.equal(h.angle,angle);assert.equal(r.player.hp,hp,`lance ${index+1}`);
  }
  assert.equal(r.events.filter(e=>e.type==='bossAttack'&&e.kind==='spade').length,3);
});

function until(r,phase){for(let i=0;i<800&&r.olympus.phase!==phase;i++)r.step(createInput());assert.equal(r.olympus.phase,phase);}
function cards(seed=31){const r=fight(seed);hitBoss(r,1e5,'white');r.step(createInput());until(r,'cards-answer');return r;}
function strike(r,suit,release=true){
  const c=r.olympus.cards.find(c=>c.suit===suit);r.player.x=c.x;r.player.y=c.y+75;r.player.attackCooldown=0;
  const input={...createInput(),aimX:c.x,aimY:c.y,attack:true,attackPressed:true};advance(r,.25,input);
  if(release)r.step(createInput());return input;
}
function solve(r){for(const suit of [...r.olympus.sequence])strike(r,suit);}

test('half HP cancels live attacks, shows all four suits, shuffles and waits for real strikes',()=>{
  const r=fight();family(r,0);advance(r,.92);assert.ok(r.projectiles.length);
  hitBoss(r,1e5,'white');assert.equal(r.boss.hp,r.boss.maxHp/2);r.step(createInput());
  assert.equal(r.olympus.gimmickCount,1);assert.equal(r.projectiles.length,0);assert.equal(r.hazards.length,0);
  until(r,'cards-answer');const o=r.olympus;
  assert.equal(o.round,1);assert.equal(new Set(o.sequence).size,4);assert.equal(new Set(o.cards.map(c=>c.suit)).size,4);
  assert.equal(r.events.filter(e=>e.type==='momosCardShow').length,4);
  const hp=r.boss.hp;hitBoss(r,1000,'white');assert.equal(r.boss.hp,hp);
  assert.deepEqual(o.sequence,cards().olympus.sequence);assert.notEqual(o.sequence,cards().olympus.sequence);
  strike(r,o.sequence[0]);assert.equal(o.accepted,1);assert.equal(o.cards.filter(c=>c.struck).length,1);
});
test('two solved questions give a short stun then permanent marked rear-only damage',()=>{
  const r=cards();solve(r);assert.equal(r.olympus.successes,1);until(r,'cards-answer');assert.equal(r.olympus.round,2);
  solve(r);until(r,'stunned');assert.equal(r.olympus.successes,2);assert.equal(r.olympus.rearOnly,true);
  advance(r,MOMOS_RULES.stun-1/60);assert.equal(r.olympus.phase,'stunned');r.step(createInput());
  assert.equal(r.olympus.phase,'combat');assert.equal(r.olympus.rearOnly,true);
  advance(r,1);assert.equal(r.olympus.gimmickCount,1);
});
test('wrong card immediately deals one large hit and moves to question two without replaying question one',()=>{
  const r=cards(),hp=r.player.hp;strike(r,r.olympus.sequence[1]);
  assert.equal(r.hitsTaken,1);assert.ok(hp-r.player.hp>=55);assert.equal(r.olympus.phase,'cards-result');
  until(r,'cards-answer');assert.equal(r.olympus.round,2);solve(r);until(r,'combat');
  assert.equal(r.olympus.successes,1);assert.equal(r.olympus.rearOnly,false);assert.equal(r.olympus.gimmickCount,1);
});
test('timeout advances each question once; a lethal mistake cancels all further questions',()=>{
  const r=cards();advance(r,MOMOS_RULES.answer+.05);assert.equal(r.hitsTaken,1);until(r,'cards-answer');
  r.player.hp=1;advance(r,MOMOS_RULES.answer+.05);assert.equal(r.status,'dead');
  const snapshot=JSON.stringify(r.olympus);advance(r,20);assert.equal(JSON.stringify(r.olympus),snapshot);
  assert.equal(r.hazards.length+r.projectiles.length+r.attacks.length,0);
});
test('held combat clicks cannot solve cards, and each accepted card needs a released gesture',()=>{
  const r=fight();hitBoss(r,1e5,'white');const held={...createInput(),attack:true,attackPressed:true};advance(r,5,held);
  assert.equal(r.olympus.phase,'cards-answer');assert.equal(r.olympus.cardArmed,false);
  const c=r.olympus.cards.find(c=>c.suit===r.olympus.sequence[0]);r.player.x=c.x;r.player.y=c.y+75;held.aimX=c.x;held.aimY=c.y;
  advance(r,1,held);assert.equal(r.olympus.accepted,0);r.step(createInput());
  const pressing=strike(r,r.olympus.sequence[0],false);assert.equal(r.olympus.accepted,1);
  const next=r.olympus.cards.find(c=>c.suit===r.olympus.sequence[1]);r.player.x=next.x;r.player.y=next.y+75;pressing.aimX=next.x;pressing.aimY=next.y;
  advance(r,.8,pressing);assert.equal(r.olympus.accepted,1);r.step(createInput());strike(r,next.suit);assert.equal(r.olympus.accepted,2);
});
test('rear weakpoint blocks front and side strikes, including oversized areas, but accepts actual rear melee',()=>{
  const r=fight();r.olympus.gimmickUsed=true;r.olympus.rearOnly=true;r.olympus.nextAttack=999;
  r.boss.faceX=0;r.boss.faceY=1;const b=r.boss,hp=b.hp;
  const target=encounterFor(r).hitTarget(r);assert.deepEqual(target,{x:b.x,y:b.y-MOMOS_RULES.rearOffset,r:MOMOS_RULES.rearRadius});
  for(const [dx,dy] of [[0,95],[95,0],[-95,0]]){
    r.player.x=b.x+dx;r.player.y=b.y+dy;
    queueAttack(r,{kind:'melee',shape:'circle',x:b.x,y:b.y,radius:400,originX:r.player.x,originY:r.player.y,t:0,windup:0,active:.1,damage:100});r.step(createInput());
    assert.equal(b.hp,hp);assert.equal(r.player.hitCount,0);
  }
  r.player.x=b.x;r.player.y=b.y-95;r.player.attackCooldown=0;
  advance(r,.2,{...createInput(),aimX:target.x,aimY:target.y,attack:true,attackPressed:true});assert.ok(b.hp<hp);
});
test('rear-only boss steps away from corners before its next family so the weakpoint stays reachable',()=>{
  for(const [x,y] of [[100,130],[1180,130],[100,625],[1180,625]]){
    const r=fight();r.olympus.rearOnly=true;r.olympus.gimmickUsed=true;r.olympus.nextAttack=.01;r.boss.x=x;r.boss.y=y;
    const angle=Math.atan2(360-y,640-x);r.boss.faceX=Math.cos(angle);r.boss.faceY=Math.sin(angle);
    advance(r,.8);const target=encounterFor(r).hitTarget(r);
    assert.ok(target.x-target.r>=100&&target.x+target.r<=1180&&target.y-target.r>=130&&target.y+target.r<=625,`${x},${y}: ${JSON.stringify(target)}`);
  }
});
test('projectiles cannot penetrate from the front into the rear weakpoint',()=>{
  const r=fight();r.olympus.rearOnly=true;r.olympus.gimmickUsed=true;r.olympus.nextAttack=999;
  const b=r.boss,hp=b.hp;r.player.x=b.x;r.player.y=b.y+95;b.faceX=0;b.faceY=1;
  for(const side of [1,-1]){
    const y=b.y+side*150;r.projectiles.push({owner:'player',kind:'arrow',x:b.x,y,prevX:b.x,prevY:y,originX:b.x,originY:y,vx:0,vy:-side*400,radius:5,life:.6,maxLife:.6,damage:33});
    advance(r,.7);assert.equal(b.hp,side===1?hp:hp-33);
  }
});
test('normal families are deterministic per seed, non-repeating and bounded through long playback',()=>{
  function sample(seed){
    const r=fight(seed),families=[];r.player.hp=1e6;let last;
    for(let i=0;i<12000&&families.length<16;i++){
      r.step(createInput());const a=r.olympus.action;
      if(a&&a!==last&&!a.index){families.push(r.olympus.lastFamily);last=a;}
      assert.ok(r.projectiles.length<=90&&r.hazards.length<=32&&r.particles.length<200);
    }
    assert.equal(families.length,16);assert.ok(new Set(families).size>=6);
    for(let i=1;i<families.length;i++)assert.notEqual(families[i],families[i-1]);return families;
  }
  assert.deepEqual(sample(31),sample(31));assert.notDeepEqual(sample(31),sample(82));
});
test('Momos portrait reveal hides the world body until the zoom-out transition',()=>{
  const images=[],ctx=new Proxy({globalAlpha:1,measureText:()=>({width:140}),drawImage:image=>images.push(image)},{get:(o,k)=>o[k]??(['createRadialGradient','createLinearGradient'].includes(k)?()=>({addColorStop(){}}):()=>{})});
  const boss={},hero={},mask={},frames=Array.from({length:16},()=>({x:0,y:0,w:100,h:100,pivot:50}));
  const view=createOlympusView({getContext:()=>ctx},{boss:{image:boss,unit:1,frames},hero:{image:hero,unit:1,frames},floor:{image:{}},mask:{image:mask}});
  resizeOlympus(view,1365,768,1);const r=createOlympusRun(2);
  for(const reduced of [false,true])for(const time of [1.5,3.2,4]){
    view.reduced=reduced;r.olympus.phaseTime=time;images.length=0;const before=JSON.stringify(r);renderOlympus(view,r);
    assert.equal(images.includes(boss),time>=2.6,`world body at ${time}, reduced ${reduced}`);
    assert.equal(images.includes(mask),time<3.7,`portrait at ${time}, reduced ${reduced}`);
    assert.equal(JSON.stringify(r),before);
  }
});

test('all Momos scenes render immutably; rear marker and zoomed aim use their actual world geometry',()=>{
  const calls=[],ctx=new Proxy({measureText:()=>({width:140})},{get:(o,k)=>o[k]??(['createRadialGradient','createLinearGradient'].includes(k)?()=>({addColorStop(){}}):(...args)=>calls.push([k,...args]))});
  const atlas={image:{},unit:1,frames:Array.from({length:16},()=>({x:0,y:0,w:100,h:100,pivot:50}))};
  const view=createOlympusView({getContext:()=>ctx},{boss:atlas,hero:atlas,floor:{image:{}},mask:{image:{}}});resizeOlympus(view,900,1200,2);
  const r=cards();r.boss.faceX=0;r.boss.faceY=1;
  for(const phase of ['intro','combat','centering','cards-show','cards-shuffle','cards-answer','cards-result','stunned']){
    r.olympus.phase=phase;r.olympus.phaseTime=phase==='intro'?1.5:.3;r.olympus.rearOnly=phase==='stunned';
    const before=JSON.stringify(r);calls.length=0;renderOlympus(view,r);assert.equal(JSON.stringify(r),before,phase);
    const point=worldToOlympus(view,751,418),world=screenToOlympus(view,point.x,point.y);assert.ok(Math.hypot(world.x-751,world.y-418)<1e-8);
    if(phase==='stunned'){
      assert.equal(momosPose(r),12);
      assert.ok(calls.some(c=>c[0]==='arc'&&c[1]===r.boss.x&&c[2]===r.boss.y-MOMOS_RULES.rearOffset&&c[3]===MOMOS_RULES.rearRadius));
    }
  }
  r.status='won';assert.equal(momosPose(r),14);
  for(let n=0;n<8;n++){
    const battle=fight();battle.player.hp=1e6;family(battle,n);
    for(let frame=0;frame<220&&(battle.olympus.action||battle.olympus.queue.length);frame++){
      if(frame%7===0){
        assert.ok(Number.isInteger(momosPose(battle)),`family ${n} has a real pose`);
        const snapshot=JSON.stringify(battle);calls.length=0;renderOlympus(view,battle);assert.equal(JSON.stringify(battle),snapshot);
        assert.ok(calls.every(c=>c.slice(1).every(v=>typeof v!=='number'||Number.isFinite(v))),`family ${n} finite draw geometry`);
        for(const h of battle.hazards.filter(h=>h.visual==='wheel-bomb'&&h.t<0)){
          assert.ok(calls.some(c=>c[0]==='arc'&&c[1]===0&&c[2]===0&&c[3]===h.radius),'future wheel landings are visible before choosing a route');
        }
      }
      battle.step(createInput());
    }
  }
});

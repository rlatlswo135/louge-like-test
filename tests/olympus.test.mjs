import test from 'node:test';
import assert from 'node:assert/strict';
import { createOlympusRun, OLYMPUS_TEST_CARDS } from '../public/src/olympus.mjs';
import { OLYMPUS_GODS, olympusRoute } from '../public/src/olympus-catalog.mjs';
import { AERGIA_RULES, AergiaEncounter } from '../public/src/aergia.mjs';
import { BossEncounter, BossEntrance, BossAttackSet, OncePerFightMechanic } from '../public/src/boss-encounter.mjs';
import { encounterFor } from '../public/src/olympus-encounters.mjs';
import { createInput, getStorm } from '../public/src/game.mjs';
import { hitBoss } from '../public/src/systems/combat.mjs';
import { STEP } from '../public/src/content.mjs';
import { isFullClear } from '../public/src/leaderboard-client.mjs';
import { cameraFor, createOlympusView, resizeOlympus, screenToOlympus, worldToOlympus, aergiaPose, warriorPose, renderOlympus } from '../public/src/olympus-render.mjs';
import { createHandler } from '../scripts/serve.mjs';

function fight(seed){const r=createOlympusRun(1,seed);encounterFor(r).entrance.finish(r);return r;}
function startFamily(r,family){
  const rng=r.combatRng;r.combatRng=()=>(family+.5)/4;r.olympus.lastFamily=-1;r.olympus.nextAttack=0;r.step(createInput());r.combatRng=rng;
}
function advance(r,seconds,input=createInput()){for(let i=0;i<Math.ceil(seconds/STEP);i++)r.step(input,STEP);}
function sleep(){const r=fight();hitBoss(r,1e5,'white');advance(r,1.6);assert.equal(r.olympus.phase,'sleep');return r;}
function collect(r){advance(r,5);for(const f of r.olympus.fragments){r.player.x=f.x;r.player.y=f.y;r.step(createInput());}assert.equal(r.olympus.collected,6);}

test('all 50 routes use the documented order; only authored encounters are playable',()=>{
  assert.equal(OLYMPUS_GODS.length,50);assert.equal(OLYMPUS_GODS[0].name,'아에르기아');
  assert.deepEqual(OLYMPUS_GODS.slice(-3).map(g=>g.name),['하데스','포세이돈','제우스']);
  for(let i=1;i<=50;i++)assert.equal(olympusRoute(`/${String(i).padStart(2,'0')}/`),i);
  for(const p of ['/1','/00','/51','/01/x','//01','/01/../50'])assert.equal(olympusRoute(p),null);
  assert.equal(createOlympusRun(2).boss.def.id,'momos');
  for(let i=3;i<=50;i++)assert.throws(()=>createOlympusRun(i),RangeError);
});
test('encounter composes independently replaceable classes with isolated run state',()=>{
  const a=createOlympusRun(),b=createOlympusRun(),enc=encounterFor(a);
  assert.ok(enc instanceof AergiaEncounter&&enc instanceof BossEncounter);
  assert.ok(enc.entrance instanceof BossEntrance);assert.ok(enc.attacks instanceof BossAttackSet);assert.ok(enc.mechanic instanceof OncePerFightMechanic);
  assert.deepEqual(a.cards,OLYMPUS_TEST_CARDS);assert.equal(a.cls.id,'warrior');assert.equal(a.weapon.id,'sword');assert.equal(a.player.hp,a.player.maxHp);
  a.olympus.gimmickUsed=true;a.olympus.fragments.push({id:1});a.cards.edge=3;
  assert.equal(b.olympus.gimmickUsed,false);assert.equal(b.olympus.fragments.length,0);assert.equal(b.cards.edge,1);
  a.status='won';a.stage=19;a.bossesCleared=20;assert.equal(isFullClear(a),false);
});
test('intro is invulnerable and blocks combat input, then releases the normal fight',()=>{
  const r=createOlympusRun(),input={...createInput(),attack:true,attackPressed:true,up:true,dodge:true,aimX:640,aimY:180};
  const hp=r.boss.hp;hitBoss(r,9999,'white');advance(r,3,input);
  assert.equal(r.boss.hp,hp);assert.equal(r.player.y,580);assert.equal(r.stageTime,0);assert.equal(r.hazards.length,0);assert.equal(r.attacks.length,0);
  assert.equal(aergiaPose(r),1);advance(r,4);assert.equal(r.olympus.phase,'combat');assert.equal(r.olympus.controlsLocked,false);
});
test('normal families are seed-randomized, not a fixed cycle or immediate repeat',()=>{
  const first=new Set();
  for(let seed=1;seed<=32;seed++){const r=fight(seed);r.olympus.nextAttack=0;r.step(createInput());first.add(r.olympus.action.kind);}
  assert.equal(first.size,4);
  function sequence(seed){
    const r=fight(seed),families=[];r.player.hp=r.player.maxHp=1e6;
    for(let i=0;i<18000&&families.length<24;i++){
      const prior=r.olympus.lastFamily;r.step(createInput());if(prior!==r.olympus.lastFamily)families.push(r.olympus.lastFamily);
    }
    assert.equal(families.length,24);assert.equal(new Set(families).size,4);
    assert.ok(families.every((f,i)=>!i||f!==families[i-1]));
    assert.ok(families.some((f,i)=>i&&f!==(families[i-1]+1)%4));
    return families;
  }
  assert.deepEqual(sequence(17),sequence(17));assert.notDeepEqual(sequence(17),sequence(18));
});
test('random selection preserves each family’s internal combo',()=>{
  for(const [family,expected] of [['sweep','sweep','sweep','charge'],['debris','debris','debris','slam'],['chains'],['cross','cross']].entries()){
    const r=fight();startFamily(r,family);assert.deepEqual([r.olympus.action.kind,...r.olympus.queue.map(a=>a.kind)],expected);
  }
});
test('charge recovery and family handoff leave less than one second of downtime',()=>{
  const r=fight();r.player.hp=1e6;startFamily(r,0);
  while(r.olympus.action?.kind!=='charge')r.step(createInput());
  const a=r.olympus.action;assert.ok(a.recovery<=.35);
  while(r.olympus.actionTime<a.windup+a.active)r.step(createInput());
  const at=r.time;while(!r.olympus.action||r.olympus.action===a)r.step(createInput());
  assert.ok(r.time-at<.9);
});
test('three sweep warnings are shorter without changing the charge or cross combo',()=>{
  for(const enraged of [false,true]){
    const r=fight();r.olympus.enraged=enraged;r.player.hp=1e6;startFamily(r,0);const windups=[];let last;
    for(let i=0;i<420&&windups.length<3;i++){
      const a=r.olympus.action;if(a?.kind==='sweep'&&a!==last){windups.push(a.windup);last=a;}r.step(createInput());
    }
    assert.equal(windups.length,3);
    for(const [i,w] of windups.entries())assert.ok(Math.abs(w-[.72,.6,.8][i]/(enraged?AERGIA_RULES.enrageSpeed:1))<1e-9);
  }
});
test('each debris throw releases four fast, separated shots only after its locked warning',()=>{
  const r=fight();r.player.x=1000;r.player.y=r.boss.y;startFamily(r,1);
  const o=r.olympus;assert.equal(o.action.kind,'debris');const angle=o.angle;
  while(o.actionTime+STEP<o.action.windup-1e-9){r.step(createInput());assert.equal(r.projectiles.length,0);}
  r.player.y=600;r.step(createInput());
  assert.equal(r.projectiles.length,4);
  for(const [i,q] of r.projectiles.entries()){
    assert.equal(q.kind,'debris');assert.ok(Math.abs(Math.hypot(q.vx,q.vy)-700)<1e-8);
    assert.ok(Math.abs(Math.atan2(q.vy,q.vx)-angle-[-.9,-.45,0,.45][i])<1e-8);
  }
});
test('three wide volleys re-aim, alternate their spread, and hand off directly to an inward slam',()=>{
  for(const enraged of [false,true]){
    const r=fight();r.player.hp=1e6;r.olympus.enraged=enraged;r.player.x=1000;r.player.y=280;startFamily(r,1);
    const shots=[];let prior=-1;
    for(let i=0;i<250&&r.olympus.action?.kind!=='slam';i++){
      r.step(createInput());const o=r.olympus;
      if(o.action?.kind==='debris'&&o.fired&&o.action.index!==prior){
        prior=o.action.index;const qs=r.projectiles.slice(-4);assert.equal(qs.length,4);
        const offsets=qs.map(q=>Math.atan2(Math.sin(Math.atan2(q.vy,q.vx)-o.angle),Math.cos(Math.atan2(q.vy,q.vx)-o.angle)));
        assert.ok(Math.max(...offsets)-Math.min(...offsets)>1.3);assert.ok(offsets.some(x=>Math.abs(x)<1e-8),'one branch must threaten the aimed player');
        assert.ok(Math.abs(offsets[0]-(prior%2?-.45:-.9))<1e-8);
        shots.push({time:r.time,angle:o.angle});r.player.y=prior===0?600:160;
      }
    }
    assert.equal(shots.length,3);assert.equal(r.olympus.action.kind,'slam');
    assert.ok(shots.slice(1).every((s,i)=>s.time-shots[i].time<.65&&s.angle!==shots[i].angle));
    assert.ok(r.time-shots[2].time<.25);assert.ok(r.hazards.some(h=>h.pattern==='aergia-slam'&&h.safe[0].radius===150));
  }
});
test('throw windups warn against camping next to the boss, without early damage',()=>{
  const r=fight();r.player.x=640;r.player.y=380;startFamily(r,1);
  const h=r.hazards.find(h=>h.pattern==='aergia-debris'),hp=r.player.hp;
  assert.equal(h.shape,'circle');assert.equal(h.radius,210);
  while(h.t+STEP<h.windup-1e-9){r.step(createInput());assert.equal(r.player.hp,hp);}
  r.step(createInput());assert.equal(h.phase,'active');assert.ok(r.player.hp<hp);
});
function normalSlam(r){r.olympus.queue=[{kind:'slam',windup:1.2,active:.35,recovery:.45}];r.olympus.nextAttack=0;r.step(createInput());}
test('normal slam shares the visible boss-safe circle, exact activation and one-hit damage',()=>{
  for(const inside of [false,true]){
    const r=fight();r.player.x=640;r.player.y=inside?380:600;normalSlam(r);
    const h=r.hazards[0],hp=r.player.hp;assert.equal(h.shape,'field');assert.deepEqual(h.safe,[{x:640,y:280,radius:150}]);
    assert.equal(aergiaPose(r),12);
    while(h.t+STEP<h.windup-1e-9){r.step(createInput());assert.equal(r.player.hp,hp);}
    r.step(createInput());assert.equal(h.phase,'active');assert.equal(aergiaPose(r),13);
    assert.equal(r.player.hp,hp-(inside?0:55*.88));const after=r.player.hp;advance(r,.3);assert.equal(r.player.hp,after);
  }
});
test('faster inward slam allows corner return after 200ms, using a dodge only when ready',()=>{
  for(const dodgeReady of [false,true])for(const enraged of [false,true])for(const [bx,by,px,py] of [[100,130,1180,625],[1180,625,100,130],[640,280,100,625]]){
    const r=fight();r.olympus.enraged=enraged;r.boss.x=bx;r.boss.y=by;r.player.x=px;r.player.y=py;r.player.dodgeCooldown=dodgeReady?0:2;normalSlam(r);
    const hp=r.player.hp;advance(r,.2);
    for(let i=0;i<360&&r.olympus.action;i++){
      const dx=r.boss.x-r.player.x,dy=r.boss.y-r.player.y,move=Math.hypot(dx,dy)>110;
      r.step({...createInput(),left:move&&dx<-3,right:move&&dx>3,up:move&&dy<-3,down:move&&dy>3,dodge:dodgeReady&&i===0});
    }
    assert.equal(r.olympus.action,null);assert.equal(r.player.hp,hp,`${enraged}/${dodgeReady}: ${px},${py} -> ${bx},${by}`);
  }
});
test('inward warning is 1.2s nearby and cuts only available dodge travel from distant return time',()=>{
  const near=fight();near.player.x=900;near.player.y=280;startFamily(near,1);
  assert.equal(near.olympus.queue.at(-1).windup,1.2);
  const ready=fight(),cooling=fight();
  for(const r of [ready,cooling]){r.player.x=1100;r.player.y=600;}
  cooling.player.dodgeCooldown=2;normalSlam(ready);normalSlam(cooling);
  const stats=ready.getStats(),saving=stats.dodge.distance/stats.speed-stats.dodge.duration;
  assert.ok(Math.abs(cooling.olympus.action.windup-ready.olympus.action.windup-saving)<1e-9);
});
test('sleep, death and victory cancel the normal slam and any delayed attacks',()=>{
  for(const ending of ['sleep','dead','won']){
    const r=fight();normalSlam(r);
    if(ending==='dead')r.player.hp=0;
    else{if(ending==='won')r.olympus.gimmickUsed=true;hitBoss(r,1e5,'white');}
    r.step(createInput());assert.equal(r.hazards.length,0);assert.equal(r.projectiles.length,0);
    if(ending==='sleep')assert.equal(r.olympus.phase,'centering');
    else{assert.equal(r.status,ending);const before=JSON.stringify(r);advance(r,3);assert.equal(JSON.stringify(r),before);}
  }
});
test('cross then X hits about 0.8 seconds apart, with rage scaling and aligned warnings',()=>{
  for(const enraged of [false,true]){
    const r=fight();r.olympus.enraged=enraged;r.player.hp=1e6;startFamily(r,3);const times=[];
    for(let i=0;i<180&&times.length<2;i++){
      r.step(createInput());const o=r.olympus;
      if(o.action?.kind==='cross'&&o.fired&&times.length===o.action.index){
        assert.ok(r.hazards.every(h=>h.phase==='active'));times.push(r.time);
      }
    }
    assert.equal(times.length,2);
    const expected=.8/(enraged?AERGIA_RULES.enrageSpeed:1),gap=times[1]-times[0];
    assert.ok(Math.abs(gap-expected)<STEP*2,`${enraged?'rage':'normal'} gap: ${gap}`);
  }
});
test('charge travels 650 even at a close target and its body stays on the warned path',()=>{
  for(const enraged of [false,true]){
    const r=fight();r.olympus.enraged=enraged;r.boss.x=250;r.boss.y=350;r.player.x=350;r.player.y=350;
    r.olympus.queue=[{kind:'charge',windup:.95,active:.46,recovery:1.15}];r.olympus.nextAttack=0;r.step(createInput());
    const h=r.hazards[0];assert.equal(h.length,650);assert.deepEqual(r.olympus.destination,{x:900,y:350});
    r.player.y=600;
    while(r.olympus.action){r.step(createInput());if(r.hazards.includes(h)&&h.body){assert.ok(Math.abs(h.body.x-r.boss.x)<1e-6);}}
    assert.equal(r.boss.x,900);assert.equal(r.boss.y,350);
  }
});
test('long charges stop at temple walls without changing the aimed direction',()=>{
  for(const [x,y] of [[1150,160],[1150,590],[130,160],[130,590]]){
    const r=fight();r.player.x=x;r.player.y=y;r.olympus.queue=[{kind:'charge',windup:.95,active:.46,recovery:1.15}];r.olympus.nextAttack=0;
    const aim=Math.atan2(y-r.boss.y,x-r.boss.x);r.step(createInput());const h=r.hazards[0],d=r.olympus.destination;
    assert.ok(d.x>=100&&d.x<=1180&&d.y>=130&&d.y<=625);assert.ok(h.length<=650);
    assert.ok(Math.abs(h.angle-aim)<1e-9);assert.ok(Math.abs(Math.atan2(d.y-h.y,d.x-h.x)-aim)<1e-9);
  }
});
test('chain heads catch and pull, then leave a dodgeable punish windup',()=>{
  const r=fight();startFamily(r,2);
  for(let i=0;i<160&&!r.olympus.grab;i++)r.step(createInput());
  assert.ok(r.olympus.grab);assert.equal(r.olympus.controlsLocked,true);
  const before={x:r.player.x,y:r.player.y};advance(r,.15);
  assert.equal(r.olympus.action.kind,'punish');assert.equal(r.olympus.controlsLocked,false);
  assert.ok(Math.hypot(r.player.x-r.boss.x,r.player.y-r.boss.y)<100);
  assert.ok(Math.hypot(r.player.x-before.x,r.player.y-before.y)>100);
  assert.ok(r.olympus.actionTime<r.olympus.action.windup);
});
test('fast chain heads still sweep the whole path and retract without lingering',()=>{
  for(const enraged of [false,true])for(const distance of [100,500,950]){
    const r=fight();r.olympus.enraged=enraged;r.boss.x=150;r.boss.y=350;r.player.x=150+distance;r.player.y=350;startFamily(r,2);
    assert.ok(r.olympus.action.active<=.08);
    const fire=r.time+r.olympus.action.windup;
    for(let i=0;i<100&&!r.olympus.grab;i++)r.step(createInput());
    assert.ok(r.olympus.grab,`swept catch ${distance}`);assert.ok(r.time-fire<.11);assert.equal(r.player.hp,r.player.maxHp);
    const at=r.time;while(r.olympus.grab)r.step(createInput());assert.ok(r.time-at<=.15);
    assert.equal(r.olympus.action.kind,'punish');assert.equal(r.olympus.controlsLocked,false);
  }
});
test('chain renderer uses alternating iron links and finishes retraction as fast as extension',()=>{
  const calls=[],ctx=new Proxy({measureText:()=>({width:100})},{get:(o,k)=>o[k]??(['createRadialGradient','createLinearGradient'].includes(k)?()=>({addColorStop(){}}):(...args)=>calls.push([k,...args]))});
  const atlas={image:{},unit:1,frames:Array.from({length:16},()=>({x:0,y:0,w:100,h:100,pivot:50}))};
  const view=createOlympusView({getContext:()=>ctx},{boss:atlas,hero:atlas,floor:{image:{}}});resizeOlympus(view,1365,768,1);
  for(const enraged of [false,true]){
    const r=fight();r.olympus.enraged=enraged;startFamily(r,2);const a=r.olympus.action;
    r.olympus.actionTime=a.windup+a.active*.8;const before=JSON.stringify(r);calls.length=0;renderOlympus(view,r);
    const links=calls.filter(c=>c[0]==='roundRect'&&c[3]===16);assert.ok(links.length>30);assert.ok(links.some(c=>c[4]===4)&&links.some(c=>c[4]===10));
    assert.equal(JSON.stringify(r),before);
    r.olympus.actionTime=a.windup+a.active*2+.001;calls.length=0;renderOlympus(view,r);assert.equal(calls.filter(c=>c[0]==='roundRect'&&c[3]===16).length,0);
  }
});
test('rolling through chains prevents a grab',()=>{
  const r=fight();startFamily(r,2);
  for(let i=0;i<130;i++){r.player.dodgeTime=1;r.step(createInput());}
  assert.equal(r.olympus.chainCaught,false);assert.equal(r.olympus.grab,null);
});
test('a lethal blow stops at half HP and claims the mechanic exactly once',()=>{
  const r=sleep();assert.equal(r.boss.hp,r.boss.maxHp*.5);assert.equal(r.olympus.gimmickCount,1);
  hitBoss(r,9999,'white');advance(r,12);assert.equal(r.boss.hp,r.boss.maxHp*.5);assert.equal(r.olympus.gimmickCount,1);
  assert.equal(r.olympus.fragments.length,6);assert.ok(r.olympus.fragments.every(f=>f.landed));
  assert.equal(getStorm(r).outside,false);r.stageTime=600;assert.equal(getStorm(r).radius,getStorm(createOlympusRun()).radius);
});
test('falling rubble damages on impact, and cannot be collected before landing',()=>{
  const r=sleep(),f=r.olympus.fragments[0],hp=r.player.hp;r.player.x=f.x;r.player.y=f.y;
  advance(r,1);assert.equal(f.collected,false);assert.equal(r.player.hp,hp);
  advance(r,1);assert.equal(f.landed,true);assert.equal(f.collected,true);assert.ok(r.player.hp<hp);
});
test('collecting every fragment enables a deliberate close-range smash and 2.5-second stun',()=>{
  const r=sleep();collect(r);assert.equal(r.olympus.carrying,true);assert.equal(warriorPose(r),14);
  const click={...createInput(),attack:true,attackPressed:true};r.player.x=150;r.player.y=600;r.step(click);
  assert.equal(r.olympus.phase,'sleep');assert.equal(r.attacks.length,0);
  r.step(createInput());r.player.x=r.boss.x;r.player.y=r.boss.y+100;r.step({...createInput(),attack:true,attackPressed:true});
  assert.equal(r.olympus.phase,'smash');const before=r.boss.hp;advance(r,.65);
  assert.equal(r.olympus.phase,'stunned');assert.equal(r.boss.hp,before);assert.equal(r.olympus.carrying,false);
  assert.equal(r.olympus.stunDuration,2.5);
  advance(r,2.3);assert.equal(r.olympus.phase,'stunned');advance(r,.2);assert.equal(r.olympus.phase,'rebuke');
  advance(r,3.6);assert.equal(r.olympus.phase,'combat');r.player.hp=10000;
  advance(r,15);assert.equal(r.olympus.gimmickCount,1);hitBoss(r,9999,'white');r.step(createInput());assert.equal(r.status,'won');
});
function rebuke(x=640,y=450){
  const r=sleep();collect(r);r.player.x=640;r.player.y=450;
  r.step({...createInput(),attack:true,attackPressed:true});advance(r,.6);
  r.player.x=x;r.player.y=y;r.olympus.phaseTime=r.olympus.stunDuration-STEP;
  r.step(createInput());assert.equal(r.olympus.phase,'rebuke');return r;
}
test('stun ends with a shout and fast outward push, then control returns before the slam',()=>{
  const r=rebuke(),hp=r.player.hp,h=r.hazards[0];
  assert.equal(r.olympus.dialogue,'귀찮아!');assert.equal(r.olympus.enraged,true);
  assert.equal(h.shape,'field');assert.deepEqual(h.safe,[{x:r.boss.x,y:r.boss.y,radius:150}]);
  advance(r,.1);assert.ok(r.player.y>540);assert.equal(r.olympus.controlsLocked,true);
  advance(r,.15);assert.equal(r.player.y,625);assert.equal(r.olympus.controlsLocked,false);assert.equal(r.player.hp,hp);
  const y=r.player.y;r.step({...createInput(),up:true});assert.ok(r.player.y<y);
});
test('rebuke damages outside only at full warning, leaves the boss circle safe, and hits once',()=>{
  for(const inside of [false,true]){
    const r=rebuke();advance(r,.4);r.player.x=640;r.player.y=inside?445:610;
    const h=r.hazards[0],hp=r.player.hp;
    while(h.t+STEP<h.windup-1e-9){r.step(createInput());assert.equal(r.player.hp,hp);}
    r.step(createInput());assert.equal(h.phase,'active');
    assert.equal(r.player.hp,hp-(inside?0:65*.88));
    const after=r.player.hp;advance(r,.3);assert.equal(r.player.hp,after);
    advance(r,1);assert.equal(r.olympus.phase,'combat');assert.equal(r.hazards.length,0);
    assert.equal(r.olympus.gimmickCount,1);
  }
});
test('shortened rebuke allows return from corners after 200ms reaction with walking and one dodge',()=>{
  assert.equal(AERGIA_RULES.rebukeWindup,2);assert.equal(AERGIA_RULES.collectDuration,16);
  for(const [x,y] of [[100,130],[1180,130],[1180,625],[100,625],[640,130],[640,625],[100,350],[1180,350]]){
    const r=rebuke(x,y),hp=r.player.hp;advance(r,AERGIA_RULES.pushDuration+.2);let dodge=true;
    for(let i=0;i<240&&r.olympus.phase==='rebuke';i++){
      const dx=r.boss.x-r.player.x,dy=r.boss.y-r.player.y,move=Math.hypot(dx,dy)>95;
      r.step({...createInput(),left:move&&dx<-3,right:move&&dx>3,up:move&&dy<-3,down:move&&dy>3,dodge});dodge=false;
    }
    assert.equal(r.olympus.phase,'combat');assert.equal(r.player.hp,hp,`return from ${x},${y}`);
  }
});
test('dying or killing the boss during rebuke removes its delayed slam',()=>{
  for(const dead of [false,true]){
    const r=rebuke();if(dead)r.player.hp=0;else hitBoss(r,1e5,'white');r.step(createInput());
    assert.equal(r.status,dead?'dead':'won');assert.equal(r.hazards.length,0);
    const state=JSON.stringify(r);advance(r,5);assert.equal(JSON.stringify(r),state);
  }
});
test('rebuke renderer uses the real safe circle with even-odd fill and keeps combat immutable',()=>{
  const calls=[],ctx=new Proxy({measureText:()=>({width:100})},{get:(o,k)=>o[k]??(['createRadialGradient','createLinearGradient'].includes(k)?()=>({addColorStop(){}}):(...args)=>calls.push([k,...args]))});
  const atlas={image:{},unit:1,frames:Array.from({length:16},()=>({x:0,y:0,w:100,h:100,pivot:50}))};
  const view=createOlympusView({getContext:()=>ctx},{boss:atlas,hero:atlas,debris:{image:{}},floor:{image:{}}});resizeOlympus(view,1365,768,1);
  const r=rebuke();advance(r,1);const before=JSON.stringify(r);renderOlympus(view,r);
  assert.equal(JSON.stringify(r),before);assert.ok(calls.some(c=>c[0]==='fill'&&c[1]==='evenodd'));
  assert.ok(calls.some(c=>c[0]==='arc'&&c[1]===r.boss.x&&c[2]===r.boss.y&&c[3]===150));
  advance(r,1.5);renderOlympus(view,r);assert.ok(calls.some(c=>c[0]==='clip'&&c[1]==='evenodd'));
  assert.ok(calls.flat(Infinity).every(v=>typeof v!=='number'||Number.isFinite(v)));
});
test('restart resets mechanic and stage; death cannot spawn delayed rubble or damage',()=>{
  const r=sleep();r.player.hp=0;r.step(createInput());assert.equal(r.status,'dead');const snapshot=JSON.stringify(r);
  advance(r,30);assert.equal(JSON.stringify(r),snapshot);const next=createOlympusRun();assert.equal(next.olympus.phase,'intro');assert.equal(next.olympus.gimmickCount,0);
});
test('camera zoom and shake preserve screen/world aiming in wide and tall viewports',()=>{
  const r=createOlympusRun(),view=createOlympusView({getContext:()=>null},{});
  for(const [w,h,dpr] of [[1365,768,1],[1664,1273,2],[800,600,1.5]]){
    resizeOlympus(view,w,h,dpr);
    for(const time of [0,3,5,6.8]){
      r.olympus.phaseTime=time;view.camera=cameraFor(r);view.shakeX=3;view.shakeY=-2;
      for(const [x,y] of [[640,360],[110,130],[1180,625]]){const screen=worldToOlympus(view,x,y),world=screenToOlympus(view,screen.x,screen.y);assert.ok(Math.abs(world.x-x)<1e-8&&Math.abs(world.y-y)<1e-8);}
    }
  }
  assert.equal(cameraFor(r,true).zoom,1);assert.equal(cameraFor(r).zoom,1);
});
test('new renderer handles all phases and motions without modifying combat state',()=>{
  const ctx=new Proxy({measureText:()=>({width:100})},{get:(o,k)=>o[k]??(['createRadialGradient','createLinearGradient'].includes(k)?()=>({addColorStop(){}}):()=>{})});
  const atlas={image:{},unit:1,frames:Array.from({length:16},()=>({x:0,y:0,w:100,h:100,pivot:50}))};
  const view=createOlympusView({getContext:()=>ctx},{boss:atlas,hero:atlas,floor:{image:{}}});resizeOlympus(view,1365,768,1);
  const r=sleep();collect(r);
  for(const phase of ['intro','combat','centering','sleep','smash','stunned','rebuke','wipe']){
    r.olympus.phase=phase;const before=JSON.stringify(r);renderOlympus(view,r);assert.equal(JSON.stringify(r),before);
  }
});
test('missed collection deadline leads to an announced lethal wipe through shields and dodge',()=>{
  const r=sleep();advance(r,AERGIA_RULES.collectDuration-.3);assert.equal(r.status,'playing');assert.equal(r.olympus.phase,'sleep');
  r.player.shield=99999;r.player.shieldTime=100;r.player.dodgeTime=100;
  advance(r,.4);assert.equal(r.olympus.phase,'wipe');assert.equal(r.status,'playing');
  advance(r,AERGIA_RULES.wipeWindup);assert.equal(r.status,'dead');assert.equal(r.olympus.gimmickCount,1);assert.equal(r.player.hp,0);
});
test('collecting all fragments stops the deadline until the player deliberately smashes',()=>{
  const r=sleep();collect(r);advance(r,25);assert.equal(r.status,'playing');assert.equal(r.olympus.phase,'sleep');assert.equal(r.olympus.carrying,true);
  r.player.x=640;r.player.y=430;r.step({...createInput(),attack:true,attackPressed:true});advance(r,.6);
  assert.equal(r.olympus.phase,'stunned');assert.equal(r.olympus.enraged,false);advance(r,5.1);assert.equal(r.olympus.enraged,true);
});
test('fragment smash only stuns; a held smash click cannot leak into a sword hit',()=>{
  const r=sleep();collect(r);r.player.x=640;r.player.y=430;
  const held={...createInput(),attack:true,attackPressed:true,aimX:640,aimY:350};
  r.step(held);advance(r,1,held);
  assert.equal(r.olympus.phase,'stunned');assert.equal(r.boss.hp,r.boss.maxHp*.5);
  r.step(createInput());advance(r,.3,{...createInput(),attack:true,attackPressed:true,aimX:640,aimY:350});
  assert.ok(r.boss.hp<r.boss.maxHp*.5,'a new ordinary attack deals damage during stun');
});
test('sweep reaches midrange and the second slam rotates its four lanes by 45 degrees',()=>{
  const r=fight();startFamily(r,0);assert.equal(r.hazards[0].radius,330);
  const s=fight();startFamily(s,3);
  assert.deepEqual(s.hazards.map(h=>h.angle),[0,Math.PI/2,Math.PI,3*Math.PI/2]);
  for(let i=0;i<150&&s.olympus.action?.index!==1;i++)s.step(createInput());
  assert.equal(s.olympus.action.index,1);assert.deepEqual(s.hazards.map(h=>h.angle),[0,1,2,3].map(i=>Math.PI/4+i*Math.PI/2));
});
test('post-mechanic rage accelerates walking, attack timings and debris travel',()=>{
  const normal=fight(),rage=fight();rage.olympus.enraged=true;
  normal.step(createInput());rage.step(createInput());assert.ok(rage.boss.y>normal.boss.y);
  for(const r of [normal,rage])startFamily(r,1);
  assert.ok(Math.abs(normal.olympus.action.windup/rage.olympus.action.windup-AERGIA_RULES.enrageSpeed)<1e-9);
  for(const r of [normal,rage]){while(!r.projectiles.length)r.step(createInput());}
  assert.ok(Math.abs(Math.hypot(rage.projectiles[0].vx,rage.projectiles[0].vy)/Math.hypot(normal.projectiles[0].vx,normal.projectiles[0].vy)-AERGIA_RULES.enrageSpeed)<1e-9);
});
test('HTTP handler maps /01…/50 and /gods, preserves HEAD/404/security behavior',async()=>{
  const handler=createHandler();
  async function request(path,method='GET'){
    let status,headers,body;await handler({url:path,method},{writeHead(code,h){status=code;headers=h;},end(b){body=b?.toString();}});return {status,headers,body};
  }
  for(let i=1;i<=50;i++){
    const r=await request('/'+String(i).padStart(2,'0'));assert.equal(r.status,200);assert.match(r.body,/src="\/src\/olympus-main.mjs"/);
  }
  for(const path of ['/gods','/01/','/50?test=1'])assert.equal((await request(path)).status,200);
  const head=await request('/01','HEAD');assert.equal(head.body,undefined);assert.match(head.headers['Content-Type'],/text\/html/);
  for(const path of ['/00','/51','/1','/01/missing','/01/../AGENTS.md','/01%2f..%2fAGENTS.md','/.git/config'])assert.equal((await request(path)).status,404);
  assert.equal((await request('/01','POST')).status,405);assert.match((await request('/')).body,/균열의 투기장/);
});

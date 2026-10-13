import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,createInput,getStats,step,clearInput,cancelPlayerActions,hazardHitsCircle} from '../public/src/game.mjs';
import {CLASS_UNIQUES,FUSIONS} from '../public/src/builds.mjs';

function quiet(classId='fighter',weaponId='punch',cards=['outboxer']){
  const r=createRun({classId,weaponId});r.cards=Object.fromEntries(cards.map(id=>[id,1]));
  r.boss.def={...r.boss.def,speed:0,raid:null,signature:null,pursuit:null,phaseThresholds:[]};r.boss.timer=1e6;
  r.boss.x=640;r.boss.y=290;r.player.x=640;r.player.y=360;r.player.faceY=-1;
  return r;
}
const input=patch=>({...createInput(),aimX:640,aimY:290,...patch});
const hit=(r,patch={})=>r.hazards.push({shape:'circle',x:640,y:290,radius:160,t:0,windup:0,active:.25,phase:'active',damage:25,...patch});

test('every counter unique and fusion exposes Q and consistently pays the dodge penalty',()=>{
  for(const [cls,key] of [['warrior','iron-counter'],['fighter','outboxer']]){
    const builds=[[key],...FUSIONS.filter(f=>f.ids.includes(key)).map(f=>f.ids)];
    assert.equal(builds.length,5);
    for(const ids of builds){const r=quiet(cls,cls==='warrior'?'sword':'punch',ids),stats=getStats(r);
      assert.ok(stats.counter);assert.equal(stats.dodge.distance,r.cls.dodge.distance*.8);
      assert.ok(stats.dodge.cooldown>r.cls.dodge.cooldown);assert.equal(stats.dodge.chainWindow,0);
      hit(r);step(r,input({counter:true}));assert.equal(r.player.hp,r.player.maxHp);
      assert.ok(r.events.some(e=>e.type==='counter'));assert.ok(r.attacks.some(a=>a.kind==='counter'));
      const hp=r.boss.hp;for(let n=0;n<5;n++)step(r,input());assert.ok(r.boss.hp<hp,'Q success immediately ripostes without left click');
    }
  }
});
test('dodge alone cannot arm counter; mistimed Q, rear attacks and lingering pools are punishable',()=>{
  const d=quiet();hit(d);step(d,input({dodge:true}));assert.equal(d.player.counterTime,0);assert.equal(d.player.counterCooldown,0);
  for(const mode of ['early','rear','pool']){
    const r=quiet();step(r,input({counter:true}));
    if(mode==='early')for(let n=0;n<20;n++)step(r,input());
    hit(r,mode==='rear'?{y:410}:mode==='pool'?{pattern:'pool',persistent:true}:{});
    step(r,input());assert.ok(r.player.hp<r.player.maxHp,mode);assert.equal(r.player.counterTime,0);
  }
});
test('Q cooldown survives suspension, no repeat or blanket protection after a riposte',()=>{
  const r=quiet();hit(r);step(r,input({counter:true}));const cd=r.player.counterCooldown;
  cancelPlayerActions(r);assert.equal(r.player.counterCooldown,cd);assert.equal(r.player.guardTime,0);
  hit(r);step(r,input({counter:true}));assert.ok(r.player.hp<r.player.maxHp);assert.equal(r.player.guardTime,0);
  const i=input({counter:true,dodge:true});clearInput(i);assert.equal(i.counter,false);
  const base=quiet('fighter','punch',[]);step(base,input({counter:true}));assert.equal(base.player.counterCooldown,0);
});
test('Q absorbs one projectile; a different simultaneous projectile is still dangerous',()=>{
  const r=quiet();r.projectiles=[0,1].map(()=>({owner:'boss',x:640,y:345,vx:0,vy:30,radius:5,damage:12,life:1}));
  step(r,input({counter:true}));assert.equal(r.projectiles.length,0);
  assert.equal(r.events.filter(e=>e.type==='counter').length,1);assert.ok(r.player.hp<r.player.maxHp);
});
test('a marker at the player feet uses its caster direction for a frontal counter',()=>{
  const r=quiet();hit(r,{y:360,sourceX:640,sourceY:500});
  step(r,input({counter:true}));assert.ok(r.player.hp<r.player.maxHp);
  assert.equal(r.player.counterTime,0);
});
test('punch, kick and their melee fusions hit a straight lane and cannot hit to the side',()=>{
  for(const weapon of ['punch','kick'])for(const cards of [[],...CLASS_UNIQUES.fighter.map(id=>[id]),...FUSIONS.filter(f=>CLASS_UNIQUES.fighter.includes(f.ids[0])).map(f=>f.ids)]){
    const r=quiet('fighter',weapon,cards),stats=getStats(r);r.boss.x=1000;
    for(let n=0;n<50&&!r.attacks.some(a=>a.shape);n++)step(r,input({attack:true,aimX:950,aimY:360}));
    const a=r.attacks.find(a=>a.shape);assert.ok(a,cards.join('+'));assert.equal(a.shape,'lane');
    assert.equal(hazardHitsCircle(a,a.x+a.length*.8,a.y,4),true);
    assert.equal(hazardHitsCircle(a,a.x+a.length*.6,a.y+50,4),false);
    assert.equal(hazardHitsCircle(a,a.x-25,a.y,4),false);
  }
});
test('single impacts do not damage a player entering their fading visual; explicit pools do',()=>{
  for(const persistent of [false,true]){
    const r=quiet();r.player.x=300;hit(r,{persistent});step(r,input());r.player.x=640;
    step(r,input());assert.equal(r.player.hp<r.player.maxHp,persistent);
  }
});
test('player melee has no ghost hit when a target enters the old swing area',()=>{
  const r=quiet('fighter','kick',[]);r.boss.x=1000;
  step(r,input({attack:true,aimX:950,aimY:360}));const hp=r.boss.hp;
  r.boss.x=725;r.boss.y=360;step(r,input());assert.equal(r.boss.hp,hp);
});
test('charging boss damages only the moving capsule, never the passed path',()=>{
  const r=quiet();r.boss.x=1100;r.boss.y=600;
  r.player.x=220;r.player.y=200;
  r.hazards=[{shape:'lane',x:150,y:200,length:600,width:70,angle:0,charge:true,t:.3,windup:0,active:.6,phase:'active',damage:25}];
  step(r,input());assert.equal(r.player.hp,r.player.maxHp);
  r.player.x=500;step(r,input());assert.ok(r.player.hp<r.player.maxHp);
});

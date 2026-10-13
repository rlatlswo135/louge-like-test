import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,createInput,step,hazardHitsCircle} from '../public/src/game.mjs';
import {BOSSES} from '../public/src/content.mjs';

function cast(id){
  const boss=Object.values(BOSSES).find(b=>b.patterns.some(p=>p.id===id));
  const pattern=boss.patterns.find(p=>p.id===id),r=createRun();
  r.boss.def={...boss,patterns:[pattern],speed:0,raid:null,signature:null,pursuit:null,phaseThresholds:[.5]};
  r.boss.x=480;r.boss.y=360;r.boss.timer=0;r.player.x=700;r.player.y=360;
  step(r,createInput());return r;
}
function advance(r,predicate,limit=600){
  for(let n=0;predicate()&&n<limit;n++)step(r,createInput());
  assert.equal(predicate(),false,'simulation reached its expected boundary');
}

test('leap landing and aftershock stay locked while the boss actually moves to them',()=>{
  const r=cast('colossus-landing'),landing=r.hazards[0],shock=r.hazards[1];
  const target=[landing.x,landing.y];assert.deepEqual([shock.x,shock.y],target);
  r.player.x=180;r.player.y=150;
  advance(r,()=>r.boss.state==='windup');
  assert.deepEqual([landing.x,landing.y],target);
  assert.ok(Math.hypot(r.boss.x-target[0],r.boss.y-target[1])<.01);
  assert.equal(r.player.hp,r.player.maxHp);
  assert.equal(shock.phase,'warn','aftershock has a separate warning after landing');
});
test('second leap retargets only after the first landing and gives another full warning',()=>{
  const r=cast('ravager-pounce');r.player.x=900;r.player.y=520;
  advance(r,()=>r.boss.combo.index===0);
  const second=r.hazards.find(h=>h.phase==='warn'&&h.sequenceIndex===1);
  assert.ok(second);assert.deepEqual([second.x,second.y],[900,520]);
  assert.ok(second.windup-second.t>=.6);assert.equal(r.player.hp,r.player.maxHp);
});
test('cross-up changes the boss position before locking the warning, never during it',()=>{
  const r=cast('execution-flank'),h=r.hazards[0],origin=[r.boss.x,r.boss.y];
  assert.ok(Math.hypot(origin[0]-480,origin[1]-360)>100);
  assert.deepEqual([h.x,h.y],origin);r.player.y=150;
  for(let n=0;n<20;n++)step(r,createInput());
  assert.deepEqual([r.boss.x,r.boss.y],origin);assert.deepEqual([h.x,h.y],origin);
  assert.equal(r.player.hp,r.player.maxHp);
});
test('sustained sweeps rotate their live collision away from the old line and then expire',()=>{
  const r=cast('clock-hand'),h=r.hazards[0];r.player.x=150;r.player.y=150;
  advance(r,()=>h.phase==='warn');
  for(let n=0;n<45;n++)step(r,createInput());
  const x=h.x+Math.cos(h.angle)*170,y=h.y+Math.sin(h.angle)*170;
  assert.ok(h.angle-h.startAngle>.8);
  assert.equal(hazardHitsCircle(h,x,y,8),true);
  assert.equal(hazardHitsCircle(h,h.x+170,h.y,8),false);
  r.player.x=x;r.player.y=y;step(r,createInput());assert.ok(r.player.hp<r.player.maxHp);
  advance(r,()=>r.hazards.includes(h));
  const hp=r.player.hp;r.player.x=h.x+Math.cos(h.angle)*170;r.player.y=h.y+Math.sin(h.angle)*170;
  step(r,createInput());assert.equal(r.player.hp,hp,'expired sweep has no residual damage');
});
test('returning blades reverse and disappear at their origin; accelerating shots gain speed',()=>{
  const r=cast('blade-return');r.player.x=150;r.player.y=150;
  advance(r,()=>!r.projectiles.length);const q=r.projectiles[0],vx=q.vx,vy=q.vy;
  advance(r,()=>!q.turned);
  assert.ok(q.vx*vx+q.vy*vy<0);advance(r,()=>r.projectiles.includes(q));
  assert.equal(r.player.hp,r.player.maxHp);
  const a=cast('ember-comets');a.player.x=150;a.player.y=150;
  advance(a,()=>!a.projectiles.length);const shot=a.projectiles[0],speed=Math.hypot(shot.vx,shot.vy);
  for(let n=0;n<20;n++)step(a,createInput());
  assert.ok(Math.hypot(shot.vx,shot.vy)>speed+40);assert.equal(a.player.hp,a.player.maxHp);
});
test('phase transitions do not duplicate a single leap or sweep into untelegraphed overlapping bodies',()=>{
  for(const id of ['iron-vault','clock-hand','execution-flank']){
    const r=cast(id);r.boss.hp=r.boss.maxHp*.4;step(r,createInput());
    const p=r.boss.def.patterns[0];assert.equal(p.sequence,1,id);
    assert.equal(r.hazards.length,0);assert.equal(r.projectiles.length,0);
  }
});

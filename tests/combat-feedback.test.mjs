import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSSES} from '../public/src/content.mjs';
import {createRun,createInput,getStats,step} from '../public/src/game.mjs';
import {signatureRound} from '../public/src/signatures.mjs';
import {BOSS_SHOT_STYLES,paintBossShot} from '../public/src/combat-fx.mjs';
import {drawHazard} from '../public/src/render.mjs';

test('stage three volleys, accelerating comets and wall shots all travel promptly after their warning',()=>{
  const boss=BOSSES['ember-guardian'];
  for(const pattern of boss.patterns.filter(p=>p.shape==='projectile')){
    const r=createRun({stage:2});r.boss.def={...boss,patterns:[pattern],speed:0,raid:null,signature:null,pursuit:null};
    r.boss.x=500;r.boss.y=350;r.player.x=720;r.player.y=350;r.boss.timer=0;
    step(r,createInput());const h=r.hazards[0];assert.ok(h.shotSpeed>=348,pattern.id);assert.ok(h.windup>=.6);
    r.player.x=100;r.player.y=100;
    for(let n=0;n<120&&!r.projectiles.length;n++)step(r,createInput());
    assert.ok(r.projectiles.length);const q=r.projectiles[0],x=q.x,y=q.y;
    for(let n=0;n<12;n++)step(r,createInput());
    assert.ok(Math.hypot(q.x-x,q.y-y)>65,pattern.id);
  }
  const r=createRun({stage:2});r.boss.raid={...boss.signature,round:0};
  const round=signatureRound(r),shots=round.hazards.filter(h=>h.projectile);
  assert.ok(shots.length);assert.ok(shots.every(h=>h.shotSpeed===440));
  assert.ok(shots.every(h=>h.shotSpeed*h.shotLife>=1280));
});
test('one-cut newly widened green edges actually receive the timing bonus',()=>{
  function damageAt(phase){
    const r=createRun();r.cards['one-cut']=1;
    r.boss.def={...r.boss.def,speed:0,raid:null,signature:null};r.boss.timer=1e6;
    r.player.x=640;r.player.y=360;r.boss.x=700;r.boss.y=360;
    const s=getStats(r);r.player.timingPhase=phase-(1/60)/Math.max(.45,s.interval*1.12);
    const hp=r.boss.hp;step(r,{...createInput(),aimX:700,aimY:360,attack:true,attackPressed:true});
    return hp-r.boss.hp;
  }
  const center=damageAt(.5);assert.ok(center>0);
  assert.equal(damageAt(.31),center);assert.equal(damageAt(.69),center);
  assert.ok(damageAt(.29)<center*.6);assert.ok(damageAt(.71)<center*.6);
});
function drawing(){
  const calls=[],g=new Proxy({}, {get(o,key){
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({addColorStop(){}});
    return o[key]??((...args)=>calls.push([key,...args]));
  }});return {g,calls};
}
test('twenty boss projectile paintings differ in geometry, not just color',()=>{
  const shapes=[];
  for(const style of BOSS_SHOT_STYLES){const {g,calls}=drawing();paintBossShot(g,style,10);
    assert.ok(calls.length>10);assert.equal(calls.filter(c=>c[0]==='fillText').length,0);
    shapes.push(JSON.stringify(calls));
  }
  assert.equal(new Set(shapes).size,20);
});
test('ground danger and refuge use effects without floor text; effects do not mutate hit areas',()=>{
  for(const material of ['fire','ice','water','lightning','void','steel']){
    const {g,calls}=drawing();const h={shape:'circle',x:100,y:100,radius:80,t:2,windup:1,active:3,phase:'active',persistent:true};
    const before=JSON.stringify(h);drawHazard(g,h,2,false,material);
    assert.equal(JSON.stringify(h),before);assert.ok(calls.some(c=>c[0]==='clip'));
    assert.equal(calls.filter(c=>c[0]==='fillText').length,0);
    const second=drawing();drawHazard(second.g,h,2.2,false,material);assert.notDeepEqual(calls,second.calls);
  }
  const {g,calls}=drawing();drawHazard(g,{shape:'field',safe:[{x:200,y:200,radius:100}],phase:'warn',t:.5,windup:1},0,false);
  assert.equal(calls.filter(c=>c[0]==='fillText').length,0);
  assert.ok(calls.some(c=>c[0]==='arc'&&c[3]===100));
});

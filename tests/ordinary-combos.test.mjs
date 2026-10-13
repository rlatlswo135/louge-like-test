import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, createInput, getHazardProgress, hazardHitsCircle, step } from '../public/src/game.mjs';

function advanceUntil(run,predicate,controls=createInput()){
  for(let i=0;i<600&&!predicate();i++){
    assert.equal(run.status,'playing','fixture must survive');step(run,controls);
  }
  assert.ok(predicate(),'expected transition within ten seconds');
}

for(const [stage,id] of [[0,'hunt'],[1,'charge'],[1,'charge-burst']])for(const distance of [140,470]){
  test(`${id}: landing reacquires ${distance<260?'close':'far'} target without intermediate recovery`,()=>{
    const run=createRun({stage,seed:4});
    const pattern=id==='hunt'?run.boss.def.pursuit:run.boss.def.patterns.find(p=>p.id===id);
    run.boss.def={...run.boss.def,raid:null,patterns:[pattern],pursuit:null,speed:0};
    run.boss.x=180;run.boss.y=360;run.player.x=530;run.player.y=360;run.boss.timer=0;
    step(run,createInput());const first=run.hazards[0];
    // A lateral escape while the dash remains locked leaves its path empty.
    run.player.x=800;run.player.y=200;
    advanceUntil(run,()=>run.boss.state==='active');
    const endpoint={x:first.x+Math.cos(first.angle)*first.length,y:first.y+Math.sin(first.angle)*first.length};
    run.player.x=endpoint.x+distance;run.player.y=endpoint.y-80;
    let follow;
    for(let i=0;i<120&&!follow;i++){
      assert.notEqual(run.boss.state,'recover','no free recovery between charge and finisher');
      step(run,createInput());follow=run.hazards.find(h=>h.pattern===`${id}-followup`);
    }
    assert.ok(follow);assert.equal(run.boss.state,'windup');assert.ok(run.boss.pattern.name);
    assert.equal(follow.shape,distance<260?'sector':'lane');
    assert.ok(hazardHitsCircle(follow,run.player.x,run.player.y,16),'follow-up threatens the new position');
    assert.equal(getHazardProgress(follow),0);assert.ok(follow.windup>=.6);
    const locked=[follow.x,follow.y,follow.angle],hp=run.player.hp;
    run.player.x=40;run.player.y=40;
    while(getHazardProgress(follow)<1){
      assert.equal(run.player.hp,hp);step(run,createInput());
      assert.deepEqual([follow.x,follow.y,follow.angle],locked,'no homing after warning starts');
    }
    advanceUntil(run,()=>run.boss.state==='recover');
    assert.ok(run.boss.timer>=.65);assert.equal(run.boss.combo,null);
  });
}

test('sequential marks spawn fresh targets per warning, never from the original empty spot',()=>{
  const run=createRun({stage:2}),pattern=run.boss.def.patterns.find(p=>p.id==='embers');
  run.boss.def={...run.boss.def,raid:null,pursuit:null,patterns:[pattern],speed:0};
  run.player.x=200;run.player.y=200;run.boss.timer=0;step(run,createInput());
  for(let index=0;index<3;index++){
    assert.equal(run.hazards.length,1);const warning=run.hazards[0];
    assert.equal(getHazardProgress(warning),0);
    const target=[warning.x,warning.y];run.player.x=index%2?200:1000;run.player.y=index%2?200:600;
    const expected=[run.player.x,run.player.y];
    advanceUntil(run,()=>!run.hazards.includes(warning));
    assert.deepEqual([warning.x,warning.y],target);
    if(index<2){assert.equal(run.boss.state,'windup');assert.deepEqual([run.hazards[0].x,run.hazards[0].y],expected);}
  }
  assert.equal(run.boss.state,'recover');assert.equal(run.player.hp,run.player.maxHp);
});

test('ordinary selection avoids ABAB when three reachable attacks exist',()=>{
  const run=createRun({stage:0,seed:4});
  run.boss.def={...run.boss.def,raid:null,pursuit:null,speed:0};
  const selected=[];
  for(let i=0;i<15;i++){
    run.player.x=640;run.player.y=360;run.boss.x=640;run.boss.y=200;
    run.boss.state='idle';run.boss.timer=0;run.hazards=[];run.boss.combo=null;
    step(run,createInput());selected.push(run.boss.pattern.id);
    if(i>=2)assert.equal(new Set(selected.slice(-3)).size,3);
  }
});

test('targeted circle can cover arena corner; radius inset cannot create permanent safe corner',()=>{
  const run=createRun(),slam=run.boss.def.patterns.find(p=>p.id==='slam');
  run.boss.def={...run.boss.def,raid:null,pursuit:null,patterns:[slam],speed:0};
  run.player.x=16;run.player.y=16;run.boss.timer=0;step(run,createInput());
  assert.ok(hazardHitsCircle(run.hazards[0],16,16,16));
});

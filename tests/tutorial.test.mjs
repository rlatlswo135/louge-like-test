import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../public/src/game.mjs';
import { BOSSES, CAMPAIGN, CLASSES } from '../public/src/content.mjs';

test('practice uses selected equipment with an isolated easy single boss, not campaign content',()=>{
  assert.equal(typeof game.createTutorialRun,'function');
  const before=JSON.stringify(BOSSES);
  for(const cls of CLASSES)for(const weapon of cls.weapons){
    const run=game.createTutorialRun({classId:cls.id,weaponId:weapon.id});
    assert.equal(run.cls,cls);assert.equal(run.weapon,weapon);
    assert.equal(run.stage,0);assert.equal(run.stageCount,1);assert.equal(run.status,'playing');
    assert.deepEqual(run.cards,{});assert.deepEqual(run.offers,[]);
    assert.equal(game.getTutorialStep(run),0);
    assert.ok(run.boss.maxHp<=200);assert.equal(run.boss.def.raid,null);assert.equal(run.boss.def.pursuit,null);
    assert.ok(run.boss.def.patterns.every(p=>p.damage<=3&&p.windup>=1.8));
  }
  assert.equal(JSON.stringify(BOSSES),before);
  assert.equal(game.createRun().stageCount,CAMPAIGN.stages.length);
  assert.equal(game.createRun().tutorial,undefined);assert.equal(game.getTutorialStep(game.createRun()),-1);
});

test('practice never activates storm, and actual boss hits cannot kill the learner',()=>{
  const run=game.createTutorialRun();run.stageTime=130;run.player.x=16;run.player.y=16;run.player.hp=2;
  assert.equal(game.getStorm(run).active,false);assert.equal(game.getStorm(run).warning,false);
  for(let i=0;i<900;i++)game.step(run,game.createInput());
  assert.equal(run.status,'playing');assert.equal(run.player.hp,1);
  assert.ok(run.events.some(e=>e.type==='playerHit'));
  assert.deepEqual(new Set(run.events.filter(e=>e.type==='telegraph').map(e=>e.pattern)),new Set(['practice-mark','practice-line']),'both slow attacks still reach a distant learner');
  assert.ok(run.events.every(e=>e.type!=='stormHit'));
});

test('guidance counts real movement, hits and accepted dodge; early damage cannot skip the lesson',()=>{
  const run=game.createTutorialRun();run.boss.timer=1000;
  run.player.x=run.boss.x;run.player.y=run.boss.y;game.step(run,game.createInput());
  assert.equal(run.tutorial.walked,0,'body separation without movement input does not satisfy the lesson');
  run.player.x=16;
  for(let i=0;i<30;i++)game.step(run,{...game.createInput(),left:true});
  assert.equal(run.tutorial.walked,0,'walking into a wall is not movement');
  for(let i=0;i<20;i++)game.step(run,{...game.createInput(),right:true});
  assert.equal(game.getTutorialStep(run),1);
  const shoot=game.createTutorialRun({classId:'gunslinger',weaponId:'revolver'});shoot.boss.timer=1000;
  for(let i=0;i<360;i++)game.step(shoot,{...game.createInput(),attack:true,aimX:shoot.boss.x,aimY:shoot.boss.y});
  assert.equal(shoot.boss.hp,1);assert.equal(shoot.status,'playing');assert.equal(shoot.tutorial.attacked,true);
  assert.equal(game.getTutorialStep(shoot),0,'an early hit counts, but does not skip the missing movement');
  shoot.player.dodgeCooldown=1;game.step(shoot,{...game.createInput(),dodge:true});assert.equal(shoot.tutorial.dodged,false);
  shoot.player.dodgeCooldown=0;game.step(shoot,{...game.createInput(),right:true,dodge:true});assert.equal(shoot.tutorial.dodged,true);
});

test('practice victory gives neither healing nor a reward offer',()=>{
  const r=game.createTutorialRun({classId:'gunslinger',weaponId:'revolver'});
  Object.assign(r.tutorial,{walked:60,attacked:true,dodged:true});
  r.player.hp=50;r.boss.hp=1;r.boss.timer=1000;
  for(let i=0;i<120&&r.status==='playing';i++)game.step(r,{...game.createInput(),attack:true,aimX:r.boss.x,aimY:r.boss.y});
  assert.equal(r.status,'won');assert.equal(r.player.hp,50);assert.deepEqual(r.offers,[]);
});

test('all twelve loadouts complete practice through movement, real hit and dodge without rewards',()=>{
  for(const cls of CLASSES)for(const weapon of cls.weapons){
    const r=game.createTutorialRun({classId:cls.id,weaponId:weapon.id});
    for(let i=0;i<20;i++)game.step(r,{...game.createInput(),up:true});
    for(let i=0;i<360;i++)game.step(r,{...game.createInput(),attack:true,aimX:r.boss.x,aimY:r.boss.y});
    assert.equal(r.status,'playing',weapon.id);assert.equal(r.boss.hp,1,weapon.id);
    assert.equal(game.getTutorialStep(r),2);
    game.step(r,{...game.createInput(),right:true,dodge:true});
    for(let i=0;i<900&&r.status==='playing';i++){
      const targetY=r.boss.y+74;
      game.step(r,{...game.createInput(),attack:true,aimX:r.boss.x,aimY:r.boss.y,
        left:r.player.x>r.boss.x+4,right:r.player.x<r.boss.x-4,up:r.player.y>targetY+4,down:r.player.y<targetY-4});
    }
    assert.equal(r.status,'won',weapon.id);assert.equal(r.stage,0);assert.equal(game.getTutorialStep(r),3);
    assert.equal(r.hazards.length+r.projectiles.length,0);assert.deepEqual(r.offers,[]);assert.deepEqual(r.cards,{});
    assert.equal(game.chooseCard(r,'edge'),false);
    const time=r.time;game.step(r,{...game.createInput(),attack:true,dodge:true});assert.equal(r.time,time);
    const next=game.createRun({classId:cls.id,weaponId:weapon.id});
    assert.equal(next.player.hp,next.cls.maxHp);assert.equal(next.tutorial,undefined);assert.equal(next.stageCount,20);
  }
});

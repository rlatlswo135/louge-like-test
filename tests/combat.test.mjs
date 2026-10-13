import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BOSSES, CAMPAIGN, LIMITS, PLAYER } from '../public/src/content.mjs';
import { chooseCard, createInput, createRun, getStats, step } from '../public/src/game.mjs';

const input = (patch = {}) => Object.assign(createInput(), patch);

test('water needs three spaced hits for pressure burst and shield; slow and shield expire', () => {
  const run=createRun({classId:'mage',weaponId:'water'});run.boss.timer=1e6;run.boss.slowTime=1.8;
  run.projectiles.push({owner:'player',x:run.boss.x-50,y:run.boss.y,prevX:run.boss.x-50,prevY:run.boss.y,vx:10000,vy:0,radius:2,life:1,maxLife:1,damage:1,kind:'water'});
  step(run,createInput());
  assert.ok(run.boss.slowTime<=2);assert.equal(run.player.shield,0);assert.equal(run.boss.wetStacks,1);
  for(let hit=0;hit<2;hit++){
    for(let i=0;i<22;i++)step(run,createInput());
    run.projectiles.push({owner:'player',x:run.boss.x-50,y:run.boss.y,vx:10000,vy:0,radius:2,life:1,maxLife:1,damage:1,kind:'water'});
    step(run,createInput());
  }
  assert.equal(run.player.shield,8);assert.equal(run.player.shieldTime,3);assert.equal(run.boss.wetStacks,0);
  assert.equal(run.events.filter(e=>e.type==='waterBurst').length,1);
  for(let i=0;i<301;i++)step(run,createInput());
  assert.equal(run.player.shield,0);assert.equal(run.player.shieldTime,0);assert.equal(run.boss.slowTime,0);
});

test('shields absorb quantified damage; playerHit reports damage actually taken', () => {
  const run=createRun();run.boss.timer=1e6;run.player.hp=100;run.player.shield=20;run.player.shieldTime=5;
  run.hazards.push({shape:'circle',x:run.player.x,y:run.player.y,radius:100,phase:'active',t:0,windup:0,active:.2,damage:12,hitDone:false});
  step(run,createInput());
  assert.ok(Math.abs(run.player.shield-9.44)<1e-9);assert.equal(run.player.hp,100);
  assert.equal(run.events.filter(e=>e.type==='playerHit').length,0);
  run.hazards.length=0;run.hazards.push({shape:'circle',x:run.player.x,y:run.player.y,radius:100,phase:'active',t:0,windup:0,active:.2,damage:12,hitDone:false});
  step(run,createInput());
  assert.equal(run.player.shield,0);assert.ok(Math.abs(run.player.hp-98.88)<1e-9);
  assert.ok(Math.abs(run.events.find(e=>e.type==='playerHit').damage-1.12)<1e-9);
});

test('persistent pools repeat; short active strikes hit stationary player once', () => {
  const run=createRun();run.boss.timer=1e6;run.player.x=640;run.player.y=360;
  run.hazards.push({pattern:'pool',shape:'circle',x:640,y:360,radius:100,phase:'active',t:0,windup:0,active:1,damage:10,hitDone:false,nextHit:0});
  for(let i=0;i<59;i++)step(run,createInput());
  assert.ok(Math.abs(run.player.hp-(run.cls.maxHp-30*.88))<1e-9);
  for(let i=0;i<10;i++)step(run,createInput());
  assert.ok(Math.abs(run.player.hp-(run.cls.maxHp-30*.88))<1e-9);
  run.hazards.length=0;run.hazards.push({shape:'sector',x:640,y:360,radius:100,angle:0,halfAngle:1,phase:'active',t:0,windup:0,active:.6,damage:10,hitDone:false});
  for(let i=0;i<40;i++)step(run,createInput());
  assert.ok(Math.abs(run.player.hp-(run.cls.maxHp-40*.88))<1e-9);
});

test('sequential patterns emit staggered fixed warnings; warnings cannot damage', () => {
  const expectations=[['ember-guardian','embers',3],['storm-orb','lightning-lanes',3],['iron-bastion','cross',4],['storm-orb','spiral',7],['iron-bastion','barrage',4]];
  for(const [bossId,id,count] of expectations){
    const run=createRun({stage:CAMPAIGN.stages.indexOf(bossId),seed:2});run.boss.def={...run.boss.def,patterns:run.boss.def.patterns.filter(p=>p.id===id),pursuit:null};run.boss.timer=0;
    step(run,createInput());assert.equal(run.hazards.length,run.boss.def.patterns[0].retarget?1:count,`${id}: reactive stages or planned formation`);
    const first=run.hazards[0], locked=[first.x,first.y,first.angle];
    const hp=run.player.hp;for(let i=0;i<Math.floor(first.windup*60)-1;i++)step(run,createInput());
    assert.equal(run.player.hp,hp,`${id} warning damage`);
    assert.deepEqual([first.x,first.y,first.angle],locked,`${id} warning stays fixed`);
  }
});

test('charge travels on locked telegraphed lane', () => {
  const run=createRun({stage:1,seed:1});run.boss.def={...run.boss.def,patterns:[run.boss.def.patterns.find(p=>p.id==='charge')],pursuit:null};run.boss.timer=0;
  step(run,createInput());const lane=run.hazards[0];const angle=lane.angle;const start={x:run.boss.x,y:run.boss.y};
  for(let i=0;i<100;i++)step(run,createInput());
  assert.ok(Math.hypot(run.boss.x-start.x,run.boss.y-start.y)>10);
  assert.ok(Math.abs(Math.atan2(run.boss.y-start.y,run.boss.x-start.x)-angle)<.04);
});

test('projectile lifetime enforces reach, sweeps final partial step, and caps throw', () => {
  const run=createRun({classId:'gunslinger',weaponId:'sniper'});run.boss.timer=1e6;run.player.x=100;run.player.y=400;
  const shotInput=input({attack:true,aimX:200,aimY:400});step(run,shotInput);
  const shot=run.projectiles[0];assert.ok(shot.life*getStats(run).projectileSpeed<=getStats(run).reach+1e-6);
  shot.x=1000;shot.prevX=1000;shot.y=100;shot.prevY=100;shot.vx=100;shot.vy=0;shot.life=.001;
  step(run,createInput());assert.ok(shot.x<=1000.11);
  run.projectiles=Array.from({length:LIMITS.projectiles},()=>({owner:'player',x:0,y:0,prevX:0,prevY:0,vx:0,vy:0,radius:1,life:1,damage:1}));
  run.player.attackCooldown=0;assert.throws(()=>step(run,input({attack:true,aimX:500,aimY:200})),/Projectile limit/);
});

test('dodge ward shield has finite point value and stage transition clears buffs', () => {
  const run=createRun();run.cards.ward=1;run.cards.dodge=1;run.player.dodgeCooldown=0;
  const before=getStats(run);step(run,input({dodge:true,right:true}));
  assert.equal(run.player.shield,12);assert.equal(run.player.shieldTime,2);
  assert.ok(getStats(run).damage>before.damage);
  run.status='reward';run.offers=[{id:'edge',category:'damage',maxStacks:3}];run.player.x=100;run.player.y=100;run.player.shield=12;run.player.shieldTime=2;run.player.heavyReady=true;run.player.dodgeBuffTime=2;run.feedback.flash=1;
  assert.equal(chooseCard(run,'edge'),true);
  assert.deepEqual([run.player.x,run.player.y],[ARENA.width/2,ARENA.height-140]);
  assert.equal(run.player.shield,0);assert.equal(run.player.heavyReady,false);assert.equal(run.player.dodgeBuffTime,0);assert.equal(run.feedback.flash,0);
});

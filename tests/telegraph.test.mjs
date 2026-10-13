import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../public/src/game.mjs';
import { BOSSES, STEP } from '../public/src/content.mjs';

const quiet = () => {
  const run = game.createRun();
  run.player.x = 640; run.player.y = 360;
  run.boss.x = 1000; run.boss.timer = 1e6;
  run.boss.def = { ...run.boss.def, speed: 0 };
  return run;
};

test('warning area progress and damage share the same 100% boundary, including delayed strikes', () => {
  assert.equal(typeof game.getHazardProgress, 'function');
  for (const delay of [0, .3]) for (const shape of ['circle', 'sector', 'lane', 'ring']) {
    const run = quiet();
    const h = { shape, x: 600, y: 360, radius: 120, innerRadius: 25,
      angle: 0, halfAngle: .8, gapHalfAngle: 0, length: 200, width: 90,
      t: -delay, windup: .6, active: .2, phase: 'warn', damage: 17 };
    const geometry = JSON.stringify([h.x,h.y,h.radius,h.innerRadius,h.angle,h.halfAngle,h.length,h.width]);
    run.hazards.push(h);
    assert.equal(game.getHazardProgress(h), 0);
    while (game.getHazardProgress(h) < 1) {
      assert.equal(run.player.hp, run.player.maxHp, `${shape}: warning must be harmless`);
      game.step(run, game.createInput());
    }
    assert.equal(h.phase, 'active');
    assert.equal(run.player.hp, run.player.maxHp-17*(1-run.cls.damageReduction), `${shape}: damage begins exactly at full fill`);
    assert.equal(JSON.stringify([h.x,h.y,h.radius,h.innerRadius,h.angle,h.halfAngle,h.length,h.width]), geometry);
    for (let i = 0; i < 15; i++) game.step(run, game.createInput());
    assert.equal(run.player.hp, run.player.maxHp-17*(1-run.cls.damageReduction));
  }
});

const cast = (pattern) => {
  const run = quiet();
  run.boss.x = 640; run.boss.y = 200; run.boss.timer = 0;
  run.boss.def = { ...run.boss.def, pursuit: null, patterns: [{ id:'test', name:'test', windup:.7, active:.2, recover:.4, damage:20, ...pattern }] };
  game.step(run, game.createInput());
  return run;
};

test('outward ring waves keep a real safe center and each ring charges separately', () => {
  const run = cast({ shape:'ring', radius:90, innerRadius:30, sequence:3, radiusStep:65, sequenceDelay:.35 });
  assert.deepEqual(run.hazards.map(h=>h.radius),[90,155,220]);
  assert.deepEqual(run.hazards.map(h=>h.innerRadius),[30,95,160]);
  assert.deepEqual(run.hazards.map(h=>game.getHazardProgress(h)),[0,0,0]);
  assert.ok(run.hazards[1].t<run.hazards[0].t && run.hazards[2].t<run.hazards[1].t);
});

test('petal circles surround one locked target instead of stacking copies at the player', () => {
  const run = cast({ shape:'circle', radius:60, sequence:6, layout:'orbit', orbitRadius:125 });
  for (const h of run.hazards) assert.ok(Math.abs(Math.hypot(h.x-640,h.y-360)-125)<1e-9);
  assert.equal(new Set(run.hazards.map(h=>`${h.x.toFixed(2)}:${h.y.toFixed(2)}`)).size,6);
  const positions = run.hazards.map(h=>[h.x,h.y]);
  for (let i=0;i<30;i++) game.step(run,{...game.createInput(),right:true});
  assert.deepEqual(run.hazards.map(h=>[h.x,h.y]),positions);
});

test('charge endpoint explosion waits for its own full warning; recovery waits for the last strike', () => {
  const run = cast({ shape:'lane', radius:44, distance:300, active:.32,
    aftershock:{radius:100,windup:.65,active:.2,damage:25} });
  assert.equal(run.hazards.length,2);
  const lane = run.hazards[0], blast = run.hazards[1];
  assert.ok(Math.abs(blast.x-(lane.x+Math.cos(lane.angle)*lane.length))<1e-9);
  assert.ok(Math.abs(blast.y-(lane.y+Math.sin(lane.angle)*lane.length))<1e-9);
  const location = [blast.x,blast.y];
  while (lane.t < lane.windup+lane.active-STEP) game.step(run,game.createInput());
  assert.equal(blast.phase,'warn'); assert.equal(game.getHazardProgress(blast),0);
  while (blast.phase==='warn') {
    assert.notEqual(run.boss.state,'recover');
    game.step(run,game.createInput());
  }
  assert.equal(game.getHazardProgress(blast),1);
  assert.deepEqual([blast.x,blast.y],location);
  while (run.hazards.length) game.step(run,game.createInput());
  assert.equal(run.boss.state,'recover');
});

test('pattern-specific sweep spacing, finite beam length and radial projectile corridors are real geometry', () => {
  const sweep = cast({shape:'sector',radius:230,halfAngle:.4,sequence:3,angleStep:.75});
  assert.ok(Math.abs(sweep.hazards[1].angle-sweep.hazards[0].angle-.75)<1e-9);
  const beam = cast({shape:'lane',radius:40,width:80,length:470});
  assert.equal(beam.hazards[0].length,470);
  const wheel = cast({shape:'projectile',volley:6,radial:true,shotDelay:.12,projectileSpeed:300,projectileRadius:9,projectileLife:1.4});
  assert.ok(Math.abs(wheel.hazards[1].angle-wheel.hazards[0].angle-Math.PI/3)<1e-9);
  assert.equal(wheel.hazards[0].width,18);
  assert.equal(wheel.hazards[0].length,420);
  assert.ok(Math.abs(wheel.hazards[0].t-wheel.hazards[1].t-.12)<1e-9);
});

test('offscreen lane tails cannot make the visible corridor look full before activation', () => {
  const beam=cast({shape:'lane',width:80,length:2000});
  assert.equal(beam.hazards[0].length,520);
  const wheel=cast({shape:'projectile',volley:8,radial:true,projectileSpeed:500,projectileLife:4,projectileRadius:9});
  for(const h of wheel.hazards){
    const x=h.x+Math.cos(h.angle)*h.length,y=h.y+Math.sin(h.angle)*h.length;
    assert.ok(x>=-1e-9&&x<=1280+1e-9&&y>=-1e-9&&y<=720+1e-9);
    assert.ok(Math.abs(h.shotLife*h.shotSpeed-h.length)<1e-9);
  }
});

test('every boss offers at least three distinct patterns and cannot spam hunt forever at range', () => {
  for (const boss of Object.values(BOSSES)) {
    assert.ok(boss.patterns.length>=3, `${boss.id}: needs a varied repertoire`);
    assert.equal(new Set(boss.patterns.map(p=>p.id)).size,boss.patterns.length);
  }
  const run = game.createRun();
  const names = [];
  for(let i=0;i<8;i++) {
    run.player.x=640;run.player.y=580;run.boss.x=640;run.boss.y=200;
    run.boss.state='idle';run.boss.timer=0;run.hazards.length=0;
    game.step(run,game.createInput());names.push(run.boss.pattern.id);
  }
  assert.equal(names[0],'hunt');
  for(let i=1;i<names.length;i++) assert.notEqual(names[i],names[i-1]);
  assert.ok(names.some(id=>id!=='hunt'));
});

test('final phase strengthens follow-up explosions as well as primary attacks', () => {
  const run=game.createRun({stage:9});
  const original=run.boss.def.patterns.find(p=>p.aftershock);
  run.boss.hp=run.boss.maxHp*.49;
  game.step(run,game.createInput());
  const changed=run.boss.def.patterns.find(p=>p.id===original.id);
  assert.equal(run.boss.phase,2);
  assert.ok(changed.aftershock.damage>original.aftershock.damage);
  assert.ok(changed.aftershock.windup>=.6);
});

test('boss impact feedback appears once at activation, never during charge', () => {
  const run = cast({shape:'circle',radius:100});
  const hazard = run.hazards[0];
  while (hazard.windup-hazard.t > STEP+1e-9) {
    game.step(run,game.createInput());
    assert.equal(run.particles.filter(p=>p.type==='bossImpact').length,0);
  }
  game.step(run,game.createInput());
  assert.equal(run.particles.filter(p=>p.type==='bossImpact').length,1);
  for(let i=0;i<4;i++) game.step(run,game.createInput());
  assert.equal(run.particles.filter(p=>p.type==='bossImpact').length,1);
});

test('projectile corridor reaches 100% before a shot exists; delayed volleys charge independently', () => {
  const run = quiet();
  const shot = { shape: 'lane', x: 640, y: 200, length: 500, width: 20, angle: 0,
    t: 0, windup: .6, active: .1, phase: 'warn', projectile: true,
    shotAngle: 0, shotSpeed: 300, shotRadius: 10, shotLife: 2, damage: 20 };
  run.hazards.push(shot, { ...shot, t: -.3 });
  for (let i = 0; i < 35; i++) game.step(run, game.createInput());
  assert.equal(run.projectiles.length, 0);
  game.step(run, game.createInput(), STEP);
  assert.equal(run.projectiles.length, 1);
  assert.equal(game.getHazardProgress(run.hazards[0]), 1);
  assert.ok(game.getHazardProgress(run.hazards[1]) < .51);
  for (let i = 0; i < 18; i++) game.step(run, game.createInput());
  assert.equal(run.projectiles.length, 2);
});

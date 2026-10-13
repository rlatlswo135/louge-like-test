import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP } from '../public/src/content.mjs';
import { createInput, createRun, hazardHitsCircle, step } from '../public/src/game.mjs';

const quiet = (options) => {
  const run = createRun(options);
  run.boss.timer = 1e6;
  run.boss.def = { ...run.boss.def, speed: 0 };
  return run;
};

test('second ward rank absorbs 24 points, water never reduces existing shield', () => {
  const run = quiet({ classId: 'mage', weaponId: 'water' });
  run.cards.ward = 2;
  step(run, { ...createInput(), dodge: true, right: true });
  assert.equal(run.player.shield, 24);
  run.boss.wetStacks=2;run.boss.wetTime=4;
  run.projectiles.push({ owner: 'player', x: run.boss.x - 50, y: run.boss.y, vx: 10000, vy: 0, radius: 2, life: 1, maxLife: 1, damage: 1, kind: 'water' });
  step(run, createInput());
  assert.equal(run.player.shield, 24);
});

test('water cannot refill past 16 even when Ward rank 2 is equipped', () => {
  const run = quiet({ classId: 'mage', weaponId: 'water' });
  run.cards.ward = 2;
  for (let i = 0; i < 8; i++) {
    run.projectiles.push({ owner: 'player', x: run.boss.x - 50, y: run.boss.y, vx: 10000, vy: 0, radius: 2, life: 1, maxLife: 1, damage: 1, kind: 'water' });
    step(run, createInput());
    for(let n=0;n<22;n++)step(run,createInput());
  }
  assert.equal(run.player.shield, 16);
});

test('circle vs lane uses rounded collision corners, not an expanded square', () => {
  const lane = { shape: 'lane', x: 0, y: 0, angle: 0, length: 100, width: 20 };
  assert.equal(hazardHitsCircle(lane, 110, 20, 10), false);
  assert.equal(hazardHitsCircle(lane, 106, 18, 10), true);
  assert.equal(hazardHitsCircle(lane, 106.1, 18, 10), false);
});

test('boss windup timer and hazard countdown match every fixed step', () => {
  const run = createRun();
  run.boss.timer = 0;
  step(run, createInput());
  while (run.boss.state === 'windup') {
    assert.ok(Math.abs(run.boss.timer - (run.hazards[0].windup - run.hazards[0].t)) < 1e-6);
    step(run, createInput());
  }
  assert.equal(run.hazards[0].phase, 'active');
});

test('both dashes follow their locked short lane through activation and recovery', () => {
  const run = createRun({ stage: 6 });
  run.boss.def = { ...run.boss.def, patterns: run.boss.def.patterns.filter((p) => p.id === 'twin-charge'), pursuit: null };
  run.boss.timer = 0;
  step(run, createInput());
  const first = run.hazards[0];
  assert.equal(run.hazards.length,1);
  assert.ok(first.length < 600);
  const aimed = first.angle;
  for (let i=0;i<Math.ceil(first.windup*60)-1;i++) step(run,createInput());
  assert.equal(run.player.hp,run.player.maxHp);
  assert.equal(first.angle,aimed);
  for(let i=0;i<120&&run.hazards.includes(first);i++)step(run,createInput());
  assert.equal(run.boss.state,'windup');
  assert.equal(run.hazards.length,1,'second dash warning begins only after first landing');
  assert.notEqual(run.hazards[0],first);
  assert.equal(run.hazards[0].phase,'warn');
});

test('expired projectiles cannot hit after their lifetime', () => {
  const run = quiet();
  run.projectiles.push({ owner: 'player', x: run.boss.x, y: run.boss.y, vx: 100, vy: 0, radius: 2, life: 0, damage: 30 });
  step(run, createInput(), STEP);
  assert.equal(run.boss.hp, run.boss.maxHp);
  assert.equal(run.projectiles.length, 0);
});

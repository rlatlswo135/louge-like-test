import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, STORM } from '../public/src/content.mjs';
import { chooseCard, createInput, createRun, previewReward, step } from '../public/src/game.mjs';

function killBoss(run) {
  run.boss.hp = 1;
  run.player.x = run.boss.x;
  run.player.y = run.boss.y + 60;
  const input = createInput();
  input.attack = true; input.aimX = run.boss.x; input.aimY = run.boss.y;
  step(run, input);
}

function hazard(damage, x, y) {
  return { shape: 'circle', x, y, radius: 40, phase: 'active', t: 0.2, windup: 0.1, active: 1, damage };
}

test('run metrics initialize flat and boss clears count successful clears only', () => {
  const run = createRun();
  assert.deepEqual([run.hitsTaken, run.bossesCleared, run.stormContact], [0, 0, false]);
  killBoss(run);
  assert.equal(run.bossesCleared, 1);
  const metrics = [run.hitsTaken, run.bossesCleared, run.stormContact];
  const preview = previewReward(run, run.offers[0].id);
  assert.deepEqual([preview.hitsTaken, preview.bossesCleared, preview.stormContact], metrics);
  assert.equal(chooseCard(run, run.offers[0].id), true);
  assert.deepEqual([run.hitsTaken, run.bossesCleared, run.stormContact], metrics);

  const simultaneous = createRun();
  simultaneous.boss.hp = 1;
  simultaneous.player.x = simultaneous.boss.x;
  simultaneous.player.y = simultaneous.boss.y + 60;
  simultaneous.player.hp = 1;
  simultaneous.hazards.push(hazard(100, simultaneous.player.x, simultaneous.player.y));
  const input = createInput(); input.attack = true; input.aimX = simultaneous.boss.x; input.aimY = simultaneous.boss.y;
  step(simultaneous, input);
  assert.equal(simultaneous.status, 'dead');
  assert.equal(simultaneous.bossesCleared, 0);
});

test('accepted boss hits count despite shield, but dodge/invulnerability and zero damage do not', () => {
  const run = createRun();
  run.boss.timer = 1e9;
  const p = run.player;
  p.x = 640; p.y = 360; p.shield = 20; p.shieldTime = 10;
  run.hazards.push(hazard(10, p.x, p.y));
  step(run, createInput());
  assert.equal(run.hitsTaken, 1);
  assert.equal(p.hp, p.maxHp);

  run.hazards.push(hazard(0, p.x, p.y));
  step(run, createInput());
  assert.equal(run.hitsTaken, 1);
  p.dodgeTime = 1;
  run.hazards.push(hazard(10, p.x, p.y));
  step(run, createInput());
  assert.equal(run.hitsTaken, 1);
});

test('storm contact counts once per outside episode and resets on re-entry and stage transition', () => {
  const run = createRun();
  run.boss.timer = 1e9;
  run.stageTime = STORM.delay + STORM.warning + STORM.duration / 2;
  run.player.x = 20; run.player.y = 20; run.player.hp = run.player.maxHp = 10000;
  step(run, createInput());
  step(run, createInput());
  assert.equal(run.hitsTaken, 1);
  assert.equal(run.stormContact, true);
  run.player.x = ARENA.width / 2; run.player.y = ARENA.height / 2;
  step(run, createInput());
  assert.equal(run.stormContact, false);
  run.player.x = 20; run.player.y = 20;
  step(run, createInput());
  assert.equal(run.hitsTaken, 2);

  // Complete current boss through real combat flow; stage reset clears contact, totals persist.
  run.player.x = run.boss.x; run.player.y = run.boss.y + 60;
  killBoss(run);
  assert.equal(run.bossesCleared, 1);
  run.stormContact = true;
  assert.equal(chooseCard(run, run.offers[0].id), true);
  assert.equal(run.stormContact, false);
  assert.equal(run.hitsTaken, 2);
  assert.equal(run.bossesCleared, 1);
});

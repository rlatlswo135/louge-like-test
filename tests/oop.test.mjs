import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRun, GameInput, FixedStepClock, createRun, createInput, createClock, step, previewReward } from '../public/src/game.mjs';
import { Player, Boss } from '../public/src/entities.mjs';
import { CARDS, STEP } from '../public/src/content.mjs';

test('factories create entities and the object API preserves the functional simulation API', () => {
  const objectRun = new GameRun({ seed: 42 });
  const functionalRun = createRun({ seed: 42 });
  assert.ok(functionalRun instanceof GameRun);
  assert.ok(functionalRun.player instanceof Player);
  assert.ok(functionalRun.boss instanceof Boss);
  assert.ok(createInput() instanceof GameInput);
  assert.ok(createClock() instanceof FixedStepClock);
  for (let i = 0; i < 180; i++) {
    const input = { ...createInput(), right: i < 20, attack: true, aimX: 640, aimY: 200 };
    objectRun.step({ ...input }, STEP);
    step(functionalRun, { ...input }, STEP);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(objectRun)), JSON.parse(JSON.stringify(functionalRun)));
});

test('reward previews retain methods and isolate entities, cards and RNG from the live run', () => {
  const run = createRun({ seed: 23 });
  run.status = 'reward';
  run.offers = [CARDS.find(card => card.id === 'edge')];
  const before = JSON.stringify(run);
  const preview = run.previewReward('edge');
  assert.ok(preview instanceof GameRun);
  assert.ok(preview.player instanceof Player);
  assert.ok(preview.boss instanceof Boss);
  preview.player.hp = 1;
  preview.cancelActions();
  preview.step(createInput());
  assert.equal(JSON.stringify(run), before);
  const control = createRun({ seed: 23 });
  assert.equal(run.rng(), control.rng());
  assert.ok(previewReward(run, 'edge') instanceof GameRun);
});

test('stage transitions preserve player identity and progression, create a new boss and reset actions', () => {
  const run = createRun();
  const player = run.player, boss = run.boss;
  run.status = 'reward';
  run.offers = [CARDS.find(card => card.id === 'edge')];
  player.hp = 60;
  player.guardTime = .2;
  player.counterCooldown = 2;
  player.charge = .5;
  assert.equal(run.chooseCard('edge'), true);
  assert.equal(run.player, player);
  assert.notEqual(run.boss, boss);
  assert.ok(run.boss instanceof Boss);
  assert.equal(run.player.hp, 60);
  assert.equal(run.player.charge, 0);
  assert.equal(run.player.counterCooldown, 0);
  assert.equal(run.cards.edge, 1);
  assert.equal(run.stage, 1);
});

test('input and clock object APIs clear actions and discard elapsed time after reset', () => {
  const input = createInput(), clock = createClock();
  input.counter = input.dodge = input.attack = input.right = true;
  input.aimX = 50;
  input.clear();
  assert.equal(input.counter || input.dodge || input.attack || input.right, false);
  assert.equal(input.aimX, 50);
  assert.equal(clock.advance(1000), 0);
  assert.equal(clock.advance(1017), 1);
  clock.reset();
  assert.equal(clock.advance(20000), 0);
});

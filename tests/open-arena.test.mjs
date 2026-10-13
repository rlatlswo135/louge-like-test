import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BOSSES, PLAYER, STEP, STORM } from '../public/src/content.mjs';
import { createInput, createRun, getStorm, step } from '../public/src/game.mjs';

function quiet() {
  const run = createRun();
  run.boss.timer = 1e6;
  run.boss.def = { ...run.boss.def, speed: 0 };
  return run;
}

test('the whole playable arena is storm-safe for the first minute, including all corners', () => {
  const run = quiet();
  for (const time of [0, 30, 59.9]) for (const x of [PLAYER.radius, ARENA.width - PLAYER.radius]) for (const y of [PLAYER.radius, ARENA.height - PLAYER.radius]) {
    run.stageTime = time; run.player.x = x; run.player.y = y;
    assert.equal(getStorm(run).outside, false, `corner ${x},${y} at ${time}s`);
    assert.equal(getStorm(run).active, false);
    step(run, createInput());
    assert.equal(run.player.hp, run.player.maxHp);
  }
});

test('late storm warns for five harmless seconds, then shrinks gradually and stops', () => {
  const run = quiet();
  run.player.x = 16; run.player.y = 16;
  run.stageTime = 59.99;
  assert.equal(getStorm(run).warning, false);
  run.stageTime = 60;
  assert.equal(getStorm(run).warning, true);
  assert.equal(getStorm(run).shrinksIn, 5);
  run.stageTime = 64.99;
  assert.equal(getStorm(run).outside, false);
  assert.equal(getStorm(run).radius, STORM.radius);
  run.stageTime = 65;
  assert.equal(getStorm(run).warning, false);
  assert.equal(getStorm(run).active, true);
  assert.equal(getStorm(run).radius, STORM.radius);
  run.stageTime = 95;
  assert.equal(getStorm(run).radius, (STORM.radius + STORM.minRadius) / 2);
  assert.equal(getStorm(run).outside, true);
  assert.equal(getStorm(run).dps, 6);
  for (const time of [125, 600]) {
    run.stageTime = time;
    assert.equal(getStorm(run).radius, STORM.minRadius);
    assert.equal(getStorm(run).progress, 1);
  }
});

test('even the final storm leaves roughly seventy percent of movement space safe', () => {
  const run = quiet();
  run.stageTime = 1000;
  let safe = 0, total = 0;
  for (let x = PLAYER.radius; x <= ARENA.width - PLAYER.radius; x += 8) for (let y = PLAYER.radius; y <= ARENA.height - PLAYER.radius; y += 8) {
    run.player.x = x; run.player.y = y; total++;
    if (!getStorm(run).outside) safe++;
  }
  assert.ok(safe / total >= .68 && safe / total <= .75, `${safe}/${total} safe player centers`);
});

test('every boss has distinct, concise briefing overview and actionable hint', () => {
  const bosses = Object.values(BOSSES);
  for (const boss of bosses) for (const field of ['overview', 'hint']) {
    assert.equal(typeof boss[field], 'string', `${boss.id}/${field}`);
    assert.ok(boss[field].length > 10 && boss[field].length < 140);
  }
  assert.equal(new Set(bosses.map(b => b.overview)).size, bosses.length);
  assert.equal(new Set(bosses.map(b => b.hint)).size, bosses.length);
});

test('after pursuit, distant players draw a reachable attack rather than a whiffing sword or short lane', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const run = createRun({ seed });
    run.player.x = 1040; run.player.y = 360; run.boss.x = 440; run.boss.y = 360;
    run.boss.def = { ...run.boss.def, speed: 0, patterns: run.boss.def.patterns.filter(p=>['cleave','slam','fault-line'].includes(p.id)) };
    run.boss.lastPattern = 'hunt'; run.boss.timer = 0;
    step(run, createInput());
    assert.equal(run.boss.pattern.id, 'slam', `seed ${seed}: only the targeted ground strike reaches`);
    assert.ok(run.hazards.every(h => h.phase === 'warn' && h.windup >= .6));
  }
});

test('ranged bosses answer distance with their own artillery, marks or projectiles, not the shared dash', () => {
  for (const stage of [2, 4, 5, 7, 8, 9]) {
    const run = createRun({ stage, seed: 3 });
    run.player.x = 1100; run.player.y = 360; run.boss.x = 200; run.boss.y = 360;
    run.boss.def = { ...run.boss.def, speed: 0 }; run.boss.timer = 0;
    step(run, createInput());
    assert.equal(run.boss.state, 'windup');
    assert.notEqual(run.boss.pattern.id, 'hunt', run.boss.def.id);
    assert.ok(['circle', 'lane', 'projectile'].includes(run.boss.pattern.shape));
  }
});

test('when no different attack reaches, the boss approaches instead of repeating or casting empty space', () => {
  const run = createRun({ stage: 3 });
  run.player.x = 1120; run.player.y = 360; run.boss.x = 160; run.boss.y = 360;
  run.boss.lastPattern = 'hunt'; run.boss.timer = 0;
  run.boss.def={...run.boss.def,patterns:run.boss.def.patterns.filter(p=>['fan','ring','frost-waves'].includes(p.id))};
  for (let i = 0; i < 60; i++) step(run, createInput());
  assert.equal(run.boss.state, 'idle');
  assert.equal(run.hazards.length, 0);
  assert.ok(run.boss.x > 300, 'closing distance, not waiting in place');
});

test('dodging pursuit triggers freshly aimed warning before final recovery', () => {
  const run = createRun(); run.boss.timer = 0;
  step(run, createInput());
  assert.equal(run.boss.pattern.id, 'hunt');
  for (let i = 0; i < 12; i++) step(run, createInput());
  for (let i = 0; i < 120 && run.boss.pattern.id === 'hunt'; i++) step(run, { ...createInput(), right: true });
  assert.equal(run.player.hp, run.player.maxHp);
  assert.equal(run.boss.state,'windup');
  const follow=run.hazards.at(-1), locked=[follow.x,follow.y,follow.angle];
  assert.ok(follow.windup>=.6);
  for(let i=0;i<Math.floor(follow.windup*60)-1;i++)step(run,createInput());
  assert.equal(run.player.hp,run.player.maxHp);
  assert.deepEqual([follow.x,follow.y,follow.angle],locked);
  for(let i=0;i<120&&run.boss.state!=='recover';i++)step(run,createInput());
  assert.equal(run.boss.state,'recover');assert.ok(run.boss.timer>=.65);
  for (const boss of Object.values(BOSSES)) for (const pattern of boss.patterns) {
    if (pattern.distance) assert.ok(pattern.recover >= .65 || pattern.recover===0 && pattern.finisher, `${pattern.id}: actual charge has follow-up recovery`);
  }
});

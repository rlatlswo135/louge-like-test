import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, CARDS, CLASSES, STEP, STORM } from '../public/src/content.mjs';
import * as game from '../public/src/game.mjs';

const input = (patch = {}) => Object.assign(game.createInput(), patch);
const advance = (run, controls, seconds) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) game.step(run, controls);
};
const quiet = (options) => {
  const run = game.createRun(options);
  run.boss.timer = 1e6;
  run.boss.def = { ...run.boss.def, speed: 0 };
  return run;
};

function rewardFor(options = {}) {
  const run = quiet(options);
  run.player.x = 640; run.player.y = 360;
  run.boss.hp = 0;
  game.step(run, input());
  assert.equal(run.status, 'reward');
  return run;
}

test('rare unique offers are seeded, compatible, at most one, and guaranteed only at special rewards', () => {
  assert.equal(CARDS.filter(c => c.rarity === 'unique').length, 25);
  let rare = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const run = rewardFor({ seed });
    const uniques = run.offers.filter(c => c.rarity === 'unique');
    assert.ok(uniques.length <= 1);
    rare += uniques.length;
    assert.equal(new Set(run.offers.map(c => c.id)).size, 3);
    assert.deepEqual(run.offers, rewardFor({ seed }).offers);
  }
  assert.ok(rare>=90 && rare<=150, `seeded distribution near six percent: ${rare}/2000`);
  for(const stage of [0,8,18])assert.ok(Array.from({length:25},(_,i)=>rewardFor({stage,seed:i+1})).some(run=>run.offers.every(c=>c.rarity!=='unique')),'no normal or special reward guarantee');
  for (const cls of CLASSES) for(const weapon of cls.weapons) {
    const run = rewardFor({ stage: 4, seed:12, classId: cls.id, weaponId: weapon.id });
    const unique=run.offers.find(c=>c.rarity==='unique');assert.ok(unique);
    assert.ok(!unique.kind || unique.kind===weapon.kind);
    assert.ok(!unique.classId || unique.classId===cls.id);
    assert.equal(game.chooseCard(run,unique.id),true);
    for(const card of CARDS.filter(c=>c.rarity==='unique'))run.cards[card.id]=1;
    run.boss.hp=0;game.step(run,input());
    assert.equal(run.status,'reward');
    assert.ok(run.offers.every(c=>c.rarity!=='unique'),'owned uniques never offered again');
  }
});

test('class uniques change attack delivery with explicit costs',()=>{
 const melee=quiet();melee.cards['throw-master']=1;
 assert.equal(game.getStats(melee).weapon.kind,'projectile');assert.ok(game.getStats(melee).baseDamage<melee.weapon.damage);
 const gun=quiet({classId:'gunslinger'});gun.cards.shotgun=1;
 game.step(gun,input({attack:true,aimX:1000,aimY:gun.player.y}));
 assert.equal(gun.projectiles.length,5);assert.equal(game.getStats(gun).magazine,4);
 const echo=quiet({classId:'fighter'});echo.cards.afterimage=1;
 game.step(echo,input({attack:true,aimX:1000,aimY:echo.player.y}));assert.ok(echo.attacks.some(a=>a.kind==='emitter'));
});

test('first boss closes long distance with a locked warning instead of whiffing melee', () => {
  const run = game.createRun();
  run.boss.timer = 0;
  const before = Math.hypot(run.player.x - run.boss.x, run.player.y - run.boss.y);
  game.step(run, input());
  const lane = run.hazards.find(h => h.pattern === 'hunt');
  assert.ok(lane, 'range must trigger a closing dash, not a harmless cleave');
  assert.equal(lane.phase, 'warn');
  assert.ok(lane.windup >= .6, 'fast but still readable');
  advance(run, input(), lane.windup + lane.active - STEP);
  assert.ok(Math.hypot(run.player.x - run.boss.x, run.player.y - run.boss.y) < before / 2);
});

test('standing still and holding sniper attack cannot clear even the first boss', () => {
  for (const seed of [1, 42, 73021]) {
    const run = game.createRun({ classId: 'gunslinger', weaponId: 'sniper', seed });
    run.player.x = 870; run.player.y = 360;
    while (run.status === 'playing' && run.time < 12) {
      game.step(run, input({ attack: true, aimX: run.boss.x, aimY: run.boss.y }));
    }
    assert.equal(run.status, 'dead', `seed ${seed}: idle ranged firing must be punished`);
    assert.ok(run.boss.hp > 0);
    assert.ok(run.time < 10);
  }
});

test('archer charges then releases or auto-fires at full draw; dodge cancels a draw', () => {
  const run = quiet({ classId: 'archer', weaponId: 'bow' });
  const aim = { aimX: 1000, aimY: run.player.y };
  advance(run, input({ ...aim, attack: true }), .25);
  assert.equal(run.projectiles.length, 0, 'drawing does not fire on first click');
  assert.ok(run.player.charge > 0);
  game.step(run, input(aim));
  assert.equal(run.projectiles.length, 1, 'early release fires once');
  const partial = run.projectiles[0];
  assert.ok(partial.damage < run.weapon.damage);
  assert.ok(partial.maxLife * run.weapon.speed < run.weapon.reach);
  const full = quiet({ classId: 'archer', weaponId: 'bow' });
  advance(full, input({ ...aim, attack: true }), full.weapon.chargeTime + STEP);
  assert.equal(full.projectiles.length, 1);
  assert.equal(full.projectiles[0].damage, full.weapon.damage*.75);
  advance(full,input(aim),.1);
  assert.equal(full.projectiles.length,2);
  assert.equal(full.projectiles.reduce((sum,q)=>sum+q.damage,0),full.weapon.damage);
  assert.equal(full.player.charge, 0);
  const cancel = quiet({ classId: 'archer', weaponId: 'bow' });
  advance(cancel, input({ ...aim, attack: true }), .2);
  game.step(cancel, input({ ...aim, dodge: true, right: true }));
  assert.equal(cancel.player.charge, 0);
  assert.equal(cancel.projectiles.length, 0);
});

test('guns burst from finite magazines, then cannot fire until auto reload finishes', () => {
  const run = quiet({ classId: 'gunslinger', weaponId: 'revolver' });
  assert.equal(run.player.ammo, 6);
  const aim = input({ attack: true, aimX: 1000, aimY: run.player.y });
  let ticks = 0;
  while (run.player.ammo > 0 && ticks++ < 180) game.step(run, aim);
  assert.equal(run.player.ammo, 0);
  assert.ok(run.player.reloadTime > 0);
  const shots = run.events.filter(e => e.type === 'swing').length;
  assert.equal(shots, 6);
  advance(run, aim, run.weapon.reloadTime - .05);
  assert.equal(run.events.filter(e => e.type === 'swing').length, shots, 'reload is real downtime');
  advance(run, aim, .1);
  assert.ok(run.events.filter(e => e.type === 'swing').length > shots);
  assert.ok(run.player.ammo > 0);
  const moving = quiet({ classId: 'gunslinger', weaponId: 'revolver' });
  moving.player.x = 500; moving.player.y = 360;
  advance(moving, input({ attack: true, right: true, aimX: 1000, aimY: 360 }), .5);
  assert.ok(moving.player.x - 500 < 100, 'cannot run at full speed during a gun burst');
});

test('storm damage is continuous; repeatedly touching the safe edge cannot reset away damage', () => {
  const run = quiet();
  run.stageTime = STORM.delay + STORM.warning + STORM.duration;
  for (let i = 0; i < 4; i++) {
    run.player.x = 30; run.player.y = 30;
    advance(run, input(), .1);
    run.player.x = 640; run.player.y = 360;
    game.step(run, input());
  }
  assert.ok(Math.abs(run.player.hp - (run.player.maxHp - STORM.dps * .4)) < 1e-6);
});

test('every projectile loadout misses beyond its visible range, while reach card extends real travel', () => {
  for (const cls of CLASSES) for (const weapon of cls.weapons.filter(w => w.kind === 'projectile')) {
    assert.ok(weapon.reach <= 430, `${weapon.id} must have a tactical, finite range`);
    const shoot = (upgrade) => {
      const run = quiet({ classId: cls.id, weaponId: weapon.id });
      run.player.x = 400; run.player.y = 360;
      run.boss.x = 400 + weapon.reach + run.boss.def.radius + weapon.radius + 12;
      run.boss.y = 360;
      if (upgrade) run.cards.reach = 1;
      const aim = { aimX: run.boss.x, aimY: run.boss.y };
      advance(run, input({ ...aim, attack: true }), weapon.chargeTime || STEP);
      advance(run, input(aim), 1.5);
      return run.boss.maxHp - run.boss.hp;
    };
    assert.equal(shoot(false), 0, `${weapon.id}: beyond cap must miss`);
    assert.ok(shoot(true) > 0, `${weapon.id}: range upgrade must enable a previously impossible hit`);
  }
});

test('shrinking storm damages only outside, bypasses dodge/shield, and resets per stage', () => {
  assert.equal(typeof game.getStorm, 'function');
  const run = quiet();
  const first = game.getStorm(run);
  assert.equal(first.outside, false);
  advance(run, input(), 3);
  assert.equal(run.player.hp, run.player.maxHp);
  assert.equal(game.getStorm(run).radius, first.radius);
  run.stageTime = STORM.delay + STORM.warning + STORM.duration;
  run.player.x = 30;
  run.player.y = 30;
  run.player.shield = 100;
  run.player.shieldTime = 99;
  for (let i = 0; i < 30; i++) {
    run.player.dodgeTime = run.cls.dodge.duration;
    run.player.dodgeX = run.player.dodgeY = 0;
    game.step(run, input());
  }
  assert.ok(run.player.hp < run.player.maxHp, 'storm cannot be evaded with shield or i-frames');
  assert.equal(run.player.shield, 100);
  run.player.x = ARENA.width / 2; run.player.y = ARENA.height / 2;
  const hp = run.player.hp;
  advance(run, input(), 65);
  assert.equal(run.player.hp, hp);
  assert.equal(game.getStorm(run).radius, STORM.minRadius);
  const stopped = run.stageTime;
  run.status = 'reward'; run.offers = [CARDS[0]];
  game.step(run, input());
  assert.equal(run.stageTime, stopped);
  assert.equal(game.chooseCard(run, CARDS[0].id), true);
  assert.equal(run.stageTime, 0);
  assert.equal(game.getStorm(run).radius, first.radius);
  assert.equal(game.getStorm(run).outside, false);
  assert.equal(run.stormExposure, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BOSSES, LIMITS, MAX_CATCH_UP_STEPS, PLAYER, STEP } from '../public/src/content.mjs';
import {
  advanceClock,
  circleHitsCircle,
  createClock,
  createInput,
  createRun,
  hazardHitsCircle,
  playerInvulnerable,
  resetClock,
  sectorHitsCircle,
  spawnHazard,
  spawnParticle,
  step,
} from '../public/src/game.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

function quietRun(opts) {
  const run = createRun(opts);
  // 보스를 구석에 고정하고 패턴을 멈춘 상태에서 플레이어만 검증
  run.boss.timer = 1e9;
  run.boss.def = { ...run.boss.def, speed: 0 };
  run.boss.x = ARENA.width - 80;
  run.boss.y = 80;
  return run;
}

function runFor(run, input, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) step(run, input, STEP);
}

test('대각선 이동은 정규화되어 기본 속도를 넘지 않는다', () => {
  const run = quietRun();
  run.player.x = 400;
  run.player.y = 400;
  const input = createInput();
  input.right = input.down = true;
  runFor(run, input, 0.5);
  const dist = Math.hypot(run.player.x - 400, run.player.y - 400);
  near(dist, PLAYER.speed * 0.5, 1e-3);
});

test('이동은 아레나 경계에 제한된다', () => {
  const run = quietRun();
  // Spatial-boundary fixture survives storm ticks; survival is tested separately.
  run.player.hp = run.player.maxHp = 10000;
  const input = createInput();
  input.left = input.up = true;
  runFor(run, input, 10);
  assert.equal(run.player.x, PLAYER.radius);
  assert.equal(run.player.y, PLAYER.radius);
  input.left = input.up = false;
  input.right = input.down = true;
  runFor(run, input, 10);
  assert.equal(run.player.x, ARENA.width - PLAYER.radius);
  assert.equal(run.player.y, ARENA.height - PLAYER.radius);
});

function placeInReach(run) {
  const b = run.boss;
  run.player.x = b.x;
  run.player.y = b.y + b.def.radius + PLAYER.radius + 10;
}

test('검의 3연계는 평균 화력을 유지하고 타격당 한 번만 피해를 준다', () => {
  const run = quietRun();
  placeInReach(run);
  const input = createInput();
  input.aimX = run.boss.x;
  input.aimY = run.boss.y;
  input.attack = true;
  step(run, input);
  assert.equal(run.weapon.damage, 44);
  near(run.boss.hp, run.boss.maxHp - 44*.85);
  // 베기 활성 시간 동안 프레임마다 중복 피해가 없어야 한다.
  runFor(run, input, run.weapon.swingTime);
  near(run.boss.hp, run.boss.maxHp - 44*.85);
  // Complete three beats: two cuts then a thrust; each hit resolves only once.
  const run2=quietRun();placeInReach(run2);const input2={...input};
  let thrust=false;for(let n=0;n<70;n++){step(run2,input2);thrust ||= run2.attacks.some(a=>a.shape==='lane');}
  const hits=run2.events.filter(e=>e.type==='bossHit');
  assert.equal(hits.length,3);near(hits.reduce((sum,e)=>sum+e.damage,0),44*3);
  assert.ok(thrust,'third beat uses a narrow thrust');

});

test('리치 밖 보스는 피해를 받지 않는다', () => {
  const run = quietRun();
  const b = run.boss;
  run.player.x = b.x;
  run.player.y = b.y + b.def.radius + 80 + 5;
  const input = createInput();
  input.aimX = b.x;
  input.aimY = b.y;
  input.attack = true;
  step(run, input);
  assert.equal(b.hp, b.maxHp);
});

test('회피는 쿨타임 1.1초를 연타·유지로 우회할 수 없다', () => {
  const run = quietRun();
  run.player.x = 640;
  run.player.y = 500;
  const input = createInput();
  input.right = true;
  input.dodge = true;
  step(run, input);
  assert.ok(run.player.dodgeTime > 0);
  assert.equal(input.dodge, false, '회피 입력은 소비된다');
  let dodges = 1;
  // 1.0초 동안 매 프레임 회피 입력
  for (let i = 0; i < 60; i++) {
    const before = run.player.dodgeCooldown;
    input.dodge = true;
    step(run, input);
    if (run.player.dodgeCooldown > before) dodges++;
  }
  assert.equal(dodges, 1);
  runFor(run, createInput(), 0.2);
  input.dodge = true;
  step(run, input);
  assert.ok(run.player.dodgeCooldown > 1.0, '쿨타임 후 다시 회피 가능');
});

test('회피 방향: 이동 방향, 없으면 마지막 이동 방향', () => {
  const run = quietRun();
  run.player.x = 640;
  run.player.y = 400;
  const input = createInput();
  input.left = true;
  step(run, input);
  input.left = false;
  input.dodge = true;
  step(run, input);
  near(run.player.dodgeX, -1);
  near(run.player.dodgeY, 0);
  runFor(run, input, 0.22);
  near(run.player.x, 640 - PLAYER.speed * STEP - 150, 1e-6);
});

test('회피 무적은 시작 후 0.16초 동안만 유지된다', () => {
  const run = quietRun();
  run.player.x = 640;
  run.player.y = 500;
  const input = createInput();
  input.dodge = true;
  let invulnFrames = 0;
  for (let i = 0; i < 20; i++) {
    step(run, input);
    if (playerInvulnerable(run)) invulnFrames++;
  }
  // 시작 스텝의 경과 1/60초부터 판정 → 경과 < 0.16인 스텝 1..9
  assert.equal(invulnFrames, 9);
  assert.ok(invulnFrames * STEP <= 0.16 + 1e-9);
});

test('원/부채꼴 경계 fixture', () => {
  assert.equal(circleHitsCircle(0, 0, 100, 116, 0, 16), true, '경계 접촉 포함');
  assert.equal(circleHitsCircle(0, 0, 100, 116.01, 0, 16), false);
  const s = { x: 0, y: 0, radius: 230, angle: 0, halfAngle: (55 * Math.PI) / 180 };
  assert.equal(sectorHitsCircle(s, 246, 0, 16), true, '정면 끝 경계');
  assert.equal(sectorHitsCircle(s, 246.1, 0, 16), false);
  assert.equal(sectorHitsCircle(s, -60, 0, 16), false, '뒤쪽은 안전');
  assert.equal(sectorHitsCircle(s, -10, 0, 16), true, '중심에 겹치면 피격');
  // 가장자리 바로 바깥: 가장자리 선분에서 수직 거리 16 경계
  const edge = s.halfAngle;
  const along = 100;
  const px = Math.cos(edge) * along - Math.sin(edge) * 16;
  const py = Math.sin(edge) * along + Math.cos(edge) * 16;
  assert.equal(sectorHitsCircle(s, px * 0.999, py * 0.999, 16), true);
  const px2 = Math.cos(edge) * along - Math.sin(edge) * 16.5;
  const py2 = Math.sin(edge) * along + Math.cos(edge) * 16.5;
  assert.equal(sectorHitsCircle(s, px2, py2, 16), false);
});

function bossWithPattern(patternId, seed = 1) {
  const run = createRun({ seed });
  const b = run.boss;
  b.def = { ...b.def, pursuit: null, raid: null, patterns: b.def.patterns.filter(p => p.id === patternId).map(p => ({ ...p, sequence: 1 })) };
  return run;
}

function toWindup(run, input = createInput()) {
  while (run.boss.state !== 'windup') step(run, input);
  return run.hazards[0];
}

for (const id of ['cleave', 'slam']) {
  test(`${id}: 예고 중 피해 없음, 활성 영역 안에서만 피해`, () => {
    const pattern = BOSSES['iron-warden'].patterns.find((p) => p.id === id);
    assert.ok(pattern.windup >= .6, '어려워도 최소 0.6초 예고');
    const run = bossWithPattern(id);
    run.player.x = run.boss.x;
    run.player.y = run.boss.y + 150;
    const h = toWindup(run);
    assert.equal(h.phase, 'warn');
    run.hazards = [h]; // Single strike only; combo timing has its own integration check.
    // 플레이어를 판정 영역 한가운데에 고정
    const inside = () => {
      run.player.x = h.shape === 'circle' ? h.x : h.x + Math.cos(h.angle) * 120;
      run.player.y = h.shape === 'circle' ? h.y : h.y + Math.sin(h.angle) * 120;
    };
    inside();
    const hp = run.player.hp;
    while (h.phase === 'warn') {
      inside();
      step(run, createInput());
      if (h.phase === 'warn') assert.equal(run.player.hp, hp, '예고 중 피해 없음');
    }
    assert.equal(run.player.hp, hp - pattern.damage*(1-run.cls.damageReduction), '활성 시작 시 1회 피해');
    for (let i = 0; i < 20; i++) step(run, createInput());
    assert.equal(run.player.hp, hp - pattern.damage*(1-run.cls.damageReduction), '같은 공격의 중복 피해 없음');
  });

  test(`${id}: 활성 영역 밖은 피해 없음`, () => {
    const run = bossWithPattern(id);
    run.player.x = run.boss.x;
    run.player.y = run.boss.y + 150;
    const h = toWindup(run);
    const hp = run.player.hp;
    while (run.boss.state === 'windup' || run.boss.state === 'active') {
      // 바깥 경계 + 1
      if (h.shape === 'circle') {
        run.player.x = h.x + h.radius + PLAYER.radius + 1;
        run.player.y = h.y;
      } else {
        run.player.x = h.x - Math.cos(h.angle) * (run.boss.def.radius + PLAYER.radius + 1);
        run.player.y = h.y - Math.sin(h.angle) * (run.boss.def.radius + PLAYER.radius + 1);
      }
      step(run, createInput());
    }
    assert.equal(run.player.hp, hp);
  });

  test(`${id}: 발동 순간 무적으로 피하면 남은 잔상은 피해를 주지 않는다`, () => {
    for (const offset of [0, 1, 8, 9, 10, 11]) {
      const run = bossWithPattern(id);
      run.player.x = run.boss.x;
      run.player.y = run.boss.y + 150;
      const h = toWindup(run);
      run.hazards = [h]; // Isolate one strike from the new multi-strike combo.
      const framesToActive = Math.round((h.windup - h.t) / STEP);
      const hp = run.player.hp;
      const pin = () => {
        // 회피 이동을 무시하고 영역 중앙에 고정
        run.player.x = h.shape === 'circle' ? h.x : h.x + Math.cos(h.angle) * 120;
        run.player.y = h.shape === 'circle' ? h.y : h.y + Math.sin(h.angle) * 120;
      };
      // 활성 시작 offset 프레임 전에 회피
      for (let i = 0; i < framesToActive - offset - 1; i++) {
        pin();
        step(run, createInput());
      }
      const input = createInput();
      input.dodge = true;
      let hitWhileInvuln = false;
      let hitAfter = false;
      while (run.hazards.length) {
        pin();
        const before = run.player.hp;
        step(run, input);
        if (run.player.hp < before) {
          if (playerInvulnerable(run)) hitWhileInvuln = true;
          else hitAfter = true;
        }
      }
      assert.equal(hitWhileInvuln, false, `offset ${offset}: 무적 중 피해 없음`);
      // Instant strikes resolve once: leaving invulnerability later does not resurrect a hit.
      const expected=offset>=9;
      assert.equal(hitAfter, expected, `offset ${offset}`);
      assert.equal(run.player.hp, expected ? hp - h.damage*(1-run.cls.damageReduction) : hp);
    }
  });
}

test('첫 보스는 200ms 반응 후 이동+회피로 탈출 가능하며 짧은 반격 창을 준다', () => {
  const def = BOSSES['iron-warden'];
  for (const pattern of def.patterns) {
    // 최악 위치: 판정 중심에서 탈출해야 하는 최대 거리
    const escape = pattern.shape === 'circle'
      ? pattern.radius + PLAYER.radius
      : pattern.radius + PLAYER.radius - (def.radius + PLAYER.radius);
    const dodge = createRun().cls.dodge;
    const travel = PLAYER.speed * (pattern.windup - .2 - dodge.duration) + dodge.distance;
    assert.ok(escape < travel, `${pattern.id}: 200ms 반응 후 회피 기동으로 탈출`);
    assert.ok(pattern.recover >= .28 && pattern.recover < .6, `${pattern.id}: 짧지만 반격 가능한 회복`);
  }
});

test('실제 시뮬레이션: 예고 후 이동/회피로 피하고 반격 창에 도달한다', () => {
  for (const id of ['cleave', 'slam']) {
    const run = bossWithPattern(id, 7);
    run.player.x = run.boss.x;
    run.player.y = run.boss.y + 120;
    const h = toWindup(run);
    const hp = run.player.hp;
    const input = createInput();
    // 반응 지연 0.2초 후 판정 바깥 방향으로 이동
    runFor(run, input, 0.2);
    const ax = run.player.x - (h.shape === 'circle' ? h.x : h.x);
    const ay = run.player.y - (h.shape === 'circle' ? h.y : h.y);
    if (h.shape === 'sector') {
      // 보스 뒤쪽으로 돌아간다
      input.left = true;
      input.up = true;
    } else {
      input.down = ay >= 0;
      input.up = ay < 0;
      input.right = ax >= 0;
      input.left = ax < 0;
    }
    if (id === 'slam') input.dodge = true;
    while (run.boss.state === 'windup' || run.boss.state === 'active') step(run, input);
    assert.equal(run.player.hp, hp, `${id}: 피해 없이 회피`);
    assert.equal(run.boss.state, 'recover');
  }
});

test('동시 사망/처치는 사망을 우선하고 이후 상태가 진행되지 않는다', () => {
  const run = bossWithPattern('slam');
  const h = toWindup(run);
  run.player.hp = 1;
  run.boss.hp = 32;
  run.player.x = run.boss.x;
  run.player.y = run.boss.y + run.boss.def.radius + PLAYER.radius + 5;
  h.x = run.player.x;
  h.y = run.player.y;
  const input = createInput();
  input.aimX = run.boss.x;
  input.aimY = run.boss.y;
  // 활성 직전 프레임까지 이동
  while (h.t + STEP < h.windup - 1e-9) step(run, createInput());
  input.attack = true;
  step(run, input);
  assert.equal(run.boss.hp, 0);
  assert.equal(run.player.hp, 0);
  assert.equal(run.status, 'dead');
  const t = run.time;
  step(run, input);
  assert.equal(run.time, t, '종료 후 진행 없음');
  assert.equal(run.hazards.length, 0);
});

test('보스 처치 후 공격·위험 영역이 남지 않는다', () => {
  const run = bossWithPattern('slam');
  toWindup(run);
  run.boss.hp = 32;
  placeInReach(run);
  const input = createInput();
  input.aimX = run.boss.x;
  input.aimY = run.boss.y;
  input.attack = true;
  step(run, input);
  assert.equal(run.status, 'reward');
  assert.equal(run.boss.state, 'dead');
  assert.equal(run.hazards.length, 0);
  for (let i = 0; i < 300; i++) step(run, input);
  assert.equal(run.hazards.length, 0);
});

test('새 런은 이전 런 엔티티를 공유하지 않는다', () => {
  const a = createRun({ seed: 3 });
  runFor(a, createInput(), 3);
  a.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, color: '#fff' });
  const b = createRun({ seed: 3 });
  assert.equal(b.time, 0);
  assert.equal(b.hazards.length, 0);
  assert.equal(b.particles.length, 0);
  assert.equal(b.boss.hp, b.boss.maxHp);
  assert.equal(b.player.hp, b.player.maxHp);
  assert.notEqual(a.hazards, b.hazards);
});

test('고정 스텝 시계: catch-up 상한과 재개 시 delta 초기화', () => {
  const clock = createClock();
  assert.equal(advanceClock(clock, 1000), 0);
  assert.equal(advanceClock(clock, 1000 + 1000 / 60), 1);
  assert.equal(advanceClock(clock, 1000 + 1000 / 60 + 5000), MAX_CATCH_UP_STEPS, '긴 지연은 상한');
  assert.equal(clock.acc, 0);
  resetClock(clock);
  assert.equal(advanceClock(clock, 999999), 0, '재개 첫 프레임은 시간 점프 없음');
  assert.equal(advanceClock(clock, 999999 + 1000 / 30), 2);
});

test('상한 계약: 위험 영역 32 초과는 생략하지 않고 오류, 장식 입자는 512 유지', () => {
  assert.deepEqual({ ...LIMITS }, { projectiles: 256, hazards: 32, particles: 512, playerAttacks:64 });
  const run = createRun();
  for (let i = 0; i < LIMITS.hazards; i++) spawnHazard(run, { shape: 'circle', x: 0, y: 0, radius: 1 });
  assert.throws(() => spawnHazard(run, { shape: 'circle', x: 0, y: 0, radius: 1 }));
  for (let i = 0; i < LIMITS.particles + 100; i++) spawnParticle(run, { x: i, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, color: '#fff' });
  assert.equal(run.particles.length, LIMITS.particles);
  assert.equal(run.particles.at(-1).x, LIMITS.particles + 99);
});

test('자연 전투에서 위험 영역·입자 수는 상한 안에 머문다', () => {
  const run = createRun({ seed: 11 });
  const input = createInput();
  input.attack = true;
  let maxHazards = 0;
  let maxParticles = 0;
  for (let i = 0; i < 60 * 60 && run.status === 'playing'; i++) {
    input.aimX = run.boss.x;
    input.aimY = run.boss.y;
    step(run, input);
    maxHazards = Math.max(maxHazards, run.hazards.length);
    maxParticles = Math.max(maxParticles, run.particles.length);
  }
  assert.ok(maxHazards <= LIMITS.hazards && maxHazards >= 1);
  assert.ok(maxParticles <= LIMITS.particles);
});

test('hazardHitsCircle은 표식 도형 데이터 그대로 판정한다', () => {
  const circle = { shape: 'circle', x: 100, y: 100, radius: 50 };
  assert.equal(hazardHitsCircle(circle, 166, 100, 16), true);
  assert.equal(hazardHitsCircle(circle, 167, 100, 16), false);
});

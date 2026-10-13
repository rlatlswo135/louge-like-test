import test from 'node:test';
import assert from 'node:assert/strict';
import { ENCOUNTER_ROCKS, ENCOUNTER_SEALS, ENCOUNTER_SIGILS, encounterBeamEnd, encounterCovered, encounterRockAt, encounterProjectileRockHit, encounterProjectileResolved, updateSpecialEncounter, encounterDamageFloor, blockEncounterMovement, strikeEncounterTargets, reflectEncounterProjectile, encounterReturnHit, cleanupEncounter } from '../public/src/encounters.mjs';
const make = (stage, phase = 1) => ({ stage, stageTime: 11, status: 'playing', boss: { x: 640, y: 120, hp: 800, maxHp: 1000, phase, def: { special: true, phaseThresholds: stage === 19 ? [.67, .33] : [.5] } }, player: { x: 640, y: 600, dodgeTime: 0 }, tutorial: null });

test('stage 5 shared cover geometry distinguishes front, covered back, and edge; rocks are solid', () => {
  const rock = ENCOUNTER_ROCKS[0], dx = rock.x - 640, dy = rock.y - 360, n = Math.hypot(dx, dy);
  const front = { x: rock.x - dx / n * 65, y: rock.y - dy / n * 65 };
  const behind = { x: rock.x + dx / n * 65, y: rock.y + dy / n * 65 };
  const edge = { x: behind.x + -dy / n * 48, y: behind.y + dx / n * 48 };
  assert.equal(encounterCovered(front.x, front.y), false);
  assert.equal(encounterCovered(behind.x, behind.y), true);
  assert.equal(encounterCovered(edge.x, edge.y), false);
  const s = make(4); s.player.x = rock.x; s.player.y = rock.y;
  updateSpecialEncounter(s, .01);
  assert.equal(blockEncounterMovement(s), rock);
  assert.equal(encounterProjectileRockHit({ prevX: 640, prevY: 360, x: rock.x, y: rock.y, radius: 3 }), rock);
  const hp = encounterDamageFloor(s); assert.ok(hp > s.boss.maxHp * .5);
});

test('stage 5 pulse phases bounded and tutorial/forced-zero excluded', () => {
  const s = make(4); let count = 0;
  s.boss.hp = 400;
  updateSpecialEncounter(s, .01, { spawnHazard: h => { if (h.encounter === 'cover-pulse') count++; } });
  assert.ok(s.boss.hp > s.boss.maxHp * .5);
  const finalPhase = make(19, 3); updateSpecialEncounter(finalPhase, .01);
  assert.equal(encounterDamageFloor(finalPhase), 1);
  assert.equal(count, 0);
  for (let i = 0; i < 1500; i++) updateSpecialEncounter(s, .01);
  assert.equal(s.encounter.complete, true); assert.equal(s.encounter.pulseCount, 3);
  s.boss.hp = 0; assert.equal(encounterDamageFloor(s), 0);
  cleanupEncounter(s); assert.equal(s.encounter, null);
  const tutorial = make(4); tutorial.tutorial = {};
  updateSpecialEncounter(tutorial, 1); assert.equal(tutorial.encounter, undefined);
  const forced = make(4); forced.boss.hp = 0; updateSpecialEncounter(forced, 1);
  assert.equal(forced.encounter, undefined);
});

test('stage 10 seals block beam, wrong aim misses; correct aimed shots break each stone', () => {
  const wrong = encounterBeamEnd(640, 120, 0);
  assert.equal(wrong.seal, null);
  for (const seal of ENCOUNTER_SEALS) {
    const beam = encounterBeamEnd(640, 120, Math.atan2(seal.y - 120, seal.x - 640));
    assert.equal(beam.seal, seal); assert.ok(beam.distance < 1500);
  }
  const s = make(9); let lines = [];
  updateSpecialEncounter(s, .01, { spawnHazard: h => lines.push(h) });
  // First target intentionally misses; only standing behind and aligned with seal produces block.
  for (let i = 0; i < 20 && s.encounter.shot; i++) updateSpecialEncounter(s, .05, { spawnHazard: h => lines.push(h) });
  assert.equal(s.encounter.sealMask, 0);
  for (const seal of ENCOUNTER_SEALS) {
    s.player.x = seal.x * 2 - s.boss.x; s.player.y = seal.y * 2 - s.boss.y;
    s.encounter.markAt = s.encounter.elapsed;
    updateSpecialEncounter(s, .01, { spawnHazard: h => lines.push(h) });
    for (let i = 0; i < 20 && s.encounter.shot; i++) updateSpecialEncounter(s, .05, { spawnHazard: h => lines.push(h) });
  }
  assert.equal(s.encounter.sealMask, 3); assert.ok(lines.every(h => h.length <= 1500));
});

test('stage 15 exposed sigils take one real primary hit each; secondary/repeated attacks ignored', () => {
  const s = make(14); updateSpecialEncounter(s, .01);
  let dealt = 0;
  for (const sigil of ENCOUNTER_SIGILS) {
    const hit = target => target === sigil;
    assert.equal(strikeEncounterTargets(s, hit, () => dealt++, { kind: 'melee' }), 1);
    assert.equal(strikeEncounterTargets(s, hit, () => dealt++, { kind: 'projectile' }), 0);
  }
  assert.equal(dealt, 3); assert.equal(s.encounter.complete, true);
  const t = make(14); updateSpecialEncounter(t, .01);
  assert.equal(strikeEncounterTargets(t, () => true, () => {}, { kind: 'meteor', secondary: true }), 0);
  assert.equal(strikeEncounterTargets(t, () => true, () => {}, { kind: 'fake' }), 0);
});

test('stage 20 requires timed true invulnerability reflect and actual boss return hit', () => {
  const s = make(19); let spawned;
  updateSpecialEncounter(s, .01, { spawnProjectile: q => spawned = q });
  for (let i = 0; i < 100 && !spawned; i++) updateSpecialEncounter(s, .02, { spawnProjectile: q => spawned = q });
  assert.ok(spawned); spawned.x = s.player.x; spawned.y = s.player.y;
  assert.equal(reflectEncounterProjectile(s, spawned, { playerInvulnerable: () => false }), false);
  assert.equal(spawned.encounterResolved, true);
  assert.equal(reflectEncounterProjectile(s, spawned, { playerInvulnerable: () => true }), false);
  for (let i = 0; i < 100 && (!s.encounter.shot || s.encounter.shot === spawned); i++) updateSpecialEncounter(s, .02, { spawnProjectile: q => spawned = q });
  assert.ok(spawned && spawned.encounterBit === 1);
  spawned.x = s.player.x; spawned.y = s.player.y;
  assert.equal(reflectEncounterProjectile(s, spawned, { playerInvulnerable: () => true }), true);
  assert.equal(spawned.owner, 'player'); assert.equal(spawned.secondary, true);
  let bossDamage = 0;
  assert.equal(encounterReturnHit(s, spawned, d => bossDamage += d), true);
  assert.equal(bossDamage, 26);
  assert.equal(encounterReturnHit(s, spawned, d => bossDamage += d), false);
  assert.equal(encounterProjectileResolved(s, spawned), false);
  for (let expected = 2; expected <= 3; expected++) {
    spawned = null;
    for (let i = 0; i < 100 && !spawned; i++) updateSpecialEncounter(s, .02, { spawnProjectile: q => spawned = q });
    assert.ok(spawned); spawned.x = s.player.x; spawned.y = s.player.y; s.player.dodgeTime = .1;
    assert.equal(reflectEncounterProjectile(s, spawned, { playerInvulnerable: () => true }), true);
    encounterReturnHit(s, spawned, () => {});
    if (expected === 2) assert.equal(s.encounter.complete, false);
  }
  assert.equal(s.encounter.complete, true);
  const wrong = make(19); updateSpecialEncounter(wrong, .01); const q = { owner: 'boss', encounterBit: 1, radius: 10, x: wrong.player.x, y: wrong.player.y };
  assert.equal(reflectEncounterProjectile(wrong, q, { guardActive: () => true }), true);
});

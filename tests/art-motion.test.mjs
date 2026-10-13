import test from 'node:test';
import assert from 'node:assert/strict';
import { drawBossArt } from '../public/src/art.mjs';

function canvas() {
  const calls = [];
  const gradient = { addColorStop() {} };
  const g = new Proxy({}, {
    get(_, key) {
      if (key === 'createLinearGradient') return (...args) => { calls.push([key, ...args]); return gradient; };
      if (key === 'measureText') return () => ({ width: 0 });
      return (...args) => calls.push([key, ...args]);
    },
    set(_, key, value) { calls.push([key, value]); return true; },
  });
  return { g, calls };
}

const rotations = (motion, id = 'iron-warden', state = {}, time = 1) => {
  const { g, calls } = canvas();
  drawBossArt(g, id, 42, state, time, motion);
  return calls.filter(([name]) => name === 'rotate').map(([, angle]) => angle);
};

test('anticipation, strike and recovery produce distinct, directional boss poses', () => {
  const windup = rotations({ anticipation: 1, angle: .6 });
  const strike = rotations({ strike: .5, angle: .6 });
  const recovery = rotations({ recovery: .5, angle: .6 });
  assert.notDeepEqual(windup, strike);
  assert.notDeepEqual(strike, recovery);
  assert.notDeepEqual(rotations({ strike: .5, angle: -.6 }), strike);
});

test('weapon pose connects preparation, release and recovery without snapping backward', () => {
  const pose = motion => rotations(motion).at(-1);
  assert.ok(Math.abs(pose({anticipation:1})-pose({strike:0}))<1e-9);
  assert.ok(Math.abs(pose({strike:1})-pose({recovery:0}))<1e-9);
  assert.ok(Math.abs(pose({recovery:1})-pose({anticipation:0}))<1e-9);
  assert.ok(pose({strike:.9})>pose({strike:.5}));
});

test('boss archetypes express different attacks and reduced motion freezes ornament', () => {
  const pose = { anticipation: .8, angle: -.4 };
  assert.notDeepEqual(rotations(pose, 'iron-warden'), rotations(pose, 'dusk-executioner'));
  assert.deepEqual(rotations({ reducedMotion: true }, 'storm-orb', {}, 0), rotations({ reducedMotion: true }, 'storm-orb', {}, 8));
});

test('all boss illustrations accept strike motion with finite drawing coordinates', () => {
  for (const id of ['iron-warden', 'ravager', 'ember-guardian', 'frost-watcher', 'storm-orb', 'iron-bastion', 'twin-blades', 'abyss-shaman', 'dusk-executioner', 'rift-lord']) {
    const { g, calls } = canvas();
    drawBossArt(g, id, 42, {}, 1, { strike: .5, angle: 1.2 });
    assert.ok(calls.flat(Infinity).every(value => typeof value !== 'number' || Number.isFinite(value)), id);
  }
});

test('boss IDs retain explicit queen, leviathan, colossus and matriarch anatomy', () => {
  const capture=id=>{const {g,calls}=canvas();drawBossArt(g,id,42,{},0);return calls;};
  const queen=capture('mire-queen'),leviathan=capture('void-leviathan'),colossus=capture('thunder-colossus'),matriarch=capture('night-matriarch');
  const hasPoint=(calls,x,y)=>calls.some(c=>(c[0]==='moveTo'||c[0]==='lineTo')&&c[1]===x&&c[2]===y);
  assert.ok(hasPoint(queen,0,-83),'queen has raised crown points');
  assert.ok(hasPoint(leviathan,20,27),'leviathan has trailing tentacle ends, not beast horns');
  assert.ok(hasPoint(colossus,43,8),'colossus has wider mass than standard armor');
  assert.ok(hasPoint(matriarch,61,-45),'matriarch has broad wings');
});

test('optional motion keeps portrait callers safe and does not mutate combat state', () => {
  const state = { state: 'windup', phase: 2 };
  const before = structuredClone(state);
  const { g, calls } = canvas();
  drawBossArt(g, 'rift-lord', 42, state, 2);
  drawBossArt(g, 'rift-lord', 42, state, 2, { anticipation: NaN, strike: Infinity, recovery: -2, angle: NaN });
  assert.deepEqual(state, before);
  assert.ok(calls.flat(Infinity).every(value => typeof value !== 'number' || Number.isFinite(value)));
});

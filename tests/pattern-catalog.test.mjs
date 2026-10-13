import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES, CAMPAIGN, PATTERNS, CLASSES, UNIQUE_CHANCE, SPECIAL_UNIQUE_CHANCE, CLEAR_HEAL, RAID_DAMAGE_MULTIPLIER } from '../public/src/content.mjs';

const legacy = ['iron-warden','ravager','ember-guardian','frost-watcher','storm-orb','iron-bastion','twin-blades','abyss-shaman','dusk-executioner','rift-lord'];
const shapes = new Set(['circle','sector','ring','lane','projectile']);

test('20-stage campaign preserves legacy order and marks special phases', () => {
  assert.equal(CAMPAIGN.stages.length, 20);
  assert.deepEqual(CAMPAIGN.stages.slice(0,10), legacy);
  assert.deepEqual(CAMPAIGN.stages.filter((_,i)=>BOSSES[CAMPAIGN.stages[i]].special), CAMPAIGN.stages.filter((_,i)=>[4,9,14,19].includes(i)));
  for (const [i,id] of CAMPAIGN.stages.entries()) {
    const boss=BOSSES[id];
    assert.deepEqual(boss.phaseThresholds, i===19?[.67,.33]:[4,9,14,19].includes(i)?[.5]:[]);
    assert.ok(boss.raid && boss.raids.length>=2);
    assert.ok(boss.patterns.length >= ([4,9,14,19].includes(i)?8:5));
  }
});

test('catalog entries are unique authored tactics, referenced by boss pools', () => {
  assert.ok(Object.keys(PATTERNS).length >= 50);
  const used=new Set(CAMPAIGN.stages.flatMap(id=>BOSSES[id].patterns.map(p=>p.id)));
  assert.deepEqual([...Object.keys(PATTERNS)].filter(id=>!used.has(id)), []);
  for(const [id,p] of Object.entries(PATTERNS)) {
    assert.equal(p.id,id);
    assert.ok(p.name && p.tactic, `${id} lacks Korean name/tactic`);
    assert.ok(p.steps ? Array.isArray(p.steps) && p.steps.length>=2 : shapes.has(p.shape), `${id} unsupported shape`);
    if(p.steps) for(const step of p.steps) assert.ok(shapes.has(step.shape) && !step.steps, `${id} has invalid/nested composite`);
    assert.ok(p.windup >= .6 && p.recover >= 0 && p.damage > 0, `${id} has invalid normalized timing/damage`);
    for(const bossId of CAMPAIGN.stages) for(const entry of BOSSES[bossId].patterns) if(entry.id===id) assert.equal(entry,p,`${bossId}/${id} must use catalog object`);
  }
  const signature = pattern => JSON.stringify(pattern.steps
    ? pattern.steps.map(signature)
    : [pattern.shape,pattern.anchor||'target',pattern.layout||'',!!pattern.retarget,pattern.sequence||1,!!pattern.distance,
      pattern.sequence>1?pattern.angleStep||0:0,Math.sign(pattern.radiusStep||0),!!pattern.lateralStep,!!pattern.orbitStep,pattern.angleOffset||0,
      !!pattern.gapHalfAngle,pattern.gapOffset||0,pattern.volley||1,!!pattern.radial,!!pattern.shotDelay,!!pattern.finisher,!!pattern.aftershock,pattern.active>=1]);
  assert.ok(new Set(Object.values(PATTERNS).map(signature)).size >= 50, '>=50 executed programs without counting ID/name/damage/radius/width/speed/windup tweaks');
  assert.equal(PATTERNS.cleave.windup, .68);
  assert.equal(PATTERNS.cleave.damage, 35);
  assert.equal(PATTERNS.cleave.recover, .378);
  for (const id of ['cleave','twin-cleave','twin-charge','embers','barrage','lightning-lanes']) assert.equal(PATTERNS[id].retarget, true);
  assert.equal(PATTERNS.cleave.sequence,2);
  assert.equal(PATTERNS.slam.radius,135);
  assert.equal(PATTERNS.charge.finisher.damage,28);
  assert.equal(PATTERNS.charge.finisher.windup,.65);
  assert.equal(PATTERNS['rift-collapse'].aftershock.damage,38);
  assert.equal(PATTERNS['aftershock-mark'].aftershock.windup,.9);
  assert.equal(PATTERNS.ring.innerRadius,Math.round(175*.62));
  assert.equal(PATTERNS['ember-volley'].projectileSpeed, 200*1.45);
});

test('raid repertoires cover contrasting layouts', () => {
  for (const id of CAMPAIGN.stages) {
    const kinds = new Set(BOSSES[id].raids.map(raid => raid.kind));
    assert.ok(kinds.size >= 2, `${id} needs at least two raid layouts`);
    if (BOSSES[id].special) assert.deepEqual(kinds, new Set(['corridor','in-out','carousel']), `${id} needs all raid layouts`);
  }
});

test('dodge and raid/reward content constants retain engine contract', () => {
  const expected={warrior:['step',1.1,.22,.16,150],fighter:['dash',.95,.12,.1,85],mage:['blink',1.25,.16,.14,185],gunslinger:['roll',1.1,.24,.16,145],archer:['roll',1.25,.32,.16,220]};
  for(const [id,[kind,cooldown,duration,invulnerable,distance]] of Object.entries(expected)) {
    const dodge=CLASSES.find(c=>c.id===id).dodge;
    assert.deepEqual([dodge.kind,dodge.cooldown,dodge.duration,dodge.invulnerable,dodge.distance],[kind,cooldown,duration,invulnerable,distance]);
    assert.ok(dodge.label);
  }
  assert.equal(CLASSES.find(c=>c.id==='fighter').dodge.chainWindow,.45);
  assert.equal(CLASSES.find(c=>c.id==='gunslinger').dodge.canAttack,true);
  assert.equal(UNIQUE_CHANCE,.06);
  assert.equal(SPECIAL_UNIQUE_CHANCE,1);
  assert.equal(CLEAR_HEAL,.1);
  assert.equal(RAID_DAMAGE_MULTIPLIER,.8);
});

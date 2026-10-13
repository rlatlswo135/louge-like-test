import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN, CLASSES, LIMITS } from '../public/src/content.mjs';
import { chooseCard, createInput, createRun, step } from '../public/src/game.mjs';
import { botInput, chooseReward } from './bot.mjs';

test('hard-mode legal campaign probes terminate, preserve invariants and choose only offered cards', () => {
  // This is stability telemetry, not a requirement that a simple bot wins hard mode.
  const reports = [];
  for (const cls of CLASSES) for (const weapon of cls.weapons) {
    const run = createRun({ classId: cls.id, weaponId: weapon.id, seed: 73021 });
    const selected = [];
    let damageTaken = 0, bossDamage = 0;
    while (run.status === 'playing' || run.status === 'reward') {
      if (run.status === 'reward') {
        const cardId = chooseReward(run);
        assert.ok(run.offers.some(card => card.id === cardId));
        selected.push(cardId);
        assert.equal(chooseCard(run, cardId), true);
        continue;
      }
      assert.ok(run.time < CAMPAIGN.stages.length * 240 && run.stageTime < 240, `${cls.id}/${weapon.id}: combat cannot stall forever`);
      step(run, botInput(run));
      for (const event of run.events) {
        if (event.type === 'playerHit' || event.type === 'stormHit') damageTaken += event.damage;
        if (event.type === 'bossHit') bossDamage += event.damage;
      }
      run.events.length = 0;
      assert.ok([run.player.x, run.player.y, run.player.hp, run.boss.hp].every(Number.isFinite));
      assert.ok(run.player.hp >= 0 && run.player.hp <= run.player.maxHp);
      for (const key of ['hazards', 'projectiles', 'particles']) assert.ok(run[key].length <= LIMITS[key]);
    }
    assert.ok(['dead', 'won'].includes(run.status));
    assert.ok(bossDamage > 0, `${weapon.id} must still be usable`);
    if (run.status === 'won') {
      assert.equal(run.stage, CAMPAIGN.stages.length - 1);
      assert.equal(selected.length, CAMPAIGN.stages.length - 1);
    } else assert.equal(run.player.hp, 0);
    assert.equal(run.hazards.length + run.projectiles.length, 0);
    reports.push(`${cls.id}/${weapon.id}: ${run.status}, stage ${run.stage + 1}, ${run.time.toFixed(1)}s, damage taken ${damageTaken.toFixed(1)}, dealt ${bossDamage.toFixed(1)}`);
  }
  console.log(`\nHard-mode probes (not human balance proof):\n${reports.join('\n')}`);
});

test('blind circular kiting while holding a gun is no longer a reliable first-boss win', () => {
  let defeats = 0;
  for (const weaponId of ['revolver', 'sniper']) for (const seed of [1, 42, 73021]) {
    const run = createRun({ classId: 'gunslinger', weaponId, seed });
    while (run.status === 'playing' && run.time < 60) {
      const angle = Math.atan2(run.player.y - 360, run.player.x - 640) + .35;
      const x = 640 + Math.cos(angle) * 200, y = 360 + Math.sin(angle) * 200;
      const controls = createInput();
      controls.left = x < run.player.x - 3; controls.right = x > run.player.x + 3;
      controls.up = y < run.player.y - 3; controls.down = y > run.player.y + 3;
      controls.attack = true; controls.aimX = run.boss.x; controls.aimY = run.boss.y;
      step(run, controls);
    }
    if (run.status === 'dead') defeats++;
    assert.notEqual(run.status, 'playing');
  }
  assert.ok(defeats >= 5, `${defeats}/6 blind gun kites died; passive orbiting must be risky`);
});

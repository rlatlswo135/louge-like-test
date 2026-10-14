import { createRun } from './game.mjs';
import { Boss } from './entities.mjs';
import { OLYMPUS_ENCOUNTERS } from './olympus-encounters.mjs';

export const OLYMPUS_TEST_CARDS = Object.freeze({edge:1,tempo:1,vitality:2,reach:1,swift:1});
export function createOlympusRun(number=1,seed=31) {
  const encounter=OLYMPUS_ENCOUNTERS.get(number);
  if(!encounter)throw new RangeError(`Olympus boss ${number} is not ready`);
  const run=createRun({classId:'warrior',weaponId:'sword',seed,stage:0});
  run.stageCount=1;
  run.cards={...OLYMPUS_TEST_CARDS};
  run.player.maxHp=run.getStats().maxHp;
  run.player.hp=run.player.maxHp;
  run.player.x=640;run.player.y=580;
  run.boss=new Boss(encounter.definition);run.boss.y=180;
  run.olympus=encounter.createState();
  return run;
}

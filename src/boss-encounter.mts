import type { RunState, InputState, BossDefinition } from './types.mjs';
import type { OlympusState } from './olympus-types.mjs';

/** Components hold behavior; all mutable fight state belongs to the run. */
export abstract class BossEntrance {
  abstract update(state: RunState, input: InputState, dt: number): void;
  abstract finish(state: RunState): void;
}
export abstract class BossAttackSet {
  abstract update(state: RunState, dt: number): void;
}
export abstract class BossMechanic {
  abstract update(state: RunState, input: InputState, dt: number): boolean;
  abstract damageFloor(state: RunState): number;
}
export abstract class OncePerFightMechanic extends BossMechanic {
  protected claim(state: RunState): boolean {
    if(state.olympus.gimmickUsed)return false;
    state.olympus.gimmickUsed=true;
    state.olympus.gimmickCount++;
    return true;
  }
}
export abstract class BossEncounter {
  abstract readonly definition: BossDefinition;
  abstract createState(): OlympusState;
  constructor(readonly entrance: BossEntrance, readonly attacks: BossAttackSet, readonly mechanic: BossMechanic) {}
  update(state: RunState, input: InputState, dt: number): void {
    state.boss.hitFlash=Math.max(0,state.boss.hitFlash-dt);
    state.olympus.phaseTime+=dt;
    if(!this.mechanic.update(state,input,dt))this.attacks.update(state,dt);
  }
  clampActors(state: RunState): void {
    for(const actor of [state.player,state.boss]){
      actor.x=Math.max(100,Math.min(1180,actor.x));
      actor.y=Math.max(130,Math.min(625,actor.y));
    }
  }
}

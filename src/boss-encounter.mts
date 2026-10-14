import type { RunState, InputState, BossDefinition, Attack } from './types.mjs';
export type HitTarget = { x:number; y:number; r:number };
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
  strikeTargets(_state:RunState,_hitTest:(target:HitTarget)=>boolean,_attack:Attack):number {return 0;}
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
  hitTarget(state:RunState):HitTarget {return {x:state.boss.x,y:state.boss.y,r:state.boss.def.radius};}
  canHit(_state:RunState,_attack?:Attack):boolean {return true;}
  blocksMovement(_state:RunState):boolean {return true;}
  clampActors(state: RunState): void {
    for(const actor of [state.player,state.boss]){
      actor.x=Math.max(100,Math.min(1180,actor.x));
      actor.y=Math.max(130,Math.min(625,actor.y));
    }
  }
}

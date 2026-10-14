import { Player, Boss } from './entities.mjs';
import { PlayerSystem } from './systems/player.mjs';
import { BossSystem } from './systems/boss.mjs';
import { CombatSystem } from './systems/combat.mjs';
import { WorldSystem } from './systems/world.mjs';
import { RewardSystem } from './systems/rewards.mjs';
import type { RunStatus, CardDefinition, GameEvent, ClassDefinition } from './types.mjs';
import { BOSSES, CAMPAIGN, CLEAR_HEAL, LIMITS, STEP, TUTORIAL_BOSS, findLoadout } from './content.mjs';
import { cleanupEncounter, updateSpecialEncounter } from './encounters.mjs';
import { getStats } from './systems/stats.mjs';
import { cancelPlayerActions } from './systems/player.mjs';
import { createRng } from './random.mjs';
import { spawnHazard } from './systems/effects.mjs';
import { hitBoss } from './systems/combat.mjs';
import { encounterFor } from './olympus-encounters.mjs';
import type { RunState, RunOptions, InputState, Weapon, Hazard, Attack, Particle, CombatStats } from './types.mjs';
/** One run owns its entities and delegates simulation to stateless systems. */
export class GameRun implements RunState {
  time = 0;
  stageTime = 0;
  stormExposure = 0;
  hitsTaken = 0;
  bossesCleared = 0;
  stormContact = false;
  status: RunStatus = 'playing';
  stage: number;
  stageCount: number;
  rng: () => number;
  cosmeticRng: () => number;
  combatRng: () => number;
  cards: Record<string, number> = {};
  offers: CardDefinition[] = [];
  attacks: Attack[] = [];
  projectiles: Attack[] = [];
  hazards: Hazard[] = [];
  particles: Particle[] = [];
  events: GameEvent[] = [];
  feedback = { shake: 0, flash: 0, impact: 0, melee: 0 };
  cls: ClassDefinition;
  weapon: Weapon;
  player: Player;
  boss: Boss;
  declare attackSerial?: number;
  declare tutorial?: RunState['tutorial'];
  declare encounter?: RunState['encounter'];
  declare olympus?: RunState['olympus'];
  private static readonly players = new PlayerSystem();
  private static readonly bosses = new BossSystem();
  private static readonly combat = new CombatSystem();
  private static readonly world = new WorldSystem();
  private static readonly rewards = new RewardSystem();
  constructor({ classId = 'warrior', weaponId = null, seed = 1, stage = 0 }: RunOptions = {}) {
    const { cls, weapon } = findLoadout(classId, weaponId);
    if (!Number.isInteger(stage) || stage < 0 || stage >= CAMPAIGN.stages.length) {
      throw new RangeError(`Invalid campaign stage: ${stage}`);
    }
    this.cls = cls;
    this.weapon = weapon;
    this.stage = stage;
    this.stageCount = CAMPAIGN.stages.length;
    this.rng = createRng(seed);
    this.cosmeticRng = createRng(seed ^ 0xa5a5a5a5);
    this.combatRng = createRng(seed ^ 0x51f15e);
    this.player = new Player(cls, weapon);
    this.boss = new Boss(BOSSES[CAMPAIGN.stages[stage]]);
  }
  step(input: InputState, dt = STEP): this {
    const state = this;
    if (state.status !== 'playing') return state;
    const olympusEncounter=encounterFor(state);
    if(olympusEncounter&&state.olympus.phase==='intro'){
      olympusEncounter.entrance.update(state,input,dt);
      return state;
    }
    const startingPhase=state.boss.phase;
    GameRun.bosses.advancePhase(state);
    state.time += dt;
    state.stageTime += dt;
    state.feedback.melee = Math.max(0, state.feedback.melee - dt * 5);
    state.feedback.shake=Math.max(0, state.feedback.shake-dt*2);
    state.feedback.flash=Math.max(0, state.feedback.flash-dt*2);
    state.feedback.impact=Math.max(0, state.feedback.impact-dt*2);
    state.player.shieldTime=Math.max(0, state.player.shieldTime-dt);
    if(!state.player.shieldTime) state.player.shield=0;
    state.boss.slowTime=Math.max(0, (state.boss.slowTime||0)-dt);
    state.boss.wetTime=Math.max(0, (state.boss.wetTime||0)-dt);
    if(!state.boss.wetTime)state.boss.wetStacks=0;
    state.boss.wetCooldown=Math.max(0, (state.boss.wetCooldown||0)-dt);
    if(state.boss.burnTime>0){
      state.boss.burnTime=Math.max(0, state.boss.burnTime-dt);
      state.boss.burnTick=(state.boss.burnTick||.4)-dt;
      if(state.boss.burnTick<=1e-9){
        hitBoss(state, (state.boss.burnDps||0)*.4, '#ff9864');
        state.boss.burnTick=.4;
      }
      if(!state.boss.burnTime)state.boss.burnDps=0;
    }
    const encounterBefore=state.encounter;
    if(!olympusEncounter&&startingPhase===state.boss.phase&&!state.boss.raid&&!state.boss.combo&&(state.boss.state==='idle'||state.encounter?.active))updateSpecialEncounter(state, dt, {
      spawnHazard:(h: Hazard)=>spawnHazard(state, h), spawnProjectile:(q: Attack)=>{
        if(state.projectiles.length>=LIMITS.projectiles)throw new Error('Encounter projectile limit exceeded');state.projectiles.push({...q, prevX:q.x, prevY:q.y, maxLife:q.life, color:'#a4f1e0'});state.encounter.shot=state.projectiles.at(-1);
      }
    });
    if(!encounterBefore&&state.encounter?.active){
      state.boss.pattern=null;
      state.hazards=state.hazards.filter(h=>h.encounter);
      state.projectiles=state.projectiles.filter(q=>q.owner==='player'||q.encounterBit);
      state.events.push({type:'encounter', kind:state.encounter.kind});
    }
    olympusEncounter?.update(state,input,dt);
    const o=state.olympus,locked=o?.controlsLocked;
    const blockAttack=o?.number===1 ? o.carrying||o.phase==='stunned'&&o.smashHeld
      : o?.number===2&&(o.phase==='cards-answer'?!o.cardArmed:o.phase!=='combat'&&o.phase!=='stunned');
    const playerInput=locked ? {...input,up:false,down:false,left:false,right:false,attack:false,attackPressed:false,dodge:false,counter:false}
      : blockAttack ? {...input,attack:false,attackPressed:false} : input;
    GameRun.players.update(state, playerInput, dt);
    if(playerInput!==input){input.attackPressed=false;input.dodge=false;input.counter=false;}
    olympusEncounter?.clampActors(state);
    GameRun.combat.update(state, dt);
    if (!olympusEncounter && startingPhase===state.boss.phase && state.boss.hp > 0 && !state.encounter?.active) GameRun.bosses.update(state, dt);
    GameRun.world.update(state, dt);
    GameRun.bosses.advancePhase(state);
    // 동시 사망/처치는 사망을 우선한다.
    if (state.player.hp <= 0) {
      state.hazards.length = 0;
      state.projectiles.length = 0;
      state.attacks.length=0;
      state.particles.length=0;
      state.boss.raid=null;
      state.boss.pattern=null;
      state.boss.chargePaths=[];
      state.boss.combo=null;
      state.status='dead';
      cancelPlayerActions(state);
      state.player.dodgeTime=0;
      state.player.dodgeCooldown=0;
      state.player.attackCooldown=0;
      state.player.shield=0;
      state.player.shieldTime=0;
      state.player.slowTime=0;
      cleanupEncounter(state);
      state.events.push({ type: 'dead' });
    } else if (state.boss.hp <= 0) {
      cleanupEncounter(state);
      state.boss.state = 'dead';
      state.bossesCleared++;
      const heal = state.tutorial ? 0 : (state.player.maxHp * CLEAR_HEAL + 12 * (state.cards.fortune || 0))*getStats(state).healingMultiplier;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);
      state.hazards.length = 0;
      state.projectiles.length = 0;
      state.attacks.length=0;
      state.particles.length=0;
      state.boss.raid=null;
      state.boss.pattern=null;
      state.boss.chargePaths=[];
      state.boss.combo=null;
      state.player.swing=null;
      state.player.dodgeTime=0;
      state.player.dodgeCooldown=0;
      state.player.attackCooldown=0;
      state.player.shield=0;
      state.player.shieldTime=0;
      state.player.slowTime=0;
      cancelPlayerActions(state);
      if(state.stage===state.stageCount-1) {
        state.status='won';
        state.events.push({type:'won', final:true});
      }
      else {
        state.status='reward';
        state.offers=GameRun.rewards.offers(state);
        state.events.push({type:'won', final:false});
      }
    }
    if (state.status !== 'playing') {
      state.player.guardTime=0;
      state.player.counterTime=0;
      state.player.charge = 0;
      state.player.reloadTime = 0;
      state.player.recoilTime = 0;
      state.attacks.length=0;
      state.player.dodgeChainTime = 0;
      state.player.dodgeQueued = false;
      state.player.dodgeChainUsed = false;
      state.stormExposure = 0;
      state.stormContact = false;
    }
    if (state.events.length > 256) state.events.splice(0, state.events.length - 256);
    return state;
  }
  getStats(): CombatStats {
  return getStats(this);
  }
  getStorm() {
    return GameRun.world.storm(this);
  }
  chooseCard(cardId: string): boolean {
  return GameRun.rewards.choose(this, cardId);
  }
  previewReward(cardId: string): GameRun | null {
  return GameRun.rewards.preview(this, cardId) as GameRun | null;
  }
  cancelActions(): this {
  GameRun.players.cancel(this);
    return this;
  }
}
export function createRun(options: RunOptions = {}): GameRun {
return new GameRun(options);
}
/** Functional API remains available for existing callers and structural fixtures. */
export function step(state: RunState, input: InputState, dt = STEP): RunState {
  return GameRun.prototype.step.call(state as GameRun, input, dt);
}
export function createTutorialRun(options: RunOptions = {}) {
  const run=createRun({...options, seed:1, stage:0});
  run.stageCount=1;
  run.tutorial={walked:0, attacked:false, dodged:false};
  run.player.y=480;
  Object.assign(run.boss, {def:TUTORIAL_BOSS, y:340, hp:TUTORIAL_BOSS.hp, maxHp:TUTORIAL_BOSS.hp, timer:TUTORIAL_BOSS.idle});
  return run;
}
// Compatibility API used by the renderer and existing tests.
export { createInput, clearInput, GameInput } from './input.mjs';
export { createClock, resetClock, advanceClock, FixedStepClock } from './clock.mjs';
export { createRng } from './random.mjs';
export { getTutorialStep } from './tutorial.mjs';
export { cancelPlayerActions } from './systems/player.mjs';
export { getStats } from './systems/stats.mjs';
export { getStorm } from './systems/world.mjs';
export { chooseCard, previewReward, makeOffers } from './systems/rewards.mjs';
export { spawnHazard, spawnParticle } from './systems/effects.mjs';
export { playerInvulnerable } from './systems/combat.mjs';
export { circleHitsCircle, sectorHitsCircle, getHazardProgress, hazardHitsCircle, moveVector } from './systems/geometry.mjs';

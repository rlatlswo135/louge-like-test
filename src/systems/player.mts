import { PLAYER } from '../content.mjs';
import { ATTACK_RHYTHMS, attackBeat, timingSuccess } from '../attack-rhythm.mjs';
import { encounterRockAt } from '../encounters.mjs';
import { encounterFor } from '../olympus-encounters.mjs';
import { clampToArena, moveVector } from '../systems/geometry.mjs';
import { impactText } from '../systems/effects.mjs';
import { emitAttack, queueAttack } from '../systems/combat.mjs';
import { getStats } from '../systems/stats.mjs';
import type { RunState, InputState, AttackOptions } from '../types.mjs';
/** 이동·회피·충전·입력 소비 */
export class PlayerSystem {
  cancel(state: RunState): RunState {
  return cancelPlayerActions(state);
  }
  update(state: RunState, input: InputState, dt: number): void {
    const p = state.player, fromX=p.x, fromY=p.y;
    // A new physical click is safe even before the first released-input step after resume.
    if(input.attackPressed||!input.attack)p.attackBlocked=false;
    const fresh=!p.attackBlocked&&Boolean(input.attackPressed || (input.attack&&!p.attackHeld));
    input.attackPressed=false;
    p.attackHeld=Boolean(input.attack);
    p.comboTime=Math.max(0, p.comboTime-dt);
    p.counterTime=Math.max(0, p.counterTime-dt);
    p.guardTime=Math.max(0, (p.guardTime||0)-dt);
    p.counterCooldown=Math.max(0, (p.counterCooldown||0)-dt);
    p.attackChainTime=Math.max(0, (p.attackChainTime||0)-dt);
    let walking=false;
    const stats = getStats(state);
    p.timingPhase=(p.timingPhase+dt/Math.max(.45, stats.interval*1.12))%1;
    const dodge = stats.dodge;
    const weaponKey=stats.uniqueIds.join('+');
    if(p.weaponKey!==weaponKey){
      p.weaponKey=weaponKey;
      p.ammo=stats.magazine;
      p.reloadTime=0;
      p.charge=0;
    }
    const wasOverheated=(p.overheatTime||0)>0;
    p.overheatTime=Math.max(0, (p.overheatTime||0)-dt);
    if(wasOverheated&&!p.overheatTime)p.heat=0;
    if(!input.attack||p.overheatTime>0)p.heat=Math.max(0, (p.heat||0)-dt*.6);
    const move = moveVector(input);
    p.moving = Boolean(move.x || move.y);
    if (move.x || move.y) {
      p.lastMoveX = move.x;
      p.lastMoveY = move.y;
    }
    const ax = input.aimX - p.x;
    const ay = input.aimY - p.y;
    const aimLen = Math.hypot(ax, ay);
    if (aimLen > 1e-6) {
      p.faceX = ax / aimLen;
      p.faceY = ay / aimLen;
    }
    if(input.counter&&stats.counter&&p.counterCooldown<=1e-9&&p.dodgeTime<=0){
      p.guardTime=stats.counter.window;
      p.counterCooldown=stats.counter.cooldown;
      p.guardX=p.faceX;
      p.guardY=p.faceY;
      p.charge=0;
      p.swing=null;
      p.dodgeQueued=false;
      state.events.push({type:'counterReady', kind:stats.counter.kind});
    }
    input.counter=false;
    p.attackCooldown -= dt;
    p.leechBudget = Math.min(4, p.leechBudget + dt * 4);
    p.recoilTime = Math.max(0, p.recoilTime - dt);
    if (p.reloadTime > 0) {
      p.reloadTime = Math.max(0, p.reloadTime - dt);
      if (p.reloadTime <= 1e-9) {
        p.reloadTime = 0;
        p.ammo = stats.magazine;
      }
    }
    p.dodgeCooldown = Math.max(0, p.dodgeCooldown - dt);
    p.heavyTime = Math.max(0, p.heavyTime - dt);
    p.dodgeBuffTime = Math.max(0, p.dodgeBuffTime - dt);
    if (state.cards.heavy && p.heavyTime <= 0) p.heavyReady = true;
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.chargeFlash = Math.max(0, (p.chargeFlash||0)-dt);
    p.dodgeChainTime = Math.max(0, p.dodgeChainTime - dt);
    if (!p.dodgeChainTime) p.dodgeQueued = false;
    const chain = dodge.chainWindow && p.dodgeChainTime > 0 && !p.dodgeChainUsed;
    if (input.dodge && chain && p.dodgeTime > 0) p.dodgeQueued = true;
    if (input.dodge || p.dodgeQueued) {
      if (p.guardTime<=0 && p.dodgeTime <= 0 && (p.dodgeCooldown <= 1e-9 || chain)) {
        let dx = move.x;
        let dy = move.y;
        if (!dx && !dy) {
          dx = p.lastMoveX;
          dy = p.lastMoveY;
        }
        if (!dx && !dy) {
          dx = p.faceX;
          dy = p.faceY;
        }
        const len = Math.hypot(dx, dy) || 1;
        p.dodgeX = dx / len;
        p.dodgeY = dy / len;
        p.dodgeTime = dodge.duration;
        p.dodgeFromX = p.x;
        p.dodgeFromY = p.y;
        if(stats.weapon.dodgeShot)emitAttack(state, stats, {secondary:true, factor:stats.weapon.dodgeShot, targetX:input.aimX, targetY:input.aimY});
        if(stats.weapon.dodgeEcho)queueAttack(state, {kind:'emitter', t:0, windup:.25, stats, options:{x:p.x, y:p.y, angle:Math.atan2(p.faceY, p.faceX), targetX:input.aimX, targetY:input.aimY, secondary:true, factor:stats.weapon.dodgeEcho}});
        p.dodgeQueued = false;
        p.dodgeChainUsed = Boolean(chain);
        p.dodgeChainTime = dodge.chainWindow && !chain ? dodge.duration + dodge.chainWindow : 0;
        if (dodge.kind === 'blink') {
          p.x += p.dodgeX * dodge.distance;
          p.y += p.dodgeY * dodge.distance;
        }
        p.charge = 0;
        p.dodgeCooldown = dodge.cooldown;
        p.dodgeBuffTime = state.cards.dodge ? 3 : 0;
        if (state.cards.ward) {
          p.shield = Math.max(p.shield, 12 * state.cards.ward);
          p.shieldTime = Math.max(p.shieldTime, 2);
        }
        state.events.push({ type: 'dodge', kind: stats.dodge.kind });
        const boss=state.boss, targetDx=boss.x-p.dodgeFromX, targetDy=boss.y-p.dodgeFromY, dist=Math.hypot(targetDx, targetDy);
        if(boss.raid?.kind==='counter'&&boss.raid.round===0&&boss.state==='windup'&&boss.timer<=.8&&dist<=210&&
        (p.dodgeX*targetDx+p.dodgeY*targetDy)/(dist||1)>.6){
          state.hazards=state.hazards.filter(h=>!h.raid);
          boss.raid=null;
          boss.state='recover';
          boss.timer=2.4;
          boss.pattern={id:'countered', name:'강타 차단 · 반격 기회', recover:2.4};
          boss.nextRaidAt=state.stageTime+18;
          state.events.push({type:'counter'});
          impactText(state, boss.x, boss.y, '강타 차단', '#98e4ed');
        }
        if(state.tutorial)state.tutorial.dodged=true;
      }
    }
    input.dodge = false;
    if (p.dodgeTime > 0) {
      const used = Math.min(dt, p.dodgeTime);
      const speed = dodge.kind === 'blink' ? 0 : dodge.distance / dodge.duration;
      p.x += p.dodgeX * speed * used;
      p.y += p.dodgeY * speed * used;
      p.dodgeTime = Math.max(0, p.dodgeTime - dt);
    } else {
      walking=p.moving;
      const drawing = stats.chargeTime > 0 && input.attack && p.attackCooldown <= 0;
      const firing = p.recoilTime > 0 || (stats.magazine > 0 && input.attack && p.reloadTime <= 0);
      const casting = state.cls.id === 'mage' && input.attack;
      const motion = p.guardTime>0?.35:firing ? (stats.weapon.shotMove??.65) : drawing ? .88 : casting ? (stats.weapon.castMove||.8) : 1;
      p.x += move.x * stats.speed * motion * dt;
      p.y += move.y * stats.speed * motion * dt;
      if(state.boss.raid?.pull&&state.boss.state==='windup'){
        const dx=640-p.x, dy=360-p.y, d=Math.hypot(dx, dy)||1;
        p.x+=dx/d*state.boss.raid.pull*dt;
        p.y+=dy/d*state.boss.raid.pull*dt;
      }
    }
    clampToArena(p, PLAYER.radius);
    // 보스와 겹치지 않도록 밀어낸다(접촉 피해는 없다).
    const b = state.boss;
    if (b.hp > 0 && encounterFor(state)?.blocksMovement(state)!==false) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const min = PLAYER.radius + b.def.radius;
      const dist = Math.hypot(dx, dy);
      if (dist < min) {
        const nx = dist > 1e-6 ? dx / dist : 0;
        const ny = dist > 1e-6 ? dy / dist : 1;
        p.x = b.x + nx * min;
        p.y = b.y + ny * min;
        clampToArena(p, PLAYER.radius);
      }
    }
    resolvePlayerObstacles(state);
    if(state.tutorial&&walking)state.tutorial.walked=Math.min(60, state.tutorial.walked+Math.hypot(p.x-fromX, p.y-fromY));
    if(p.swing){
      p.swing.t+=dt;
      if(p.swing.t>=(stats.weapon.swingTime||.2))p.swing=null;
    }
    let fire=stats.manualCombo||stats.timingMeter?fresh:input.attack;
    let power=1;
    if(stats.chargeTime>0){
      fire=false;
      if(p.guardTime<=0&&(p.dodgeTime<=0||dodge.canAttack)&&p.attackCooldown<=1e-9){
        if(input.attack&&!p.attackBlocked)p.charge=Math.min(stats.chargeTime, p.charge+dt);
        if(p.charge>0&&(!input.attack||p.charge>=stats.chargeTime-1e-9)){
          power=p.charge/stats.chargeTime;
          fire=true;
        }
      }
    }
    if(fire&&!p.attackBlocked&&p.guardTime<=0&&p.attackCooldown<=1e-9&&(p.dodgeTime<=0||dodge.canAttack)&&p.reloadTime<=0&&(p.overheatTime||0)<=0&&(!stats.magazine||p.ammo>0)){
      const w=stats.weapon;
      const base=!stats.uniqueIds.length, beats=base?ATTACK_RHYTHMS[w.id]:null;
      p.attackStep=beats?(p.attackChainTime>0?p.attackStep%beats.length+1:1):0;
      const beat=attackBeat(w.id, beats?p.attackStep-1:-1);
      p.attackChainTime=stats.interval*beat.interval+.65;
      if(stats.manualCombo){
        p.comboStep=p.comboTime>0?p.comboStep%stats.manualCombo+1:1;
        p.comboTime=Math.max(.9, stats.interval+.45);
      }
      else p.comboStep=0;
      let bonus=stats.timingMeter?(timingSuccess(p.timingPhase)?.45:-.2):0;
      if(state.cards.heavy&&p.heavyReady){
        bonus+=.5*state.cards.heavy;
        p.heavyReady=false;
        p.heavyTime=2;
      }
      if(state.cards.dodge&&p.dodgeBuffTime>0){
        bonus+=.35*state.cards.dodge;
        p.dodgeBuffTime=0;
      }
      if(stats.chargeTime){
        p.chargeFlash=.2;
        p.chargeShotPower=power;
      }
      p.charge=0;
      p.attackCooldown=Math.max(p.attackCooldown, -dt)+stats.interval*beat.interval;
      p.swing={t:0, angle:Math.atan2(p.faceY, p.faceX), hit:false, bonus, comboStep:p.comboStep, beat:p.attackStep, shape:beat.shape, reach:stats.reach*(beat.reach||1)};
      if(w.lunge){
        p.x+=p.faceX*w.lunge;
        p.y+=p.faceY*w.lunge;
        clampToArena(p, PLAYER.radius);
        resolvePlayerObstacles(state);
      }
      const options: AttackOptions={power, bonus, comboStep:p.comboStep, targetX:input.aimX, targetY:input.aimY,
        factor:beat.damage, reachFactor:beat.reach, shape:beat.shape, width:beat.width, arcFactor:beat.arc};
      if(base){
        if(beat.kind)options.weapon={...w, kind:beat.kind, width:beat.width};
        if(w.id==='fire'||w.id==='crossbow'&&power>=.98){
          options.factor*=.8;
          options.weapon={...w, explosion:.25, impactOnly:true};
        }
        if(w.id==='revolver')options.factor*=p.ammo===1?1.3:.94;
        if(w.id==='sniper')options.factor*=p.ammo===1?1.1:.9;
        if(w.id==='bow'&&power>=.98){
          options.factor=.75;
          queueAttack(state, {kind:'emitter', t:0, windup:.09, stats, options:{...options, x:p.x, y:p.y, angle:Math.atan2(p.faceY, p.faceX), secondary:true, factor:.25, followup:true}});
        }
      }
      const packet=emitAttack(state, stats, options);
      if(stats.manualCombo&&p.comboStep===stats.manualCombo){
        if(w.comboWave||w.comboBeam)queueAttack(state, {kind:w.comboBeam?'beam':'echo', shape:'lane', x:p.x, y:p.y, angle:packet.angle, length:w.comboBeam?420:180, width:54, t:0, windup:.08, active:.18, damage:stats.baseDamage*(w.comboWave||w.comboBeam), color:w.color, secondary:true});
        if(w.comboMeteor){
          const d=Math.min(420, Math.hypot(input.aimX-p.x, input.aimY-p.y));
          queueAttack(state, {kind:'meteor', shape:'circle', x:p.x+p.faceX*d, y:p.y+p.faceY*d, radius:72, t:0, windup:.55, active:.2, damage:stats.baseDamage*w.comboMeteor, color:w.color, secondary:true});
        }
      }
      if(w.heat){
        p.heat=Math.min(1, (p.heat||0)+(w.heatGain||.045)*(w.burst||1));
        if(p.heat>=1){
          p.overheatTime=1.2;
          p.reloadTime=1.2;
          p.ammo=1;
          state.events.push({type:'overheat'});
        }
      }
      if(stats.magazine){
        p.ammo--;
        p.recoilTime=w.recoilTime||0;
        if(p.ammo===0)p.reloadTime=stats.reloadTime;
      }
    }else if(p.attackCooldown<0)p.attackCooldown=0;
  }
}
export function cancelPlayerActions(state: RunState) {
  state.player.cancelActions();
  state.attacks.length = 0;
  return state;
}
export function resolvePlayerObstacles(state: RunState){
  const p=state.player, b=state.boss;
  const obstacles=b.hp>0&&encounterFor(state)?.blocksMovement(state)!==false?[{x:b.x, y:b.y, r:b.def.radius}]:[];
  if(state.encounter?.kind==='cover'){
    const rock=encounterRockAt(p.x, p.y, PLAYER.radius);
    if(rock)obstacles.push(rock);
  }
  for(const o of obstacles){
    const dx=p.x-o.x, dy=p.y-o.y, d=Math.hypot(dx, dy), min=PLAYER.radius+o.r;
    if(d<min){
      p.x=o.x+(d?dx/d:0)*min;
      p.y=o.y+(d?dy/d:1)*min;
    }
  }
  clampToArena(p, PLAYER.radius);
}

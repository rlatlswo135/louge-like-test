import { ARENA, LIMITS, PLAYER, STORM } from '../content.mjs';
import { encounterCovered } from '../encounters.mjs';
import { hurtPlayer, playerInvulnerable, tryCounter } from '../systems/combat.mjs';
import { impactText, spawnParticle } from '../systems/effects.mjs';
import { getHazardProgress, hazardHitsCircle } from '../systems/geometry.mjs';
import type { RunState } from '../types.mjs';
/** 위험 영역·자기장·입자 */
export class WorldSystem {
  update(state: RunState, dt: number): void {
    this.updateHazards(state, dt);
    this.updateStorm(state, dt);
    this.updateParticles(state, dt);
  }
  storm(state: RunState) {
    return getStorm(state);
  }
  private updateHazards(state: RunState, dt: number): void {
    const p = state.player;
    const list = state.hazards;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      h.t += dt;
      if (h.phase === 'warn' && getHazardProgress(h) === 1) {
        h.phase = 'active';
        state.events.push({type:'bossAttack', shape:h.projectile?'projectile':h.shape, heavy:!!h.raid, bossId:state.boss.def.id});
        spawnParticle(state, { ...h, type: 'bossImpact', shape: h.projectile ? 'muzzle' : h.shape,
          vx: 0, vy: 0, life: .32, maxLife: .32, color: state.boss.def.color });
        if (h.projectile) {
          if (state.projectiles.length >= LIMITS.projectiles) throw new Error(`Projectile limit (${LIMITS.projectiles}) exceeded`);
          state.projectiles.push({ owner:'boss', x:h.x, y:h.y, prevX:h.x, prevY:h.y, vx:Math.cos(h.shotAngle)*h.shotSpeed, vy:Math.sin(h.shotAngle)*h.shotSpeed, radius:h.shotRadius, life:h.shotLife, maxLife:h.shotLife, color:h.shotReturn?'#f9b6d1':'#ff785e', damage:h.damage,
            turnAt:h.shotReturn||0, acceleration:h.shotAcceleration||0, homeX:h.x, homeY:h.y });
        }
      }
      // 활성 구간은 [windup, windup + active). 종료된 영역은 판정 없이 제거한다.
      if (h.phase === 'active' && h.t >= h.windup + h.active - 1e-9) continue;
      if(h.sweep&&h.phase==='active')h.angle=h.startAngle+h.sweep*Math.min(h.active, h.t-h.windup);
      if(h.charge&&h.phase==='active'){
        const progress=Math.min(1, Math.max(0, (h.t-h.windup)/h.active));
        const previous=Math.min(1, Math.max(0, (h.t-dt-h.windup)/h.active));
        h.body={x:h.x+Math.cos(h.angle)*h.length*progress, y:h.y+Math.sin(h.angle)*h.length*progress,
          prevX:h.x+Math.cos(h.angle)*h.length*previous, prevY:h.y+Math.sin(h.angle)*h.length*previous, radius:h.width/2};
      }
      const facingGaze=!h.gaze||(p.faceX*(h.x-p.x)+p.faceY*(h.y-p.y)>0);
      const persistent=h.pattern==='pool'||h.persistent;
      const live=h.phase==='active'&&!h.projectile&&(persistent||h.charge||!h.resolved);
      if(live&&!h.countered&&!h.hitGroup?.countered&&!h.hitGroup?.hit&&(!h.hitDone||(persistent&&(h.nextHit||0)<=0))){
        const contact=facingGaze&&hazardHitsCircle(h, p.x, p.y, PLAYER.radius);
        const covered=h.encounter==='cover-pulse'&&encounterCovered(p.x, p.y, PLAYER.radius);
        if(contact&&!covered&&!playerInvulnerable(state)&&!tryCounter(state, h, h.body?.x??h.sourceX??h.x, h.body?.y??h.sourceY??h.y)){
          h.hitDone=true;
          if(h.hitGroup&&!persistent)h.hitGroup.hit=true;
          h.nextHit=.35;
          hurtPlayer(state, h.damage, h.x, h.y);
        }
      }
      if(live)h.resolved=true;
      if (h.nextHit > 0) h.nextHit -= dt;
      list[w++] = h;
    }
    list.length = w;
  }
  private updateStorm(state: RunState, dt: number): void {
    const storm = getStorm(state);
    if (!storm.outside) {
      state.stormExposure = 0;
      state.stormContact = false;
      return;
    }
    if (!state.stormContact) {
      state.stormContact = true;
      state.hitsTaken++;
    }
    const damage = Math.min(state.player.hp, storm.dps * dt);
    state.player.hp -= damage;
    state.events.push({ type: 'stormHit', damage });
    state.stormExposure += dt;
    if (state.stormExposure >= STORM.tick - 1e-9 || state.player.hp <= 0) {
      state.feedback.flash = Math.max(state.feedback.flash, .24);
      impactText(state, state.player.x, state.player.y, storm.dps * state.stormExposure, '#b9a3ff');
      state.stormExposure = 0;
    }
  }
  private updateParticles(state: RunState, dt: number): void {
    const list = state.particles;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (!q.text) {
        q.vx *= 0.9;
        q.vy *= 0.9;
      }
      list[w++] = q;
    }
    list.length = w;
  }
}
export function getStorm(state: RunState) {
  const startsAt = STORM.delay + STORM.warning;
  const stageTime = state.tutorial ? 0 : state.stageTime;
  const active = stageTime >= startsAt;
  const progress = Math.max(0, Math.min(1, (stageTime - startsAt) / STORM.duration));
  const radius = STORM.radius + (STORM.minRadius - STORM.radius) * progress;
  const x = ARENA.width / 2, y = ARENA.height / 2;
  return { x, y, radius, progress, dps: STORM.dps + state.stage * .5, active,
    warning: stageTime >= STORM.delay && !active,
    warnsIn: Math.max(0, STORM.delay - stageTime),
    outside: active && Math.hypot(state.player.x - x, state.player.y - y) + PLAYER.radius > radius + 1e-9,
    shrinksIn: Math.max(0, startsAt - stageTime) };
}

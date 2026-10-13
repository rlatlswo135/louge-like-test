import { LIMITS } from '../content.mjs';
import type { RunState, Hazard, Particle } from '../types.mjs';
export function spawnHazard(state: RunState, hazard: Hazard) {
  if (state.hazards.length >= LIMITS.hazards) {
    // 위험 판정은 성능 때문에 생략하지 않는다. 상한 초과는 콘텐츠 설계 오류다.
    throw new Error(`위험 영역 상한(${LIMITS.hazards}) 초과`);
  }
  state.hazards.push(hazard);
  return hazard;
}
export function spawnParticle(state: RunState, p: Particle) {
  // 장식 입자는 상한에서 가장 오래된 것을 재사용한다.
  if (state.particles.length >= LIMITS.particles) {
    const old = state.particles.shift();
    for (const key of Object.keys(old) as (keyof Particle)[]) delete old[key];
    Object.assign(old, p);
    state.particles.push(old);
    return old;
  }
  state.particles.push(p);
  return p;
}
export function impactText(state: RunState, x: number, y: number, damage: number | string, color: string) {
  spawnParticle(state, { x, y, vx: 0, vy: -35, life: .65, maxLife: .65, color, text: typeof damage === 'number' ? String(Math.round(damage)) : damage, type: 'damage' });
}
export function burst(state: RunState, x: number, y: number, count: number, color: string, speed: number) {
  spawnParticle(state, { type: 'impact', x, y, vx: 0, vy: 0, life: .2, maxLife: .2, color });
  for (let i = 0; i < count; i++) {
    const a = state.cosmeticRng() * Math.PI * 2;
    const v = speed * (0.4 + state.cosmeticRng() * 0.6);
    spawnParticle(state, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, maxLife: 0.35, color });
  }
}
// ── 스텝 ──────────────────────────────────────────────────

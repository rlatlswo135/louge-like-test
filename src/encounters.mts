import type { RunState, EncounterState, EncounterTarget, EncounterHelpers, Attack } from './types.mjs';
// Isolated special-boss objectives. Geometry here is shared by simulation and renderer.
export const ENCOUNTER_ROCKS = [
{ x: 390, y: 285, r: 27 }, { x: 640, y: 455, r: 27 }, { x: 895, y: 285, r: 27 },
];
export const ENCOUNTER_SIGILS = [
{ x: 360, y: 260, r: 24 }, { x: 640, y: 245, r: 24 }, { x: 920, y: 260, r: 24 },
];
export const ENCOUNTER_SEALS = [{ x: 430, y: 300, r: 28 }, { x: 850, y: 300, r: 28 }];
const SPECIAL = new Map([[4, 'cover'], [9, 'seals'], [14, 'sigils'], [19, 'reflect']]);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function circleContains(c: EncounterTarget, x: number, y: number, radius = 0) {
  return Math.hypot(x - c.x, y - c.y) <= c.r + radius;
}
export function segmentCircleHit(ax: number, ay: number, bx: number, by: number, c: EncounterTarget, radius = 0) {
  const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy;
  const t = d2 ? clamp(((c.x - ax) * dx + (c.y - ay) * dy) / d2, 0, 1) : 0;
  return Math.hypot(ax + dx * t - c.x, ay + dy * t - c.y) <= c.r + radius;
}
export function encounterRockAt(x: number, y: number, radius = 0) {
  return ENCOUNTER_ROCKS.find(r => circleContains(r, x, y, radius)) || null;
}
export function encounterProjectileRockHit(q: Attack) {
  const ax = q.prevX ?? q.x, ay = q.prevY ?? q.y;
  return ENCOUNTER_ROCKS.find(r => segmentCircleHit(ax, ay, q.x, q.y, r, q.radius || 0)) || null;
}
// A pulse travels outward from arena center; this exact occlusion predicate also defines rendered shadows.
export function encounterCovered(x: number, y: number, radius = 0) {
  const ox = 640, oy = 360;
  const d=Math.hypot(x-ox, y-oy);
  return ENCOUNTER_ROCKS.some(r=>{
    const dr=Math.hypot(r.x-ox, r.y-oy);let diff=Math.abs(Math.atan2(y-oy, x-ox)-Math.atan2(r.y-oy, r.x-ox));diff=Math.min(diff, Math.PI*2-diff);
    return d>dr+r.r+radius&&diff+Math.asin(Math.min(1, radius/Math.max(1, d)))<Math.asin(r.r/dr);
  });
}
export function encounterBeamEnd(x: number, y: number, angle: number, seals = ENCOUNTER_SEALS) {
  const dx = Math.cos(angle), dy = Math.sin(angle), max = 1500;
  let best = null;
  for (const s of seals) {
    const ox = s.x - x, oy = s.y - y, along = ox * dx + oy * dy;
    if (along < 0 || along > max) continue;
    const perpendicular = Math.abs(ox * dy - oy * dx);
    if (perpendicular <= s.r && (!best || along < best.distance)) best = { seal: s, distance: along, x: x + dx * along, y: y + dy * along };
  }
  return best || { seal: null, distance: max, x: x + dx * max, y: y + dy * max };
}
function begin(state: RunState, kind: string, stage: number) {
  const b = state.boss, phaseHp = b.maxHp || b.hp;
  const nextThreshold = b.def.phaseThresholds?.[b.phase - 1];
  state.encounter = { stage, phase: b.phase, kind, elapsed: 0, active: true, complete: false,
    phaseHp, floor: nextThreshold == null ? 1 : Math.floor(phaseHp * nextThreshold) + 1,
    pulseAt: 3.2, pulseTime: 0, pulseCount: 0, sealMask: 0, sigilMask: 0, reflectMask: 0,
    shot: null, markAt: .9, marks: [] };
  if (b.hp > 0) b.hp = Math.max(b.hp, state.encounter.floor);
}
function finish(state: RunState) {
  if (state.encounter) {
    state.encounter.active = false;
    state.encounter.complete = true;
    state.encounter.shot = null;
    state.encounter.marks.length = 0;
  }
}
export function cleanupEncounter(state: RunState) {
  state.encounter = null;
}
export function encounterDamageFloor(state: RunState) {
  const e = state.encounter;
  // Forced-zero QA fixtures and completed/irrelevant phases must remain killable.
  if(state.boss.hp<=0||state.tutorial||!SPECIAL.has(state.stage))return 0;
  if(e?.complete&&e.phase===state.boss.phase)return 0;
  if(e?.active&&e.phase===state.boss.phase)return e.floor;
  const next=state.boss.def.phaseThresholds?.[state.boss.phase-1];
  return next==null?1:Math.floor(state.boss.maxHp*next)+1;
}
export function updateSpecialEncounter(state: RunState, dt: number, helpers: EncounterHelpers = {}) {
  if (!Number.isFinite(dt) || dt <= 0 || state.tutorial || state.status !== 'playing' || state.boss.hp <= 0 || !SPECIAL.has(state.stage)) return;
  let e = state.encounter;
  if (e && (e.stage !== state.stage || e.phase !== state.boss.phase || state.boss.hp <= 0)) {
    cleanupEncounter(state);
    e = null;
  }
  if (!e) {
    const hp = state.boss.hp / Math.max(1, state.boss.maxHp);
    if (hp > .8 && state.stageTime < 10) return;
    begin(state, SPECIAL.get(state.stage), state.stage);
    e = state.encounter;
  }
  if (!e.active || e.complete) return;
  e.elapsed += dt;
  if (e.kind === 'cover') {
    e.pulseTime = Math.max(0, e.pulseTime - dt);
    if (e.pulseCount < 3 && e.elapsed >= e.pulseAt) {
      e.pulseTime = .62;
      e.pulseCount++;
      helpers.spawnHazard?.({ shape: 'circle', x: 640, y: 360, radius: 760, t: 0, phase: 'warn', windup: 0, active: .62, damage: 34, hitDone: false, encounter: 'cover-pulse' });
      e.pulseAt += 2.4;
    }
    if (e.pulseCount >= 3 && e.pulseTime <= 0) finish(state);
  } else if (e.kind === 'seals') {
    if (!e.shot && e.elapsed >= e.markAt && e.sealMask !== 3) {
      const target = state.player;
      const angle = Math.atan2(target.y - state.boss.y, target.x - state.boss.x);
      e.shot = { x: state.boss.x, y: state.boss.y, angle, age: 0, hit: null };
      e.markAt = e.elapsed + 1.35;
      const beam = encounterBeamEnd(e.shot.x, e.shot.y, angle);
      helpers.spawnHazard?.({ shape: 'lane', x: e.shot.x, y: e.shot.y, angle, length: beam.distance, width: 46, t: 0, phase: 'warn', windup: .85, active: .22, damage: 38, hitDone: false, encounter: 'seal-laser', blockedBySeal: !!beam.seal });
    }
    if (e.shot) {
      e.shot.age += dt;
      if (e.shot.age >= .85) {
        const hit = encounterBeamEnd(e.shot.x, e.shot.y, e.shot.angle);
        if (hit.seal) {
          const i = ENCOUNTER_SEALS.indexOf(hit.seal);
          e.sealMask |= 1 << i;
        }
        e.shot = null;
        if (e.sealMask === 3) finish(state);
      }
    }
  } else if (e.kind === 'sigils') {
    e.marks = e.marks.filter(m => (m.time -= dt) > 0);
    e.markAt -= dt;
    if (e.markAt <= 0 && e.marks.length < 2) {
      e.marks.push({ x: state.player.x, y: state.player.y, r: 43, time: 1.25 });
      helpers.spawnHazard?.({ shape: 'circle', x: state.player.x, y: state.player.y, radius: 43, t: 0, phase: 'warn', windup: .85, active: .18, damage: 22, hitDone: false, encounter: 'sigil-pressure' });
      e.markAt = 1.65;
    }
    if (e.sigilMask === 7) finish(state);
  } else if (e.kind === 'reflect') {
    // Each slow orb is emitted only after previous return actually hits boss (callback below).
    if (e.reflectMask === 7) finish(state);
    else if (!e.shot && e.elapsed >= e.markAt) {
      const bit = [1, 2, 4].find(v => !(e.reflectMask & v));
      const target = state.player;
      const angle = Math.atan2(target.y - state.boss.y, target.x - state.boss.x);
      const q = { owner: 'boss', kind: 'encounter-orb', x: state.boss.x, y: state.boss.y, vx: Math.cos(angle) * 145, vy: Math.sin(angle) * 145, radius: 15, damage: 26, life: 5, encounterBit: bit, secondary: false };
      e.shot = q;
      e.markAt = e.elapsed + 1;
      helpers.spawnProjectile?.(q);
    }
  }
}
export function blockEncounterMovement(state: RunState) {
  if (!state.encounter || state.encounter.kind !== 'cover' || state.encounter.stage !== state.stage) return null;
  return encounterRockAt(state.player.x, state.player.y, 18);
}
export function strikeEncounterTargets(state: RunState, hitTest: (target: EncounterTarget) => boolean, damage: (target: EncounterTarget, value: number, attack: Attack) => void, attack: Attack = {}) {
  const e = state.encounter;
  if (!e?.active || e.complete || !['melee', 'projectile', 'beam', 'meteor'].includes(attack.kind) || attack.secondary) return 0;
  let hits = 0;
  if (e.kind === 'sigils') for (let i = 0; i < ENCOUNTER_SIGILS.length; i++) {
    const bit = 1 << i, target = ENCOUNTER_SIGILS[i];
    if (!(e.sigilMask & bit) && hitTest(target)) {
      e.sigilMask |= bit;
      damage(target, 1, attack);
      hits++;
    }
  }
  if (e.sigilMask === 7) finish(state);
  return hits;
}
export function reflectEncounterProjectile(state: RunState, q: Attack, helpers: EncounterHelpers = {}) {
  const e = state.encounter;
  if (!e?.active || e.kind !== 'reflect' || q.owner !== 'boss' || q.secondary || q.encounterResolved || !q.encounterBit || (e.reflectMask & q.encounterBit)) return false;
  const inContact = Math.hypot(q.x - state.player.x, q.y - state.player.y) <= q.radius + 22;
  const invulnerable = helpers.playerInvulnerable?.(state) === true || helpers.guardActive?.(state) === true;
  if (!inContact || !invulnerable) {
    if (inContact) encounterProjectileResolved(state, q);
    return false;
  }
  q.owner = 'player';
  q.vx = Math.cos(Math.atan2(state.boss.y - q.y, state.boss.x - q.x)) * 300;
  q.vy = Math.sin(Math.atan2(state.boss.y - q.y, state.boss.x - q.x)) * 300;
  q.damage = Math.min(q.damage, 26);
  q.secondary = true;
  q.returning = true;
  q.life=4;
  q.maxLife=4;
  e.shot = q;
  return true;
}
export function encounterProjectileResolved(state: RunState, q: Attack) {
  const e = state.encounter;
  if (!e?.active || e.kind !== 'reflect' || e.shot !== q || (q.owner !== 'boss'&&!q.returning)) return false;
  e.shot = null;
  e.markAt = e.elapsed + 1;
  q.encounterResolved = true;
  return true;
}
export function encounterReturnHit(state: RunState, q: Attack, damageBoss: (damage: number, attack: Attack) => void) {
  const e = state.encounter;
  if (!e?.active || e.kind !== 'reflect' || !q?.returning || q.owner !== 'player' || !q.encounterBit || (e.reflectMask & q.encounterBit)) return false;
  e.reflectMask |= q.encounterBit;
  e.shot = null;
  damageBoss(Math.min(q.damage, 26), q);
  if (e.reflectMask === 7) finish(state);
  return true;
}
export const ENCOUNTER_INFO: Readonly<Record<number, {name: string;
  hint: string}>>=Object.freeze({
  4:{name:'폭풍의 엄폐', hint:'중앙 파동이 오기 전에 바위의 초록 그림자에 몸 전체를 숨기세요. 3회 파동 뒤 보호가 풀립니다.'},
  9:{name:'봉인 역이용', hint:'보스와 봉인석 사이에 석상이 오도록 서서 레이저를 유도하세요. 두 석상을 깨면 보호가 풀립니다.'},
  14:{name:'세 문양 파괴', hint:'빛나는 문양 세 곳을 직접 공격하세요. 본체 공격만 유효하며 발밑 표식은 이동해 피하세요.'},
  19:{name:'균열 반사', hint:'느린 청록 구슬이 닿는 순간 회피하세요. 무적으로 튕겨낸 구슬이 보스에 3회 돌아가야 보호가 풀립니다.'},
});
export function encounterProgress(e: EncounterState | null){
  if(!e)return '';
  const bits=(n: number)=>[1, 2, 4].filter(v=>n&v).length;
  return e.kind==='cover'?`파동 ${e.pulseCount}/3 · 다음 ${Math.max(0,e.pulseAt-e.elapsed).toFixed(1)}초`:e.kind==='seals'?`봉인 ${bits(e.sealMask)}/2`:e.kind==='sigils'?`문양 ${bits(e.sigilMask)}/3`:`반사 ${bits(e.reflectMask)}/3`;
}

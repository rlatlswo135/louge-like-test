import type { Weapon, ClassDefinition, CardDefinition, BossDefinition, Pattern, DodgeDefinition, RaidDefinition } from './types.mjs';
import { CLASS_UNIQUES, UNIQUES } from './builds.mjs';
import { SIGNATURES } from './signatures.mjs';
import { STAGES } from './stages.mjs';
import { BOSS_ATTACKS } from './boss-attacks.mjs';
// Game content is shared by simulation and renderer; warning geometry is hit geometry.
export const STEP = 1 / 60;
export const MAX_CATCH_UP_STEPS = 5;
export const LIMITS = Object.freeze({ projectiles: 256, hazards: 32, particles: 512, playerAttacks:64 });
export const UNIQUE_CHANCE = .06;
export const SPECIAL_UNIQUE_CHANCE = 1;
export const CLEAR_HEAL = .1;
export const RAID_DAMAGE_MULTIPLIER = .8;
export const ARENA = Object.freeze({ width: 1280, height: 720 });
export const PLAYER = Object.freeze({ hp: 100, radius: 16, speed: 260 });
export const STORM = Object.freeze({ radius: 760, minRadius: 500, delay: 60, warning: 5, duration: 60, dps: 6, tick: .5 });
const arc = (n: number) => n * Math.PI / 180;
const descriptions: Record<string, string> = {
  sword: '두 번 베고 긴 직선 마무리', spear: '짧은 찌르기·긴 관통 찌르기', axe: '가벼운 베기·묵직한 마무리',
  bow: '완충 시 시간차 쌍화살 · 이동 충전', crossbow: '완충 관통탄 · 명중 시 파열',
  fire: '화염탄 명중 뒤 폭발', water: '수압 3중첩 폭발 · 폭발 시 보호막 · 둔화', lightning: '전격탄 두 번·직선 번개 방출',
  revolver: '6발 순간 연사 · 탄창 재장전', sniper: '2발 정밀 사격 · 강한 사격 경직',
  punch: '직선 잽·스트레이트·강타 3연계', kick: '직선 앞차기·밀어차기 2연계',
};
const melee = (id: string, name: string, damage: number, interval: number, reach: number, color: string, degrees = 120): Weapon => ({
  id, name, description: descriptions[id], kind: 'melee', damage, interval, reach,
  arc: arc(degrees), swingTime: id === 'axe' ? .28 : id === 'punch' ? .16 : .22, color,
});
const ranged = (id: string, name: string, damage: number, interval: number, speed: number, radius: number, color: string, reach: number): Weapon => ({
  id, name, description: descriptions[id], kind: 'projectile', damage, interval,
  reach, arc: arc(24), swingTime: .16, speed, radius, color,
});
const dodge = (kind: string, label: string, cooldown: number, duration: number, invulnerable: number, distance: number, extra: Partial<DodgeDefinition> = {}): DodgeDefinition => ({ kind, label, cooldown, duration, invulnerable, distance, ...extra });
export const CLASSES: readonly ClassDefinition[] = Object.freeze([
{ id: 'warrior', maxHp:120, damageReduction:.12, name: '전사', description: '위험을 감수하는 고위력 근접 전투', color: '#5fd8e8', dodge: dodge('step', '전진 회피', 1.1, .22, .16, 150), weapons: [melee('sword', '검', 44, .42, 80, '#ffe08a'), melee('spear', '창', 63, .62, 135, '#bde9dc', 42), melee('axe', '도끼', 96, .82, 86, '#ff9b65', 150)] },
{ id: 'archer', maxHp:95, damageReduction:0, name: '궁수', description: '충전 중 기동 · 떼면 발사 · 완충 자동 발사', color: '#a9df87', dodge: dodge('roll', '구르기', 1.25, .32, .16, 220), weapons: [
  { ...ranged('bow', '활', 78, .22, 650, 6, '#d6f2a3', 360), chargeTime: .65 },
  { ...ranged('crossbow', '석궁', 114, .28, 800, 8, '#e8c98c', 410), chargeTime: .95 },
  ] },
{ id: 'mage', maxHp:90, damageReduction:0, name: '마법사', description: '원소마다 다른 거리와 공격 리듬', color: '#c3a1ff', dodge: dodge('blink', '순간이동', 1.25, .16, .14, 185), weapons: [ranged('fire', '불', 60, .72, 520, 11, '#ff7a45', 330), {...ranged('water', '물', 36, .6, 510, 10, '#5fc9ff', 320), effect:'water'}, ranged('lightning', '번개', 20, .24, 780, 5, '#ffe873', 290)] },
{ id: 'gunslinger', maxHp:100, damageReduction:0, name: '총술사', description: '멈춰서 순간 화력 · 재장전 중 이동', color: '#e9bd78', dodge: dodge('roll', '사격 구르기', 1.1, .24, .16, 145, {canAttack:true}), weapons: [
  { ...ranged('revolver', '리볼버', 28, .16, 1050, 4, '#ffe08a', 295), magazine: 6, reloadTime: 1.2, recoilTime: .14, shotMove: .6 },
  { ...ranged('sniper', '저격총', 92, .45, 1400, 5, '#f1efff', 430), magazine: 2, reloadTime: 1.8, recoilTime: .32, shotMove: .3 },
  ] },
{ id: 'fighter', maxHp:110, damageReduction:.06, name: '격투가', description: '밀착 고화력 · 짧은 회피 재사용', color: '#fa967f', dodge: dodge('dash', '연속 돌진', .95, .12, .1, 85, {chainWindow:.45}), weapons: [melee('punch', '펀치', 29, .25, 58, '#ffd0a0'), melee('kick', '킥', 54, .48, 88, '#fff0bb', 100)] },
]);
const p = (id: string, name: string, shape: string, opts: Pattern = {}): Pattern => ({
  id,
  name,
  tactic: opts.tactic ?? `${name} 예고를 보고 안전 틈으로 이동`,
  shape,
  ...opts,
  radius: opts.radius ?? 130,
  halfAngle: opts.halfAngle ?? arc(45),
  windup: opts.windup ?? .9,
  active: opts.active ?? .18,
  recover: opts.recover ?? .9,
  damage: opts.damage ?? 18,
});
const projectile = (id: string, name: string, opts: {speed?: number; radius?: number; life?: number; volley?: number; spread?: number; windup?: number; recover?: number; damage?: number; radial?: boolean; shotDelay?: number} = {}): Pattern => ({
  ...p(id, name, 'projectile', {
    windup: opts.windup ?? .8,
    active: .1,
    recover: opts.recover ?? .7,
    damage: opts.damage ?? 16,
  }),
  projectileSpeed: opts.speed ?? 230,
  projectileRadius: opts.radius ?? 11,
  projectileLife: opts.life ?? 3,
  volley: opts.volley ?? 1,
  spread: opts.spread ?? 0,
  radial: opts.radial || false,
  shotDelay: opts.shotDelay,
});
const defs: [string, string, string, string, number, number, number, Pattern[]][] = [
['iron-warden', '철갑 파수꾼', '철의 맹세', '#bd9870', 900, 70, .8, [
p('cleave', '정면 부채꼴 베기', 'sector', { radius: 230, halfAngle: arc(55), windup: 1, active: .15, damage: 25, sequence: 2, retarget: true }),
p('slam', '원형 내려치기', 'circle', { radius: 135, windup: 1.1, active: .15, damage: 30 }),
p('cleave2', '엇갈린 후속 베기', 'sector', { radius: 205, halfAngle: arc(42), windup: 1, active: .15, damage: 22, sequence: 2, angleStep: Math.PI }),
{...p('slam-waves', '표적 강타 · 세 겹 파문', 'circle', {radius:135, windup:1.1, active:.15, damage:30}), steps:[p('slam-mark', '발밑 강타', 'circle', {radius:135, windup:1.1, active:.15, damage:30}), p('slam-ripples', '퍼지는 파문', 'ring', {anchor:'boss', radius:180, innerRadius:90, sequence:3, radiusStep:55, sequenceDelay:.24, windup:1.1, active:.18, damage:22})]},
p('fault-line', '대지 가르기', 'lane', { width: 110, length: 470, windup: 1.3, active: .22, recover: 1.2, damage: 29 }),
]],
['ravager', '돌진수', '붉은 돌격', '#df765d', 950, 95, .7, [
p('charge', '돌진', 'lane', { radius: 54, windup: 1, active: .5, recover: 0, damage: 24, distance: 360, finisher: { closeRadius: 260, halfAngle: arc(48), width: 100, windup: .65, active: .2, recover: .7, damage: 28 } }),
p('ravager-slam', '분쇄 강타', 'circle', { radius: 135, windup: 1.15, damage: 25 }),
p('charge-burst', '분쇄 돌진 · 추격 강타', 'lane', { radius: 48, distance: 300, windup: 1.2, active: .32, recover: 0, damage: 24,
  finisher: { closeRadius: 260, halfAngle: arc(48), width: 100, windup: .65, active: .2, recover: .7, damage: 34 } }),
]],
['ember-guardian', '잿불 수호자', '꺼지지 않는 불꽃', '#ee8754', 1100, 65, .65, [
p('embers', '순차 화염 표식', 'circle', { radius: 74, windup: 1.05, active: .2, recover: .8, damage: 18, sequence: 3, retarget: true }),
projectile('ember-volley', '틈 있는 탄막', { speed: 200, volley: 5, spread: arc(54), windup: .95 }),
p('ember-petals', '불꽃 화환', 'circle', { radius: 70, layout: 'orbit', orbitRadius: 110, sequence: 4, sequenceDelay: .22, windup: 1.15, active: .25, damage: 22 }),
]],
['frost-watcher', '서리 감시자', '고요한 겨울', '#75bde0', 1150, 58, .65, [
p('fan', '서리 부채', 'sector', { radius: 270, halfAngle: arc(40), windup: 1, damage: 21 }),
p('ring', '안전 틈 고리', 'ring', { radius: 235, innerRadius: 175, gapHalfAngle: arc(32), windup: 1.15, damage: 20 }),
p('frost-waves', '세 겹의 서리 파동', 'ring', { radius: 120, innerRadius: 55, radiusStep: 60, sequence: 3, sequenceDelay: .34, windup: 1.2, active: .2, damage: 22 }),
]],
['storm-orb', '폭풍 구체', '번개의 심장', '#9b9bed', 1250, 75, .6, [
p('lightning-lanes', '전격 레인', 'lane', { radius: 54, windup: 1.1, active: .22, recover: .8, damage: 22, sequence: 3, retarget: true }),
projectile('spiral', '나선 탄막', { speed: 220, volley: 7, spread: arc(68), windup: 1 }),
p('storm-sweep', '회전 번개 낫', 'sector', { radius: 250, halfAngle: arc(25), sequence: 3, sequenceDelay: .26, angleStep: .72, windup: 1.1, active: .16, damage: 23 }),
]],
['iron-bastion', '철벽 포대', '움직이는 요새', '#aaa49a', 1350, 48, .6, [
p('cross', '십자 레인', 'lane', { radius: 50, windup: 1.1, active: .22, recover: .85, damage: 24, sequence: 4 }),
p('barrage', '순차 포격', 'circle', { radius: 56, windup: 1, active: .2, recover: .8, damage: 20, sequence: 4, retarget: true }),
p('rail-cannon', '공성포 충전 사격', 'lane', { width: 76, length: 780, windup: 1.5, active: .24, recover: 1.6, damage: 35 }),
]],
['twin-blades', '쌍날 검령', '두 자루의 망령', '#dc8494', 1450, 105, .55, [
p('twin-cleave', '연속 베기', 'sector', { radius: 205, halfAngle: arc(48), windup: .95, active: .15, recover: .75, damage: 21, sequence: 2, retarget: true }),
p('twin-charge', '쌍돌진', 'lane', { radius: 56, windup: 1, active: .35, recover: 0, damage: 24, sequence: 2, distance: 230, retarget: true, finisher: { closeRadius: 260, halfAngle: arc(48), width: 100, windup: .65, active: .2, recover: .7, damage: 28 } }),
p('blade-wheel', '검륜 · 뒤편의 틈', 'ring', { anchor: 'boss', radius: 205, innerRadius: 85, gapHalfAngle: arc(36), gapOffset: Math.PI, windup: 1.2, active: .22, damage: 24 }),
]],
['abyss-shaman', '심연 주술사', '깊은 곳의 노래', '#8f79bb', 1550, 54, .55, [
p('pool', '지속 장판', 'circle', { radius: 95, windup: 1.1, active: 1.25, recover: .8, damage: 13 }),
p('wave', '심연 파동', 'ring', { radius: 280, innerRadius: 210, gapHalfAngle: arc(36), windup: 1.1, active: .25, recover: .8, damage: 22 }),
projectile('soul-wheel', '회전하는 망령', { speed: 190, volley: 8, radial: true, shotDelay: .1, windup: 1.1, damage: 19 }),
]],
['dusk-executioner', '황혼 집행자', '마지막 판결', '#d98669', 1700, 92, .5, [
p('execution', '집행 베기', 'sector', { radius: 290, halfAngle: arc(34), windup: 1.15, damage: 27 }),
projectile('dusk-shot', '황혼 탄환', { speed: 300, volley: 3, spread: arc(32), windup: .95, damage: 20 }),
p('execution-cross', '삼연 집행선', 'lane', { width: 90, length: 560, sequence: 3, angleStep: .8, sequenceDelay: .27, windup: 1.2, active: .2, damage: 26 }),
]],
['rift-lord', '균열 군주', '두 세계의 끝', '#a17bda', 1900, 68, .5, [
p('rift-burst', '균열 폭발', 'circle', { radius: 145, windup: 1.15, damage: 28 }),
p('rift-ring', '틈새 고리', 'ring', { radius: 300, innerRadius: 225, gapHalfAngle: arc(38), windup: 1.1, damage: 25 }),
projectile('rift-volley', '균열 탄막', { speed: 250, volley: 5, spread: arc(60), windup: 1 }),
p('rift-collapse', '균열 꽃 · 중심 붕괴', 'circle', { radius: 60, layout: 'orbit', orbitRadius: 125, sequence: 6, sequenceDelay: .2, windup: 1.2, active: .2, damage: 23,
  aftershock: { radius: 140, windup: .7, active: .22, damage: 38 } }),
]],
];
const extraPatterns = [
{ ...p('backstep-burst', '보스 폭발 뒤 교차선', 'circle', {radius:90, anchor:'boss', windup:.9, active:.2, recover:1.1, damage:24}), steps:[p('backstep-blast', '근거리 퇴로 차단', 'circle', {radius:90, anchor:'boss', windup:.9, active:.2, damage:24}), p('backstep-cross', '후속 교차선', 'lane', {width:70, length:600, sequence:2, angleStep:Math.PI/2, windup:1, damage:22})] },
p('needle-lane', '세 갈래 평행 침선', 'lane', {width:58, length:620, sequence:3, lateralStep:100, windup:1, damage:22}),
p('wide-sweep', '엇갈린 대참격', 'sector', {radius:310, halfAngle:arc(24), sequence:2, sequenceDelay:.32, angleStep:Math.PI/2, windup:1.2, active:.18, recover:1.1, damage:29}),
{ ...p('inner-collapse', '중심 붕괴 뒤 외곽 균열', 'circle', {radius:180, windup:1, active:.35, recover:1.2, damage:26}), steps:[p('inner-collapse-core', '중심 폭발', 'circle', {radius:125, windup:1, active:.3, damage:25}), p('inner-collapse-lines', '교차 균열', 'lane', {width:72, length:640, sequence:2, angleStep:Math.PI/2, windup:1.25, damage:28})] },
{ ...p('outer-collapse', '외곽 고리 뒤 표적 폭발', 'ring', {radius:300, innerRadius:220, windup:1.1, active:.28, damage:25}), steps:[p('outer-collapse-ring', '외곽 고리', 'ring', {radius:300, innerRadius:220, windup:1.1, active:.28, damage:25}), p('outer-collapse-mark', '중심 표식', 'circle', {radius:82, windup:1, active:.25, damage:24})] },
p('orbit-mines', '궤도 지뢰', 'circle', {radius:58, layout:'orbit', orbitRadius:180, sequence:5, sequenceDelay:.24, windup:1.1, damage:22}),
p('crossing-rifts', '교차 균열', 'lane', {width:72, length:640, sequence:2, angleStep:Math.PI/2, windup:1.25, damage:28}),
{ ...p('delayed-pulse', '엇박자 탄환 · 바깥으로 · 안으로', 'projectile', {windup:1, active:.2, recover:.9, damage:24}), tactic:'엇박자 탄환을 흘린 뒤 보스 폭발에서 멀어지고, 마지막 고리 안으로 복귀', steps:[projectile('delayed-pulse-shots', '엇박자 양갈래 탄환', {speed:240, volley:2, spread:arc(32), shotDelay:.24, windup:1, damage:18}), p('delayed-pulse-core', '보스 중심 폭발', 'circle', {anchor:'boss', radius:140, windup:1.15, active:.2, damage:24}), p('delayed-pulse-ring', '돌아오는 고리', 'ring', {anchor:'boss', radius:340, innerRadius:240, windup:1.15, active:.2, damage:24})] },
p('close-quake', '근거리 지진', 'circle', {radius:155, anchor:'boss', windup:.8, active:.22, recover:1.1, damage:25}),
p('far-quake', '먼 지진', 'circle', {radius:120, windup:1.15, active:.24, recover:1, damage:24}),
p('rotating-fan', '회전 부채', 'sector', {radius:240, halfAngle:arc(18), sequence:4, sequenceDelay:.24, angleStep:Math.PI/2, windup:1, damage:23}),
p('backline-cut', '엇갈린 후방 절단', 'lane', {width:95, length:500, sequence:2, sequenceDelay:.34, angleStep:Math.PI, windup:1.05, damage:26}),
p('orbiting-ring', '회전 고리', 'ring', {radius:240, innerRadius:160, gapHalfAngle:arc(24), sequence:3, sequenceDelay:.3, angleStep:.9, windup:1.15, damage:24}),
p('forked-charge', '갈래 돌진', 'lane', {width:62, length:380, sequence:3, sequenceDelay:.32, angleStep:arc(32), windup:1, active:.24, recover:0, damage:24, distance:300, finisher:{closeRadius:260, halfAngle:arc(48), width:100, windup:.65, active:.2, recover:.7, damage:28}}),
p('pinwheel-bolts', '바늘 탄막', 'projectile', {windup:1.05, active:.1, recover:.9, damage:17, projectileSpeed:260, projectileRadius:8, projectileLife:3, volley:9, spread:arc(80)}),
projectile('seeking-orbs', '추적 구슬', {speed:210, volley:3, spread:arc(45), windup:1.05, damage:18}),
projectile('radial-burst', '방사 탄환', {speed:235, volley:8, radial:true, windup:1.1, damage:18}),
projectile('staggered-shot', '엇박자 사격', {speed:320, volley:3, spread:arc(18), shotDelay:.22, windup:.95, damage:21}),
{ ...p('moving-wall', '장벽 뒤 추격탄', 'lane', {width:130, length:600, sequence:3, sequenceDelay:.3, angleStep:arc(45), windup:1.1, damage:27}), steps:[p('moving-wall-bars', '엇갈린 장벽', 'lane', {width:130, length:600, sequence:3, sequenceDelay:.3, angleStep:arc(45), windup:1.1, damage:27}), projectile('moving-wall-shot', '장벽 뒤 탄환', {speed:300, volley:3, spread:arc(30), windup:1, damage:18})] },
p('spiral-stamps', '나선 표식', 'circle', {radius:64, layout:'orbit', orbitRadius:210, sequence:7, sequenceDelay:.18, angleStep:.82, windup:1.2, damage:21}),
p('double-ring', '겹고리 파동', 'ring', {radius:250, innerRadius:190, sequence:2, sequenceDelay:.45, radiusStep:-80, windup:1.2, damage:25}),
p('retreating-lanes', '후퇴 사선', 'lane', {width:78, length:580, sequence:3, sequenceDelay:.28, angleStep:arc(55), windup:1.15, damage:25}),
p('boss-orbit-blades', '보스 궤도 칼날', 'sector', {radius:220, halfAngle:arc(22), anchor:'boss', sequence:3, sequenceDelay:.25, angleStep:2.1, windup:1, damage:24}),
p('aftershock-mark', '잔진동 표식', 'circle', {radius:105, windup:1, active:.2, recover:.8, damage:19, aftershock:{radius:165, windup:.9, active:.2, damage:24}}),
{ ...p('safe-core', '외곽 압착 뒤 방사탄', 'ring', {radius:320, innerRadius:245, windup:1.3, active:.35, recover:1, damage:28}), steps:[p('safe-core-ring', '외곽 압착', 'ring', {radius:320, innerRadius:245, windup:1.3, active:.35, damage:28}), projectile('safe-core-bolts', '중심에서 퍼지는 탄환', {speed:235, volley:8, radial:true, windup:1.1, damage:18})] },
];
const basePatternMap = new Map<string, Pattern>();
for (const [, , , , , , , pool] of defs) for (const pattern of pool) if (!basePatternMap.has(pattern.id)) basePatternMap.set(pattern.id, pattern);
for (const pattern of extraPatterns) basePatternMap.set(pattern.id, pattern);
const normalizePattern = (pattern: Pattern): Pattern => ({
  ...pattern,
  windup: Math.max(.6, pattern.windup * .68),
  recover: Math.max(pattern.distance ? .65 : .28, (pattern.recover ?? .9) * .42),
  damage: Math.max(28, Math.round(pattern.damage * 1.4)),
  ...(pattern.innerRadius != null ? { innerRadius: Math.round(pattern.innerRadius * .62) } : {}),
  ...(pattern.projectileSpeed != null ? { projectileSpeed: pattern.projectileSpeed * 1.45 } : {}),
  ...(pattern.steps ? { steps: pattern.steps.map(normalizePattern) } : {}),
  // Follow-ups already use combat units; scaling them again inflates damage and erases their warning.
  ...(pattern.finisher ? { finisher: { ...pattern.finisher, windup: Math.max(.65, pattern.finisher.windup), recover: Math.max(.65, pattern.finisher.recover ?? .7) } } : {}),
  ...(pattern.aftershock ? { aftershock: { ...pattern.aftershock, windup: Math.max(.6, pattern.aftershock.windup) } } : {}),
});
const rawPatterns = [...basePatternMap.values(), ...BOSS_ATTACKS];
rawPatterns.push(
{ id:'combo-crossfire', name:'교차 봉쇄', tactic:'첫 선을 비킨 뒤 교차하는 두 번째 선으로 이동', shape:'lane', windup:1.2, active:.2, recover:1, damage:25, steps:[basePatternMap.get('fault-line'), basePatternMap.get('crossing-rifts')] },
{ id:'combo-ring-and-fan', name:'고리 뒤 부채', tactic:'고리의 틈을 통과하고 곧바로 부채 뒤편으로 회피', shape:'ring', windup:1.1, active:.2, recover:1, damage:24, steps:[basePatternMap.get('ring'), basePatternMap.get('wide-sweep')] },
{ id:'combo-mines-and-volley', name:'지뢰 탄막', tactic:'지뢰 사이를 유지하며 날아오는 탄막을 피함', shape:'circle', windup:1.1, active:.2, recover:1, damage:22, steps:[basePatternMap.get('orbit-mines'), basePatternMap.get('ember-volley')] },
);
export const PATTERNS = Object.freeze(Object.fromEntries(rawPatterns.map(pattern => [pattern.id, Object.freeze(normalizePattern(pattern))])));
defs.push(
['glass-duelist', '유리 결투가', '깨진 거울의 춤', '#8bcdd0', 1750, 112, .48, [PATTERNS['twin-cleave'], PATTERNS['backline-cut'], PATTERNS['orbiting-ring'], PATTERNS['needle-lane'], PATTERNS['forked-charge'], PATTERNS['wide-sweep']]],
['mire-queen', '수렁 여왕', '늪의 숨결', '#769b72', 1850, 52, .52, [PATTERNS['pool'], PATTERNS['delayed-pulse'], PATTERNS['seeking-orbs'], PATTERNS['outer-collapse'], PATTERNS['spiral-stamps'], PATTERNS['safe-core']]],
['sun-eater', '태양 포식자', '일식의 궤도', '#e39a54', 1950, 75, .45, [PATTERNS['ember-petals'], PATTERNS['radial-burst'], PATTERNS['rotating-fan'], PATTERNS['orbit-mines'], PATTERNS['aftershock-mark'], PATTERNS['pinwheel-bolts']]],
['clockwork-regent', '태엽 섭정', '멈춘 시간', '#b49a74', 2050, 62, .44, [PATTERNS['cross'], PATTERNS['staggered-shot'], PATTERNS['double-ring'], PATTERNS['retreating-lanes'], PATTERNS['moving-wall'], PATTERNS['combo-crossfire']]],
['void-leviathan', '공허 레비아탄', '심연의 역류', '#7766aa', 2200, 60, .42, [PATTERNS['wave'], PATTERNS['rift-volley'], PATTERNS['crossing-rifts'], PATTERNS['boss-orbit-blades'], PATTERNS['combo-ring-and-fan'], PATTERNS['combo-mines-and-volley'], PATTERNS['spiral'], PATTERNS['safe-core']]],
['red-comet', '붉은 혜성', '불타는 궤적', '#df665b', 2300, 118, .4, [PATTERNS['charge'], PATTERNS['ember-volley'], PATTERNS['forked-charge'], PATTERNS['wide-sweep'], PATTERNS['aftershock-mark'], PATTERNS['seeking-orbs']]],
['pale-oracle', '창백한 예언자', '세 갈래 미래', '#b2c8d5', 2400, 58, .4, [PATTERNS['fan'], PATTERNS['retreating-lanes'], PATTERNS['orbiting-ring'], PATTERNS['delayed-pulse'], PATTERNS['pinwheel-bolts'], PATTERNS['double-ring']]],
['thunder-colossus', '천둥 거신', '폭풍의 잔향', '#7777c4', 2550, 72, .38, [PATTERNS['lightning-lanes'], PATTERNS['radial-burst'], PATTERNS['crossing-rifts'], PATTERNS['rotating-fan'], PATTERNS['combo-crossfire'], PATTERNS['moving-wall']]],
['night-matriarch', '밤의 모후', '검은 장막', '#815f9e', 2750, 88, .36, [PATTERNS['execution'], PATTERNS['orbit-mines'], PATTERNS['backline-cut'], PATTERNS['spiral-stamps'], PATTERNS['combo-ring-and-fan'], PATTERNS['combo-mines-and-volley'], PATTERNS['aftershock-mark'], PATTERNS['safe-core']]],
['rift-emperor', '균열 황제', '영원의 틈', '#a875d4', 3100, 82, .34, [PATTERNS['rift-burst'], PATTERNS['rift-ring'], PATTERNS['rift-volley'], PATTERNS['rift-collapse'], PATTERNS['combo-crossfire'], PATTERNS['combo-ring-and-fan'], PATTERNS['combo-mines-and-volley'], PATTERNS['safe-core'], PATTERNS['aftershock-mark']]],
);
for (let i=0;i<10;i++) defs[i][7] = [...defs[i][7], ...extraPatterns.filter((_, j)=>j%10===i).map(pattern=>PATTERNS[pattern.id])];
const specialExtras = {
  'storm-orb':['wide-sweep', 'outer-collapse', 'needle-lane', 'radial-burst', 'combo-crossfire'],
  'rift-lord':['crossing-rifts', 'aftershock-mark', 'pinwheel-bolts', 'combo-ring-and-fan'],
};
for (const [id, ids] of Object.entries(specialExtras)) defs.find(def=>def[0]===id)[7].push(...ids.map(patternId=>PATTERNS[patternId]));
const briefings: Record<string, {overview: string;
  hint: string}> = {
  'iron-warden': { overview: '연속 검격과 지면 강타로 압박하는 근접형 파수꾼. 거리를 벌리면 돌진으로 따라붙습니다.', hint: '베기는 두 번 이어집니다. 마지막 공격을 피한 뒤 반격하세요.' },
  ravager: { overview: '몸 전체를 무기로 삼는 돌격수. 착지 뒤 현재 위치를 다시 겨냥합니다.', hint: '첫 돌진을 피하세요. 착지 뒤 새 예고가 시작되면 다시 방향을 읽으세요.' },
  'ember-guardian': { overview: '이동 경로에 불꽃을 새기는 수호자. 순차 표식과 꽃 모양 폭발로 발걸음을 끊습니다.', hint: '예고가 고정된 뒤 방향을 바꾸세요. 아직 차오르는 다음 표식도 확인하세요.' },
  'frost-watcher': { overview: '연속 파동과 날카로운 부채꼴 공격을 쓰는 감시자. 고리마다 안전한 공간이 다릅니다.', hint: '고리의 빈틈이나 안쪽을 활용하세요. 바깥으로 번지는 다음 파동에 주의하세요.' },
  'storm-orb': { overview: '직선 전격과 회전하는 탄막을 펼치는 구체. 넓은 공간에서도 사선이 교차합니다.', hint: '탄막 사이 틈으로 이동하고, 회전 베기의 마지막 방향까지 확인하세요.' },
  'iron-bastion': { overview: '십자 사격과 순차 포격으로 퇴로를 압박하는 이동 포대. 공성포는 멀리까지 뻗습니다.', hint: '긴 사격선에서 옆으로 벗어나세요. 공성포 발사 뒤에는 반격할 틈이 큽니다.' },
  'twin-blades': { overview: '연속 베기와 쌍돌진을 잇는 검령. 가까이서는 뒤편에 틈이 있는 검륜을 펼칩니다.', hint: '각 돌진의 새 예고를 확인하세요. 마지막 공격 뒤 반격하세요.' },
  'abyss-shaman': { overview: '지속 장판과 방사형 망령을 부리는 주술사. 장판은 한 번 맞아도 사라지지 않습니다.', hint: '장판에서는 즉시 빠져나오세요. 망령의 발사 순서를 보고 틈으로 이동하세요.' },
  'dusk-executioner': { overview: '넓은 집행 베기와 세 갈래 집행선을 쓰는 처형자. 황혼 탄환으로 먼 거리도 견제합니다.', hint: '베기는 뒤편으로 피하고, 집행선은 다음 방향이 차오르는지 살피세요.' },
  'rift-lord': { overview: '폭발과 고리, 탄막을 섞는 균열 군주. 체력이 절반이 되면 공격이 강화됩니다.', hint: '꽃 모양 폭발 뒤에는 중심이 무너집니다. 마지막 예고까지 피한 뒤 반격하세요.' },
  'glass-duelist': { overview:'거울처럼 방향을 바꾸는 검격과 회전 고리로 결투장을 좁힙니다.', hint:'첫 공격을 피한 뒤 궤도가 바뀌는 순간을 노리세요.' },
  'mire-queen': { overview:'지속 장판과 추적 구슬로 안전한 지대를 천천히 잠식합니다.', hint:'장판을 벗어나고 구슬을 유인한 뒤 반격하세요.' },
  'sun-eater': { overview:'궤도 지뢰와 회전 부채를 겹쳐 일식을 완성합니다.', hint:'지뢰 사이 간격을 남겨두고 부채의 회전 방향을 읽으세요.' },
  'clockwork-regent': { overview:'시간차 포격과 이동 장벽으로 회피 경로를 재단합니다.', hint:'첫 사격 뒤 생기는 새 통로를 따라 이동하세요.' },
  'void-leviathan': { overview:'심연의 파동과 연속 복합 공격을 섞는 균열의 수문장.', hint:'고리의 틈을 유지하고 다음 공격 예고까지 기다리세요.' },
  'red-comet': { overview:'빠른 돌진과 탄막으로 추격전을 벌이는 혜성의 화신.', hint:'돌진을 옆으로 흘리고 착지 후 반격하세요.' },
  'pale-oracle': { overview:'부채꼴과 고리가 겹치는 세 갈래 공격을 예언합니다.', hint:'반복되는 방향을 관찰하되 안전지대는 계속 바뀝니다.' },
  'thunder-colossus': { overview:'전격 레인과 교차 균열로 넓은 전장을 압박합니다.', hint:'연속 선 사이의 열린 축을 따라 움직이세요.' },
  'night-matriarch': { overview:'검은 장막 아래 표식과 탄막을 연속으로 엮습니다.', hint:'복합 공격이 끝날 때까지 자리를 고정하지 마세요.' },
  'rift-emperor': { overview:'세 단계에 걸쳐 폭발·고리·탄막·복합 공격을 모두 펼칩니다.', hint:'페이즈가 바뀔 때마다 공격 순서가 달라집니다.' },
};
const pursuit = p('hunt', '도망칠 곳은 없다 · 추격 돌진', 'lane', {
  radius: 44, windup: .65, active: .38, recover: 0, damage: 34, distance: 620,
  finisher: { closeRadius: 260, halfAngle: arc(48), width: 100, windup: .65, active: .2, recover: .7, damage: 28 },
});
const raids: RaidDefinition[] = [
{ name:'철의 심판', kind:'corridor', hint:'가로 → 세로 → 가로. 비어 있는 통로로 이동하세요.' },
{ name:'붉은 대지 붕괴', kind:'in-out', hint:'안쪽 → 바깥쪽 → 안쪽. 폭발이 끝난 뒤 다음 위치로 이동하세요.' },
{ name:'잿불의 회전 성역', kind:'carousel', hint:'중심과 외곽은 위험합니다. 고리 안의 빈 부채꼴을 따라 회전하세요.' },
{ name:'빙하의 호흡', kind:'in-out', invert:true, hint:'바깥쪽 → 안쪽 → 바깥쪽. 얼음 파동의 안팎을 오가세요.' },
{ name:'폭풍의 눈', kind:'carousel', turn:-1, hint:'중심에서 한 걸음 떨어져, 시계 반대 방향으로 바뀌는 빈틈을 따라가세요.' },
{ name:'전면 포격', kind:'corridor', rounds:4, axis:1, hint:'세로와 가로 통로가 네 번 바뀝니다. 마지막 포격까지 이동하세요.' },
{ name:'검령의 윤무', kind:'carousel', rounds:4, hint:'고리의 빈틈을 따라 네 번 회전하세요. 중심으로 파고들면 맞습니다.' },
{ name:'심연의 밀물', kind:'in-out', hint:'안쪽 → 바깥쪽 → 안쪽. 마지막 밀물은 안전 중심이 더 좁습니다.' },
{ name:'황혼의 단두대', kind:'corridor', crossFinal:true, hint:'통로를 따라 이동하다가, 마지막에는 가로·세로가 겹친 빈 사각형으로 들어가세요.' },
{ name:'균열 대전환', kind:'carousel', hint:'중심과 외곽을 피해 회전하는 성역으로 이동하세요. 2페이즈는 네 번 역회전합니다.' },
{ name:'거울의 복도', kind:'corridor', axis:1, rounds:4, hint:'엇갈리는 통로를 읽고 마지막 교차선을 피하세요.' },
{ name:'수렁의 조수', kind:'in-out', invert:true, rounds:4, hint:'바깥과 안쪽으로 번갈아 이동하세요.' },
{ name:'일식의 회전', kind:'carousel', turn:-1, rounds:4, hint:'빈 부채꼴을 따라 역회전하세요.' },
{ name:'태엽의 십자', kind:'corridor', crossFinal:true, rounds:4, hint:'마지막 교차 포격의 사각으로 이동하세요.' },
{ name:'공허의 밀물', kind:'in-out', rounds:4, hint:'고리가 닫히기 전 안팎의 안전지대로 이동하세요.' },
{ name:'혜성의 궤도', kind:'carousel', rounds:4, hint:'회전하는 빈틈에서 다음 빈틈으로 옮겨가세요.' },
{ name:'예언의 단두대', kind:'corridor', axis:1, rounds:4, hint:'각 사격선의 방향이 바뀝니다.' },
{ name:'천둥의 심장', kind:'carousel', turn:-1, rounds:4, hint:'회전하는 성역의 안쪽 가장자리를 유지하세요.' },
{ name:'검은 파도', kind:'in-out', invert:true, rounds:4, hint:'파도마다 안전 반경이 바뀝니다.' },
{ name:'영원의 균열', kind:'corridor', crossFinal:true, rounds:5, hint:'마지막 겹친 선까지 보고 안전 사각으로 이동하세요.' },
];
const raidPrograms = (id: string, index: number): RaidDefinition[] => {
  const chosen = index % 5 === 4
  ? ['corridor', 'in-out', 'carousel'].map(kind => raids.find((raid, i) => raid.kind === kind && i >= index % raids.length) || raids.find(raid => raid.kind === kind))
  : [raids[index%raids.length], raids[(index+3)%raids.length], raids[(index+6)%raids.length]];
  if (index % 5 !== 4 && new Set(chosen.map(raid => raid.kind)).size < 2) chosen[2] = raids.find(raid => raid.kind !== chosen[0].kind);
  return chosen.map((raid, i) => ({ ...raid, id:`${id}-raid-${'abc'[i]}` }));
};
export const BOSSES: Readonly<Record<string, BossDefinition>> = Object.freeze(Object.fromEntries(defs.map(([id, name, title, color, hp, speed, idle, patterns], index) => {
  const special = [4, 9, 14, 19].includes(index);
  const raidsForBoss = raidPrograms(id, index);
  const bossPatterns = [...new Map([...patterns, BOSS_ATTACKS[index]].map(pattern => [pattern.id, PATTERNS[pattern.id]])).values()];
  return [id, {
    id, artId: index<10 ? id : defs[index-10][0], name, title, color,
    ...(briefings[id] ?? {overview:`${title}의 공격 패턴을 읽고 반격하세요.`, hint:'예고가 끝난 뒤 안전지대로 이동해 반격하세요.'}),
    hp: Math.round(hp * 1.4), radius: 42, special, phaseThresholds: index===19?[.67, .33]:special?[.5]:[],
    raid: raidsForBoss[0], raids: raidsForBoss,
    signature: SIGNATURES[index], arena: STAGES[index],
    speed: speed + 145, idle: Math.max(.16, idle * .32),
    preferredRange:[98, 82, 250, 205, 215, 290, 88, 245, 115, 235, 90, 220, 240, 270, 230, 82, 260, 110, 235, 175][index],
    projectileSpeedFactor:index===2?1.55:1,
    pursuit: ['iron-warden', 'ravager', 'twin-blades'].includes(id) ? pursuit : null,
    patterns: bossPatterns,
  }];
})));
export const CAMPAIGN = Object.freeze({ stages: defs.map(([id]) => id) });
export const TUTORIAL_BOSS: BossDefinition = Object.freeze({
  id:'practice-warden', artId:'iron-warden', name:'연습용 파수꾼', title:'천천히 익히는 첫 결투', color:'#a5bf98',
  hp:180, radius:42, speed:0, idle:2, pursuit:null, raid:null, raids:[], special:false, phaseThresholds:[],
  patterns:[
  p('practice-mark', '발밑 표식 · 옆으로 회피', 'circle', {radius:70, windup:2, active:.16, recover:1.8, damage:3}),
  p('practice-line', '느린 직선 · 옆으로 회피', 'lane', {radius:40, width:80, windup:2.2, active:.16, recover:1.8, damage:3}),
  ],
});
export const CARDS: readonly CardDefinition[] = Object.freeze([
{ id:'edge', name:'날 선 칼날', description:'피해 +20%', category:'damage', maxStacks:3 },
{ id:'tempo', name:'전투 박자', description:'공격 간격 15% 감소', category:'haste', maxStacks:3 },
{ id:'reach', name:'긴 손', description:'사거리 +15%', category:'reach', maxStacks:2 },
{ id:'vitality', name:'생명력', description:'최대 체력 +20, 체력 20 회복', category:'maxHP', maxStacks:3 },
{ id:'healing', name:'회복', description:'체력 20 회복', category:'heal', maxStacks:3 },
{ id:'swift', name:'가벼운 발', description:'이동 속도 +8%', category:'move', maxStacks:3 },
{ id:'heavy', name:'강타', description:'2초마다 충전되는 다음 공격 피해 +50%', category:'heavy', maxStacks:2 },
{ id:'rapid', name:'연타', description:'공격 간격 5% 감소 · 매 5번째 명중 피해 +60%', category:'rapid', maxStacks:3 },
{ id:'dodge', name:'회피술', description:'회피 재사용 15% 감소 · 회피 후 다음 공격 강화', category:'dodge', maxStacks:3 },
{ id:'ward', name:'수호막', description:'회피 후 피해 흡수', category:'shield', maxStacks:2 },
{ id:'focus', name:'집중', description:'체력이 낮을 때 피해 +30%', category:'focus', maxStacks:3 },
{ id:'fortune', name:'잔혹한 행운', description:'보스 처치 시 체력 회복', category:'fortune', maxStacks:3 },
...Object.entries(CLASS_UNIQUES).flatMap(([classId, ids]) => ids.map(id => ({ id, classId, name: UNIQUES[id].name, description: UNIQUES[id].description, category: 'unique', rarity: 'unique', maxStacks: 1 }))),
{id:'glass-heart', name:'유리 심장', description:'피해 +30% · 최대 체력 -20%', category:'berserk', rarity:'berserk', maxStacks:1},
{id:'exposed', name:'노출', description:'피해 +35% · 받는 적 피해 +25%', category:'berserk', rarity:'berserk', maxStacks:1},
{id:'blood-price', name:'피의 대가', description:'피해 +40% · 회복량 -50%', category:'berserk', rarity:'berserk', maxStacks:1},
]);
export function findLoadout(classId: string, weaponId: string | null) {
  const cls = CLASSES.find((c) => c.id === classId);
  const weapon = cls?.weapons.find((w) => w.id === weaponId) || (weaponId == null ? cls?.weapons[0] : undefined);
  if (!cls || !weapon) throw new Error(`등록되지 않은 선택: ${classId}/${weaponId}`);
  return { cls, weapon };
}

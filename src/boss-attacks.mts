import type { Pattern } from './types.mjs';
// Action-game vocabulary: baited landings, cross-ups, returning shots and sustained sweeps.
// Original timings/layouts; no game assets or named encounter scripts are copied.
const attack=(id: string, name: string, shape: string, tactic: string, extra: Pattern={}): Pattern=>({id, name, shape, tactic, windup:1.25, active:.16, recover:1.8, damage:23, ...extra});
const leap=(id: string, name: string, extra: Pattern={})=>attack(id, name, 'circle', '착지 지점을 유도한 뒤 빠져나가세요. 착지 후 공격 기회.', {radius:112, leap:true, ...extra});
const sweep=(id: string, name: string, turn: number, extra: Pattern={})=>attack(id, name, 'lane', '시작 선을 비킨 뒤 회전 방향의 뒤쪽을 따라가세요.', {width:54, length:500, active:1.45, sweep:turn, ...extra});
const shots=(id: string, name: string, returning: boolean, extra: Pattern={})=>attack(id, name, 'projectile', returning?'나간 탄환이 되돌아옵니다. 돌아오는 길도 비우세요.':'느린 구슬이 가속합니다. 가까워지기 전에 옆으로 이동하세요.',
{projectileSpeed:returning?220:100, projectileRadius:10, projectileLife:3.8, volley:3, spread:.7, shotReturn:returning?1.1:0, shotAcceleration:returning?0:150, ...extra});
const flank=(id: string, name: string, extra: Pattern={})=>attack(id, name, 'lane', '보스가 옆으로 이동한 뒤 공격합니다. 새 사선을 확인하세요.', {width:66, length:460, reposition:'flank', ...extra});
export const BOSS_ATTACKS=Object.freeze([
leap('iron-vault', '도약 철퇴', {radius:105, windup:1.55, recover:1.35}),
leap('ravager-pounce', '먹잇감 덮치기', {radius:98, windup:1.35, sequence:2, retarget:true}),
shots('ember-comets', '가속하는 불씨', false, {projectileSpeed:160, shotAcceleration:220, volley:5, spread:1.35, shotDelay:.14,
  tactic:'빠르게 날아오는 화염탄이 더 가속합니다. 예고 방향의 옆으로 이동하세요.'}),
sweep('frost-breath', '회전하는 냉기 숨결', .8, {length:370, width:70}),
shots('storm-needles', '전하 방출', false, {volley:7, radial:true, shotAcceleration:210}),
sweep('bastion-laser', '포신 회전 사격', -.7, {length:800, width:48, windup:1.7}),
shots('blade-return', '되돌아오는 쌍날', true, {volley:2, spread:.38, projectileRadius:13}),
shots('abyss-drift', '심연의 유영', false, {volley:3, spread:1.2, shotDelay:.3}),
flank('execution-flank', '측면 집행', {length:650, width:88, windup:1.5}),
flank('rift-crossup', '균열 건너편', {shape:'circle', radius:126, anchor:'boss', windup:1.5}),
flank('duelist-crossstep', '거울 옆걸음', {sequence:2, retarget:true, width:48}),
attack('mire-seeds', '늪의 씨앗', 'circle', '두 번 유도한 늪은 계속 위험합니다. 전장 가장자리부터 사용하세요.', {radius:80, active:3, persistent:true, sequence:2, retarget:true}),
shots('solar-return', '태양의 회귀', true, {volley:6, radial:true, projectileRadius:12}),
sweep('clock-hand', '초침의 궤적', 1.2, {length:570, width:44, active:1.8}),
shots('void-reflux', '돌아오는 역류', true, {volley:5, spread:1.9, shotDelay:.12}),
leap('comet-descent', '혜성 연속 낙하', {sequence:2, retarget:true, radius:104, windup:1.4}),
shots('oracle-delayed', '늦게 도착하는 예언', false, {volley:4, spread:1.1, shotDelay:.28, shotAcceleration:175}),
leap('colossus-landing', '거신의 착지', {radius:145, windup:1.65, aftershock:{radius:190, windup:.85, active:.16, damage:26}}),
flank('matriarch-crossup', '장막의 측면', {shape:'sector', radius:265, halfAngle:.8, windup:1.45}),
{...leap('emperor-judgement', '황제의 진격'), steps:[leap('emperor-land', '왕의 착지', {windup:1.6}), sweep('emperor-sweep', '옥좌 절단', -.85), shots('emperor-return', '회귀하는 왕관', true, {volley:5, spread:1.7})]},
]);

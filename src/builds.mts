import type { ClassId, UniqueDefinition, FusionDefinition, BuildDefinition, Weapon, WeaponProfile, RunState } from './types.mjs';
// Profiles are selected as a whole: a fusion never depends on pickup order.
export const CLASS_UNIQUES: Readonly<Record<ClassId, string[]>> = Object.freeze({
  warrior:['throw-master', 'one-cut', 'twin-strike', 'iron-counter', 'gale-blade'],
  archer:['multishot', 'assassin', 'longbow', 'tempest-bow', 'acrobat'],
  mage:['battle-mage', 'archmage', 'beam-mage', 'illusionist', 'meteor-mage'],
  gunslinger:['shotgun', 'cannon', 'machinegun', 'dual-pistols', 'flamethrower'],
  fighter:['outboxer', 'final-attack', 'elastic-fist', 'charged-fist', 'afterimage'],
});
const unique=(name: string, description: string, profile: WeaponProfile): UniqueDefinition=>Object.freeze({name, description, profile:Object.freeze(profile)});
export const UNIQUES: Readonly<Record<string, UniqueDefinition>>=Object.freeze({
  'throw-master':unique('투척의 대가', '사거리 300의 왕복 투척. 왕복 각각 위력 55%, 공격 간격 +25%.', {id:'boomerang', kind:'projectile', reach:300, speed:520, radius:9, damageFactor:.55, intervalFactor:1.25, returning:true}),
  'one-cut':unique('일도양단', '공격을 새로 눌러 참격. 초록 박자에 피해 +45%, 그 밖에는 -20%. 간격 +15%.', {timing:true, intervalFactor:1.15}),
  'twin-strike':unique('콤보어택', '새 입력 2회로 연격. 두 번째는 넓은 베기. 개별 위력 -15%, 간격 -20%.', {manualCombo:2, damageFactor:.85, intervalFactor:.8, comboArc:true}),
  'iron-counter':unique('철벽반격', 'Q: 0.28초 정면 방어, 성공 즉시 반격(지속 장판 제외). 재사용 3.2초. 회피 거리 -20%·대기 +45%, 기본 위력 -15%.', {parry:true, damageFactor:.85, counter:.85}),
  'gale-blade':unique('질풍검', '공격마다 조준 방향으로 42 전진 베기. 위력 +20%, 간격 +35%.', {lunge:42, damageFactor:1.2, intervalFactor:1.35}),
  multishot:unique('멀티샷', '한 번에 화살 3발. 각 화살 위력 40%. 추가 화살은 각인을 중복 발동하지 않음.', {shots:3, spread:.13, damageFactor:.4}),
  assassin:unique('어쌔신', '근접 단검으로 변경. 후방 +65%, 정면 -20%. 짧은 회피 두 번 연계.', {id:'dagger', kind:'melee', damage:32, interval:.32, reach:78, arc:2.3, chargeTime:0, backstab:true, assassinDodge:true}),
  longbow:unique('신궁', '사거리 +35%. 사거리 60% 밖에서 피해 +45%, 가까우면 -30%. 충전 +15%.', {reachFactor:1.35, chargeFactor:1.15, distance:true}),
  'tempest-bow':unique('폭풍궁', '충전 없는 속사. 위력 25%, 간격 0.22초, 사거리 -25%.', {chargeTime:0, damageFactor:.25, interval:.22, reachFactor:.75}),
  acrobat:unique('곡예사수', '구르기 시작에 화살 발사. 구르며 충전·사격 가능. 일반 위력 -20%.', {damageFactor:.8, dodgeShot:.65, dodgeAttack:true}),
  'battle-mage':unique('배틀메이지', '근접 지팡이 3연격. 타격마다 새 입력, 마지막은 충격파. 속성탄을 잃음.', {id:'battle-staff', kind:'melee', damage:26, interval:.34, reach:95, arc:2.4, chargeTime:0, manualCombo:3, comboWave:.75}),
  archmage:unique('대마법사', '불: 화상 / 물: 수압 폭발 225% / 번개: 25% 확률 2.5배 치명타. 기본 위력 -20%.', {damageFactor:.8, elemental:true}),
  'beam-mage':unique('광선술사', '사거리 420의 광선, 0.15초마다 11 피해. 공격 중 이동 속도 70%.', {id:'beam', kind:'beam', damage:11, interval:.15, reach:420, width:18, castMove:.7}),
  illusionist:unique('환영술사', '0.3초 뒤 50% 잔상 공격. 순간이동 출발점에도 잔상. 본체 위력 -25%.', {damageFactor:.75, echo:.5, dodgeEcho:.5}),
  'meteor-mage':unique('유성술사', '사거리 460 안에 0.5초 뒤 낙성. 피해 126, 반경 70, 간격 1.5초.', {id:'meteor', kind:'meteor', damage:126, interval:1.5, reach:460, radius:70, windup:.5}),
  shotgun:unique('샷건', '산탄 5발 × 14 피해. 사거리 210, 탄창 4, 재장전 1.5초.', {id:'shotgun', kind:'projectile', damage:14, interval:.65, reach:210, speed:620, radius:5, shots:5, spread:.11, magazine:4, reloadTime:1.5, recoilTime:.12, shotMove:.55}),
  cannon:unique('대포', '78 피해 포탄과 35% 폭발. 간격 1.1초, 탄창 2, 재장전 1.8초.', {id:'cannon', kind:'projectile', damage:78, interval:1.1, reach:460, speed:460, radius:12, explosion:.35, magazine:2, reloadTime:1.8, recoilTime:.2, shotMove:.45}),
  machinegun:unique('기관총', '0.09초마다 12 피해. 탄창 24, 연속 사격 과열 시 1.2초 냉각.', {id:'machinegun', kind:'projectile', damage:12, interval:.09, reach:320, speed:900, radius:4, magazine:24, reloadTime:1.2, recoilTime:.04, shotMove:.65, heat:true}),
  'dual-pistols':unique('쌍권총', '양손 교대 이동 사격. 0.16초마다 17 피해, 사거리 250, 탄창 12.', {id:'dual-pistols', kind:'projectile', damage:17, interval:.16, reach:250, speed:1000, radius:4, magazine:12, reloadTime:1.2, recoilTime:0, shotMove:1, alternate:true}),
  flamethrower:unique('화염방사기', '사거리 170의 화염과 화상. 0.12초마다 12 피해, 연료 24, 충전 2초.', {id:'flamethrower', kind:'projectile', damage:12, interval:.12, reach:170, speed:360, radius:15, magazine:24, reloadTime:2, recoilTime:0, shotMove:.8, burn:true}),
  outboxer:unique('아웃복서', 'Q: 0.22초 정면 슬립, 성공 즉시 직선 반격(지속 장판 제외). 재사용 2.8초. 회피 거리 -20%·대기 +45%·연속 회피 불가, 기본 위력 -10%.', {damageFactor:.9, perfectEvade:true, counter:.7}),
  'final-attack':unique('파이널어택', '주 공격 3회 명중마다 90% 마무리 충격파. 기본 위력 -15%, 간격 +10%.', {damageFactor:.85, intervalFactor:1.1, finisher:.9}),
  'elastic-fist':unique('탄성권', '사거리 +65%, 공격 간격 +25%. 늘어나는 팔과 긴 타격 궤적.', {reachFactor:1.65, intervalFactor:1.25, elastic:true}),
  'charged-fist':unique('축기권', '0.6초 모아 강타. 일찍 놓으면 위력 감소, 충전 중 이동 88%.', {chargeTime:.6, damageFactor:3, intervalFactor:.8, charged:true}),
  afterimage:unique('잔영보법', '공격 뒤 55% 잔상. 돌진 출발점에도 잔상. 본체 위력 -25%.', {damageFactor:.75, echo:.55, dodgeEcho:.7}),
});
export const UNIQUE_NAMES=Object.freeze(Object.fromEntries(Object.entries(UNIQUES).map(([id, d])=>[id, d.name])));
const recipe=(a: string, b: string, name: string, description: string, base: string, patch: WeaponProfile): FusionDefinition=>Object.freeze({ids:Object.freeze([a, b].sort()), key:[a, b].sort().join('+'), name, description, profile:Object.freeze({...UNIQUES[base].profile, ...patch})});
export const FUSIONS: readonly FusionDefinition[]=Object.freeze([
recipe('throw-master', 'one-cut', '박자 회수검', '박자에 맞춘 왕복검. 빗박자는 약화, 긴 공격 간격.', 'throw-master', {timing:true, intervalFactor:1.4}),
recipe('throw-master', 'twin-strike', '쌍검 회수', '새 입력 두 번으로 왕복검 교대 투척. 개별 위력 45%.', 'throw-master', {manualCombo:2, damageFactor:.45, intervalFactor:.9, alternate:true}),
recipe('throw-master', 'iron-counter', '반격 원반', 'Q 정면 방어 성공 시 즉시 반격 파동. 왕복 회수검 위력 45%. 회피 거리 -20%·대기 +45%.', 'throw-master', {parry:true, counter:.9, damageFactor:.45}),
recipe('throw-master', 'gale-blade', '질풍 투척', '35 전진하며 왕복검 투척. 공격 간격 +35%.', 'throw-master', {lunge:35, intervalFactor:1.35}),
recipe('one-cut', 'twin-strike', '쌍박 참격', '박자 2연격의 마지막은 넓은 베기. 개별 위력 감소.', 'twin-strike', {timing:true, damageFactor:.74}),
recipe('one-cut', 'iron-counter', '일섬 반격', 'Q 정면 방어 성공 시 즉시 반격. 별도로 박자 참격. 회피 거리 -20%·대기 +45%, 평소 타격 약화.', 'one-cut', {parry:true, counter:.8, damageFactor:.8}),
recipe('one-cut', 'gale-blade', '질풍 일섬', '박자에 맞춰 48 전진 참격. 빗박자 약화, 긴 간격.', 'one-cut', {lunge:48, intervalFactor:1.45, damageFactor:1.1}),
recipe('twin-strike', 'iron-counter', '반격 연무', 'Q로 즉시 반격, 좌클릭은 새 입력 2연격. 회피 거리 -20%·대기 +45%, 평소 타격 약화.', 'twin-strike', {parry:true, counter:1, damageFactor:.75}),
recipe('twin-strike', 'gale-blade', '쌍풍검', '두 번 새로 눌러 전진 베기, 마지막은 넓게. 위력 감소.', 'twin-strike', {lunge:30, damageFactor:.85, intervalFactor:.95}),
recipe('iron-counter', 'gale-blade', '철벽 돌파', 'Q 정면 방어 성공 시 즉시 반격. 전진 참격 간격 +35%. 회피 거리 -20%·대기 +45%.', 'iron-counter', {lunge:42, intervalFactor:1.35, counter:1.1, damageFactor:1}),
recipe('multishot', 'assassin', '부채 단검', '단검 3개 투척. 후방에 강하지만 사거리 220.', 'assassin', {kind:'projectile', damage:14, interval:.5, reach:220, speed:650, radius:5, shots:3, spread:.15}),
recipe('multishot', 'longbow', '삼연 저격', '좁게 모이는 긴 사거리 화살 3발. 원거리 강화, 근거리 약화, 긴 충전.', 'multishot', {distance:true, reachFactor:1.35, chargeFactor:1.15, damageFactor:.36, spread:.04}),
recipe('multishot', 'tempest-bow', '폭풍 삼연사', '0.08초 간격 3연사. 낮은 개별 위력과 짧은 사거리.', 'tempest-bow', {burst:3, burstDelay:.08, interval:.55, damageFactor:.2}),
recipe('multishot', 'acrobat', '곡예 산개', '구르기 시작 부채 화살과 구르며 3발 충전. 개별 위력 감소.', 'multishot', {dodgeShot:.65, dodgeAttack:true, damageFactor:.33}),
recipe('assassin', 'longbow', '그림자 저격', '회수 단검 장거리 투척. 후방·끝거리 강화, 근거리·단발 위력 감소.', 'assassin', {kind:'projectile', damage:23, interval:.75, reach:420, speed:750, radius:5, returning:true, distance:true}),
recipe('assassin', 'tempest-bow', '폭풍 단검', '새 입력 3회로 단검 연격, 마지막 충격파. 개별 위력 감소.', 'assassin', {manualCombo:3, damage:20, interval:.21, comboWave:.5}),
recipe('assassin', 'acrobat', '곡예 암살', '구르기 출발점 단검 잔상과 이동 중 근접 공격. 정면 약화.', 'assassin', {damage:27, dodgeAttack:true, dodgeEcho:.8, echo:.25}),
recipe('longbow', 'tempest-bow', '연발 신궁', '충전 없는 2연사. 긴 거리 강화, 가까우면 약화.', 'tempest-bow', {burst:2, burstDelay:.12, interval:.58, damageFactor:.3, reachFactor:1.25, distance:true}),
recipe('longbow', 'acrobat', '도약 저격', '구르며 장거리 충전 사격과 출발 화살. 근거리 피해 감소.', 'longbow', {dodgeShot:.6, dodgeAttack:true, damageFactor:.85}),
recipe('tempest-bow', 'acrobat', '질주 사수', '구르는 동안 속사와 출발 화살. 낮은 단발 위력.', 'tempest-bow', {dodgeShot:.7, dodgeAttack:true, alternate:true, damageFactor:.23}),
recipe('battle-mage', 'archmage', '원소 격투', '속성 지팡이 3연격과 충격파. 중첩은 공격당 한 번.', 'battle-mage', {elemental:true, damage:23, comboWave:.9}),
recipe('battle-mage', 'beam-mage', '광선 봉술', '근접 3연격 마지막 전방 광선. 근접 연계가 필요.', 'battle-mage', {damage:22, comboWave:0, comboBeam:1.4}),
recipe('battle-mage', 'illusionist', '환영 연무', '지팡이 3연격을 따라 하는 잔상. 본체 위력 감소.', 'battle-mage', {damage:19, echo:.5, dodgeEcho:.5}),
recipe('battle-mage', 'meteor-mage', '낙성 봉술', '3연격 마지막 조준 낙성. 근접 연계를 끝내야 발동.', 'battle-mage', {damage:21, comboWave:0, comboMeteor:2}),
recipe('archmage', 'beam-mage', '원소 광선', '선택 속성 광선. 물은 3회 명중 폭발. 공격 중 이동 감소.', 'beam-mage', {elemental:true, damage:9}),
recipe('archmage', 'illusionist', '원소 분신', '원소탄과 잔상. 중첩은 본체만, 본체 위력 감소.', 'archmage', {damageFactor:.65, echo:.5, dodgeEcho:.5}),
recipe('archmage', 'meteor-mage', '원소 낙성', '속성 낙성. 물은 3회 명중 폭발. 긴 시전 간격.', 'meteor-mage', {elemental:true, damage:90}),
recipe('beam-mage', 'illusionist', '쌍영 광선', '본체 광선을 0.3초 뒤 고정 조준 잔상이 반복. 본체 약화.', 'beam-mage', {damage:8, echo:.55, dodgeEcho:.6}),
recipe('beam-mage', 'meteor-mage', '천공 광선', '광선 6회 명중마다 작은 낙성. 광선 위력과 이동 감소.', 'beam-mage', {damage:9, finisher:3, finisherEvery:6, finisherKind:'meteor'}),
recipe('illusionist', 'meteor-mage', '쌍영 낙성', '같은 지점에 시간차 낙성 2회. 본체 낙성 위력 감소.', 'meteor-mage', {damage:78, echo:.6, dodgeEcho:.45}),
recipe('shotgun', 'cannon', '산탄 포탄', '큰 포탄이 터지며 산탄 5발을 펼침. 탄창 2, 긴 재장전.', 'cannon', {id:'fragment-shell', damage:58, explosion:0, fragments:5, fragmentFactor:.17}),
recipe('shotgun', 'machinegun', '회전 산탄포', '근거리 산탄 3발 연사. 빠른 과열과 재장전.', 'machinegun', {damage:8, interval:.16, reach:190, shots:3, spread:.12, magazine:18}),
recipe('shotgun', 'dual-pistols', '쌍열 산탄', '양손 교대 산탄 3발 × 13 피해. 이동 가능, 사거리 190.', 'dual-pistols', {damage:13, interval:.38, reach:190, shots:3, spread:.14, magazine:8}),
recipe('shotgun', 'flamethrower', '화염 산탄', '화염 3갈래와 화상. 사거리 155, 느린 연료 충전.', 'flamethrower', {damage:8, interval:.22, reach:155, shots:3, spread:.18, magazine:18}),
recipe('cannon', 'machinegun', '연발 포대', '작은 폭발탄 3연사 후 회복. 낮은 단발 위력과 과열.', 'cannon', {damage:27, interval:1.1, burst:3, burstDelay:.15, magazine:3, heat:true, explosion:.2}),
recipe('cannon', 'dual-pistols', '쌍포 사격', '양손 시간차 포탄 2발. 이동 사격, 단발 위력·사거리 감소.', 'cannon', {damage:36, interval:1.05, burst:2, burstDelay:.16, alternate:true, shotMove:.9, reach:340, magazine:4}),
recipe('cannon', 'flamethrower', '소이 포탄', '폭발하고 2초 화염 지대를 남기는 포탄. 긴 공격 간격.', 'cannon', {damage:64, burn:true, burnZone:true, interval:1.35}),
recipe('machinegun', 'dual-pistols', '쌍열 기관권총', '양손 이동 연사. 사거리 250, 낮은 탄당 피해와 과열.', 'machinegun', {damage:11, interval:.085, alternate:true, shotMove:1, reach:250, magazine:24}),
recipe('machinegun', 'flamethrower', '열화 기관포', '화상 탄환 연사. 사거리 230, 더 빠른 과열.', 'machinegun', {damage:10, reach:230, burn:true, heatGain:.05, magazine:20}),
recipe('dual-pistols', 'flamethrower', '쌍화 분사', '양손 교대 쌍갈래 화염. 이동 가능, 사거리 155.', 'flamethrower', {damage:6, shots:2, spread:.1, alternate:true, shotMove:1, reach:155}),
recipe('outboxer', 'final-attack', '카운터 피니시', 'Q 슬립 성공 시 즉시 반격, 주 공격 3회마다 마무리. 회피 거리 -20%·대기 +45%·연속 회피 불가.', 'final-attack', {perfectEvade:true, counter:.8, damageFactor:.75}),
recipe('outboxer', 'elastic-fist', '롱 카운터', 'Q 슬립 성공 시 긴 직선 반격. 긴 팔의 느린 공격. 회피 거리 -20%·대기 +45%·연속 회피 불가.', 'elastic-fist', {perfectEvade:true, counter:1, damageFactor:.9}),
recipe('outboxer', 'charged-fist', '축기 반격', 'Q 슬립 성공 시 즉시 반격. Q·회피 시 충전 취소. 회피 거리 -20%·대기 +45%·연속 회피 불가.', 'charged-fist', {perfectEvade:true, counter:.65, damageFactor:2.6}),
recipe('outboxer', 'afterimage', '잔영 카운터', 'Q 슬립 성공 시 즉시 반격, 회피 지점 잔상. 회피 거리 -20%·대기 +45%·연속 회피 불가.', 'afterimage', {perfectEvade:true, counter:.7, damageFactor:.7, dodgeEcho:.85}),
recipe('final-attack', 'elastic-fist', '탄성 피니시', '긴 팔 3회 명중 뒤 긴 충격파. 타격 간격 증가.', 'elastic-fist', {finisher:1, damageFactor:.85, intervalFactor:1.3}),
recipe('final-attack', 'charged-fist', '축기 종결', '충전 강타 3회 명중 뒤 큰 충격파. 긴 준비가 필요.', 'charged-fist', {damageFactor:2.6, finisher:1.1}),
recipe('final-attack', 'afterimage', '환영 종결', '본체 3회 명중 마무리와 잔상. 잔상은 횟수 미포함.', 'afterimage', {damageFactor:.65, finisher:.9}),
recipe('elastic-fist', 'charged-fist', '탄성 축기포', '완충한 긴 직선 권격. 좁은 조준과 긴 충전.', 'charged-fist', {kind:'beam', id:'punch', reach:260, width:28, elastic:true, damageFactor:2.6}),
recipe('elastic-fist', 'afterimage', '잔영 장권', '긴 타격을 잔상이 반복. 본체 위력 감소, 긴 간격.', 'elastic-fist', {damageFactor:.7, echo:.6, dodgeEcho:.7}),
recipe('charged-fist', 'afterimage', '쌍영 축기', '완충 강타를 잔상이 반복. 본체 강타 위력 감소.', 'charged-fist', {damageFactor:2.2, echo:.6, dodgeEcho:.65}),
]);
const fusionMap=new Map(FUSIONS.map(f=>[f.key, f]));
export function deriveBuild(state: RunState): BuildDefinition {
  const ids=(CLASS_UNIQUES[state.cls.id]||[]).filter(id=>state.cards?.[id]>0).sort().slice(0, 2);
  const fusion=ids.length===2?fusionMap.get(ids.join('+')):null, entry=fusion||UNIQUES[ids[0]];
  return {ids, pairs:fusion?[fusion.key]:[], fusion, name:entry?.name||'기본 전투', description:entry?.description||'', profile:entry?.profile||{}};
}
export function buildWeapon(base: Weapon, build: BuildDefinition): Weapon {
  const p=build.profile, w={...base, ...p, name:build.ids.length?build.name:base.name};
  const colors: Record<string, string>={dagger:'#d5d5e8', 'battle-staff':'#bca0ef', beam:'#c99bff', meteor:'#ff8561', shotgun:'#ffd28b', cannon:'#ffae75', 'fragment-shell':'#ffae75', machinegun:'#ffe08a', 'dual-pistols':'#f3d080', flamethrower:'#ff7048'};
  w.color=w.elemental?base.color:w.burn?'#ff8858':colors[w.id]||base.color;
  for(const key of ['damage', 'interval', 'reach'] as const)w[key]=(p[key]??base[key])*((p[`${key}Factor` as keyof WeaponProfile] as number)??1);
  w.chargeTime=(p.chargeTime??base.chargeTime??0)*(p.chargeFactor??1);
  // A fixed charge/cadence must not multiply the slow base weapon's damage for free.
  if(p.charged)w.damage=(base.damage/base.interval)*(w.chargeTime+w.interval)*(p.damageFactor??3)/3;
  if(base.chargeTime&&p.chargeTime===0&&p.damage===undefined)w.damage=base.damage/(base.interval+base.chargeTime)*.87*(p.damageFactor??1);
  if(w.kind!=='projectile'){
    w.magazine=0;
    w.reloadTime=0;
  }
  return w;
}
export function hasUnique(state: RunState, id: string){
  return CLASS_UNIQUES[state.cls.id]?.includes(id)&&state.cards?.[id]>0;
}
export function fusionHas(state: RunState, a: string, b: string){
  return hasUnique(state, a)&&hasUnique(state, b);
}

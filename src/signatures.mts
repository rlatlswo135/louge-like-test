import type { RunState, RaidDefinition, Hazard, ChargePath, Point } from './types.mjs';
// Boss-specific mechanics use the same locked geometry as damage and rendering.
// Each round is rebuilt only after the previous cast ends, so baiting is meaningful.
const W=1280, H=720;
const clamp=(v: number, a: number, b: number)=>Math.max(a, Math.min(b, v));
const signature=(id: string, name: string, kind: string, rounds: number, hint: string): RaidDefinition=>Object.freeze({id, name, kind, rounds, hint, signature:true});
export const SIGNATURES=Object.freeze([
signature('warden-judgment', '철문 집행', 'hammer', 3, '정면 → 뒤편 → 직선. 휘두른 쪽으로 다시 파고드세요.'),
signature('ravager-hunt', '멈추지 않는 추격', 'stampede', 3, '세 번 돌진을 옆으로 흘리세요. 지나간 궤적은 안전합니다.'),
signature('ember-curtain', '움직이는 불의 장벽', 'curtain', 2, '벽에서 날아오는 탄막의 넓은 틈으로 통과하세요.'),
signature('frost-refuge', '빙하 속 피난처', 'shelter', 3, '금빛 원 안으로 들어가세요. 매번 다음 피난처가 열립니다.'),
signature('storm-lattice', '번개 체스판', 'lattice', 3, '격자 사이로 한 칸씩 이동하세요. 다음 번에는 안전 칸이 뒤집힙니다.'),
signature('bastion-siege', '포격 유도', 'siege', 4, '포격 표식을 외곽에 버리며 이동. 마지막 공성포는 옆으로 피하세요.'),
signature('blades-mirrors', '두 개의 칼끝', 'mirrors', 3, '본체와 반대편 잔상이 시간차로 벱니다. 두 번째 선까지 확인하세요.'),
signature('shaman-miasma', '심연의 늪', 'miasma', 3, '발밑의 늪을 한곳에 유도한 뒤 이동하세요. 늪은 계속 남습니다.'),
signature('executioner-gaze', '집행자의 시선', 'gaze', 2, '눈이 닫힐 때 마우스를 보스 반대쪽으로 돌리세요. 다음은 뒤편 베기.'),
signature('lord-portals', '차원의 사격문', 'portals', 3, '양쪽 문에서 번갈아 오는 탄을 통과하고 중앙 폭발을 피하세요.'),
signature('duelist-riposte', '거울 반격', 'riposte', 2, '은빛 자세에서는 정면 공격을 멈추거나 뒤를 잡으세요. 공격하면 반격합니다.'),
signature('queen-tether', '수렁의 흡인', 'tether', 3, '중심으로 끌려갑니다. 걸어서 바깥으로 버티고 밀물 때 안으로 돌아오세요.'),
signature('sun-eclipse', '태양 뒤의 그림자', 'eclipse', 2, '그림자 원으로 숨은 뒤, 그림자가 폭발하기 전에 빠져나오세요.'),
signature('regent-pendulum', '엇박자 진자', 'pendulum', 4, '사선이 번갈아 닫힙니다. 첫 칼날이 지나간 자리로 이동하세요.'),
signature('leviathan-undertow', '역류하는 해연', 'undertow', 3, '좌우의 탄막 다음 위에서 파도가 옵니다. 틈의 축을 바꾸세요.'),
signature('comet-impact', '추락하는 별', 'meteor', 3, '큰 표식을 옆으로 버리세요. 마지막 별이 지난 뒤 반격 시간이 깁니다.'),
signature('oracle-memory', '세 번의 예언', 'memory', 4, '처음 보이는 Ⅰ·Ⅱ·Ⅲ 위치를 기억하고 순서대로 들어가세요.'),
signature('colossus-counter', '천둥을 끊어라', 'counter', 2, '푸른 표식이 빛날 때 보스 쪽으로 회피하면 강타를 끊습니다. 옆으로 피할 수도 있습니다.'),
signature('matriarch-night', '밤의 사냥', 'night', 3, '늪을 버리고 시선을 돌린 뒤, 뒤따르는 그림자 칼날을 피하세요.'),
signature('emperor-trial', '황제의 네 가지 명령', 'trial', 4, '격자 → 탄막 → 시선 → 피난처. 매 명령마다 다른 행동이 필요합니다.'),
]);
export function signatureRound(state: RunState) {
  const b=state.boss, p=state.player, r=b.raid, i=r.round;
  const angle=Math.atan2(p.y-b.y, p.x-b.x);
  const hazards: Hazard[] = [], paths: ChargePath[] = [];
  let windup=1.5, active=.25, hint=r.hint, kind=r.kind;
  r.counterWindow=false;
  r.pull=0;
  if(kind==='trial')kind=['lattice', 'curtain', 'gaze', 'shelter'][i];
  if(kind==='night')kind=['miasma', 'gaze', 'mirrors'][i];
  const circle=(x: number, y: number, radius: number, extra: Hazard={})=>hazards.push({shape:'circle', x, y, radius, ...extra});
  const lane=(x: number, y: number, angle: number, length: number, width: number, extra: Hazard={})=>hazards.push({shape:'lane', x, y, angle, length, width, ...extra});
  const safePoint=(distance=190)=>{
    const a=Math.atan2(p.y-360, p.x-640)+(i%2?.45:-.45);
    const px=clamp(p.x+Math.cos(a+Math.PI)*distance, 130, 1150), py=clamp(p.y+Math.sin(a+Math.PI)*distance, 130, 590);
    return {x:px, y:py, radius:108};
  };
  const refuge=(point: Point & {radius: number})=>hazards.push({shape:'field', x:0, y:0, width:W, height:H, safe:[point]});
  const wall=(axis=0, reverse=false)=>{
    const extent=axis?W:H, source=reverse?(axis?H-24:W-24):24;
    const pos=axis?p.x:p.y, gap=clamp(pos+(pos<extent/2?100:-100), 125, extent-125);
    const dir=axis?(reverse?-Math.PI/2:Math.PI/2):(reverse?Math.PI:0);
    const speed=state.stage===2?440:260+state.stage*3;
    for(let v=36;v<extent;v+=48){
      if(Math.abs(v-gap)<100)continue;
      lane(axis?v:source, axis?source:v, dir, axis?H-48:W-48, 12,
      {projectile:true, active:.12, shotAngle:dir, shotSpeed:speed, shotRadius:9, shotLife:(axis?H:W)/speed, damage:24});
    }
    hint=axis?'위 → 아래 · 탄막의 빈 통로로 이동':'좌우에서 오는 탄막 · 넓은 틈으로 통과';
    active=(axis?H:W)/speed+.1;
  };
  if(kind==='hammer'){
    windup=i===2?1.15:1.05;
    if(i<2)hazards.push({shape:'sector', x:b.x, y:b.y, radius:285, angle:angle+(i?Math.PI:0), halfAngle:1.7});
    else lane(b.x, b.y, angle, 1000, 145);
    hint=['정면 강타 · 뒤로 돌아가세요', '뒤편 반전 · 방금 공격한 정면으로', '내려찍기 · 직선에서 벗어나세요'][i];
  }else if(kind==='stampede'){
    windup=1.05;
    active=.48;
    const tx=clamp(p.x+Math.cos(angle)*70, 60, W-60), ty=clamp(p.y+Math.sin(angle)*70, 60, H-60);
    const length=Math.hypot(tx-b.x, ty-b.y), a=Math.atan2(ty-b.y, tx-b.x);
    lane(b.x, b.y, a, length, 100, {active:.48, charge:true});
    paths.push({x:b.x, y:b.y, angle:a, length, start:0, duration:.48});
    hint=`추격 ${i+1}/3 · 돌진선 옆으로`;
  }else if(kind==='curtain'||kind==='undertow'||kind==='portals'){
    windup=1.3;
    wall(kind==='undertow'?Number(i===2):i%2, kind==='portals'?i%2===1:i===1);
    if(kind==='portals'&&i===2){
      circle(640, 360, 180);
      hint='마지막 사격문 · 중앙 폭발도 피하세요';
    }
  }else if(kind==='shelter'){
    windup=2.2;
    refuge(safePoint());
    hint='금빛 피난처 안으로 이동';
  }else if(kind==='lattice'){
    windup=1.7;
    for(let y=0;y<3;y++)for(let x=0;x<4;x++)if((x+y+i)%2===0)lane(x*320, y*240+120, 0, 320, 240);
    hint='번개 격자 · 옆의 빈 칸으로';
  }else if(kind==='siege'||kind==='meteor'||kind==='miasma'){
    windup=kind==='meteor'?1.15:1.4;
    if(kind==='siege'&&i===3){
      lane(b.x, b.y, angle, 1450, 150);
      windup=1.8;
      hint='최종 공성포 · 옆으로 크게 이동';
    }
    else{
      circle(p.x, p.y, kind==='meteor'?128:92, {active:kind==='miasma'?6:kind==='siege'?3:.4, persistent:kind!=='meteor'});
      if(kind==='miasma')circle(clamp(p.x+(p.x<640?190:-190), 40, W-40), clamp(p.y-130, 40, H-40), 65, {active:5, persistent:true});
      hint=kind==='meteor'?`별 ${i+1}/3 · 표식 밖으로`:kind==='siege'?'포격 표식을 버리고 이동':'늪이 남습니다 · 가장자리에 유도';
    }
  }else if(kind==='mirrors'||kind==='pendulum'){
    windup=kind==='pendulum'?1.2:1.6;
    const mx=W-b.x, my=H-b.y;
    if(kind==='mirrors'){
      lane(b.x, b.y, angle, 1050, 100, {ghost:true});
      lane(mx, my, Math.atan2(p.y-my, p.x-mx), 1050, 100, {ghost:true, delay:.5});
      active=.75;
    }else{
      lane(i%2?W:0, 0, i%2?Math.PI-.48:.48, 1470, 120);
      lane(i%2?0:W, H, i%2?-.48:Math.PI+.48, 1470, 120, {delay:.3});
      active=.55;
    }
    hint=kind==='mirrors'?'맞은편 잔상 · 두 번째 선까지 확인':'엇박자 진자 · 첫 선이 지나간 자리로';
  }else if(kind==='gaze'){
    windup=1.8;
    if(r.kind==='gaze'&&i===1){
      hazards.push({shape:'sector', x:b.x, y:b.y, radius:340, angle:angle+Math.PI, halfAngle:2});
      hint='시선 뒤의 베기 · 정면으로 돌아오세요';
    }
    else{
      circle(b.x, b.y, 1500, {gaze:true});
      hint='시선 판정 · 마우스를 보스 반대쪽으로';
    }
  }else if(kind==='riposte'){
    if(i===0){
      windup=2;
      r.counterWindow=true;
      hint='은빛 반격 자세 · 정면 공격 중지 / 뒤를 잡기';
    }
    else {
      lane(b.x, b.y, angle, 1200, 130);
      windup=1.2;
      hint='반격 자세 해제 · 마지막 찌르기';
    }
  }else if(kind==='tether'){
    windup=i%2===0?1.9:2.6;
    r.pull=i%2===0?72:0;
    if(i%2===0)circle(640, 360, 205);
    else hazards.push({shape:'ring', x:640, y:360, radius:800, innerRadius:230});
    hint=i%2===0?'흡인 · 중심에서 멀어지세요':'밀물 · 중심 안으로 복귀';
  }else if(kind==='eclipse'){
    windup=2.2;
    if(i===0){
      r.shadow=safePoint(150);
      refuge(r.shadow);
      hint='태양을 피할 그림자 안으로';
    }
    else {
      circle(r.shadow.x, r.shadow.y, 165);
      windup=1.2;
      hint='그림자 붕괴 · 원 밖으로 탈출';
    }
  }else if(kind==='memory'){
    if(i===0){
      const c=safePoint(100), dir=p.x<640?1:-1;
      r.memory=[c, {x:clamp(c.x+dir*210, 130, 1150), y:clamp(c.y-110, 130, 590), radius:105}, {x:clamp(c.x+dir*90, 130, 1150), y:clamp(c.y+110, 130, 590), radius:105}];
      windup=2.1;
      hint='예언을 기억하세요 · Ⅰ → Ⅱ → Ⅲ';
    }else{
      windup=1.85;
      refuge(r.memory[i-1]);
      hint=`예언 ${['','Ⅰ','Ⅱ','Ⅲ'][i]} · 기억한 위치로`;
    }
  }else if(kind==='counter'){
    windup=i===0?2:1.3;
    if(i===0){
      lane(b.x, b.y, angle, 1450, 210, {counterable:true});
      hint='푸른 표식 점등 후 정면 회피로 끊기 / 옆으로 피하기';
    }
    else{
      hazards.push({shape:'ring', x:b.x, y:b.y, radius:460, innerRadius:170});
      hint='천둥의 여파 · 가까이 파고들기';
    }
  }
  return {hazards, paths, windup, active, hint, recover:i===r.total-1?(kind==='meteor'?2.2:1.6):0};
}

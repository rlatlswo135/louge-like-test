import { ARENA, PLAYER } from '../content.mjs';
import { cleanupEncounter } from '../encounters.mjs';
import { signatureRound } from '../signatures.mjs';
import { burst, spawnHazard } from '../systems/effects.mjs';
import { arenaRayLength, clampToArena } from '../systems/geometry.mjs';
import { getStats } from '../systems/stats.mjs';
import type { RunState, Pattern } from '../types.mjs';
/** 보스 패턴 선택·기믹·페이즈 */
export class BossSystem {
  update(state: RunState, dt: number): void {
    const b = state.boss;
    const p = state.player;
    b.hitFlash = Math.max(0, b.hitFlash - dt);
    b.timer -= dt;
    if (b.state === 'idle') {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) {
        b.faceX = dx / dist;
        b.faceY = dy / dist;
        const preferred=b.def.preferredRange||b.def.radius+PLAYER.radius+40;
        const direction=dist>preferred?1:preferred>160&&dist<preferred*.58?-1:0;
        if (direction) {
          const slow = b.slowTime > 0 ? .65 : 1;
          b.x += b.faceX * b.def.speed * slow * dt * direction;
          b.y += b.faceY * b.def.speed * slow * dt * direction;
          clampToArena(b, b.def.radius);
        }
      }
      if (b.timer <= 1e-9 && !startRaid(state, dt)) startPattern(state, dt);
    } else if (b.state === 'windup') {
      if(b.leap){
        const t=Math.max(0, Math.min(1, 1-b.timer/Math.min(.5, b.leap.windup)));
        b.x=b.leap.fromX+(b.leap.x-b.leap.fromX)*t;
        b.y=b.leap.fromY+(b.leap.y-b.leap.fromY)*t;
      }
      if (b.pattern?.raid) {
        const dx=ARENA.width/2-b.x, dy=ARENA.height/2-b.y, d=Math.hypot(dx, dy);
        if(d>1&&!b.raid?.signature){
          b.x+=dx/d*Math.min(d, 850*dt);
          b.y+=dy/d*Math.min(d, 850*dt);
        }
        const raid=b.raid;
        if(raid&&b.pattern.windup-b.timer>=raid.pressureAt&&b.timer>.82)raidPressure(state, dt);
      }
      if (b.timer <= 1e-9) {
        b.state = 'active';
        b.leap=null;
        b.timer += b.pattern.active;
      }
    } else if (b.state === 'recover' && b.timer <= 0) {
      b.state='idle';
      b.timer+=b.def.idle;
      b.pattern=null;
    }
    // Apply fractional windup overshoot on the activation frame as well.
    if (b.state === 'active') {
      const elapsed = b.pattern.active - b.timer;
      const path = b.chargePaths?.findLast((part) => part.start <= elapsed + 1e-9);
      if (path) {
        const progress = Math.max(0, Math.min(1, (elapsed - path.start) / path.duration));
        b.x = path.x + Math.cos(path.angle) * path.length * progress;
        b.y = path.y + Math.sin(path.angle) * path.length * progress;
        b.faceX = Math.cos(path.angle);
        b.faceY = Math.sin(path.angle);
      }
      if (b.timer <= 1e-9) {
        b.chargePaths = [];
        if(b.raid && b.raid.round+1<b.raid.total){
          b.raid.round++;
          beginRaidRound(state, dt);
        } else if(b.combo && b.combo.index+1<b.combo.total){
          b.combo.index++;
          beginComboStage(state, dt);
        } else {
          if(b.raid)b.nextRaidAt=state.stageTime+b.pattern.recover+(b.def.special?12:18);
          b.raid=null;
          b.combo=null;
          b.state='recover';
          b.timer+=b.pattern.recover;
        }
      }
    }
  }
  advancePhase(state: RunState): void {
    const b=state.boss;
    const phase=1+(b.def.phaseThresholds||[]).filter(threshold=>b.hp<=b.maxHp*threshold).length;
    if(state.player.hp>0&&b.hp>0&&phase>b.phase){
      const amount=phase-b.phase;
      cleanupEncounter(state);
      b.phase=phase;
      b.state='idle';
      b.timer=.7;
      b.pattern=null;
      b.chargePaths=[];
      b.combo=null;
      b.raid=null;
      b.nextRaidAt=state.stageTime+2;
      b.def={...b.def, patterns:b.def.patterns.map(pattern=>phasePattern(pattern, amount))};
      state.hazards.length=0;
      state.projectiles.length=0;
      state.attacks.length=0;
      state.events.push({type:'phase', phase});
    }
  }
}
export function patternReachesPlayer(pattern: Pattern, boss: RunState["boss"], player: RunState["player"]) {
  if (pattern.steps) return patternReachesPlayer(pattern.steps[0], boss, player);
  if(pattern.leap||pattern.reposition)return true;
  if (pattern.shape === 'circle' && pattern.anchor !== 'boss') return true;
  const centeredRing = pattern.shape === 'ring' && pattern.anchor !== 'boss';
  const x = centeredRing ? ARENA.width / 2 : boss.x, y = centeredRing ? ARENA.height / 2 : boss.y;
  let reach = pattern.radius;
  if (pattern.shape === 'ring') reach += Math.max(0, (pattern.radiusStep || 0) * ((pattern.sequence || 1) - 1));
  if (pattern.shape === 'circle' && (pattern.sequence || 1)>1) reach += pattern.layout==='orbit'
  ? pattern.orbitRadius + Math.max(0, (pattern.orbitStep||0)*((pattern.sequence||1)-1)) : Math.min(150, pattern.radius*.7);
  if (pattern.shape === 'projectile') reach = pattern.projectileSpeed * (boss.def.projectileSpeedFactor||1) * pattern.projectileLife + pattern.projectileRadius;
  if (pattern.shape === 'lane') reach = (pattern.distance ? pattern.distance * (pattern.sequence || 1) : pattern.length || Math.hypot(ARENA.width, ARENA.height)) + (pattern.width / 2 || pattern.radius);
  return Math.hypot(player.x - x, player.y - y) <= reach + PLAYER.radius;
}
export function raidPressure(state: RunState, dt: number) {
  const b=state.boss, raid=b.raid, p=state.player;
  const base={pattern:raid.id, raid:true, raidPressure:true, phase:'warn', t:-dt,
    windup:.65, active:.16, damage:24*(1+state.stage*.02), hitDone:false};
  if(raid.pressures%2===0)spawnHazard(state, {...base, shape:'circle', x:p.x, y:p.y, radius:42});
  else {
    const angle=Math.atan2(p.y-b.y, p.x-b.x);
    spawnHazard(state, {...base, shape:'lane', x:b.x, y:b.y, angle, width:64,
      length:arenaRayLength(b.x, b.y, angle, Math.hypot(p.x-b.x, p.y-b.y)+100)});
  }
  raid.pressures++;
  raid.pressureAt+=.85;
}
export function beginRaidRound(state: RunState, dt: number) {
  const b=state.boss, raid=b.raid, i=raid.round;
  if(raid.signature){
    const cast=signatureRound(state), group={hit:false};
    const base={pattern:raid.id, rootPattern:raid.id, raid:true, raidRound:i, hitGroup:group, phase:'warn', windup:cast.windup,
      active:cast.active, damage:40*(1+state.stage*.018), hitDone:false};
    for(const h of cast.hazards)spawnHazard(state, {...base, ...h, t:-(h.delay||0)-dt});
    raid.hint=cast.hint;
    raid.pressureAt=Infinity;
    b.pattern={id:raid.id, name:raid.name, raid:true, windup:cast.windup, active:cast.active, recover:cast.recover};
    b.state='windup';
    b.timer=cast.windup;
    b.chargePaths=cast.paths;
    state.events.push({type:'raid', name:raid.name, kind:raid.kind, round:i, hint:raid.hint});
    return;
  }
  const previous=raid.kind;
  if(raid.programs){
    const program=raid.programs[i%raid.programs.length];
    raid.kind=program.kind;
    raid.invert=program.invert;
    raid.axis=program.axis;
    raid.turn=program.turn;
    raid.crossFinal=program.crossFinal;
  }
  const kind=raid.kind, x=ARENA.width/2, y=ARENA.height/2, radius=Math.hypot(x, y);
  const outside=kind==='in-out' && (raid.invert ? i%2===0 : i%2===1);
  // Face the first opening toward the player: remove dead travel time, not the reaction margin.
  if(kind==='carousel'&&(i===0||previous!==kind))raid.angle=Math.atan2(state.player.y-y, state.player.x-x)-i*1.25*(raid.turn||1);
  const windup=kind==='in-out' ? (outside?1.3:2.6) : kind==='carousel' ? (i===0||previous!==kind?2.3:1.8) : (i===0?2.2:1.85);
  const base={pattern:raid.id, raid:true, hitGroup:{hit:false}, phase:'warn', t:-dt, windup, active:.3,
    damage:50*(1+state.stage*.025), hitDone:false};
  if(kind==='corridor') {
    const cross=raid.crossFinal && i===raid.total-1;
    const axes=cross?[0, 1]:[(i+(raid.axis||0))%2];
    for(const axis of axes){
      const player=axis===0?state.player.y:state.player.x, extent=axis===0?ARENA.height:ARENA.width;
      const center=Math.max(130, Math.min(extent-130, player+(player<extent/2?200:-200)));
      const cuts=[[0, center-95], [center+95, extent]];
      for(const [from, to] of cuts)spawnHazard(state, {...base, shape:'lane',
        x:axis===0?0:(from+to)/2, y:axis===0?(from+to)/2:0,
        angle:axis===0?0:Math.PI/2, length:axis===0?ARENA.width:ARENA.height, width:to-from});
    }
    raid.hint=cross?'교차점으로 이동 · 추적 표식도 피하세요':axes[0]===0?'가로 통로로 이동 · 추적 표식 회피':'세로 통로로 이동 · 추적 표식 회피';
  } else if(kind==='in-out') {
    spawnHazard(state, outside?{...base, shape:'circle', x, y, radius:225}
    :{...base, shape:'ring', x, y, radius, innerRadius:190, gapAngle:0, gapHalfAngle:0});
    raid.hint=outside?'바깥으로! 중심 폭발 · 견제 공격 주의':'안으로! 보스에게 접근하며 견제 회피';
  } else {
    const gapAngle=raid.angle+i*1.25*(raid.turn||1);
    spawnHazard(state, {...base, shape:'circle', x, y, radius:70});
    spawnHazard(state, {...base, shape:'ring', x, y, radius:320, innerRadius:70, gapAngle, gapHalfAngle:.7});
    spawnHazard(state, {...base, shape:'ring', x, y, radius, innerRadius:320, gapAngle:0, gapHalfAngle:0});
    raid.hint=`${raid.turn===-1?'반시계':'시계'} 빈틈 이동 · 안쪽에서 근접 반격 가능`;
  }
  b.pattern={id:raid.id, name:raid.name, raid:true, windup, active:base.active, recover:i===raid.total-1?.8:0};
  b.state='windup';
  b.timer=windup;
  b.chargePaths=[];
  raid.pressures=0;
  raid.pressureAt=0;
  raidPressure(state, dt);
  state.events.push({type:'raid', name:raid.name, kind, round:i, hint:raid.hint});
}
export function startRaid(state: RunState, dt: number) {
  const b=state.boss, def=b.def, hp=b.hp/b.maxHp;
  const ready=state.stageTime>=(b.nextRaidAt||0)&&(!b.raidCount||(b.normalCasts||0)>=2);
  const due=ready&&(state.stageTime>=10||(hp<=.8&&!b.raid80)||(hp<=.4&&!b.raid40));
  if(!def.raid||!due)return false;
  if(hp<=.8)b.raid80=true;
  if(hp<=.4)b.raid40=true;
  const programs=def.raids?.length?def.raids:[def.raid];
  const offset=((b.raidCount||0)+b.phase-1)%programs.length;
  const ordered=programs.map((_, i)=>programs[(offset+i)%programs.length]);
  b.raid=def.signature?{...def.signature, round:0, total:def.signature.rounds, angle:0}:
  {...ordered[0], round:0, total:def.special?3+b.phase:(ordered[0].rounds||3), programs:def.special?ordered:null, angle:0};
  b.raidCount=(b.raidCount||0)+1;
  b.normalCasts=0;
  b.combo=null;
  state.hazards.length=0;
  state.projectiles=state.projectiles.filter(q=>q.owner!=='boss');
  beginRaidRound(state, dt);
  return true;
}
export function beginPattern(state: RunState, dt: number, pattern: Pattern, stageIndex: number = 0) {
  const b = state.boss;
  const p = state.player;
  if(pattern.reposition==='flank'){
    const a=Math.atan2(b.y-p.y, b.x-p.x)+(b.normalCasts%2?1:-1)*Math.PI/2;
    burst(state, b.x, b.y, 6, b.def.color, 120);
    b.x=p.x+Math.cos(a)*210;
    b.y=p.y+Math.sin(a)*210;
    clampToArena(b, b.def.radius);
    state.events.push({type:'bossMove', kind:'blink'});
  }
  b.leap=null;
  const sequence = pattern.sequence || 1;
  const sequenceDelay = Math.max(pattern.sequenceDelay ?? .3, pattern.distance ? pattern.active + .08 : 0);
  const volleyDelay = pattern.shotDelay ?? (pattern.id === 'spiral' ? .16 : 0);
  b.pattern = { ...pattern, active: pattern.active + (sequence - 1) * sequenceDelay + ((pattern.volley || 1) - 1) * volleyDelay };
  b.state = 'windup';
  b.timer = pattern.windup;
  const angle = Math.atan2(p.y - b.y, p.x - b.x) + (pattern.angleOffset || 0);
  b.faceX = Math.cos(angle);
  b.faceY = Math.sin(angle);
  // Hazards are updated later in this same step; start both countdowns at zero.
  const base = { pattern: pattern.id, rootPattern: b.combo?.pattern.id || pattern.id, phase: 'warn', t: -dt, windup: pattern.windup,
    active: pattern.active, damage: pattern.damage * (1 + state.stage * .025), hitDone: false, persistent:!!pattern.persistent,
    sourceX:b.x, sourceY:b.y };
  b.chargePaths = [];
  let chargeX = b.x;
  let chargeY = b.y;
  for (let i = 0; i < sequence; i++) {
    const offset = i * sequenceDelay;
    const shift = pattern.id === 'cross' ? 0 : (i - (sequence - 1) / 2) * (pattern.angleStep ?? .48);
    const delayed = { ...base, t: -offset - dt, sequenceIndex: pattern.retarget ? stageIndex : i };
    if (pattern.shape === 'sector') {
      spawnHazard(state, { ...delayed, shape: 'sector', x: b.x, y: b.y, radius: pattern.radius, angle: angle + shift, halfAngle: pattern.halfAngle });
    } else if (pattern.shape === 'circle') {
      const orbit = pattern.layout === 'orbit';
      const targetAngle = orbit ? angle + i * (pattern.angleStep ?? Math.PI * 2 / sequence) : angle + Math.PI + shift;
      const distance = orbit ? pattern.orbitRadius + i * (pattern.orbitStep || 0) : i === 0 ? 0 : Math.min(150, pattern.radius * .7);
      const target = pattern.anchor === 'boss' ? b : p;
      // Lock an interception point once; never move a warning after it has appeared.
      const lead = target===p && p.moving ? getStats(state).speed * Math.min(.5, pattern.windup * .7) : 0;
      spawnHazard(state, { ...delayed, shape: 'circle', radius: pattern.radius,
        x: Math.max(0, Math.min(ARENA.width, target.x + p.lastMoveX * lead + Math.cos(targetAngle) * distance)),
        y: Math.max(0, Math.min(ARENA.height, target.y + p.lastMoveY * lead + Math.sin(targetAngle) * distance)) });
      if(pattern.leap){
        const h=state.hazards.at(-1);
        h.x=Math.max(b.def.radius, Math.min(ARENA.width-b.def.radius, h.x));
        h.y=Math.max(b.def.radius, Math.min(ARENA.height-b.def.radius, h.y));
        b.leap={fromX:b.x, fromY:b.y, x:h.x, y:h.y, windup:pattern.windup};
      }
    } else if (pattern.shape === 'ring') {
      const growth = i * (pattern.radiusStep || 0);
      spawnHazard(state, { ...delayed, shape: 'ring', x: pattern.anchor === 'boss' ? b.x : ARENA.width / 2, y: pattern.anchor === 'boss' ? b.y : ARENA.height / 2,
        radius: pattern.radius + growth, innerRadius: pattern.innerRadius + growth,
        gapAngle: angle + (pattern.gapOffset || 0) + i * (pattern.angleStep || 0), gapHalfAngle: pattern.gapHalfAngle });
    } else if (pattern.shape === 'lane') {
      const laneAngle = pattern.distance
      ? Math.atan2(p.y - chargeY, p.x - chargeX) + shift
      : angle + (pattern.id === 'cross' ? i * Math.PI / 2 : pattern.lateralStep ? 0 : shift);
      let length = pattern.length || Math.hypot(ARENA.width, ARENA.height);
      const isCharge = Boolean(pattern.distance);
      const lateral = (i-(sequence-1)/2)*(pattern.lateralStep||0);
      const x = isCharge ? chargeX : Math.max(0, Math.min(ARENA.width, b.x-Math.sin(laneAngle)*lateral));
      const y = isCharge ? chargeY : Math.max(0, Math.min(ARENA.height, b.y+Math.cos(laneAngle)*lateral));
      length = arenaRayLength(x, y, laneAngle, isCharge ? Math.min(pattern.distance, Math.hypot(p.x-x, p.y-y)+45) : length, isCharge ? b.def.radius : 0);
      if (isCharge) {
        b.chargePaths.push({ x, y, angle: laneAngle, length, start: offset, duration: pattern.active });
        chargeX = x + Math.cos(laneAngle) * length;
        chargeY = y + Math.sin(laneAngle) * length;
      }
      spawnHazard(state, { ...delayed, shape: 'lane', x, y, length,
        width: pattern.width || pattern.radius * 2, radius: pattern.radius, angle: laneAngle, charge:isCharge,
        sweep:pattern.sweep||0, startAngle:laneAngle, persistent:!!pattern.sweep||base.persistent });
    }
  }
  if (pattern.shape === 'projectile') {
    const shotSpeed=pattern.projectileSpeed*(b.def.projectileSpeedFactor||1);
    for (let i = 0; i < pattern.volley; i++) {
      const a = pattern.radial || pattern.id === 'spiral' ? angle + i * Math.PI * 2 / pattern.volley
      : angle + (pattern.volley === 1 ? 0 : (i / (pattern.volley - 1) - .5) * pattern.spread);
      const length = arenaRayLength(b.x, b.y, a, shotSpeed * pattern.projectileLife);
      spawnHazard(state, { ...base, t: -i * volleyDelay - dt, shape: 'lane', x: b.x, y: b.y,
        length, width: pattern.projectileRadius * 2,
        angle: a, projectile: true, shotAngle: a, shotSpeed,
        shotRadius: pattern.projectileRadius, shotLife:pattern.shotReturn?pattern.projectileLife:length / shotSpeed, volleyIndex: i,
        shotReturn:pattern.shotReturn||0, shotAcceleration:pattern.shotAcceleration||0 });
    }
  }
  if (pattern.aftershock) {
    const shock = pattern.aftershock;
    const startsAt = pattern.windup + b.pattern.active;
    spawnHazard(state, { ...base, shape: 'circle', sequenceIndex: sequence,
      x: pattern.distance ? chargeX : b.leap?.x ?? p.x, y: pattern.distance ? chargeY : b.leap?.y ?? p.y,
      radius: shock.radius, windup: shock.windup, active: shock.active,
      damage: shock.damage * (1 + state.stage * .025), t: -startsAt - dt });
    b.pattern.active += shock.windup + shock.active;
  }
  state.events.push({ type: 'telegraph', pattern: pattern.id });
}
export function beginComboStage(state: RunState, dt: number) {
  const b=state.boss, combo=b.combo, source=combo.stages[combo.index];
  let next={...source};
  const root=source.finisherOf || source;
  if(source.finisherOf || (root.shape==='sector'&&!patternReachesPlayer(root, b, state.player))){
    const f=root.finisher||{closeRadius:root.radius, halfAngle:root.halfAngle, width:110,
      windup:Math.max(.65, root.windup), active:.2, recover:Math.max(.65, root.recover), damage:root.damage};
    const distance=Math.hypot(state.player.x-b.x, state.player.y-b.y), close=distance<f.closeRadius;
    next={id:`${root.id}-followup`, name:`${root.name} · ${close?'반전 베기':'추격 파동'}`,
      shape:close?'sector':'lane', radius:f.closeRadius, halfAngle:f.halfAngle, width:f.width,
      length:Math.min(Math.hypot(ARENA.width, ARENA.height), distance+100),
      windup:f.windup, active:f.active, recover:f.recover, damage:f.damage};
  }
  if(combo.pattern.steps)next.name=`${combo.pattern.name} · ${next.name}`;
  if(combo.index===combo.total-1 && !source.finisherOf)next.recover=combo.pattern.recover;
  beginPattern(state, dt, next, combo.index);
}
export function startPattern(state: RunState, dt: number) {
  const b=state.boss, p=state.player;
  const reachable=(items: Pattern[])=>items.filter(x=>patternReachesPlayer(x, b, p));
  const options=reachable(b.def.patterns.filter(x=>x.id!==b.lastPattern&&x.id!==b.previousPattern));
  const fallback=reachable(b.def.patterns.filter(x=>x.id!==b.lastPattern));
  const choices=options.length?options:fallback.length?fallback:b.def.patterns.length===1?reachable(b.def.patterns):[];
  const distance=Math.hypot(p.x-b.x, p.y-b.y);
  const pattern=distance>260&&b.def.pursuit&&b.lastPattern!==b.def.pursuit.id?b.def.pursuit:choices.length?choices[Math.floor(state.rng()*choices.length)]:null;
  if(!pattern){
    b.timer=.1;
    return;
  }
  b.previousPattern=b.lastPattern;
  b.lastPattern=pattern.id;
  b.normalCasts=(b.normalCasts||0)+1;
  const stages=(pattern.steps||[pattern]).flatMap(part=>{
    const attacks=part.retarget&&part.sequence>1?Array.from({length:part.sequence}, ()=>({...part, sequence:1})):[part];
    return part.finisher?[...attacks, {finisherOf:part}]:attacks;
  });
  b.combo=stages.length>1?{pattern, index:0, total:stages.length, stages}:null;
  if(b.combo)beginComboStage(state, dt);
  else beginPattern(state, dt, pattern);
}
export function phasePattern(pattern: Pattern, amount: number): Pattern {
  const scale=Math.pow(1.15, amount), speed=Math.pow(.94, amount);
  return {...pattern, damage:pattern.damage*scale, windup:Math.max(.6, pattern.windup*speed),
    ...(pattern.steps?{steps:pattern.steps.map(p=>phasePattern(p, amount))}:{}),
    ...(pattern.finisher?{finisher:{...pattern.finisher, damage:pattern.finisher.damage*scale, windup:Math.max(.6, pattern.finisher.windup*speed)}}:{}),
    ...(pattern.aftershock?{aftershock:{...pattern.aftershock, damage:pattern.aftershock.damage*scale, windup:Math.max(.6, pattern.aftershock.windup*speed)}}:{}),
    ...(pattern.shape==='projectile'?{volley:pattern.volley+amount*2, spread:pattern.spread*1.1}:{sequence:pattern.sequence||(pattern.leap||pattern.sweep||pattern.reposition?1:2)})};
}

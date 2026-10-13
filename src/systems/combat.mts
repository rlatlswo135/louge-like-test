import { encounterDamageFloor, encounterProjectileResolved, encounterProjectileRockHit, encounterReturnHit, reflectEncounterProjectile, strikeEncounterTargets } from '../encounters.mjs';
import { ARENA, LIMITS, PLAYER, RAID_DAMAGE_MULTIPLIER } from '../content.mjs';
import { burst, impactText, spawnHazard, spawnParticle } from '../systems/effects.mjs';
import { getTutorialStep } from '../tutorial.mjs';
import { clampToArena, hazardHitsCircle, segmentHitsCircle } from '../systems/geometry.mjs';
import { getStats } from '../systems/stats.mjs';
import type { RunState, Weapon, Attack, AttackOptions, CombatStats } from '../types.mjs';
/** 공격·투사체 수명과 명중 */
export class CombatSystem {
  update(state: RunState, dt: number): void {
    this.updateProjectiles(state, dt);
    this.updatePlayerAttacks(state, dt);
  }
  private updateProjectiles(state: RunState, dt: number): void {
    const pending=state.projectiles;
    state.projectiles=[];
    for(const q of pending){
      if(q.life<=0){
        encounterProjectileResolved(state, q);
        continue;
      }
      q.prevX=q.x;
      q.prevY=q.y;
      q.elapsed=(q.elapsed||0)+dt;
      if(q.owner==='boss'){
        if(q.acceleration){
          const speed=Math.hypot(q.vx, q.vy)||1, scale=(Math.min(540, speed+q.acceleration*dt))/speed;
          q.vx*=scale;
          q.vy*=scale;
        }
        if(q.turnAt&&q.elapsed>=q.turnAt&&!q.turned){
          q.turned=true;
          q.vx=-q.vx;
          q.vy=-q.vy;
        }
        if(q.turned&&Math.hypot(q.x-q.homeX, q.y-q.homeY)<q.radius+12){
          encounterProjectileResolved(state, q);
          continue;
        }
      }
      if(q.weapon?.returning&&q.elapsed>q.outDuration){
        q.returning=true;
        const angle=Math.atan2(state.player.y-q.y, state.player.x-q.x);
        q.vx=Math.cos(angle)*600;
        q.vy=Math.sin(angle)*600;
        if(Math.hypot(state.player.x-q.x, state.player.y-q.y)<18){
          q.life=0;
          continue;
        }
      }
      const travel=Math.min(dt, q.life);
      q.x+=q.vx*travel;
      q.y+=q.vy*travel;
      q.life-=dt;
      if(state.encounter?.kind==='cover'&&encounterProjectileRockHit(q)){
        encounterProjectileResolved(state, q);
        continue;
      }
      if(q.owner==='boss'){
        const contact=segmentHitsCircle(q.prevX, q.prevY, q.x, q.y, state.player.x, state.player.y, q.radius+PLAYER.radius);
        if(contact){
          const countered=!playerInvulnerable(state)&&tryCounter(state, q, q.prevX, q.prevY);
          const reflected=reflectEncounterProjectile(state, q, {playerInvulnerable, guardActive:()=>countered});
          if(reflected){
            state.events.push({type:'reflect'});
            state.projectiles.push(q);
            continue;
          }
          if(countered){
            encounterProjectileResolved(state, q);
            continue;
          }
          if(!playerInvulnerable(state)){
            hurtPlayer(state, q.damage, q.prevX, q.prevY);
            encounterProjectileResolved(state, q);
            continue;
          }
        }
      }else{
        const targets=strikeEncounterTargets(state, (t: {x: number; y: number; r: number})=>segmentHitsCircle(q.prevX, q.prevY, q.x, q.y, t.x, t.y, q.radius+t.r), ()=>state.events.push({type:'sigilBroken'}), {kind:'projectile', secondary:q.secondary});
        if(targets){
          detonateProjectile(state, q);
          continue;
        }
        const hit=state.boss.hp>0&&segmentHitsCircle(q.prevX, q.prevY, q.x, q.y, state.boss.x, state.boss.y, q.radius+state.boss.def.radius);
        if(hit){
          if(encounterReturnHit(state, q, (damage: number)=>hitBoss(state, damage, '#a4f1e0')))continue;
          const pass=q.returning?'returnHit':'outHit';
          if(!q[pass]){
            q[pass]=true;
            dealAttack(state, q);
            burst(state, q.x, q.y, 5, q.color||'#ffde95', 180);
          }
          if(!q.weapon?.returning){
            detonateProjectile(state, q);
            continue;
          }
        }
      }
      if(q.life<=0){
        detonateProjectile(state, q);
        encounterProjectileResolved(state, q);
        continue;
      }
      if(q.x>=-q.radius&&q.x<=ARENA.width+q.radius&&q.y>=-q.radius&&q.y<=ARENA.height+q.radius)state.projectiles.push(q);
      else if(q.owner==='boss'&&q.turnAt&&!q.turned){
        clampToArena(q, q.radius);
        q.turned=true;
        q.vx=-q.vx;
        q.vy=-q.vy;
        state.projectiles.push(q);
      }
      else if(q.weapon?.returning){
        clampToArena(q, q.radius);
        q.elapsed=q.outDuration+.001;
        state.projectiles.push(q);
      }
      else encounterProjectileResolved(state, q);
    }
    if(state.projectiles.length>LIMITS.projectiles)throw new Error('Projectile limit exceeded');
  }
  private updatePlayerAttacks(state: RunState, dt: number): void {
    const pending=state.attacks;
    state.attacks=[];
    for(const q of pending){
      q.t+=dt;
      if(q.kind==='emitter'){
        if(q.t+1e-9>=q.windup)emitAttack(state, q.stats, q.options);
        else queueAttack(state, q);
        continue;
      }
      if(!q.resolved&&q.t+1e-9>=q.windup&&q.t<q.windup+q.active){
        q.resolved=true;
        if(q.kind==='meteor')state.events.push({type:'spellImpact', element:q.element, secondary:q.secondary});
        const hitTest=(t: {x: number; y: number; r: number})=>hazardHitsCircle(q, t.x, t.y, t.r);
        if(!q.targetsHit){
          const count=strikeEncounterTargets(state, hitTest, ()=>state.events.push({type:'sigilBroken'}), {kind:q.weapon?.kind||q.kind, secondary:q.secondary});
          if(count)q.targetsHit=true;
        }
        if(!q.hit&&state.boss.hp>0&&hitTest({...state.boss, r:state.boss.def.radius})){
          q.hit=true;
          dealAttack(state, q);
          if(q.weapon?.kind==='melee'||q.kind==='counter'){
            if(state.player.swing)state.player.swing.hit=true;
            state.feedback.melee=.8;
            spawnParticle(state, {type:'meleeImpact', x:state.boss.x, y:state.boss.y, angle:q.angle, weaponId:q.weapon?.id, color:q.color, vx:0, vy:0, life:.28, maxLife:.28, size:36});
          }
        }
      }
      if(q.t<q.windup+q.active)queueAttack(state, q);
    }
  }
}
export function attackDamage(state: RunState, base: number, attack: Attack) {
  if(attack?.secondary)return base;
  const group=attack?.group;
  if(group?.procced)return base*group.multiplier;
  const p=state.player;
  let multiplier=1+(attack?.bonus||0);
  p.hitCount++;
  if(state.cards.rapid&&p.hitCount%5===0)multiplier+=.6*state.cards.rapid;
  if(state.cards.focus&&p.hp<=p.maxHp*.4)multiplier*=1+.3*state.cards.focus;
  if(group){
    group.procced=true;
    group.multiplier=multiplier;
  }
  return base*Math.max(.1, multiplier);
}
export function hitBoss(state: RunState, damage: number, color: string, attack?: Attack) {
  if(state.tutorial)state.tutorial.attacked=true;
  const floor=state.tutorial&&getTutorialStep(state)<3?1:encounterDamageFloor(state);
  const dealt = Math.min(Math.max(0, state.boss.hp-floor), damage * (state.boss.raid ? RAID_DAMAGE_MULTIPLIER : 1));
  state.boss.hp -= dealt;
  state.boss.hitFlash = .12;
  state.feedback.impact = 1;
  state.feedback.shake = Math.max(state.feedback.shake, .2);
  state.events.push({ type: 'bossHit', damage: dealt, weaponId: attack?.weapon?.id, secondary: attack?.secondary });
  impactText(state, state.boss.x, state.boss.y, dealt, color);
}
export function playerInvulnerable(state: RunState) {
  const p = state.player;
  const d = getStats(state).dodge;
  return p.dodgeTime > 0 && d.duration - p.dodgeTime < d.invulnerable - 1e-9;
}
export function queueAttack(state: RunState, attack: Attack) {
  if(state.attacks.length>=LIMITS.playerAttacks)throw new Error(`Player attack limit (${LIMITS.playerAttacks}) exceeded`);
  state.attacks.push(attack);
}
export function emitAttack(state: RunState, stats: CombatStats, options: AttackOptions={}) {
  const p=state.player, w=options.weapon||stats.weapon;
  const x=options.x??p.x, y=options.y??p.y, angle=options.angle??Math.atan2(p.faceY, p.faceX);
  const power=options.power??1, secondary=!!options.secondary;
  const group=options.group||{id:state.attackSerial=(state.attackSerial||0)+1, procced:false, effects:false};
  const damage=stats.baseDamage*(options.factor??1)*(stats.chargeTime?.15+.85*power*power:1);
  const packet={x, y, angle, damage, bonus:secondary?0:(options.bonus||0), color:w.color, secondary, group,
    originX:x, originY:y, reach:stats.reach*(options.reachFactor||1), weapon:w, element:state.weapon.id, comboStep:options.comboStep||0};
  const targetX=options.targetX??x+Math.cos(angle)*stats.reach, targetY=options.targetY??y+Math.sin(angle)*stats.reach;
  const length=Math.min(stats.reach, Math.hypot(targetX-x, targetY-y));
  if(w.kind==='projectile') {
    const count=w.shots||1, speed=stats.projectileSpeed, range=stats.reach*(stats.chargeTime?.55+.45*power:1);
    if(state.projectiles.length+count>LIMITS.projectiles)throw new Error(`Projectile limit (${LIMITS.projectiles}) exceeded`);
    for(let i=0;i<count;i++){
      const a=angle+(i-(count-1)/2)*(w.spread||0), offset=w.alternate?(((group.id+(options.burstIndex||0))%2)*2-1)*9:0;
      state.projectiles.push({...packet, owner:'player', kind:w.id, x:x-Math.sin(angle)*offset, y:y+Math.cos(angle)*offset,
        prevX:x, prevY:y, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, radius:w.radius||5,
        life:range/speed*(w.returning?2.8:1), maxLife:range/speed*(w.returning?2.8:1), outDuration:range/speed, elapsed:0});
    }
  } else if(w.kind==='melee') {
    const straight=['punch', 'kick', 'spear', 'dagger'].includes(w.id);
    queueAttack(state, {...packet, kind:secondary?'echo':'melee', shape:options.shape||(straight?'lane':'sector'), radius:packet.reach,
      length:packet.reach, width:options.width||w.width||(w.id==='kick'?30:w.id==='punch'?24:22),
      halfAngle:(w.arc||2.4)/2*(options.arcFactor||1)*(w.comboArc&&options.comboStep===stats.manualCombo?1.5:1), t:0, windup:0, active:w.swingTime||.2});
  } else {
    const meteor=w.kind==='meteor';
    queueAttack(state, {...packet, kind:meteor?'meteor':'beam', shape:meteor?'circle':'lane',
      x:meteor?x+Math.cos(angle)*length:x, y:meteor?y+Math.sin(angle)*length:y,
      length:stats.reach, width:w.width||18, radius:w.radius||70, t:0, windup:meteor?(w.windup||.65):0, active:meteor?.2:.1});
  }
  // Followups keep the original damage/aim/group and cannot schedule more followups.
  if(!options.followup&&!secondary){
    for(let j=1;j<(w.burst||1);j++)queueAttack(state, {kind:'emitter', t:0, windup:j*(w.burstDelay||.12), stats, options:{...options, x, y, angle, targetX, targetY, group, burstIndex:j, followup:true}});
    if(w.echo)queueAttack(state, {kind:'emitter', t:0, windup:.3, stats, options:{...options, x, y, angle, targetX, targetY, group, secondary:true, factor:(options.factor??1)*w.echo, followup:true}});
  }
  state.events.push({ type:'swing', weaponId:w.id, secondary, build:stats.fusion||stats.uniqueIds[0]||'base',
    charged:!!w.charged, power, elastic:!!w.elastic, kind:w.kind, comboStep:options.comboStep||0, attackStep:p.attackStep });
  return packet;
}
export function specialHit(state: RunState, attack: Attack) {
  if(attack.secondary)return;
  const group=attack.group||(attack.group={}), w=attack.weapon||{id:attack.kind}, b=state.boss;
  const element=attack.element||attack.kind;
  if(group.effects)return;
  group.effects=true;
  if((element==='water'&&(w.elemental||w.id==='water'))){
    b.slowTime=Math.max(b.slowTime||0, 1.5);
    if((b.wetCooldown||0)<=0){
      b.wetStacks=(b.wetStacks||0)+1;
      b.wetTime=4;
      b.wetCooldown=.35;
      if(b.wetStacks>=3){
        b.wetStacks=0;
        b.wetTime=0;
        hitBoss(state, attack.damage*(w.elemental?2.25:.9), '#75d9ff');
        state.player.shield=Math.max(state.player.shield, Math.min(16, state.player.shield+(w.elemental?12:8)));
        state.player.shieldTime=3;
        state.events.push({type:'waterBurst'});
        burst(state, b.x, b.y, 16, '#75d9ff', 180);
      }
    }
  }
  if(w.burn||(w.elemental&&attack.element==='fire')){
    b.burnTime=2;
    b.burnDps=Math.max(b.burnDps||0, Math.min(w.elemental?32:24, attack.damage*(w.elemental?.42:.22)/Math.max(.12, w.interval)));
    b.burnTick??=.4;
  }
  state.player.primaryHits=(state.player.primaryHits||0)+1;
  if(w.finisher&&state.player.primaryHits%(w.finisherEvery||3)===0){
    const meteor=w.finisherKind==='meteor';
    queueAttack(state, {kind:meteor?'meteor':'echo', shape:meteor?'circle':'lane', x:meteor?b.x:state.player.x, y:meteor?b.y:state.player.y,
      angle:attack.angle??Math.atan2(b.y-state.player.y, b.x-state.player.x), length:Math.max(160, attack.reach||160), width:56, radius:65,
      t:0, windup:meteor?.5:.12, active:.2, damage:attack.damage*w.finisher, color:attack.color, secondary:true});
    state.events.push({type:'finisher'});
  }
}
export function dealAttack(state: RunState, attack: Attack) {
  let damage=attackDamage(state, attack.damage, attack), w: Partial<Weapon>=attack.weapon||{}, b=state.boss;
  if(b.raid?.counterWindow&&b.state==='windup'&&!attack.secondary&&
  (attack.originX-b.x)*b.faceX+(attack.originY-b.y)*b.faceY>0){
    damage*=.2;
    if(state.time>=(b.raid.nextCounter||0)){
      b.raid.nextCounter=state.time+.55;
      spawnHazard(state, {shape:'lane', x:b.x, y:b.y, angle:Math.atan2(state.player.y-b.y, state.player.x-b.x),
        width:84, length:1400, phase:'warn', t:0, windup:.75, active:.2, damage:28, pattern:'mirror-retaliation', raid:true});
      state.events.push({type:'counterWarning'});
    }
  }
  if(w.backstab){
    const behind=(attack.originX-b.x)*b.faceX+(attack.originY-b.y)*b.faceY<0;
    damage*=behind?1.65:.8;
  }
  if(w.distance){
    const d=Math.hypot(b.x-attack.originX, b.y-attack.originY)-b.def.radius;
    damage*=d>attack.reach*.6?1.45:.7;
  }
  if(!attack.secondary&&w.elemental&&attack.element==='lightning'){
    const g=attack.group||(attack.group={});
    if(g.critical===undefined)g.critical=state.combatRng()<.25;
    if(g.critical)damage*=2.5;
  }
  hitBoss(state, damage, attack.color, attack);
  specialHit(state, attack);
}
export function detonateProjectile(state: RunState, q: Attack){
  const w: Partial<Weapon>=q.weapon||{};
  if(w.impactOnly&&!q.outHit)return;
  if(q.secondary||q.detonated)return;
  q.detonated=true;
  if(w.explosion)queueAttack(state, {kind:'meteor', shape:'circle', x:q.x, y:q.y, radius:74, t:0, windup:0, active:.18, damage:q.damage*w.explosion, color:q.color, secondary:true});
  if(w.fragments){
    if(state.projectiles.length+w.fragments>LIMITS.projectiles)throw new Error('Fragment projectile limit exceeded');
    const angle=Math.atan2(q.vy, q.vx);
    for(let i=0;i<w.fragments;i++){
      const a=angle+(i-(w.fragments-1)/2)*.22;
      state.projectiles.push({owner:'player', kind:'fragment', x:q.x, y:q.y, prevX:q.x, prevY:q.y, vx:Math.cos(a)*450, vy:Math.sin(a)*450,
        radius:5, life:.45, maxLife:.45, damage:q.damage*(w.fragmentFactor||.15), color:q.color, secondary:true});
    }
    state.events.push({type:'fragmentBurst', count:w.fragments});
  }
  if(w.burnZone)for(let i=0;i<5;i++)queueAttack(state, {kind:'meteor', shape:'circle', x:q.x, y:q.y, radius:80, t:0, windup:i*.4, active:.15, damage:q.damage*.075, color:'#ff8750', secondary:true});
}
export function tryCounter(state: RunState, attack: Attack, sourceX: number, sourceY: number){
  const p=state.player, stats=getStats(state), w=stats.weapon;
  if(!stats.counter||p.guardTime<=0||attack.countered||attack.hitGroup?.countered||attack.persistent||attack.pattern==='pool')return false;
  // A targeted circle can be centered exactly on the player. Its caster still
  // determines the incoming direction, rather than granting a 360-degree guard.
  if(Math.hypot(sourceX-p.x, sourceY-p.y)<1e-6){
    sourceX=state.boss.x;
    sourceY=state.boss.y;
  }
  const dx=sourceX-p.x, dy=sourceY-p.y;
  if(dx*p.guardX+dy*p.guardY<0)return false;
  attack.countered=true;
  if(attack.hitGroup)attack.hitGroup.countered=true;
  p.guardTime=0;
  p.counterTime=.32;
  const angle=Math.atan2(p.guardY, p.guardX);
  // Normalize the riposte by the complete attack cycle: charged weapons cannot multiply it for free.
  const damage=stats.baseDamage/(stats.interval+stats.chargeTime)*(w.counter||.85)*1.15;
  queueAttack(state, {kind:'counter', shape:'lane', x:p.x, y:p.y, angle, length:Math.min(360, Math.max(225, stats.reach)), width:54,
    t:0, windup:.035, active:.18, damage, color:'#bcece6', secondary:true, originX:p.x, originY:p.y, weapon:w});
  p.swing={t:0, angle, hit:false, comboStep:0};
  impactText(state, p.x, p.y, '반격', '#bcece6');
  state.events.push({type:'counter', kind:stats.counter.kind, weaponId:w.id});
  return true;
}
export function hurtPlayer(state: RunState, damage: number, sourceX: number=state.boss.x, sourceY: number=state.boss.y) {
  if (damage <= 0) return;
  state.hitsTaken++;
  const p = state.player;
  damage*=getStats(state).damageTaken;
  const taken = Math.min(Math.max(0, p.hp-(state.tutorial?1:0)), Math.max(0, damage - p.shield));
  p.shield = Math.max(0, p.shield - damage);
  if (!p.shield) p.shieldTime = 0;
  p.hp -= taken;
  if (taken > 0) {
    p.hurtFlash = .25;
    state.feedback.flash = .55;
    state.feedback.shake = .35;
    state.events.push({ type: 'playerHit', damage: taken });
    impactText(state, p.x, p.y, taken, '#ff7777');
    burst(state, p.x, p.y, 8, '#ff8777', 200);
  } else {
    burst(state, p.x, p.y, 6, '#a4e9f3', 150);
    impactText(state, p.x, p.y, '방어', '#a4e9f3');
  }
}

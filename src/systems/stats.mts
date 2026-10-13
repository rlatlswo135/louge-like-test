import { PLAYER } from '../content.mjs';
import { buildWeapon, deriveBuild } from '../builds.mjs';
import type { RunState, CombatStats } from '../types.mjs';
export function getStats(state: RunState): CombatStats {
  const c=state.cards, count=(id: string)=>c[id]||0, build=deriveBuild(state), weapon=buildWeapon(state.weapon, build);
  const maxHp=Math.round(((state.cls.maxHp||PLAYER.hp)+20*count('vitality'))*(count('glass-heart')?.8:1));
  const damageTaken=(1-(state.cls.damageReduction||0))*(count('exposed')?1.25:1);
  const berserk=1+.3*count('glass-heart')+.35*count('exposed')+.4*count('blood-price');
  const baseDamage=weapon.damage*(1+.2*count('edge'))*berserk;
  let multiplier=1;
  if(count('heavy')&&state.player.heavyReady)multiplier+=.5*count('heavy');
  if(count('rapid')&&(state.player.hitCount+1)%5===0)multiplier+=.6*count('rapid');
  if(count('dodge')&&state.player.dodgeBuffTime>0)multiplier+=.35*count('dodge');
  if(count('focus')&&state.player.hp<=state.player.maxHp*.4)multiplier*=1+.3*count('focus');
  const haste=Math.pow(.85, count('tempo'))*Math.pow(.95, count('rapid'));
  const interval=weapon.interval*haste, reach=weapon.reach*(1+.15*count('reach'));
  const dodge={...state.cls.dodge};
  if(weapon.assassinDodge)Object.assign(dodge, {kind:'dash', label:'연속 암살 회피', duration:.16, invulnerable:.12, distance:150, chainWindow:.45, extraDashes:2});
  const counter=weapon.parry||weapon.perfectEvade ? {
    kind:weapon.parry?'guard':'slip', label:weapon.parry?'철벽 반격':'슬립 카운터',
    window:weapon.parry?.28:.22, cooldown:weapon.parry?3.2:2.8,
  }:null;
  if(counter){
    dodge.label='절제된 회피';
    dodge.cooldown*=1.45;
    dodge.distance*=.8;
    dodge.chainWindow=0;
    dodge.extraDashes=0;
  }
  if(weapon.dodgeAttack)dodge.canAttack=true;
  dodge.cooldown*=Math.pow(.85, count('dodge'));
  return {damage:baseDamage*multiplier, baseDamage, interval, reach, speed:PLAYER.speed*Math.pow(1.08, count('swift')),
    dodgeCooldown:dodge.cooldown, projectileSpeed:weapon.speed||0, chargeTime:weapon.chargeTime*haste,
    magazine:weapon.magazine||0, reloadTime:weapon.reloadTime||0,
    weapon:{...weapon, damage:baseDamage, interval, reach}, dodge, counter, uniqueIds:build.ids,
    buildName:build.name, buildDescription:build.description, fusion:build.fusion?.key||null,
    manualCombo:weapon.manualCombo||0, timingMeter:!!weapon.timing, maxHp, damageTaken, healingMultiplier:count('blood-price')?.5:1};
}
// ── 도형 판정 ─────────────────────────────────────────────

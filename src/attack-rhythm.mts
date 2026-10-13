import type { AttackBeat } from './types.mjs';
// Complete chains preserve their mean damage/cadence. Each beat still aims where the player aims.
export const TIMING_WINDOW=Object.freeze({start:.3, end:.7});
export const timingSuccess=(phase: number)=>phase>=TIMING_WINDOW.start&&phase<=TIMING_WINDOW.end;
export const ATTACK_RHYTHMS: Readonly<Record<string, AttackBeat[]>>=Object.freeze({
  sword:[{damage:.85, interval:.85}, {damage:.95, interval:.95}, {damage:1.2, interval:1.2, shape:'lane', reach:1.25, width:30}],
  spear:[{damage:.85, interval:.8, reach:.92}, {damage:1.15, interval:1.2, reach:1.08}],
  axe:[{damage:.85, interval:.85, arc:.85}, {damage:1.15, interval:1.15, arc:1.1}],
  punch:[{damage:.72, interval:.72}, {damage:1, interval:.85}, {damage:1.28, interval:1.43, reach:1.12}],
  kick:[{damage:.85, interval:.85, reach:.95}, {damage:1.15, interval:1.15, reach:1.08}],
  lightning:[{damage:.8, interval:.85}, {damage:.8, interval:.85}, {damage:1.4, interval:1.3, kind:'beam', width:22}],
});
export function attackBeat(weaponId: string, index: number): AttackBeat{
return ATTACK_RHYTHMS[weaponId]?.[index]||{damage:1, interval:1};
}

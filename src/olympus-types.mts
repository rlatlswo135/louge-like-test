import type { Point } from './types.mjs';

export type AergiaPhase = 'intro' | 'combat' | 'centering' | 'sleep' | 'smash' | 'stunned' | 'rebuke' | 'wipe';
export type AergiaActionKind = 'sweep' | 'charge' | 'debris' | 'chains' | 'cross' | 'punish' | 'slam';
export interface AergiaAction {
  kind: AergiaActionKind;
  windup: number;
  active: number;
  recovery: number;
  index?: number;
}
export interface TempleFragment extends Point {
  id: number;
  delay: number;
  fall: number;
  landed: boolean;
  collected: boolean;
}
export interface OlympusState {
  number: number;
  phase: AergiaPhase;
  phaseTime: number;
  introDuration: number;
  gimmickUsed: boolean;
  gimmickCount: number;
  enraged: boolean;
  collectDuration: number;
  fragments: TempleFragment[];
  collected: number;
  carrying: boolean;
  smashHeld: boolean;
  controlsLocked: boolean;
  action: AergiaAction | null;
  actionTime: number;
  fired: boolean;
  queue: AergiaAction[];
  lastFamily: number;
  nextAttack: number;
  angle: number;
  origin: Point;
  destination: Point;
  chainLengths: number[];
  chainCaught: boolean;
  grab: { from: Point; to: Point; time: number } | null;
  stunDuration: number;
  smashImpact: boolean;
  walkTime: number;
  dialogue: string;
  dialogueUntil: number;
}

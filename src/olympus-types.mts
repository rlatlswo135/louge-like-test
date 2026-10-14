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
export interface AergiaState {
  number: 1;
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

export type MomosPhase = 'intro' | 'combat' | 'centering' | 'cards-show' | 'cards-shuffle' | 'cards-answer' | 'cards-result' | 'stunned';
export type CardSuit = 'heart' | 'diamond' | 'club' | 'spade';
export interface MomosAction {
  kind: 'daggers' | 'bicycle' | 'hammer' | 'clover' | 'heart' | 'diamond' | 'spade';
  rush?: boolean;
  windup: number;
  active: number;
  recovery: number;
  index?: number;
}
export interface FloorCard extends Point {
  suit: CardSuit;
  struck: boolean;
}
export interface MomosState {
  number: 2;
  phase: MomosPhase;
  phaseTime: number;
  introDuration: number;
  gimmickUsed: boolean;
  gimmickCount: number;
  enraged: boolean;
  controlsLocked: boolean;
  action: MomosAction | null;
  actionTime: number;
  fired: boolean;
  queue: MomosAction[];
  lastFamily: number;
  nextAttack: number;
  angle: number;
  origin: Point;
  destination: Point;
  walking: boolean;
  walkTime: number;
  dialogue: string;
  dialogueUntil: number;
  stunDuration: number;
  round: number;
  successes: number;
  sequence: CardSuit[];
  cards: FloorCard[];
  accepted: number;
  shown: number;
  cardArmed: boolean;
  answerDuration: number;
  roundCorrect: boolean;
  rearOnly: boolean;
}
export type OlympusState = AergiaState | MomosState;

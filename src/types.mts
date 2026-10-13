import type { Player, Boss } from './entities.mjs';
export type ClassId = 'warrior' | 'archer' | 'mage' | 'gunslinger' | 'fighter';
export type RunStatus = 'playing' | 'reward' | 'dead' | 'won';
export interface RunOptions {
  classId?: ClassId;
  weaponId?: string;
  seed?: number;
  stage?: number
}
export interface Point {
  x: number;
  y: number
}
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  aimX: number;
  aimY: number;
  attack: boolean;
  attackPressed: boolean;
  dodge: boolean;
  counter: boolean;
}
export interface ClockState {
  last: number | null;
  acc: number
}
export interface DodgeDefinition {
  kind: string;
  label: string;
  cooldown: number;
  duration: number;
  invulnerable: number;
  distance: number;
  chainWindow?: number;
  extraDashes?: number;
  canAttack?: boolean;
}
export interface ClassDefinition {
  id: ClassId;
  name: string;
  description: string;
  color: string;
  maxHp: number;
  damageReduction: number;
  dodge: DodgeDefinition;
  weapons: Weapon[];
}
export interface Weapon {
  id: string;
  name?: string;
  description?: string;
  kind?: string;
  color?: string;
  damage?: number;
  interval?: number;
  reach?: number;
  speed?: number;
  radius?: number;
  arc?: number;
  swingTime?: number;
  chargeTime?: number;
  magazine?: number;
  reloadTime?: number;
  recoilTime?: number;
  shotMove?: number;
  width?: number;
  castMove?: number;
  effect?: string;
  parry?: boolean;
  perfectEvade?: boolean;
  assassinDodge?: boolean;
  dodgeAttack?: boolean;
  timing?: boolean;
  manualCombo?: number;
  counter?: number;
  shots?: number;
  spread?: number;
  charged?: boolean;
  returning?: boolean;
  alternate?: boolean;
  elemental?: boolean;
  burn?: boolean;
  burnZone?: boolean;
  impactOnly?: boolean;
  backstab?: boolean;
  distance?: boolean;
  comboArc?: boolean;
  lunge?: number;
  echo?: number;
  dodgeEcho?: number;
  dodgeShot?: number;
  comboWave?: number;
  comboBeam?: number;
  comboMeteor?: number;
  windup?: number;
  burst?: number;
  burstDelay?: number;
  finisher?: number;
  finisherEvery?: number;
  finisherKind?: string;
  explosion?: number;
  fragments?: number;
  fragmentFactor?: number;
  elastic?: boolean;
  heat?: boolean;
  heatGain?: number;
}
export interface CardDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  maxStacks: number;
  classId?: string;
  rarity?: string;
}
export interface CombatStats {
  damage: number;
  baseDamage: number;
  interval: number;
  reach: number;
  speed: number;
  dodgeCooldown: number;
  projectileSpeed: number;
  chargeTime: number;
  magazine: number;
  reloadTime: number;
  weapon: Weapon;
  dodge: DodgeDefinition;
  counter: {kind: string;
    label: string;
    window: number;
    cooldown: number} | null;
  uniqueIds: string[];
  buildName: string;
  buildDescription: string;
  fusion: string | null;
  manualCombo: number;
  timingMeter: boolean;
  maxHp: number;
  damageTaken: number;
  healingMultiplier: number;
}
export interface Pattern extends Partial<Hazard> {
  id?: string;
  name?: string;
  tactic?: string;
  recover?: number;
  closeRadius?: number;
  finisherOf?: Pattern;
  steps?: Pattern[];
  finisher?: Pattern;
  aftershock?: Pattern;
}
export interface ChargePath extends Point {
  angle: number;
  length: number;
  start: number;
  duration: number
}
export interface RaidState {
  id?: string;
  name: string;
  kind: string;
  hint?: string;
  rounds?: number;
  signature?: boolean;
  round: number;
  total: number;
  angle: number;
  counterWindow?: boolean;
  pull?: number;
  shadow?: {x: number;
    y: number;
    radius: number};
  memory?: {x: number;
    y: number;
    radius: number}[];
  nextCounter?: number;
  pressures?: number;
  pressureAt?: number;
  programs?: RaidDefinition[];
  invert?: boolean;
  axis?: number;
  turn?: number;
  crossFinal?: boolean;
}
export interface BossDefinition {
  id: string;
  name: string;
  title: string;
  color: string;
  hp: number;
  speed: number;
  idle: number;
  radius: number;
  patterns: Pattern[];
  special: boolean;
  phaseThresholds: number[];
  raid?: RaidDefinition;
  raids?: RaidDefinition[];
  signature?: RaidDefinition;
  preferredRange?: number;
  projectileSpeedFactor?: number;
  pursuit?: Pattern;
  artId?: string;
  overview?: string;
  hint?: string;
  arena?: StageDefinition;
}
export interface HitGroup {
  multiplier?: number;
  id?: number;
  procced?: boolean;
  effects?: boolean;
  critical?: boolean;
  hit?: boolean;
  countered?: boolean
}
export interface Hazard extends Partial<Point> {
  shape?: string;
  phase?: string;
  pattern?: string;
  rootPattern?: string;
  t?: number;
  windup?: number;
  active?: number;
  damage?: number;
  radius?: number;
  innerRadius?: number;
  height?: number;
  angle?: number;
  halfAngle?: number;
  gapAngle?: number;
  gapHalfAngle?: number;
  width?: number;
  length?: number;
  charge?: boolean;
  body?: Point & {prevX: number;
    prevY: number;
    radius: number};
  safe?: {x: number;
    y: number;
    radius: number}[];
  hitGroup?: HitGroup;
  hitDone?: boolean;
  nextHit?: number;
  resolved?: boolean;
  persistent?: boolean;
  countered?: boolean;
  sweep?: number;
  startAngle?: number;
  sourceX?: number;
  sourceY?: number;
  projectile?: boolean;
  shotAngle?: number;
  shotSpeed?: number;
  shotRadius?: number;
  shotLife?: number;
  shotReturn?: number;
  shotAcceleration?: number;
  encounter?: string;
  raid?: boolean;
  raidRound?: number;
  raidPressure?: boolean;
  gaze?: boolean;
  counterable?: boolean;
  delay?: number;
  ghost?: boolean;
  blockedBySeal?: boolean;
  // Declarative pattern options; instantiated geometry above is locked at cast time.
  angleOffset?: number;
  gapOffset?: number;
  lateralStep?: number;
  volleyIndex?: number;
  sequenceIndex?: number;
  anchor?: string;
  leap?: boolean;
  reposition?: string;
  sequence?: number;
  retarget?: boolean;
  radiusStep?: number;
  sequenceDelay?: number;
  angleStep?: number;
  orbitRadius?: number;
  orbitStep?: number;
  distance?: number;
  layout?: string;
  projectileSpeed?: number;
  projectileLife?: number;
  projectileRadius?: number;
  volley?: number;
  spread?: number;
  radial?: boolean;
  shotDelay?: number;
}
export interface Attack extends Hazard {
  owner?: string;
  kind?: string;
  color?: string;
  secondary?: boolean;
  group?: HitGroup;
  originX?: number;
  originY?: number;
  reach?: number;
  weapon?: Weapon;
  element?: string;
  bonus?: number;
  comboStep?: number;
  stats?: CombatStats;
  options?: AttackOptions;
  prevX?: number;
  prevY?: number;
  vx?: number;
  vy?: number;
  life?: number;
  maxLife?: number;
  outDuration?: number;
  elapsed?: number;
  outHit?: boolean;
  detonated?: boolean;
  returnHit?: boolean;
  homeX?: number;
  homeY?: number;
  turnAt?: number;
  acceleration?: number;
  age?: number;
  turned?: boolean;
  targetsHit?: boolean;
  encounterBit?: number;
  encounterResolved?: boolean;
  returning?: boolean;
  hit?: boolean;
}
export interface AttackOptions {
  weapon?: Weapon;
  x?: number;
  y?: number;
  angle?: number;
  power?: number;
  secondary?: boolean;
  group?: HitGroup;
  factor?: number;
  bonus?: number;
  reachFactor?: number;
  comboStep?: number;
  targetX?: number;
  targetY?: number;
  burstIndex?: number;
  shape?: string;
  width?: number;
  arcFactor?: number;
  followup?: boolean;
}
export interface Particle extends Hazard {
  weaponId?: string;
  type?: string;
  text?: string | number;
  color?: string;
  vx?: number;
  vy?: number;
  life?: number;
  maxLife?: number;
  size?: number;
}
export interface GameEvent {
  element?: string;
  pattern?: string;
  type: string;
  damage?: number;
  weaponId?: string;
  secondary?: boolean;
  build?: string;
  charged?: boolean;
  power?: number;
  elastic?: boolean;
  kind?: string;
  comboStep?: number;
  attackStep?: number;
  count?: number;
  name?: string;
  round?: number;
  hint?: string;
  phase?: number;
  final?: boolean;
  shape?: string;
  heavy?: boolean;
  bossId?: string;
}
export interface EncounterState {
  stage: number;
  phase: number;
  kind: string;
  elapsed: number;
  active: boolean;
  complete: boolean;
  phaseHp: number;
  floor: number;
  pulseAt: number;
  pulseTime: number;
  pulseCount: number;
  sealMask: number;
  sigilMask: number;
  reflectMask: number;
  markAt: number;
  shot: Attack | null;
  marks: {x: number;
    y: number;
    r: number;
    time: number}[];
}
export interface RunState {
  time: number;
  stageTime: number;
  stormExposure: number;
  hitsTaken: number;
  bossesCleared: number;
  stormContact: boolean;
  status: RunStatus;
  stage: number;
  stageCount: number;
  rng: () => number;
  cosmeticRng: () => number;
  combatRng: () => number;
  cards: Record<string, number>;
  offers: CardDefinition[];
  attacks: Attack[];
  projectiles: Attack[];
  feedback: {shake: number;
    flash: number;
    impact: number;
    melee: number};
  cls: ClassDefinition;
  weapon: Weapon;
  player: Player;
  boss: Boss;
  hazards: Hazard[];
  particles: Particle[];
  events: GameEvent[];
  attackSerial?: number;
  tutorial?: {walked: number;
    attacked: boolean;
    dodged: boolean};
  encounter?: EncounterState | null;
}
export interface WeaponProfile extends Partial<Weapon> {
  damageFactor?: number;
  intervalFactor?: number;
  reachFactor?: number;
  chargeFactor?: number;
}
export interface UniqueDefinition {
  name: string;
  description: string;
  profile: Readonly<WeaponProfile>
}
export interface FusionDefinition extends UniqueDefinition {
  ids: readonly string[];
  key: string
}
export interface BuildDefinition {
  ids: string[];
  pairs: string[];
  fusion: FusionDefinition | null;
  name: string;
  description: string;
  profile: Readonly<WeaponProfile>;
}
export type RaidDefinition = Omit<RaidState, 'round' | 'total' | 'angle' | 'id'> & {id?: string};
export interface StageDefinition {
  name: string;
  biome: number;
  motif: string;
  music: string;
  sound: string
}
export interface AttackBeat {
  damage: number;
  interval: number;
  shape?: string;
  reach?: number;
  width?: number;
  arc?: number;
  kind?: string
}
export interface EncounterHelpers {
  spawnHazard?: (hazard: Hazard) => void;
  spawnProjectile?: (projectile: Attack) => void;
  playerInvulnerable?: (state: RunState) => boolean;
  guardActive?: (state: RunState) => boolean;
}
export interface EncounterTarget extends Point {
  r: number
}

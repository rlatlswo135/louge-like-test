import type { RunState, StageDefinition } from './types.mjs';
// Presentation and encounter identity. No gameplay RNG or per-frame asset work.
const stage = (name: string, biome: number, motif: string, music: string, sound: string): StageDefinition => Object.freeze({name, biome, motif, music, sound});
export const STAGES = Object.freeze([
stage('철문 투기장', 0, 'sun', 'iron', 'steel'),
stage('부서진 돌격로', 0, 'fracture', 'drums', 'stone'),
stage('잿불 용광로', 1, 'furnace', 'ember', 'fire'),
stage('얼어붙은 회랑', 2, 'frost', 'frost', 'ice'),
stage('폭풍의 제단', 3, 'conduit', 'storm', 'lightning'),
stage('검은 공성 공장', 1, 'rails', 'iron', 'cannon'),
stage('결투의 원형극장', 0, 'blades', 'drums', 'steel'),
stage('침수된 심연 성소', 3, 'wells', 'abyss', 'water'),
stage('황혼의 처형장', 0, 'judgment', 'ember', 'steel'),
stage('찢어진 왕좌', 3, 'rift', 'storm', 'void'),
stage('유리의 거울궁', 2, 'mirror', 'frost', 'glass'),
stage('가라앉은 왕정', 3, 'roots', 'abyss', 'water'),
stage('일식의 화구', 1, 'eclipse', 'ember', 'fire'),
stage('태엽의 관측소', 0, 'gears', 'iron', 'cannon'),
stage('공허의 해연', 3, 'tide', 'abyss', 'void'),
stage('별이 떨어진 땅', 1, 'craters', 'drums', 'fire'),
stage('백색 예언의 전당', 2, 'runes', 'frost', 'glass'),
stage('천둥의 주조소', 1, 'anvil', 'storm', 'lightning'),
stage('검은 달의 신전', 3, 'moon', 'abyss', 'void'),
stage('균열 황제의 투기장', 0, 'crown', 'final', 'void'),
]);
export const stageTheme = (state: RunState | null) => state?.olympus && state.boss.def.arena || STAGES[state?.tutorial ? 0 : state?.stage || 0] || STAGES[0];

import { AergiaEncounter } from './aergia.mjs';
import { MomosEncounter } from './momos.mjs';
import type { BossEncounter } from './boss-encounter.mjs';
import type { RunState } from './types.mjs';

export const OLYMPUS_ENCOUNTERS: ReadonlyMap<number, BossEncounter> = new Map<number,BossEncounter>([[1,new AergiaEncounter()],[2,new MomosEncounter()]]);
export const encounterFor = (state: RunState) => state.olympus ? OLYMPUS_ENCOUNTERS.get(state.olympus.number) : undefined;

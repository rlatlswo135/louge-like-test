import { AergiaEncounter } from './aergia.mjs';
import type { BossEncounter } from './boss-encounter.mjs';
import type { RunState } from './types.mjs';

export const OLYMPUS_ENCOUNTERS: ReadonlyMap<number, BossEncounter> = new Map([[1,new AergiaEncounter()]]);
export const encounterFor = (state: RunState) => state.olympus ? OLYMPUS_ENCOUNTERS.get(state.olympus.number) : undefined;

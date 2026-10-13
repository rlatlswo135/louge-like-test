import type { RunState } from './types.mjs';
export function getTutorialStep(state: RunState) {
  const t=state.tutorial;
  if(!t)return -1;
  return t.walked<60?0:!t.attacked?1:!t.dodged?2:3;
}

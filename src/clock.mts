import type { ClockState } from './types.mjs';
import { STEP, MAX_CATCH_UP_STEPS } from './content.mjs';
/** Wall-clock milliseconds become fixed simulation steps (seconds). */
export class FixedStepClock implements ClockState {
  last: number | null = null;
  acc = 0;
  reset(): void {
  resetClock(this);
  }
  advance(nowMs: number): number {
  return advanceClock(this, nowMs);
  }
}
export function createClock() {
  return new FixedStepClock();
}
export function resetClock(clock: ClockState) {
  clock.last = null;
  clock.acc = 0;
}
// 실제 경과 시간을 고정 스텝 수로 변환한다. catch-up 상한을 넘는 지연은 버린다.
export function advanceClock(clock: ClockState, nowMs: number) {
  if (clock.last === null) {
    clock.last = nowMs;
    return 0;
  }
  const elapsed = Math.max(0, (nowMs - clock.last) / 1000);
  clock.last = nowMs;
  clock.acc += elapsed;
  let steps = Math.floor(clock.acc / STEP + 1e-6);
  if (steps > MAX_CATCH_UP_STEPS) {
    steps = MAX_CATCH_UP_STEPS;
    clock.acc = 0;
  } else {
    clock.acc = Math.max(0, clock.acc - steps * STEP);
  }
  return steps;
}

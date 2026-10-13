import type { InputState } from './types.mjs';
/** One frame of input. Edge-triggered actions are consumed by PlayerSystem. */
export class GameInput implements InputState {
  up = false;
  down = false;
  left = false;
  right = false;
  aimX = 0;
  aimY = 0;
  attack = false;
  attackPressed = false;
  dodge = false;
  counter = false;
  clear(): void {
  clearInput(this);
  }
}
export function createInput(): GameInput {
return new GameInput();
}
export function clearInput(input: InputState): void {
  input.up = input.down = input.left = input.right = false;
  input.attack = input.attackPressed = input.dodge = input.counter = false;
}

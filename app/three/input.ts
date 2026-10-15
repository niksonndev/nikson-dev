/**
 * Keyboard + virtual (touch) input for the ride. The world reads `state`
 * every frame; one-shot actions are consumed with the `take*` helpers.
 */

export type InputState = {
  throttle: number;
  brake: number;
  steer: number;
  boost: boolean;
};

export type VirtualInput = { steer?: number; throttle?: number; brake?: number };

const KEYS: Record<string, keyof InputState | "interact" | "jump" | "reset" | "bell" | "mute"> = {
  ArrowUp: "throttle",
  KeyW: "throttle",
  ArrowDown: "brake",
  KeyS: "brake",
  ArrowLeft: "steer",
  KeyA: "steer",
  ArrowRight: "steer",
  KeyD: "steer",
  ShiftLeft: "boost",
  ShiftRight: "boost",
  KeyE: "interact",
  Enter: "interact",
  Space: "jump",
  KeyR: "reset",
  KeyH: "bell",
  KeyL: "mute",
};

export type InputController = {
  state: InputState;
  attach(): void;
  detach(): void;
  setVirtual(input: VirtualInput): void;
  takeInteract(): boolean;
  takeJump(): boolean;
  takeReset(): boolean;
  takeBell(): boolean;
  takeMute(): boolean;
  clear(): void;
};

export function createInput(): InputController {
  const pressed = new Set<string>();
  const virtual: VirtualInput = { steer: 0, throttle: 0, brake: 0 };
  let interact = false;
  let jump = false;
  let reset = false;
  let bell = false;
  let mute = false;

  const state: InputState = { throttle: 0, brake: 0, steer: 0, boost: false };

  function refresh(): void {
    let steer = 0;
    if (pressed.has("ArrowLeft") || pressed.has("KeyA")) steer -= 1;
    if (pressed.has("ArrowRight") || pressed.has("KeyD")) steer += 1;
    const throttleKey = pressed.has("ArrowUp") || pressed.has("KeyW");
    const brakeKey = pressed.has("ArrowDown") || pressed.has("KeyS");

    state.steer = Math.max(-1, Math.min(1, steer + (virtual.steer ?? 0)));
    state.throttle = Math.max(throttleKey ? 1 : 0, virtual.throttle ?? 0);
    state.brake = Math.max(brakeKey ? 1 : 0, virtual.brake ?? 0);
    state.boost = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
  }

  function onKeyDown(event: KeyboardEvent): void {
    const mapped = KEYS[event.code];
    if (!mapped) return;
    if (event.code === "Space" || event.code.startsWith("Arrow")) event.preventDefault();
    if (event.repeat) return;
    pressed.add(event.code);
    if (mapped === "interact") interact = true;
    if (mapped === "jump") jump = true;
    if (mapped === "reset") reset = true;
    if (mapped === "bell") bell = true;
    if (mapped === "mute") mute = true;
    refresh();
  }

  function onKeyUp(event: KeyboardEvent): void {
    pressed.delete(event.code);
    refresh();
  }

  function onBlur(): void {
    pressed.clear();
    refresh();
  }

  return {
    state,
    attach() {
      window.addEventListener("keydown", onKeyDown, { passive: false });
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
    },
    detach() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      onBlur();
    },
    setVirtual(input) {
      Object.assign(virtual, input);
      refresh();
    },
    takeInteract() {
      const value = interact;
      interact = false;
      return value;
    },
    takeJump() {
      const value = jump;
      jump = false;
      return value;
    },
    takeReset() {
      const value = reset;
      reset = false;
      return value;
    },
    takeBell() {
      const value = bell;
      bell = false;
      return value;
    },
    takeMute() {
      const value = mute;
      mute = false;
      return value;
    },
    clear() {
      pressed.clear();
      interact = false;
      jump = false;
      reset = false;
      bell = false;
      mute = false;
      refresh();
    },
  };
}

/**
 * Keyboard, touch and gamepad merged into one held-button snapshot per frame:
 * { left, right, jump, shoot, dash }. One-shot commands (weapon switch, pause, mute) are
 * delivered through the `onCommand` callback.
 */

const KEYS = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  KeyZ: "jump",
  Space: "jump",
  KeyK: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  KeyX: "shoot",
  KeyJ: "shoot",
  KeyC: "dash",
  KeyL: "dash",
  ShiftLeft: "dash",
  ShiftRight: "dash",
};

const COMMAND_KEYS = {
  KeyQ: "weapon-prev",
  KeyE: "weapon-next",
  KeyP: "pause",
  Escape: "pause",
  KeyM: "mute",
  KeyN: "music",
};

const BUTTONS = ["left", "right", "jump", "shoot", "dash"];

export function createInput({ onCommand, isPlaying }) {
  const keys = new Set();
  const touches = new Map(); // pointerId → button
  let padPrev = [];

  window.addEventListener("keydown", (event) => {
    const button = KEYS[event.code];
    if (button) {
      keys.add(button); // tracked even in menus so a key held through READY still counts
      if (isPlaying()) event.preventDefault();
    }
    const command = COMMAND_KEYS[event.code];
    if (command && !event.repeat) {
      onCommand(command);
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    const button = KEYS[event.code];
    if (button) keys.delete(button);
  });
  window.addEventListener("blur", () => {
    keys.clear();
    touches.clear();
  });

  /** Wire the on-screen buttons (elements with data-button / data-command). */
  function bindTouch(root) {
    const release = (event) => {
      touches.delete(event.pointerId);
      refreshPressed(root);
    };
    root.addEventListener("pointerdown", (event) => {
      const target = event.target.closest("[data-button],[data-command]");
      if (!target) return;
      event.preventDefault();
      if (target.dataset.command) {
        onCommand(target.dataset.command);
        return;
      }
      root.setPointerCapture?.(event.pointerId);
      touches.set(event.pointerId, target.dataset.button);
      refreshPressed(root);
    });
    // slide a finger between the arrow buttons without lifting it
    root.addEventListener("pointermove", (event) => {
      if (!touches.has(event.pointerId)) return;
      const under = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-button]");
      if (under && under.dataset.button !== touches.get(event.pointerId)) {
        touches.set(event.pointerId, under.dataset.button);
        refreshPressed(root);
      }
    });
    root.addEventListener("pointerup", release);
    root.addEventListener("pointercancel", release);
    root.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  function refreshPressed(root) {
    const held = new Set(touches.values());
    root.querySelectorAll("[data-button]").forEach((el) => el.classList.toggle("pressed", held.has(el.dataset.button)));
  }

  function readGamepad(state) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    if (!pad) return;
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
    const axis = pad.axes[0] ?? 0;
    state.left ||= b(14) || axis < -0.4;
    state.right ||= b(15) || axis > 0.4;
    state.jump ||= b(0);
    state.shoot ||= b(2) || b(3);
    state.dash ||= b(1) || b(7) || b(6);
    const now = pad.buttons.map((x) => x.pressed);
    const pressed = (i) => now[i] && !padPrev[i];
    if (pressed(4)) onCommand("weapon-prev");
    if (pressed(5)) onCommand("weapon-next");
    if (pressed(9)) onCommand("pause");
    padPrev = now;
  }

  return {
    bindTouch,
    snapshot() {
      const state = Object.fromEntries(BUTTONS.map((name) => [name, keys.has(name)]));
      for (const button of touches.values()) state[button] = true;
      readGamepad(state);
      return state;
    },
    clear() {
      keys.clear();
    },
  };
}

/* Input: keyboard, gamepad, and touch, unified into named game actions.
 *
 * Actions:
 *   dir (repeating 4-way), drop, grab (held), rotate, swap, pause, music
 * game.js polls `held` and consumes queued one-shot actions each frame.
 */
'use strict';

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  Space: 'drop', KeyZ: 'drop', Enter: 'drop',
  ShiftLeft: 'grab', ShiftRight: 'grab', KeyX: 'grab',
  KeyC: 'magic', KeyR: 'reset',
  Escape: 'pause', KeyP: 'pause', KeyM: 'music',
};

class Input {
  constructor(canvas) {
    this.held = {};        // action -> bool
    this.queue = [];       // one-shot actions
    this.analog = null;    // {x, y, m} from the touch joystick's glide zone
    this.anyKey = false;
    this.padButtons = {};

    window.addEventListener('keydown', (e) => {
      // let form fields (the save-code textareas) receive keys untouched;
      // keyup stays global so a key released after refocusing still clears
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (!this.held[a]) {
          this.held[a] = true;
          this.press(a);
        }
      }
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.held[a] = false;
    });
    window.addEventListener('blur', () => { this.held = {}; });

    this.initTouch(canvas);
  }

  press(a) {
    if (['up', 'down', 'left', 'right'].includes(a)) {
      this.queue.push({ type: 'dir', dir: a });
    } else {
      this.queue.push({ type: a });
    }
  }

  /** Call once per frame. Movement is velocity-based off `held` (the game
   *  glides the cursor), so there is no key auto-repeat here anymore. */
  update(dt) {
    this.pollGamepad();
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected);
    if (!gp) return;
    const map = {
      0: 'drop',      // A / Cross
      1: 'grab',      // B / Circle (held)
      2: 'magic',     // X / Square
      3: 'reset',     // Y / Triangle
      9: 'pause',     // Start
      12: 'up', 13: 'down', 14: 'left', 15: 'right',
    };
    // analog stick as dpad
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const stick = { left: ax < -0.5, right: ax > 0.5, up: ay < -0.5, down: ay > 0.5 };

    for (const [btn, action] of Object.entries(map)) {
      let down = gp.buttons[btn] && gp.buttons[btn].pressed;
      if (['up', 'down', 'left', 'right'].includes(action)) down = down || stick[action];
      const key = 'pad' + action;
      if (down && !this.padButtons[key]) {
        this.held[action] = true;
        this.press(action);
        this.anyKey = true;
      } else if (!down && this.padButtons[key]) {
        this.held[action] = false;
      }
      this.padButtons[key] = down;
    }
  }

  initTouch(canvas) {
    // Dragging the sphere scrolls the cursor fast (one cell per ~34px).
    // All actions live on the TouchUI buttons — no tap-to-drop, so a
    // stray touch never costs a heart.
    let id = null, lastX = 0, lastY = 0;
    const opt = { passive: false };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.anyKey = true;
      const t = e.changedTouches[0];
      id = t.identifier; lastX = t.clientX; lastY = t.clientY;
    }, opt);
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = [...e.changedTouches].find(t => t.identifier === id);
      if (!t) return;
      const STEP = 34;
      while (t.clientX - lastX > STEP) { this.queue.push({ type: 'dir', dir: 'right' }); lastX += STEP; }
      while (lastX - t.clientX > STEP) { this.queue.push({ type: 'dir', dir: 'left' }); lastX -= STEP; }
      while (t.clientY - lastY > STEP) { this.queue.push({ type: 'dir', dir: 'down' }); lastY += STEP; }
      while (lastY - t.clientY > STEP) { this.queue.push({ type: 'dir', dir: 'up' }); lastY -= STEP; }
    }, opt);
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      id = null;
    }, opt);
  }

  /** Drain queued one-shot actions. */
  consume() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

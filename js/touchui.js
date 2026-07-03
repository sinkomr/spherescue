/* Touch control interface for phones and tablets.
 *
 * Two-thumb layout mirroring the controller: a virtual joystick on the
 * left, action cluster on the right (DROP primary, GRAB hold-button,
 * MAGIC / RESET contextual), pause in the corner. The sphere can also be
 * dragged directly to scroll the cursor fast.
 *
 * Joystick response is radial: a small pull steps exactly one cell (no
 * repeat until you return to center or change direction), pulling past
 * the tick ring glides — slow at the boundary, fast at the rim. The
 * glide is published as input.analog for game.updateMovement.
 */
'use strict';

function isTouchDevice() {
  const q = new URLSearchParams(location.search).get('touch');
  if (q === '1') return true;
  if (q === '0') return false;
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
         'ontouchstart' in window;
}

class TouchUI {
  constructor(input, renderer, audio) {
    this.input = input;
    this.enabled = isTouchDevice();
    if (!this.enabled) return;

    document.body.classList.add('touch');
    renderer.mobile = true;

    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.innerHTML = `
      <div id="tc-stick"><div id="tc-knob"></div></div>
      <div id="tc-actions">
        <button id="tc-magic" data-act="magic">✦<span>MAGIC</span></button>
        <button id="tc-reset" data-act="reset">↺<span>RESET</span></button>
        <button id="tc-grab" data-act="grab">✊<span>GRAB</span></button>
        <button id="tc-drop" data-act="drop">▼<span>DROP</span></button>
      </div>
      <button id="tc-pause" data-act="pause">❚❚</button>
    `;
    document.getElementById('wrap').appendChild(this.root);
    this.root.classList.add('hidden');

    this.initStick();
    // GRAB is a hold button, like holding Shift/B
    const grabBtn = this.root.querySelector('#tc-grab');
    this.bindHold(grabBtn,
      () => { input.held.grab = true; input.press('grab'); grabBtn.classList.add('on'); },
      () => { input.held.grab = false; grabBtn.classList.remove('on'); });
    // one-shot buttons
    for (const act of ['drop', 'magic', 'reset', 'pause']) {
      const b = this.root.querySelector(`[data-act="${act}"]`);
      this.bindHold(b, () => input.press(act), () => {});
    }
  }

  /** Virtual joystick. Deflection radius picks the response tier:
   *  dead zone -> nothing (and re-arms the step); step zone -> exactly one
   *  cell in the dominant direction; glide zone -> analog vector whose
   *  magnitude scales the game's movement speed. */
  initStick() {
    // tuning: zone boundaries as fractions of full deflection
    this.DEAD = 0.22;   // below: neutral, re-arms the discrete step
    this.GLIDE = 0.55;  // above: continuous movement, speed scales to the rim
    const stick = this.root.querySelector('#tc-stick');
    const knob = this.root.querySelector('#tc-knob');
    const input = this.input;
    let pid = null;
    let stepped = null; // dir already emitted for this excursion (null = armed)

    const setKnob = (x, y) => { knob.style.transform = `translate(${x}px, ${y}px)`; };

    const onMove = (e) => {
      if (e.pointerId !== pid) return;
      e.preventDefault();
      const rect = stick.getBoundingClientRect();
      const range = rect.width / 2 - 14; // px of travel to reach full deflection
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const r = Math.min(1, dist / range);
      if (dist > range) { dx *= range / dist; dy *= range / dist; }
      setKnob(dx, dy);

      const len = Math.min(dist, range) || 1; // |(dx,dy)| after the clamp
      if (r >= this.GLIDE) {
        // continuous: slow at the boundary, fast at the rim
        const m = (r - this.GLIDE) / (1 - this.GLIDE);
        input.analog = { x: dx / len, y: dy / len, m };
        stepped = 'glide'; // leaving glide back into the step zone shouldn't re-step
      } else {
        input.analog = null;
        if (r < this.DEAD) {
          stepped = null; // back to center: re-arm
        } else if (stepped !== 'glide') {
          // step zone: one cell in the dominant direction per excursion,
          // and again whenever the dominant direction changes
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
                                                  : (dy > 0 ? 'down' : 'up');
          if (stepped !== dir) { input.press(dir); stepped = dir; }
        }
      }
    };
    const reset = () => {
      pid = null;
      stepped = null;
      input.analog = null;
      stick.classList.remove('active');
      knob.style.transform = '';
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pid !== null) return;
      pid = e.pointerId;
      try { stick.setPointerCapture(pid); } catch (err) { /* synthetic events */ }
      stick.classList.add('active');
      input.anyKey = true;
      onMove(e);
    });
    stick.addEventListener('pointermove', onMove);
    stick.addEventListener('pointerup', (e) => { if (e.pointerId === pid) reset(); });
    stick.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) reset(); });
    stick.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Multi-touch-safe press/release binding (several buttons at once). */
  bindHold(el, onDown, onUp) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      el.classList.add('pressed');
      this.input.anyKey = true;
      onDown();
    });
    const release = (e) => {
      e.preventDefault();
      el.classList.remove('pressed');
      onUp();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Show/hide + contextual buttons; called once per frame. */
  update(game) {
    if (!this.enabled) return;
    const playing = game.state !== 'idle' && !game.paused;
    this.root.classList.toggle('hidden', !playing);
    if (!playing) { this.input.analog = null; return; }
    const puzzle = game.mode === 'puzzle';
    this.root.querySelector('#tc-magic').classList.toggle('hidden', puzzle);
    this.root.querySelector('#tc-reset').classList.toggle('hidden', !puzzle);
    const magicBtn = this.root.querySelector('#tc-magic');
    magicBtn.classList.toggle('charged', game.magicItem > 0);
  }
}

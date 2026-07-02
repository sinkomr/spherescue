/* Touch control interface for phones and tablets.
 *
 * Two-thumb layout mirroring the controller: a virtual D-pad on the left,
 * action cluster on the right (DROP primary, GRAB hold-button, MAGIC /
 * RESET contextual), pause in the corner. The sphere can also be dragged
 * directly to scroll the cursor fast. Buttons drive the same Input state
 * the keyboard uses, so key-repeat (DAS) and grab semantics are identical.
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
      <div id="tc-dpad">
        <button class="tc-dir" data-dir="up">▲</button>
        <button class="tc-dir" data-dir="left">◀</button>
        <button class="tc-dir" data-dir="right">▶</button>
        <button class="tc-dir" data-dir="down">▼</button>
      </div>
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

    // D-pad: press sets held state (Input's DAS handles auto-repeat)
    for (const b of this.root.querySelectorAll('.tc-dir')) {
      const dir = b.dataset.dir;
      this.bindHold(b,
        () => { if (!input.held[dir]) { input.held[dir] = true; input.press(dir); } },
        () => { input.held[dir] = false; });
    }
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
    if (!playing) return;
    const puzzle = game.mode === 'puzzle';
    this.root.querySelector('#tc-magic').classList.toggle('hidden', puzzle);
    this.root.querySelector('#tc-reset').classList.toggle('hidden', !puzzle);
    const magicBtn = this.root.querySelector('#tc-magic');
    magicBtn.classList.toggle('charged', game.magicItem > 0);
  }
}

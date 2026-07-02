/* Bootstrap: menus, mode selection, main loop. */
'use strict';

(function () {
  const canvas = document.getElementById('game');
  const renderer = new SphereRenderer(canvas);
  const input = new Input(canvas);
  const audio = new AudioEngine();
  const touchUI = new TouchUI(input, renderer, audio);
  const game = new Game(renderer, input, audio);

  const $ = (id) => document.getElementById(id);
  const overlays = ['menu', 'puzzle-select', 'fable-select', 'help', 'pause'];
  function show(id) {
    for (const o of overlays) $(o).classList.toggle('hidden', o !== id);
    if (id === null) for (const o of overlays) $(o).classList.add('hidden');
  }
  function hideAll() { for (const o of overlays) $(o).classList.add('hidden'); }

  // Audio requires a user gesture: hook the first interaction.
  const unlock = () => { audio.ensure(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });

  // Main menu
  $('main-menu').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    audio.ensure(); audio.sfx('menu');
    const mode = b.dataset.mode;
    if (mode === 'help') { show('help'); return; }
    if (mode === 'puzzle') { buildPuzzleGrid(); show('puzzle-select'); return; }
    if (mode === 'freefable') { buildFableGrid(); show('fable-select'); return; }
    hideAll();
    game.start(mode);
  });

  document.querySelectorAll('[data-back]').forEach(b =>
    b.addEventListener('click', () => { audio.sfx('menu'); show('menu'); }));

  $('pause').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    audio.sfx('menu');
    if ('resume' in b.dataset) { hideAll(); game.resume(); }
    if ('quit' in b.dataset) { game.quit(); show('menu'); }
  });

  function buildPuzzleGrid() {
    const grid = $('puzzle-grid');
    grid.innerHTML = '';
    const unlocked = game.progress.puzzleUnlocked;
    PUZZLES.forEach((p, i) => {
      const b = document.createElement('button');
      const done = game.progress.puzzleDone[i];
      b.innerHTML = `<span>${i + 1}</span><span class="stars">${done ? '★' : ''}</span>`;
      if (i > unlocked) {
        b.classList.add('locked');
      } else {
        b.addEventListener('click', () => {
          audio.sfx('menu');
          hideAll();
          game.start('puzzle', i);
        });
      }
      grid.appendChild(b);
    });
  }

  function buildFableGrid() {
    const grid = $('fable-grid');
    grid.innerHTML = '';
    const unlocked = game.progress.freeUnlocked;
    FREE_FABLE.forEach((cfg, i) => {
      const b = document.createElement('button');
      const done = game.progress.freeDone[i];
      const mark = done === true ? '★' : done === 'sealed' ? '⛓' : cfg.sealed ? '🔒' : '';
      b.innerHTML = `<span class="fname">${cfg.short}</span><span class="stars">${mark || cfg.year}</span>`;
      b.style.setProperty('--hue', cfg.hue);
      if (i > unlocked) {
        b.classList.add('locked');
      } else {
        b.addEventListener('click', () => {
          audio.sfx('menu');
          hideAll();
          game.start('freefable', i);
        });
      }
      grid.appendChild(b);
    });
  }

  game.onPause = () => show('pause');
  game.onQuitToMenu = (returnTo) => {
    if (returnTo === 'puzzle') { buildPuzzleGrid(); show('puzzle-select'); }
    else if (returnTo === 'freefable') { buildFableGrid(); show('fable-select'); }
    else show('menu');
  };

  window.__game = game; // debug/testing hook

  // Main loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    input.update(dt);
    audio.update();
    game.update(dt);
    game.render();
    touchUI.update(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

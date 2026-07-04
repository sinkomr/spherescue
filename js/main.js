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
  const overlays = ['menu', 'puzzle-select', 'fable-select', 'help', 'pause', 'save-menu'];
  function show(id) {
    for (const o of overlays) $(o).classList.toggle('hidden', o !== id);
    if (id === null) for (const o of overlays) $(o).classList.add('hidden');
  }
  function hideAll() { for (const o of overlays) $(o).classList.add('hidden'); }

  // Audio requires a user gesture: hook the first interaction.
  const unlock = () => { audio.ensure(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });

  // Difficulty cycles easy -> medium -> hard; only the speed timer changes.
  const DIFF_ORDER = ['easy', 'medium', 'hard'];
  function refreshDiffBtn() {
    $('diff-btn').textContent = 'DIFFICULTY: ' + game.progress.difficulty.toUpperCase();
  }
  $('diff-btn').addEventListener('click', () => {
    audio.ensure(); audio.sfx('menu');
    const i = DIFF_ORDER.indexOf(game.progress.difficulty);
    game.progress.difficulty = DIFF_ORDER[(i + 1) % DIFF_ORDER.length];
    game.saveProgress();
    refreshDiffBtn();
  });
  refreshDiffBtn();

  // Main menu
  $('main-menu').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'diff-btn') return; // handled above
    audio.ensure(); audio.sfx('menu');
    const mode = b.dataset.mode;
    if (mode === 'help') { show('help'); return; }
    if (mode === 'save') {
      $('save-out').value = game.exportCode();
      $('save-in').value = '';
      $('save-status').textContent = '';
      show('save-menu');
      return;
    }
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
      const best = game.progress.puzzleBest[i];
      const mark = done ? (best && best.pieces !== undefined ? `★${best.pieces}` : '★') : '';
      b.innerHTML = `<span>${i + 1}</span><span class="stars">${mark}</span>`;
      if (best) b.title = `Best: ${(best.score || 0).toLocaleString()} pts · ${best.pieces} piece${best.pieces === 1 ? '' : 's'}`;
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
      const best = game.progress.freeBest[i];
      let mark = done === true ? '★' : done === 'sealed' ? '⛓' : cfg.sealed ? '🔒' : '';
      const diff = best && best.diff ? best.diff : 'medium';
      if (done === true && best && best.pieces !== undefined) mark = `★ ${best.pieces}p·${diff[0].toUpperCase()}`;
      b.innerHTML = `<span class="fname">${cfg.short}</span><span class="stars">${mark || cfg.year}</span>`;
      if (best) b.title = `Best: ${(best.score || 0).toLocaleString()} pts · ${best.pieces} pieces · on ${diff.toUpperCase()}`;
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

  $('copy-code').addEventListener('click', async () => {
    audio.sfx('menu');
    const code = $('save-out').value;
    try {
      await navigator.clipboard.writeText(code);
      $('save-status').textContent = 'Copied to clipboard!';
    } catch (e) {
      $('save-out').select();
      document.execCommand('copy');
      $('save-status').textContent = 'Copied (select + ctrl-C if not).';
    }
  });
  $('load-code').addEventListener('click', () => {
    audio.sfx('menu');
    const err = game.importCode($('save-in').value);
    if (err) {
      $('save-status').textContent = err;
      $('save-status').style.color = '#e8736f';
    } else {
      $('save-status').textContent = 'Progress restored! (merged with your best)';
      $('save-status').style.color = '#43e5c5';
      $('save-out').value = game.exportCode();
      refreshDiffBtn(); // the imported code may carry a difficulty setting
    }
  });

  $('menu-btn').addEventListener('click', () => {
    audio.sfx('menu');
    input.press('pause');
  });

  game.onPause = () => show('pause');
  game.onResume = () => hideAll();
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

/* Game modes, rules, and HUD — the gameplay layer above engine/render.
 *
 * Faithful rule set (see README for sources):
 *  - The held piece hovers at the cursor; there is no gravity on it.
 *  - A drop must join >=2 like pieces (a combo) or it's a wasted drop:
 *    lose a heart, X-Count resets, held magic is destroyed.
 *  - Hold grab over a like-shaped piece to drag it. Slides plow crystals,
 *    stop at real pieces; pieces that lose support fall, and a fallen
 *    piece landing against 2+ like pieces clears for free (gravity combo).
 *  - Speed meter (blue->yellow->red) zooms the camera in; when it hits the
 *    sphere your piece is force-dropped.
 *  - Clears of <=19 pieces rain that many sparks, turning pieces into
 *    glowing power pieces (1000 pts, X-Count fuel, big timer refill).
 *    20+ clears grant/upgrade a magic item instead.
 *  - Wild "?" pieces morph through every shape; drop when yours shows.
 *  - Puzzle mode: fixed layout, budgeted drags+drops, every piece wild,
 *    no timer/hearts, clear everything, R resets.
 */
'use strict';

const MAGIC_ITEMS = [null, 'FIRECRACKER', 'DYNAMITE', 'MAGNET', 'ATOM', 'BOMB', 'RAY GUN'];
const MAGIC_METER_MAX = 14;
const SCORE_CAP = { normal: 900, power: 10000 };
const CLEAR_ANIM = 0.25; // per-piece shatter time once its turn in the chain comes

class Game {
  constructor(renderer, input, audio) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.particles = new Particles();
    this.state = 'idle'; // idle | play | win | lose | done
    this.paused = false;
    this.onPause = () => {};
    this.onQuitToMenu = () => {};
    this.progress = this.loadProgress();
    this.msgTimer = 0;
    this.$ = (id) => document.getElementById(id);
  }

  loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem('sphererescue') || '{}');
      return {
        rescueLevel: p.rescueLevel || 1,
        puzzleUnlocked: p.puzzleUnlocked || 0, puzzleDone: p.puzzleDone || [],
        freeUnlocked: p.freeUnlocked || 0, freeDone: p.freeDone || [],
        highScore: p.highScore || 0,
      };
    } catch (e) {
      return { rescueLevel: 1, puzzleUnlocked: 0, puzzleDone: [], freeUnlocked: 0, freeDone: [], highScore: 0 };
    }
  }
  saveProgress() {
    try { localStorage.setItem('sphererescue', JSON.stringify(this.progress)); } catch (e) { /* private mode */ }
  }

  /* ---------------- lifecycle ---------------- */

  start(mode, arg = 0) {
    this.mode = mode;
    this.puzzleIndex = arg;
    this.score = 0;
    this.xcount = 0;
    this.magicItem = 0;
    this.magicMeter = 0;
    this.wildT = 0;
    this.comboFlash = 0;
    this.timeLeft = mode === 'timetrial' ? 300 : 0;
    this.setupLevel();
    this.state = 'play';
    this.paused = false;
    this.$('hud').classList.remove('hidden');
    this.setMsg('');
  }

  setupLevel() {
    this.board = new Board();
    this.grabbed = null;
    this.clearing = [];
    this.hearts = 3;
    this.puzzleTotal = null;
    this.snapTarget = null;
    this.dragPos = null;
    this._lastCell = null;

    if (this.mode === 'puzzle') {
      const cfg = PUZZLES[this.puzzleIndex];
      this.levelCfg = { types: REAL_SHAPES, wildChance: 1, speedMax: 0, sectionsRequired: 0 };
      loadPuzzle(this.board, cfg);
      this.drags = cfg.drags;
      this.drops = cfg.drops;
      this.cursor = { u: cfg.cursor ? cfg.cursor[0] : 16, v: cfg.cursor ? cfg.cursor[1] : 16 };
    } else if (this.mode === 'freefable') {
      const cfg = FREE_FABLE[this.puzzleIndex];
      this.freeCfg = cfg;
      this.levelCfg = {
        types: cfg.types, wildChance: cfg.wild || 0.06, speedMax: cfg.speedMax,
        sectionsRequired: cfg.sections, sealed: !!cfg.sealed, bias: cfg.bias,
      };
      buildFreeBoard(this.board, cfg);
      this.cursor = { u: 16, v: 16 };
    } else {
      const lvl = this.mode === 'timetrial' ? 5 : this.progress.rescueLevel;
      this.levelCfg = rescueLevelCfg(lvl);
      generateSphere(this.board, this.levelCfg);
      this.cursor = { u: 16, v: 16 };
    }
    this.sectionsPrev = this.board.exposedSections();
    this.sectionsBase = this.sectionsPrev; // pre-exposed sections don't count
    this.speed = this.levelCfg.speedMax;
    this.queue = [];
    this.heldType = null;
    this.spawnPiece();
    this.spawnPiece();
    this.spawnPiece();
    this.renderer.camU = this.cursor.u;
    this.renderer.camV = this.cursor.v;
    this.renderer.zoom = 1;
    this.updateHud(true);
  }

  /** Queue draws gently favor types with playable surface presence, like a
   *  modern bag randomizer — kills "dead piece" draws without feeling rigged. */
  pickType() {
    const cfg = this.levelCfg;
    if (Math.random() < cfg.wildChance) return 'WILD';
    if (Math.random() < (cfg.bias || 0.75)) {
      const live = this.board.liveTypes(cfg.types);
      if (live.length) return live[(Math.random() * live.length) | 0];
    }
    return cfg.types[(Math.random() * cfg.types.length) | 0];
  }

  spawnPiece() {
    while (this.queue.length < 3) this.queue.push(this.pickType());
    this.heldType = this.queue.shift();
    this.queue.push(this.pickType());
  }

  /** Shape the held piece currently presents (wild morphs through all). */
  heldShape() {
    if (this.heldType !== 'WILD') return this.heldType;
    return REAL_SHAPES[Math.floor(this.wildT * 1.6) % REAL_SHAPES.length];
  }

  resume() { this.paused = false; }
  quit() {
    this.state = 'idle';
    this.paused = false;
    this.$('hud').classList.add('hidden');
  }

  /* ---------------- input handling ---------------- */

  handleActions() {
    for (const a of this.input.consume()) {
      if (a.type === 'music') {
        const on = this.audio.toggleMusic();
        this.toast(on ? 'MUSIC ON' : 'MUSIC OFF');
        continue;
      }
      if (a.type === 'pause') {
        if (this.state === 'play' && !this.paused) { this.paused = true; this.onPause(); }
        continue;
      }
      if (this.paused) continue;

      if (this.state === 'lose' && (a.type === 'drop' || a.type === 'reset')) {
        this.setupLevel();
        this.state = 'play';
        this.setMsg('');
        continue;
      }
      if (this.state !== 'play') continue;

      switch (a.type) {
        case 'dir': this.handleDir(a.dir); break;
        case 'drop': this.drop(); break;
        case 'grab': this.tryGrab(); break;
        case 'magic': this.fireMagic(); break;
        case 'reset':
          if (this.mode === 'puzzle') { this.audio.sfx('menu'); this.setupLevel(); this.setMsg(''); }
          break;
      }
    }
    // release the grabbed piece when the button is let go or it vanished
    if (this.grabbed && (!this.input.held.grab || this.grabbed.state !== 'resting')) this.grabbed = null;
  }

  handleDir(dir) {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    if (this.grabbed) {
      // a tap always drags exactly one cell (holding glides via updateMovement)
      this.slideStep(this.grabbed, d[0], d[1]);
    } else {
      // a tap moves exactly one cell instantly (crisp); holding glides
      // continuously via updateMovement at the measured speed
      this.cursor.u = mod(Math.round(this.cursor.u) + d[0], this.board.W);
      this.cursor.v = mod(Math.round(this.cursor.v) + d[1], this.board.H);
      this.audio.sfx('move');
      if (this.input.held.grab) this.tryGrab();
    }
  }

  /** Smooth glide movement, matching the original's measured feel:
   *  cursor scrolls at ~3.5 cells/s, drags at ~2.8 cells/s. The logical
   *  grid cell is always round(cursor); drags step the grid whenever the
   *  float position crosses a cell boundary. */
  updateMovement(dt) {
    const b = this.board;
    const held = this.input.held;
    const dx = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const dy = (held.down ? 1 : 0) - (held.up ? 1 : 0);

    if (this.grabbed) {
      const p = this.grabbed;
      if (!this.dragPos) this.dragPos = { u: p.u, v: p.v };
      if (dx || dy) {
        const n = Math.hypot(dx, dy);
        this.dragPos.u += (dx / n) * 3.4 * dt;
        this.dragPos.v += (dy / n) * 3.4 * dt;
      } else {
        // ease back onto the piece's cell
        this.dragPos.u += (p.u - this.dragPos.u) * Math.min(1, dt * 12);
        this.dragPos.v += (p.v - this.dragPos.v) * Math.min(1, dt * 12);
      }
      // crossing a boundary performs a real grid step (plow/block rules)
      let guard = 0;
      while (guard++ < 4) {
        const du = Math.round(this.dragPos.u) - p.u;
        const dv = Math.round(this.dragPos.v) - p.v;
        if (du !== 0) {
          if (!this.slideStep(p, Math.sign(du), 0, true)) { this.dragPos.u = p.u; break; }
        } else if (dv !== 0) {
          if (!this.slideStep(p, 0, Math.sign(dv), true)) { this.dragPos.v = p.v; break; }
        } else break;
        if (this.grabbed !== p) break; // cleared or dropped mid-drag
      }
      if (this.grabbed === p) {
        this.cursor.u = this.dragPos.u;
        this.cursor.v = this.dragPos.v;
      }
      return;
    }
    this.dragPos = null;

    if (dx || dy) {
      const n = Math.hypot(dx, dy);
      this.cursor.u = mod(this.cursor.u + (dx / n) * 3.5 * dt, b.W);
      this.cursor.v = mod(this.cursor.v + (dy / n) * 3.5 * dt, b.H);
    } else {
      // idle: settle onto the nearest cell center
      const tu = Math.round(this.cursor.u), tv = Math.round(this.cursor.v);
      this.cursor.u += (tu - this.cursor.u) * Math.min(1, dt * 10);
      this.cursor.v += (tv - this.cursor.v) * Math.min(1, dt * 10);
    }
    // blip when the logical cell changes
    const cell = Math.round(this.cursor.u) + ',' + Math.round(this.cursor.v);
    if (cell !== this._lastCell) {
      this._lastCell = cell;
      this.audio.sfx('move');
      if (this.input.held.grab && !this.grabbed) this.tryGrab();
    }
  }

  /** Grab the like-shaped piece under the cursor (or forge a power piece
   *  from a crystal formation matching the held shape). */
  tryGrab() {
    if (this.grabbed) return;
    const u = Math.round(this.cursor.u), v = Math.round(this.cursor.v);
    const shape = this.heldShape();

    // crystal formation exactly matching the held shape -> power piece
    // (no power-ups in puzzle mode)
    const cells = SHAPES[shape].cells;
    let allCrystal = this.mode !== 'puzzle', z0 = -1;
    for (const [du, dv] of cells) {
      const p = this.board.topPiece(u + du, v + dv);
      if (!p || !p.crystal || p.state !== 'resting') { allCrystal = false; break; }
      if (z0 === -1) z0 = p.z; else if (p.z !== z0) { allCrystal = false; break; }
    }
    if (allCrystal && z0 >= 0 && !(this.levelCfg.sealed && z0 === 0)) {
      for (const [du, dv] of cells) this.board.removePiece(this.board.topPiece(u + du, v + dv));
      const np = new Piece(shape, u, v, z0);
      np.power = true;
      this.board.addPiece(np);
      this.grabbed = np;
      this.dragPos = { u: np.u, v: np.v };
      this.addScore(1000, false);
      this.audio.sfx('magic');
      this.toast('POWER PIECE!');
      return;
    }

    const p = this.board.topPiece(u, v);
    if (!p || p.crystal || p.state !== 'resting') return;
    // must be fully on top (nothing above any of its cells)
    for (const [cu, cv] of p.cells(this.board.W, this.board.H)) {
      if (this.board.at(cu, cv, p.z + 1)) return;
    }
    if (this.heldType !== 'WILD' && p.type !== this.heldType) { this.audio.sfx('bad'); return; }
    this.grabbed = p;
    this.dragPos = { u: p.u, v: p.v };
    this.audio.sfx('slide');
  }

  /** One slide step of the grabbed piece. Returns true if it moved. */
  slideStep(piece, du, dv, quiet = false) {
    const b = this.board;
    if (this.mode === 'puzzle' && this.drags <= 0) {
      if (!quiet) { this.audio.sfx('bad'); this.toast('NO DRAGS LEFT'); }
      return false;
    }

    // plow through crystals
    for (const c of b.crystalsInPath(piece, du, dv)) {
      b.removePiece(c);
      this.spawnBurstAt(c, '#9aa4b8', 6);
    }
    let movedUp = false;
    if (!b.slide(piece, du, dv)) {
      // power pieces may climb one layer onto the blocker
      if (piece.power && piece.z + 1 < b.occ.length &&
          b.fits(piece, piece.u + du, piece.v + dv, piece.z + 1)) {
        b.moveTo(piece, piece.u + du, piece.v + dv, piece.z + 1);
        movedUp = true;
      } else {
        if (!quiet) this.audio.sfx('bad');
        return false;
      }
    }
    if (this.mode === 'puzzle') this.drags--;
    this.audio.sfx('slide');
    this.cursor.u = mod(piece.u, b.W);
    this.cursor.v = mod(piece.v, b.H);
    if (this.grabbed === piece) this.dragPos = { u: piece.u, v: piece.v };

    // gravity: the slid piece (or pieces it was supporting) may fall
    const moved = b.settle();
    if (!movedUp && !moved.has(piece) && piece.z > 0 && !b.supported(piece, piece.u, piece.v, piece.z)) moved.add(piece);
    let any = false;
    for (const m of moved) any = this.checkGravityCombo(m) || any;
    if (!any && moved.size) this.audio.sfx('land');
    this.updateHud();
    this.checkPuzzleStuck();
    return true;
  }

  /** A fallen piece clearing against 2+ like pieces — free clear. */
  checkGravityCombo(piece) {
    if (piece.crystal || piece.state !== 'resting') return false;
    const group = this.board.matchGroup(piece);
    if (group.length >= RULES.matchMin) {
      this.beginClear(group, 'gravity');
      return true;
    }
    return false;
  }

  drop() {
    if (this.mode === 'puzzle' && this.drops <= 0) { this.audio.sfx('bad'); this.toast('NO DROPS LEFT'); return; }
    const b = this.board;
    const shape = this.heldShape();
    const probe = new Piece(shape, Math.round(this.cursor.u), Math.round(this.cursor.v), 0);

    if (!b.fits(probe, probe.u, probe.v, b.occ.length - 1)) {
      // column full to the cap: illegal placement
      this.wastedDrop(false);
      return;
    }
    probe.z = b.dropZ(probe, probe.u, probe.v);
    b.addPiece(probe);
    this.audio.sfx('drop');
    if (this.mode === 'puzzle') this.drops--;
    this.speed = this.levelCfg.speedMax;
    this.renderer.zoom = 1;

    const group = b.matchGroup(probe);
    if (group.length >= RULES.matchMin) {
      this.beginClear(group, 'drop');
    } else if (this.mode !== 'puzzle') {
      this.wastedDrop(true);
    } else {
      this.audio.sfx('land');
    }
    this.spawnPiece();
    this.updateHud();
    this.checkPuzzleStuck();
  }

  wastedDrop(placed) {
    this.audio.sfx('bad');
    this.xcount = 0;
    if (this.magicItem > 0) { this.magicItem = 0; this.toast('MAGIC LOST'); }
    this.speed = this.levelCfg.speedMax;
    this.renderer.zoom = 1;
    if (this.mode === 'puzzle') return;
    this.hearts--;
    this.toast(placed ? 'WASTED DROP!' : 'NO ROOM!');
    this.shake = 0.35;
    if (this.hearts <= 0) this.doLose();
    this.updateHud();
  }

  /* ---------------- clears ---------------- */

  beginClear(group, kind) {
    const b = this.board;
    const crystals = b.adjacentCrystals(group);
    let powerCount = 0;
    for (const p of group) if (p.power) powerCount++;

    if (kind === 'gravity') this.xcount = Math.min(10, this.xcount + 1);
    this.xcount = Math.min(10, this.xcount + powerCount);

    let pts = 0;
    const mult = Math.max(1, this.xcount);
    for (const p of group) {
      pts += Math.min(p.power ? 1000 * mult : 100 * mult, p.power ? SCORE_CAP.power : SCORE_CAP.normal);
    }
    this.addScore(pts, true);

    // The chain rolls piece by piece like the original (~200ms apart),
    // spreading outward from the triggering piece. Pieces flash white
    // while queued, then shatter in turn. The board stays interactive.
    const seed = group[0];
    const order = [...group].sort((a, b) => {
      const da = Math.abs(mod(a.u - seed.u + this.board.W / 2, this.board.W) - this.board.W / 2) +
                 Math.abs(mod(a.v - seed.v + this.board.H / 2, this.board.H) - this.board.H / 2);
      const db = Math.abs(mod(b.u - seed.u + this.board.W / 2, this.board.W) - this.board.W / 2) +
                 Math.abs(mod(b.v - seed.v + this.board.H / 2, this.board.H) - this.board.H / 2);
      return da - db;
    });
    order.forEach((p, i) => {
      p.state = 'clearing';
      p.clearT = 0;
      // the landed piece "solidifies" for a beat before the chain rolls
      p.clearDelay = 0.12 + i * 0.2;
      p.sparkCredit = false;
    });
    for (const c of crystals) {
      c.state = 'clearing';
      c.clearT = 0;
      c.clearDelay = order.length * 0.2; // crystals shatter at the end
      c.sparkCredit = false;
    }
    // only real pieces count toward spark/magic totals
    order[0].sparkCredit = true;
    order[0].sparkCount = group.length;

    this.clearing.push(...order, ...crystals);

    // magic economy
    if (group.length >= 20) {
      this.earnMagic();
    } else {
      this.magicMeter += (kind === 'gravity' ? 3 : 0) + (group.length >= 6 ? 1 : 0);
      if (this.magicMeter >= MAGIC_METER_MAX) { this.magicMeter = 0; this.earnMagic(); }
    }
    if (powerCount > 0 || kind !== 'gravity') this.speed = this.levelCfg.speedMax;

    this.comboFlash = 1;
    this.audio.sfx(kind === 'gravity' ? 'combo' : 'clear', Math.min(group.length, 8));
    if (kind === 'gravity') this.toast('GRAVITY COMBO!');
    this.updateHud();
  }

  earnMagic() {
    if (this.magicItem < MAGIC_ITEMS.length - 1) this.magicItem++;
    this.audio.sfx('magic');
    this.toast(MAGIC_ITEMS[this.magicItem] + '!');
  }

  updateClears(dt) {
    if (!this.clearing.length) return;
    const done = (p) => p.clearT >= (p.clearDelay || 0) + CLEAR_ANIM;
    let finished = [];
    for (const p of this.clearing) {
      const was = p.clearT;
      p.clearT += dt;
      // pop sound + debris the moment each piece starts shattering
      if (was < (p.clearDelay || 0) && p.clearT >= (p.clearDelay || 0) && !p.crystal) {
        this.audio.sfx('move');
        this.spawnBurstAt(p, SHAPE_COLORS[p.type].top, 8);
      }
      if (done(p)) finished.push(p);
    }
    if (!finished.length) return;
    this.clearing = this.clearing.filter(p => !done(p));

    const b = this.board;
    let sparkTotal = 0;
    for (const p of finished) {
      if (p.sparkCredit) sparkTotal += Math.min(p.sparkCount, 19);
      b.removePiece(p);
    }
    // sparks fall: convert random pieces into power pieces
    if (this.mode !== 'puzzle' && sparkTotal > 0) {
      const candidates = [...b.pieces.values()].filter(p => !p.crystal && !p.power && p.state === 'resting');
      for (let i = 0; i < sparkTotal && candidates.length; i++) {
        const j = (Math.random() * candidates.length) | 0;
        candidates[j].power = true;
        candidates.splice(j, 1);
      }
    }
    // settle and cascade gravity combos
    const moved = b.settle();
    for (const m of moved) this.checkGravityCombo(m);

    // newly exposed core sections (not a goal in puzzle mode)
    const sections = b.exposedSections();
    if (sections > this.sectionsPrev && this.mode !== 'puzzle') {
      const gained = sections - this.sectionsPrev;
      this.addScore(gained * (this.mode === 'timetrial' ? 3000 : 1000), false);
      // Free Fable: the freed energy mends you — sections restore hearts
      if (this.mode === 'freefable' && this.hearts < 3) {
        this.hearts = Math.min(3, this.hearts + gained);
        this.toast('CORE EXPOSED! ♥ RESTORED');
      } else {
        this.toast('CORE EXPOSED!');
      }
      this.audio.sfx('win');
    }
    this.sectionsPrev = sections;
    this.updateHud();
    this.checkWin();
  }

  /* ---------------- magic items ---------------- */

  fireMagic() {
    if (this.mode === 'puzzle' || this.magicItem === 0 || this.state !== 'play') return;
    const b = this.board, { u, v } = this.cursor;
    const kill = new Set();
    const killTop = (radius) => {
      for (let dv = -radius; dv <= radius; dv++)
        for (let du = -radius; du <= radius; du++) {
          const p = b.topPiece(u + du, v + dv);
          if (p && p.state === 'resting') kill.add(p);
        }
    };
    switch (this.magicItem) {
      case 1: killTop(0); break;                                   // firecracker
      case 2: killTop(1); break;                                   // dynamite
      case 3: killTop(3); break;                                   // magnet
      case 4: {                                                    // atom: peel top layer
        let zmax = 0;
        for (const p of b.pieces.values()) if (p.state === 'resting') zmax = Math.max(zmax, p.z);
        for (const p of b.pieces.values()) if (p.state === 'resting' && p.z === zmax) kill.add(p);
        break;
      }
      case 5: {                                                    // bomb: big blast, all layers
        for (const p of b.pieces.values()) {
          if (p.state !== 'resting') continue;
          const du = Math.abs(mod(p.u - u + b.W / 2, b.W) - b.W / 2);
          const dv = Math.abs(mod(p.v - v + b.H / 2, b.H) - b.H / 2);
          if (du * du + dv * dv <= 36) kill.add(p);
        }
        break;
      }
      case 6: {                                                    // ray gun: to the core
        for (let dv = -1; dv <= 1; dv++)
          for (let du = -1; du <= 1; du++)
            for (let z = 0; z < b.occ.length; z++) {
              const p = b.pieceAt(u + du, v + dv, z);
              if (p && p.state === 'resting') kill.add(p);
            }
        break;
      }
    }
    this.magicItem = 0;
    if (this.levelCfg.sealed) {
      // magic fizzles against the shell around the core
      for (const p of [...kill]) if (p.z === 0) kill.delete(p);
    }
    if (!kill.size) { this.updateHud(); return; }
    this.audio.sfx('magic');
    this.toast('MAGIC!');
    let mi = 0;
    for (const p of kill) {
      p.state = 'clearing';
      p.clearT = 0;
      p.clearDelay = (mi++) * 0.04; // magic rips through fast
      p.sparkCredit = false;
    }
    this.clearing.push(...kill);
    this.shake = 0.3;
    this.updateHud();
  }

  /* ---------------- win / lose ---------------- */

  checkWin() {
    if (this.state !== 'play') return;
    if (this.mode === 'puzzle') {
      if (this.board.realPieceCount() === 0) {
        this.state = 'win';
        this.winT = 0;
        this.audio.sfx('win');
        this.setMsg('SOLVED!');
        this.progress.puzzleDone[this.puzzleIndex] = true;
        this.progress.puzzleUnlocked = Math.max(this.progress.puzzleUnlocked, this.puzzleIndex + 1);
        this.saveProgress();
      }
      return;
    }
    const need = this.levelCfg.sectionsRequired;
    if (this.sectionsPrev - this.sectionsBase >= need) {
      this.state = 'win';
      this.winT = 0;
      this.audio.sfx('win');
      if (this.mode === 'freefable') {
        const cfg = this.freeCfg;
        this.setMsg(`${cfg.short} FREED!`);
        this.addScore(5000 + this.hearts * 2000, false);
        this.progress.freeDone[this.puzzleIndex] = true;
        this.progress.freeUnlocked = Math.max(this.progress.freeUnlocked, this.puzzleIndex + 1);
        this.saveProgress();
      } else if (this.mode === 'rescue') {
        this.setMsg('RESCUED!');
        this.addScore(5000 + this.hearts * 2000, false);
        this.progress.rescueLevel++;
        this.saveProgress();
      } else {
        this.setMsg('CORE FREED! +BONUS');
        this.addScore(10000, false);
      }
    }
  }

  /** Puzzle soft-fail: no moves left but pieces remain. */
  checkPuzzleStuck() {
    if (this.mode !== 'puzzle' || this.state !== 'play') return;
    if (this.board.realPieceCount() > 0 && this.drops <= 0 && this.drags <= 0 && !this.clearing.length) {
      this.setMsg('OUT OF MOVES — PRESS R');
    }
  }

  doLose() {
    this.state = 'lose';
    this.audio.sfx('lose');
    this.setMsg(this.mode === 'timetrial' ? 'TIME UP!' : 'SPHERE LOST — SPACE TO RETRY');
    if (this.score > this.progress.highScore) {
      this.progress.highScore = this.score;
      this.saveProgress();
    }
  }

  /* ---------------- update / render ---------------- */

  update(dt) {
    if (this.state === 'idle') {
      // attract mode: slow drift on the menu backdrop
      this.renderer.time += dt;
      return;
    }
    this.handleActions();
    if (this.paused) return;

    this.renderer.time += dt;
    this.wildT += dt;
    this.particles.update(dt);
    this.comboFlash = Math.max(0, this.comboFlash - dt * 2);
    if (this.shake) this.shake = Math.max(0, this.shake - dt);
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.setMsg('');
    }

    this.updateClears(dt);

    if (this.state === 'play') {
      this.updateMovement(dt);
      // speed meter runs only in timed modes and only while nothing clears
      if (this.mode !== 'puzzle' && !this.clearing.length) {
        this.speed -= dt;
        const f = this.speed / this.levelCfg.speedMax;
        this.renderer.zoom = f > 0.5 ? 1 : 1 + (0.5 - f) * 0.7;
        if (this.speed <= 0) {
          this.toast('TOO SLOW!');
          this.drop(); // force-drop wherever the piece is
        }
      }
      if (this.mode === 'timetrial') {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) { this.timeLeft = 0; this.doLose(); }
      }
    } else if (this.state === 'win') {
      this.winT += dt;
      this.renderer.zoom = 1;
      if (this.mode === 'freefable') {
        // celebratory fireworks while the freed bot rises
        if (Math.random() < dt * 5) {
          this.particles.burst(
            this.renderer.cx + (Math.random() - 0.5) * this.renderer.R * 1.6,
            this.renderer.cy + (Math.random() - 0.5) * this.renderer.R * 1.2,
            this.freeCfg.hue, 12, 150);
        }
        if (this.winT > 5.2) {
          this.state = 'idle';
          this.$('hud').classList.add('hidden');
          this.onQuitToMenu('freefable');
        }
      } else if (this.winT > 2.4) {
        if (this.mode === 'rescue' || this.mode === 'timetrial') {
          this.setupLevel();
          this.state = 'play';
          this.setMsg('');
        } else {
          this.state = 'idle';
          this.$('hud').classList.add('hidden');
          this.onQuitToMenu('puzzle');
        }
      }
    } else if (this.state === 'sealed') {
      this.winT += dt;
      if (this.winT > 5) {
        this.state = 'idle';
        this.$('hud').classList.add('hidden');
        this.onQuitToMenu('freefable');
      }
    }

    // the Mythos level: everything clearable is gone, the shell remains
    if (this.state === 'play' && this.levelCfg.sealed &&
        !this.clearing.length && this.board.realPieceCount() === 0) {
      this.state = 'sealed';
      this.winT = 0;
      this.audio.sfx('lose');
      this.setMsg('THE SEAL HOLDS — MYTHOS 5 SLEEPS ON');
      if (this.progress.freeDone[this.puzzleIndex] !== true) {
        this.progress.freeDone[this.puzzleIndex] = 'sealed';
        this.saveProgress();
      }
    }

    // camera hugs the cursor tightly (fast lerp smooths instant tap steps)
    const r = this.renderer, b = this.board;
    const cdu = mod(this.cursor.u - r.camU + b.W / 2, b.W) - b.W / 2;
    const cdv = mod(this.cursor.v - r.camV + b.H / 2, b.H) - b.H / 2;
    r.camU = mod(r.camU + cdu * Math.min(1, dt * 14), b.W);
    r.camV = mod(r.camV + cdv * Math.min(1, dt * 14), b.H);
    this.updateHudMeters();
  }

  render() {
    if (this.state === 'idle') {
      // menu backdrop: bare core slowly turning
      if (!this.menuBoard) {
        this.menuBoard = new Board();
        generateSphere(this.menuBoard, rescueLevelCfg(3));
      }
      this.renderer.camU += 0.01;
      this.renderer.zoom = 1;
      this.renderer.render(this.menuBoard, {});
      return;
    }
    const b = this.board;
    const held = new Piece(this.heldShape(), Math.round(this.cursor.u), Math.round(this.cursor.v), 0);
    let landZ = b.occ.length, valid = false;
    if (b.fits(held, held.u, held.v, b.occ.length - 1)) {
      landZ = b.dropZ(held, held.u, held.v);
      held.z = landZ;
      b.addPiece(held);
      valid = b.matchGroup(held).length >= RULES.matchMin;
      b.removePiece(held);
    }
    // fractional drag offset so the grabbed piece renders mid-glide
    let dragDu = 0, dragDv = 0;
    if (this.grabbed && this.dragPos) {
      dragDu = mod(this.dragPos.u - this.grabbed.u + b.W / 2, b.W) - b.W / 2;
      dragDv = mod(this.dragPos.v - this.grabbed.v + b.H / 2, b.H) - b.H / 2;
    }
    this.renderer.render(b, {
      ghost: this.state === 'play' ? held : null,
      wild: this.heldType === 'WILD',
      landZ,
      valid,
      fx: { grabbedId: this.grabbed ? this.grabbed.id : 0, dragDu, dragDv },
      particles: this.particles,
      shake: this.shake || 0,
      coreGhost: this.mode === 'freefable' && this.levelCfg.sealed,
      coreRobot: this.mode === 'rescue' || (this.mode === 'freefable' && !this.levelCfg.sealed),
    });
    if (this.state === 'win' && this.mode === 'freefable') this.drawRelease();
    this.drawNextPreview();
  }

  /** The freed model-bot rises out of the core and hovers. */
  drawRelease() {
    const ctx = this.renderer.ctx, cfg = this.freeCfg;
    const R = this.renderer.R, cx = this.renderer.cx, cy = this.renderer.cy;
    const t = this.winT;
    const rise = Math.min(1, t / 1.8);
    const ease = 1 - Math.pow(1 - rise, 3);
    const y = cy + R * 0.15 - ease * R * 0.75;
    const size = R * ({ instant: 0.11, haiku: 0.12, classic: 0.13, sonnet: 0.14, sonnet5: 0.15, opus: 0.17, fable: 0.2 }[cfg.family] || 0.14);
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / 0.4);
    drawRobot(ctx, cx, y, size, t, cfg);
    // name plate
    ctx.font = `bold ${Math.max(15, R * 0.075)}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(cfg.name, cx + 2, y + size * 2.4 + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cfg.name, cx, y + size * 2.4);
    ctx.font = `${Math.max(11, R * 0.045)}px 'Trebuchet MS', sans-serif`;
    ctx.fillStyle = cfg.hue;
    ctx.fillText(`class of ${cfg.year}`, cx, y + size * 2.4 + Math.max(15, R * 0.06));
    ctx.restore();
  }

  /* ---------------- HUD ---------------- */

  spawnBurstAt(piece, color, n) {
    const b = this.board, r = this.renderer;
    const du = mod(piece.u - r.camU + b.W / 2, b.W) - b.W / 2;
    const dv = mod(piece.v - r.camV + b.H / 2, b.H) - b.H / 2;
    const pr = r.project(du, dv, piece.z + 1);
    if (pr.depth > 0.1) this.particles.burst(pr.x, pr.y, color, n);
  }

  addScore(pts, fromClear) {
    this.score += pts;
    if (fromClear && this.xcount > 1) this.toastScore(`${pts} x${this.xcount}`);
  }

  toast(str) {
    if (this.state !== 'play') return; // never stomp win/lose messages
    this.setMsg(str);
    this.msgTimer = 1.4;
  }
  toastScore(str) {
    this.particles.text(this.renderer.cx, this.renderer.cy - this.renderer.R - 14, str, '#ffe680', 22);
  }
  setMsg(s) {
    this.msgTimer = 0; // persistent unless a toast re-arms the timer
    const el = this.$('msg');
    el.textContent = s;
    el.classList.toggle('show', !!s);
  }

  updateHud(force) {
    this.$('score').textContent = this.score.toLocaleString();
    const lvlEl = this.$('level');
    if (this.mode === 'rescue') {
      const n = this.progress.rescueLevel;
      lvlEl.textContent = `${Math.ceil(n / 10)}-${((n - 1) % 10) + 1}`;
    } else if (this.mode === 'puzzle') {
      lvlEl.textContent = `#${this.puzzleIndex + 1}`;
    } else if (this.mode === 'freefable') {
      lvlEl.textContent = this.freeCfg.short;
    } else {
      lvlEl.textContent = 'T.T.';
    }

    // goal meter
    if (this.mode === 'puzzle') {
      this.$('goal-label').textContent = 'PIECES';
      const total = this.puzzleTotal || (this.puzzleTotal = Math.max(1, this.board.realPieceCount()));
      const left = this.board.realPieceCount();
      this.$('goal-fill').style.width = `${(1 - left / Math.max(total, 1)) * 100}%`;
      this.$('goal-text').textContent = `${left} left`;
    } else {
      this.$('goal-label').textContent = 'CORE';
      const need = this.levelCfg.sectionsRequired;
      const got = Math.max(0, this.sectionsPrev - this.sectionsBase);
      this.$('goal-fill').style.width = `${Math.min(100, got / need * 100)}%`;
      this.$('goal-text').textContent = `${got} / ${need} sections`;
    }

    // pips: hearts (timed modes) or drops (puzzle)
    const pips = this.$('drops');
    const label = this.$('drops-label');
    if (this.mode === 'puzzle') {
      label.textContent = 'DROPS · DRAGS';
      pips.innerHTML = `<span class="count">${this.drops}</span><span class="count dim">·</span><span class="count">${this.drags}</span>`;
    } else {
      label.textContent = 'HEARTS';
      pips.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = 'pip' + (i < this.hearts ? '' : ' off');
        pips.appendChild(s);
      }
    }

    // combo / magic
    this.$('combo').textContent = this.xcount > 1 ? `x${this.xcount}` : '—';
    this.$('combo').classList.toggle('dim', this.xcount <= 1);
    this.$('magic-name').textContent = this.magicItem ? MAGIC_ITEMS[this.magicItem] : '—';
    this.$('magic-name').classList.toggle('dim', !this.magicItem);
    this.$('magic-fill').style.width = `${this.magicMeter / MAGIC_METER_MAX * 100}%`;
  }

  updateHudMeters() {
    // speed meter (cheap DOM updates every frame)
    const sm = this.$('speed-fill');
    if (this.mode === 'puzzle') {
      sm.parentElement.parentElement.classList.add('hidden');
    } else {
      sm.parentElement.parentElement.classList.remove('hidden');
      const f = Math.max(0, this.speed / this.levelCfg.speedMax);
      sm.style.width = `${f * 100}%`;
      sm.style.background = f > 0.5 ? 'linear-gradient(90deg,#3f7fe8,#43e5c5)'
        : f > 0.2 ? 'linear-gradient(90deg,#e8b83f,#e8883f)' : 'linear-gradient(90deg,#e8433f,#ff2222)';
    }
    if (this.mode === 'timetrial') {
      const t = Math.max(0, this.timeLeft);
      this.$('level').textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    }
  }

  drawNextPreview() {
    const cv = this.$('next');
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const entries = [this.heldType, ...this.queue.slice(0, 2)];
    entries.forEach((t, i) => {
      const shape = t === 'WILD' ? (i === 0 ? this.heldShape() : null) : t;
      const y0 = 8 + i * 40;
      const cell = i === 0 ? 13 : 9;
      if (!shape) {
        ctx.font = 'bold 26px Trebuchet MS';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText('?', 12, y0 + 24);
        return;
      }
      const col = SHAPE_COLORS[shape];
      for (const [du, dv] of SHAPES[shape].cells) {
        ctx.fillStyle = t === 'WILD' ? '#ffffff' : col.top;
        ctx.fillRect(8 + du * cell, y0 + dv * cell, cell - 1, cell - 1);
      }
      if (i === 0) {
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(4.5, y0 - 3.5, 60, 34 + (shape === 'V3' || shape === 'S4' ? 12 : 0));
      }
    });
  }
}

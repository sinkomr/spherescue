/* Tetrisphere-style game engine.
 *
 * The playfield is a 32x32 grid wrapping in both directions (a torus),
 * rendered elsewhere as a sphere — the same trick the original used.
 * Pieces are rigid units stacking in up to 8 layers (z) above the core;
 * z=0 rests on the core. Gaps are padded with 1x1 grey "crystal" pieces
 * that never match and get plowed away by slides.
 *
 * Matching rules (per the original):
 *  - No rotation exists; horizontal and vertical bars are distinct types.
 *  - "Strict" types (O4, B3, V3) touch only when a complete side of one
 *    piece is in full flush contact with the other.
 *  - "Loose" types (L3, T4, S4) touch on any edge contact.
 *  - Same-type pieces exactly stacked (same footprint, adjacent layers)
 *    are also connected, letting chains eat down through layers.
 */
'use strict';

const RULES = {
  gridW: 32,
  gridH: 32,
  maxLayers: 8,
  matchMin: 3,
};

const SHAPES = {
  B3: { cells: [[0, 0], [1, 0], [2, 0]], strict: true },   // yellow horizontal bar
  V3: { cells: [[0, 0], [0, 1], [0, 2]], strict: true },   // green vertical bar
  L3: { cells: [[0, 0], [0, 1], [1, 1]], strict: false },  // pink L tromino
  O4: { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], strict: true },   // blue square
  T4: { cells: [[0, 0], [1, 0], [2, 0], [1, 1]], strict: false }, // red T
  S4: { cells: [[0, 0], [0, 1], [1, 1], [1, 2]], strict: false }, // cyan vertical S
  C:  { cells: [[0, 0]], strict: false },                  // grey crystal filler
};
const REAL_SHAPES = ['B3', 'V3', 'L3', 'O4', 'T4', 'S4'];

const mod = (a, n) => ((a % n) + n) % n;

let nextPieceId = 1;

class Piece {
  constructor(type, u, v, z) {
    this.id = nextPieceId++;
    this.type = type;
    this.u = u;
    this.v = v;
    this.z = z;
    this.power = false;       // glowing power piece (1000 pts, refills timer)
    this.state = 'resting';   // resting | clearing
    this.clearT = 0;
  }
  get crystal() { return this.type === 'C'; }
  cells(W, H) {
    return SHAPES[this.type].cells.map(([du, dv]) => [mod(this.u + du, W), mod(this.v + dv, H)]);
  }
}

class Board {
  constructor(rules = RULES) {
    this.rules = rules;
    this.W = rules.gridW;
    this.H = rules.gridH;
    this.pieces = new Map();
    this.occ = [];
    for (let z = 0; z < rules.maxLayers; z++) this.occ.push(new Int32Array(this.W * this.H));
  }

  idx(u, v) { return mod(v, this.H) * this.W + mod(u, this.W); }
  at(u, v, z) { return (z < 0 || z >= this.occ.length) ? 0 : this.occ[z][this.idx(u, v)]; }
  pieceAt(u, v, z) { const id = this.at(u, v, z); return id ? this.pieces.get(id) : null; }

  topZ(u, v) {
    for (let z = this.occ.length - 1; z >= 0; z--) if (this.at(u, v, z)) return z + 1;
    return 0;
  }

  topPiece(u, v) {
    const z = this.topZ(u, v);
    return z > 0 ? this.pieceAt(u, v, z - 1) : null;
  }

  setOcc(piece, val) {
    for (const [u, v] of piece.cells(this.W, this.H)) this.occ[piece.z][this.idx(u, v)] = val;
  }

  addPiece(piece) {
    this.pieces.set(piece.id, piece);
    this.setOcc(piece, piece.id);
    return piece;
  }

  removePiece(piece) {
    this.setOcc(piece, 0);
    this.pieces.delete(piece.id);
  }

  fits(piece, u, v, z, ignoreCrystals = false) {
    if (z < 0 || z >= this.occ.length) return false;
    for (const [du, dv] of SHAPES[piece.type].cells) {
      const id = this.at(u + du, v + dv, z);
      if (!id || id === piece.id) continue;
      if (ignoreCrystals && this.pieces.get(id).crystal) continue;
      return false;
    }
    return true;
  }

  supported(piece, u, v, z) {
    if (z === 0) return true;
    for (const [du, dv] of SHAPES[piece.type].cells) {
      const id = this.at(u + du, v + dv, z - 1);
      if (id && id !== piece.id) return true;
    }
    return false;
  }

  /** Landing layer for a piece dropped over (u,v). */
  dropZ(piece, u, v) {
    let z = this.occ.length - 1;
    while (z > 0 && this.fits(piece, u, v, z - 1)) z--;
    return z;
  }

  /** Crystals a one-step slide by (du,dv) would plow through. */
  crystalsInPath(piece, du, dv) {
    const out = new Set();
    for (const [su, sv] of SHAPES[piece.type].cells) {
      const p = this.pieceAt(piece.u + su + du, piece.v + sv + dv, piece.z);
      if (p && p !== piece && p.crystal) out.add(p);
    }
    return [...out];
  }

  /** Move a resting piece one cell at its own layer (crystals must be gone). */
  slide(piece, du, dv) {
    const nu = mod(piece.u + du, this.W), nv = mod(piece.v + dv, this.H);
    if (!this.fits(piece, nu, nv, piece.z)) return false;
    this.setOcc(piece, 0);
    piece.u = nu; piece.v = nv;
    this.setOcc(piece, piece.id);
    return true;
  }

  /** Move a piece to an explicit layer (power pieces climbing). */
  moveTo(piece, u, v, z) {
    this.setOcc(piece, 0);
    piece.u = mod(u, this.W); piece.v = mod(v, this.H); piece.z = z;
    this.setOcc(piece, piece.id);
  }

  /** Pieces sharing any edge with `piece` on its layer (crystals included). */
  neighbors(piece) {
    const out = new Set();
    for (const [u, v] of piece.cells(this.W, this.H)) {
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = this.pieceAt(u + du, v + dv, piece.z);
        if (p && p !== piece && p.state === 'resting') out.add(p);
      }
    }
    return [...out];
  }

  /** Do two same-type pieces count as "touching" for matches? */
  piecesTouch(a, b) {
    if (a.type !== b.type || a.crystal) return false;
    // vertical: exactly stacked on adjacent layers
    if (Math.abs(a.z - b.z) === 1) {
      return mod(a.u, this.W) === mod(b.u, this.W) && mod(a.v, this.H) === mod(b.v, this.H);
    }
    if (a.z !== b.z) return false;
    if (!SHAPES[a.type].strict) {
      // loose: any edge contact
      const bCells = new Set(b.cells(this.W, this.H).map(([u, v]) => v * this.W + u));
      for (const [u, v] of a.cells(this.W, this.H)) {
        for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (bCells.has(this.idx(u + du, v + dv))) return true;
        }
      }
      return false;
    }
    // strict: a complete side of one piece in full contact with the other
    return this.fullSideContact(a, b) || this.fullSideContact(b, a);
  }

  /** Does some complete side of `a` (in one direction) rest fully against `b`? */
  fullSideContact(a, b) {
    const bCells = new Set(b.cells(this.W, this.H).map(([u, v]) => v * this.W + u));
    const aCells = new Set(a.cells(this.W, this.H).map(([u, v]) => v * this.W + u));
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let sideLen = 0, contact = 0;
      for (const [u, v] of a.cells(this.W, this.H)) {
        if (aCells.has(this.idx(u + du, v + dv))) continue; // interior edge
        sideLen++;
        if (bCells.has(this.idx(u + du, v + dv))) contact++;
      }
      if (sideLen > 0 && contact === sideLen) return true;
    }
    return false;
  }

  /** Connected group of same-type pieces containing `piece` (match rules). */
  matchGroup(piece) {
    if (piece.crystal) return [piece];
    const group = new Set([piece]);
    const stack = [piece];
    while (stack.length) {
      const p = stack.pop();
      // candidates: same-layer edge neighbors + exactly-stacked above/below
      const cands = this.neighbors(p);
      const above = this.pieceAt(p.u, p.v, p.z + 1), below = this.pieceAt(p.u, p.v, p.z - 1);
      if (above) cands.push(above);
      if (below) cands.push(below);
      for (const n of cands) {
        if (!group.has(n) && n.state === 'resting' && this.piecesTouch(p, n)) {
          group.add(n); stack.push(n);
        }
      }
    }
    return [...group];
  }

  /** Same-type resting pieces touching `piece`, excluding itself. */
  touchingLikeCount(piece) {
    return this.matchGroup(piece).length - 1;
  }

  /** Crystals edge-adjacent to any piece in `group` (they shatter too). */
  adjacentCrystals(group) {
    const out = new Set();
    for (const p of group) {
      for (const n of this.neighbors(p)) if (n.crystal && n.state === 'resting') out.add(n);
    }
    return [...out];
  }

  /** Let unsupported pieces fall until stable. Returns pieces that moved. */
  settle() {
    const moved = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      const ordered = [...this.pieces.values()].filter(p => p.state === 'resting').sort((a, b) => a.z - b.z);
      for (const p of ordered) {
        while (p.z > 0 && this.fits(p, p.u, p.v, p.z - 1) && !this.supported(p, p.u, p.v, p.z)) {
          this.setOcc(p, 0);
          p.z--;
          this.setOcc(p, p.id);
          moved.add(p);
          changed = true;
        }
      }
    }
    return moved;
  }

  /** Count exposed 2x2 core sections (all four cells clear to the core). */
  exposedSections() {
    let n = 0;
    for (let v = 0; v < this.H; v += 2) {
      for (let u = 0; u < this.W; u += 2) {
        if (this.topZ(u, v) === 0 && this.topZ(u + 1, v) === 0 &&
            this.topZ(u, v + 1) === 0 && this.topZ(u + 1, v + 1) === 0) n++;
      }
    }
    return n;
  }

  /** Count of resting, fully-uncovered pieces per type (surface presence). */
  surfaceCounts() {
    const counts = {};
    for (const p of this.pieces.values()) {
      if (p.crystal || p.state !== 'resting') continue;
      let top = true;
      for (const [u, v] of p.cells(this.W, this.H)) {
        if (this.at(u, v, p.z + 1)) { top = false; break; }
      }
      if (top) counts[p.type] = (counts[p.type] || 0) + 1;
    }
    return counts;
  }

  /** Types with a guaranteed valid drop: an uncovered piece already in a
   *  touching group (dropping exactly on top of it makes 3). */
  liveTypes(types) {
    const tops = {};
    for (const p of this.pieces.values()) {
      if (p.crystal || p.state !== 'resting' || !types.includes(p.type)) continue;
      let top = true;
      for (const [u, v] of p.cells(this.W, this.H)) {
        if (this.at(u, v, p.z + 1)) { top = false; break; }
      }
      if (top) (tops[p.type] = tops[p.type] || []).push(p);
    }
    const live = [];
    const probeCache = {};
    for (const type of types) {
      for (const p of (tops[type] || [])) {
        if (this.matchGroup(p).length < 2) continue;
        // a neighboring ledge can overhang the column and catch the falling
        // piece early — live means the drop genuinely lands flush on p
        const probe = probeCache[type] || (probeCache[type] = new Piece(type, 0, 0, 0));
        probe.u = p.u; probe.v = p.v;
        if (!this.fits(probe, p.u, p.v, this.occ.length - 1)) continue;
        if (this.dropZ(probe, p.u, p.v) === p.z + 1) { live.push(type); break; }
      }
    }
    return live;
  }

  realPieceCount() {
    let n = 0;
    for (const p of this.pieces.values()) if (!p.crystal) n++;
    return n;
  }
}

if (typeof module !== 'undefined') module.exports = { RULES, SHAPES, REAL_SHAPES, Piece, Board, mod };

/* Level definitions: Rescue-mode sphere generator + hand-crafted puzzles.
 *
 * Puzzle format mirrors the original's economy: a fixed cut-away layout,
 * a budget of drags (one unit per square slid) and drops (every drop is
 * wild), clear every real piece to win. Crystals left behind don't count.
 */
'use strict';

/* ---------------- rescue mode ---------------- */

function rescueLevelCfg(n) {
  n = Math.max(1, n);
  const ep = Math.min(10, Math.ceil(n / 10));   // episode 1..10
  const step = (n - 1) % 10;
  return {
    level: n,
    types: REAL_SHAPES.slice(0, Math.min(6, 2 + Math.ceil(ep / 2))),
    layers: Math.min(6, 1 + Math.ceil(ep / 2)),
    sectionsRequired: 3 + ep + (step >= 5 ? 1 : 0),
    speedMax: Math.max(8, 25 - ep * 1.6 - step * 0.15),
    wildChance: 0.07,
  };
}

/** Fill the board: full piece+crystal layers with a craggier top layer. */
function generateSphere(board, cfg) {
  for (let z = 0; z < cfg.layers; z++) {
    const isTop = z === cfg.layers - 1;
    const tries = isTop ? 260 : 420;
    for (let i = 0; i < tries; i++) {
      const type = cfg.types[(Math.random() * cfg.types.length) | 0];
      const u = (Math.random() * board.W) | 0, v = (Math.random() * board.H) | 0;
      const p = new Piece(type, u, v, z);
      if (!board.fits(p, u, v, z)) continue;
      if (z > 0 && !board.supported(p, u, v, z)) continue;
      board.addPiece(p);
    }
    for (let v = 0; v < board.H; v++) {
      for (let u = 0; u < board.W; u++) {
        if (board.at(u, v, z)) continue;
        if (isTop && Math.random() < 0.45) continue;   // leave pits and texture
        if (z > 0 && !board.at(u, v, z - 1)) continue; // crystals need support
        board.addPiece(new Piece('C', u, v, z));
      }
    }
  }
}

/* ---------------- puzzle mode ---------------- */

/** pieces: [type, u, v, z]; crystals: [u, v, z]. Solutions in comments. */
const PUZZLES = [
  // 1 — FIRST CONTACT: drop an O beside the flush pair.
  { name: 'First Contact', drags: 0, drops: 1, cursor: [16, 15],
    pieces: [['O4', 15, 15, 0], ['O4', 17, 15, 0]] },

  // 2 — NUDGE: slide the left square right one, then drop.
  { name: 'Nudge', drags: 1, drops: 1, cursor: [15, 15],
    pieces: [['O4', 13, 15, 0], ['O4', 16, 15, 0]] },

  // 3 — BREAK THROUGH: plow the crystal fence (2 slides), then drop.
  { name: 'Break Through', drags: 2, drops: 1, cursor: [14, 15],
    pieces: [['O4', 12, 15, 0], ['O4', 16, 15, 0]],
    crystals: [[14, 15, 0], [14, 16, 0], [15, 15, 0], [15, 16, 0]] },

  // 4 — GRAVITY: slide the raised square off its pedestal; it falls flush.
  { name: 'Gravity', drags: 2, drops: 0, cursor: [17, 15],
    pieces: [['O4', 13, 15, 0], ['O4', 15, 15, 0], ['O4', 19, 15, 1]],
    crystals: [[19, 15, 0], [20, 15, 0], [19, 16, 0], [20, 16, 0]] },

  // 5 — LINE UP: offset bars don't count; align them, then drop.
  { name: 'Line Up', drags: 1, drops: 1, cursor: [15, 16],
    pieces: [['B3', 13, 15, 0], ['B3', 14, 16, 0]] },

  // 6 — COLUMNS: slide the right column two left, drop the third between.
  { name: 'Columns', drags: 2, drops: 1, cursor: [16, 14],
    pieces: [['V3', 14, 13, 0], ['V3', 17, 13, 0]] },

  // 7 — CORNER POCKET: loose pieces touch on any edge; one nudge connects.
  { name: 'Corner Pocket', drags: 1, drops: 1, cursor: [15, 16],
    pieces: [['L3', 13, 15, 0], ['L3', 16, 16, 0]] },

  // 8 — STACK ATTACK: exact stacks chain vertically; drop on top.
  { name: 'Stack Attack', drags: 0, drops: 1, cursor: [15, 15],
    pieces: [['T4', 15, 15, 0], ['T4', 15, 15, 1]] },

  // 9 — ZIG ZAG: one nudge, then drop.
  { name: 'Zig Zag', drags: 1, drops: 1, cursor: [16, 15],
    pieces: [['S4', 14, 14, 0], ['S4', 17, 14, 0]] },

  // 10 — PYRAMID: align the squares on the mesa, drop on top of one.
  { name: 'Pyramid', drags: 1, drops: 1, cursor: [15, 14],
    pieces: [['O4', 14, 14, 1], ['O4', 17, 14, 1]],
    crystals: [[14, 14, 0], [15, 14, 0], [16, 14, 0], [17, 14, 0], [18, 14, 0],
               [14, 15, 0], [15, 15, 0], [16, 15, 0], [17, 15, 0], [18, 15, 0]] },

  // 11 — TWO TOWERS: shove the upper square off; it lands between the bases.
  { name: 'Two Towers', drags: 2, drops: 0, cursor: [13, 15],
    pieces: [['O4', 13, 15, 0], ['O4', 13, 15, 1], ['O4', 17, 15, 0]] },

  // 12 — DOUBLE UP: two families, two drops.
  { name: 'Double Up', drags: 0, drops: 2, cursor: [15, 15],
    pieces: [['O4', 14, 15, 0], ['O4', 16, 15, 0], ['T4', 14, 19, 0], ['T4', 14, 21, 0]] },

  // 13 — CHAIN REACTION: one drop detonates the whole vein.
  { name: 'Chain Reaction', drags: 0, drops: 1, cursor: [16, 15],
    pieces: [['O4', 12, 15, 0], ['O4', 14, 15, 0], ['O4', 16, 15, 0], ['O4', 18, 15, 0],
             ['O4', 14, 15, 1], ['O4', 16, 15, 1]] },

  // 14 — ECONOMY: two nudges to join three squares, one drop on top.
  { name: 'Economy', drags: 2, drops: 1, cursor: [14, 15],
    pieces: [['O4', 13, 14, 0], ['O4', 16, 14, 0], ['O4', 13, 17, 0]] },

  // 15 — LONG HAUL: one bar, seven squares of dragging, one drop.
  { name: 'Long Haul', drags: 7, drops: 1, cursor: [16, 21],
    pieces: [['V3', 16, 10, 0], ['V3', 17, 10, 0], ['V3', 16, 20, 0]] },

  // 16 — TRAFFIC: route the L through the crystal wall.
  { name: 'Traffic', drags: 3, drops: 1, cursor: [18, 14],
    pieces: [['L3', 13, 14, 0], ['L3', 18, 14, 0]],
    crystals: [[16, 12, 0], [16, 13, 0], [16, 14, 0], [16, 15, 0], [16, 16, 0]] },

  // 17 — SKYLIGHT: a drop on the stack chains down and out the side.
  { name: 'Skylight', drags: 0, drops: 1, cursor: [15, 15],
    pieces: [['O4', 15, 15, 0], ['O4', 15, 15, 1], ['O4', 17, 15, 0]] },

  // 18 — UNDERMINE: ride the square off its own tower.
  { name: 'Undermine', drags: 2, drops: 0, cursor: [15, 15],
    pieces: [['O4', 15, 15, 0], ['O4', 15, 15, 1], ['O4', 19, 15, 0]] },

  // 19 — MORPH: three families, three wild drops — wait for the shape.
  { name: 'Morph', drags: 0, drops: 3, cursor: [15, 15],
    pieces: [['O4', 13, 13, 0], ['O4', 15, 13, 0],
             ['B3', 12, 17, 0], ['B3', 12, 18, 0],
             ['L3', 18, 16, 0], ['L3', 19, 18, 0]] },

  // 20 — GRAND TOUR: three set-pieces, tight budget.
  { name: 'Grand Tour', drags: 3, drops: 2, cursor: [15, 14],
    pieces: [['T4', 20, 11, 0], ['T4', 20, 11, 1],
             ['O4', 12, 14, 0], ['O4', 15, 14, 0],
             ['S4', 12, 20, 0], ['S4', 14, 20, 0], ['S4', 17, 19, 1]],
    crystals: [[17, 20, 0], [18, 20, 0], [17, 21, 0], [18, 21, 0]] },

  // 21 — BAR EXAM: end-to-end and broadside are both full contact.
  { name: 'Bar Exam', drags: 2, drops: 1, cursor: [13, 14],
    pieces: [['B3', 12, 14, 0], ['B3', 16, 14, 0], ['B3', 12, 16, 0]] },

  // 22 — SKYFALL: park the flying bar exactly on the stack, then cap it.
  { name: 'Skyfall', drags: 4, drops: 1, cursor: [17, 13],
    pieces: [['B3', 13, 13, 0], ['B3', 13, 14, 0], ['B3', 17, 13, 1]],
    crystals: [[18, 13, 0], [19, 13, 0]] },

  // 23 — ROUNDABOUT: the sphere wraps — slide across the seam.
  { name: 'Roundabout', drags: 1, drops: 1, cursor: [0, 15],
    pieces: [['O4', 31, 15, 0], ['O4', 2, 15, 0]] },

  // 24 — TRIPLE DECKER: two towers, two capping drops.
  { name: 'Triple Decker', drags: 0, drops: 2, cursor: [15, 15],
    pieces: [['O4', 15, 15, 0], ['O4', 15, 15, 1], ['O4', 15, 15, 2],
             ['T4', 19, 17, 0], ['T4', 19, 17, 1]] },

  // 25 — MASTER'S EXAM: undermine on one front, bar economy on the other.
  { name: "Master's Exam", drags: 4, drops: 1, cursor: [15, 12],
    pieces: [['O4', 15, 12, 0], ['O4', 15, 12, 1], ['O4', 19, 12, 0],
             ['B3', 12, 19, 0], ['B3', 16, 19, 0], ['B3', 12, 21, 0]] },
];

function loadPuzzle(board, cfg) {
  for (const [type, u, v, z] of cfg.pieces) board.addPiece(new Piece(type, u, v, z));
  for (const [u, v, z] of (cfg.crystals || [])) board.addPiece(new Piece('C', u, v, z));
  board.settle(); // safety: authoring mistakes shouldn't leave floaters
}

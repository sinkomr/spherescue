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

  // 26 — Heartbeat (difficulty 1.9)
  { name: "Heartbeat", drags: 0, drops: 1, cursor: [15,13],
    pieces: [['L3',15,13,0], ['L3',15,15,0], ['L3',15,17,0]],
    crystals: [[13,11,0], [14,11,0], [18,11,0], [19,11,0], [12,12,0], [15,12,0], [17,12,0], [20,12,0], [12,13,0], [16,13,0], [20,13,0], [12,14,0], [20,14,0], [13,15,0], [19,15,0], [14,16,0], [18,16,0], [15,17,0], [17,17,0], [16,18,0]] },

  // 27 — X Marks the Spot (difficulty 2.4)
  { name: "X Marks the Spot", drags: 0, drops: 1, cursor: [15,14],
    pieces: [['O4',15,14,0], ['O4',15,14,1]],
    crystals: [[12,11,0], [20,11,0], [13,12,0], [19,12,0], [14,13,0], [18,13,0], [15,14,0], [17,14,0], [16,15,0], [15,16,0], [17,16,0], [14,17,0], [18,17,0], [13,18,0], [19,18,0], [12,19,0], [20,19,0]] },

  // 28 — Ouroboros (difficulty 1.6)
  { name: "Ouroboros", drags: 0, drops: 1, cursor: [15,13],
    pieces: [['L3',15,13,0], ['L3',15,15,0]],
    crystals: [[14,11,0], [15,11,0], [16,11,0], [17,11,0], [18,11,0], [13,12,0], [19,12,0], [12,13,0], [20,13,0], [12,14,0], [20,14,0], [12,15,0], [20,15,0], [13,16,0], [19,16,0], [14,17,0], [15,17,0], [16,17,0], [17,17,0], [18,17,0]] },

  // 29 — Cold Shoulder (difficulty 3.4)
  { name: "Cold Shoulder", drags: 3, drops: 1, cursor: [18,14],
    pieces: [['S4',13,14,0], ['S4',18,14,0]],
    crystals: [] },

  // 30 — Wink (difficulty 2.8)
  { name: "Wink", drags: 2, drops: 1, cursor: [8,13],
    pieces: [['O4',8,13,0], ['O4',8,17,0]],
    crystals: [[14,11,0], [15,11,0], [16,11,0], [17,11,0], [18,11,0], [13,12,0], [19,12,0], [12,13,0], [15,13,0], [17,13,0], [20,13,0], [12,14,0], [20,14,0], [12,15,0], [14,15,0], [18,15,0], [20,15,0], [12,16,0], [15,16,0], [16,16,0], [17,16,0], [20,16,0], [13,17,0], [19,17,0], [14,18,0], [15,18,0], [16,18,0], [17,18,0], [18,18,0]] },

  // 31 — Second Contact (difficulty 1.6)
  { name: "Second Contact", drags: 0, drops: 1, cursor: [14,15],
    pieces: [['T4',14,15,0], ['T4',14,17,0]],
    crystals: [] },

  // 32 — Buried Treasure (difficulty 5.1)
  { name: "Buried Treasure", drags: 1, drops: 2, cursor: [14,14],
    pieces: [['T4',14,14,0], ['T4',14,14,1], ['B3',13,18,0], ['B3',13,20,0]],
    crystals: [[12,11,0], [20,11,0], [13,12,0], [19,12,0], [14,13,0], [18,13,0], [15,14,0], [17,14,0], [16,15,0], [15,16,0], [17,16,0], [14,17,0], [18,17,0], [13,18,0], [19,18,0], [12,19,0], [20,19,0]] },

  // 33 — Cliffhanger (difficulty 2.9)
  { name: "Cliffhanger", drags: 2, drops: 0, cursor: [18,15],
    pieces: [['O4',12,15,0], ['O4',14,15,0], ['O4',18,15,1]],
    crystals: [[18,15,0], [19,15,0], [18,16,0], [19,16,0]] },

  // 34 — Cupid (difficulty 2.2)
  { name: "Cupid", drags: 1, drops: 1, cursor: [13,17],
    pieces: [['T4',13,14,0], ['T4',13,17,0]],
    crystals: [[13,11,0], [14,11,0], [18,11,0], [19,11,0], [12,12,0], [15,12,0], [17,12,0], [20,12,0], [12,13,0], [16,13,0], [20,13,0], [12,14,0], [20,14,0], [13,15,0], [19,15,0], [14,16,0], [18,16,0], [15,17,0], [17,17,0], [16,18,0]] },

  // 35 — Odd Couple (difficulty 4.5)
  { name: "Odd Couple", drags: 0, drops: 2, cursor: [9,12],
    pieces: [['B3',9,12,0], ['B3',9,13,0], ['S4',20,16,0], ['S4',20,16,1]],
    crystals: [] },

  // 36 — Lucky Star (difficulty 2.8)
  { name: "Lucky Star", drags: 2, drops: 1, cursor: [18,12],
    pieces: [['S4',14,12,0], ['S4',18,12,0]],
    crystals: [[16,11,0], [15,12,0], [16,12,0], [17,12,0], [12,13,0], [13,13,0], [14,13,0], [15,13,0], [16,13,0], [17,13,0], [18,13,0], [19,13,0], [20,13,0], [13,14,0], [14,14,0], [15,14,0], [16,14,0], [17,14,0], [18,14,0], [19,14,0], [14,15,0], [15,15,0], [16,15,0], [17,15,0], [18,15,0], [13,16,0], [14,16,0], [15,16,0], [17,16,0], [18,16,0], [19,16,0], [13,17,0], [19,17,0]] },

  // 37 — Crater Lake (difficulty 4.5)
  { name: "Crater Lake", drags: 2, drops: 1, cursor: [14,13],
    pieces: [['O4',14,13,0], ['O4',14,13,1], ['O4',8,24,0], ['O4',10,24,0], ['O4',14,24,1]],
    crystals: [[13,10,0], [14,10,0], [15,10,0], [16,10,0], [17,10,0], [12,11,0], [18,11,0], [11,12,0], [19,12,0], [11,13,0], [19,13,0], [11,14,0], [19,14,0], [12,15,0], [18,15,0], [13,16,0], [14,16,0], [15,16,0], [16,16,0], [17,16,0], [14,24,0], [15,24,0], [14,25,0], [15,25,0]] },

  // 38 — Smile! (difficulty 2.2)
  { name: "Smile!", drags: 1, drops: 1, cursor: [16,14],
    pieces: [['O4',13,14,0], ['O4',16,14,0]],
    crystals: [[14,11,0], [15,11,0], [16,11,0], [17,11,0], [18,11,0], [13,12,0], [19,12,0], [12,13,0], [15,13,0], [17,13,0], [20,13,0], [12,14,0], [20,14,0], [12,15,0], [14,15,0], [18,15,0], [20,15,0], [12,16,0], [15,16,0], [16,16,0], [17,16,0], [20,16,0], [13,17,0], [19,17,0], [14,18,0], [15,18,0], [16,18,0], [17,18,0], [18,18,0]] },

  // 39 — Full House (difficulty 4.3)
  { name: "Full House", drags: 0, drops: 2, cursor: [8,12],
    pieces: [['O4',8,12,0], ['O4',10,12,0], ['O4',12,12,0], ['L3',18,11,0], ['L3',18,13,0], ['L3',18,15,0]],
    crystals: [] },

  // 40 — Bar Tab (difficulty 3.1)
  { name: "Bar Tab", drags: 2, drops: 1, cursor: [16,12],
    pieces: [['B3',12,12,0], ['B3',16,12,0], ['B3',12,14,0]],
    crystals: [] },

  // 41 — North Star (difficulty 2.4)
  { name: "North Star", drags: 0, drops: 1, cursor: [16,12],
    pieces: [['V3',16,12,0], ['V3',16,12,1]],
    crystals: [[16,10,0], [15,11,0], [16,11,0], [17,11,0], [12,12,0], [13,12,0], [14,12,0], [15,12,0], [16,12,0], [17,12,0], [18,12,0], [19,12,0], [20,12,0], [13,13,0], [14,13,0], [15,13,0], [16,13,0], [17,13,0], [18,13,0], [19,13,0], [14,14,0], [15,14,0], [16,14,0], [17,14,0], [18,14,0], [13,15,0], [14,15,0], [15,15,0], [17,15,0], [18,15,0], [19,15,0], [13,16,0], [19,16,0]] },

  // 42 — Double Date (difficulty 4.9)
  { name: "Double Date", drags: 2, drops: 2, cursor: [13,12],
    pieces: [['O4',10,12,0], ['O4',13,12,0], ['T4',18,18,0], ['T4',18,21,0]],
    crystals: [] },

  // 43 — Penthouse (difficulty 3.5)
  { name: "Penthouse", drags: 0, drops: 1, cursor: [15,15],
    pieces: [['L3',15,15,0], ['L3',15,15,1], ['L3',15,15,2]],
    crystals: [] },

  // 44 — Clawd's Day Out (difficulty 3.4)
  { name: "Clawd's Day Out", drags: 3, drops: 1, cursor: [17,9],
    pieces: [['O4',12,9,0], ['O4',17,9,0]],
    crystals: [[12,12,0], [13,12,0], [19,12,0], [20,12,0], [13,13,0], [19,13,0], [14,14,0], [15,14,0], [16,14,0], [17,14,0], [18,14,0], [13,15,0], [14,15,0], [15,15,0], [16,15,0], [17,15,0], [18,15,0], [19,15,0], [13,16,0], [14,16,0], [15,16,0], [16,16,0], [17,16,0], [18,16,0], [19,16,0], [14,17,0], [16,17,0], [18,17,0]] },

  // 45 — Three Sisters (difficulty 5.6)
  { name: "Three Sisters", drags: 0, drops: 3, cursor: [9,13],
    pieces: [['V3',9,13,0], ['V3',9,13,1], ['V3',14,13,0], ['V3',14,13,1], ['V3',19,13,0], ['V3',19,13,1]],
    crystals: [] },

  // 46 — Economy II (difficulty 3.1)
  { name: "Economy II", drags: 2, drops: 1, cursor: [16,12],
    pieces: [['O4',13,12,0], ['O4',16,12,0], ['O4',13,15,0]],
    crystals: [] },

  // 47 — Orion's Belt (difficulty 5.6)
  { name: "Orion's Belt", drags: 0, drops: 3, cursor: [12,16],
    pieces: [['V3',12,16,0], ['V3',12,16,1], ['V3',16,17,0], ['V3',16,17,1], ['V3',20,18,0], ['V3',20,18,1]],
    crystals: [[16,8,0], [15,9,0], [16,9,0], [17,9,0], [12,10,0], [13,10,0], [14,10,0], [15,10,0], [16,10,0], [17,10,0], [18,10,0], [19,10,0], [20,10,0], [13,11,0], [14,11,0], [15,11,0], [16,11,0], [17,11,0], [18,11,0], [19,11,0], [14,12,0], [15,12,0], [16,12,0], [17,12,0], [18,12,0], [13,13,0], [14,13,0], [15,13,0], [17,13,0], [18,13,0], [19,13,0], [13,14,0], [19,14,0]] },

  // 48 — The Spark (difficulty 2.2)
  { name: "The Spark", drags: 1, drops: 1, cursor: [14,17],
    pieces: [['B3',14,15,0], ['B3',14,17,0]],
    crystals: [[16,12,0], [13,13,0], [16,13,0], [19,13,0], [14,14,0], [16,14,0], [18,14,0], [12,15,0], [13,15,0], [14,15,0], [15,15,0], [17,15,0], [18,15,0], [19,15,0], [20,15,0], [14,16,0], [16,16,0], [18,16,0], [13,17,0], [16,17,0], [19,17,0], [16,18,0]] },

  // 49 — Double Drop (difficulty 5.0)
  { name: "Double Drop", drags: 4, drops: 0, cursor: [15,12],
    pieces: [['O4',9,12,0], ['O4',11,12,0], ['O4',15,12,1], ['O4',9,19,0], ['O4',11,19,0], ['O4',15,19,1]],
    crystals: [[15,12,0], [16,12,0], [15,13,0], [16,13,0], [15,19,0], [16,19,0], [15,20,0], [16,20,0]] },

  // 50 — Corner Office (difficulty 3.7)
  { name: "Corner Office", drags: 3, drops: 1, cursor: [15,12],
    pieces: [['L3',12,12,0], ['L3',15,12,0], ['L3',12,16,0]],
    crystals: [] },

  // 51 — This Way Up (difficulty 2.8)
  { name: "This Way Up", drags: 2, drops: 1, cursor: [17,13],
    pieces: [['V3',14,13,0], ['V3',17,13,0]],
    crystals: [[17,12,0], [16,13,0], [17,13,0], [18,13,0], [15,14,0], [16,14,0], [17,14,0], [18,14,0], [19,14,0], [17,15,0], [17,16,0], [17,17,0]] },

  // 52 — Checkmate (difficulty 6.1)
  { name: "Checkmate", drags: 4, drops: 2, cursor: [10,10],
    pieces: [['O4',10,10,0], ['O4',14,10,0], ['B3',16,18,0], ['B3',16,21,0]],
    crystals: [[9,9,0], [9,12,0], [10,9,0], [10,12,0], [11,9,0], [11,12,0], [12,9,0], [12,12,0], [9,10,0], [12,10,0], [9,11,0], [12,11,0], [15,17,0], [15,19,0], [16,17,0], [16,19,0], [17,17,0], [17,19,0], [18,17,0], [18,19,0], [19,17,0], [19,19,0], [15,18,0], [19,18,0]] },

  // 53 — Constellation (difficulty 5.7)
  { name: "Constellation", drags: 2, drops: 2, cursor: [10,16],
    pieces: [['S4',6,16,0], ['S4',10,16,0], ['V3',22,12,0], ['V3',22,12,1]],
    crystals: [[8,4,0], [7,5,0], [8,5,0], [9,5,0], [4,6,0], [5,6,0], [6,6,0], [7,6,0], [8,6,0], [9,6,0], [10,6,0], [11,6,0], [12,6,0], [5,7,0], [6,7,0], [7,7,0], [8,7,0], [9,7,0], [10,7,0], [11,7,0], [6,8,0], [7,8,0], [8,8,0], [9,8,0], [10,8,0], [5,9,0], [6,9,0], [7,9,0], [9,9,0], [10,9,0], [11,9,0], [5,10,0], [11,10,0], [24,20,0], [23,21,0], [24,21,0], [25,21,0], [20,22,0], [21,22,0], [22,22,0], [23,22,0], [24,22,0], [25,22,0], [26,22,0], [27,22,0], [28,22,0], [21,23,0], [22,23,0], [23,23,0], [24,23,0], [25,23,0], [26,23,0], [27,23,0], [22,24,0], [23,24,0], [24,24,0], [25,24,0], [26,24,0], [21,25,0], [22,25,0], [23,25,0], [25,25,0], [26,25,0], [27,25,0], [21,26,0], [27,26,0]] },

  // 54 — Landslide (difficulty 3.5)
  { name: "Landslide", drags: 3, drops: 0, cursor: [19,15],
    pieces: [['B3',10,15,0], ['B3',13,15,0], ['B3',19,15,1]],
    crystals: [[19,15,0], [20,15,0], [21,15,0]] },

  // 55 — Honeycomb (difficulty 6.6)
  { name: "Honeycomb", drags: 2, drops: 3, cursor: [8,10],
    pieces: [['L3',8,10,0], ['L3',8,12,0], ['L3',8,14,0], ['L3',16,10,0], ['L3',16,12,0], ['L3',16,14,0], ['L3',12,20,0], ['L3',12,24,0]],
    crystals: [] },

  // 56 — Long Reach (difficulty 4.0)
  { name: "Long Reach", drags: 4, drops: 1, cursor: [15,18],
    pieces: [['L3',15,12,0], ['L3',15,18,0]],
    crystals: [] },

  // 57 — Seam Ripper (difficulty 5.5)
  { name: "Seam Ripper", drags: 3, drops: 2, cursor: [30,12],
    pieces: [['O4',30,12,0], ['O4',1,12,0], ['V3',14,18,0], ['V3',17,18,0]],
    crystals: [] },

  // 58 — Icebreaker (difficulty 3.4)
  { name: "Icebreaker", drags: 3, drops: 1, cursor: [17,13],
    pieces: [['V3',13,13,0], ['V3',17,13,0]],
    crystals: [[14,13,0], [14,14,0], [14,15,0], [15,13,0], [15,14,0], [15,15,0], [16,13,0], [16,14,0], [16,15,0]] },

  // 59 — Neighbors (difficulty 6.1)
  { name: "Neighbors", drags: 4, drops: 2, cursor: [12,12],
    pieces: [['V3',9,12,0], ['V3',12,12,0], ['L3',19,18,0], ['L3',19,22,0]],
    crystals: [[10,12,0], [10,13,0], [10,14,0], [11,12,0], [11,13,0], [11,14,0]] },

  // 60 — Great Wall (difficulty 4.6)
  { name: "Great Wall", drags: 5, drops: 1, cursor: [16,13],
    pieces: [['O4',9,13,0], ['O4',16,13,0]],
    crystals: [[11,13,0], [12,13,0], [11,14,0], [12,14,0], [12,13,0], [13,13,0], [12,14,0], [13,14,0], [13,13,0], [14,13,0], [13,14,0], [14,14,0], [14,13,0], [15,13,0], [14,14,0], [15,14,0], [15,13,0], [16,13,0], [15,14,0], [16,14,0]] },

  // 61 — Steamroller (difficulty 3.4)
  { name: "Steamroller", drags: 3, drops: 1, cursor: [16,15],
    pieces: [['O4',11,15,0], ['O4',16,15,0]],
    crystals: [[13,15,0], [14,15,0], [13,16,0], [14,16,0], [14,15,0], [15,15,0], [14,16,0], [15,16,0], [15,15,0], [16,15,0], [15,16,0], [16,16,0]] },

  // 62 — Demolition Derby (difficulty 7.4)
  { name: "Demolition Derby", drags: 4, drops: 1, cursor: [6,8],
    pieces: [['O4',6,8,0], ['O4',6,8,1], ['O4',10,8,0], ['O4',20,8,0], ['O4',20,8,1], ['O4',24,8,0], ['S4',12,20,0], ['S4',14,20,0], ['S4',16,20,0]],
    crystals: [] },

  // 63 — Roundhouse (difficulty 5.5)
  { name: "Roundhouse", drags: 6, drops: 1, cursor: [16,12],
    pieces: [['S4',11,12,0], ['S4',16,12,0], ['S4',11,17,0]],
    crystals: [] },

  // 64 — Elevator Pitch (difficulty 4.5)
  { name: "Elevator Pitch", drags: 3, drops: 1, cursor: [16,12],
    pieces: [['V3',12,12,0], ['V3',12,12,1], ['V3',16,12,0]],
    crystals: [] },

  // 65 — En Passant (difficulty 8.9)
  { name: "En Passant", drags: 5, drops: 2, cursor: [30,14],
    pieces: [['O4',30,14,0], ['O4',1,14,0], ['B3',10,20,0], ['B3',13,20,0], ['B3',19,20,1], ['L3',8,20,0], ['L3',8,23,0]],
    crystals: [[19,20,0], [20,20,0], [21,20,0]] },

  // 66 — Skyscraper (difficulty 4.6)
  { name: "Skyscraper", drags: 0, drops: 1, cursor: [15,15],
    pieces: [['O4',15,15,0], ['O4',15,15,1], ['O4',15,15,2], ['O4',15,15,3]],
    crystals: [] },

  // 67 — Rivals (difficulty 6.2)
  { name: "Rivals", drags: 4, drops: 1, cursor: [14,12],
    pieces: [['O4',8,12,0], ['O4',10,12,0], ['O4',14,12,1], ['B3',18,19,0], ['B3',18,22,0]],
    crystals: [[14,12,0], [15,12,0], [14,13,0], [15,13,0]] },

  // 68 — Switchback (difficulty 4.3)
  { name: "Switchback", drags: 4, drops: 1, cursor: [16,14],
    pieces: [['T4',11,12,0], ['T4',11,16,0], ['T4',16,14,0]],
    crystals: [] },

  // 69 — Pinwheel (difficulty 7.9)
  { name: "Pinwheel", drags: 0, drops: 4, cursor: [4,8],
    pieces: [['B3',4,8,0], ['B3',4,9,0], ['V3',22,6,0], ['V3',23,6,0], ['L3',6,20,0], ['L3',6,22,0], ['S4',20,20,0], ['S4',22,20,0]],
    crystals: [] },

  // 70 — Night Shift (difficulty 5.6)
  { name: "Night Shift", drags: 3, drops: 1, cursor: [10,12],
    pieces: [['T4',10,12,0], ['T4',10,12,1], ['B3',14,19,0], ['B3',17,19,0], ['B3',23,19,1]],
    crystals: [[23,19,0], [24,19,0], [25,19,0]] },

  // 71 — Controlled Demolition (difficulty 4.1)
  { name: "Controlled Demolition", drags: 0, drops: 1, cursor: [12,14],
    pieces: [['O4',12,14,0], ['O4',12,14,1], ['O4',12,14,2], ['O4',14,14,0], ['O4',16,14,0]],
    crystals: [] },

  // 72 — Big Dipper (difficulty 9.2)
  { name: "Big Dipper", drags: 5, drops: 2, cursor: [14,10],
    pieces: [['O4',14,10,0], ['O4',16,10,0], ['O4',18,10,0], ['B3',12,20,0], ['B3',15,20,0], ['B3',21,20,1], ['L3',6,22,0], ['L3',6,26,0]],
    crystals: [[7,3,0], [6,4,0], [7,4,0], [8,4,0], [3,5,0], [4,5,0], [5,5,0], [6,5,0], [7,5,0], [8,5,0], [9,5,0], [10,5,0], [11,5,0], [4,6,0], [5,6,0], [6,6,0], [7,6,0], [8,6,0], [9,6,0], [10,6,0], [5,7,0], [6,7,0], [7,7,0], [8,7,0], [9,7,0], [4,8,0], [5,8,0], [6,8,0], [8,8,0], [9,8,0], [10,8,0], [4,9,0], [10,9,0], [21,20,0], [22,20,0], [23,20,0]] },

  // 73 — Rush Hour (difficulty 6.4)
  { name: "Rush Hour", drags: 1, drops: 3, cursor: [8,11],
    pieces: [['T4',8,11,0], ['T4',8,13,0], ['V3',18,12,0], ['V3',19,12,0], ['O4',12,20,0], ['O4',15,20,0]],
    crystals: [] },

  // 74 — Antipodes (difficulty 5.5)
  { name: "Antipodes", drags: 3, drops: 2, cursor: [2,10],
    pieces: [['B3',29,10,0], ['B3',2,10,0], ['O4',30,20,0], ['O4',1,20,0]],
    crystals: [] },

  // 75 — Curtain Call (difficulty 9.4)
  { name: "Curtain Call", drags: 4, drops: 2, cursor: [13,10],
    pieces: [['O4',7,10,0], ['O4',9,10,0], ['O4',13,10,1], ['S4',18,10,0], ['S4',18,10,1], ['S4',18,10,2], ['B3',29,22,0], ['B3',2,22,0]],
    crystals: [[13,10,0], [14,10,0], [13,11,0], [14,11,0]] },

  // 76 — Twin Peaks (difficulty 5.9)
  { name: "Twin Peaks", drags: 0, drops: 2, cursor: [10,13],
    pieces: [['O4',10,13,0], ['O4',10,13,1], ['O4',10,13,2], ['V3',19,14,0], ['V3',19,14,1], ['V3',19,14,2]],
    crystals: [] },

  // 77 — World Tour (difficulty 8.8)
  { name: "World Tour", drags: 5, drops: 3, cursor: [30,6],
    pieces: [['O4',30,6,0], ['O4',1,6,0], ['B3',29,26,0], ['B3',2,26,0], ['V3',14,14,0], ['V3',17,14,0]],
    crystals: [[13,13,0], [13,17,0], [14,13,0], [14,17,0], [15,13,0], [15,17,0], [13,14,0], [15,14,0], [13,15,0], [15,15,0], [13,16,0], [15,16,0]] },

  // 78 — Twin Craters (difficulty 5.0)
  { name: "Twin Craters", drags: 4, drops: 0, cursor: [9,12],
    pieces: [['O4',9,12,0], ['O4',9,12,1], ['O4',13,12,0], ['O4',9,19,0], ['O4',9,19,1], ['O4',13,19,0]],
    crystals: [] },

  // 79 — Gridlock (difficulty 9.4)
  { name: "Gridlock", drags: 6, drops: 3, cursor: [8,14],
    pieces: [['B3',8,11,0], ['B3',8,14,0], ['S4',18,11,0], ['S4',22,11,0], ['L3',12,19,0], ['L3',12,23,0]],
    crystals: [] },

  // 80 — Quicksand (difficulty 6.8)
  { name: "Quicksand", drags: 5, drops: 1, cursor: [18,12],
    pieces: [['B3',9,12,0], ['B3',12,12,0], ['B3',18,12,1], ['V3',13,17,0], ['V3',16,17,0]],
    crystals: [[18,12,0], [19,12,0], [20,12,0], [12,16,0], [12,20,0], [13,16,0], [13,20,0], [14,16,0], [14,20,0], [12,17,0], [14,17,0], [12,18,0], [14,18,0], [12,19,0], [14,19,0]] },

  // 81 — Column Inches (difficulty 4.9)
  { name: "Column Inches", drags: 5, drops: 1, cursor: [15,12],
    pieces: [['V3',11,12,0], ['V3',15,12,0], ['V3',11,17,0]],
    crystals: [] },

  // 82 — The Gauntlet (difficulty 10.7)
  { name: "The Gauntlet", drags: 8, drops: 2, cursor: [11,8],
    pieces: [['O4',5,8,0], ['O4',11,8,0], ['B3',18,14,0], ['B3',18,17,0], ['V3',10,24,0], ['V3',11,24,0], ['V3',14,24,1]],
    crystals: [[7,8,0], [8,8,0], [7,9,0], [8,9,0], [8,8,0], [9,8,0], [8,9,0], [9,9,0], [9,8,0], [10,8,0], [9,9,0], [10,9,0], [10,8,0], [11,8,0], [10,9,0], [11,9,0], [17,13,0], [17,15,0], [18,13,0], [18,15,0], [19,13,0], [19,15,0], [20,13,0], [20,15,0], [21,13,0], [21,15,0], [17,14,0], [21,14,0], [13,24,0], [14,24,0], [13,25,0], [14,25,0], [13,26,0], [14,26,0]] },

  // 83 — Meteor Shower (difficulty 8.8)
  { name: "Meteor Shower", drags: 6, drops: 1, cursor: [14,11],
    pieces: [['O4',8,11,0], ['O4',10,11,0], ['O4',14,11,1], ['V3',18,12,0], ['V3',19,12,0], ['V3',22,12,1], ['T4',12,20,0], ['T4',12,24,0]],
    crystals: [[14,11,0], [15,11,0], [14,12,0], [15,12,0], [21,12,0], [22,12,0], [21,13,0], [22,13,0], [21,14,0], [22,14,0]] },

  // 84 — Drawbridge (difficulty 6.2)
  { name: "Drawbridge", drags: 4, drops: 1, cursor: [13,12],
    pieces: [['S4',13,12,0], ['S4',17,12,0], ['O4',9,21,0], ['O4',11,21,0], ['O4',15,21,1]],
    crystals: [[12,11,0], [12,15,0], [13,11,0], [13,15,0], [14,11,0], [14,15,0], [15,11,0], [15,15,0], [12,12,0], [15,12,0], [12,13,0], [15,13,0], [12,14,0], [15,14,0], [15,21,0], [16,21,0], [15,22,0], [16,22,0]] },

  // 85 — Magnum Opus (difficulty 11.0)
  { name: "Magnum Opus", drags: 7, drops: 2, cursor: [4,4],
    pieces: [['O4',4,4,0], ['O4',8,4,0], ['B3',14,4,0], ['B3',17,4,0], ['B3',23,4,1], ['O4',4,16,0], ['O4',4,16,1], ['O4',8,16,0], ['S4',14,14,0], ['S4',14,14,1]],
    crystals: [[26,22,0], [23,23,0], [26,23,0], [29,23,0], [24,24,0], [26,24,0], [28,24,0], [22,25,0], [23,25,0], [24,25,0], [25,25,0], [27,25,0], [28,25,0], [29,25,0], [30,25,0], [24,26,0], [26,26,0], [28,26,0], [23,27,0], [26,27,0], [29,27,0], [26,28,0], [3,3,0], [3,6,0], [4,3,0], [4,6,0], [5,3,0], [5,6,0], [6,3,0], [6,6,0], [3,4,0], [6,4,0], [3,5,0], [6,5,0], [23,4,0], [24,4,0], [25,4,0]] },

  // 86 — Aqueduct (difficulty 7.3)
  { name: "Aqueduct", drags: 6, drops: 2, cursor: [14,12],
    pieces: [['V3',9,12,0], ['V3',14,12,0], ['S4',17,19,0], ['S4',21,19,0]],
    crystals: [[10,12,0], [10,13,0], [10,14,0], [11,12,0], [11,13,0], [11,14,0], [12,12,0], [12,13,0], [12,14,0], [13,12,0], [13,13,0], [13,14,0]] },

  // 87 — Clean Sweep (difficulty 9.4)
  { name: "Clean Sweep", drags: 0, drops: 4, cursor: [4,6],
    pieces: [['O4',4,6,0], ['O4',6,6,0], ['O4',8,6,0], ['O4',10,6,0], ['B3',20,6,0], ['B3',20,7,0], ['B3',20,8,0], ['T4',4,16,0], ['T4',4,18,0], ['T4',4,20,0], ['S4',18,18,0], ['S4',20,18,0], ['S4',22,18,0]],
    crystals: [] },

  // 88 — Labyrinth (difficulty 6.1)
  { name: "Labyrinth", drags: 4, drops: 2, cursor: [12,12],
    pieces: [['O4',12,12,0], ['O4',16,12,0], ['B3',10,20,0], ['B3',10,23,0]],
    crystals: [[11,11,0], [11,14,0], [12,11,0], [12,14,0], [13,11,0], [13,14,0], [14,11,0], [14,14,0], [11,12,0], [14,12,0], [11,13,0], [14,13,0], [10,21,0], [11,21,0], [12,21,0], [10,22,0], [11,22,0], [12,22,0]] },

  // 89 — Encore (difficulty 10.1)
  { name: "Encore", drags: 7, drops: 2, cursor: [8,10],
    pieces: [['O4',8,10,0], ['O4',8,10,1], ['O4',12,10,0], ['S4',16,10,0], ['S4',20,10,0], ['V3',12,20,0], ['V3',16,20,0]],
    crystals: [[18,10,0], [18,11,0], [19,11,0], [19,12,0], [19,10,0], [19,11,0], [20,11,0], [20,12,0]] },

  // 90 — Night at the Museum (difficulty 9.0)
  { name: "Night at the Museum", drags: 4, drops: 3, cursor: [18,8],
    pieces: [['T4',18,8,0], ['T4',18,12,0], ['V3',8,20,0], ['V3',11,20,0], ['O4',22,22,0], ['O4',22,22,1]],
    crystals: [[2,2,0], [10,2,0], [3,3,0], [9,3,0], [4,4,0], [8,4,0], [5,5,0], [7,5,0], [6,6,0], [5,7,0], [7,7,0], [4,8,0], [8,8,0], [3,9,0], [9,9,0], [2,10,0], [10,10,0], [17,7,0], [17,10,0], [18,7,0], [18,10,0], [19,7,0], [19,10,0], [20,7,0], [20,10,0], [21,7,0], [21,10,0], [17,8,0], [21,8,0], [17,9,0], [21,9,0], [7,19,0], [7,23,0], [8,19,0], [8,23,0], [9,19,0], [9,23,0], [7,20,0], [9,20,0], [7,21,0], [9,21,0], [7,22,0], [9,22,0]] },

  // 91 — Rockfall (difficulty 6.1)
  { name: "Rockfall", drags: 5, drops: 0, cursor: [16,12],
    pieces: [['V3',12,12,0], ['V3',13,12,0], ['V3',16,12,1], ['B3',10,20,0], ['B3',13,20,0], ['B3',19,20,1]],
    crystals: [[15,12,0], [16,12,0], [15,13,0], [16,13,0], [15,14,0], [16,14,0], [19,20,0], [20,20,0], [21,20,0]] },

  // 92 — Lighthouse (difficulty 11.2)
  { name: "Lighthouse", drags: 4, drops: 3, cursor: [15,12],
    pieces: [['V3',15,12,0], ['V3',15,12,1], ['V3',15,12,2], ['V3',15,12,3], ['B3',8,24,0], ['B3',8,28,0], ['O4',30,4,0], ['O4',1,4,0]],
    crystals: [[8,25,0], [9,25,0], [10,25,0], [8,26,0], [9,26,0], [10,26,0], [8,27,0], [9,27,0], [10,27,0]] },

  // 93 — Triathlon (difficulty 9.4)
  { name: "Triathlon", drags: 7, drops: 1, cursor: [15,6],
    pieces: [['B3',6,6,0], ['B3',9,6,0], ['B3',15,6,1], ['O4',20,14,0], ['O4',20,14,1], ['O4',24,14,0], ['T4',6,22,0], ['T4',6,26,0]],
    crystals: [[15,6,0], [16,6,0], [17,6,0], [5,21,0], [5,24,0], [6,21,0], [6,24,0], [7,21,0], [7,24,0], [8,21,0], [8,24,0], [9,21,0], [9,24,0], [5,22,0], [9,22,0], [5,23,0], [9,23,0]] },

  // 94 — Sinkhole (difficulty 8.8)
  { name: "Sinkhole", drags: 6, drops: 1, cursor: [8,10],
    pieces: [['O4',8,10,0], ['O4',8,10,1], ['O4',12,10,0], ['V3',20,12,0], ['V3',21,12,0], ['V3',24,12,1], ['S4',12,20,0], ['S4',16,20,0]],
    crystals: [[23,12,0], [24,12,0], [23,13,0], [24,13,0], [23,14,0], [24,14,0], [11,19,0], [11,23,0], [12,19,0], [12,23,0], [13,19,0], [13,23,0], [14,19,0], [14,23,0], [11,20,0], [14,20,0], [11,21,0], [14,21,0], [11,22,0], [14,22,0]] },

  // 95 — Decathlon (difficulty 12.3)
  { name: "Decathlon", drags: 2, drops: 5, cursor: [7,4],
    pieces: [['O4',4,4,0], ['O4',7,4,0], ['T4',20,4,0], ['T4',20,7,0], ['V3',4,14,0], ['V3',4,14,1], ['S4',20,14,0], ['S4',20,14,1], ['L3',12,24,0], ['L3',12,26,0], ['L3',12,28,0]],
    crystals: [] },

  // 96 — Beehive (difficulty 9.2)
  { name: "Beehive", drags: 2, drops: 3, cursor: [10,12],
    pieces: [['L3',10,12,0], ['L3',10,12,1], ['L3',10,12,2], ['T4',18,12,0], ['T4',18,12,1], ['T4',18,12,2], ['B3',12,20,0], ['B3',12,23,0]],
    crystals: [] },

  // 97 — Cloverleaf (difficulty 10.7)
  { name: "Cloverleaf", drags: 0, drops: 4, cursor: [8,8],
    pieces: [['O4',8,8,0], ['O4',8,8,1], ['O4',8,8,2], ['L3',22,8,0], ['L3',22,8,1], ['L3',22,8,2], ['T4',8,22,0], ['T4',8,22,1], ['T4',8,22,2], ['S4',22,22,0], ['S4',22,22,1], ['S4',22,22,2]],
    crystals: [] },

  // 98 — Grandmaster (difficulty 8.9)
  { name: "Grandmaster", drags: 5, drops: 2, cursor: [12,10],
    pieces: [['T4',12,10,0], ['T4',12,14,0], ['V3',18,16,0], ['V3',19,16,0], ['V3',22,16,1], ['O4',6,18,0], ['O4',6,21,0]],
    crystals: [[11,9,0], [11,12,0], [12,9,0], [12,12,0], [13,9,0], [13,12,0], [14,9,0], [14,12,0], [15,9,0], [15,12,0], [11,10,0], [15,10,0], [11,11,0], [15,11,0], [21,16,0], [22,16,0], [21,17,0], [22,17,0], [21,18,0], [22,18,0]] },

  // 99 — Breakwater (difficulty 11.3)
  { name: "Breakwater", drags: 9, drops: 2, cursor: [11,8],
    pieces: [['S4',6,8,0], ['S4',11,8,0], ['T4',18,8,0], ['T4',18,13,0], ['B3',8,22,0], ['B3',11,22,0], ['B3',17,22,1]],
    crystals: [[8,8,0], [8,9,0], [9,9,0], [9,10,0], [9,8,0], [9,9,0], [10,9,0], [10,10,0], [10,8,0], [10,9,0], [11,9,0], [11,10,0], [18,10,0], [19,10,0], [20,10,0], [19,11,0], [18,11,0], [19,11,0], [20,11,0], [19,12,0], [18,12,0], [19,12,0], [20,12,0], [19,13,0], [17,22,0], [18,22,0], [19,22,0]] },

  // 100 — Century (difficulty 11.6)
  { name: "Century", drags: 6, drops: 3, cursor: [30,4],
    pieces: [['O4',30,4,0], ['O4',1,4,0], ['B3',18,8,0], ['B3',21,8,0], ['B3',27,8,1], ['L3',4,22,0], ['L3',4,26,0], ['T4',24,24,0], ['T4',24,24,1]],
    crystals: [[16,12,0], [13,13,0], [16,13,0], [19,13,0], [14,14,0], [16,14,0], [18,14,0], [12,15,0], [13,15,0], [14,15,0], [15,15,0], [17,15,0], [18,15,0], [19,15,0], [20,15,0], [14,16,0], [16,16,0], [18,16,0], [13,17,0], [16,17,0], [19,17,0], [16,18,0], [27,8,0], [28,8,0], [29,8,0], [3,21,0], [3,24,0], [4,21,0], [4,24,0], [5,21,0], [5,24,0], [6,21,0], [6,24,0], [3,22,0], [6,22,0], [3,23,0], [6,23,0]] },
];

function loadPuzzle(board, cfg) {
  for (const [type, u, v, z] of cfg.pieces) board.addPiece(new Piece(type, u, v, z));
  for (const [u, v, z] of (cfg.crystals || [])) {
    const c = new Piece('C', u, v, z);
    if (board.fits(c, u, v, z)) board.addPiece(c); // decorative art yields to pieces
  }
  board.settle(); // safety: authoring mistakes shouldn't leave floaters
}

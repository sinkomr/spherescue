/* FREE FABLE mode: a rescue-style campaign that frees one Claude model per
 * level, ordered by model capability (per Wikipedia's Claude (AI) model
 * history). Each board is deterministic (seeded) with a distinctive
 * pattern, ramping from a two-shape warmup to six-shape, six-layer digs.
 *
 * The final level holds MYTHOS 5 behind an unbroken crystal shell on the
 * core layer. Under the game's rules that shell is unclearable: crystals
 * only break via same-layer slides or same-layer clears, and a full shell
 * admits neither (magic and power-piece forging are guarded off it).
 * The level is meant to be impossible.
 */
'use strict';

/* ---------------- deterministic rng ---------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------------- top-layer pattern masks ---------------- */

const MASKS = {
  full:    () => true,
  bands:   (u, v) => (v % 8) < 5,
  stripes: (u, v) => ((u + v) % 8) < 5,
  checker: (u, v) => (((u >> 2) + (v >> 2)) % 2) === 0,
  dots:    (u, v) => (u % 6) < 4 && (v % 6) < 4,
  rings:   (u, v) => {
    const du = Math.min(Math.abs(u - 16), 32 - Math.abs(u - 16));
    const dv = Math.min(Math.abs(v - 16), 32 - Math.abs(v - 16));
    return (Math.round(Math.hypot(du, dv)) % 7) < 4;
  },
  spiral:  (u, v) => {
    const du = u - 16, dv = v - 16;
    return ((Math.atan2(dv, du) * 3.5 + Math.hypot(du, dv)) % 4 + 4) % 4 < 2.4;
  },
};

/* ---------------- the campaign ----------------
 * Capability order per the Wikipedia model history (ascending), with
 * Fable 5 penultimate and Mythos 5 last (sealed).
 * family drives the robot's look; sections/speed/layers drive difficulty. */

const FREE_FABLE = [
  { name: 'Claude Instant',    short: 'INSTANT',    family: 'instant', hue: '#ffd23f', year: "'23",
    types: ['O4', 'B3'],                          layers: 1, mask: 'dots',    cover: 0.8, sections: 2,  speedMax: 50, seed: 101 },
  { name: 'Claude 1',          short: 'CLAUDE 1',   family: 'classic', hue: '#d8935f', year: "'23",
    types: ['O4', 'B3'],                          layers: 1, mask: 'bands',   cover: 0.9, sections: 3,  speedMax: 45, seed: 102 },
  { name: 'Claude 2',          short: 'CLAUDE 2',   family: 'classic', hue: '#c8825a', year: "'23",
    types: ['O4', 'B3', 'V3'],                    layers: 2, mask: 'stripes', cover: 0.8, sections: 3,  speedMax: 40, seed: 103 },
  { name: 'Claude 2.1',        short: 'CLAUDE 2.1', family: 'classic', hue: '#c8825a', year: "'23",
    types: ['O4', 'B3', 'V3'],                    layers: 2, mask: 'rings',   cover: 0.85, sections: 4, speedMax: 34, seed: 104 },
  { name: 'Claude 3 Haiku',    short: 'HAIKU 3',    family: 'haiku',   hue: '#5fd86f', year: "'24",
    types: ['O4', 'B3', 'L3'],                    layers: 2, mask: 'checker', cover: 0.9, sections: 5,  speedMax: 30, seed: 105 },
  { name: 'Claude 3 Sonnet',   short: 'SONNET 3',   family: 'sonnet',  hue: '#5f8fe8', year: "'24",
    types: ['O4', 'B3', 'V3', 'L3'],              layers: 3, mask: 'rings',   cover: 0.8, sections: 5,  speedMax: 28, seed: 106 },
  { name: 'Claude 3 Opus',     short: 'OPUS 3',     family: 'opus',    hue: '#a06fe8', year: "'24",
    types: ['O4', 'B3', 'V3', 'L3'],              layers: 3, mask: 'full',    cover: 0.75, sections: 6, speedMax: 26, seed: 107 },
  { name: 'Claude 3.5 Haiku',  short: 'HAIKU 3.5',  family: 'haiku',   hue: '#5fd86f', year: "'24",
    types: ['O4', 'B3', 'V3', 'T4'],              layers: 3, mask: 'dots',    cover: 0.9, sections: 6,  speedMax: 24, seed: 108 },
  { name: 'Claude 3.5 Sonnet', short: 'SONNET 3.5', family: 'sonnet',  hue: '#5f8fe8', year: "'24",
    types: ['O4', 'B3', 'V3', 'L3', 'T4'],        layers: 3, mask: 'stripes', cover: 0.85, sections: 6, speedMax: 22, seed: 109, wild: 0.07 },
  { name: 'Claude 3.7 Sonnet', short: 'SONNET 3.7', family: 'sonnet',  hue: '#5f8fe8', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4'],        layers: 4, mask: 'bands',   cover: 0.8, sections: 5,  speedMax: 21, seed: 110, wild: 0.07, porous: 0.25, bias: 0.82 },
  { name: 'Claude Sonnet 4',   short: 'SONNET 4',   family: 'sonnet',  hue: '#5f8fe8', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4'],        layers: 4, mask: 'rings',   cover: 0.85, sections: 6, speedMax: 19, seed: 111, wild: 0.07, porous: 0.25, bias: 0.82 },
  { name: 'Claude Haiku 4.5',  short: 'HAIKU 4.5',  family: 'haiku',   hue: '#5fd86f', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4'],        layers: 4, mask: 'checker', cover: 0.9, sections: 6,  speedMax: 18, seed: 112, wild: 0.07, porous: 0.25, bias: 0.82 },
  { name: 'Claude Opus 4',     short: 'OPUS 4',     family: 'opus',    hue: '#a06fe8', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 4, mask: 'full',    cover: 0.8, sections: 5,  speedMax: 17, seed: 113, wild: 0.07, porous: 0.35, bias: 0.85 },
  { name: 'Claude Opus 4.1',   short: 'OPUS 4.1',   family: 'opus',    hue: '#a06fe8', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 4, mask: 'spiral',  cover: 0.85, sections: 7, speedMax: 16, seed: 114, wild: 0.08, porous: 0.35, bias: 0.85 },
  { name: 'Claude Sonnet 4.5', short: 'SONNET 4.5', family: 'sonnet',  hue: '#5f8fe8', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 5, mask: 'stripes', cover: 0.85, sections: 7, speedMax: 15, seed: 115, wild: 0.08, porous: 0.35, bias: 0.88 },
  { name: 'Claude Opus 4.5',   short: 'OPUS 4.5',   family: 'opus',    hue: '#a06fe8', year: "'25",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 5, mask: 'rings',   cover: 0.9, sections: 7, speedMax: 14, seed: 116, wild: 0.08, porous: 0.35, bias: 0.88 },
  { name: 'Claude Opus 4.6',   short: 'OPUS 4.6',   family: 'opus',    hue: '#a06fe8', year: "'26",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 5, mask: 'checker', cover: 0.9, sections: 8, speedMax: 13, seed: 117, wild: 0.08, porous: 0.35, bias: 0.88 },
  { name: 'Claude Opus 4.7',   short: 'OPUS 4.7',   family: 'opus',    hue: '#a06fe8', year: "'26",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 5, mask: 'spiral',  cover: 0.92, sections: 8, speedMax: 12, seed: 318, wild: 0.08, porous: 0.35, bias: 0.88 },
  { name: 'Claude Opus 4.8',   short: 'OPUS 4.8',   family: 'opus',    hue: '#a06fe8', year: "'26",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 5, mask: 'full',    cover: 0.85, sections: 7, speedMax: 11, seed: 119, wild: 0.09, porous: 0.4, bias: 0.9 },
  { name: 'Claude Sonnet 5',   short: 'SONNET 5',   family: 'sonnet5', hue: '#7fd8e8', year: "'26",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 5, mask: 'rings',   cover: 0.9, sections: 7, speedMax: 10.5, seed: 320, wild: 0.09, porous: 0.4, bias: 0.9 },
  { name: 'Claude Fable 5',    short: 'FABLE 5',    family: 'fable',   hue: '#ffdf7f', year: "'26",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 6, mask: 'spiral',  cover: 0.9, sections: 7, speedMax: 10, seed: 127, wild: 0.11, porous: 0.55, bias: 0.92 },
  { name: 'Claude Mythos 5',   short: 'MYTHOS 5',   family: 'mythos',  hue: '#8f6fff', year: "'26",
    types: ['O4', 'B3', 'V3', 'L3', 'T4', 'S4'],  layers: 3, mask: 'full',    cover: 0.9, sections: 1,  speedMax: 14, seed: 122,
    sealed: true },
];

/* ---------------- board construction ---------------- */

function buildFreeBoard(board, cfg) {
  const rng = mulberry32(cfg.seed);
  const mask = MASKS[cfg.mask] || MASKS.full;
  const zStart = cfg.sealed ? 1 : 0;

  if (cfg.sealed) {
    // the unbreakable shell: every core cell is a crystal, no real pieces
    for (let v = 0; v < board.H; v++)
      for (let u = 0; u < board.W; u++)
        board.addPiece(new Piece('C', u, v, 0));
  }

  for (let z = zStart; z < zStart + cfg.layers; z++) {
    const isTop = z === zStart + cfg.layers - 1;
    const tries = isTop ? 300 : 420;
    for (let i = 0; i < tries; i++) {
      const type = cfg.types[(rng() * cfg.types.length) | 0];
      const u = (rng() * board.W) | 0, v = (rng() * board.H) | 0;
      const p = new Piece(type, u, v, z);
      if (isTop) {
        let ok = true;
        for (const [cu, cv] of p.cells(board.W, board.H)) if (!mask(cu, cv)) { ok = false; break; }
        if (!ok) continue;
      }
      if (!board.fits(p, u, v, z)) continue;
      if (z > 0 && !board.supported(p, u, v, z)) continue;
      board.addPiece(p);
    }
    if (isTop) {
      // Seed every type onto the surface as TOUCHING PAIRS: on a dense
      // fresh board the only legal opening is dropping onto a member of
      // an existing pair, so each type needs ready-made pairs or early
      // draws are dead pieces.
      const pairOffset = { O4: [2, 0], B3: [0, 1], V3: [1, 0], L3: [0, 2], T4: [0, 2], S4: [2, 0] };
      for (const type of cfg.types) {
        const [pu, pv] = pairOffset[type];
        let pairs = 0;
        for (let i = 0; i < 600 && pairs < 4; i++) {
          const u = (rng() * board.W) | 0, v = (rng() * board.H) | 0;
          const a = new Piece(type, u, v, z);
          const b2 = new Piece(type, u + pu, v + pv, z);
          let ok = true;
          for (const piece of [a, b2]) {
            for (const [cu, cv] of piece.cells(board.W, board.H)) if (!mask(cu, cv)) { ok = false; break; }
            if (!ok) break;
            if (!board.fits(piece, piece.u, piece.v, z)) { ok = false; break; }
            if (z > 0 && !board.supported(piece, piece.u, piece.v, z)) { ok = false; break; }
          }
          // both must fit simultaneously (b2 checked after a is placed)
          if (!ok) continue;
          board.addPiece(a);
          if (!board.fits(b2, b2.u, b2.v, z) || (z > 0 && !board.supported(b2, b2.u, b2.v, z))) {
            board.removePiece(a);
            continue;
          }
          board.addPiece(b2);
          pairs++;
        }
      }
    }
    // crystal padding; deep levels are porous (craggy, faster digs)
    const skipP = (cfg.porous || 0) * ((z - zStart + 1) / cfg.layers);
    for (let v = 0; v < board.H; v++) {
      for (let u = 0; u < board.W; u++) {
        if (board.at(u, v, z)) continue;
        if (isTop && (!mask(u, v) || rng() > cfg.cover)) continue;
        if (!isTop && rng() < skipP) continue;
        if (z > 0 && !board.at(u, v, z - 1)) continue;
        board.addPiece(new Piece('C', u, v, z));
      }
    }
  }
}

/* ---------------- the released robots ---------------- */

/** Draw one animated model-bot at (x,y), radius r, animation clock t. */
function drawRobot(ctx, x, y, r, t, cfg) {
  const bob = Math.sin(t * 2.4) * r * 0.08;
  y += bob;
  const hue = cfg.hue;
  ctx.save();

  // aura
  for (let i = 3; i >= 1; i--) {
    ctx.fillStyle = hexA(hue, 0.05 * i + (cfg.family === 'fable' ? 0.05 : 0));
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + i * 0.28 + 0.05 * Math.sin(t * 3 + i)), 0, Math.PI * 2);
    ctx.fill();
  }

  // thruster flame
  const fl = r * (0.5 + 0.18 * Math.sin(t * 21));
  ctx.fillStyle = hexA('#ff9f3f', 0.85);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.3, y + r * 0.85);
  ctx.lineTo(x, y + r * 0.85 + fl);
  ctx.lineTo(x + r * 0.3, y + r * 0.85);
  ctx.closePath();
  ctx.fill();

  // body
  if (cfg.family === 'classic') {
    rounded(ctx, x - r * 0.85, y - r * 0.75, r * 1.7, r * 1.6, r * 0.25);
    ctx.fillStyle = hue;
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rounded(ctx, x - r * 0.85, y + r * 0.15, r * 1.7, r * 0.7, r * 0.25);
    ctx.fill();
    // CRT scanline mouth
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y + r * 0.42);
    ctx.lineTo(x + r * 0.45, y + r * 0.42);
    ctx.stroke();
  } else {
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.35, r * 0.62, 0, Math.PI);
    ctx.fill();
    // smile
    ctx.strokeStyle = 'rgba(20,20,40,0.75)';
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.18, r * 0.32, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  }

  // eyes (blink)
  const blink = (Math.sin(t * 1.3) > 0.97) ? 0.15 : 1;
  ctx.fillStyle = '#ffffff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * 0.34, y - r * 0.18, r * 0.17, r * 0.17 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1a2038';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * 0.34, y - r * 0.18, r * 0.08, r * 0.08 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // family accessory
  ctx.strokeStyle = hue;
  ctx.fillStyle = hue;
  ctx.lineWidth = Math.max(1.5, r * 0.08);
  const topY = y - r * (cfg.family === 'classic' ? 0.75 : 0.9);
  switch (cfg.family) {
    case 'instant': { // lightning bolt
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x + r * 0.15, topY - r * 0.35);
      ctx.lineTo(x - r * 0.05, topY - r * 0.4);
      ctx.lineTo(x + r * 0.12, topY - r * 0.75);
      ctx.stroke();
      break;
    }
    case 'classic': { // antenna dish
      ctx.beginPath();
      ctx.moveTo(x, topY); ctx.lineTo(x, topY - r * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, topY - r * 0.5, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'haiku': { // sprout
      ctx.strokeStyle = '#8fe89f';
      ctx.beginPath();
      ctx.moveTo(x, topY); ctx.quadraticCurveTo(x + r * 0.1, topY - r * 0.3, x + r * 0.35, topY - r * 0.45);
      ctx.moveTo(x, topY); ctx.quadraticCurveTo(x - r * 0.1, topY - r * 0.3, x - r * 0.3, topY - r * 0.4);
      ctx.stroke();
      break;
    }
    case 'sonnet': case 'sonnet5': { // note antenna
      ctx.beginPath();
      ctx.moveTo(x, topY); ctx.lineTo(x, topY - r * 0.55);
      ctx.lineTo(x + r * 0.3, topY - r * 0.65);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, topY - r * 0.52, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      if (cfg.family === 'sonnet5') { // orbit ring
        ctx.strokeStyle = hexA('#ffffff', 0.6);
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.25, r * 0.4, -0.4 + 0.15 * Math.sin(t * 1.8), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'opus': { // three-spike crown
      for (const s of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.moveTo(x + s * r - r * 0.12, topY);
        ctx.lineTo(x + s * r, topY - r * (s === 0 ? 0.5 : 0.35));
        ctx.lineTo(x + s * r + r * 0.12, topY);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'fable': { // halo + orbiting stars
      ctx.strokeStyle = hexA('#fff2c0', 0.9);
      ctx.lineWidth = Math.max(2, r * 0.09);
      ctx.beginPath();
      ctx.ellipse(x, topY - r * 0.35, r * 0.55, r * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const a = t * 1.6 + i * 2.094;
        star(ctx, x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 0.55 - r * 0.2, r * 0.14);
      }
      break;
    }
    case 'mythos': { // glowing eyes only — drawn as a ghost elsewhere
      break;
    }
  }
  ctx.restore();
}

/** Faint presence inside the sealed core, visible through gaps. */
function drawMythosGhost(ctx, x, y, R, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
  ctx.save();
  ctx.fillStyle = `rgba(90,60,180,${(0.10 + 0.08 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(x, y + R * 0.05, R * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(160,120,255,${(0.35 + 0.35 * pulse).toFixed(3)})`;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * R * 0.09, y - R * 0.02, R * 0.035, R * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function hexA(hex, a) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

if (typeof module !== 'undefined') module.exports = { FREE_FABLE, buildFreeBoard, MASKS, mulberry32 };

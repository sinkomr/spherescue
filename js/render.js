/* Sphere renderer.
 *
 * The board is a flat torus; we render it the way the original faked a
 * sphere: an azimuthal fisheye projection of the wrapping plane around the
 * camera point. A cell at planar offset (du,dv) from the camera maps to an
 * angular distance rho = A*|(du,dv)|, and lands on screen at
 * center + R*(1+layer*LH)*sin(rho)*normalize(du,dv). The result reads as a
 * sphere of blocks you can scroll around forever in any direction.
 */
'use strict';

const VIEW = {
  anglePerCell: 0.19,   // radians of arc per grid cell
  horizon: 1.45,        // rho beyond which cells are culled
  layerH: 0.15,         // radius growth per stacked layer
  lightDir: norm3(-0.38, 0.55, 0.74),
};

/** Deeper layers are dimmer — the strongest at-a-glance height cue. */
function layerShade(z) { return Math.min(1, 0.72 + 0.14 * z); }

function norm3(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }

/** Per-shape colors, matching the original's color coding. */
const SHAPE_COLORS = {
  B3: mk('#e0b52f'),  // yellow horizontal bar
  V3: mk('#3fc548'),  // green vertical bar
  L3: mk('#e05fd0'),  // pink L
  O4: mk('#3f7fe8'),  // blue square
  T4: mk('#e8433f'),  // red T
  S4: mk('#3fd4e8'),  // cyan Z
  C:  mk('#8a93a8'),  // grey crystal
};
function mk(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const c = (m, add = 0) => `rgb(${Math.min(255, r * m + add | 0)},${Math.min(255, g * m + add | 0)},${Math.min(255, b * m + add | 0)})`;
  return { top: c(1), lite: c(1.25, 30), dark: c(0.55), side: c(0.72) };
}

class SphereRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camU = 0; this.camV = 0;   // camera center in grid coords (float)
    this.time = 0;
    this.stars = [];
    for (let i = 0; i < 140; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.4, tw: Math.random() * 6.28 });
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    this.dpr = dpr;
    this.cx = w / 2; this.cy = h / 2;
    this.R = Math.min(w, h) * 0.36 * (this.zoom || 1);
  }

  /** Signed wrapped delta from camera, in cells. */
  wrapDU(u, W) { let d = u - this.camU; d = ((d % W) + W) % W; if (d >= W / 2) d -= W; return d; }
  wrapDV(v, H) { let d = v - this.camV; d = ((d % H) + H) % H; if (d >= H / 2) d -= H; return d; }

  /** Project planar offset (in cells) + layer height (in layers) to screen. */
  project(du, dv, layer) {
    const a = VIEW.anglePerCell;
    const d = Math.hypot(du, dv);
    const rho = d * a;
    if (rho >= Math.PI / 2 - 0.02) {
      // clamp to silhouette so edge quads stay sane
      const s = (Math.PI / 2 - 0.02) / rho;
      return this.project(du * s, dv * s, layer);
    }
    const r = this.R * (1 + layer * VIEW.layerH);
    const sr = Math.sin(rho), cr = Math.cos(rho);
    const nx = d > 1e-6 ? du / d : 0, ny = d > 1e-6 ? dv / d : 0;
    return {
      x: this.cx + r * sr * nx,
      y: this.cy + r * sr * ny,
      depth: cr * (1 + layer * VIEW.layerH),
      n: [sr * nx, -sr * ny, cr],   // outward normal (screen y is flipped)
      rho,
    };
  }

  lambert(n) {
    const L = VIEW.lightDir;
    return Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
  }

  drawBackground(w, h) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070518'); g.addColorStop(0.55, '#0d0a2e'); g.addColorStop(1, '#1a0f38');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      const a = 0.35 + 0.3 * Math.sin(this.time * 1.7 + s.tw);
      ctx.fillStyle = `rgba(200,210,255,${a.toFixed(2)})`;
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
  }

  drawCore() {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(this.cx - this.R * 0.3, this.cy - this.R * 0.35, this.R * 0.1, this.cx, this.cy, this.R);
    g.addColorStop(0, '#4a5a78'); g.addColorStop(0.55, '#26304a'); g.addColorStop(1, '#0d1120');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2);
    ctx.fill();
    // faint circuitry: rings + meridian dots
    ctx.save();
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(120,180,255,0.10)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R * i / 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Build draw list for the board and overlays, then paint far-to-near. */
  drawBoard(board, fx) {
    const { W, H } = board;
    const items = [];
    const a = VIEW.anglePerCell;
    const range = Math.ceil(VIEW.horizon / a) + 1;
    const u0 = Math.round(this.camU), v0 = Math.round(this.camV);

    const seen = new Set();
    for (let dvi = -Math.min(range, Math.floor(H / 2)); dvi <= Math.min(range, Math.ceil(H / 2)); dvi++) {
      for (let dui = -Math.min(range, Math.floor(W / 2)); dui <= Math.min(range, Math.ceil(W / 2)); dui++) {
        const u = ((u0 + dui) % W + W) % W, v = ((v0 + dvi) % H + H) % H;
        const key = v * W + u;
        if (seen.has(key)) continue;
        seen.add(key);
        const du = this.wrapDU(u, W), dv = this.wrapDV(v, H);
        if (Math.hypot(du, dv) * a > VIEW.horizon) continue;
        this.collectColumn(board, u, v, du, dv, items, fx);
      }
    }
    items.sort((p, q) => p.depth - q.depth);
    for (const it of items) it.draw(this.ctx);
    return items.length;
  }

  collectColumn(board, u, v, du, dv, items, fx) {
    for (let z = 0; z < board.occ.length; z++) {
      const piece = board.pieceAt(u, v, z);
      if (!piece) continue;
      this.collectBlock(board, piece, u, v, du, dv, z, items, fx);
    }
  }

  collectBlock(board, piece, u, v, du, dv, z, items, fx) {
    const col = SHAPE_COLORS[piece.type];
    // corner projections for the top face (at layer z+1) and bottom (z)
    const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const top = cs.map(([cu, cvv]) => this.project(du + cu, dv + cvv, z + 1));
    const center = this.project(du, dv, z + 1);
    if (center.depth <= 0.04) return;

    let flash = 0, scale = 1;
    if (piece.state === 'clearing') {
      flash = 0.5 + 0.5 * Math.sin(piece.clearT * 40);
      scale = Math.max(0, 1 - piece.clearT * 2.4);
      if (scale <= 0) return;
    }
    const grabbed = fx && fx.grabbedId === piece.id;

    // crystals: small dim studs, no side faces
    if (piece.crystal) {
      const inset = 0.22;
      const csI = [[-0.5 + inset, -0.5 + inset], [0.5 - inset, -0.5 + inset], [0.5 - inset, 0.5 - inset], [-0.5 + inset, 0.5 - inset]];
      const pts0 = csI.map(([cu, cvv]) => this.project(du + cu, dv + cvv, z + 0.6));
      const lamC = (0.35 + 0.5 * this.lambert(center.n)) * layerShade(z);
      items.push({
        depth: center.depth - 0.001,
        draw: (ctx) => {
          let pts = pts0;
          if (scale !== 1) {
            const mx = pts0.reduce((s, p) => s + p.x, 0) / 4, my = pts0.reduce((s, p) => s + p.y, 0) / 4;
            pts = pts0.map(p => ({ x: mx + (p.x - mx) * scale, y: my + (p.y - my) * scale }));
          }
          ctx.fillStyle = flash > 0 ? '#ffffff' : `rgba(${150 * lamC | 0},${160 * lamC | 0},${185 * lamC | 0},0.95)`;
          poly(ctx, pts);
          ctx.fill();
          ctx.strokeStyle = 'rgba(220,230,255,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        },
      });
      return;
    }
    if (piece.power) flash = Math.max(flash, 0.25 + 0.2 * Math.sin(this.time * 6 + piece.id));

    // Side faces where the neighboring column is lower: opaque, strongly
    // shaded, with a bright rim at the top and a dark seam at the base so
    // ledges read clearly.
    const sides = [[1, 0, 1, 2], [-1, 0, 3, 0], [0, 1, 2, 3], [0, -1, 0, 1]];
    for (const [su, sv, cA, cB] of sides) {
      const samePiece = board.at(u + su, v + sv, z) === piece.id;
      if (samePiece) continue;
      if (board.at(u + su, v + sv, z)) continue; // neighbor covers this side
      const lo = cs.map(([cu, cvv]) => this.project(du + cu, dv + cvv, z));
      const A2 = top[cA], B2 = top[cB], A1 = lo[cA], B1 = lo[cB];
      const shade = (0.30 + 0.55 * this.lambert([su * 0.8, -sv * 0.8, 0.3])) * layerShade(z);
      const depth = (A1.depth + B1.depth) / 2 - 0.002;
      items.push({
        depth,
        draw: (ctx) => {
          ctx.fillStyle = flash > 0 ? '#ffffff' : col.side;
          poly(ctx, [A1, B1, B2, A2]);
          ctx.fill();
          if (flash <= 0) {
            ctx.fillStyle = `rgba(0,0,0,${(1 - Math.min(1, shade)).toFixed(3)})`;
            ctx.fill();
          }
          // bright ledge rim + dark base seam
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(B2.x, B2.y); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.beginPath(); ctx.moveTo(A1.x, A1.y); ctx.lineTo(B1.x, B1.y); ctx.stroke();
        },
      });
    }

    // Top face.
    const lam = (0.45 + 0.62 * this.lambert(center.n)) * layerShade(z);
    const edges = [[0, 1, 0, -1], [1, 2, 1, 0], [2, 3, 0, 1], [3, 0, -1, 0]];
    const internal = edges.map(([, , eu, ev]) => board.at(u + eu, v + ev, z) === piece.id);
    // a taller neighboring stack casts a contact shadow onto this face
    const shadowed = edges.map(([, , eu, ev]) => board.topZ(u + eu, v + ev) > z + 1);
    items.push({
      depth: center.depth,
      draw: (ctx) => {
        let pts = top;
        if (scale !== 1) {
          const mx = top.reduce((s, p) => s + p.x, 0) / 4, my = top.reduce((s, p) => s + p.y, 0) / 4;
          pts = top.map(p => ({ x: mx + (p.x - mx) * scale, y: my + (p.y - my) * scale }));
        }
        ctx.fillStyle = col.top;
        poly(ctx, pts);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = `rgba(0,0,0,${(1 - Math.min(1, lam)).toFixed(3)})`;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (lam > 1) {
          ctx.fillStyle = `rgba(255,255,255,${(lam - 1).toFixed(3)})`;
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${(flash * 0.9).toFixed(3)})`;
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (grabbed) {
          ctx.fillStyle = `rgba(255,255,255,${(0.22 + 0.12 * Math.sin(this.time * 8)).toFixed(3)})`;
          ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        ctx.restore();
        // edges: dark outline on piece boundary, subtle inside
        for (let e = 0; e < 4; e++) {
          const [i1, i2] = edges[e];
          ctx.strokeStyle = internal[e] ? 'rgba(255,255,255,0.10)' : col.dark;
          ctx.lineWidth = internal[e] ? 1 : 2;
          ctx.beginPath();
          ctx.moveTo(pts[i1].x, pts[i1].y);
          ctx.lineTo(pts[i2].x, pts[i2].y);
          ctx.stroke();
        }
        // contact shadow from taller neighbors
        for (let e = 0; e < 4; e++) {
          if (!shadowed[e]) continue;
          const [i1, i2] = edges[e];
          ctx.strokeStyle = 'rgba(0,0,0,0.42)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(pts[i1].x, pts[i1].y);
          ctx.lineTo(pts[i2].x, pts[i2].y);
          ctx.stroke();
        }
      },
    });
  }

  /** Falling piece hovering above its landing spot + landing shadow. */
  drawFalling(board, piece, landZ, hover) {
    const items = [];
    const bob = 0.25 * Math.sin(this.time * 3.2);
    for (const [du0, dv0] of SHAPES[piece.type].cells) {
      const du = this.wrapDU(piece.u + du0, board.W), dv = this.wrapDV(piece.v + dv0, board.H);
      // shadow at landing layer
      const cs = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      const sh = cs.map(([cu, cv]) => this.project(du + cu, dv + cv, landZ));
      items.push({
        depth: 5 + sh[0].depth, draw: (ctx) => {
          ctx.strokeStyle = 'rgba(255,255,255,0.75)';
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.6;
          poly(ctx, sh);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fill();
        },
      });
      // hovering block
      const hz = hover + bob;
      const topPts = cs.map(([cu, cv]) => this.project(du + cu, dv + cv, hz + 0.85));
      const botPts = cs.map(([cu, cv]) => this.project(du + cu, dv + cv, hz));
      const col = SHAPE_COLORS[piece.type];
      const wild = this.wildHeld;
      items.push({
        depth: 6 + topPts[0].depth, draw: (ctx) => {
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = col.side;
          poly(ctx, botPts); ctx.fill();
          ctx.fillStyle = col.top;
          poly(ctx, topPts); ctx.fill();
          if (wild) {
            ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.2 * Math.sin(this.time * 9)).toFixed(2)})`;
            ctx.fill();
          }
          ctx.strokeStyle = wild ? '#ffffff' : col.lite;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        },
      });
    }
    items.sort((p, q) => p.depth - q.depth);
    for (const it of items) it.draw(this.ctx);
  }

  render(board, opts) {
    this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (opts && opts.shake) {
      ctx.translate((Math.random() - 0.5) * opts.shake * 22, (Math.random() - 0.5) * opts.shake * 22);
    }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.drawBackground(w, h);
    this.drawCore();
    this.drawBoard(board, opts && opts.fx);
    if (opts && opts.falling) {
      this.wildHeld = !!opts.wild;
      this.drawFalling(board, opts.falling, opts.landZ, opts.hover);
    }
    if (opts && opts.particles) opts.particles.draw(ctx, this);
  }
}

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

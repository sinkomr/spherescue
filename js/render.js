/* Sphere renderer.
 *
 * The board is a flat torus; we render it the way the original faked a
 * sphere: an azimuthal fisheye projection of the wrapping plane around the
 * camera point. A cell at planar offset (du,dv) from the camera maps to an
 * angular distance rho = A*|(du,dv)|, and lands on screen at
 * center + R*(1+layer*LH)*sin(rho)*normalize(du,dv). The result reads as a
 * sphere of blocks you can scroll around forever in any direction.
 *
 * Legibility follows the original's playbook: the core is a near-black pit,
 * deeper layers render dimmer, exposed walls are strongly shaded slabs with
 * lit rims, pieces are separated by dark gutters and beveled edges, and
 * taller neighbors cast contact shadows.
 *
 * Everything is flat computed colors — no per-quad gradients or clips —
 * to keep the frame under budget.
 */
'use strict';

const VIEW = {
  anglePerCell: 0.24,   // radians of arc per grid cell (~12 cells across, chunky)
  horizon: 1.36,        // rho beyond which cells are culled
  layerH: 0.15,         // radius growth per stacked layer
  lightDir: norm3(-0.38, 0.55, 0.74),
};

function norm3(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }

/** Deeper layers are dimmer — the strongest at-a-glance height cue. */
function layerShade(z) { return Math.min(1, 0.72 + 0.14 * z); }

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
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const c = (m, add = 0) => `rgb(${Math.min(255, rgb[0] * m + add | 0)},${Math.min(255, rgb[1] * m + add | 0)},${Math.min(255, rgb[2] * m + add | 0)})`;
  return { rgb, top: c(1), lite: c(1.25, 30), dark: c(0.55), side: c(0.72) };
}
function tint(rgb, m) {
  return `rgb(${Math.min(255, rgb[0] * m) | 0},${Math.min(255, rgb[1] * m) | 0},${Math.min(255, rgb[2] * m) | 0})`;
}
function lerpPt(p, q, t) { return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }

const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
// edge e joins corner e and e+1; its outward cell direction:
const EDGE_DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];

class SphereRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camU = 0; this.camV = 0;   // camera center in grid coords (float)
    this.time = 0;
    this.zoom = 1;
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
    if (this.mobile && h > w) {
      // portrait phone: sphere in the upper area, controls own the bottom
      this.cx = w / 2;
      this.cy = h * 0.36;
      this.R = Math.min(w * 0.46, h * 0.26) * (this.zoom || 1);
    } else if (this.mobile) {
      // landscape: controls flank the sphere
      this.cx = w / 2;
      this.cy = h * 0.46;
      this.R = Math.min(w * 0.3, h * 0.36) * (this.zoom || 1);
    } else {
      this.cx = w / 2;
      this.cy = h / 2;
      this.R = Math.min(w, h) * 0.36 * (this.zoom || 1);
    }
  }

  /** Signed wrapped delta from camera, in cells. */
  wrapDU(u, W) { let d = u - this.camU; d = ((d % W) + W) % W; if (d >= W / 2) d -= W; return d; }
  wrapDV(v, H) { let d = v - this.camV; d = ((d % H) + H) % H; if (d >= H / 2) d -= H; return d; }

  /** Project planar offset (in cells) + layer height (in layers) to screen. */
  project(du, dv, layer) {
    const a = VIEW.anglePerCell;
    const d = Math.hypot(du, dv);
    // clamp to just inside the silhouette so edge quads stay sane
    const rho = Math.min(d * a, Math.PI / 2 - 0.02);
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

  projectCorners(du, dv, layer) {
    return CORNERS.map(([cu, cv]) => this.project(du + cu, dv + cv, layer));
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
    // The core must read as a deep dark pit under the pieces — exposed
    // holes being nearly black is what makes surrounding heights legible.
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(this.cx - this.R * 0.25, this.cy - this.R * 0.3, this.R * 0.1, this.cx, this.cy, this.R);
    g.addColorStop(0, '#141a2e'); g.addColorStop(0.6, '#0a0e1d'); g.addColorStop(1, '#030409');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2);
    ctx.fill();
    // faint glowing circuitry so the pit isn't a void
    ctx.save();
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(90,160,255,0.09)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R * i / 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const t = this.time;
    for (let i = 0; i < 24; i++) {
      const a = i * 2.61799 + t * 0.15, r = this.R * (0.15 + 0.8 * ((i * 0.381) % 1));
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
      ctx.fillStyle = `rgba(110,190,255,${(0.08 + 0.16 * tw).toFixed(2)})`;
      ctx.fillRect(this.cx + Math.cos(a) * r - 1.5, this.cy + Math.sin(a) * r - 1.5, 3, 3);
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
    let any = false;
    for (let z = 0; z < board.occ.length; z++) {
      const piece = board.pieceAt(u, v, z);
      if (!piece) continue;
      any = true;
      this.collectBlock(board, piece, u, v, du, dv, z, items, fx);
    }
    if (!any) {
      // empty column: darken the exposed core near tall walls so holes
      // read as pits, not patches
      let wall = 0;
      for (const [su, sv] of EDGE_DIR) {
        wall = Math.max(wall, board.topZ(u + su, v + sv));
      }
      if (wall > 0) {
        const pts = this.projectCorners(du, dv, 0.02);
        const alpha = Math.min(0.62, 0.18 + wall * 0.13).toFixed(2);
        items.push({
          depth: pts[0].depth - 0.01,
          draw: (ctx) => {
            ctx.fillStyle = `rgba(0,2,8,${alpha})`;
            poly(ctx, pts);
            ctx.fill();
          },
        });
      }
    }
  }

  collectBlock(board, piece, u, v, du, dv, z, items, fx) {
    const col = SHAPE_COLORS[piece.type];
    const center = this.project(du, dv, z + 1);
    if (center.depth <= 0.04) return;

    let flash = 0, scale = 1;
    if (piece.state === 'clearing') {
      flash = 0.5 + 0.5 * Math.sin(piece.clearT * 40);
      scale = Math.max(0, 1 - piece.clearT * 2.4);
      if (scale <= 0) return;
    }
    const grabbed = fx && fx.grabbedId === piece.id;

    // crystals: small grounded studs, no side faces
    if (piece.crystal) {
      this.collectCrystal(center, du, dv, z, flash, scale, items);
      return;
    }
    if (piece.power) flash = Math.max(flash, 0.25 + 0.2 * Math.sin(this.time * 6 + piece.id));

    const top = this.projectCorners(du, dv, z + 1);

    // Side walls where the neighboring column is open at this layer.
    let lo = null;
    for (let e = 0; e < 4; e++) {
      const [su, sv] = EDGE_DIR[e];
      if (board.at(u + su, v + sv, z)) continue; // occupied (or same piece) covers this side
      if (!lo) lo = this.projectCorners(du, dv, z);
      const cA = e, cB = (e + 1) % 4;
      const A2 = top[cA], B2 = top[cB], A1 = lo[cA], B1 = lo[cB];
      const shade = (0.30 + 0.55 * this.lambert([su * 0.8, -sv * 0.8, 0.3])) * layerShade(z);
      const fill = flash > 0 ? '#ffffff' : tint(col.rgb, 0.24 + 0.72 * shade);
      const depth = (A1.depth + B1.depth) / 2 - 0.002;
      items.push({
        depth,
        draw: (ctx) => {
          ctx.fillStyle = fill;
          poly(ctx, [A1, B1, B2, A2]);
          ctx.fill();
          // bright ledge rim + dark base seam
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(A2.x, A2.y); ctx.lineTo(B2.x, B2.y); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.beginPath(); ctx.moveTo(A1.x, A1.y); ctx.lineTo(B1.x, B1.y); ctx.stroke();
        },
      });
    }

    // Top face — skip entirely when a resting piece sits on it (invisible).
    const above = board.pieceAt(u, v, z + 1);
    if (above && above.state === 'resting' && scale === 1) return;

    const lam = (0.45 + 0.62 * this.lambert(center.n)) * layerShade(z);
    const fillTop = tint(col.rgb, Math.min(1.2, lam));
    // edge e of the face borders cell (u,v)+EDGE_DIR[e]
    const internal = EDGE_DIR.map(([eu, ev]) => board.at(u + eu, v + ev, z) === piece.id);
    const shadowed = EDGE_DIR.map(([eu, ev], e) => !internal[e] && board.topZ(u + eu, v + ev) > z + 1);
    // bevel: lit on top/left boundary edges, shadowed on bottom/right
    const bevelCol = ['rgba(255,255,255,0.34)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.32)', 'rgba(255,255,255,0.22)'];
    const time = this.time;
    items.push({
      depth: center.depth,
      draw: (ctx) => {
        let pts = top;
        if (scale !== 1) {
          const mx = (top[0].x + top[1].x + top[2].x + top[3].x) / 4;
          const my = (top[0].y + top[1].y + top[2].y + top[3].y) / 4;
          pts = top.map(p => ({ x: mx + (p.x - mx) * scale, y: my + (p.y - my) * scale }));
        }
        ctx.fillStyle = fillTop;
        poly(ctx, pts);
        ctx.fill();
        if (flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${(flash * 0.9).toFixed(3)})`;
          ctx.fill();
        }
        if (grabbed) {
          ctx.fillStyle = `rgba(255,255,255,${(0.22 + 0.12 * Math.sin(time * 8)).toFixed(3)})`;
          ctx.fill();
        }
        // face centroid + cell pixel size for inset strokes
        const mx = (pts[0].x + pts[2].x) / 2, my = (pts[0].y + pts[2].y) / 2;
        const cellPx = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        // bevels and contact shadows as inset strokes (no clipping needed)
        for (let e = 0; e < 4; e++) {
          if (internal[e]) continue;
          const p1 = lerpPt(pts[e], { x: mx, y: my }, 0.13);
          const p2 = lerpPt(pts[(e + 1) % 4], { x: mx, y: my }, 0.13);
          ctx.strokeStyle = shadowed[e] ? 'rgba(0,0,0,0.45)' : bevelCol[e];
          ctx.lineWidth = Math.max(2, cellPx * (shadowed[e] ? 0.24 : 0.16));
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        // dark gutter around the piece, faint seams inside it
        for (let e = 0; e < 4; e++) {
          ctx.strokeStyle = internal[e] ? 'rgba(255,255,255,0.08)' : 'rgba(5,8,18,0.85)';
          ctx.lineWidth = internal[e] ? 1 : 2.5;
          ctx.beginPath();
          ctx.moveTo(pts[e].x, pts[e].y);
          ctx.lineTo(pts[(e + 1) % 4].x, pts[(e + 1) % 4].y);
          ctx.stroke();
        }
      },
    });
  }

  collectCrystal(center, du, dv, z, flash, scale, items) {
    const base = this.projectCorners(du, dv, z + 0.06).map(p => lerpPt(p, center, 0.08));
    const stud = this.projectCorners(du, dv, z + 0.6).map(p => lerpPt(p, center, 0.34));
    const lamC = (0.35 + 0.5 * this.lambert(center.n)) * layerShade(z);
    const fill = flash > 0 ? '#ffffff' : tint(SHAPE_COLORS.C.rgb, lamC);
    items.push({
      depth: center.depth - 0.001,
      draw: (ctx) => {
        let b = base, s = stud;
        if (scale !== 1) {
          b = base.map(p => lerpPt(p, center, 1 - scale));
          s = stud.map(p => lerpPt(p, center, 1 - scale));
        }
        // grounding skirt so exposed crystals don't float
        ctx.fillStyle = 'rgba(4,6,14,0.55)';
        poly(ctx, b);
        ctx.fill();
        ctx.fillStyle = fill;
        poly(ctx, s);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220,230,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
      const sh = this.projectCorners(du, dv, landZ);
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
      const topPts = this.projectCorners(du, dv, hz + 0.85);
      const botPts = this.projectCorners(du, dv, hz);
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
    if (opts && opts.coreGhost) drawMythosGhost(ctx, this.cx, this.cy, this.R, this.time);
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

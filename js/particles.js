/* Lightweight particle system for clears, combos, and landing dust. */
'use strict';

class Particles {
  constructor() { this.list = []; }

  burst(x, y, color, n = 14, speed = 120) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
        life: 0.55 + Math.random() * 0.4, t: 0,
        size: 2 + Math.random() * 3, color,
      });
    }
  }

  text(x, y, str, color = '#fff', size = 20) {
    this.list.push({ x, y, vx: 0, vy: -46, life: 1.1, t: 0, str, color, size });
  }

  update(dt) {
    for (const p of this.list) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.str) p.vy += 220 * dt;
    }
    this.list = this.list.filter(p => p.t < p.life);
  }

  draw(ctx) {
    for (const p of this.list) {
      const a = Math.max(0, 1 - p.t / p.life);
      if (p.str) {
        ctx.font = `bold ${p.size}px 'Trebuchet MS', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.fillText(p.str, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Ảnh mẫu tự sinh để thử lò rèn và quy trình mà không cần Codex: flipbook vệt chém trên nền đen (lưới n×n) và bản trong suốt.
import { newRaster, type Raster } from './forge.js';

const hash = (x: number, y: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Flipbook vệt chém cong: khung f vẽ cung dài ra dần rồi mỏng dần; màu lam ngọc, viền sáng. `bg: 'black'` cho ảnh nền đen, `'alpha'` cho nền trong suốt. */
export function sampleSlashFlipbook(n: number, cell: number, bg: 'black' | 'alpha'): Raster {
  const W = n * cell;
  const r = newRaster(W, W);
  const frames = n * n;
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1);
    const cx0 = (f % n) * cell;
    const cy0 = Math.floor(f / n) * cell;
    const reach = Math.min(1, t * 2.2); // cung mọc dài ra trong nửa đầu
    const fade = t < 0.5 ? 1 : 1 - (t - 0.5) * 2; // rồi tan
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const u = (x + 0.5) / cell - 0.5;
        const v = (y + 0.5) / cell - 0.5;
        // cung tròn tâm lệch (0,-0.6), bán kính 0.62; độ dày giảm dần về hai đầu
        const dx = u;
        const dy = v + 0.6;
        const rad = Math.hypot(dx, dy);
        const ang = Math.atan2(dx, dy); // 0 ở giữa cung
        const d = Math.abs(rad - 0.62);
        const span = 0.75 * reach;
        const thick = 0.07 * (1 - Math.min(1, Math.abs(ang) / Math.max(span, 1e-3))) * (0.6 + 0.4 * (1 - t));
        let a = Math.abs(ang) <= span && thick > 0 ? Math.max(0, 1 - d / thick) : 0;
        a *= fade * (0.85 + 0.15 * hash(x + cx0, y + cy0));
        a = Math.min(1, a * 1.4);
        const i = ((cy0 + y) * W + cx0 + x) * 4;
        // lõi trắng lam, viền lam ngọc
        const core = Math.max(0, 1 - d / Math.max(thick * 0.4, 1e-3));
        const cr = 0.17 + 0.8 * core;
        const cg = 0.78 + 0.2 * core;
        const cb = 0.86 + 0.14 * core;
        if (bg === 'black') {
          r.data[i] = cr * a;
          r.data[i + 1] = cg * a;
          r.data[i + 2] = cb * a;
          r.data[i + 3] = 1;
        } else {
          r.data[i] = cr;
          r.data[i + 1] = cg;
          r.data[i + 2] = cb;
          r.data[i + 3] = a;
        }
      }
    }
  }
  return r;
}

/** Noise lát được (value noise tuần hoàn), xám, để làm bản đồ ăn mòn. */
export function sampleTileNoise(size: number): Raster {
  const r = newRaster(size, size);
  const g = 8;
  const lat = (x: number, y: number) => hash(((x % g) + g) % g, ((y % g) + g) % g);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * g;
      const v = (y / size) * g;
      const ix = Math.floor(u);
      const iy = Math.floor(v);
      const fx = u - ix;
      const fy = v - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = lat(ix, iy);
      const b = lat(ix + 1, iy);
      const c = lat(ix, iy + 1);
      const d = lat(ix + 1, iy + 1);
      const val = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      const i = (y * size + x) * 4;
      r.data[i] = r.data[i + 1] = r.data[i + 2] = val;
      r.data[i + 3] = 1;
    }
  }
  return r;
}

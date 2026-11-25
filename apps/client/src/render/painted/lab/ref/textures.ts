// Dựa trên painted-valley/src/lib/noise.js và src/valley/strokes.js (MIT, © 2026 Patch; xem assets/LICENSES.md). Dịch từng dòng sang
// TypeScript, giữ nguyên hạt giống, số trường, số quãng tám, kích thước: texture ra phải giống từng byte. Chỉ dùng cho cảnh thử `?paintedlab=1`.
import * as THREE from 'three/webgpu';

export function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise on a lattice of `period` cells that wraps, in 2D. Returns a function of (x, y) in cells, 0..1. */
function lattice2(period: number, random: () => number): (x: number, y: number) => number {
  const v = new Float32Array(period * period);
  for (let i = 0; i < v.length; i++) v[i] = random();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = fade(x - xi);
    const fy = fade(y - yi);
    const x0 = ((xi % period) + period) % period;
    const y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const a = v[x0 + y0 * period]!;
    const b = v[x1 + y0 * period]!;
    const c = v[x0 + y1 * period]!;
    const d = v[x1 + y1 * period]!;
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/**
 * A size × size RGBA texture of four different smooth fields (fbm, 5 octaves), each tiling. With `fine` it is
 * 16 bits a channel and has no mipmaps: for reading it stretched over a large area, where 8 bits show as steps.
 */
export function smoothNoiseTexture(size = 256, seed = 11, fine = false): THREE.DataTexture {
  const random = mulberry(seed);
  const data = fine ? new Uint16Array(size * size * 4) : new Uint8Array(size * size * 4);
  for (let c = 0; c < 4; c++) {
    const octaves: { period: number; at: (x: number, y: number) => number }[] = [];
    let period = 4;
    for (let o = 0; o < 5; o++) {
      octaves.push({ period, at: lattice2(period, random) });
      period *= 2;
    }
    const field = new Float32Array(size * size);
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let amp = 0.5;
        for (const o of octaves) {
          sum += amp * o.at((x / size) * o.period, (y / size) * o.period);
          amp *= 0.5;
        }
        field[x + y * size] = sum;
        lo = Math.min(lo, sum);
        hi = Math.max(hi, sum);
      }
    }
    for (let i = 0; i < field.length; i++) {
      const v = (field[i]! - lo) / (hi - lo);
      data[i * 4 + c] = fine ? THREE.DataUtils.toHalfFloat(v) : Math.round(v * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, fine ? THREE.HalfFloatType : THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = fine ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = !fine;
  tex.needsUpdate = true;
  return tex;
}

/** White noise, four channels, read with nearest so each texel is one clump of grass. */
export function whiteNoiseTexture(size = 256, seed = 5): THREE.DataTexture {
  const random = mulberry(seed);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(random() * 256);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Brushwork (strokes.js): tone in red (half is none), stones in blue. */
export function createStrokes(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const random = mulberry(8128);
  g.fillStyle = 'rgb(128,0,0)';
  g.fillRect(0, 0, size, size);
  /** An ellipse, drawn again wherever it crosses an edge, so the picture repeats without a seam. */
  const mark = (x: number, y: number, rx: number, ry: number, turn: number, style: string): void => {
    g.fillStyle = style;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -rx - ry || x + ox > size + rx + ry || y + oy < -rx - ry || y + oy > size + rx + ry) continue;
        g.beginPath();
        g.ellipse(x + ox, y + oy, rx, ry, turn, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
  // broad soft patches first, then strokes on them, then small dabs
  for (let i = 0; i < 70; i++)
    mark(
      random() * size,
      random() * size,
      26 + random() * 44,
      12 + random() * 20,
      random() * Math.PI,
      `rgba(${random() < 0.5 ? 86 : 172},0,0,0.5)`,
    );
  for (let i = 0; i < 420; i++) {
    const tone = random() < 0.52 ? 40 + random() * 60 : 160 + random() * 80;
    mark(random() * size, random() * size, 7 + random() * 16, 2 + random() * 4, random() * Math.PI, `rgba(${Math.round(tone)},0,0,0.85)`);
  }
  for (let i = 0; i < 900; i++) {
    const tone = random() < 0.5 ? 30 + random() * 60 : 170 + random() * 85;
    mark(random() * size, random() * size, 2 + random() * 4, 1 + random() * 2, random() * Math.PI, `rgb(${Math.round(tone)},0,0)`);
  }
  // stones, in loose groups
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 9; k++) {
    const cx = random() * size;
    const cy = random() * size;
    const n = 2 + Math.floor(random() * 5);
    for (let i = 0; i < n; i++) {
      mark(cx + (random() - 0.5) * 90, cy + (random() - 0.5) * 90, 4 + random() * 9, 3 + random() * 5, random() * Math.PI, 'rgb(0,0,255)');
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // (always seen at a low angle)
  texture.anisotropy = 16;
  return texture;
}

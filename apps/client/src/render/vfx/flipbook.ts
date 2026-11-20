import * as THREE from 'three/webgpu';
import { clamp, float, floor, fract, min, mix, texture, uv, vec2 } from 'three/tsl';
import { FLIP_ATLASES } from '@dtl/shared';
import type { FxUniforms, N } from './common';

/**
 * Flipbook VFX (VS-1): bốn atlas 4×4 khung (khói mực, tia lửa, bụi đá, nét bút) gộp trong MỘT texture RGBA, sinh THỦ TỤC (không file ảnh,
 * không tải mạng; chạy được cả trong test). R = độ sáng, A = độ phủ. Thay bằng atlas vẽ tay (Codex/Blender) sau này chỉ cần đổi
 * `makeFlipSheet`/`flipTexture`, shader và timeline giữ nguyên.
 *
 * Bố cục: tấm `SHEET`², 2×2 atlas (id = chỉ số trong `FLIP_ATLASES`; id 0 ở góc dưới-trái theo v), mỗi atlas 4×4 khung `FRAME`² px,
 * khung f ở cột f%4, hàng ⌊f/4⌋ (hàng 0 là v thấp nhất). Bản đồ toàn bộ vẽ theo hệ UV (v hướng lên), nên không phải lật ảnh.
 */
export const FLIP_COLS = 4;
export const FLIP_FRAMES = FLIP_COLS * FLIP_COLS;
export const FLIP_SHEET = 1024;

const hash = (x: number, y: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const fbm = (x: number, y: number): number => vnoise(x, y) * 0.5 + vnoise(x * 2.03, y * 2.03) * 0.3 + vnoise(x * 4.1, y * 4.1) * 0.2;

/** Một điểm (u, v trong khung, v hướng lên) của khung t∈[0,1] của atlas `id` → [độ sáng, độ phủ] đều trong 0..1. */
export function flipSample(id: number, u: number, v: number, t: number): [number, number] {
  const fade = 1 - smooth(0.62, 1, t);
  switch (id) {
    case 0: {
      // Khói mực: khối nở từ giữa, mép ăn mòn dần theo nhiễu, tan ở cuối.
      const cx = 0.5;
      const cy = 0.42 + 0.12 * t;
      const r = 0.16 + 0.3 * Math.sqrt(t);
      const d = Math.hypot(u - cx, (v - cy) * 1.1) / r;
      const n = fbm(u * 4 + 3.1 + t * 0.9, v * 4 - t * 1.4);
      const dens = smooth(1.12, 0.15, d + (n - 0.5) * (0.55 + t * 0.9));
      const a = Math.min(1, Math.max(0, (dens - t * 0.5) * 2.4)) * fade;
      return [0.3 + 0.7 * dens * (0.6 + 0.4 * n), a];
    }
    case 1: {
      // Tia lửa/vụn kiếm: lõi chớp + tia tỏa, dài ra rồi tắt nhanh.
      const dx = u - 0.5;
      const dy = v - 0.5;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const ray = Math.pow(Math.abs(Math.sin(ang * 9 + Math.floor(ang * 3.1) * 1.7)), 7) * (0.55 + 0.45 * hash(Math.floor(ang * 9), 2));
      const len = 0.1 + 0.4 * (1 - (1 - t) * (1 - t));
      const body = smooth(len, len * 0.3, d) * ray;
      const core = Math.exp(-d * 16) * (1 - t) * 1.2;
      const a = Math.min(1, body * (1 - t * t) + core);
      return [1, a];
    }
    case 2: {
      // Bụi đá tung: ba cụm nở lên cao, mỏng dần.
      let dens = 0;
      for (let i = 0; i < 3; i++) {
        const cx = 0.5 + (i - 1) * 0.17;
        const cy = 0.24 + t * (0.28 + 0.1 * i);
        const r = 0.1 + (0.14 + 0.04 * i) * Math.sqrt(t);
        dens = Math.max(dens, smooth(1, 0.2, Math.hypot(u - cx, v - cy) / r));
      }
      const n = fbm(u * 5 + 7.7, v * 5 - t);
      const a = Math.min(1, Math.max(0, dens * (0.45 + n * 0.9) - t * 0.15)) * (1 - smooth(0.5, 1, t));
      return [0.55 + 0.4 * n, a];
    }
    default: {
      // Nét bút: vệt thon hai đầu quét từ trái sang phải, bút khô (sọc theo chiều dài), đuôi mòn trước.
      const head = 1 - (1 - Math.min(1, t * 1.5)) ** 2;
      const half = 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.85);
      const dy = v - 0.5 - 0.06 * Math.sin(u * 3.4);
      const inside = smooth(half, half * 0.55, Math.abs(dy));
      const dry = 0.55 + 0.45 * vnoise(u * 2.2 + 11, v * 46);
      const reveal = smooth(head, head - 0.12, u);
      const tail = smooth(Math.max(0, t * 1.25 - 0.25), t * 1.25 + 0.1, u);
      return [0.75 + 0.25 * dry, inside * dry * reveal * (1 - tail) * (1 - smooth(0.78, 1, t))];
    }
  }
}

/** Sinh cả tấm flipbook (RGBA 8 bit). Thuần, xác định: cùng đầu vào cùng kết quả. */
export function makeFlipSheet(size = FLIP_SHEET): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const atlas = size / 2;
  const frame = atlas / FLIP_COLS;
  for (let id = 0; id < FLIP_ATLASES.length; id++) {
    const ox = (id % 2) * atlas;
    const oy = Math.floor(id / 2) * atlas;
    for (let f = 0; f < FLIP_FRAMES; f++) {
      const fx = ox + (f % FLIP_COLS) * frame;
      const fy = oy + Math.floor(f / FLIP_COLS) * frame;
      const t = f / (FLIP_FRAMES - 1);
      for (let py = 0; py < frame; py++) {
        for (let px = 0; px < frame; px++) {
          const [r, a] = flipSample(id, (px + 0.5) / frame, (py + 0.5) / frame, t);
          const i = ((fy + py) * size + fx + px) * 4;
          const b = Math.round(Math.min(1, Math.max(0, r)) * 255);
          out[i] = b;
          out[i + 1] = b;
          out[i + 2] = b;
          out[i + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
        }
      }
    }
  }
  return out;
}

let sheet: THREE.DataTexture | null = null;

/** Texture flipbook dùng chung (sinh một lần, lười ở lần shader `flip` biên dịch đầu). */
export function flipTexture(): THREE.DataTexture {
  if (sheet) return sheet;
  sheet = new THREE.DataTexture(makeFlipSheet(), FLIP_SHEET, FLIP_SHEET, THREE.RGBAFormat);
  sheet.colorSpace = THREE.NoColorSpace;
  sheet.magFilter = THREE.LinearFilter;
  sheet.minFilter = THREE.LinearFilter;
  sheet.generateMipmaps = false;
  sheet.wrapS = THREE.ClampToEdgeWrapping;
  sheet.wrapT = THREE.ClampToEdgeWrapping;
  sheet.needsUpdate = true;
  return sheet;
}

/**
 * Shader `flip`: khung hiện tại = ⌊k × 16⌋ (k = tiến độ vòng đời), trộn mềm với khung kế. `fxA.x` = id atlas. Màu = màu nhánh × độ sáng khung,
 * thêm viền sáng `fxB.rgb` ở chỗ đậm; độ trong = độ phủ khung. Hòa trộn thường (khói/bụi đọc được cả nền sáng).
 */
export function flipNodes(U: FxUniforms): { color: N; opacity: N } {
  const q = uv();
  const id = U.a.x;
  const kk = clamp(U.k, 0, 0.9999).mul(FLIP_FRAMES - 1);
  const f0 = floor(kk);
  const f1 = min(f0.add(1), FLIP_FRAMES - 1);
  const blend = fract(kk);
  const origin = vec2(id.sub(floor(id.div(2)).mul(2)), floor(id.div(2))).mul(0.5);
  const cell = (f: N) => {
    const row = floor(f.div(FLIP_COLS));
    const col = f.sub(row.mul(FLIP_COLS));
    return origin.add(
      vec2(col, row)
        .add(clamp(q, 0.012, 0.988))
        .mul(0.5 / FLIP_COLS),
    );
  };
  const s = mix(texture(flipTexture(), cell(f0)), texture(flipTexture(), cell(f1)), blend);
  const lit = U.color.mul(float(0.5).add(s.r.mul(0.9))).add(U.b.xyz.mul(s.r.mul(s.r).mul(0.4)));
  return { color: min(lit, U.maxHdr), opacity: U.opacity.mul(s.a) };
}

import { dot, floor, fract, Fn, mix, sin, vec2 } from 'three/tsl';

/** Kiểu node TSL dùng chung trong các builder hiệu ứng (giữ lỏng để ghép phép toán tự do). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type N = any;

/**
 * Uniform theo lưới của `FxMesh` (render/materials/vfx.ts) mà builder shader hiệu ứng đọc.
 * Truyền vào builder thay vì import để tránh vòng import với file material.
 */
export interface FxUniforms {
  /** Màu tuyến tính của lưới. */
  color: N;
  opacity: N;
  /** Tiến độ 0..1 của hiệu ứng (lõi nóng lúc đầu). */
  k: N;
  /** Tham số riêng theo kiểu (vec4), xem từng builder. */
  a: N;
  b: N;
  /** Đỉnh màu HDR một lớp. */
  maxHdr: number;
}

/** Hash 2D → 0..1 rẻ (sin), đủ cho hiệu ứng: đối số luôn nhỏ (< vài nghìn). */
export const hash21 = Fn(([p]: N[]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));

/** Nhiễu giá trị 2D mượt (0..1), 4 lần hash. Chạy như nhau trên WebGPU và WebGL2. */
export const vnoise = Fn(([p]: N[]) => {
  const i = floor(p);
  const f = fract(p);
  const w = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash21(i);
  const b = hash21(i.add(vec2(1, 0)));
  const c = hash21(i.add(vec2(0, 1)));
  const d = hash21(i.add(vec2(1, 1)));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
});

/**
 * RNG theo seed (mulberry32), trả 0..1. Dùng cho hình có seed từ server (tia sét, vị trí mưa kiếm):
 * cùng seed thì mọi client ra cùng một dãy số, không phụ thuộc thứ tự gọi `Math.random` khác.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed nhận từ mạng: số nguyên không âm hợp lệ thì dùng, không thì sinh ngẫu nhiên tại chỗ (server cũ). */
export function seedOr(sd: unknown): number {
  return typeof sd === 'number' && Number.isFinite(sd) ? Math.floor(Math.abs(sd)) >>> 0 : Math.floor(Math.random() * 0x7fffffff);
}

import { fbm } from '@dtl/shared';
import { LEVELS } from '@dtl/content';

/** Màu đất Phục Mạch Quật thuần số (không three/tsl) để dựng ô địa hình trong worker. */
export const SEED = 20261119;
export const CENTER = LEVELS.phuc_mach!.dungeon!.center;

const hex = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const PM = {
  earth: hex(0x6e4e38),
  dark: hex(0x3a2a20),
  clay: hex(0x80503a),
  dust: hex(0x8c6e50),
  rock: hex(0x6a5646),
  packed: hex(0x4a3628),
  vein: hex(0x3fa890),
};

/** Màu đất hầm (RGB 0..1, viết vào `out`): đất son nâu, mảng đất sét đỏ, bụi sáng, đá vụn tối; lòng đài chiến nén chặt sẫm hơn; dốc lộ đá sa thạch. */
export function pmGroundColor(x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.012, z * 0.012, 2, SEED + 300);
  const m = fbm(x * 0.045, z * 0.045, 2, SEED + 331);
  const f = fbm(x * 0.16, z * 0.16, 1, SEED + 377);
  let c = lerp3(PM.earth, PM.dust, Math.min(0.55, Math.max(0, n * 1.2 + 0.1)));
  c = lerp3(c, PM.clay, Math.min(0.6, Math.max(0, fbm(x * 0.008 - 11, z * 0.008 + 3, 2, SEED + 457) - 0.02) * 1.9));
  c = lerp3(c, PM.dark, Math.min(0.5, Math.max(0, -m - 0.02) * 1.3));
  const d = Math.hypot(x - CENTER.x, z - CENTER.z);
  const arena = 1 - Math.min(1, Math.max(0, (d - 46) / 18));
  c = lerp3(c, PM.packed, arena * 0.65);
  // ánh lục mạch tinh thấm nhẹ quanh vòng 62 (khớp mạng mạch khắc sàn)
  c = lerp3(c, PM.vein, Math.exp(-(((d - 62) / 6) ** 2)) * 0.16);
  const slope = 1 - ny;
  if (slope > 0.12) c = lerp3(c, PM.rock, Math.min(1, (slope - 0.12) * 4.2));
  const k = 0.9 + f * 0.16;
  out[0] = c[0] * k;
  out[1] = c[1] * k;
  out[2] = c[2] * k;
}

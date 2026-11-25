import { fbm, KIEM_TRUNG } from '@dtl/shared';

/** Màu đất Kiếm Trủng thuần số (không three/tsl) để dựng ô địa hình trong worker. */
export const SEED = 20261119;
export const C = KIEM_TRUNG;

const hex = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const KT = {
  /** Nền đá xám lam, lạnh. */
  slate: hex(0x767c86),
  /** Tro trắng xám phủ thành mảng. */
  ash: hex(0xb4bcc6),
  /** Vệt rỉ nâu đỏ chảy từ chân kiếm. */
  rust: hex(0x6a5a52),
  /** Đá nứt, vách. */
  dark: hex(0x434a54),
  /** Sàn đài chiến: đá đen bóng, hơi lam. */
  floor: hex(0x4a525e),
  /** Rêu xanh xỉn. */
  moss: hex(0x4e6a44),
  /** Đất đỏ rỉ. */
  soil: hex(0x7a4d38),
  /** Ánh lam kiếm khí. */
  glow: hex(0x5a9ec8),
};

/** Màu đất Kiếm Trủng (RGB 0..1, viết vào `out`): đá xám lam, mảng tro trắng, vệt rỉ, vách tối; lòng đài chiến sẫm và mịn hơn. */
export function ktGroundColor(x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.012, z * 0.012, 2, SEED + 300);
  const m = fbm(x * 0.04, z * 0.04, 2, SEED + 331);
  const f = fbm(x * 0.15, z * 0.15, 1, SEED + 377);
  let c = lerp3(KT.slate, KT.ash, Math.min(0.7, Math.max(0, n * 1.3 + 0.15)));
  // Vệt rỉ: đám nhỏ theo nhiễu, đậm ở vành lòng chảo (nơi kiếm cắm dày).
  const d = Math.hypot(x - C.x, z - C.z);
  const rim = Math.min(1, Math.max(0, (d - 30) / 70));
  c = lerp3(c, KT.rust, Math.min(0.62, Math.max(0, m - 0.02) * 1.5 * (0.35 + rim)));
  c = lerp3(c, KT.dark, Math.min(0.45, Math.max(0, -m - 0.05) * 1.2));
  // Sàn đài chiến: đá phiến sẫm, mép vòng sáng nhạt.
  const arena = 1 - Math.min(1, Math.max(0, (d - 52) / 14));
  if (arena > 0) {
    c = lerp3(c, KT.floor, arena * 0.7);
    const ring = Math.pow(Math.max(0, 1 - Math.abs(d - 56) / 1.1), 2);
    c = lerp3(c, KT.ash, ring * 0.6);
  }
  // Vệt rêu thành đám ở chỗ ẩm (nhiễu thấp tần số vừa), đất đỏ rỉ thành mảng lớn quanh các gò, ánh lam kiếm khí quanh vòng trận.
  const mo = fbm(x * 0.021 + 40, z * 0.021, 2, SEED + 411);
  c = lerp3(c, KT.moss, Math.min(0.7, Math.max(0, mo - 0.08) * 2.6) * (1 - arena * 0.45));
  const rd = fbm(x * 0.009 - 20, z * 0.009 + 5, 2, SEED + 457);
  c = lerp3(c, KT.soil, Math.min(0.65, Math.max(0, rd - 0.02) * 2.0) * (1 - arena * 0.6));
  const glowRing = Math.exp(-(((d - 59) / 7) ** 2));
  c = lerp3(c, KT.glow, glowRing * 0.28);
  const slope = 1 - ny;
  if (slope > 0.12) c = lerp3(c, KT.dark, Math.min(1, (slope - 0.12) * 4.2));
  const k = 0.92 + f * 0.14;
  out[0] = c[0] * k;
  out[1] = c[1] * k;
  out[2] = c[2] * k;
}

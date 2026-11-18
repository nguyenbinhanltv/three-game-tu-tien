// Mỹ thuật Thiên Khuyết Cổ Thành (E4-I): hàm thuần theo `TerrainDef` của level `thien_khuyet`, dùng chung cho màu đỉnh địa hình, cỏ và rải đá vỡ
// để các lớp khớp nhau (cỏ không mọc trên sân lát, đá vỡ không chồng lên sân/đại lộ). Không dùng Math.random: mọi máy cho cùng một cảnh.
import { fbm, hash01, smoothstep, type TerrainDef } from '@dtl/shared';

/** Màu hex 0xRRGGBB. */
export const TK_COLORS = {
  /** Nền sân đá phiến cổ: xám lam đêm. */
  slate: 0x8b949e,
  /** Đá lát sáng hơn (sân, đại lộ). */
  paving: 0xaab2bb,
  /** Rêu sao: ngọc lam xỉn, mọc ở chỗ trũng ẩm. */
  moss: 0x6a847f,
  /** Đá nứt tối. */
  dark: 0x4b5967,
  /** Vách dốc lộ đá. */
  cliff: 0x646e7b,
  /** Đất bụi trộn đá vụn ở Mộ Đạo. */
  grave: 0x6c6f7d,
} as const;

/** Trọng số "mặt lát đá" 0..1 quanh các bệ phẳng (đại lộ = chuỗi bệ `dl_*`, quảng trường, trạm, đài điểm đáng chú ý). Lõi phẳng = 1, mờ dần ra ngoài ~0,45·flatR. */
export function pavedWeight(def: TerrainDef, x: number, z: number): number {
  let w = 0;
  for (const f of def.features) {
    const dx = x - f.x;
    const dz = z - f.z;
    const d2 = dx * dx + dz * dz;
    const r1 = f.flatR * 1.5;
    if (d2 >= r1 * r1) continue;
    const v = 1 - smoothstep(f.flatR * 0.92, r1, Math.sqrt(d2));
    if (v > w) w = v;
  }
  return w;
}

/** Màu mặt đất (RGB 0..1) theo vị trí, độ dốc, độ cao; viết vào `out`. */
export function tkGroundColor(def: TerrainDef, x: number, z: number, ny: number, out: [number, number, number]): void {
  const n = fbm(x * 0.011, z * 0.011, 2, def.seed + 300);
  const m = fbm(x * 0.035, z * 0.035, 2, def.seed + 331);
  const hex = (c: number, k = 1): [number, number, number] => [((c >> 16) & 255) / 255 * k, ((c >> 8) & 255) / 255 * k, (c & 255) / 255 * k];
  const lerp = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let c = hex(TK_COLORS.slate, 0.9 + n * 0.16);
  // Rêu: đám theo nhiễu, nhiều hơn ở nhiễu thấp (chỗ trũng ẩm).
  c = lerp(c, hex(TK_COLORS.moss, 0.95 + m * 0.2), Math.min(0.75, Math.max(0, -n * 1.5 + 0.1) * 0.8));
  // Đá nứt tối thành vệt.
  c = lerp(c, hex(TK_COLORS.dark), Math.min(0.5, Math.max(0, m - 0.15) * 1.1));
  const paved = pavedWeight(def, x, z);
  if (paved > 0) c = lerp(c, hex(TK_COLORS.paving, 0.94 + m * 0.12), Math.min(0.85, paved * 0.9));
  const slope = 1 - ny;
  if (slope > 0.12) c = lerp(c, hex(TK_COLORS.cliff, 0.9 + n * 0.2), Math.min(1, (slope - 0.12) * 4.5));
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
}

/** Có thể mọc cỏ ở đây? Cỏ sao thưa, thành đám, chỉ lọt qua kẽ đá: không trên lõi sân lát. */
export function tkGrassDensity(def: TerrainDef, x: number, z: number, slope: number): number {
  if (slope > 1.9) return 0;
  const n = fbm(x * 0.028, z * 0.028, 2, def.seed + 777);
  const c = fbm(x * 0.007, z * 0.007, 2, def.seed + 313);
  let d = 0.05 + Math.max(0, n + 0.1) * 0.95 + Math.max(0, c) * 0.25;
  d *= 1 - slope / 2.4;
  d *= 1 - 0.88 * Math.min(1, pavedWeight(def, x, z) * 1.3);
  return d;
}

export interface TkRubble {
  id: string;
  x: number;
  z: number;
  yaw: number;
  s: number;
  /** Nghiêng quanh trục ngang (rad): cột đổ, tượng nghiêng. */
  lean: number;
  /** Chìm xuống đất (m). */
  sink: number;
  tint: [number, number, number];
}

const ROCKS = ['prop_da_nam', 'prop_da_dung', 'prop_da_phien'] as const;

export interface TkScatterCtx {
  def: TerrainDef;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  heightAt(x: number, z: number): number;
  /** Vòng cấm (x, z, r): trạm, cụm quái, điểm đáng chú ý, điểm hái, prop đặt tay. */
  clear: readonly { x: number; z: number; r: number }[];
  colliders: readonly { x: number; z: number; r: number }[];
}

/**
 * Đá vỡ và cột đổ rải ngoài đại lộ/sân lát: ô 26 m, xác định, chỉ tô cảnh (không va chạm). Đá Vân Lam nhuộm xám lam; cột khắc vân (`prop_tru_da_khac_van`)
 * đổ nghiêng, chìm nửa thân; hiếm hơn có tượng võ sĩ nghiêng. Dày hơn theo đám (nhiễu thấp tần) để thành tàn tích chứ không rải đều.
 */
export function scatterThienKhuyet(ctx: TkScatterCtx): TkRubble[] {
  const { def, bounds: b } = ctx;
  const out: TkRubble[] = [];
  const CELL = 26;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const r0 = hash01(gx, gz, 6101);
      const x = (gx + 0.1 + hash01(gx, gz, 6113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 6121) * 0.8) * CELL;
      if (x < b.x0 + 8 || x > b.x1 - 8 || z < b.z0 + 8 || z > b.z1 - 8) continue;
      const clump = 0.5 + fbm(x * 0.006, z * 0.006, 2, def.seed + 909) * 0.9;
      const pillar = r0 < 0.045 * (0.3 + clump);
      const statue = !pillar && r0 > 1 - 0.01 * (0.3 + clump);
      const rock = !pillar && !statue && r0 > 0.2 && r0 < 0.2 + 0.1 * (0.3 + clump);
      if (!pillar && !statue && !rock) continue;
      if (pavedWeight(def, x, z) > 0.15) continue;
      const h = ctx.heightAt(x, z);
      const slope = Math.abs(ctx.heightAt(x + 3, z) - h) + Math.abs(ctx.heightAt(x, z + 3) - h);
      if (slope > (rock ? 7 : 3.2)) continue;
      let bad = false;
      for (const c of ctx.clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) bad = true;
      for (const c of ctx.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 3) ** 2) bad = true;
      if (bad) continue;
      const k = hash01(gx, gz, 6133);
      const k2 = hash01(gx, gz, 6143);
      const cool = 0.84 + k2 * 0.18;
      if (pillar) out.push({ id: 'prop_tru_da_khac_van', x, z, yaw: k * Math.PI * 2, s: 0.8 + k2 * 0.3, lean: 1.0 + k * 0.45, sink: 0.5 + k2 * 0.8, tint: [cool * 0.9, cool * 0.98, cool * 1.08] });
      else if (statue) out.push({ id: 'prop_tuong_da_vo_si', x, z, yaw: k * Math.PI * 2, s: 0.9 + k2 * 0.25, lean: 0.25 + k * 0.3, sink: 0.6, tint: [cool * 0.9, cool * 0.98, cool * 1.08] });
      else out.push({ id: ROCKS[Math.floor(hash01(gx, gz, 6151) * ROCKS.length)], x, z, yaw: k * Math.PI * 2, s: 0.7 + k2 * 0.9, lean: (k - 0.5) * 0.3, sink: 0.1, tint: [cool * 0.88, cool * 0.97, cool * 1.1] });
    }
  }
  return out;
}

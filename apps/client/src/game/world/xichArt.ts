// Mỹ thuật phó bản Xích Tẫn Khích (DV-3K, chương 5): hàm thuần theo `TerrainDef.canyon` của level `xich_tan_khich`, dùng chung cho màu đỉnh địa hình, đường vết nứt
// phát sáng, điểm đèn nhấn và rải đá. Bảng màu `rift_*` như Bắc Hoang (`bacHoangArt.ts`). Không dùng Math.random: mọi máy cho cùng một hẻm.
import { fbm, hash01, smoothstep, type TerrainDef } from '@dtl/shared';
import { RIFT, type BhRock, type RiftPt } from './bacHoangArt';

export const XICH_LEVEL = 'xich_tan_khich';

const hex = (c: number, k = 1): [number, number, number] => [
  (((c >> 16) & 255) / 255) * k,
  (((c >> 8) & 255) / 255) * k,
  ((c & 255) / 255) * k,
];
const lerp3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Ba đường nứt trên sàn hẻm (nam → bắc): hai vết ven chân vách và một vết xương sống chạy qua Trấn Giới Bia ở tâm. Quanh co theo sin, mỗi 10 m một điểm.
 * `y` là cao độ sàn. Chỉ để tô (vệt sáng + màu đất), không đổi luật.
 */
export function xichCracks(def: TerrainDef, groundY: (x: number, z: number) => number): RiftPt[][] {
  const c = def.canyon;
  if (!c) return [];
  const make = (off: number, amp: number, freq: number, phase: number, half: number): RiftPt[] => {
    const out: RiftPt[] = [];
    for (let z = c.cz + half; z >= c.cz - half; z -= 10) {
      const x = c.cx + off + amp * Math.sin(z * freq + phase) + 3 * Math.sin(z * freq * 2.7 + phase * 1.7);
      out.push({ x, z, y: groundY(x, z) });
    }
    return out;
  };
  return [make(-33, 3.5, 0.052, 0.6, 70), make(33, 3.5, 0.047, 2.4, 70), make(0, 9, 0.041, 4.1, 56)];
}

/** Khoảng cách ngang tới đường nứt gần nhất (m). */
export function xichCrackDist(paths: readonly RiftPt[][], x: number, z: number): number {
  let best = Infinity;
  for (const p of paths)
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz || 1)));
      const d = Math.hypot(x - (a.x + vx * u), z - (a.z + vz * u));
      if (d < best) best = d;
    }
  return best;
}

/** Độ cao so với sàn hẻm (m). */
export function xichRel(def: TerrainDef, h: number): number {
  return h - def.natural.level;
}

/**
 * Màu mặt đất (RGB 0..1, sRGB; nhân với texture bộ ash). Sàn: đá nền than xám tro, mạng nứt hồng sẫm nóng dần về các vết nứt, bục xương quanh bia giữ;
 * vách: vân tầng đá xen lớp huyết sậm và dạ tím (dải theo độ cao), chân vách ám khói; cao nguyên: tro bay xám ấm.
 */
export function xichGroundColor(
  def: TerrainDef,
  cracks: readonly RiftPt[][],
  x: number,
  z: number,
  h: number,
  ny: number,
  out: [number, number, number],
): void {
  const c = def.canyon;
  const n = fbm(x * 0.012, z * 0.012, 3, def.seed + 300);
  const m = fbm(x * 0.05, z * 0.05, 2, def.seed + 331);
  const rel = xichRel(def, h);
  const slope = 1 - ny;
  let col = hex(RIFT.ash, 1.6 + n * 0.3);
  // (sàn sáng, vách tối: `col` bên dưới giữ nguyên cho sàn)
  col = lerp3(col, hex(RIFT.ashLight, 0.7 + m * 0.2), Math.min(0.45, Math.max(0, n * 1.2 + 0.2)));
  // Mạng nứt mảnh khắp sàn, đỏ sẫm.
  const web = 1 - Math.min(1, Math.abs(fbm(x * 0.03 + 9, z * 0.03 - 4, 3, def.seed + 612)) * 8);
  if (web > 0.4) col = lerp3(col, hex(RIFT.ember, 0.55), Math.min(0.4, (web - 0.4) * 0.9) * (1 - smoothstep(2, 10, rel)));
  // Gần vết nứt: nóng dần (vệt sáng thật do `riftVeil`).
  if (cracks.length) {
    const d = xichCrackDist(cracks, x, z);
    const heat = 1 - smoothstep(2, 15, d);
    if (heat > 0) col = lerp3(col, hex(RIFT.ember, 0.8 + m * 0.4), heat * 0.6);
    col = lerp3(col, hex(RIFT.blood, 0.6), (1 - smoothstep(10, 26, d)) * 0.25);
  }
  if (c) {
    // Bục quanh bia giữ ở tâm: xương/tro bay sáng hơn, vòng than hồng mảnh ngoài rìa.
    const dc = Math.hypot(x - c.cx, z - c.cz);
    const slab = 1 - smoothstep(8, 11.5, dc);
    if (slab > 0) col = lerp3(col, hex(RIFT.bone, 0.6 + m * 0.12), slab * 0.65);
    const ring = 1 - Math.min(1, Math.abs(dc - 13.5) / 0.7);
    if (ring > 0) col = lerp3(col, hex(RIFT.ember, 0.9), ring * 0.55);
  }
  if (rel > 1.5) {
    // Vách: dải tầng đá theo độ cao (≈ 3 m), xen huyết sậm và dạ tím; sườn dốc lộ đá tối.
    const band = 0.5 + 0.5 * Math.sin(rel * 2.1 + n * 7);
    const strata = lerp3(hex(RIFT.violetDeep, 1.5), hex(RIFT.ash, 1.15), band);
    col = lerp3(col, strata, Math.min(1, (rel - 1.5) / 9) * (0.55 + 0.35 * m));
    // Vách tối hẳn so với sàn và trời (tách lớp giá trị), chỉ lộ vân tầng.
    if (slope > 0.2) col = lerp3(col, hex(RIFT.violetDeep, 1.1 + band * 0.7), Math.min(0.85, (slope - 0.2) * 3));
    // Chân vách ám khói, gờ đỉnh vách ánh than hồng (nắng xiên).
    // Viền sáng: chân vách ánh than hồng hắt từ vết nứt (rim thấp), gờ đỉnh vách ánh tím lạnh của trời.
    col = lerp3(col, hex(RIFT.ember, 1.3 + m * 0.4), (1 - smoothstep(1.5, 9, rel)) * 0.6);
    if (c)
      col = lerp3(
        col,
        hex(RIFT.violet, 1.9),
        smoothstep(c.wallH - 7, c.wallH - 1, rel) * (1 - smoothstep(c.wallH - 1, c.wallH + 3, rel)) * 0.7,
      );
  }
  // Cao nguyên: tro bay.
  if (c && rel > c.wallH - 6) col = lerp3(col, hex(RIFT.ashLight, 0.82 + n * 0.16), smoothstep(c.wallH - 6, c.wallH + 4, rel) * 0.7);
  out[0] = col[0];
  out[1] = col[1];
  out[2] = col[2];
}

/** Điểm đèn nhấn: bia giữ ở tâm và ba khe mạch. */
export interface XichAccent {
  x: number;
  z: number;
  /** Màu ánh sáng 0xRRGGBB. */
  color: number;
  /** Hệ số cường độ. */
  k: number;
}

export interface XichScatterCtx {
  def: TerrainDef;
  heightAt(x: number, z: number): number;
  clear: readonly { x: number; z: number; r: number }[];
  cracks: readonly RiftPt[][];
}

const ROCKS = ['prop_da_nam', 'prop_da_dung', 'prop_da_phien'] as const;

/**
 * Đá dung nham nguội và tàn tích rải trong hẻm: ô 7 m xác định. Chân vách dày đá khối và cột đổ nghiêng, sàn thưa đá nhỏ, kiếm gãy rải xa tâm; để trống
 * lòng vết nứt (vệt sáng), vòng cấm (bia, cổng, khe mạch) và các điểm đặt tay. Tint tối, ngả than hồng; không va chạm.
 */
export function scatterXich(ctx: XichScatterCtx): BhRock[] {
  const { def } = ctx;
  const c = def.canyon;
  if (!c) return [];
  const out: BhRock[] = [];
  const CELL = 7;
  const x0 = c.cx - c.halfW - 28;
  const x1 = c.cx + c.halfW + 28;
  const z0 = c.cz - c.halfL - 20;
  const z1 = c.cz + c.halfL + 20;
  for (let gz = Math.floor(z0 / CELL); gz < Math.ceil(z1 / CELL); gz++) {
    for (let gx = Math.floor(x0 / CELL); gx < Math.ceil(x1 / CELL); gx++) {
      const r0 = hash01(gx, gz, 9101);
      const x = (gx + 0.1 + hash01(gx, gz, 9113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 9121) * 0.8) * CELL;
      const h = ctx.heightAt(x, z);
      const rel = xichRel(def, h);
      if (rel > c.wallH - 10) continue; // không rải lên cao nguyên (xa tầm nhìn đáy hẻm)
      const dc = Math.hypot(x - c.cx, z - c.cz);
      const foot = 1 - smoothstep(0, 16, rel); // 1 ở chân vách
      const onWall = rel > 1.5;
      // Mật độ: chân vách và sườn thấp dày, sàn thưa, tâm trống.
      const p = onWall ? 0.5 * (1 - smoothstep(6, 26, rel)) : 0.1 + smoothstep(30, 44, Math.abs(x - c.cx)) * 0.5;
      if (r0 > p) continue;
      if (dc < 15) continue;
      // Giữ sàn giữa trống cho camera (tầm xoay ~18 m quanh người chơi): đá sàn chỉ ở dải gần vách.
      if (!onWall && Math.abs(x - c.cx) < 30) continue;
      if (xichCrackDist(ctx.cracks, x, z) < 4.5) continue;
      let blocked = false;
      for (const k of ctx.clear) if ((x - k.x) ** 2 + (z - k.z) ** 2 < k.r * k.r) blocked = true;
      if (blocked) continue;
      const slope = Math.abs(ctx.heightAt(x + 3, z) - h) + Math.abs(ctx.heightAt(x, z + 3) - h);
      if (slope > 18) continue;
      const k = hash01(gx, gz, 9133);
      const k2 = hash01(gx, gz, 9143);
      const dark = 0.4 + k2 * 0.16;
      const tint: [number, number, number] = [dark * 1.18, dark * 0.9, dark * 0.86];
      const pick = hash01(gx, gz, 9151);
      if (!onWall && pick > 0.93)
        out.push({
          id: 'prop_kiem_gay',
          x,
          z,
          yaw: k * Math.PI * 2,
          s: 1 + k2 * 0.5,
          lean: 0.25 + k * 0.35,
          sink: 0.2,
          tint: [0.8, 0.72, 0.72],
        });
      else if (foot > 0.35 && pick > 0.78)
        out.push({
          id: 'prop_tru_da_khac_van',
          x,
          z,
          yaw: k * Math.PI * 2,
          s: 0.8 + k2 * 0.45,
          lean: 0.8 + k * 0.6,
          sink: 0.6 + k2 * 0.9,
          tint,
        });
      else
        out.push({
          id: ROCKS[Math.floor(pick * 2.99)],
          x,
          z,
          yaw: k * Math.PI * 2,
          s: 0.7 + k2 * 0.8 + foot * 0.5,
          lean: (k - 0.5) * 0.3,
          sink: 0.12 + foot * 0.4,
          tint,
        });
    }
  }
  return out;
}

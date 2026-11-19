// Mỹ thuật Bắc Hoang Tẫn Nguyên (DV-3I, chương 5): hàm thuần theo `TerrainDef` của level `bac_hoang`, dùng chung cho màu đỉnh địa hình, nhạc, hạt môi trường,
// mood theo vị trí, rải tàn tích và cây chết. Bảng màu phụ `rift_*` (assets/palette.json `riftColors`; ngoại lệ art bible chỉ cho chương 5).
// Không dùng Math.random: mọi máy cho cùng một cảnh.
import { fbm, hash01, smoothstep, type TerrainDef } from '@dtl/shared';

/** Màu hex 0xRRGGBB, đúng id `rift_*` của palette. */
export const RIFT = {
  ash: 0x2a2426,
  ashLight: 0x8c8580,
  ember: 0xc4412b,
  blood: 0x6e1f24,
  violet: 0x6b3fa0,
  violetDeep: 0x241634,
  gilt: 0xb8923a,
  bone: 0xcfc6b4,
} as const;

/** MAP-5: bảng tuyết trắng + đen + tím độc cho đất (nhân với texture nên là màu giữa). */
const SNOW = { snow: 0xe6ecf6, shade: 0x9aa8d0, rock: 0x1c1a26 } as const;

/** Một điểm trên đường tâm Giới Khích (tọa độ thế giới), nam → bắc. */
export interface RiftPt {
  x: number;
  z: number;
  /** Cao độ đáy khe. */
  y: number;
}

/** Sân độ kiếp Anh Biến (server `do_kiep_bac_hoang`): dùng lại lớp nghệ thuật Bắc Hoang (nứt, cây chết, hạt tro, mood `rift`). */
export const KIEP_BH = 'do_kiep_bac_hoang';

/** Đường tâm khe: các `khe_*` của địa hình (bộ sinh đặt mỗi 30 m), sắp từ nam (z lớn) lên bắc. */
export function riftPath(def: TerrainDef): RiftPt[] {
  return def.features
    .filter((f) => f.id.startsWith('khe_'))
    .map((f) => ({ x: f.x, z: f.z, y: f.y }))
    .sort((a, b) => b.z - a.z);
}

/** Khoảng cách ngang tới đường tâm khe (m) và vị trí dọc khe 0..1 (nam → bắc). */
export function riftDist(path: readonly RiftPt[], x: number, z: number): { d: number; t: number } {
  let best = Infinity;
  let bt = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2));
    const d = Math.hypot(x - (a.x + vx * u), z - (a.z + vz * u));
    if (d < best) {
      best = d;
      bt = (i + u) / Math.max(1, path.length - 1);
    }
  }
  return { d: best, t: bt };
}

/**
 * Mức "bên kia vết nứt" 0..1 theo vị trí: 0 ở nửa nam (tuyết, `bh_*`), 1 ở ba vùng bắc (tím độc, `bhr_*`); chuyển dần trong ~110 m quanh Khích Giai
 * (z lệch tâm −120 → −250: Khích Giai còn là bên này, miệng khe ở −190). `zo` = z − nửa kích thước bản đồ.
 */
export function riftBlend(zo: number): number {
  return smoothstep(-120, -250, zo);
}

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

/** Màu mặt đất (RGB 0..1, sRGB) theo vị trí, độ dốc, độ cao; viết vào `out`. Nhân với texture bộ ash nên là màu giữa, không phải màu cuối. */
export function bhGroundColor(
  def: TerrainDef,
  path: readonly RiftPt[],
  x: number,
  z: number,
  h: number,
  ny: number,
  out: [number, number, number],
): void {
  const n = fbm(x * 0.011, z * 0.011, 3, def.seed + 300);
  const m = fbm(x * 0.04, z * 0.04, 2, def.seed + 331);
  const north = riftBlend(z - def.size / 2);
  // Nền: tuyết trắng ngả lam, đám đất đá đen lộ ra theo nhiễu thấp tần (tuyết mỏng, gió quét).
  let c = hex(SNOW.snow, 1.75 + n * 0.25);
  c = lerp3(c, hex(SNOW.rock, 1.4), Math.min(0.62, Math.max(0, -n * 1.3 + 0.12)));
  // Gió thổi tuyết thành vệt lam nhạt.
  c = lerp3(c, hex(SNOW.shade, 1.5), Math.min(0.2, Math.max(0, m) * 0.5));
  // Bên kia: tuyết nhuốm tím độc, đá đen tuyền, vệt tím sậm theo nhiễu mịn.
  if (north > 0) {
    c = lerp3(c, hex(SNOW.shade, 0.75), north * 0.5);
    c = lerp3(c, hex(RIFT.violetDeep, 1.1), north * Math.min(0.5, Math.max(0, m - 0.02) * 1.6));
    // Mỗi vùng bên kia một màu chủ: Xích Tẫn Bình (đông) ngả tím than, Kim Dạ Ngoại Uyển (tây) ngả kim dát khô.
    const east = smoothstep(def.size / 2 + 60, def.size / 2 + 260, x);
    const west = smoothstep(def.size / 2 - 60, def.size / 2 - 260, x);
    if (east > 0) c = lerp3(c, hex(RIFT.violet, 0.5 + m * 0.2), north * east * 0.22);
    if (west > 0) c = lerp3(c, hex(RIFT.gilt, 0.7 + m * 0.2), north * west * 0.3);
  }
  // Mạng nứt: đường mảnh (nhiễu gần 0), đen ở nửa nam, tím sáng ở nửa bắc (màu đỉnh; phần phát sáng thật do `riftVeil`).
  const crack = 1 - Math.min(1, Math.abs(fbm(x * 0.022 + 9, z * 0.022 - 4, 3, def.seed + 612)) * 9);
  if (crack > 0.35) c = lerp3(c, lerp3(hex(SNOW.rock, 0.5), hex(RIFT.violet, 0.8), north), Math.min(0.55, (crack - 0.35) * 1.2));
  // Gần khe: băng nứt, ánh tím dần lên mép.
  if (path.length > 1) {
    const { d } = riftDist(path, x, z);
    const heat = 1 - smoothstep(14, 70, d);
    if (heat > 0) c = lerp3(c, hex(RIFT.violet, 0.75 + m * 0.3), heat * 0.3);
  }
  // Sân trạm/trận/bia phẳng sáng hơn một chút (tuyết nén), không phát sáng.
  let flat = 0;
  for (const f of def.features) {
    if (f.id.startsWith('khe_')) continue;
    const dx = x - f.x;
    const dz = z - f.z;
    const r1 = f.flatR * 1.45;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r1 * r1) continue;
    const v = 1 - smoothstep(f.flatR * 0.9, r1, Math.sqrt(d2));
    if (v > flat) flat = v;
  }
  if (flat > 0) c = lerp3(c, hex(SNOW.snow, 1.9 + m * 0.1), Math.min(0.45, flat * 0.5));
  const slope = 1 - ny;
  if (slope > 0.12) c = lerp3(c, hex(SNOW.rock, 1.5), Math.min(1, (slope - 0.12) * 4.5)); // tuyết không bám sườn dốc: lộ đá đen
  if (h < 66) c = lerp3(c, hex(RIFT.violetDeep, 1.0), Math.min(0.8, (66 - h) / 8)); // lòng khe
  out[0] = c[0];
  out[1] = c[1];
  out[2] = c[2];
}

/** Lượng hạt môi trường mỗi giây (preset Vừa): tro khắp nơi, than hồng dày dần về phía khe và bên kia. */
export function bhAmbient(path: readonly RiftPt[], x: number, z: number, def: TerrainDef): { ash: number; ember: number; mote: number } {
  const north = riftBlend(z - def.size / 2);
  const { d } = path.length > 1 ? riftDist(path, x, z) : { d: 999 };
  const near = 1 - smoothstep(20, 160, d);
  return { ash: 9 + north * 10, ember: 1.2 + north * 3 + near * 12, mote: 2 };
}

export interface BhRock {
  id: string;
  x: number;
  z: number;
  yaw: number;
  s: number;
  lean: number;
  sink: number;
  tint: [number, number, number];
}

const ROCKS = ['prop_da_nam', 'prop_da_dung', 'prop_da_phien'] as const;

export interface BhScatterCtx {
  def: TerrainDef;
  bounds: { x0: number; x1: number; z0: number; z1: number };
  heightAt(x: number, z: number): number;
  /** Vòng cấm (x, z, r): trạm, trận, cụm quái, điểm đáng chú ý, điểm hái, prop đặt tay. */
  clear: readonly { x: number; z: number; r: number }[];
  colliders: readonly { x: number; z: number; r: number }[];
  path: readonly RiftPt[];
}

function blocked(ctx: BhScatterCtx, x: number, z: number, pad: number): boolean {
  for (const c of ctx.clear) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
  for (const c of ctx.colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  return false;
}

/**
 * Tàn tích rải ngoài vòng cấm: ô 24 m, xác định. Đá tro (tối, nhuộm `rift_ash`) khắp nơi, đá mảnh vỡ dày dần quanh miệng khe; cột đổ khắc vân nghiêng, chìm
 * nửa thân (dát vàng nhạt ở Kim Dạ, tức tây bắc); kiếm gãy cắm nghiêng ở bên kia. Chỉ tô cảnh, không va chạm.
 */
export function scatterBacHoang(ctx: BhScatterCtx): BhRock[] {
  const { def, bounds: b } = ctx;
  const out: BhRock[] = [];
  const CELL = 24;
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const r0 = hash01(gx, gz, 8101);
      const x = (gx + 0.1 + hash01(gx, gz, 8113) * 0.8) * CELL;
      const z = (gz + 0.1 + hash01(gx, gz, 8121) * 0.8) * CELL;
      if (x < b.x0 + 8 || x > b.x1 - 8 || z < b.z0 + 8 || z > b.z1 - 8) continue;
      const north = riftBlend(z - def.size / 2);
      const { d } = ctx.path.length > 1 ? riftDist(ctx.path, x, z) : { d: 999 };
      if (d < 12) continue; // lòng khe để trống cho vệt sáng
      const clump = 0.55 + fbm(x * 0.006, z * 0.006, 2, def.seed + 909) * 0.9;
      const edge = 1 - smoothstep(16, 120, d);
      const pillar = r0 < 0.035 * (0.4 + clump) * (0.7 + north * 0.9);
      const sword = !pillar && r0 > 0.965 - 0.02 * north * clump;
      const rock = !pillar && !sword && r0 > 0.2 && r0 < 0.2 + (0.17 + edge * 0.12) * (0.4 + clump);
      if (!pillar && !sword && !rock) continue;
      const h = ctx.heightAt(x, z);
      const slope = Math.abs(ctx.heightAt(x + 3, z) - h) + Math.abs(ctx.heightAt(x, z + 3) - h);
      if (slope > (rock ? 7 : 3.2)) continue;
      if (blocked(ctx, x, z, 3)) continue;
      const k = hash01(gx, gz, 8133);
      const k2 = hash01(gx, gz, 8143);
      const dark = 0.5 + k2 * 0.18;
      const gilt = x < def.size / 2 - 120 && north > 0.5; // Kim Dạ Ngoại Uyển: cột dát vàng cũ
      const tint: [number, number, number] =
        gilt && pillar ? [dark * 1.5, dark * 1.3, dark * 0.9] : [dark * 1.05, dark * 0.95, dark * 0.95];
      if (pillar)
        out.push({
          id: 'prop_tru_da_khac_van',
          x,
          z,
          yaw: k * Math.PI * 2,
          s: 0.8 + k2 * 0.35,
          lean: 0.9 + k * 0.5,
          sink: 0.5 + k2 * 0.9,
          tint,
        });
      else if (sword)
        out.push({
          id: 'prop_kiem_gay',
          x,
          z,
          yaw: k * Math.PI * 2,
          s: 1.0 + k2 * 0.5,
          lean: 0.25 + k * 0.35,
          sink: 0.2,
          tint: [0.85, 0.8, 0.82],
        });
      else
        out.push({
          id: ROCKS[Math.floor(hash01(gx, gz, 8151) * ROCKS.length)]!,
          x,
          z,
          yaw: k * Math.PI * 2,
          s: 0.7 + k2 * 1.0 + edge * 0.4,
          lean: (k - 0.5) * 0.3,
          sink: 0.12,
          tint,
        });
    }
  }
  return out;
}

export interface DeadTreeSpot {
  x: number;
  z: number;
  yaw: number;
  s: number;
  /** Chỉ số kiểu cây (0..2). */
  kind: number;
}

/**
 * Cây chết thủ tục: rừng chết dày ở Khô Lộc Lâm (tây nam), rải thưa khắp bên này, gần như không có bên kia. Ô 11 m, xác định; trần số cây để một lưới
 * instanced (1 draw call) luôn dưới ngân sách tam giác. Né vòng cấm, collider, dốc, lòng khe.
 */
export function deadTreeSpots(ctx: BhScatterCtx, max: number): DeadTreeSpot[] {
  const { def, bounds: b } = ctx;
  const spots: DeadTreeSpot[] = [];
  const CELL = 11;
  const forest = { x: def.size / 2 - 320, z: def.size / 2 + 220, r: 230 }; // Khô Lộc Lâm (tâm thiết kế (−320, +220))
  for (let gz = Math.floor(b.z0 / CELL); gz < Math.ceil(b.z1 / CELL); gz++) {
    for (let gx = Math.floor(b.x0 / CELL); gx < Math.ceil(b.x1 / CELL); gx++) {
      const x = (gx + 0.15 + hash01(gx, gz, 8201) * 0.7) * CELL;
      const z = (gz + 0.15 + hash01(gx, gz, 8203) * 0.7) * CELL;
      if (x < b.x0 + 10 || x > b.x1 - 10 || z < b.z0 + 10 || z > b.z1 - 10) continue;
      const inF = 1 - smoothstep(forest.r * 0.55, forest.r, Math.hypot(x - forest.x, z - forest.z));
      const north = riftBlend(z - def.size / 2);
      const clump = Math.max(0, 0.5 + fbm(x * 0.02, z * 0.02, 2, def.seed + 811));
      const p = 0.5 * inF * (0.3 + clump) + 0.012 * clump * (1 - north);
      if (hash01(gx, gz, 8207) > p) continue;
      const { d } = ctx.path.length > 1 ? riftDist(ctx.path, x, z) : { d: 999 };
      if (d < 30) continue;
      const h = ctx.heightAt(x, z);
      if (Math.abs(ctx.heightAt(x + 3, z) - h) + Math.abs(ctx.heightAt(x, z + 3) - h) > 4) continue;
      if (blocked(ctx, x, z, 2)) continue;
      spots.push({
        x,
        z,
        yaw: hash01(gx, gz, 8209) * Math.PI * 2,
        s: 0.8 + hash01(gx, gz, 8213) * 0.8,
        kind: Math.floor(hash01(gx, gz, 8219) * 3),
      });
    }
  }
  if (spots.length <= max) return spots;
  // Quá trần: giữ đều theo bước nhảy (xác định), không cắt một góc bản đồ.
  const step = spots.length / max;
  return Array.from({ length: max }, (_, i) => spots[Math.floor(i * step)]!);
}

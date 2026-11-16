// Bản sắc từng đảo của Vân Hải Phù Đảo (E3-I): bảng màu đất/đá/rêu, lối mòn, mặt đá lộ, bờ hồ gương. Hàm thuần theo `TerrainDef` (không dùng three):
// địa hình (màu đỉnh), cỏ, rải prop và skirt đảo cùng đọc từ đây để năm đảo vùng không giống nhau và các lớp khớp nhau (cỏ không mọc trên lối mòn, đá lộ đúng chỗ).
import { fbm, hash01, propsOf, smoothstep, type TerrainDef } from '@dtl/shared';

/** Màu hex 0xRRGGBB. */
export interface VhPalette {
  moss: number;
  soil: number;
  stone: number;
  dark: number;
  trail: number;
  /** Màu đất ẩm quanh hồ/chỗ trũng. */
  wet: number;
  grass: number;
  grassDry: number;
  /** Mật độ cỏ nền (0..1) và độ đám (0 đều → 1 từng đám rõ). */
  grassDensity: number;
  grassClump: number;
  /** Cộng vào độ lộ đá (−0,3..0,5). */
  rockBias: number;
}

export type VhKind = 'hub' | 'tung_dai_dao' | 'thach_quy_dao' | 'kinh_ho_dao' | 'loi_van_dao' | 'kinh_ngu_dai' | 'tieu_dao';

export const VH_PALETTES: Record<VhKind, VhPalette> = {
  // Phù Đảo Các: sân lát đá nhạt, cỏ cắt gọn ở rìa
  hub: { moss: 0x8c9c76, soil: 0xaa9d80, stone: 0xc4bfae, dark: 0x70745f, trail: 0xeee8d4, wet: 0x8c9684, grass: 0x8fa874, grassDry: 0xb0b088, grassDensity: 0.3, grassClump: 0.75, rockBias: 0.05 },
  // Tùng Đài: rêu xanh thẫm, đất nâu ẩm, đồi tùng
  tung_dai_dao: { moss: 0x6c8960, soil: 0x8b7858, stone: 0x9a9b8b, dark: 0x465a45, trail: 0xbba985, wet: 0x58705a, grass: 0x7c9a5e, grassDry: 0xa4a872, grassDensity: 0.62, grassClump: 0.7, rockBias: -0.05 },
  // Thạch Quy: đá phiến xám cát lấn cỏ, mảng như mai rùa
  thach_quy_dao: { moss: 0x9a9a82, soil: 0xa3917a, stone: 0xb7b0a2, dark: 0x6b695f, trail: 0xcbbfa6, wet: 0x8b8a76, grass: 0x9aa476, grassDry: 0xbab38a, grassDensity: 0.22, grassClump: 0.85, rockBias: 0.32 },
  // Kính Hồ: bãi phù sa xanh nhạt, cỏ dày quanh hồ
  kinh_ho_dao: { moss: 0x8aa596, soil: 0xa9ab9a, stone: 0xc8cfcb, dark: 0x66807a, trail: 0xdcd8c6, wet: 0x587267, grass: 0x84ac86, grassDry: 0xb2bd92, grassDensity: 0.5, grassClump: 0.85, rockBias: -0.15 },
  // Lôi Vân: đá phiến sẫm cháy sấm, cỏ khô thưa
  loi_van_dao: { moss: 0x78796b, soil: 0x6e655a, stone: 0x585a62, dark: 0x3a3c44, trail: 0x8f8778, wet: 0x4d4f52, grass: 0x8a8d62, grassDry: 0xa59a62, grassDensity: 0.2, grassClump: 0.8, rockBias: 0.22 },
  // Kình Ngư Đài: đất tẩy trắng như xương, gió quét
  kinh_ngu_dai: { moss: 0x8fa3a0, soil: 0xbab4a2, stone: 0xe0dccd, dark: 0x7a8a92, trail: 0xe2dccb, wet: 0x78898a, grass: 0x95aba0, grassDry: 0xc0c3a6, grassDensity: 0.42, grassClump: 0.65, rockBias: 0.08 },
  tieu_dao: { moss: 0xa3ad8a, soil: 0xb3a688, stone: 0xc3bfb0, dark: 0x7b8068, trail: 0xd2c9b3, wet: 0x7f8c78, grass: 0x9bb078, grassDry: 0xbfbb8c, grassDensity: 0.5, grassClump: 0.5, rockBias: 0 },
};

export interface VhIsland {
  id: string;
  kind: VhKind;
  x: number;
  z: number;
  r: number;
  y: number;
  pal: VhPalette;
  /** Điểm dọc các lối mòn của đảo (x, z xen kẽ). */
  trail: Float32Array;
}

export interface VhPond {
  x: number;
  z: number;
  r: number;
  depth: number;
}

export interface VhArt {
  islands: VhIsland[];
  ponds: VhPond[];
  floor: number;
  /** Đảo chứa điểm (x, z), kể cả dải mép; null nếu ở sàn mây. */
  islandAt(x: number, z: number): VhIsland | null;
  /** Độ phủ lối mòn 0..1 (lõi 1 ở 1,6 m, mờ hết ở 3,4 m). */
  trailW(isl: VhIsland, x: number, z: number): number;
  /** Khoảng cách tới lối mòn gần nhất (m, tối đa 99). */
  trailD(isl: VhIsland, x: number, z: number): number;
  /** Độ lộ đá nền 0..1 từ nhiễu + độ dốc `slope` (1 − ny) + bias của đảo. */
  rockW(isl: VhIsland, x: number, z: number, slope: number): number;
  /** Trọng số bờ hồ: 1 trong lòng hồ, giảm tới 0 ở cách mép 7 m; 0 nếu không gần hồ. */
  pondW(x: number, z: number): number;
}

const cache = new WeakMap<TerrainDef, VhArt>();

function kindOf(id: string): VhKind {
  if (id === 'isl_phu_dao_cac') return 'hub';
  if (id.startsWith('isl_tieu_dao')) return 'tieu_dao';
  return id.slice(4) as VhKind;
}

/** Đường mòn lượn: chia đoạn a→b mỗi ~5 m, lệch ngang bằng sóng sin theo pha riêng (tắt ở hai đầu). */
function wobble(out: number[], ax: number, az: number, bx: number, bz: number, ph: number): void {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 1) return;
  const n = Math.max(2, Math.ceil(len / 5));
  const nx = -(bz - az) / len;
  const nz = (bx - ax) / len;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = Math.sin(Math.PI * t) ** 0.6;
    const off = (Math.sin(t * len * 0.045 + ph) * 2.2 + Math.sin(t * len * 0.13 + ph * 2) * 0.7) * taper;
    out.push(ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off);
  }
}

export function vanHaiArt(def: TerrainDef): VhArt {
  const hit = cache.get(def);
  if (hit) return hit;
  const seed = def.seed;
  const isleFeats = def.features.filter((f) => f.id.startsWith('isl_'));
  const islands: VhIsland[] = isleFeats.map((f) => ({ id: f.id.slice(4), kind: kindOf(f.id), x: f.x, z: f.z, r: f.flatR, y: f.y, pal: VH_PALETTES[kindOf(f.id)], trail: new Float32Array(0) }));
  const edge = def.islands?.[0]?.edge ?? 12;
  const inIsle = (x: number, z: number, pad = 0): VhIsland | null => {
    for (const i of islands) if ((x - i.x) ** 2 + (z - i.z) ** 2 < (i.r + pad) ** 2) return i;
    return null;
  };
  // lối mòn: trận truyền tống → điểm đáng chú ý, trận → từng đầu cầu/thang trên đảo
  const per = new Map<string, number[]>();
  for (const i of islands) per.set(i.id, []);
  const pads = def.features.filter((f) => f.id.startsWith('pad_'));
  const pois = def.features.filter((f) => f.id.startsWith('poi_'));
  for (const i of islands) {
    const pts = per.get(i.id)!;
    const ph = hash01(Math.round(i.x), Math.round(i.z), 3) * 6.28;
    const pad = pads.find((p) => inIsle(p.x, p.z) === i);
    const hub = pad ?? { x: i.x, z: i.z };
    for (const p of pois) if (inIsle(p.x, p.z) === i) wobble(pts, hub.x, hub.z, p.x, p.z, ph);
    if (i.kind === 'hub') {
      // Phù Đảo Các: lối đá từ tâm tới từng đèn đá
      for (const p of propsOf('van_hai')) if (p.id === 'prop_den_da' && inIsle(p.x, p.z) === i) wobble(pts, i.x, i.z + 14, p.x, p.z, ph);
    }
    for (const b of def.bridges ?? []) {
      if (b.id.startsWith('thang_')) continue; // chân thang mây là vách đảo, không dẫn lối mòn tới đó
      for (const [x, z] of [[b.ax, b.az], [b.bx, b.bz]] as const) {
        if (inIsle(x, z, 22) === i && Math.hypot(x - i.x, z - i.z) > i.r - 30) wobble(pts, hub.x, hub.z, x, z, ph + x * 0.01);
      }
    }
    i.trail = Float32Array.from(pts);
  }
  const ponds: VhPond[] = def.ponds ?? [];
  const art: VhArt = {
    islands,
    ponds,
    floor: def.voidFloor ?? 0,
    islandAt(x, z) {
      for (const i of islands) if ((x - i.x) ** 2 + (z - i.z) ** 2 < (i.r + edge) ** 2) return i;
      return null;
    },
    trailD(isl, x, z) {
      const t = isl.trail;
      let best = 99 * 99;
      for (let k = 0; k < t.length; k += 2) {
        const dx = t[k] - x;
        const dz = t[k + 1] - z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      return Math.sqrt(best);
    },
    trailW(isl, x, z) {
      const d = art.trailD(isl, x, z);
      if (d > 4.4) return 0;
      // bờ mép lởm chởm: nhiễu nhẹ làm lối mòn không thành dải đều
      const jag = fbm(x * 0.3, z * 0.3, 2, seed + 905) * 0.7;
      return smoothstep(4.4, 2.1, d + jag);
    },
    rockW(isl, x, z, slope) {
      const n = fbm(x * 0.028 + 7, z * 0.028 - 3, 3, seed + 640);
      const k = fbm(x * 0.09, z * 0.09, 2, seed + 641) * 0.25;
      return Math.max(0, Math.min(1, (n + k + isl.pal.rockBias - 0.1) * 3 + slope * 2.4));
    },
    pondW(x, z) {
      let w = 0;
      for (const p of ponds) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < p.r + 7) w = Math.max(w, smoothstep(p.r + 7, p.r - 2, d));
      }
      return w;
    },
  };
  cache.set(def, art);
  return art;
}

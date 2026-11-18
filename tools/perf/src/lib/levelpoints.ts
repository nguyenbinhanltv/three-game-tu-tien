// Điểm chụp/đo theo level (E1-G): `pnpm shots --level <id>`, `pnpm bench:client --level <id>`.
// Vân Lam giữ danh sách đặt tay trong shots.ts/bench.ts; level khác suy từ dữ liệu: tâm từng vùng, điểm đáng chú ý, boss,
// trận truyền tống, cộng một góc nhìn cao toàn cảnh. Hàm thuần (đọc LevelDef + địa hình), có test.
import { type LevelDef, terrainOf } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { ensureLevel } from '@dtl/content/fixtures';

export interface LevelPoint {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  dist: number;
}

const centroid = (poly: [number, number][]): [number, number] => [
  poly.reduce((a, p) => a + p[0], 0) / poly.length,
  poly.reduce((a, p) => a + p[1], 0) / poly.length,
];

/** Level tồn tại (kể cả level thử `thu_nho`); ném lỗi liệt kê id hợp lệ nếu không. */
export function requireLevel(id: string): LevelDef {
  const lv = ensureLevel(id);
  if (!lv) throw new Error(`level không tồn tại: ${id} (có: ${[...Object.keys(LEVELS), 'thu_nho'].join(', ')})`);
  return lv;
}

/**
 * Điểm chụp của level (không phải Vân Lam). Tên: `zone_<id>`, `poi_<id>`, `boss_<mon>`, `elite_<mon>_<i>`, `trencao`.
 * Mọi điểm nằm trong vùng chơi của địa hình level; trencao nhìn từ trên cao ở tâm vùng chơi.
 */
export function levelPoints(id: string): LevelPoint[] {
  const lv = requireLevel(id);
  const b = terrainOf(lv).playBounds;
  const clamp = (x: number, z: number): [number, number] => [
    Math.min(b.x1 - 12, Math.max(b.x0 + 12, x)),
    Math.min(b.z1 - 12, Math.max(b.z0 + 12, z)),
  ];
  const pts: LevelPoint[] = [];
  const add = (name: string, x: number, z: number, yaw: number, pitch: number, dist: number) => {
    const [cx, cz] = clamp(x, z);
    pts.push({ name, x: cx, z: cz, yaw, pitch, dist });
  };
  for (const z of lv.zones ?? []) {
    const [x, zz] = centroid(z.poly);
    add(`zone_${z.id}`, x, zz, 0, 0.3, 14);
  }
  for (const p of lv.pois ?? []) add(`poi_${p.id}`, p.x, p.z, 3.14, 0.28, 14);
  const elites = new Map<string, number>();
  for (const s of lv.spawns) {
    const boss = s.mon.startsWith('boss_');
    const elite = s.mon.startsWith('elite_');
    if (!boss && !elite) continue;
    const n = elites.get(s.mon) ?? 0;
    elites.set(s.mon, n + 1);
    add(boss ? `boss_${s.mon.slice(5)}` : `elite_${s.mon.slice(6)}_${n}`, s.x, s.z + 18, 3.14, 0.25, boss ? 22 : 16);
  }
  add('trencao', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0, 1.2, Math.min(700, (b.x1 - b.x0) * 0.6));
  return pts;
}

/** Tham số URL để vào game ở level này (E1-B/E1-D đọc `level`; trước đó server Vân Lam bỏ qua). */
export const levelQuery = (id: string): string => (id === 'van_lam' ? '' : `level=${id}`);

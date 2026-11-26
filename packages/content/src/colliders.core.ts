// Phần THUẦN của collider theo level (không import dữ liệu JSON lớn): dùng chung cho `colliders.ts` (server/công cụ: nạp hết lúc import)
// và `colliders.lazy.ts` (client: nạp từng level bằng import() để không đưa ~1,8 MB JSON vào bundle khởi động, B7).
import {
  bridgeModel,
  bridgeShapes,
  gioiTriPillars,
  instantiateShapes,
  type LocalShape,
  registerCollision,
  type Shape,
  VAN_LAM,
} from '@dtl/shared';
import gioiTriLevel from '../data/levels/gioi_tri.json';

export interface InstFile {
  ids: string[];
  p: number[][];
}

/**
 * Kiến trúc dựng thành MỘT lưới gộp (arch_*): hộp trục thế giới sinh từ hình học GLB bằng `pnpm colliders:arch` (`tools/asset-pipeline/src/archcollider.ts`).
 * [x0, z0, x1, z1, y0, y1, walk(1)|rắn(0)].
 */
export interface ArchFile {
  id: string;
  boxes: number[][];
}

/** Hình thế giới của mọi prop một level (hàm thuần): `f` là file prop đã bake, `lib` là hình cục bộ theo asset. */
export function propShapesFrom(f: InstFile | undefined, lib: Record<string, LocalShape[]>): Shape[] {
  if (!f) return [];
  const out: Shape[] = [];
  for (const r of f.p) {
    const id = f.ids[r[0]!]!;
    const local = lib[id];
    if (!local?.length) continue;
    instantiateShapes(local, { x: r[1]!, z: r[2]!, y: r[3]!, yaw: r[4]!, s: r[5]!, sy: r[6], lean: r[7] }, out, id);
  }
  return out;
}

export function archShapesFrom(files: readonly ArchFile[]): Shape[] {
  const out: Shape[] = [];
  for (const f of files)
    for (const b of f.boxes)
      out.push({
        k: 'box',
        x: (b[0]! + b[2]!) / 2,
        z: (b[1]! + b[3]!) / 2,
        hx: (b[2]! - b[0]!) / 2,
        hz: (b[3]! - b[1]!) / 2,
        yaw: 0,
        y0: b[4]!,
        y1: b[5]!,
        walk: b[6] === 1,
        tag: f.id,
      });
  return out;
}

/**
 * Hình dựng bằng mã (không nằm trong file bake) của một level, đăng ký thẳng vào `registerCollision`:
 * - Cầu treo Lạc Kiếm đi được (Chân Cảnh M2, `van_lam`): ván dốc theo võng + lan can đặc, dựng từ mô hình chung `cautreo.ts` (cùng nguồn với hình ở client).
 * - Giới Trì Động Phủ (TN-3, `gioi_tri`): 14 cột đồng quanh sân là cảnh dựng bằng code ở client; chặn bằng cột tròn cao vô hạn tại đúng chỗ
 *   `gioiTriPillars` dựng hình (công thức chung ở `packages/shared/src/vandinh.ts`).
 */
export function registerCodeShapes(level: string): void {
  if (level === 'van_lam') registerCollision('van_lam', bridgeShapes(bridgeModel(VAN_LAM.groundAt)));
  if (level === 'gioi_tri')
    registerCollision(
      'gioi_tri',
      gioiTriPillars((gioiTriLevel as unknown as { dungeon: { center: { x: number; z: number } } }).dungeon.center).map((c): Shape => ({
        k: 'cyl',
        x: c.x,
        z: c.z,
        r: c.r,
        y0: -1000,
        y1: 1000,
        tag: 'gioi_tri_cot_dong',
      })),
    );
}

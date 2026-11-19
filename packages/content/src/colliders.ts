import { instantiateShapes, type LocalShape, registerCollision, type Shape } from '@dtl/shared';
import libJson from '../data/colliders/lib.json';
import bacHoang from '../data/colliders/bac_hoang.inst.json';
import doKiepBacHoang from '../data/colliders/do_kiep_bac_hoang.inst.json';
import doanMach from '../data/colliders/doan_mach.inst.json';
import kimDaCung from '../data/colliders/kim_da_cung.inst.json';
import kinhNguyet from '../data/colliders/kinh_nguyet.inst.json';
import phucMach from '../data/colliders/phuc_mach.inst.json';
import thanTang from '../data/colliders/than_tang.inst.json';
import thienKhuyet from '../data/colliders/thien_khuyet.inst.json';
import vanHai from '../data/colliders/van_hai.inst.json';
import vanLam from '../data/colliders/van_lam.inst.json';
import xichTan from '../data/colliders/xich_tan_khich.inst.json';

/**
 * Collider 3D của prop theo level (COL-1 / C-2). Client và server cùng nạp ở đây khi import `@dtl/content`, cùng dữ liệu → dự đoán khớp.
 * - `lib.json`: hình cục bộ theo asset (sinh từ GLB bằng `pnpm colliders:lib`, `overrides.json` ghi tay).
 * - `<level>.inst.json`: vị trí prop đã rải (bake từ `allProps` của client bằng `pnpm colliders:bake`).
 * Tập hình khóa theo `levelId` (Kiếm Trủng dùng chung địa hình Vân Lam nhưng là level riêng; danh sách prop dùng chung với Vân Lam như `allPropsRaw`).
 */
export interface InstFile {
  ids: string[];
  p: number[][];
}

export const COLLIDER_LIB = libJson as unknown as Record<string, LocalShape[]>;

/** Level → file prop đã bake. `kiem_trung` dùng chung bố cục prop với `van_lam` (cùng bản đồ). */
export const INST_BY_LEVEL: Record<string, InstFile> = {
  van_lam: vanLam,
  kiem_trung: vanLam,
  doan_mach: doanMach,
  van_hai: vanHai,
  thien_khuyet: thienKhuyet,
  bac_hoang: bacHoang,
  do_kiep_bac_hoang: doKiepBacHoang,
  phuc_mach: phucMach,
  kinh_nguyet: kinhNguyet,
  than_tang: thanTang,
  xich_tan_khich: xichTan,
  kim_da_cung: kimDaCung,
} as Record<string, InstFile>;

/** Hình thế giới của mọi prop một level (hàm thuần, dùng cho test và công cụ). */
export function propShapesOf(level: string, lib: Record<string, LocalShape[]> = COLLIDER_LIB): Shape[] {
  const f = INST_BY_LEVEL[level];
  if (!f) return [];
  const out: Shape[] = [];
  for (const r of f.p) {
    const id = f.ids[r[0]!]!;
    const local = lib[id];
    if (!local?.length) continue;
    instantiateShapes(local, { x: r[1]!, z: r[2]!, y: r[3]!, yaw: r[4]!, s: r[5]!, sy: r[6] }, out, id);
  }
  return out;
}

for (const level of Object.keys(INST_BY_LEVEL)) registerCollision(level, propShapesOf(level));

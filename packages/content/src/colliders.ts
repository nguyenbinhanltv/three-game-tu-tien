import { type LocalShape, registerCollision, type Shape } from '@dtl/shared';
import { type ArchFile, archShapesFrom, type InstFile, propShapesFrom, registerCodeShapes } from './colliders.core';
import archKd from '../data/colliders/arch_kim_da.boxes.json';
import archTk from '../data/colliders/arch_thien_khuyet.boxes.json';
import archKt from '../data/colliders/arch_kiem_trung.boxes.json';
import archKn from '../data/colliders/arch_kinh_nguyet.boxes.json';
import archPm from '../data/colliders/arch_phuc_mach.boxes.json';
import archXk from '../data/colliders/arch_xich_tan.boxes.json';
import archTt from '../data/colliders/arch_than_tang.boxes.json';
import archSect from '../data/colliders/arch_sect.boxes.json';
import libJson from '../data/colliders/lib.json';
import extraLib from '../data/colliders/extra-lib.json';
import bacHoang from '../data/colliders/bac_hoang.inst.json';
import vanDinh from '../data/colliders/van_dinh.inst.json';
import cuuKieu from '../data/colliders/cuu_kieu.inst.json';
import gioiTri from '../data/colliders/gioi_tri.inst.json';
import doKiepBacHoang from '../data/colliders/do_kiep_bac_hoang.inst.json';
import doanMach from '../data/colliders/doan_mach.inst.json';
import kiemTrung from '../data/colliders/kiem_trung.inst.json';
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
/** `lib.json` (sinh từ GLB) + `extra-lib.json` (hình ghi tay cho đồ dựng bằng mã: cây phong, thân cây vườn…, id `x_*`). */
export const COLLIDER_LIB = { ...libJson, ...extraLib } as unknown as Record<string, LocalShape[]>;

/** Level → file prop đã bake (kiếm cắm Kiếm Trủng, vườn Lạc Kiếm… nằm trong cùng file qua `extraInstances`). */
export const INST_BY_LEVEL: Record<string, InstFile> = {
  van_lam: vanLam,
  kiem_trung: kiemTrung,
  doan_mach: doanMach,
  van_hai: vanHai,
  thien_khuyet: thienKhuyet,
  bac_hoang: bacHoang,
  van_dinh: vanDinh,
  cuu_kieu: cuuKieu,
  gioi_tri: gioiTri,
  do_kiep_bac_hoang: doKiepBacHoang,
  phuc_mach: phucMach,
  kinh_nguyet: kinhNguyet,
  than_tang: thanTang,
  xich_tan_khich: xichTan,
  kim_da_cung: kimDaCung,
} as Record<string, InstFile>;

/** Hình thế giới của mọi prop một level (hàm thuần, dùng cho test và công cụ). */
export function propShapesOf(level: string, lib: Record<string, LocalShape[]> = COLLIDER_LIB): Shape[] {
  return propShapesFrom(INST_BY_LEVEL[level], lib);
}

for (const level of Object.keys(INST_BY_LEVEL)) registerCollision(level, propShapesOf(level));

/** Level → hộp kiến trúc gộp (arch_*): khóa theo level đang dùng kiến trúc đó. */
export const ARCH_BY_LEVEL: Record<string, ArchFile[]> = {
  van_lam: [archSect as unknown as ArchFile],
  thien_khuyet: [archTk as unknown as ArchFile],
  kiem_trung: [archKt as unknown as ArchFile],
  kim_da_cung: [archKd as unknown as ArchFile],
  phuc_mach: [archPm as unknown as ArchFile],
  xich_tan_khich: [archXk as unknown as ArchFile],
  than_tang: [archTt as unknown as ArchFile],
  kinh_nguyet: [archKn as unknown as ArchFile],
};

for (const level of Object.keys(ARCH_BY_LEVEL)) registerCollision(level, archShapesFrom(ARCH_BY_LEVEL[level] ?? []));

for (const level of ['van_lam', 'gioi_tri']) registerCodeShapes(level);

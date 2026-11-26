// Nạp collider THEO LEVEL cho client (B7): `colliders.ts` nạp ~1,8 MB JSON của mọi level ngay khi import `@dtl/content`; ở client bundle khởi động thay
// `./colliders` bằng `colliders.stub.ts` (xem apps/client/vite.config.ts) và gọi `ensureColliders(level)` trước khi vào level.
// Server/công cụ/test vẫn dùng `colliders.ts` (đăng ký đồng bộ mọi level). Mỗi level chỉ đăng ký MỘT lần.
import { collisionOf, type LocalShape, registerCollision, type Shape } from '@dtl/shared';
import { type ArchFile, archShapesFrom, type InstFile, propShapesFrom, registerCodeShapes } from './colliders.core';

type Json<T> = Promise<{ default: unknown } & Partial<T>>;

/** Mỗi level một chunk (import() với chuỗi cố định để Vite tách): file prop đã bake + các hộp kiến trúc gộp của level đó. */
const INST: Record<string, () => Json<InstFile>> = {
  van_lam: () => import('../data/colliders/van_lam.inst.json'),
  kiem_trung: () => import('../data/colliders/kiem_trung.inst.json'),
  doan_mach: () => import('../data/colliders/doan_mach.inst.json'),
  van_hai: () => import('../data/colliders/van_hai.inst.json'),
  thien_khuyet: () => import('../data/colliders/thien_khuyet.inst.json'),
  bac_hoang: () => import('../data/colliders/bac_hoang.inst.json'),
  van_dinh: () => import('../data/colliders/van_dinh.inst.json'),
  cuu_kieu: () => import('../data/colliders/cuu_kieu.inst.json'),
  gioi_tri: () => import('../data/colliders/gioi_tri.inst.json'),
  do_kiep_bac_hoang: () => import('../data/colliders/do_kiep_bac_hoang.inst.json'),
  phuc_mach: () => import('../data/colliders/phuc_mach.inst.json'),
  kinh_nguyet: () => import('../data/colliders/kinh_nguyet.inst.json'),
  than_tang: () => import('../data/colliders/than_tang.inst.json'),
  xich_tan_khich: () => import('../data/colliders/xich_tan_khich.inst.json'),
  kim_da_cung: () => import('../data/colliders/kim_da_cung.inst.json'),
};
const ARCH: Record<string, () => Json<ArchFile>> = {
  van_lam: () => import('../data/colliders/arch_sect.boxes.json'),
  thien_khuyet: () => import('../data/colliders/arch_thien_khuyet.boxes.json'),
  kiem_trung: () => import('../data/colliders/arch_kiem_trung.boxes.json'),
  kim_da_cung: () => import('../data/colliders/arch_kim_da.boxes.json'),
  phuc_mach: () => import('../data/colliders/arch_phuc_mach.boxes.json'),
  xich_tan_khich: () => import('../data/colliders/arch_xich_tan.boxes.json'),
  than_tang: () => import('../data/colliders/arch_than_tang.boxes.json'),
  kinh_nguyet: () => import('../data/colliders/arch_kinh_nguyet.boxes.json'),
};

let libP: Promise<Record<string, LocalShape[]>> | null = null;
/** `lib.json` (sinh từ GLB) + `extra-lib.json` (hình ghi tay cho đồ dựng bằng mã), dùng chung mọi level: nạp một lần. */
const loadLib = (): Promise<Record<string, LocalShape[]>> =>
  (libP ??= Promise.all([import('../data/colliders/lib.json'), import('../data/colliders/extra-lib.json')]).then(
    ([a, b]) => ({ ...a.default, ...b.default }) as unknown as Record<string, LocalShape[]>,
  ));

const done = new Map<string, Promise<void>>();
const ready = new Set<string>();

/** Đã đăng ký xong collider của level (mức đồng bộ để HUD/dự đoán kiểm). */
export const collidersReady = (level: string): boolean => ready.has(level);

/** Hình prop + kiến trúc của một level đã nạp từ chunk riêng (chưa đăng ký): cùng kết quả với `colliders.ts`, test so từng level. */
export async function loadLevelShapes(level: string): Promise<Shape[]> {
  const [lib, inst, arch] = await Promise.all([INST[level] ? loadLib() : Promise.resolve({}), INST[level]?.(), ARCH[level]?.()]);
  return [...(inst ? propShapesFrom(inst.default as InstFile, lib) : []), ...(arch ? archShapesFrom([arch.default as ArchFile]) : [])];
}

export interface EnsureOptions {
  /** Số lần thử tối đa khi `import()` lỗi (mạng chập chờn, hash chunk cũ 404 sau khi deploy). */
  tries?: number;
  /** Chờ trước lần thử lại thứ n (ms): delayMs × 2^(n-1). */
  delayMs?: number;
  /** Nguồn hình của level (mặc định `loadLevelShapes`); để test chèn loader giả. */
  load?: (level: string) => Promise<Shape[]>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Nạp và đăng ký collider của `level` (chạy lại cho cùng level trả về cùng promise). Level không có dữ liệu bake vẫn nhận hình dựng bằng mã.
 * `import()` lỗi thì thử lại có backoff (`tries` lần); hết lần thì promise bị từ chối và KHÔNG bị nhớ: gọi lại `ensureColliders` sẽ thử từ đầu
 * (frameLoop gọi lại định kỳ khi màn tải quá hạn, nên người chơi không kẹt ở màn tải).
 */
export function ensureColliders(level: string, o: EnsureOptions = {}): Promise<void> {
  let p = done.get(level);
  if (!p && collisionOf(level).shapes.length > 0) {
    // Đã có hình (môi trường nạp `colliders.ts` đầy đủ, như test): không đăng ký lần hai.
    ready.add(level);
    p = Promise.resolve();
    done.set(level, p);
  }
  if (!p) {
    const tries = Math.max(1, o.tries ?? 3);
    const delayMs = o.delayMs ?? 400;
    const load = o.load ?? loadLevelShapes;
    p = (async () => {
      let shapes: Shape[] | null = null;
      for (let n = 1; shapes === null; n++) {
        try {
          shapes = await load(level);
        } catch (e) {
          if (n >= tries) throw e;
          await sleep(delayMs * 2 ** (n - 1));
        }
      }
      // Thứ tự đăng ký giống `colliders.ts`: prop → kiến trúc → hình dựng bằng mã.
      registerCollision(level, shapes);
      registerCodeShapes(level);
      ready.add(level);
    })();
    done.set(level, p);
    p.catch(() => done.delete(level));
  }
  return p;
}

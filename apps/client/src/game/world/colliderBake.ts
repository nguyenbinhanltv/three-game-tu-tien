import { LEVELS } from '@dtl/content';
import { allProps } from './propScatter';

/**
 * Bake vị trí prop đã rải (`allProps`: điểm nhấn + prop Thiên Công + rải tự động) ra JSON gọn theo level để server (không import client)
 * và client dùng CHUNG một nguồn collider (COL-1 / C-2). File: `packages/content/data/colliders/<level>.inst.json`, sinh bằng
 * `pnpm colliders:bake`; test `colliderBake.test.ts` báo đỏ khi hàm rải đổi mà chưa bake lại.
 * Dạng: { ids: [asset id], p: [[idIndex, x, z, y, yaw, s, sy?]] } (làm tròn 0,01; yaw/s 0,001).
 */
export interface InstFile {
  ids: string[];
  p: number[][];
}

/** Level dùng chung danh sách prop với level khác (phải khớp `allPropsRaw`): Kiếm Trủng nằm trên bản đồ Vân Lam. */
export const INST_ALIAS: Record<string, string> = { kiem_trung: 'van_lam' };

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function bakeLevel(level: string): InstFile {
  const ids: string[] = [];
  const idx = new Map<string, number>();
  const p: number[][] = [];
  for (const it of allProps(level)) {
    let k = idx.get(it.id);
    if (k === undefined) {
      k = ids.length;
      idx.set(it.id, k);
      ids.push(it.id);
    }
    const row = [k, r2(it.x), r2(it.z), r2(it.y), r3(it.yaw), r3(it.s)];
    if (it.sy !== undefined && it.sy !== 1) row.push(r3(it.sy));
    p.push(row);
  }
  return { ids, p };
}

/** Level cần file riêng: mọi level trong dữ liệu trừ level dùng chung bố cục (xem `INST_ALIAS`). */
export function bakeLevels(): string[] {
  return Object.keys(LEVELS).filter((l) => !(l in INST_ALIAS));
}

/** Nội dung file (mỗi prop một dòng để diff đọc được). */
export function serialize(f: InstFile): string {
  return `{"ids":${JSON.stringify(f.ids)},"p":[\n${f.p.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
}

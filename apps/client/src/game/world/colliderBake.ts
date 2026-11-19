import { LEVELS } from '@dtl/content';
import { levelId, setActiveLevel, heightAt } from '../../base/levelCtx';
import { LEAN_MIN, propsOf, terrainOf } from '@dtl/shared';
import { mapleSpots } from './doanMachArt';
import { gardenPlan } from './lacKiemGarden';
import { planSmallSwords } from './kiemTrungArt';
import { vanHaiTreeSpots } from './vanHaiGarden';
import { deadTreeSpots, riftPath } from './bacHoangArt';
import { iceSpots, PILLAR_SPOTS } from './bhWonders';
import { allProps, bhCtx } from './propScatter';

/**
 * Bake vị trí prop đã rải (`allProps`: điểm nhấn + prop Thiên Công + rải tự động) ra JSON gọn theo level để server (không import client)
 * và client dùng CHUNG một nguồn collider (COL-1 / C-2). File: `packages/content/data/colliders/<level>.inst.json`, sinh bằng
 * `pnpm colliders:bake`; test `colliderBake.test.ts` báo đỏ khi hàm rải đổi mà chưa bake lại.
 * Dạng: { ids: [asset id], p: [[idIndex, x, z, y, yaw, s, sy?, lean?]] } (làm tròn 0,01; yaw/s 0,001).
 */
export interface InstFile {
  ids: string[];
  p: number[][];
}

/** Level dùng chung danh sách prop với level khác (phải khớp `allPropsRaw`): Kiếm Trủng nằm trên bản đồ Vân Lam. */
export const INST_ALIAS: Record<string, string> = {};

const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Instance collider không phải prop GLB: cây/đồ dựng riêng của từng level (id `x_*` có hình ở `data/colliders/extra-lib.json`). */
export interface ExtraInst {
  id: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  s: number;
  sy?: number;
  lean?: number;
}

function bhDeadTrees(): ExtraInst[] {
  const tr = terrainOf('bac_hoang');
  return deadTreeSpots(bhCtx(propsOf('bac_hoang')), 700).map((t) => ({
    id: 'x_bh_dead_tree',
    x: t.x,
    z: t.z,
    y: tr.heightAt(t.x, t.z),
    yaw: t.yaw,
    s: t.s,
  }));
}

/** Bắc Hoang: cây chết + tinh thể băng ven khe + cột tà trận (`BhWonders` chỉ dựng ở `bac_hoang`, nên Sân Nhật Thực Kiếp chỉ có cây chết). */
function bacHoangExtra(): ExtraInst[] {
  const tr = terrainOf('bac_hoang');
  const out = bhDeadTrees();
  for (const t of iceSpots(riftPath(tr.def), 7))
    out.push({ id: 'x_bh_ice', x: t.x, z: t.z, y: tr.heightAt(t.x, t.z) - 0.1, yaw: t.yaw, s: t.s });
  for (const t of PILLAR_SPOTS) out.push({ id: 'x_bh_pillar', x: t.x, z: t.z, y: tr.heightAt(t.x, t.z), yaw: 0, s: t.s });
  return out;
}

/** Hàm rải riêng theo level (COL-B). Chạy với địa hình của level đó đang hoạt động. */
const EXTRA: Record<string, () => ExtraInst[]> = {
  bac_hoang: bacHoangExtra,
  do_kiep_bac_hoang: bhDeadTrees,
  // Lạc Kiếm Tông (COL-A2): thân trúc vườn (cụm cuối sân), đá rêu vườn. Hoa không va chạm. `gardenPlan` dùng chung với dựng cảnh.
  van_lam: () => {
    const g = gardenPlan();
    return [
      ...g.bamboo.map((b) => ({
        id: 'x_bamboo',
        x: b.x,
        z: b.z,
        y: heightAt(b.x, b.z) - 0.1,
        yaw: b.ry,
        s: (b.sx + b.sz) / 2,
        sy: b.sy / ((b.sx + b.sz) / 2),
      })),
      ...g.rocks.map((r) => ({ id: 'x_garden_rock', x: r.x, z: r.z, y: heightAt(r.x, r.z) + r.s * 0.1, yaw: r.ry, s: r.s })),
    ];
  },
  // Kiếm Trủng (COL-A2): ~1160 kiếm cắm đất (`planSmallSwords`), kiếm nguyên cao h, lưỡi gãy thấp hơn; thanh mảnh nên ngự kiếm bay xuyên.
  kiem_trung: () =>
    planSmallSwords().map((w) => ({
      id: w.kind === 'whole' ? 'x_kt_sword' : 'x_kt_blade',
      x: w.x,
      z: w.z,
      y: heightAt(w.x, w.z) - 0.05,
      yaw: w.yaw,
      s: w.h,
    })),
  doan_mach: () => mapleSpots().map((t) => ({ id: 'x_maple_trunk', x: t.x, z: t.z, y: heightAt(t.x, t.z) - 0.15, yaw: t.rot, s: t.s })),
  van_hai: () => vanHaiTreeSpots(terrainOf('van_hai')).map((t) => ({ id: 'x_vh_trunk', x: t.x, z: t.z, y: t.y, yaw: t.yaw, s: t.s })),
};

export function extraInstances(level: string): ExtraInst[] {
  const fn = EXTRA[level];
  if (!fn) return [];
  const prev = levelId();
  setActiveLevel(level);
  try {
    return fn();
  } finally {
    setActiveLevel(prev);
  }
}

/** Level dùng chung bản đồ với level khác nhưng chỉ cần prop quanh tâm bí cảnh: bán kính giữ lại (m). */
const SHARED_MAP_RADIUS: Record<string, number> = { kiem_trung: 260 };

export function bakeLevel(level: string): InstFile {
  const ids: string[] = [];
  const idx = new Map<string, number>();
  const p: number[][] = [];
  let items = [...allProps(level), ...extraInstances(level)];
  // Bí cảnh nằm trên bản đồ Vân Lam (Kiếm Trủng): `allProps` trả cả bản đồ, chỉ giữ phần trong vùng hang để file nhỏ và không trùng prop của tông môn.
  const dg = SHARED_MAP_RADIUS[level] ? LEVELS[level]?.dungeon : undefined;
  if (dg) items = items.filter((it) => Math.hypot(it.x - dg.center.x, it.z - dg.center.z) <= SHARED_MAP_RADIUS[level]!);
  for (const it of items) {
    let k = idx.get(it.id);
    if (k === undefined) {
      k = ids.length;
      idx.set(it.id, k);
      ids.push(it.id);
    }
    const row = [k, r2(it.x), r2(it.z), r2(it.y), r3(it.yaw), r3(it.s)];
    const lean = it.lean !== undefined && Math.abs(it.lean) >= LEAN_MIN ? it.lean : undefined;
    if ((it.sy !== undefined && it.sy !== 1) || lean !== undefined) row.push(r3(it.sy ?? 1));
    if (lean !== undefined) row.push(r3(lean));
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

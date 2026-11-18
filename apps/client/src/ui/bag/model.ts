/**
 * Logic thuần của túi đồ (TD-B): lọc hiển thị, chia trang, quyết định khi thả. Không đụng store hay mạng,
 * để test được. Tab và ô tìm CHỈ lọc hiển thị; vị trí thật chỉ đổi bằng MOVE/INV_SORT qua server.
 */
import {
  INV_PAGE,
  INV_PAGES,
  INV_SIZE,
  isWearSlot,
  itemCategory,
  type WearSlot,
  type InvItem,
  type InvSlot,
  type ItemCategory,
  type ItemDef,
} from '@dtl/shared';

export type BagTab = 'all' | ItemCategory;
export const BAG_TABS: readonly BagTab[] = ['all', 'gear', 'pill', 'material', 'quest', 'other'];
export type QualityFilter = 'all' | 0 | 1 | 2 | 3 | 4;

export interface BagFilter {
  tab: BagTab;
  /** Chuỗi tìm (chưa chuẩn hóa). */
  query: string;
  quality: QualityFilter;
}

export const NO_FILTER: BagFilter = { tab: 'all', query: '', quality: 'all' };

export function isFiltering(f: BagFilter): boolean {
  return f.tab !== 'all' || f.query.trim() !== '' || f.quality !== 'all';
}

/** Bỏ dấu, hạ chữ thường: "Thanh Phong" khớp "thanh phong" và "thanh phỏng". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}

/** Ô có khớp bộ lọc không. Ô trống chỉ khớp khi không lọc. `name` là tên hiển thị, `quality` đã tính theo `gearQuality`. */
export function matchesFilter(
  item: InvItem | null | undefined,
  def: ItemDef | undefined,
  name: string,
  quality: number,
  f: BagFilter,
): boolean {
  if (!isFiltering(f)) return true;
  if (!item || !def) return false;
  if (f.tab !== 'all' && itemCategory(def) !== f.tab) return false;
  if (f.quality !== 'all' && quality !== f.quality) return false;
  const q = fold(f.query);
  return q === '' || fold(name).includes(q);
}

export function pageOf(slot: number): number {
  return Math.floor(slot / INV_PAGE);
}

export function pageRange(page: number): { from: number; to: number } {
  const p = Math.max(0, Math.min(INV_PAGES - 1, page));
  return { from: p * INV_PAGE, to: p * INV_PAGE + INV_PAGE };
}

export function usedCount(inv: readonly InvSlot[]): number {
  let n = 0;
  for (let i = 0; i < Math.min(inv.length, INV_SIZE); i++) if (inv[i]) n++;
  return n;
}

/** Số ô có đồ ở từng trang. */
export function pageCounts(inv: readonly InvSlot[]): number[] {
  const out = new Array<number>(INV_PAGES).fill(0);
  for (let i = 0; i < Math.min(inv.length, INV_SIZE); i++) if (inv[i]) out[pageOf(i)]++;
  return out;
}

/** Ô trống đầu tiên của trang, hoặc -1. */
export function firstEmptyIn(inv: readonly InvSlot[], page: number): number {
  const { from, to } = pageRange(page);
  for (let i = from; i < to; i++) if (!inv[i]) return i;
  return -1;
}

type DropTarget = { kind: 'cell'; slot: number } | { kind: 'page'; page: number } | { kind: 'equip'; slot: WearSlot };

type DropCmd =
  | { cmd: 'move'; a: number; b: number }
  | { cmd: 'equip'; slot: number }
  | { cmd: 'split'; slot: number; to: number; max: number }
  | { cmd: 'none'; why?: 'full' | 'kind' | 'same' | 'split_busy' };

/**
 * Thả món ở ô `from` lên `target`. `split` (Shift) chỉ hợp lệ khi chồng ≥ 2 và đích là ô trống:
 * khi đó trả về `split` để client hỏi số lượng. Thả lên số trang → ô trống đầu tiên của trang đó.
 * Thả lên ô trang bị: phải đúng loại ô (`def.kind === slot`), khi đó gửi lệnh mặc.
 */
export function planDrop(
  inv: readonly InvSlot[],
  from: number,
  target: DropTarget,
  split: boolean,
  defOf: (id: string) => ItemDef | undefined,
): DropCmd {
  const src = inv[from];
  if (!src) return { cmd: 'none' };
  if (target.kind === 'equip') {
    const def = defOf(src.id);
    return def && isWearSlot(def.kind) && def.kind === target.slot ? { cmd: 'equip', slot: from } : { cmd: 'none', why: 'kind' };
  }
  const to = target.kind === 'cell' ? target.slot : firstEmptyIn(inv, target.page);
  if (to < 0) return { cmd: 'none', why: 'full' };
  if (to === from) return { cmd: 'none', why: 'same' };
  if (split && src.n > 1) return inv[to] ? { cmd: 'none', why: 'split_busy' } : { cmd: 'split', slot: from, to, max: src.n - 1 };
  return { cmd: 'move', a: from, b: to };
}

/** Số lượng tách hợp lệ: nguyên, 1..max. */
export function clampSplit(n: number, max: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

/**
 * Đánh dấu "mới": so túi trước/sau, id nào tăng số lượng (hoặc mới xuất hiện) thì đánh dấu.
 * Đổi chỗ, sắp xếp, tách chồng không đổi tổng số theo id nên không đánh dấu; giảm số lượng gỡ dấu khi hết.
 */
export function diffNew(prev: readonly InvSlot[], next: readonly InvSlot[], marks: Readonly<Record<string, true>>): Record<string, true> {
  const total = (inv: readonly InvSlot[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const s of inv) if (s) m.set(s.id, (m.get(s.id) ?? 0) + s.n);
    return m;
  };
  const a = total(prev);
  const b = total(next);
  const out: Record<string, true> = {};
  for (const id of Object.keys(marks)) if (b.has(id)) out[id] = true;
  for (const [id, n] of b) if (n > (a.get(id) ?? 0)) out[id] = true;
  return out;
}

/** Món `id` mặc được vào ô trang bị `slot` không (để tô sáng ô thả). */
export function itemKindOk(defOf: (id: string) => ItemDef | undefined, id: string, slot: WearSlot): boolean {
  const def = defOf(id);
  return !!def && isWearSlot(def.kind) && def.kind === slot;
}

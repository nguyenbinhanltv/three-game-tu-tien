// Mô hình thuần của cửa sổ Tủ ngoại trang (P4-3): so bản nháp với lựa chọn hiện tại, ra danh sách tin gửi server.
import { DISPLAY_SLOTS, DYE_CHANNELS, wearableBy, type DisplaySlot, type DyeTriple, type OutfitLook } from '@dtl/shared';

/** Bản nháp trong cửa sổ: chưa gửi cho tới khi bấm Áp dụng. `over[slot] === null` = về món đang mặc. */
export interface Draft {
  over: Partial<Record<DisplaySlot, string | null>>;
  dye: DyeTriple | null;
}

export const draftFrom = (look: OutfitLook): Draft => ({
  over: Object.fromEntries(DISPLAY_SLOTS.map((s) => [s, look.over[s] ?? null])) as Draft['over'],
  dye: look.dye ?? null,
});

/**
 * Khóa theo NỘI DUNG của look (không theo tham chiếu): mọi `S.WARDROBE` đều tạo object mới, kể cả khi chỉ mở khóa món mới,
 * nên bản nháp chỉ được đồng bộ lại khi khóa này đổi (không xóa lựa chọn dở dang của người chơi khi nhặt đồ).
 */
export const lookKey = (look: OutfitLook): string =>
  DISPLAY_SLOTS.map((s) => look.over[s] ?? '').join('|') + '#' + (look.dye ? look.dye.join(',') : '');

export type LookCmd = { kind: 'set'; slot: DisplaySlot; id: string | null } | { kind: 'dye'; dye: DyeTriple | null };

const sameDye = (a: DyeTriple | null | undefined, b: DyeTriple | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (!!a && !!b && a.every((x, i) => x === b[i]));

/** Các lệnh cần gửi để đưa `current` thành `draft` (rỗng = không có gì đổi). */
export function planApply(current: OutfitLook, draft: Draft): LookCmd[] {
  const out: LookCmd[] = [];
  for (const slot of DISPLAY_SLOTS) {
    const want = draft.over[slot] ?? null;
    if (want !== (current.over[slot] ?? null)) out.push({ kind: 'set', slot, id: want });
  }
  if (!sameDye(current.dye, draft.dye)) out.push({ kind: 'dye', dye: draft.dye });
  return out;
}

/** Món đã mở khóa thuộc ô `slot`, sắp theo id; kèm cờ dùng được theo giới tính nhân vật. */
export function itemsForSlot(
  owned: readonly string[],
  slot: DisplaySlot,
  gender: string,
  item: (id: string) => { kind: string; gender?: string } | undefined,
): { id: string; ok: boolean }[] {
  return owned
    .filter((id) => item(id)?.kind === slot)
    .sort()
    .map((id) => ({ id, ok: wearableBy(item(id), gender) }));
}

export const emptyDyeTriple = (first: string): DyeTriple => Array.from({ length: DYE_CHANNELS }, () => first) as DyeTriple;

/** Đặt màu cho một kênh; chưa có bộ ba thì khởi tạo từ `base` (màu gốc) rồi đổi kênh đó. */
export function withChannel(dye: DyeTriple | null, ch: number, id: string, base: string): DyeTriple {
  const next: DyeTriple = dye ? [...dye] : emptyDyeTriple(base);
  next[ch] = id;
  return next;
}

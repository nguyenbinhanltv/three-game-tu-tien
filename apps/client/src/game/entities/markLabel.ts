// Nhãn ấn trên đầu mục tiêu (VS-2c): đọc gói bit `mk` server đồng bộ thành chữ + màu. Hàm thuần, không mang luật.
import { unpackMarks, type MarkId } from '@dtl/shared';
import { MARK, t } from '@dtl/content';

export interface MarkView {
  id: MarkId;
  n: number;
  name: string;
  /** Màu hiển thị dạng `#rrggbb`. */
  color: string;
}

/** Danh sách ấn đang có (theo thứ tự cố định `MARK_ORDER`), kèm tên và màu để vẽ. */
export function markViews(mk: number | undefined): MarkView[] {
  return unpackMarks(mk).map(({ id, n }) => ({ id, n, name: t(`mark.${id}.name`), color: '#' + (MARK.get(id)?.color ?? 'ffffff') }));
}

/** Chữ một ấn: tên, kèm "×n" khi từ 2 tầng. */
export function markText(v: Pick<MarkView, 'name' | 'n'>): string {
  return v.n > 1 ? `${v.name} ×${v.n}` : v.name;
}

/** Nhãn một dòng trên đầu mục tiêu; null khi không có ấn nào. Màu lấy theo ấn đầu tiên. */
export function markLabelSpec(mk: number | undefined): { text: string; color: string } | null {
  const vs = markViews(mk);
  const first = vs[0];
  if (!first) return null;
  return { text: '◈ ' + vs.map(markText).join(' · '), color: first.color };
}

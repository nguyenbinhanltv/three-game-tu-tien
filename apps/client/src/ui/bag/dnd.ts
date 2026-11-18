import { create } from 'zustand';
import { useUI } from '../store';
import { diffNew } from './model';

/** Món đang kéo từ túi (ô, có giữ Shift để tách không). Ô trang bị ở bảng nhân vật đọc cái này để sáng lên. */
interface BagDrag {
  slot: number;
  split: boolean;
  /** id vật phẩm đang kéo (để ô trang bị biết hợp loại). */
  id: string;
}

export const useBagDrag = create<{ drag: BagDrag | null }>(() => ({ drag: null }));

export function startBagDrag(d: BagDrag): void {
  useBagDrag.setState({ drag: d });
}

export function endBagDrag(): void {
  if (useBagDrag.getState().drag) useBagDrag.setState({ drag: null });
}

/** Chấm "mới" theo id vật phẩm: nhặt thêm thì bật, rê chuột qua ô thì tắt. */
export const useNewMarks = create<{ marks: Record<string, true> }>(() => ({ marks: {} }));

export function clearNewMark(id: string): void {
  const m = useNewMarks.getState().marks;
  if (!m[id]) return;
  const { [id]: _drop, ...rest } = m;
  useNewMarks.setState({ marks: rest });
}

/** Theo dõi túi, gọi một lần khi vào game; lần đầu có túi (lúc vào) không đánh dấu gì. Trả hàm gỡ. */
export function installNewMarks(): () => void {
  let prev = useUI.getState().inv;
  let primed = prev.some(Boolean);
  return useUI.subscribe((s) => {
    if (s.inv === prev) return;
    if (!primed) {
      primed = s.inv.some(Boolean);
      prev = s.inv;
      return;
    }
    const next = diffNew(prev, s.inv, useNewMarks.getState().marks);
    prev = s.inv;
    const cur = useNewMarks.getState().marks;
    if (Object.keys(next).join() !== Object.keys(cur).join()) useNewMarks.setState({ marks: next });
  });
}

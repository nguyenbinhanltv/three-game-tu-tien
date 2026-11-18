import { create } from 'zustand';

/** Trạng thái màn "Bản đồ chương" (U2-4): mở/đóng, chương và nút đang chọn. Tách khỏi `ui/store` để không đụng bộ cửa sổ. */
interface ChaptersState {
  open: boolean;
  ch: string;
  sel: string;
}
export const useChapters = create<ChaptersState>(() => ({ open: false, ch: '', sel: '' }));

export const openChapters = (): void => useChapters.setState({ open: true });
export const closeChapters = (): void => useChapters.setState({ open: false });
export const toggleChapters = (): void => useChapters.setState((s) => ({ open: !s.open }));
export const pickChapter = (ch: string, sel = ''): void => useChapters.setState({ ch, sel });
export const pickNode = (sel: string): void => useChapters.setState({ sel });

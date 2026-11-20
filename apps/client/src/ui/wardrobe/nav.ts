// Mở/đóng Tủ ngoại trang như một cửa sổ riêng, căn giữa, thay chỗ bảng nhân vật (và túi): không chồng lên nhau.
import { closePanel, openPanel } from '../store';

export function openWardrobe(): void {
  closePanel('char');
  closePanel('bag');
  openPanel('wardrobe');
}

/** Đóng tủ và quay về bảng nhân vật (nơi người chơi mở tủ). */
export function closeWardrobe(): void {
  closePanel('wardrobe');
  openPanel('char');
}

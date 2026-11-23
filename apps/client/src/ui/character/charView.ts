// Kiểu xem giữa bảng Nhân vật (U10): nhớ ở localStorage, bọc try/catch vì bộ nhớ có thể bị chặn (chế độ riêng tư, chính sách trình duyệt).
export type CharView = 'art' | '3d';
const KEY = 'dtl.charView';

export function readCharView(): CharView {
  try {
    return localStorage.getItem(KEY) === '3d' ? '3d' : 'art';
  } catch {
    return 'art';
  }
}

export function writeCharView(v: CharView): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // bộ nhớ bị chặn: chỉ không nhớ được lựa chọn
  }
}

import { createRoot } from 'react-dom/client';
import { AssetViewer } from './AssetViewer';
import './viewer.css';

/** Điểm vào trang xem asset (?viewer=asset&file=...). Chỉ nạp qua dynamic import từ main.tsx. */
export function mountViewer(el: HTMLElement): void {
  createRoot(el).render(<AssetViewer />);
}

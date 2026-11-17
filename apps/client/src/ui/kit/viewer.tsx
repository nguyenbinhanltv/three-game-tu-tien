import { createRoot } from 'react-dom/client';
import { installMotion } from '../ngj/motion';
import { KitViewer } from './KitViewer';
import './viewer.css';

/** Điểm vào trang xem bộ khung UI (?viewer=ui). Chỉ nạp qua dynamic import từ main.tsx. */
export function mountKitViewer(el: HTMLElement): void {
  installMotion();
  createRoot(el).render(<KitViewer />);
}

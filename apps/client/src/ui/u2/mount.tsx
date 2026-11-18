import { createRoot } from 'react-dom/client';
import { U2Kit } from './U2Kit';
import { installMotion } from '../ngj/motion';

/** Điểm vào trang xem UI Kit 2.0 (?ui=kit). Chỉ nạp qua dynamic import từ main.tsx. */
export function mountU2Kit(el: HTMLElement): void {
  installMotion();
  createRoot(el).render(<U2Kit />);
}

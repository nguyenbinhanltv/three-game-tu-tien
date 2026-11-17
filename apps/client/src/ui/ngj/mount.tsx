import { createRoot } from 'react-dom/client';
import { NgjKit } from './NgjKit';
import { installMotion } from './motion';
import './tokens.css';
import './ngj.css';
import './kit-page.css';
import '../kit/tokens.css';
import '../kit/kit.css';

/** Điểm vào trang xem bộ giao diện Ngọc Giản Kim Văn (?ui=kit). Chỉ nạp qua dynamic import từ main.tsx. */
export function mountNgjKit(el: HTMLElement): void {
  installMotion();
  createRoot(el).render(<NgjKit />);
}

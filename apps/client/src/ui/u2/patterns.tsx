import type { SVGProps } from 'react';

/**
 * Họa tiết SVG tự vẽ của Kit 2.0. Mọi màu lấy từ biến CSS --u-* (qua `currentColor` hoặc `var()`), không hex.
 * Dùng làm trang trí: `aria-hidden`. Hình đơn giản (ít path) để tải nhẹ và vẽ nhanh.
 */
type P = Omit<SVGProps<SVGSVGElement>, 'children'>;
const deco = { 'aria-hidden': true, focusable: false } as const;

/** Góc kim chạm mây (góc trên-trái; xoay bằng CSS cho các góc còn lại). 40×40. */
export function CornerCloud(p: P) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...deco} {...p}>
      <path d="M2 38V9C2 5 5 2 9 2h29" />
      <path d="M8 38V14c0-3.3 2.7-6 6-6h24" opacity="0.55" />
      <path d="M13 13c0-3 4.5-3.2 4.5-.2 0 2.2-3 2.4-3.4.6M19 8.5c2.2-1.8 5.6-.4 4.6 2" />
      <circle cx="2" cy="2" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Mây cuốn (vân tường vân) làm vạch phân cách. 120×14. */
export function CloudScroll(p: P) {
  return (
    <svg viewBox="0 0 120 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" {...deco} {...p}>
      <path d="M0 7h38M82 7h38" opacity="0.6" />
      <path d="M38 7c3 0 3-4.6 6.4-4.6S47 7 50 7s2.6-3.4 5.4-3.4S58 7 60 7s2.6-3.4 5.4-3.4S68 7 70 7s2.4-4.6 6-4.6S79 7 82 7" />
      <path d="M44 7c0 3 3 4.6 5.6 3.2M70 7c0 3-3 4.6-5.6 3.2" opacity="0.6" />
    </svg>
  );
}

/** Vân sóng (đường lượn) cho viền tiêu đề, đáy thẻ. 96×10. */
export function WaveLine(p: P) {
  return (
    <svg viewBox="0 0 96 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" {...deco} {...p}>
      <path d="M0 5c6 0 6-4 12-4s6 8 12 8 6-8 12-8 6 8 12 8 6-8 12-8 6 8 12 8 6-8 12-8 6 4 12 4" />
    </svg>
  );
}

/** Vết mực loang (nền cho tên chiêu, thẻ chương): đường viền rách tay, fill = currentColor. 320×64. */
export function InkStroke(p: P) {
  return (
    <svg viewBox="0 0 320 64" preserveAspectRatio="none" fill="currentColor" {...deco} {...p}>
      <path d="M4 34c8-9 14-5 24-12 10-7 20 0 34-8 14-8 24 3 44-4 22-7 34 4 58-3 20-6 34 4 52-2 22-8 34 6 56-2 18-6 30 4 40-1 6-3 6 6 4 12 6 4-2 9 2 14-8 5-4 12-12 14-10 3-16-5-30 2-16 8-28-4-46 2-20 7-34-6-56 2-22 7-34-3-58 3-22 5-34-4-52 2-18 6-26-3-42 1-12 3-18-4-24-1-8-7-6-12-12-14-5-4 3-9-2-12z" />
      <path d="M300 18c10-2 16 2 18 8-6-1-12-1-18-8zM14 50c-6 2-9 6-8 10 6-2 10-5 8-10z" opacity="0.7" />
    </svg>
  );
}

/** Ấn son vuông (con dấu), khắc hình thoi trừu tượng (không chữ thật để khỏi cần i18n). 40×40. */
export function SonSeal(p: P) {
  return (
    <svg viewBox="0 0 40 40" {...deco} {...p}>
      <path d="M3 5l4-2h27l3 3v29l-4 3H8l-5-3z" fill="currentColor" />
      <path d="M20 9l8 8-8 8-8-8zM20 27l4 4h-8z" fill="none" stroke="var(--u-son-text)" strokeWidth="1.8" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

/** Vòng ngọc chân dung (khung tròn có bốn mặt thoi). Đặt quanh phần tử vuông. */
export function JadeRing({ tone = 'ngoc', ...p }: P & { tone?: 'ngoc' | 'kim' | 'son' }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" data-tone={tone} className="u2-ring" {...deco} {...p}>
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="4" />
      <circle cx="50" cy="50" r="41" stroke="var(--u-gold)" strokeWidth="1" opacity="0.85" />
      <g fill="currentColor" stroke="var(--u-gold)" strokeWidth="1">
        <path d="M50 0l5 5-5 5-5-5z" />
        <path d="M50 90l5 5-5 5-5-5z" />
        <path d="M0 50l5-5 5 5-5 5z" />
        <path d="M90 50l5-5 5 5-5 5z" />
      </g>
    </svg>
  );
}

/** Dấu khóa. 24×24. */
export function LockMark(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...deco} {...p}>
      <path d="M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3M12 14.5V17" />
    </svg>
  );
}

/** Dấu đóng (chữ thập). 24×24. */
export function CrossMark(p: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" {...deco} {...p}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

import type { SVGProps } from 'react';
import { INK_PATHS } from './inkPaths';

/**
 * Họa tiết SVG tự vẽ của Kit 2.0. Mọi màu lấy từ biến CSS --u-* (qua `currentColor` hoặc `var()`), không hex.
 * Dùng làm trang trí: `aria-hidden`. Hình đơn giản (ít path) để tải nhẹ và vẽ nhanh.
 */
type P = Omit<SVGProps<SVGSVGElement>, 'children'>;
const deco = { 'aria-hidden': true, focusable: false } as const;

/**
 * Góc kim chạm mây (góc trên-trái; xoay bằng CSS cho các góc còn lại). 48×48.
 * Khung chữ L hai nét (đậm ngoài, mảnh trong) bo ở góc; cụm mây cuộn ba thùy ở góc; hạt ngọc kim ở đầu mút.
 */
export function CornerCloud(p: P) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...deco}
      {...p}
    >
      <path d="M3 46V15C3 8.4 8.4 3 15 3h31" />
      <path d="M8.5 46V18.5c0-5.5 4.5-10 10-10H46" strokeWidth="0.9" opacity="0.6" />
      <path d="M16 16.5c0-3.4 4.2-4.4 6-2 1.6 2.2-.4 5-3 4.6-1.9-.3-2.2-2.5-.8-3.2" strokeWidth="1.3" />
      <path d="M22 14.5c2.4-3 7-3.4 9.4-.6 1.8 2.2.8 5-1.6 5.3M16.5 22c-3 2.4-3.4 7-.6 9.4 2.2 1.8 5 .8 5.3-1.6" strokeWidth="1.3" />
      <path d="M31.4 13.9c3-1.6 7.5-.8 10.5 1.2M13.9 31.4c-1.6 3-.8 7.5 1.2 10.5" strokeWidth="1" opacity="0.8" />
      <path d="M26 3.2c1 2.4 2.8 3.6 5.4 3.6M3.2 26c2.4 1 3.6 2.8 3.6 5.4" strokeWidth="0.9" opacity="0.7" />
      <path d="M3 .2l3 3-3 3-3-3z" fill="currentColor" stroke="none" />
      <circle cx="46" cy="3" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="3" cy="46" r="1.5" fill="currentColor" stroke="none" />
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

/** Vết mực nét bút lông (sinh bởi tools/ui/gen-ink.mjs): đầu bút đậm, đuôi thưa, xơ cọ, mép răng cưa. `variant` 0–2; `flip` đảo đầu/đuôi. 320×64. */
export function InkStroke({ variant = 0, flip, style, ...p }: P & { variant?: number; flip?: boolean }) {
  const n = INK_PATHS.length;
  return (
    <svg
      viewBox="0 0 320 64"
      preserveAspectRatio="none"
      fill="currentColor"
      {...deco}
      {...p}
      style={flip ? { transform: 'scaleX(-1)', ...style } : style}
    >
      <path d={INK_PATHS[((variant % n) + n) % n]} />
    </svg>
  );
}

/** Ấn son vuông (con dấu), khắc hình thoi trừu tượng (không chữ thật để khỏi cần i18n). 40×40. */
export function SonSeal(p: P) {
  return (
    <svg viewBox="0 0 40 40" {...deco} {...p}>
      <path d="M3 5l4-2h27l3 3v29l-4 3H8l-5-3z" fill="currentColor" />
      <path
        d="M20 9l8 8-8 8-8-8zM20 27l4 4h-8z"
        fill="none"
        stroke="var(--u-son-text)"
        strokeWidth="1.8"
        strokeLinejoin="round"
        opacity="0.9"
      />
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
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...deco}
      {...p}
    >
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

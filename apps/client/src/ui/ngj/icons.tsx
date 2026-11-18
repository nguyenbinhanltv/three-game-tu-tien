import type { SVGProps } from 'react';

/** Bộ icon hệ thống nét vàng (UI-1): 24×24, cùng độ dày nét 1,5, màu theo `currentColor`. Thay emoji; không nhồi màu đặc. */
const P: Record<string, string> = {
  // đả tọa: người ngồi trên đài sen
  meditate:
    'M12 4.2a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8zM12 8.4v4.2M8 11.2l4 1.4 4-1.4M6.4 16.4c1.7-2 3.6-2.8 5.6-2.8s3.9.8 5.6 2.8M4 19c2.5 1.7 5 2.2 8 2.2s5.5-.5 8-2.2',
  // ngự kiếm
  sword: 'M19.5 3.5l-9.2 9.2M19.5 3.5h-4.2m4.2 0v4.2M9 11.5l3.5 3.5M6.2 14.3l3.5 3.5M5 16.6L3.6 21l4.4-1.4M4.6 20.2l1.6-1.6',
  // túi
  bag: 'M9 3.5c.6 1.4 1.6 2 3 2s2.4-.6 3-2M8.5 6.8c-3 2.6-4.8 5.6-4.8 8.4 0 3 2.4 5.3 8.3 5.3s8.3-2.3 8.3-5.3c0-2.8-1.8-5.8-4.8-8.4M9 10.6c1.2.8 2.2 1.1 3 1.1s1.8-.3 3-1.1',
  // nhân vật
  character:
    'M12 3.8c2.2 0 3.6 1.7 3.6 3.9s-1.4 4.2-3.6 4.2-3.6-2-3.6-4.2S9.8 3.8 12 3.8zM4.6 20.2c.4-4 3.4-6.2 7.4-6.2s7 2.2 7.4 6.2M9.2 6c1.5.6 3.3.6 5.6 0',
  // công pháp: sách mở có kiếm
  method: 'M3.6 6.2c3-.9 5.6-.7 8.4 1 2.8-1.7 5.4-1.9 8.4-1v12c-3-.9-5.6-.7-8.4 1-2.8-1.7-5.4-1.9-8.4-1zM12 7.2v12M16.4 8.4l-3.2 5.2',
  // tổ đội
  party:
    'M12 5.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8zM6.2 20c.2-3 2.4-4.6 5.8-4.6s5.6 1.6 5.8 4.6M5.6 9.2a1.9 1.9 0 1 1 0 3.8M2.8 18c.1-1.8 1-2.9 2.6-3.3M18.4 9.2a1.9 1.9 0 1 0 0 3.8M21.2 18c-.1-1.8-1-2.9-2.6-3.3',
  // nhiệm vụ: cuộn giấy có ấn
  quest:
    'M6.5 4.2h11a1.6 1.6 0 0 1 1.6 1.6v9.2M6.5 4.2A1.8 1.8 0 0 0 4.7 6v1.4h3.4M8.1 7.4V18c0 1.2-.9 1.9-1.9 1.9H15c1.2 0 2-.8 2-1.9v-1.1H8.1M11 9.2h5M11 12h4',
  // bản đồ: la bàn + núi
  map: 'M12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6zM12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M7.6 15.6l3-4.2 2 2.6 1.4-1.8 2.4 3.4z',
  // cài đặt: bánh răng
  settings:
    'M12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM12 3.4l1.3 2 2.3-.5.9 2.2 2.2.9-.5 2.3 2 1.3-2 1.3.5 2.3-2.2.9-.9 2.2-2.3-.5-1.3 2-1.3-2-2.3.5-.9-2.2-2.2-.9.5-2.3-2-1.3 2-1.3-.5-2.3 2.2-.9.9-2.2 2.3.5z',
  // thư
  mail: 'M3.6 6.4h16.8v11.2H3.6zM3.6 7l8.4 6.2L20.4 7M3.9 17.2l5.6-5.4M20.1 17.2l-5.6-5.4',
  // cửa hàng: túi tiền
  shop: 'M9 3.6c.6 1.2 1.6 1.8 3 1.8s2.4-.6 3-1.8M8.4 6.6C5.6 9 4 11.8 4 14.6c0 3.2 2.4 5.8 8 5.8s8-2.6 8-5.8c0-2.8-1.6-5.6-4.4-8M12 10.8v6.4M9.6 12.4h4.8M9.8 15h4.4',
  // luyện đan: đỉnh nhỏ có khói
  alchemy:
    'M8.4 9.6h7.2M7 9.6c-.6 1.2-.8 2.4-.8 3.6 0 3 2.4 5 5.8 5s5.8-2 5.8-5c0-1.2-.2-2.4-.8-3.6M6.2 12.4H4.4M17.8 12.4h1.8M8.6 18.2l-.8 2M15.4 18.2l.8 2M12 6.4c-.8-.9-.8-1.7 0-2.5M9.4 6.4c-.6-.7-.6-1.3 0-2M14.6 6.4c-.6-.7-.6-1.3 0-2',
  // rèn: đe và búa
  forge:
    'M4 12.2h10.2c.4 1.8 1.6 2.6 3.6 2.6H20c-.6 1.2-1.6 1.8-3 2v2.2H8.6v-2.2c-2.6-.4-4-2-4.6-4.6zM6.8 8.4l5-2.8 1.8 2.6-5 2.8zM12.2 5.6l3.6-2M15 8.4l2.6-1.4',
  // linh thạch: tinh thể lục giác
  stone: 'M12 3l6 3.5v7L12 21l-6-7.5v-7zM12 3v18M6 6.5l6 3.6 6-3.6M6 13.5l6-3.4 6 3.4',
  // trang sức đầu: trâm cài và ngọc (không phải mũ miện emoji)
  head: 'M12 5.2c1.1 1.6 2.6 2.4 4.4 2.4M12 5.2c-1.1 1.6-2.6 2.4-4.4 2.4M12 3.2l1.1 2-1.1 1.4-1.1-1.4zM5.4 9.6c1.9.9 4 1.4 6.6 1.4s4.7-.5 6.6-1.4M4 7.6l1.4 2M20 7.6l-1.4 2M12 11v6.6M12 17.6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  // trợ giúp: dấu hỏi trong thoi
  help: 'M12 3.4l8.6 8.6-8.6 8.6L3.4 12zM9.8 10c.2-1.3 1.2-2 2.3-2 1.3 0 2.1.8 2.1 1.8 0 1.6-2.2 1.7-2.2 3.3M12 16.2v.4',
  // nhảy: mũi tên lên trên mặt đất
  jump: 'M12 18.5V6M7 10.8L12 5.6l5 5.2M6 20.4h12',
  // lướt: vạch gió và mũi tên tới
  dash: 'M3.6 8h8.4M2.6 12h12M5.6 16h8.4M14.4 7l5.4 5-5.4 5',
  // tương tác / nói chuyện: bong bóng thoại
  talk: 'M4.4 5.6h15.2v10H12.4L8.2 19v-3.4H4.4zM8.4 9.6h7.2M8.4 12.2h4.4',
  // đổi mục tiêu: tâm ngắm
  target:
    'M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4zM12 8.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3',
  // đóng / quay lại: dấu x trong thoi
  close: 'M12 3.4l8.6 8.6-8.6 8.6L3.4 12zM9 9l6 6m0-6l-6 6',
};

export type SysIconName = keyof typeof P;
export const SYS_ICON_NAMES = Object.keys(P) as SysIconName[];

export function isSysIcon(name: string): name is SysIconName {
  return name in P;
}

export function SysIcon({ name, size = 24, ...rest }: { name: SysIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      className="ngj-sysicon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  );
}

/**
 * Chữ triện (tiểu triện) cho số: nét đều, đầu tròn, vẽ tay bằng đường nét (24×24), không cần font.
 * Hình dáng là bản xấp xỉ, đủ cho số cảnh giới/chương (1–99). Dùng `SealNumeral` bên dưới.
 */
const SEAL: Record<string, string> = {
  '1': 'M4 12h16',
  '2': 'M6 8h12M3.5 16h17',
  '3': 'M6 6h12M8 12h8M3.5 18h17',
  '4': 'M5 4.5h14v15H5zM9.4 8.4v5.4c0 1.4 1 2 2.6 2M14.6 8.4v5.4c0 1.4-1 2-2.6 2',
  '5': 'M5 4.5h14M5 19.5h14M8.5 8l7 8M15.5 8l-7 8',
  '6': 'M12 2.8v3M4 7h16M9 10.2c-.4 3.4-1.8 6.4-4 9M15 10.2c.4 3.4 1.8 6.4 4 9M12 10.4v4',
  '7': 'M4 11.5h16M12 3.5v13c0 2.4 1.8 3.4 4.4 3',
  '8': 'M10 5c-.2 5-1.8 10-5 14.5M14 5c.2 5 1.8 10 5 14.5',
  '9': 'M7 4c-.2 5.4-1.4 11-4 16M5 8.2h11c0 7 .8 10 3.2 11.6M11 3.5c0 4.4-1 9.4-4.4 14.5',
  '10': 'M4 12h16M12 3.5v17',
};

/** Số nguyên 1–99 thành dãy chữ triện (mười = 十, 13 = 十三, 20 = 二十). */
function sealGlyphs(n: number): string[] {
  const v = Math.max(1, Math.min(99, Math.floor(n)));
  const tens = Math.floor(v / 10);
  const ones = v % 10;
  const out: string[] = [];
  if (tens >= 2) out.push(String(tens));
  if (tens >= 1) out.push('10');
  if (ones) out.push(String(ones));
  return out;
}

export function SealNumeral({ n, size = 28, label }: { n: number; size?: number; label?: string }) {
  const g = sealGlyphs(n);
  return (
    <span className="ngj-seal" role="img" aria-label={label ?? String(n)} style={{ height: size }}>
      {g.map((k, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={SEAL[k]} />
        </svg>
      ))}
    </span>
  );
}

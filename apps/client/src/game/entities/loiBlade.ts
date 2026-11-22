// Lôi tu (TN-9): kiếm có hồ quang điện MỘT lớp, không thêm lưới nào: ánh kiếm trắng xanh điện (lõi sáng, đọc rõ trên cỏ sáng), phát sáng bậc 2 và
// CHẬP CHỜN nhẹ: màu ánh kiếm đổi giữa vài sắc trắng xanh – tím lam theo khung thời gian (~12 lần/giây, tất định theo `time`, không ngẫu nhiên).
// Bộ trang bị có màu lưỡi riêng và cường hóa cao hơn vẫn thắng.
import { LOI_METHOD } from '@dtl/shared';
import { PATH } from '@dtl/content';

/** Số lần đổi sắc mỗi giây của hồ quang. */
export const LOI_FLICKER_HZ = 12;
/** Dải sắc của hồ quang (hex 6 ký tự): lõi trắng xanh `rim` của hướng, rồi các sắc tối hơn dần về thân tím lam. */
const MIX = [1, 0.55, 0.85, 0.35, 0.7, 0.2];

function mixHex(a: string, b: string, k: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const m = (i: number) =>
    Math.round(ch(a, i) * k + ch(b, i) * (1 - k))
      .toString(16)
      .padStart(2, '0');
  return `#${m(0)}${m(2)}${m(4)}`;
}

/** Màu ánh kiếm ('#rrggbb', '' = không) và bậc phát sáng của người đang tu `mt` ở thời điểm `time` (giây). */
export function bladeLook(mt: string | undefined, setBlade: string, glow: number, time = 0): { tint: string; glow: number } {
  if (mt !== LOI_METHOD) return { tint: setBlade, glow };
  const pal = PATH.get('loi_tu')?.palette;
  const frame = Math.floor(Math.max(0, time) * LOI_FLICKER_HZ);
  const tint = setBlade || (pal ? mixHex(pal.rim, pal.body, MIX[frame % MIX.length]!) : '');
  return { tint, glow: Math.max(glow, 2) };
}

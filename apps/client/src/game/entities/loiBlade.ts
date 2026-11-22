// Lôi tu (TN-9 PR2): kiếm có hồ quang điện MỘT lớp, không thêm lưới nào: đổi màu ánh kiếm sang trắng xanh điện (lõi sáng, đọc rõ trên cỏ sáng) và bật phát sáng bậc 2
// (cùng cơ chế ánh kiếm của cường hóa/bộ trang bị). Bộ trang bị có màu lưỡi riêng và cường hóa cao hơn vẫn thắng.
import { LOI_METHOD } from '@dtl/shared';
import { PATH } from '@dtl/content';

/** Màu ánh kiếm ('#rrggbb', '' = không) và bậc phát sáng của người đang tu `mt`. */
export function bladeLook(mt: string | undefined, setBlade: string, glow: number): { tint: string; glow: number } {
  if (mt !== LOI_METHOD) return { tint: setBlade, glow };
  const rim = PATH.get('loi_tu')?.palette.rim;
  return { tint: setBlade || (rim ? `#${rim}` : ''), glow: Math.max(glow, 2) };
}

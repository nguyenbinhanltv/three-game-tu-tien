// TN-2 (PR dữ liệu + server): chiêu Hồn tu đã có loại FX riêng nhưng hình riêng làm ở PR VFX. Tới lúc đó, mỗi loại mượn
// hình của một chiêu sẵn có (màu vẫn theo `c` server gửi, là màu của công pháp). PR VFX thay từng dòng bằng timeline riêng
// rồi xóa file này.
import type { FxMsg } from '@dtl/shared';

export const FX_ALIAS: Readonly<Record<string, string>> = {
  phehon: 'kanh',
  honbinh: 'kiemdan',
  honbinh_hit: 'kiemdan_hit',
  suuhon: 'kiemvu',
  amhontrieu: 'hoanhkiem',
  dinhthan: 'slash',
  hoangtuyen: 'vankiem',
  // Đao tu (PR dữ liệu + server): mượn hình tạm, PR VFX thay bằng timeline riêng
  baonhan: 'slash',
  tramson: 'vankiem',
  hoanhdao: 'hoanhkiem',
  tamdao: 'kimchung',
  doanluu: 'slash',
  lietdia: 'thietquyen',
};

/** Loại FX chỉ để báo cho giao diện, chưa có hình (không vẽ gì, không cảnh báo). */
export const FX_SILENT: ReadonlySet<string> = new Set(['soul_reap']);

/** Tin FX sau khi đổi loại mượn hình (không sửa tin gốc). */
export function aliasFx(m: FxMsg): FxMsg {
  const t = FX_ALIAS[m.t];
  return t ? { ...m, t } : m;
}

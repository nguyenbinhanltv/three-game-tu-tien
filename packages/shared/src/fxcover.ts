// Ước lượng TĨNH độ phủ màn hình và overdraw của một timeline FX (B10, kế hoạch hiệu năng bản đồ): chạy trong `content:check`, không cần trình duyệt.
// Chỉ là ước lượng thô để bắt lỗi nặng (đĩa sprite phủ cả màn, chồng quá nhiều lớp), KHÔNG thay `pixelCover` đo trên ảnh.
// Giả định camera chéo khóa (FOV 32°, nghiêng 52°, cách ~20 m): khung 1080p thấy khoảng `FX_SCREEN_GROUND_M2` mét vuông mặt đất.

import type { FxEvent } from './fxtimeline';

/** Diện tích mặt đất nhìn thấy trong khung (m²): (2·20·tan16° / sin52°) × (16/9 lần) ≈ 14,6 × 26 m. Làm tròn xuống để ước lượng thận trọng (dễ báo quá hơn bỏ sót). */
export const FX_SCREEN_GROUND_M2 = 300;

/** Vùng của chiêu: kích cỡ nhân (`mul`: tròn r/4, quạt/dải r/8, kẹp 0,5..4) như `hazardMul` ở client. */
export interface FxCoverCtx {
  mul: number;
}

export interface FxCoverEstimate {
  /** Tổng (diện tích × độ đậm) các lớp phủ mặt đất ở lúc đỉnh, chia diện tích khung (có thể > 1 khi nhiều lớp chồng). */
  cover: number;
  /** Số lớp phủ mặt đất (decal + sprite phẳng + sprite đứng cỡ lớn) chồng nhau nhiều nhất tại một thời điểm. */
  overdraw: number;
}

const num = (v: number | [number, number, number] | undefined, d: number): number => (Array.isArray(v) ? Math.max(...v) : (v ?? d));

/** Diện tích che (m²) tại đỉnh của một sự kiện, hoặc 0 nếu không phải lớp phủ đáng kể (hạt, chớp, rung...). */
export function fxEventArea(e: FxEvent, ctx: FxCoverCtx): number {
  if (e.type === 'decal') {
    if (e.strip) return e.strip[0] * e.strip[1];
    const r = e.r * ctx.mul;
    return (e.sector ? Math.min(1, e.sector / 180) : 1) * Math.PI * r * r;
  }
  if (e.type === 'mesh' && e.shape === 'sprite') {
    const side = 2 * Math.max(num(e.scale, 1), num(e.scaleTo, 1)) * ctx.mul;
    // Sprite phẳng nằm trên đất che cả ô; sprite đứng (billboard) chiếm khoảng nửa vì chiếu lên màn thấp hơn.
    return side * side * (e.billboard === false ? 0.7 : 0.35);
  }
  return 0;
}

/** Ước lượng độ phủ và overdraw của một tập sự kiện. Chỉ tính decal và sprite (hình lớn nhất che màn); `alpha` mặc định 1. */
export function fxCoverEstimate(events: readonly FxEvent[], ctx: FxCoverCtx): FxCoverEstimate {
  const layers: { t0: number; t1: number; w: number }[] = [];
  for (const e of events) {
    const area = fxEventArea(e, ctx);
    if (area <= 0) continue;
    const dur = 'dur' in e && typeof e.dur === 'number' ? e.dur : 1;
    const a = 'alpha' in e && typeof e.alpha === 'number' ? e.alpha : 1;
    layers.push({ t0: e.t, t1: e.t + dur, w: (a * area) / FX_SCREEN_GROUND_M2 });
  }
  let cover = 0;
  let overdraw = 0;
  // Lớp bắt đầu ở thời điểm t: đếm các lớp đang sống ở mọi mốc bắt đầu; phủ = tổng trọng số lớn nhất.
  for (const l of layers) {
    let c = 0;
    let n = 0;
    for (const o of layers) {
      if (o.t0 <= l.t0 && l.t0 < o.t1) {
        c += o.w;
        n++;
      }
    }
    cover = Math.max(cover, c);
    overdraw = Math.max(overdraw, n);
  }
  return { cover, overdraw };
}

/**
 * Hệ số hiệu chỉnh ước lượng tĩnh → độ phủ đo trên ảnh (`pixelCover`/mặt nạ màu): ước lượng cộng diện tích mọi lớp như thể không bị đè lên nhau và không cắt theo khung nên
 * cao hơn số đo khoảng 7–10 lần (A5: Thiên Khuyết chant ước 1,43 → đo ~0,11–0,18; Địa Mạch Long chant ước 2,05). 0,13 là trần hiệu chỉnh sao cho mọi thẻ đã duyệt đều qua.
 */
export const FX_COVER_CALIB = 0.13;

/** Số lớp chồng tối đa theo ước lượng tĩnh (thô: lớp đứng/ngoài khung đều được đếm). Chốt ở mức lớn nhất của nội dung đã duyệt (12) cộng dư; chỉ để chặn hồi quy lớn. */
export const FX_OVERDRAW_LAYERS_MAX = 14;

/** Lỗi (rỗng nếu đạt) khi ước lượng phủ/overdraw của một timeline vượt trần: phủ hiệu chỉnh ≤ `budget.screenCover` của thẻ, số lớp ≤ `FX_OVERDRAW_LAYERS_MAX`. */
export function checkFxCover(at: string, est: FxCoverEstimate, budget: { screenCover: number }): string[] {
  const e: string[] = [];
  const cover = est.cover * FX_COVER_CALIB;
  if (cover > budget.screenCover)
    e.push(
      `${at}: ước lượng phủ màn ${cover.toFixed(2)} (thô ${est.cover.toFixed(2)} × ${FX_COVER_CALIB}) > budget.screenCover ${budget.screenCover} — giảm cỡ/độ đậm sprite phẳng và decal`,
    );
  if (est.overdraw > FX_OVERDRAW_LAYERS_MAX)
    e.push(`${at}: ${est.overdraw} lớp phủ chồng nhau > ${FX_OVERDRAW_LAYERS_MAX} — bớt lớp sprite/decal đồng thời`);
  return e;
}

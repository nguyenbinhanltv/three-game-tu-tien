// Lò rèn texture VFX (V-P0): các hàm thuần trên raster float RGBA (alpha thẳng, 0..1). Không IO: IO ở io.ts, CLI ở cli.ts.
// Quy trình: tách alpha (từ độ sáng nền đen hoặc kênh alpha sẵn) → cân sáng → khử viền → dò lưới flipbook → đóng kênh R/G/B.

export interface Raster {
  w: number;
  h: number;
  /** RGBA xen kẽ, alpha thẳng (không nhân sẵn), mỗi giá trị 0..1. */
  data: Float32Array;
}

export const newRaster = (w: number, h: number): Raster => ({ w, h, data: new Float32Array(w * h * 4) });
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Phân vị p (0..1) của một dải giá trị (đếm theo 1024 thùng, đủ cho cân sáng). */
export function percentile(values: ArrayLike<number>, p: number): number {
  const bins = new Uint32Array(1024);
  for (let i = 0; i < values.length; i++) bins[Math.min(1023, Math.floor(clamp01(values[i]!) * 1024))]!++;
  const goal = p * values.length;
  let acc = 0;
  for (let b = 0; b < 1024; b++) {
    acc += bins[b]!;
    if (acc >= goal) return (b + 1) / 1024;
  }
  return 1;
}

/** Ảnh có alpha thật (hơn 2% điểm trong suốt đáng kể)? */
export function hasRealAlpha(r: Raster): boolean {
  let n = 0;
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i]! < 0.95) n++;
  return n > 0.02 * r.w * r.h;
}

export type AlphaMode = 'luma' | 'alpha' | 'auto';

/**
 * Tách alpha. `luma`: ảnh vẽ trên nền đen, alpha = độ sáng (max RGB) kéo giãn giữa mức đen (phân vị 2%) và mức trắng (phân vị 99,5%),
 * màu = RGB / alpha (gỡ hòa trộn với nền đen). `alpha`: giữ alpha sẵn, chỉ kéo giãn mức trắng.
 */
export function extractAlpha(src: Raster, mode: AlphaMode = 'auto'): Raster {
  const m = mode === 'auto' ? (hasRealAlpha(src) ? 'alpha' : 'luma') : mode;
  const out = newRaster(src.w, src.h);
  const n = src.w * src.h;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = m === 'luma' ? Math.max(src.data[i * 4]!, src.data[i * 4 + 1]!, src.data[i * 4 + 2]!) : src.data[i * 4 + 3]!;
  }
  const lo = m === 'luma' ? Math.min(0.08, percentile(lum, 0.02)) : 0;
  const hi = Math.max(lo + 0.05, percentile(lum, 0.995));
  for (let i = 0; i < n; i++) {
    const a = clamp01((lum[i]! - lo) / (hi - lo));
    out.data[i * 4 + 3] = a;
    if (m === 'luma') {
      const l = Math.max(lum[i]!, 1e-4);
      for (let c = 0; c < 3; c++) out.data[i * 4 + c] = a > 0 ? clamp01(src.data[i * 4 + c]! / l) : 0;
    } else {
      for (let c = 0; c < 3; c++) out.data[i * 4 + c] = src.data[i * 4 + c]!;
    }
  }
  return out;
}

/** Cân sáng: kéo phân vị `p` của alpha (chỉ điểm đủ đục) về `target`, giữ nguyên các điểm ≈ 0. */
export function balance(r: Raster, target = 0.98, p = 0.995): Raster {
  const a: number[] = [];
  for (let i = 3; i < r.data.length; i += 4) if (r.data[i]! > 0.02) a.push(r.data[i]!);
  if (!a.length) return r;
  const hi = percentile(a, p);
  const k = hi > 0 ? target / hi : 1;
  const out: Raster = { w: r.w, h: r.h, data: new Float32Array(r.data) };
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = clamp01(out.data[i]! * k);
  return out;
}

/**
 * Khử viền: điểm gần trong suốt (alpha < `thr`) bị xóa hẳn; màu điểm nửa trong suốt (alpha < 0,6) lấy lại từ trung bình có trọng số alpha của
 * các điểm lân cận đặc hơn, để mép không còn quầng đen/trắng khi lọc song tuyến.
 */
export function defringe(r: Raster, thr = 0.04): Raster {
  const out: Raster = { w: r.w, h: r.h, data: new Float32Array(r.data) };
  const { w, h } = r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = r.data[i + 3]!;
      if (a < thr) {
        out.data[i] = out.data[i + 1] = out.data[i + 2] = out.data[i + 3] = 0;
        continue;
      }
      if (a >= 0.6) continue;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sw = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          const aj = r.data[j + 3]!;
          if (aj <= a) continue;
          sr += r.data[j]! * aj;
          sg += r.data[j + 1]! * aj;
          sb += r.data[j + 2]! * aj;
          sw += aj;
        }
      }
      if (sw > 0) {
        out.data[i] = sr / sw;
        out.data[i + 1] = sg / sw;
        out.data[i + 2] = sb / sw;
      }
    }
  }
  return out;
}

export interface Grid {
  cols: number;
  rows: number;
  /** Tỉ số năng lượng đường chia / trung bình (càng nhỏ càng chắc là lưới thật). */
  ratio: number;
}

const GRID_SIZES = [1, 2, 4, 8];

/**
 * Dò lưới flipbook trên alpha: thử mọi cặp cột×hàng ∈ {1,2,4,8}²; lưới đúng là lưới LỚN NHẤT mà các đường chia nội bộ gần như trống
 * (năng lượng alpha trên đường chia < 20% trung bình) và ít nhất nửa số ô có nội dung. Không có thì 1×1.
 */
export function detectGrid(r: Raster): Grid {
  const { w, h } = r;
  const a = (x: number, y: number) => r.data[(y * w + x) * 4 + 3]!;
  let total = 0;
  for (let i = 3; i < r.data.length; i += 4) total += r.data[i]!;
  const mean = total / (w * h);
  if (mean < 1e-4) return { cols: 1, rows: 1, ratio: 1 };
  const band = Math.max(1, Math.round(Math.min(w, h) / 256));
  let best: Grid = { cols: 1, rows: 1, ratio: 1 };
  for (const cols of GRID_SIZES) {
    for (const rows of GRID_SIZES) {
      if (cols * rows <= best.cols * best.rows) continue;
      let sum = 0;
      let cnt = 0;
      for (let k = 1; k < cols; k++) {
        const x0 = Math.round((k * w) / cols);
        for (let x = x0 - band; x < x0 + band; x++) for (let y = 0; y < h; y++, cnt++) sum += a(Math.min(w - 1, Math.max(0, x)), y);
      }
      for (let k = 1; k < rows; k++) {
        const y0 = Math.round((k * h) / rows);
        for (let y = y0 - band; y < y0 + band; y++) for (let x = 0; x < w; x++, cnt++) sum += a(x, Math.min(h - 1, Math.max(0, y)));
      }
      const ratio = cnt ? sum / cnt / mean : 1;
      if (ratio > 0.2) continue;
      let live = 0;
      const cw = w / cols;
      const ch = h / rows;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          let s = 0;
          let n = 0;
          for (let y = Math.floor(cy * ch); y < Math.floor((cy + 1) * ch); y += 2) {
            for (let x = Math.floor(cx * cw); x < Math.floor((cx + 1) * cw); x += 2, n++) s += a(Math.min(w - 1, x), Math.min(h - 1, y));
          }
          if (n && s / n > 0.02 * mean) live++;
        }
      }
      if (live >= (cols * rows) / 2) best = { cols, rows, ratio };
    }
  }
  return best;
}

export function parseGrid(s: string): { cols: number; rows: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  return cols >= 1 && rows >= 1 && cols <= 16 && rows <= 16 ? { cols, rows } : null;
}

const hash2 = (x: number, y: number): number => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Làm mờ hộp tách được (hai lượt), bán kính `rad` điểm, một kênh. */
export function boxBlur(src: Float32Array, w: number, h: number, rad: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const k = 2 * rad + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -rad; x <= rad; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / k;
      acc += src[y * w + Math.min(w - 1, x + rad + 1)]! - src[y * w + Math.max(0, x - rad)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      acc += tmp[Math.min(h - 1, y + rad + 1) * w + x]! - tmp[Math.max(0, y - rad) * w + x]!;
    }
  }
  return out;
}

export interface PackOpts {
  /** Ảnh xám cùng cỡ làm bản đồ ăn mòn (G). Thiếu thì suy từ mặt nạ: lõi tan sau cùng, mép tan trước, cộng nhiễu cố định. */
  erode?: Raster;
  /** Ảnh xám cùng cỡ làm bản đồ méo (B, 0,5 = không méo). Thiếu thì 0,5. */
  distort?: Raster;
}

const gray = (r: Raster, i: number) => (r.data[i * 4]! + r.data[i * 4 + 1]! + r.data[i * 4 + 2]!) / 3;

/**
 * Đóng kênh cho shader VFX: R = mặt nạ (alpha), G = ngưỡng ăn mòn (điểm có G < ngưỡng tan trước), B = méo (0,5 trung tính), A = 1.
 * Dữ liệu tuyến tính (không phải màu): nén KTX2 với oetf linear.
 */
export function packChannels(mask: Raster, o: PackOpts = {}): Raster {
  const { w, h } = mask;
  const out = newRaster(w, h);
  const n = w * h;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = mask.data[i * 4 + 3]!;
  let erode: Float32Array;
  if (o.erode) {
    erode = new Float32Array(n);
    for (let i = 0; i < n; i++) erode[i] = gray(o.erode, i);
  } else {
    const blur = boxBlur(m, w, h, Math.max(2, Math.round(Math.min(w, h) / 32)));
    erode = new Float32Array(n);
    for (let i = 0; i < n; i++) erode[i] = clamp01(0.65 * blur[i]! + 0.35 * hash2(i % w, Math.floor(i / w)));
  }
  for (let i = 0; i < n; i++) {
    out.data[i * 4] = m[i]!;
    out.data[i * 4 + 1] = erode[i]!;
    out.data[i * 4 + 2] = o.distort ? gray(o.distort, i) : 0.5;
    out.data[i * 4 + 3] = 1;
  }
  return out;
}

/** Cắt một khung (cột, hàng; hàng 0 ở trên cùng của ảnh). */
export function cropFrame(r: Raster, g: { cols: number; rows: number }, col: number, row: number): Raster {
  const cw = Math.floor(r.w / g.cols);
  const ch = Math.floor(r.h / g.rows);
  const out = newRaster(cw, ch);
  for (let y = 0; y < ch; y++) {
    const s = ((row * ch + y) * r.w + col * cw) * 4;
    out.data.set(r.data.subarray(s, s + cw * 4), y * cw * 4);
  }
  return out;
}

/** Thống kê nhanh để báo cáo: tỉ lệ phủ (alpha > 0,05) và alpha trung bình của điểm đặc. */
export function stats(r: Raster): { cover: number; meanAlpha: number } {
  let cover = 0;
  let sum = 0;
  for (let i = 3; i < r.data.length; i += 4) {
    if (r.data[i]! > 0.05) {
      cover++;
      sum += r.data[i]!;
    }
  }
  return { cover: cover / (r.w * r.h), meanAlpha: cover ? sum / cover : 0 };
}

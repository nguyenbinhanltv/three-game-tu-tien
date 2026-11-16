// Quyết định lùi WebGL2 khi WebGPU vẽ hỏng (thuần, có test). Engine chỉ gọi vào đây rồi hành động.

/** Khóa localStorage nhớ chọn WebGL2: CHỈ đường tự lùi mới ghi. */
export const RENDERER_KEY = 'dtl.renderer';
/** Số khung vẽ ném lỗi liên tiếp thì coi là hỏng. */
export const RENDER_FAIL_LIMIT = 30;
/** Độ lệch chuẩn độ sáng (0–255) dưới mức này coi là khung trơn một màu. */
export const BLANK_SD = 1.5;
/** Khung chỉ tính là hỏng khi cũng TỐI (độ sáng trung bình dưới mức này): mây/sương trắng đều không phải lỗi. Nền lỗi của người dùng ≈ 16. */
export const BLANK_MEAN = 45;
/** Số lần đo trơn liên tiếp mới kết luận (chống nhấp nháy: chuyển cảnh, cắt cảnh tối). */
export const BLANK_STREAK = 3;

export interface FrameStats {
  mean: number;
  sd: number;
}

/** Độ sáng trung bình và độ lệch chuẩn từ dữ liệu RGBA. */
export function frameStats(rgba: ArrayLike<number>): FrameStats {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return { mean: 0, sd: 0 };
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const l = 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    sum += l;
    sq += l * l;
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

/** Khung "hỏng": trơn một màu trong khi cảnh có lệnh vẽ. Không có draw call thì không kết luận gì. */
export function isBlankFrame(s: FrameStats, drawCalls: number): boolean {
  return drawCalls > 0 && s.sd < BLANK_SD && s.mean < BLANK_MEAN;
}

/** Đếm số lần đo trơn liên tiếp. */
export class BlankWatch {
  private streak = 0;
  /** Cảnh đang cố ý tối/trơn (cắt cảnh, chết, thẻ chương): bỏ qua và xóa chuỗi. */
  reset(): void {
    this.streak = 0;
  }
  /** true khi đủ `BLANK_STREAK` lần liên tiếp. Khung bình thường đặt lại chuỗi. */
  push(s: FrameStats, drawCalls: number): boolean {
    this.streak = isBlankFrame(s, drawCalls) ? this.streak + 1 : 0;
    return this.streak >= BLANK_STREAK;
  }
}

export interface RendererChoice {
  forceWebGL: boolean;
  /** 'clear': xóa nhớ lựa chọn. null: không đụng. */
  storage: 'clear' | null;
}

/**
 * `?renderer=webgl2` chỉ áp cho lần nạp đó (không ghi nhớ). `?renderer=webgpu|auto` ép/thử lại WebGPU và xóa lựa chọn nhớ
 * bởi đường tự lùi. Không có tham số: theo lựa chọn nhớ.
 */
export function rendererChoice(query: string | null, stored: string | null): RendererChoice {
  if (query === 'webgl2') return { forceWebGL: true, storage: null };
  if (query === 'webgpu' || query === 'auto') return { forceWebGL: false, storage: 'clear' };
  return { forceWebGL: stored === 'webgl2', storage: null };
}

/** Chỉ WebGPU mới được tự lùi (WebGL2 mà vẫn lỗi thì nạp lại cũng không hết, chỉ báo). */
export function canFallback(isWebGPU: boolean, alreadyFell: boolean): boolean {
  return isWebGPU && !alreadyFell;
}

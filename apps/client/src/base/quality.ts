/**
 * Preset chất lượng đồ họa: Thấp / Vừa / Cao / Cực cao. Hàm thuần (có test): gợi ý theo GPU, tự hạ theo hiệu năng.
 * Mặc định luôn là Vừa; gợi ý chỉ hiện ở Cài đặt, không tự đổi.
 */
export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export const isQuality = (v: unknown): v is Quality => typeof v === 'string' && (QUALITIES as readonly string[]).includes(v);

/** Mức dành cho code chỉ biết ba mức (mây, nước, mặt đất, sương): Cực cao dùng như Cao. */
export const baseOf = (q: string): 'low' | 'medium' | 'high' => (q === 'ultra' ? 'high' : q === 'low' || q === 'high' ? q : 'medium');

/**
 * Bậc tự hạ khi nghẽn: chỉ **Cực cao → Cao** (preset mới, có ngân sách riêng 12 ms). Cao/Vừa/Thấp là lựa chọn của người chơi,
 * không tự hạ (một đợt nặng ngắn ở rừng đông hay boss không được đổi lựa chọn đã lưu).
 */
export const downgradeOf = (q: string): Quality | null => (q === 'ultra' ? 'high' : null);

/** Thông tin GPU đọc từ adapter WebGPU (`describeGpu` ở game/engine/frameLoop.ts). */
export interface GpuHint {
  webgpu: boolean;
  vendor: string;
  architecture: string;
  description: string;
  maxTexture2D: number;
  maxBufferSize: number;
}

export interface MachineHint {
  deviceMemory?: number;
  cores?: number;
}

let gpuHint: GpuHint | null = null;
export const setGpuHint = (h: GpuHint | null): void => {
  gpuHint = h;
};
export const getGpuHint = (): GpuHint | null => gpuHint;

/** GPU tích hợp / di động (Intel, Apple, Qualcomm, ARM, hoặc Radeon/Vega đồ họa tích hợp). */
export function isIntegrated(g: GpuHint): boolean {
  const s = `${g.vendor} ${g.architecture} ${g.description}`.toLowerCase();
  if (/apple|intel|qualcomm|adreno|arm\b|mali|powervr|broadcom|microsoft|swiftshader|llvmpipe/.test(s)) return true;
  return /radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|\b[678]\d0m\b|integrated|\buhd\b|\biris\b/.test(s);
}

/**
 * Gợi ý preset: WebGPU + GPU rời (NVIDIA/AMD, texture ≥ 16384, buffer ≥ 2 GB) → Cao (Cực cao khi RAM ≥ 8 GB và ≥ 8 luồng);
 * GPU tích hợp / Apple, `deviceMemory` ≤ 4 GB, ≤ 4 luồng CPU, WebGL2 hoặc không rõ → Vừa.
 */
export function suggestQuality(g: GpuHint | null, m: MachineHint): Quality {
  if (!g || !g.webgpu || isIntegrated(g)) return 'medium';
  if ((m.deviceMemory !== undefined && m.deviceMemory <= 4) || (m.cores !== undefined && m.cores <= 4)) return 'medium';
  if (g.maxTexture2D < 16384 || g.maxBufferSize < 2 * 1024 ** 3) return 'medium';
  const big = (m.deviceMemory ?? 8) >= 8 && (m.cores ?? 8) >= 8;
  return big ? 'ultra' : 'high';
}

export interface AutoOptions {
  /** Cửa sổ quan sát (ms). */
  windowMs: number;
  /** CPU p95 (ms) vượt mức này thì hạ. */
  cpuP95: number;
  /** FPS trung bình dưới mức này thì hạ. */
  minFps: number;
  /** Sau mỗi lần đổi, chờ chừng này (ms) mới xét tiếp. */
  cooldownMs: number;
}

export const AUTO_DEFAULTS: AutoOptions = { windowMs: 10_000, cpuP95: 12, minFps: 40, cooldownMs: 15_000 };

/**
 * Tự hạ preset khi nghẽn: trong cửa sổ 10 s, CPU p95 của khung > 12 ms hoặc fps trung bình < 40 thì hạ một bậc
 * (chỉ Cực cao → Cao). Khung cách nhau > 1 s (tab ẩn, màn tải) làm cửa sổ bắt đầu lại để không hạ oan.
 */
export class AutoQuality {
  private t: number[] = [];
  private cpu: number[] = [];
  private since = 0;

  constructor(private o: AutoOptions = AUTO_DEFAULTS) {}

  /** Gọi mỗi khung: `now` (ms) và thời gian CPU của khung (ms). */
  frame(now: number, cpuMs: number): void {
    const n = this.t.length;
    if (n > 0 && now - this.t[n - 1]! > 1000) this.reset(now);
    this.t.push(now);
    this.cpu.push(cpuMs);
    const from = now - this.o.windowMs;
    let drop = 0;
    while (drop < this.t.length && this.t[drop]! < from) drop++;
    if (drop > 0) {
      this.t.splice(0, drop);
      this.cpu.splice(0, drop);
    }
  }

  /** Bắt đầu lại cửa sổ (đổi preset, đổi level). `since` là mốc sớm nhất được xét lại. */
  reset(since: number): void {
    this.t = [];
    this.cpu = [];
    this.since = since;
  }

  /** CPU p95 và fps trong cửa sổ hiện tại; null nếu chưa đủ mẫu (cửa sổ chưa đầy hoặc đang cooldown). */
  stats(now: number): { p95: number; fps: number } | null {
    const n = this.t.length;
    if (n < 30 || now < this.since || this.t[n - 1]! - this.t[0]! < this.o.windowMs * 0.9) return null;
    const sorted = [...this.cpu].sort((a, b) => a - b);
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0;
    const fps = (n - 1) / ((this.t[n - 1]! - this.t[0]!) / 1000);
    return { p95, fps };
  }

  /** Preset nên hạ xuống, hoặc null (đủ tốt, bị khóa, chưa đủ mẫu, Vừa/Thấp). Gọi khoảng 1 lần/giây. */
  check(now: number, current: string, locked: boolean): Quality | null {
    if (locked) return null;
    const next = downgradeOf(current);
    if (!next) return null;
    const s = this.stats(now);
    if (!s) return null;
    if (s.p95 > this.o.cpuP95 || s.fps < this.o.minFps) {
      this.reset(now + this.o.cooldownMs); // chờ hết cooldown rồi đủ thêm một cửa sổ mới
      return next;
    }
    return null;
  }
}

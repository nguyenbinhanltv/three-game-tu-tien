/**
 * Preset chất lượng đồ họa: Thấp / Vừa / Cao / Cực cao. Hàm thuần (có test): gợi ý theo GPU, tự hạ theo hiệu năng.
 * Mặc định luôn là Vừa; gợi ý chỉ hiện ở Cài đặt, không tự đổi.
 */
type Quality = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high', 'ultra'];

export const isQuality = (v: unknown): v is Quality => typeof v === 'string' && (QUALITIES as readonly string[]).includes(v);

/** Mức dành cho code chỉ biết ba mức (mây, nước, mặt đất, sương): Cực cao dùng như Cao. */
export const baseOf = (q: string): 'low' | 'medium' | 'high' => (q === 'ultra' ? 'high' : q === 'low' || q === 'high' ? q : 'medium');

/**
 * Bậc tự hạ khi khung tụt KÉO DÀI (B13): Cực cao → Cao → Vừa → Thấp (Thấp là đáy). Bật mặc định, có thông báo, người chơi
 * tắt được bằng "Khóa mức đồ họa" ở Cài đặt. Một đợt nặng ngắn (rừng đông, boss) không đủ để hạ: xem `optionsFor`.
 */
export const downgradeOf = (q: string): Quality | null =>
  q === 'ultra' ? 'high' : q === 'high' ? 'medium' : q === 'medium' ? 'low' : null;

/** Thông tin GPU đọc từ adapter WebGPU (`describeGpu` ở game/engine/frameLoop.ts). */
export interface GpuHint {
  webgpu: boolean;
  vendor: string;
  architecture: string;
  description: string;
  maxTexture2D: number;
  maxBufferSize: number;
}

interface MachineHint {
  deviceMemory?: number;
  cores?: number;
}

let gpuHint: GpuHint | null = null;
export const setGpuHint = (h: GpuHint | null): void => {
  gpuHint = h;
};
export const getGpuHint = (): GpuHint | null => gpuHint;

/** GPU tích hợp / di động (Intel, Apple, Qualcomm, ARM, hoặc Radeon/Vega đồ họa tích hợp). */
function isIntegrated(g: GpuHint): boolean {
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

interface AutoOptions {
  /** Cửa sổ quan sát (ms). */
  windowMs: number;
  /** CPU p95 (ms) vượt mức này thì hạ. */
  cpuP95: number;
  /** FPS trung bình dưới mức này thì hạ. */
  minFps: number;
  /** Sau mỗi lần đổi, chờ chừng này (ms) mới xét tiếp. */
  cooldownMs: number;
}

/** Cực cao: ngưỡng chặt (preset mới, ngân sách riêng 12 ms), cửa sổ 10 s. */
const AUTO_ULTRA: AutoOptions = { windowMs: 10_000, cpuP95: 12, minFps: 40, cooldownMs: 15_000 };
/**
 * Cao/Vừa: mục tiêu 60 fps nên hạ khi CPU p95 > 14 ms hoặc fps < 45, nhưng phải KÉO DÀI 20 s liền và cách nhau 30 s,
 * để một trận boss/rừng đông ngắn không đổi lựa chọn của người chơi.
 */
const AUTO_SUSTAINED: AutoOptions = { windowMs: 20_000, cpuP95: 14, minFps: 45, cooldownMs: 30_000 };

/** Ngưỡng tự hạ theo preset đang dùng. */
export const optionsFor = (current: string): AutoOptions => (current === 'ultra' ? AUTO_ULTRA : AUTO_SUSTAINED);
const MAX_WINDOW_MS = AUTO_SUSTAINED.windowMs;

/**
 * Tự hạ preset khi nghẽn kéo dài (xem `optionsFor`): hạ MỘT bậc rồi chờ cooldown. Khung cách nhau > 1 s (tab ẩn, màn tải)
 * làm cửa sổ bắt đầu lại để không hạ oan.
 */
export class AutoQuality {
  private t: number[] = [];
  private cpu: number[] = [];
  private since = 0;

  constructor(private o: AutoOptions | null = null) {}

  /** Gọi mỗi khung: `now` (ms) và thời gian CPU của khung (ms). */
  frame(now: number, cpuMs: number): void {
    const n = this.t.length;
    if (n > 0 && now - this.t[n - 1]! > 1000) this.reset(now);
    this.t.push(now);
    this.cpu.push(cpuMs);
    const from = now - MAX_WINDOW_MS;
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

  /** CPU p95 và fps trong `windowMs` gần nhất; null nếu chưa đủ mẫu (cửa sổ chưa đầy hoặc đang cooldown). */
  stats(now: number, windowMs: number = AUTO_ULTRA.windowMs): { p95: number; fps: number } | null {
    const from = now - windowMs;
    let i = 0;
    while (i < this.t.length && this.t[i]! < from) i++;
    const t = this.t.slice(i);
    const cpu = this.cpu.slice(i);
    const n = t.length;
    if (n < 30 || now < this.since || t[n - 1]! - t[0]! < windowMs * 0.9) return null;
    const sorted = [...cpu].sort((a, b) => a - b);
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0;
    const fps = (n - 1) / ((t[n - 1]! - t[0]!) / 1000);
    return { p95, fps };
  }

  /** Preset nên hạ xuống, hoặc null (đủ tốt, bị khóa, chưa đủ mẫu, đã Thấp). Gọi khoảng 1 lần/giây. */
  check(now: number, current: string, locked: boolean): Quality | null {
    if (locked) return null;
    const next = downgradeOf(current);
    if (!next) return null;
    const o = this.o ?? optionsFor(current);
    const s = this.stats(now, o.windowMs);
    if (!s) return null;
    if (s.p95 > o.cpuP95 || s.fps < o.minFps) {
      this.reset(now + o.cooldownMs); // chờ hết cooldown rồi đủ thêm một cửa sổ mới
      return next;
    }
    return null;
  }
}

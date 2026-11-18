/**
 * Chính sách texture tải dần (hàm thuần, có test). Vừa/Thấp giữ texture trong GLB; Cao/Cực cao tải bậc texture cao
 * từ tệp rời sau khi vào game. Giới hạn: byte/giây, bộ nhớ GPU thêm theo `deviceMemory`, dừng khi mạng chậm hoặc khung giật.
 */

export interface NavInfo {
  deviceMemory?: number;
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
}

export interface HiresPolicy {
  /** 0 = tắt, 1 = Cao, 2 = Cực cao. */
  tier: 0 | 1 | 2;
  /** Trần cạnh texture được thay. */
  maxSide: number;
  /** Trần byte tải mỗi giây. */
  bytesPerSec: number;
  /** Trần tổng bộ nhớ GPU thêm (byte). */
  memCap: number;
}

const MB = 1048576;

export function tierOf(quality: string): 0 | 1 | 2 {
  return quality === 'ultra' ? 2 : quality === 'high' ? 1 : 0;
}

/** Mạng đủ khỏe để tải nền (Save-Data, 2G/3G hoặc băng thông ước lượng < 0,7 Mbps (ước lượng của trình duyệt rất nhiễu) thì không). */
export function networkAllows(nav: NavInfo): boolean {
  if (nav.saveData) return false;
  if (nav.effectiveType && /^(slow-2g|2g|3g)$/.test(nav.effectiveType)) return false;
  if (nav.downlink !== undefined && nav.downlink > 0 && nav.downlink < 0.7) return false;
  return true;
}

export function hiresPolicy(quality: string, nav: NavInfo): HiresPolicy {
  const tier = tierOf(quality);
  const mem = nav.deviceMemory ?? 8;
  // Máy ≤ 4 GB RAM: không tải bậc cao (tab dễ bị hệ điều hành đóng).
  if (tier === 0 || mem <= 4 || !networkAllows(nav)) return { tier: 0, maxSide: 0, bytesPerSec: 0, memCap: 0 };
  const memCap = (mem <= 6 ? 96 : tier === 2 ? 180 : 128) * MB;
  return { tier, maxSide: tier === 2 ? 4096 : 2048, bytesPerSec: (tier === 2 ? 1.5 : 1) * MB, memCap };
}

export interface HiresCandidate {
  /** Khóa duy nhất: `<asset>#<tệp>`. */
  key: string;
  assetId: string;
  /** Khoảng cách từ người xem tới bản gần nhất của asset (m). */
  dist: number;
  file: string;
  width: number;
  bytes: number;
  gpuBytes: number;
}

/** Chọn texture kế tiếp: gần camera trước, trong trần cạnh và trần bộ nhớ. Hàm thuần. */
export function pickNext(cands: HiresCandidate[], policy: HiresPolicy, usedMem: number, skip: ReadonlySet<string>): HiresCandidate | null {
  let best: HiresCandidate | null = null;
  for (const c of cands) {
    if (skip.has(c.key) || c.width > policy.maxSide || usedMem + c.gpuBytes > policy.memCap) continue;
    if (!best || c.dist < best.dist) best = c;
  }
  return best;
}

/** Xô byte: nạp `bytesPerSec` mỗi giây, trần 2 giây; tải xong trừ byte (được âm một lần để file lớn không bị kẹt). */
export class ByteBucket {
  private tokens = 0;
  constructor(private perSec: number) {}
  setRate(perSec: number): void {
    this.perSec = perSec;
  }
  refill(dtSec: number): void {
    this.tokens = Math.min(this.perSec * 2, this.tokens + this.perSec * dtSec);
  }
  canStart(): boolean {
    return this.tokens > 0;
  }
  spend(bytes: number): void {
    this.tokens -= bytes;
  }
}

/** Theo dõi khung hình: chỉ nạp khi CPU rảnh (trung bình 30 khung gần nhất dưới ngưỡng). */
export class FrameIdle {
  private ring: number[] = [];
  constructor(private maxMs = 18) {}
  push(ms: number): void {
    this.ring.push(ms);
    if (this.ring.length > 30) this.ring.shift();
  }
  idle(): boolean {
    if (this.ring.length < 10) return false;
    return this.ring.reduce((a, b) => a + b, 0) / this.ring.length <= this.maxMs;
  }
}

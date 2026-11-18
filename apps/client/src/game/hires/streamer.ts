import {
  type AppliedInfo,
  ByteBucket,
  type HiresCandidate,
  type HiresPolicy,
  type NavInfo,
  hiresPolicy,
  pickNext,
  planEviction,
} from './policy';

/** Phần của AssetCache mà bộ lập lịch cần (thay được khi test). */
export interface HiresHost {
  hiresCandidates(): HiresCandidate[];
  hiresMemory(): number;
  /** `ok` đã thay; `stale` bị hủy giữa chừng (thử lại sau); `none` không thay được (bỏ hẳn). */
  applyHires(c: HiresCandidate, maxSide: number): Promise<'ok' | 'stale' | 'none'>;
  hiresApplied(): AppliedInfo[];
  revertHiresFile(key: string): void;
  revertHires(): void;
}

export interface StreamerDeps {
  quality: () => string;
  nav: () => NavInfo;
  /** true khi vào game và CPU rảnh. */
  ready: () => boolean;
  now?: () => number;
}

/** Dưới ngưỡng này (byte/s) thì coi mạng chậm và tạm dừng. */
export const SLOW_BPS = 200 * 1024;
export const SLOW_PAUSE_MS = 30000;

/**
 * Tải từng tệp bậc cao một, theo thứ tự gần camera, qua xô byte/giây, trong trần bộ nhớ.
 * Hạ preset (hoặc mạng/RAM không đạt) thì trả texture về bản trong GLB.
 */
export class HiresStreamer {
  private bucket = new ByteBucket(0);
  private inflight = false;
  private skip = new Set<string>();
  private pausedUntil = 0;
  private lastTick = 0;
  private appliedTier = 0;
  policy: HiresPolicy = hiresPolicy('medium', {});
  loaded = 0;
  private frozen = false;

  constructor(
    private host: HiresHost,
    private deps: StreamerDeps,
  ) {}

  private now(): number {
    return (this.deps.now ?? (() => performance.now()))();
  }

  /** Công cụ chụp ảnh so sánh: trả mọi texture về bản GLB và ngừng tải tiếp (cùng khung, trước/sau). */
  freeze(): void {
    this.frozen = true;
    this.host.revertHires();
    this.skip.clear();
    this.loaded = 0;
  }

  /** Gọi định kỳ (khoảng 0,5 s). Trả promise của việc tải đang chạy (cho test). */
  tick(): Promise<void> {
    if (this.frozen) return Promise.resolve();
    const t = this.now();
    const dt = this.lastTick ? Math.min(2, (t - this.lastTick) / 1000) : 0;
    this.lastTick = t;
    this.policy = hiresPolicy(this.deps.quality(), this.deps.nav());
    if (this.policy.tier < this.appliedTier || this.policy.tier === 0) {
      if (this.appliedTier > 0 || this.host.hiresMemory() > 0) this.host.revertHires();
      this.skip.clear();
      this.appliedTier = this.policy.tier;
      this.loaded = 0;
    }
    if (this.policy.tier === 0) return Promise.resolve();
    this.bucket.setRate(this.policy.bytesPerSec);
    this.bucket.refill(dt);
    if (this.inflight || t < this.pausedUntil || !this.deps.ready() || !this.bucket.canStart()) return Promise.resolve();
    const cands = this.host.hiresCandidates();
    const mem = this.host.hiresMemory();
    let next = pickNext(cands, this.policy, mem, this.skip);
    if (!next) {
      // Chạm trần bộ nhớ: nếu có ứng viên gần hơn các tệp đã áp dụng thì trả bớt tệp ở xa để nhường chỗ.
      const near = pickNext(cands, { ...this.policy, memCap: Infinity }, 0, this.skip);
      const plan = near ? planEviction(near, this.host.hiresApplied(), mem, this.policy.memCap) : null;
      if (near && plan) {
        for (const k of plan) this.host.revertHiresFile(k);
        next = near;
      }
    }
    if (!next) return Promise.resolve();
    this.inflight = true;
    this.bucket.spend(next.bytes);
    const t0 = this.now();
    return this.host
      .applyHires(next, this.policy.tier === 2 ? 4096 : 2048)
      .then((res) => {
        if (res === 'ok') {
          this.loaded++;
          this.appliedTier = this.policy.tier;
        } else if (res === 'none') {
          this.skip.add(next.key); // không áp dụng được (vật liệu không khớp): đừng thử lại mãi. 'stale' (bị hủy do revert) thì để thử lại.
        }
        const sec = Math.max(0.001, (this.now() - t0) / 1000);
        if (next.bytes > 100 * 1024 && next.bytes / sec < SLOW_BPS) this.pausedUntil = this.now() + SLOW_PAUSE_MS;
      })
      .catch((e) => {
        console.warn('[hires] tải texture lỗi:', next.file, e);
        this.skip.add(next.key);
        this.pausedUntil = this.now() + SLOW_PAUSE_MS;
      })
      .finally(() => {
        this.inflight = false;
      });
  }
}

// Xưởng animation của phòng thử (Diễn Võ Trường, V2d): nhật ký CHUYỂN CLIP (crossfade). Mỗi khung nhận trọng số các clip đang phát của một
// model; ghi lại mỗi lần clip trội đổi: mất bao lâu, trọng số có nhảy bậc không (đổi cứng), khớp xoay nhanh nhất bao nhiêu trong lúc chuyển (giật).
// Lớp thuần, không đụng three.

export interface BlendWeight {
  name: string;
  /** Trọng số hiệu dụng của action (chưa chuẩn hóa). */
  w: number;
}

export interface BlendRow {
  from: string;
  to: string;
  /** Thời điểm bắt đầu chuyển (ms, cùng đồng hồ với `now` truyền vào). */
  at: number;
  /** Thời gian từ lúc clip mới xuất hiện tới lúc nó trội hẳn (ms); 0 = đổi cứng trong một khung. */
  ms: number;
  /** Bước nhảy trọng số (đã chuẩn hóa, 0..1) lớn nhất của clip mới trong MỘT khung. */
  pop: number;
  /** Tốc độ xoay khớp lớn nhất trong lúc chuyển (°/s), do nơi gọi đo trên vài xương chính; 0 nếu không đo. */
  spin: number;
}

/** Clip mới đạt ngần này trọng số (đã chuẩn hóa) thì coi là chuyển xong. */
export const BLEND_DONE = 0.9;
/** Dưới ngần này coi như clip không phát. */
export const BLEND_EPS = 0.02;
/** Trọng số nhảy quá ngần này trong một khung = đổi cứng (không crossfade). */
export const BLEND_POP_WARN = 0.5;
/** Khớp xoay nhanh hơn ngần này (°/s) trong lúc chuyển thì mắt thấy giật ở camera chéo. */
export const BLEND_SPIN_WARN = 900;

const MAX_ROWS = 60;

export class BlendLog {
  readonly rows: BlendRow[] = [];
  /** Clip trội đã ổn định. */
  private cur = '';
  private open: { from: string; to: string; at: number; pop: number; spin: number } | null = null;
  private last = new Map<string, number>();

  reset(): void {
    this.rows.length = 0;
    this.cur = '';
    this.open = null;
    this.last.clear();
  }

  get current(): string {
    return this.cur;
  }

  /** Một khung: `now` ms, trọng số các clip đang phát, `spin` = tốc độ xoay khớp lớn nhất khung này (°/s). */
  push(now: number, weights: readonly BlendWeight[], spin = 0): void {
    const by = new Map<string, number>();
    let sum = 0;
    for (const x of weights) {
      if (x.w <= 0) continue;
      by.set(x.name, (by.get(x.name) ?? 0) + x.w);
      sum += x.w;
    }
    if (sum <= 1e-6) return;
    let top = '';
    let topW = 0;
    for (const [name, w] of by) {
      const n = w / sum;
      by.set(name, n);
      if (n > topW) {
        topW = n;
        top = name;
      }
    }
    if (!this.cur) {
      // Khung đầu: nhận clip trội làm mốc, chưa có gì để so.
      this.cur = top;
      this.last = by;
      return;
    }
    if (this.open && this.open.to !== top && (by.get(this.open.to) ?? 0) < BLEND_EPS) {
      // Clip đang chuyển tới bị bỏ giữa chừng (vd. đổi ý): chuyển tiếp tính từ clip gốc sang clip trội mới.
      this.open = null;
    }
    if (!this.open) {
      // Clip mới: không phải clip trội cũ, đang phát và đang tăng (ưu tiên clip nặng nhất).
      let cand = '';
      let candW = 0;
      for (const [name, n] of by) {
        if (name === this.cur || n < BLEND_EPS || n <= (this.last.get(name) ?? 0)) continue;
        if (n > candW) {
          candW = n;
          cand = name;
        }
      }
      if (cand) this.open = { from: this.cur, to: cand, at: now, pop: 0, spin: 0 };
    }
    const o = this.open;
    if (o) {
      const w = by.get(o.to) ?? 0;
      o.pop = Math.max(o.pop, w - (this.last.get(o.to) ?? 0));
      o.spin = Math.max(o.spin, spin);
      if (w >= BLEND_DONE) {
        this.rows.push({ from: o.from, to: o.to, at: o.at, ms: Math.round(now - o.at), pop: Math.round(o.pop * 100) / 100, spin: Math.round(o.spin) });
        if (this.rows.length > MAX_ROWS) this.rows.shift();
        this.cur = o.to;
        this.open = null;
      }
    } else if (top !== this.cur && topW >= BLEND_DONE) {
      // Clip trội đổi mà không qua giai đoạn tăng dần quan sát được (clip cũ tắt, clip nền sẵn có lên thay): ghi là chuyển tức thời.
      this.rows.push({ from: this.cur, to: top, at: now, ms: 0, pop: Math.round((topW - (this.last.get(top) ?? 0)) * 100) / 100, spin: Math.round(spin) });
      if (this.rows.length > MAX_ROWS) this.rows.shift();
      this.cur = top;
    }
    this.last = by;
  }
}

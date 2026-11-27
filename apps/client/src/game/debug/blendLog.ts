// Xưởng animation của phòng thử (Diễn Võ Trường, V2d): nhật ký CHUYỂN CLIP (crossfade). Mỗi khung nhận trọng số các clip đang phát của một
// model; ghi lại mỗi lần clip TRỘI đổi: clip mới mất bao lâu để lên, trọng số có nhảy bậc không (đổi cứng), khớp xoay nhanh nhất bao nhiêu
// trong lúc nó lên (giật). Các clip đi/chạy trộn theo tốc độ đổi trọng số qua lại liên tục: chỉ khi clip trội cũ tắt hẳn hoặc clip mới
// chiếm gần hết mới tính là một lần chuyển. Lớp thuần, không đụng three.

export interface BlendWeight {
  name: string;
  /** Trọng số hiệu dụng của action (chưa chuẩn hóa). */
  w: number;
}

export interface BlendRow {
  from: string;
  to: string;
  /** Thời điểm clip mới bắt đầu lên (ms, cùng đồng hồ với `now` truyền vào). */
  at: number;
  /** Thời gian từ lúc clip mới bắt đầu lên tới lúc chuyển xong (ms); 0 = đổi cứng trong một khung. */
  ms: number;
  /** Bước nhảy trọng số (đã chuẩn hóa, 0..1) lớn nhất của clip mới trong MỘT khung. */
  pop: number;
  /** Tốc độ xoay khớp lớn nhất trong lúc clip mới lên (°/s), do nơi gọi đo trên vài xương chính; 0 nếu không đo. */
  spin: number;
  /** Xương xoay nhanh nhất lúc đó (rỗng nếu nơi gọi không báo). */
  bone: string;
}

/** Clip mới đạt ngần này trọng số (đã chuẩn hóa), hoặc clip trội cũ tụt dưới `BLEND_GONE`, thì coi là chuyển xong. */
export const BLEND_DONE = 0.9;
export const BLEND_GONE = 0.1;
/** Dưới ngần này coi như clip không phát. */
export const BLEND_EPS = 0.02;
/** Trọng số đứng yên quá ngần này (ms) thì đợt lên coi như đã dừng (model ở xa cập nhật mixer thưa nên vài khung liền trọng số không đổi). */
export const BLEND_FLAT_MS = 150;
/** Trọng số nhảy quá ngần này trong một khung = đổi cứng (không crossfade). */
export const BLEND_POP_WARN = 0.5;
/** Khớp xoay nhanh hơn ngần này (°/s) trong lúc chuyển thì mắt thấy giật ở camera chéo. */
export const BLEND_SPIN_WARN = 900;

const MAX_ROWS = 60;

/** Một clip đang phát và đợt lên gần nhất của nó. */
interface Track {
  w: number;
  /** Đợt lên gần nhất bắt đầu lúc nào; bước nhảy và tốc độ xoay khớp lớn nhất trong đợt đó. */
  riseAt: number;
  pop: number;
  spin: number;
  bone: string;
  rising: boolean;
  /** Lần cuối trọng số còn tăng. */
  upAt: number;
}

export class BlendLog {
  readonly rows: BlendRow[] = [];
  /** Clip trội đã ổn định. */
  private cur = '';
  private tracks = new Map<string, Track>();

  reset(): void {
    this.rows.length = 0;
    this.cur = '';
    this.tracks.clear();
  }

  get current(): string {
    return this.cur;
  }

  /** Một khung: `now` ms, trọng số các clip đang phát, `spin` = tốc độ xoay khớp lớn nhất khung này (°/s) và tên xương đó. */
  push(now: number, weights: readonly BlendWeight[], spin = 0, bone = ''): void {
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
    for (const name of [...this.tracks.keys()]) if ((by.get(name) ?? 0) < BLEND_EPS) this.tracks.delete(name);
    for (const [name, n] of by) {
      if (n < BLEND_EPS) continue;
      let tr = this.tracks.get(name);
      if (!tr) this.tracks.set(name, (tr = { w: 0, riseAt: now, pop: 0, spin: 0, bone: '', rising: false, upAt: now }));
      const d = n - tr.w;
      if (d > 1e-4) {
        if (!tr.rising) {
          tr.rising = true;
          tr.riseAt = now;
          tr.pop = 0;
          tr.spin = 0;
          tr.bone = '';
        }
        tr.pop = Math.max(tr.pop, d);
        tr.upAt = now;
      } else if (d < -1e-4 || now - tr.upAt > BLEND_FLAT_MS) tr.rising = false;
      if (tr.rising && spin > tr.spin) {
        tr.spin = spin;
        tr.bone = bone;
      }
      tr.w = n;
    }
    if (!this.cur) {
      // Khung đầu: nhận clip trội làm mốc, chưa có gì để so.
      this.cur = top;
      return;
    }
    if (top === this.cur) return;
    if (topW < BLEND_DONE && (by.get(this.cur) ?? 0) > BLEND_GONE) return;
    const tr = this.tracks.get(top);
    this.rows.push({
      from: this.cur,
      to: top,
      at: tr?.riseAt ?? now,
      ms: Math.round(now - (tr?.riseAt ?? now)),
      pop: Math.round((tr?.pop ?? 0) * 100) / 100,
      spin: Math.round(tr?.spin ?? 0),
      bone: tr?.bone ?? '',
    });
    if (this.rows.length > MAX_ROWS) this.rows.shift();
    this.cur = top;
  }
}

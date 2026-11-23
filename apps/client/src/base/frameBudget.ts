// Chân Cảnh O6: đồng hồ ngân sách CPU theo hệ trong một khung (không import game/ hay render/: hàm thuần, đo bằng đồng hồ truyền vào).
// `runFrame` gọi `mark(<hệ>)` ở các mốc; thời gian từ mốc trước tới mốc này tính cho hệ đó. Bảng F3 đọc `snapshot()` (trung bình/đỉnh từ lần đọc trước)
// và tô màu theo `BUDGET_MS`. Tổng ngân sách CPU desktop 8 ms (CLAUDE.md); hạn mức từng hệ cộng lại có dư để các hệ không cùng nặng một lúc.

export const SECTIONS = ['move', 'world', 'anim', 'fx', 'logic', 'render', 'ui'] as const;
export type Section = (typeof SECTIONS)[number];

/** Hạn mức trung bình mỗi khung (ms). `anim` gồm xương, vải/lò xo (Thiên Y), nội suy thực thể; `fx` gồm VFX, hạt, hậu kỳ; `ui` gồm số sát thương, nhãn, đồng bộ HUD. */
export const BUDGET_MS: Readonly<Record<Section, number>> = {
  move: 0.3,
  world: 1,
  anim: 2,
  fx: 1,
  logic: 0.5,
  render: 5,
  ui: 1,
};
export const TOTAL_BUDGET_MS = 8;

export interface SectionStat {
  section: Section;
  avg: number;
  max: number;
  limit: number;
}

export class FrameBudget {
  private t = 0;
  private readonly acc: Record<Section, number> = { move: 0, world: 0, anim: 0, fx: 0, logic: 0, render: 0, ui: 0 };
  private readonly peak: Record<Section, number> = { move: 0, world: 0, anim: 0, fx: 0, logic: 0, render: 0, ui: 0 };
  private cur: Record<Section, number> = { move: 0, world: 0, anim: 0, fx: 0, logic: 0, render: 0, ui: 0 };
  private frames = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Đầu khung. */
  begin(): void {
    this.t = this.now();
    for (const s of SECTIONS) this.cur[s] = 0;
  }

  /** Thời gian từ mốc trước tới giờ tính cho `section` (gọi nhiều lần cho cùng hệ thì cộng dồn). */
  mark(section: Section): void {
    const n = this.now();
    this.cur[section] += n - this.t;
    this.t = n;
  }

  /** Cuối khung: cộng vào trung bình/đỉnh. */
  end(): void {
    this.frames++;
    for (const s of SECTIONS) {
      this.acc[s] += this.cur[s];
      if (this.cur[s] > this.peak[s]) this.peak[s] = this.cur[s];
    }
  }

  /** Trung bình và đỉnh từ lần `snapshot` trước, rồi đặt lại. */
  snapshot(): SectionStat[] {
    const n = Math.max(1, this.frames);
    const out = SECTIONS.map((section) => ({ section, avg: this.acc[section] / n, max: this.peak[section], limit: BUDGET_MS[section] }));
    for (const s of SECTIONS) {
      this.acc[s] = 0;
      this.peak[s] = 0;
    }
    this.frames = 0;
    return out;
  }
}

/** Hệ vượt hạn mức trung bình (hoặc tổng vượt `TOTAL_BUDGET_MS`), xếp nặng nhất trước. */
export function overBudget(stats: SectionStat[]): SectionStat[] {
  return stats.filter((s) => s.avg > s.limit).sort((a, b) => b.avg / b.limit - a.avg / a.limit);
}

export const totalMs = (stats: SectionStat[]): number => stats.reduce((n, s) => n + s.avg, 0);

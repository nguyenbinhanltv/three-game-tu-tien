// Đợt ba gương của Kính Nguyệt Cung (E3-M, `WaveDef.puzzle`): ba cột gương ba màu, chạm theo thứ tự màu server bốc.
// Server giữ đáp án và phán định chạm (người chơi chỉ di chuyển); client chỉ vẽ cột (`mirror_pillar`) và đọc thứ tự trong tin hệ thống.
// Sai hoặc hết giờ: quái xuất hiện thêm rồi đố lại với thứ tự mới; quá `MAX_FAILS` lần thì bỏ đố (không được thưởng giảm sát thương).

import type { WaveDef } from '@dtl/shared';

export const TOUCH_R = 3.2;
export const MAX_FAILS = 3;

type Puzzle = NonNullable<WaveDef['puzzle']>;

export interface PuzzleHost {
  now(): number;
  players(): { sid: string; x: number; z: number; dead: boolean }[];
  /** Quái phạt xuất hiện (n con quanh tâm). */
  spawnWrong(w: Puzzle['wrong']): void;
  fx(m: { t: string; n?: number; x?: number; z?: number; d?: number; pg?: number }): void;
  say(k: string, params?: Record<string, string | number>, type?: string): void;
  colorName(i: number): string;
  /** Đúng: sát thương boss giảm `cut`. */
  solved(cut: number): void;
}

export function shuffle3(r: () => number): number[] {
  return shuffleN(3, r);
}

/** Xáo thứ tự n điểm (đố gương 3 cột, đố đèn Kim Dạ Cung 4 cột). */
export function shuffleN(n: number, r: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class MirrorPuzzle {
  private order: number[] = [];
  private idx = 0;
  private until = 0;
  private fails = 0;
  private on = new Map<string, number>();
  done = false;
  /** Tiền tố khóa tin hệ thống (`mirror` cho Kính Nguyệt Cung, `kd_lamp` cho hành lang đèn Kim Dạ Cung). */
  private get msg(): string {
    return this.def.msg ?? 'mirror';
  }

  constructor(
    private readonly def: Puzzle,
    private readonly h: PuzzleHost,
    private readonly rnd: () => number = Math.random,
  ) {}

  start(): void {
    this.round();
  }

  private round(): void {
    this.order = shuffleN(this.def.points.length, this.rnd);
    this.idx = 0;
    this.until = this.h.now() + this.def.secs * 1000;
    // Ai đang đứng trên một cột lúc bắt đầu vòng mới chỉ được tính chạm khi rời ra rồi chạm lại (tránh một bước sai đốt hết lượt).
    this.on.clear();
    for (const p of this.h.players()) {
      const at = this.pointAt(p);
      if (at >= 0) this.on.set(p.sid, at);
    }
    this.def.points.forEach((p, i) => this.h.fx({ t: 'mirror_pillar', n: i, x: p.x, z: p.z, d: this.def.secs, pg: 0 }));
    this.h.say(`sys.${this.msg}_puzzle`, { order: this.order.map((i) => this.h.colorName(i)).join(' → '), s: this.def.secs }, 'info');
  }

  private pointAt(p: { x: number; z: number }): number {
    let at = -1;
    this.def.points.forEach((pt, i) => {
      if (Math.hypot(p.x - pt.x, p.z - pt.z) <= TOUCH_R) at = i;
    });
    return at;
  }

  /** Còn đang đố (director chờ). */
  get active(): boolean {
    return !this.done;
  }

  tick(): void {
    if (this.done) return;
    const now = this.h.now();
    if (now >= this.until) return this.fail(`sys.${this.msg}_puzzle_time`);
    for (const p of this.h.players()) {
      if (p.dead) continue;
      const at = this.pointAt(p);
      const was = this.on.get(p.sid) ?? -1;
      if (at === was) continue;
      if (at < 0) {
        this.on.delete(p.sid);
        continue;
      }
      this.on.set(p.sid, at);
      if (at !== this.order[this.idx]) return this.fail(`sys.${this.msg}_puzzle_bad`);
      const pt = this.def.points[at];
      this.h.fx({ t: 'mirror_pillar', n: at, x: pt.x, z: pt.z, d: Math.max(1, (this.until - now) / 1000), pg: 1 });
      if (++this.idx >= this.order.length) return this.win();
    }
  }

  private win(): void {
    this.done = true;
    this.def.points.forEach((p, i) => this.h.fx({ t: 'mirror_pillar', n: i, x: p.x, z: p.z, d: 0, pg: 1 }));
    this.h.solved(this.def.bossCut);
    this.h.say(`sys.${this.msg}_puzzle_ok`, { n: Math.round(this.def.bossCut * 100) }, 'good');
  }

  private fail(msg: string): void {
    this.h.say(msg, undefined, 'bad');
    this.h.spawnWrong(this.def.wrong);
    if (++this.fails >= MAX_FAILS) {
      this.done = true;
      this.def.points.forEach((p, i) => this.h.fx({ t: 'mirror_pillar', n: i, x: p.x, z: p.z, d: 0, pg: 0 }));
      return;
    }
    this.round();
  }
}

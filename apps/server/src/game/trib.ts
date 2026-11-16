// Độ kiếp theo dữ liệu (E1-F). Lõi nhịp thiên kiếp: đọc pha từ `tribulations.json` (qua `tribDef`) và phát tia sét, lôi võng,
// tia khóa mệnh, ô lửa, bóng tâm ma. Cơ chế riêng của từng kiếp (Đan Trận, xuất khiếu, ngũ hành, phân thân…) cắm vào qua `tribmech.ts`.
// Độ kiếp Trúc Cơ (S2-C) giữ hành vi y hệt bản cũ trong sim.ts: thứ tự gọi Math.random và thứ tự phát vùng không đổi
// (test băm `trib.golden.test.ts`).

import { PF_DEAD, shadowStats, tribDef, tribGapAt, tribPhaseIndex, type HazardGeom, type HazardKind, type TribDef, type TribId, type TribPhaseDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './sim';
import { runMechanic, type TribMechCtx } from './tribmech';

/** Trạng thái một lần độ kiếp của một người (chỉ server giữ; client chỉ nhận cờ PF_TRIBULATION và vùng đã báo). */
export interface TribState {
  /** Kiếp nào; thiếu = Trúc Cơ (test cũ dựng trạng thái không có trường này). */
  id?: TribId;
  endAt: number;
  nextAt: number;
  /** Số đợt đã phát. */
  n: number;
  /** Tia khóa mệnh của pha cuối đã thả. */
  fin: boolean;
  /** Số đan hồi phục đã dùng. */
  pills: number;
  /** Pha hiện tại (đổi pha thì chạy `enter`/`exit` của cơ chế). */
  pi?: number;
  /** Mốc thả bóng tâm ma kế tiếp. */
  shadowAt?: number;
  /** Mốc ô lửa kế tiếp và tâm lưới (đặt lúc vào pha lửa đầu tiên). */
  hoaAt?: number;
  anchor?: { x: number; z: number };
  /** Chỗ cho cơ chế riêng giữ trạng thái (khóa = id cơ chế). Chỉ server giữ. */
  mech?: Record<string, unknown>;
}

export interface GuardCfg {
  share: number;
  max: number;
  r: number;
}

export interface TribHost {
  now(): number;
  addHazard(g: HazardGeom, delay: number, dmg: number, pct: boolean, kind: HazardKind, src: string, atk?: number, lock?: boolean, grp?: number, guard?: GuardCfg, cut?: { mul: number; max: number }): void;
  nextGrp(): number;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o?: { dyaw?: number; level?: number }): MonEnt | null;
  /** Bóng tâm ma còn sống của `p`. */
  aliveShadows(p: PlayerEnt): number;
  /** Kết thúc kiếp (thành công khi hết giờ). */
  end(p: PlayerEnt, success: boolean): void;
}

export class TribSystem {
  constructor(private h: TribHost) {}

  /** Một nhịp 50 ms cho người đang độ kiếp. */
  tick(p: PlayerEnt): void {
    const tr = p.trib!;
    const def = tribDef(tr.id);
    const now = this.h.now();
    if (now >= tr.endAt) return this.h.end(p, true);
    const elapsed = def.duration - (tr.endAt - now) / 1000;
    const pi = tribPhaseIndex(def, elapsed);
    const ph = def.phases[pi];
    const ctx: TribMechCtx = { host: this.h, p, tr, def, phase: ph, phaseIdx: pi, elapsed, now };
    if (tr.pi !== pi) this.changePhase(ctx, def, tr.pi ?? -1);
    // Pha có tia khóa mệnh mở bằng tia cuối; trong lúc nó tích tụ trời lặng đi, rồi mưa sét dồn dập.
    if (ph.final && !tr.fin) {
      const f = ph.final;
      tr.fin = true;
      tr.nextAt = Math.max(tr.nextAt, now + f.delay * 1000);
      const guard = f.guardShare ? { share: f.guardShare, max: f.guardMax ?? 2, r: f.guardR ?? 12 } : undefined;
      this.h.addHazard({ x: p.move.x, z: p.move.z, r: f.r }, f.delay, f.pct, true, 'lightning', p.sid, 0, true, 0, guard, { mul: f.defMul, max: f.defMaxCut });
      this.h.sys(p, 'sys.trib_final', undefined, 'bad');
    }
    runMechanic(ph.mechanic, 'tick', ctx);
    this.tickShadows(p, tr, ph, now, pi);
    if (now < tr.nextAt) return;
    tr.n++;
    tr.nextAt = now + tribGapAt(def, pi, elapsed) * 1000;
    if (ph.grid) this.fireGrid(p, tr, ph, now);
    // Một tia nhắm thẳng vào người độ kiếp, vài tia rơi quanh.
    if (ph.aimPct) this.h.addHazard({ x: p.move.x, z: p.move.z, r: def.aim.r }, def.aim.delay, ph.aimPct, true, 'lightning', p.sid);
    const extra = ph.extra ?? 0;
    for (let i = 0; i < extra; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = def.extraDist.min + Math.random() * (def.extraDist.max - def.extraDist.min);
      this.h.addHazard(
        { x: p.move.x + Math.cos(a) * r, z: p.move.z + Math.sin(a) * r, r: ph.extraR as number },
        def.extraDelay.min + Math.random() * (def.extraDelay.max - def.extraDelay.min),
        ph.extraPct as number,
        true,
        'lightning',
        p.sid,
      );
    }
    if (ph.net && tr.n % ph.net.every === 0) this.net(p, ph);
  }

  private changePhase(ctx: TribMechCtx, def: TribDef, from: number): void {
    const tr = ctx.tr;
    if (from >= 0) runMechanic(def.phases[from].mechanic, 'exit', { ...ctx, phase: def.phases[from], phaseIdx: from });
    tr.pi = ctx.phaseIdx;
    tr.shadowAt = ctx.now;
    tr.hoaAt = ctx.now;
    runMechanic(ctx.phase.mechanic, 'enter', ctx);
  }

  /** Lôi võng: vạch sét song song (chuỗi vòng sét) cắt qua chỗ người độ kiếp đứng (vạch giữa đè lên họ), hướng ngẫu nhiên. */
  private net(p: PlayerEnt, ph: TribPhaseDef): void {
    const net = ph.net!;
    const yaw = Math.random() * Math.PI;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const halfLines = (net.lines - 1) / 2;
    const halfCount = (net.count - 1) / 2;
    for (let i = 0; i < net.lines; i++) {
      const off = (i - halfLines) * net.gap;
      const grp = this.h.nextGrp();
      for (let j = 0; j < net.count; j++) {
        const along = (j - halfCount) * net.step;
        this.h.addHazard({ x: p.move.x + fz * off + fx * along, z: p.move.z - fx * off + fz * along, r: net.r }, net.delay, net.pct, true, 'lightning', p.sid, 0, false, grp);
      }
    }
  }

  /**
   * Pha lửa: lưới `cols × rows` ô vuông cạnh `cell` quanh tâm (chỗ người độ kiếp đứng lúc vào pha), mỗi đợt chọn `pick` ô (ngẫu nhiên phía server),
   * báo `warn` giây rồi cháy; ô cháy gây thêm một đòn sau `burn` giây. Người đứng trong ô nào chịu đòn ô đó (thân đứng yên chịu lửa).
   */
  private fireGrid(p: PlayerEnt, tr: TribState, ph: TribPhaseDef, now: number): void {
    const g = ph.grid!;
    if (!tr.anchor) tr.anchor = { x: p.move.x, z: p.move.z };
    const cells = g.cols * g.rows;
    const chosen = new Set<number>();
    // Một ô luôn là ô người độ kiếp đang đứng ("lửa nặng nhất ở ô người độ kiếp đứng"), phần còn lại ngẫu nhiên.
    const here = this.cellAt(tr.anchor, g, p.move.x, p.move.z);
    if (here >= 0) chosen.add(here);
    let guard = 0;
    while (chosen.size < Math.min(cells, g.pick) && guard++ < 64) chosen.add(Math.floor(Math.random() * cells));
    for (const c of chosen) {
      const cx = tr.anchor.x + ((c % g.cols) - (g.cols - 1) / 2) * g.cell;
      const cz = tr.anchor.z + (Math.floor(c / g.cols) - (g.rows - 1) / 2) * g.cell;
      const geom: HazardGeom = { x: cx, z: cz - g.cell / 2, r: g.cell, sh: 'rect', yaw: 0, w: g.cell };
      this.h.addHazard(geom, g.warn, g.pct, true, 'fire', p.sid);
      if (g.burn > 0) this.h.addHazard(geom, g.warn + g.burn, g.pct * 0.5, true, 'fire', p.sid);
    }
    void now;
  }

  private cellAt(anchor: { x: number; z: number }, g: { cols: number; rows: number; cell: number }, x: number, z: number): number {
    const col = Math.floor((x - anchor.x) / g.cell + g.cols / 2);
    const row = Math.floor((z - anchor.z) / g.cell + g.rows / 2);
    return col < 0 || row < 0 || col >= g.cols || row >= g.rows ? -1 : row * g.cols + col;
  }

  /** Bóng tâm ma theo pha: một đợt đầu pha (`once`) hoặc cứ `every` giây, không quá `maxAlive` con còn sống. */
  private tickShadows(p: PlayerEnt, tr: TribState, ph: TribPhaseDef, now: number, pi: number): void {
    const s = ph.shadows;
    if (!s || (p.s.fl & PF_DEAD) !== 0) return;
    const at = tr.shadowAt ?? now;
    if (tr.pi === pi && now < at) return;
    tr.shadowAt = s.once || !s.every ? Number.POSITIVE_INFINITY : now + s.every * 1000;
    const room = Math.max(0, s.maxAlive - this.h.aliveShadows(p));
    const n = Math.min(s.count, room);
    const c = p.char;
    const base = shadowStats(c.level, c.atk, c.def);
    for (let i = 0; i < n; i++) {
      const st = { hp: Math.max(1, Math.round(c.mhp * s.hpFrac)), atk: base.atk, def: base.def };
      this.h.spawnShadow(p, st, { dyaw: ((i - (n - 1) / 2) * 2 * Math.PI) / 5, level: c.level + s.levelDelta });
    }
    if (n > 0) this.h.sys(p, 'sys.trib_shadow', undefined, 'bad');
  }
}

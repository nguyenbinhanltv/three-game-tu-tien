// Móc cơ chế riêng của độ kiếp (E1-F). `tribulations.json` ghi `mechanic: "<id>"` trên một pha; khi pha bắt đầu/đang chạy/kết thúc,
// `TribSystem` gọi `enter`/`tick`/`exit` của cơ chế đó. Các cơ chế dưới đây là CHỖ TRỐNG có chủ: chưa làm gì ngoài ghi log một lần,
// để E2-D (Kết Đan), E3 (Nguyên Anh), E4 (Hóa Thần) cài thật bằng `registerMechanic` mà không phải đụng lõi.
//
//   dan_tran    Kết Đan, pha Ngưng đan: vòng Đan Trận 4 m, thanh ngưng đan 0→100 trong 14 s (E2-J) khi đứng yên trong vòng, ra khỏi vòng tụt 3%/s.
//   tia_xich    Nguyên Anh, pha Lôi: tia xích nối giữa hai tia.
//   xuat_khieu  Nguyên Anh, pha Hỏa: phím X cho nguyên anh rời thân 6 s (hồi 20 s), thân đứng yên chịu lửa, nguyên anh không chịu lửa.
//   tam_canh    Nguyên Anh, pha Tâm ma: thanh tâm cảnh (giảm khi bị đánh trúng, hồi khi đánh trúng); Tâm Ma Ảnh dùng 2 chiêu của người chơi.
//   ngu_hanh    Hóa Thần, pha Ngũ hành lôi: tia mang hành xoay Kim→Mộc→Thủy→Hỏa→Thổ mỗi 5 s, 5 trận môn, đứng đúng trận môn giảm 80% (cờ `ke`).
//   phan_than   Hóa Thần, pha Thần niệm / Hợp nhất: phím G tạo phân thân thần niệm; phân thân chắn thay 40% ở pha cuối.
//
// Quy ước: trạng thái của cơ chế nằm ở `tr.mech[<id>]` (chỉ server giữ). Mọi lệnh phím (X, G) phải qua `GameSim.rateOk` và kiểm trạng thái kiếp ở server.

import { PF_DEAD, TRIB_MECHANIC_IDS, type TribDef, type TribPhaseDef } from '@dtl/shared';
import type { PlayerEnt } from './sim';
import type { TribHost, TribState } from './trib';

export interface TribMechCtx {
  /** Cổng vào sim (hành động server). */
  host: TribHost;
  p: PlayerEnt;
  tr: TribState;
  def: TribDef;
  phase: TribPhaseDef;
  phaseIdx: number;
  /** Giây từ lúc bắt đầu kiếp. */
  elapsed: number;
  now: number;
}

export interface TribMechanic {
  enter?(c: TribMechCtx): void;
  tick?(c: TribMechCtx): void;
  exit?(c: TribMechCtx): void;
}

const registry = new Map<string, TribMechanic>();
const warned = new Set<string>();

/** Cài (hoặc thay) cơ chế `id`. Dùng ở E2-D/E3/E4. */
export function registerMechanic(id: string, impl: TribMechanic): void {
  registry.set(id, impl);
}

export function hasMechanic(id: string): boolean {
  return registry.has(id);
}

for (const id of TRIB_MECHANIC_IDS) {
  if (id === 'dan_tran') continue; // đã cài thật ở dưới (E2-D)
  registerMechanic(id, {
    enter(c) {
      if (warned.has(id)) return;
      warned.add(id);
      console.log(`[trib] cơ chế "${id}" (kiếp ${c.def.id}, pha ${c.phase.id}) chưa cài: chạy pha chung`);
    },
  });
}

// ---------- dan_tran (E2-D): Đan Trận của Đan Hỏa Kiếp ----------

/** Trạng thái Đan Trận trong `tr.mech.dan_tran` (chỉ server giữ). */
export interface DanTranState {
  x: number;
  z: number;
  /** Thanh ngưng đan 0..100. */
  pg: number;
  /** Mốc tick trước (ms) để tính dt, và vị trí trước để biết có đứng yên không. */
  last: number;
  lx: number;
  lz: number;
  /** Mốc quét kế và mốc gửi tiến độ kế (ms). */
  sweepAt: number;
  sendAt: number;
  /** Đã đầy (thông báo một lần). */
  done: boolean;
  sweeps: number;
}

/** Người độ kiếp đang đứng yên trong vòng (chưa bay, chưa chết)? */
export function inDanTran(st: { x: number; z: number }, r: number, p: PlayerEnt): boolean {
  return !p.move.flying && Math.hypot(p.move.x - st.x, p.move.z - st.z) <= r;
}

/** Bước thanh ngưng đan: đứng yên trong vòng thì đầy, ra khỏi vòng thì tụt, di chuyển trong vòng thì giữ nguyên. Hàm thuần để test. */
export function stepDanTran(pg: number, dt: number, inside: boolean, still: boolean, fill: number, drain: number): number {
  if (!inside) return Math.max(0, pg - drain * dt);
  if (!still) return pg;
  return Math.min(100, pg + (100 / fill) * dt);
}

registerMechanic('dan_tran', {
  enter(c) {
    const cfg = c.phase.danTran;
    if (!cfg) return;
    // Người độ kiếp chọn chỗ đặt vòng bằng cách đứng ở đâu lúc pha bắt đầu.
    const st: DanTranState = { x: c.p.move.x, z: c.p.move.z, pg: 0, last: c.now, lx: c.p.move.x, lz: c.p.move.z, sweepAt: c.now + 1500, sendAt: 0, done: false, sweeps: 0 };
    (c.tr.mech ??= {}).dan_tran = st;
    const len = c.phase.end - (c.phaseIdx > 0 ? c.def.phases[c.phaseIdx - 1].end : 0);
    c.host.fx({ t: 'dantran', src: c.p.sid, x: st.x, z: st.z, r: cfg.r, d: len, pg: 0 });
    c.host.sys(c.p, 'sys.dan_tran_start', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.danTran;
    const st = c.tr.mech?.dan_tran as DanTranState | undefined;
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    const dt = Math.min(0.25, Math.max(0, (c.now - st.last) / 1000));
    const speed = dt > 0 ? Math.hypot(c.p.move.x - st.lx, c.p.move.z - st.lz) / dt : 0;
    st.last = c.now;
    st.lx = c.p.move.x;
    st.lz = c.p.move.z;
    const inside = inDanTran(st, cfg.r, c.p);
    st.pg = stepDanTran(st.pg, dt, inside, speed <= cfg.still, cfg.fill, cfg.drain);
    if (!st.done && st.pg >= 100) {
      st.done = true;
      c.host.sys(c.p, 'sys.dan_tran_done', undefined, 'good');
    }
    // Thiên lôi quét một vạch dài qua vòng (tâm lệch ngẫu nhiên trong nửa bán kính), hướng ngẫu nhiên; báo `sweepWarn` giây.
    if (c.now >= st.sweepAt) {
      st.sweepAt = c.now + cfg.sweepEvery * 1000;
      st.sweeps++;
      const yaw = Math.random() * Math.PI * 2;
      const off = (Math.random() - 0.5) * cfg.r;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const half = cfg.sweepLen / 2;
      // Gốc vạch lùi nửa chiều dài để vạch đi qua điểm (tâm vòng + lệch ngang).
      const cx = st.x + fz * off;
      const cz = st.z - fx * off;
      c.host.addHazard({ x: cx - fx * half, z: cz - fz * half, r: cfg.sweepLen, sh: 'rect', yaw, w: cfg.sweepW }, cfg.sweepWarn, cfg.sweepPct, true, 'lightning', c.p.sid, 0, false, 0, undefined, undefined, c.phase.hot);
    }
    if (c.now >= st.sendAt) {
      st.sendAt = c.now + 500;
      c.host.fx({ t: 'dantran', src: c.p.sid, x: st.x, z: st.z, r: cfg.r, pg: Math.round(st.pg) });
    }
  },
  exit(c) {
    const st = c.tr.mech?.dan_tran as DanTranState | undefined;
    if (!st) return;
    c.host.fx({ t: 'dantran', src: c.p.sid, x: st.x, z: st.z, pg: -1 });
    delete c.tr.mech!.dan_tran;
    // Hết pha ngưng đan mà thanh chưa đầy: đan không thành, kiếp thất bại.
    if (st.pg < 100 && (c.p.s.fl & PF_DEAD) === 0) {
      c.host.sys(c.p, 'sys.dan_tran_fail', undefined, 'bad');
      c.host.end(c.p, false);
    } else if (st.pg >= 100) {
      c.host.fx({ t: 'dantran_ok', src: c.p.sid, x: st.x, z: st.z });
    }
  },
});

export function runMechanic(id: string | undefined, hook: keyof TribMechanic, c: TribMechCtx): void {
  if (!id) return;
  const m = registry.get(id);
  if (!m) {
    if (!warned.has(id)) {
      warned.add(id);
      console.warn(`[trib] cơ chế "${id}" không có trong registry`);
    }
    return;
  }
  m[hook]?.(c);
}

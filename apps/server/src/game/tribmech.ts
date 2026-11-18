// Móc cơ chế riêng của độ kiếp (E1-F). `tribulations.json` ghi `mechanic: "<id>"` trên một pha; khi pha bắt đầu/đang chạy/kết thúc,
// `TribSystem` gọi `enter`/`tick`/`exit` của cơ chế đó. Các cơ chế dưới đây là CHỖ TRỐNG có chủ: chưa làm gì ngoài ghi log một lần,
// để E2-D (Kết Đan), E3 (Nguyên Anh), E4 (Hóa Thần) cài thật bằng `registerMechanic` mà không phải đụng lõi.
//
//   dan_tran    Kết Đan, pha Ngưng đan: vòng Đan Trận 4 m, thanh ngưng đan 0→100 trong 14 s (E2-J) khi đứng yên trong vòng, ra khỏi vòng tụt 3%/s.
//   tia_xich    Nguyên Anh, pha Lôi: tia xích nối giữa hai tia.
//   xuat_khieu  Nguyên Anh, pha Hỏa: phím X cho nguyên anh rời thân 6 s (hồi 20 s), thân đứng yên chịu lửa, nguyên anh không chịu lửa.
//   tam_canh    Nguyên Anh, pha Tâm ma: thanh tâm cảnh (giảm khi bị đánh trúng, hồi khi đánh trúng); Tâm Ma Ảnh dùng 2 chiêu của người chơi.
//   ngu_hanh    Hóa Thần, pha Ngũ hành lôi: tia mang hành xoay Kim→Mộc→Thủy→Hỏa→Thổ mỗi 5 s, 5 trận môn, đứng đúng trận môn giảm 80% (cờ `ke`).
//   dan_loi     Anh Biến, pha Dẫn lôi: năm Trấn Giới Bia của kiếp sáng khi tia rơi gần (tribanh.ts).
//   nhat_thuc   Anh Biến, pha Nhật thực: Nhật Thực Dực Chủ dập bia, thiên lôi đánh cả hắn (tribanh.ts).
//   phan_than   Hóa Thần, pha Thần niệm / Hợp nhất: phím G tạo phân thân thần niệm; phân thân chắn thay 40% ở pha cuối.
//
// Quy ước: trạng thái của cơ chế nằm ở `tr.mech[<id>]` (chỉ server giữ). Mọi lệnh phím (X, G) phải qua `GameSim.rateOk` và kiểm trạng thái kiếp ở server.

import { METHOD, SKILL } from '@dtl/content';
import { PF_DEAD, TRIB_MECHANIC_IDS, tribDef, type TribDef, type TribPhaseDef } from '@dtl/shared';
import type { PlayerEnt } from './entities';
import type { TribState } from './tribtypes';
import type { TribHost } from './tribhost';

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
  if (id === 'dan_tran' || id === 'tia_xich' || id === 'xuat_khieu' || id === 'tam_canh' || id === 'ngu_hanh' || id === 'phan_than' || id === 'dan_loi' || id === 'nhat_thuc') continue; // đã cài thật (E2-D, E3-L ở dưới; E4-D ở tribnhan.ts)
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


// ---------- tia_xich (E3-L): tia xích nối giữa hai tia ----------

/** Mỗi `every` giây hai tia rơi ở hai đầu một vạch sét đi qua chỗ người độ kiếp đứng (lệch ngang ngẫu nhiên), vạch nối hai tia báo `warn` giây rồi nổ. */
registerMechanic('tia_xich', {
  enter(c) {
    (c.tr.mech ??= {}).tia_xich = { at: c.now + 1500 };
  },
  tick(c) {
    const cfg = c.phase.tiaXich;
    const st = c.tr.mech?.tia_xich as { at: number } | undefined;
    if (!cfg || !st || c.now < st.at || (c.p.s.fl & PF_DEAD) !== 0) return;
    // Nhịp dày dần: chu kỳ co từ `every` xuống còn 70% về cuối pha.
    const phaseStart = c.phaseIdx > 0 ? c.def.phases[c.phaseIdx - 1].end : 0;
    const k = Math.min(1, Math.max(0, (c.elapsed - phaseStart) / Math.max(1, c.phase.end - phaseStart)));
    st.at = c.now + cfg.every * (1 - 0.3 * k) * 1000;
    const yaw = Math.random() * Math.PI;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const off = (Math.random() - 0.5) * 5;
    const cx = c.p.move.x + fz * off;
    const cz = c.p.move.z - fx * off;
    const half = cfg.len / 2;
    const ax = cx - fx * half;
    const az = cz - fz * half;
    const bx = cx + fx * half;
    const bz = cz + fz * half;
    const h = c.host;
    h.addHazard({ x: ax, z: az, r: cfg.endR }, cfg.warn, cfg.endPct, true, 'lightning', c.p.sid, 0, false, 0, undefined, undefined, c.phase.hot);
    h.addHazard({ x: bx, z: bz, r: cfg.endR }, cfg.warn, cfg.endPct, true, 'lightning', c.p.sid, 0, false, 0, undefined, undefined, c.phase.hot);
    h.addHazard({ x: ax, z: az, r: cfg.len, sh: 'rect', yaw, w: cfg.w }, cfg.warn, cfg.pct, true, 'lightning', c.p.sid, 0, false, h.nextGrp(), undefined, undefined, c.phase.hot);
  },
});

// ---------- xuat_khieu (E3-L): nguyên anh rời thân (móc tạm cho tới khi E3-K nối phím X và thực thể nguyên anh thật) ----------

/** Trạng thái xuất khiếu trong `tr.mech.xuat_khieu` (chỉ server giữ). */
export interface SoulState {
  /** Mốc nguyên anh quay về thân (ms); 0 = đang ở trong thân. */
  until: number;
  /** Mốc dùng lại được (ms). */
  cdUntil: number;
}

/** Nguyên anh đang rời thân? Thân khi đó đứng yên, lửa nặng nhất không rơi vào ô thân đứng. */
export function soulActive(tr: { mech?: Record<string, unknown> }, now: number): boolean {
  const st = tr.mech?.xuat_khieu as SoulState | undefined;
  return !!st && now < st.until;
}

/**
 * Người độ kiếp bấm xuất khiếu. Chỉ hợp lệ trong pha có cơ chế `xuat_khieu` của chính kiếp mình, đang sống, chưa hồi chiêu.
 * Trả true khi nguyên anh rời thân. (E3-K: nối phím X và thực thể nguyên anh vào hàm này; luật trong kiếp giữ nguyên.)
 */
export function soulOut(host: TribHost, p: PlayerEnt): boolean {
  const tr = p.trib;
  if (!tr || (p.s.fl & PF_DEAD) !== 0) return false;
  const def = tribDef(tr.id);
  const ph = def.phases[tr.pi ?? -1];
  const cfg = ph?.xuatKhieu;
  const st = tr.mech?.xuat_khieu as SoulState | undefined;
  const now = host.now();
  if (!cfg || ph.mechanic !== 'xuat_khieu' || !st || now < st.cdUntil || now < st.until) return false;
  st.until = now + cfg.dur * 1000;
  st.cdUntil = now + cfg.cd * 1000;
  host.fx({ t: 'xuatkhieu', src: p.sid, x: p.move.x, z: p.move.z, d: cfg.dur });
  host.sys(p, 'sys.xuat_khieu', { n: cfg.dur }, 'info');
  return true;
}

registerMechanic('xuat_khieu', {
  enter(c) {
    (c.tr.mech ??= {}).xuat_khieu = { until: 0, cdUntil: 0 } satisfies SoulState;
  },
  tick(c) {
    const st = c.tr.mech?.xuat_khieu as SoulState | undefined;
    if (st && st.until > 0 && c.now >= st.until) {
      st.until = 0;
      c.host.fx({ t: 'xuatkhieu_end', src: c.p.sid });
    }
  },
  exit(c) {
    const st = c.tr.mech?.xuat_khieu as SoulState | undefined;
    if (st && st.until > 0) c.host.fx({ t: 'xuatkhieu_end', src: c.p.sid });
    delete c.tr.mech?.xuat_khieu;
  },
});

// ---------- tam_canh (E3-L): thanh tâm cảnh + Tâm Ma Ảnh dùng chiêu của người độ kiếp ----------

export interface TamCanhState {
  /** Tâm cảnh 0..100. */
  tc: number;
  /** Mốc bóng ra chiêu kế (ms) và lượt chiêu (xoay giữa hai chiêu). */
  castAt: number;
  turn: number;
  /** Bóng đã hiện ít nhất một lần (để biết "bóng bị hạ" khác "chưa tới"). */
  seen: boolean;
  sendAt: number;
  /** Bóng bị hạ trước giờ hết kiếp. */
  beaten: boolean;
}

/** Hai chiêu của người chơi mà Tâm Ma Ảnh dùng: chiêu đặc trưng của công pháp (nếu là chiêu sát thương) và một chiêu diện rộng/đòn nặng đã mở. */
export function tamMaSkills(method: string | undefined, level: number): string[] {
  const ok = (id: string | undefined) => {
    const s = id ? SKILL.get(id) : undefined;
    return s && !s.locked && s.unlock <= level && (s.kind === 'damage' || s.kind === 'aoe') ? s.id : undefined;
  };
  const out: string[] = [];
  const sig = ok(method ? METHOD.get(method)?.sig : undefined);
  if (sig) out.push(sig);
  for (const id of ['skl_thien_kiem_vu', 'skl_kiem_khi_tram', 'skl_loi_dinh_nhat_kiem', 'skl_phi_kiem']) {
    const k = ok(id);
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= 2) break;
  }
  return out;
}

registerMechanic('tam_canh', {
  enter(c) {
    const cfg = c.phase.tamCanh;
    if (!cfg) return;
    (c.tr.mech ??= {}).tam_canh = { tc: 100, castAt: c.now + 3500, turn: 0, seen: false, sendAt: 0, beaten: false } satisfies TamCanhState;
    c.host.fx({ t: 'tamcanh', src: c.p.sid, pg: 100 });
    c.host.sys(c.p, 'sys.tam_canh_start', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.tamCanh;
    const st = c.tr.mech?.tam_canh as TamCanhState | undefined;
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    const sh = c.host.shadowOf(c.p);
    if (sh) st.seen = true;
    else if (st.seen && !st.beaten) {
      // Tâm Ma Ảnh đã bị hạ: tâm ma tan, kiếp thành ngay.
      st.beaten = true;
      c.host.sys(c.p, 'sys.tam_canh_win', undefined, 'good');
      c.host.end(c.p, true);
      return;
    }
    if (sh && c.now >= st.castAt) {
      st.castAt = c.now + cfg.skillEvery * 1000;
      const ids = tamMaSkills(c.p.char.meta.method, c.p.char.level);
      const id = ids[st.turn++ % Math.max(1, ids.length)];
      const sk = id ? SKILL.get(id) : undefined;
      if (sk) {
        const dx = c.p.move.x - sh.s.x;
        const dz = c.p.move.z - sh.s.z;
        const dist = Math.hypot(dx, dz) || 1;
        const pow = cfg.skillPow * Math.max(1, sk.power);
        if (sk.kind === 'aoe') {
          c.host.addHazard({ x: c.p.move.x, z: c.p.move.z, r: Math.min(10, sk.radius ?? 6) }, cfg.skillWarn, pow, false, 'spirit', sh.id, sh.atk);
        } else {
          const len = Math.min(18, dist + 4);
          c.host.addHazard({ x: sh.s.x, z: sh.s.z, r: len, sh: 'rect', yaw: Math.atan2(dx, dz), w: 3 }, cfg.skillWarn, pow, false, 'spirit', sh.id, sh.atk);
        }
        c.host.fx({ t: 'tamma_cast', src: sh.id, s: sk.id, x: c.p.move.x, z: c.p.move.z, d: cfg.skillWarn });
      }
    }
    if (c.now >= st.sendAt) {
      st.sendAt = c.now + 500;
      c.host.fx({ t: 'tamcanh', src: c.p.sid, pg: Math.round(st.tc) });
    }
  },
  exit(c) {
    c.host.fx({ t: 'tamcanh', src: c.p.sid, pg: -1 });
    delete c.tr.mech?.tam_canh;
  },
});

/** Va chạm trong pha tâm ma: `hurt` = Tâm Ma Ảnh đánh trúng người độ kiếp (tâm cảnh giảm), `hit` = người độ kiếp đánh trúng bóng (hồi). Về 0 thì thất bại. */
export function tamCanhHit(host: TribHost, p: PlayerEnt, kind: 'hurt' | 'hit'): void {
  const tr = p.trib;
  const st = tr?.mech?.tam_canh as TamCanhState | undefined;
  if (!tr || !st || st.beaten) return;
  const cfg = tribDef(tr.id).phases[tr.pi ?? -1]?.tamCanh;
  if (!cfg) return;
  st.tc = Math.max(0, Math.min(100, st.tc + (kind === 'hurt' ? -cfg.hurt : cfg.hit)));
  if (st.tc <= 0 && (p.s.fl & PF_DEAD) === 0) {
    host.fx({ t: 'tamcanh', src: p.sid, pg: 0 });
    host.sys(p, 'sys.tam_canh_fail', undefined, 'bad');
    host.end(p, false);
  }
}

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

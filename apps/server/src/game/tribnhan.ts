// Thiên Nhân Kiếp (E4-D, kiếp Hóa Thần): hai cơ chế `ngu_hanh` và `phan_than` của `tribmech.ts`. Server giữ mọi trạng thái;
// client chỉ nhận vạch báo (S.HAZARD) và vài FX hình (`nguhanh`, `phanthan`, `phanthan_end`, `thienphat`).
//
//  - Ngũ hành lôi (pha 1): năm trận môn quanh chỗ người độ kiếp đứng lúc vào kiếp; mỗi 5 s một tia kiếp quét cả sân mang hành Kim→Mộc→Thủy→Hỏa→Thổ.
//    Đứng trong trận môn khắc chế hành đó lúc nổ thì giảm 80% (cờ `ke` của DmgMsg, qua `Hazard.seal` ở sim.ts).
//  - Thần niệm (pha 2): tia quét, cột thiên phạt rơi lên ba trận môn (trừ trận môn thứ hai), mạch nối thiên phạt đánh thẳng người độ kiếp
//    trừ khi thế thân (phím G, miễn phí trong kiếp) hoặc chính thân đứng trong trận môn thứ hai.
//  - Thiên nhân hợp nhất (pha 3): thế thân còn sống chắn thay 40% tia khóa mệnh (`cloneAbsorb`, gọi từ `tickHazards`), hộ pháp chắn thêm 25%.
//
// Thế thân của kiếp chỉ là móc cho tới khi E4-K làm phân thân thần niệm thật của người chơi (phím G chung): khi đó nối vào `cloneOut`.

import { ELEMENTS, PF_DEAD, TRIB_LINK_SEAL, nguHanhIndex, nguHanhSealFor, tribDef, tribSealPos, type HazardKind, type TribDef, type TribNguHanh } from '@dtl/shared';
import type { PlayerEnt } from './sim';
import type { TribHost } from './trib';
import { registerMechanic, type TribMechCtx } from './tribmech';

const ELEM_HAZARD: Record<(typeof ELEMENTS)[number], HazardKind> = { kim: 'lightning', moc: 'spirit', thuy: 'frost', hoa: 'fire', tho: 'spirit' };
/** Dấu trận môn vẽ lại sau từng này giây (dấu tồn tại SEAL_REFRESH + 1 giây). */
const SEAL_REFRESH = 9;

/** Trạng thái ngũ hành lôi trong `tr.mech.ngu_hanh` (chỉ server giữ). */
export interface NguHanhState {
  /** Tâm trận môn. */
  x: number;
  z: number;
  /** Tia kiếp kế tiếp (đếm từ 0) và mốc bắn (ms). */
  n: number;
  at: number;
  markAt: number;
}

/** Cấu hình ngũ hành của kiếp (nằm ở pha đầu; các pha sau dùng lại trận môn). */
export function nguHanhCfg(def: TribDef): TribNguHanh | undefined {
  return def.phases.find((p) => p.nguHanh)?.nguHanh;
}

/** Trận môn đứng ở `(x, z)` (chỉ số 0..4), hoặc -1. Hàm thuần để test. */
export function sealAt(center: { x: number; z: number }, cfg: { ring: number; sealR: number }, x: number, z: number): number {
  for (let i = 0; i < ELEMENTS.length; i++) {
    const s = tribSealPos(center, cfg.ring, i);
    if (Math.hypot(x - s.x, z - s.z) <= cfg.sealR) return i;
  }
  return -1;
}

function markSeals(host: TribHost, now: number, st: NguHanhState, cfg: TribNguHanh): void {
  if (now < st.markAt) return;
  st.markAt = now + SEAL_REFRESH * 1000;
  for (let i = 0; i < ELEMENTS.length; i++) {
    const s = tribSealPos(st, cfg.ring, i);
    host.addHazard({ x: s.x, z: s.z, r: cfg.sealR }, 0.2, 0, false, ELEM_HAZARD[ELEMENTS[i]], '', 0, false, 0, undefined, undefined, false, { mv: 'pool', dur: SEAL_REFRESH + 1 });
  }
}

function sealsOf(c: TribMechCtx): { st: NguHanhState; cfg: TribNguHanh } | null {
  const cfg = nguHanhCfg(c.def);
  const st = c.tr.mech?.ngu_hanh as NguHanhState | undefined;
  return cfg && st ? { st, cfg } : null;
}

registerMechanic('ngu_hanh', {
  enter(c) {
    const cfg = c.phase.nguHanh;
    if (!cfg) return;
    const st: NguHanhState = { x: c.p.move.x, z: c.p.move.z, n: 0, at: c.now + cfg.first * 1000, markAt: 0 };
    (c.tr.mech ??= {}).ngu_hanh = st;
    c.host.sys(c.p, 'sys.ngu_hanh_start', undefined, 'info');
    markSeals(c.host, c.now, st, cfg);
  },
  tick(c) {
    const cfg = c.phase.nguHanh;
    const st = c.tr.mech?.ngu_hanh as NguHanhState | undefined;
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    markSeals(c.host, c.now, st, cfg);
    if (c.now < st.at) return;
    const idx = nguHanhIndex(st.n++);
    st.at = c.now + cfg.every * 1000;
    const e = ELEMENTS[idx];
    const seal = tribSealPos(st, cfg.ring, nguHanhSealFor(idx));
    // Tia kiếp quét cả sân; ai đứng trong trận môn khắc chế hành này lúc nổ giảm `cut` (cờ `ke`).
    c.host.addHazard({ x: st.x, z: st.z, r: cfg.ring + cfg.sealR + cfg.pad }, cfg.warn, cfg.pct, true, ELEM_HAZARD[e], c.p.sid, 0, false, 0, undefined, undefined, false, { seal: { x: seal.x, z: seal.z, r: cfg.sealR, cut: cfg.cut } });
    c.host.fx({ t: 'nguhanh', src: c.p.sid, n: idx, d: cfg.warn, x: st.x, z: st.z, r: cfg.ring });
  },
});

// ---------- phan_than ----------

/** Trạng thái thế thân thần niệm trong `tr.mech.phan_than` (chỉ server giữ). */
export interface CloneState {
  /** Vị trí thế thân và mốc tan (ms); until 0 = không có. */
  x: number;
  z: number;
  until: number;
  /** Số thế thân đã tạo trong kiếp. */
  made: number;
  /** Mốc bắt đầu pha hiện tại (ms) và các việc đã làm trong pha. */
  t0: number;
  sweeps: number;
  pillar: boolean;
  link: boolean;
  /** Mạch nối đang báo: nổ lúc này (ms), 0 = không. */
  linkAt: number;
}

export function cloneAlive(st: CloneState | undefined, now: number): boolean {
  return !!st && st.until > 0 && now < st.until;
}

/** Ai chắn mạch nối thiên phạt? 'clone' = thế thân đứng trong trận môn thứ hai, 'body' = thân chính đứng trong đó, 'none' = không ai. Hàm thuần để test. */
export function linkBlocker(center: { x: number; z: number }, cfg: { ring: number; sealR: number }, clone: { x: number; z: number } | null, body: { x: number; z: number }): 'clone' | 'body' | 'none' {
  const s = tribSealPos(center, cfg.ring, TRIB_LINK_SEAL);
  if (clone && Math.hypot(clone.x - s.x, clone.z - s.z) <= cfg.sealR) return 'clone';
  if (Math.hypot(body.x - s.x, body.z - s.z) <= cfg.sealR) return 'body';
  return 'none';
}

/** Phím G trong Thiên Nhân Kiếp: thế thân đứng yên ở chỗ người độ kiếp đứng. Chỉ hợp lệ trong pha `phan_than` của kiếp mình, đang sống, chưa có thế thân còn sống, chưa quá `max`. */
export function cloneOut(host: TribHost, p: PlayerEnt): boolean {
  const tr = p.trib;
  if (!tr || (p.s.fl & PF_DEAD) !== 0) return false;
  const def = tribDef(tr.id);
  const ph = def.phases[tr.pi ?? -1];
  const cfg = ph?.phanThan;
  const st = tr.mech?.phan_than as CloneState | undefined;
  const now = host.now();
  if (!cfg || ph.mechanic !== 'phan_than' || !st || cloneAlive(st, now) || st.made >= cfg.max) return false;
  st.x = p.move.x;
  st.z = p.move.z;
  st.until = now + cfg.life * 1000;
  st.made++;
  host.fx({ t: 'phanthan', src: p.sid, x: st.x, z: st.z, d: cfg.life });
  host.sys(p, 'sys.phan_than', { n: cfg.life }, 'info');
  return true;
}

/** Thế thân còn sống chắn thay `absorb` của tia khóa mệnh rồi tan: trả phần đã chắn. */
export function cloneAbsorb(host: TribHost, p: PlayerEnt, n: number): number {
  const tr = p.trib;
  if (!tr) return 0;
  const st = tr.mech?.phan_than as CloneState | undefined;
  const absorb = tribDef(tr.id).phases[tr.pi ?? -1]?.phanThan?.absorb ?? 0;
  if (!st || absorb <= 0 || !cloneAlive(st, host.now())) return 0;
  st.until = 0;
  host.fx({ t: 'phanthan_end', src: p.sid, x: st.x, z: st.z, pg: 1 });
  host.sys(p, 'sys.phan_than_guard', { n: Math.round(absorb * 100) }, 'good');
  return n * absorb;
}

registerMechanic('phan_than', {
  enter(c) {
    const cfg = c.phase.phanThan;
    if (!cfg) return;
    const old = c.tr.mech?.phan_than as CloneState | undefined;
    const st: CloneState = { x: old?.x ?? 0, z: old?.z ?? 0, until: old?.until ?? 0, made: old?.made ?? 0, t0: c.now, sweeps: 0, pillar: false, link: false, linkAt: 0 };
    (c.tr.mech ??= {}).phan_than = st;
    c.host.sys(c.p, cfg.sweeps ? 'sys.phan_than_hint' : 'sys.phan_than_hint2', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.phanThan;
    const st = c.tr.mech?.phan_than as CloneState | undefined;
    if (!cfg || !st) return;
    if (st.until > 0 && c.now >= st.until) {
      st.until = 0;
      c.host.fx({ t: 'phanthan_end', src: c.p.sid, x: st.x, z: st.z });
    }
    const sl = sealsOf(c);
    if (!sl || (c.p.s.fl & PF_DEAD) !== 0) return;
    const { st: ctr, cfg: ng } = sl;
    const rel = (c.now - st.t0) / 1000;
    const h = c.host;
    // Tia quét: vạch dài qua tâm sân, hướng ngẫu nhiên.
    if (cfg.sweeps && st.sweeps < cfg.sweeps.length && rel >= cfg.sweeps[st.sweeps]) {
      st.sweeps++;
      const yaw = Math.random() * Math.PI;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const len = cfg.sweepLen ?? 30;
      h.addHazard({ x: ctr.x - fx * (len / 2), z: ctr.z - fz * (len / 2), r: len, sh: 'rect', yaw, w: cfg.sweepW ?? 4 }, cfg.sweepWarn ?? 1.8, cfg.sweepPct ?? 0.2, true, 'lightning', c.p.sid);
    }
    // Cột thiên phạt: rơi cùng lúc lên `pillars` trận môn (không gồm trận môn thứ hai, nơi gánh mạch nối).
    if (cfg.pillarAt !== undefined && !st.pillar && rel >= cfg.pillarAt) {
      st.pillar = true;
      const pool = [0, 1, 2, 3, 4].filter((i) => i !== TRIB_LINK_SEAL);
      for (let k = pool.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [pool[k], pool[j]] = [pool[j], pool[k]];
      }
      for (const i of pool.slice(0, cfg.pillars ?? 3)) {
        const s = tribSealPos(ctr, ng.ring, i);
        h.addHazard({ x: s.x, z: s.z, r: cfg.pillarR ?? 4 }, cfg.pillarWarn ?? 2.5, cfg.pillarPct ?? 0.3, true, 'lightning', c.p.sid);
      }
      h.sys(c.p, 'sys.thien_phat', undefined, 'bad');
    }
    // Mạch nối thiên phạt: báo ở trận môn thứ hai; tới giờ nổ mà không ai (thế thân hoặc thân chính) đứng trong đó thì đánh thẳng người độ kiếp.
    if (cfg.linkAt !== undefined && !st.link && rel >= cfg.linkAt) {
      st.link = true;
      const warn = cfg.linkWarn ?? 2.5;
      st.linkAt = c.now + warn * 1000;
      const s = tribSealPos(ctr, ng.ring, TRIB_LINK_SEAL);
      h.addHazard({ x: s.x, z: s.z, r: ng.sealR }, warn, 0, false, 'spirit', '', 0, false, 0, undefined, undefined, false, { mv: 'pool', dur: warn + 1 });
      h.sys(c.p, 'sys.than_niem_link', undefined, 'bad');
    }
    if (st.linkAt > 0 && c.now >= st.linkAt) {
      st.linkAt = 0;
      const who = linkBlocker(ctr, ng, cloneAlive(st, c.now) ? st : null, c.p.move);
      if (who === 'clone') {
        st.until = 0;
        h.fx({ t: 'phanthan_end', src: c.p.sid, x: st.x, z: st.z, pg: 1 });
        h.sys(c.p, 'sys.than_niem_ok', undefined, 'good');
      } else {
        h.damage(c.p, c.p.char.mhp * (cfg.linkPct ?? 0.35) * (who === 'body' ? 1 - ng.cut : 1), who === 'body' ? 1 : undefined);
        h.fx({ t: 'thienphat', src: c.p.sid, x: c.p.move.x, z: c.p.move.z });
      }
    }
  },
  exit(c) {
    const st = c.tr.mech?.phan_than as CloneState | undefined;
    if (st) st.linkAt = 0;
  },
});

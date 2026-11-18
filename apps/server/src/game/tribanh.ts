// Nhật Thực Kiếp (Anh Biến, DV-3K): hai cơ chế `dan_loi` và `nhat_thuc` của `tribmech.ts`, thêm cổng tia cuối ở trib.ts (`gateSteles`).
// Server giữ mọi trạng thái; client chỉ nhận vạch báo (S.HAZARD) và FX hình (`steles`, `rift`).
//
//  - Dẫn lôi (pha 1): năm Trấn Giới Bia (thực thể của kiếp, không dính gì với năm bia 20 phút của room thế giới) ở ngũ giác bán kính `ring` quanh tâm sân.
//    Mỗi `every` giây một tia nhắm chỗ người độ kiếp đứng, rơi sau `warn` giây ở đúng chỗ đó; rơi trong `steleR` mét quanh bia chưa sáng thì bia sáng.
//  - Nhật thực (pha 2): Nhật Thực Dực Chủ (quái thật của sim) giáng xuống. Hắn dập bia sáng (niệm `smashWarn` giây, ngắt được bằng mất thế/choáng);
//    thiên lôi rơi quanh người độ kiếp cũng đánh cả hắn: đứng trong tầm tia thì hắn mất thế `stun` giây. Tịnh Quang đỡ thay một đòn mỗi `shieldEvery` giây
//    (làm gần đúng: hồi 15% khí huyết tối đa, không chặn từng đòn).
//  - Hàn (pha 3): còn >= `final.gateSteles` bia sáng thì tia cuối đánh vào khe (không vào người).

import { LEVELS } from '@dtl/content';
import { MS_DEAD, PF_DEAD, tribDef, tribLevelOf, tribSealPos, type TribDanLoi, type TribDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './sim';
import type { TribHost, TribState } from './trib';
import { registerMechanic } from './tribmech';

export const STELE_COUNT = 5;
/** Khe Giới Khích nằm ở mép bắc sân (−z), cách tâm `RIFT_DIST` lần bán kính ngũ giác. */
export const RIFT_DIST = 1.9;

interface Bolt {
  x: number;
  z: number;
  at: number;
}

/** Trạng thái dẫn lôi trong `tr.mech.dan_loi` (chỉ server giữ). Còn nguyên sau khi pha 1 kết thúc: pha 3 đọc số bia sáng. */
export interface DanLoiState {
  x: number;
  z: number;
  lit: boolean[];
  nextAt: number;
  bolts: Bolt[];
}

/** Trạng thái nhật thực trong `tr.mech.nhat_thuc`. */
export interface NhatThucState {
  boss: MonEnt | null;
  boltAt: number;
  bolts: Bolt[];
  smashAt: number;
  cast: { idx: number; at: number } | null;
  shieldAt: number;
}

/** Tâm sân kiếp của `def` (từ level kiếp). */
export function arenaCenter(def: TribDef): { x: number; z: number } {
  return LEVELS[tribLevelOf(def)]?.dungeon?.center ?? { x: 0, z: 0 };
}

export function danLoiCfg(def: TribDef): TribDanLoi | undefined {
  return def.phases.find((p) => p.danLoi)?.danLoi;
}

export function litCount(st: { lit: readonly boolean[] } | undefined): number {
  return st ? st.lit.filter(Boolean).length : 0;
}

/** Bia chưa sáng mà điểm `(x, z)` rơi trong `steleR` mét quanh nó, hoặc -1. Hàm thuần để test. */
export function steleHit(center: { x: number; z: number }, cfg: { ring: number; steleR: number }, lit: readonly boolean[], x: number, z: number): number {
  for (let i = 0; i < STELE_COUNT; i++) {
    if (lit[i]) continue;
    const s = tribSealPos(center, cfg.ring, i);
    if (Math.hypot(x - s.x, z - s.z) <= cfg.steleR) return i;
  }
  return -1;
}

/** Bia sáng bị dập: bia sáng gần người độ kiếp nhất (-1 nếu chưa bia nào sáng). Hàm thuần để test. */
export function pickSmash(center: { x: number; z: number }, ring: number, lit: readonly boolean[], px: number, pz: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < STELE_COUNT; i++) {
    if (!lit[i]) continue;
    const s = tribSealPos(center, ring, i);
    const d = Math.hypot(px - s.x, pz - s.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export function riftPos(center: { x: number; z: number }, ring: number): { x: number; z: number } {
  return { x: center.x, z: center.z - ring * RIFT_DIST };
}

function mask(lit: readonly boolean[]): number {
  return lit.reduce((m, v, i) => (v ? m | (1 << i) : m), 0);
}

function sendSteles(host: TribHost, p: PlayerEnt, st: DanLoiState, cfg: TribDanLoi): void {
  host.fx({ t: 'steles', src: p.sid, x: st.x, z: st.z, r: cfg.ring, n: mask(st.lit) });
}

export function danLoiOf(tr: TribState | null | undefined): DanLoiState | undefined {
  return tr?.mech?.dan_loi as DanLoiState | undefined;
}

registerMechanic('dan_loi', {
  enter(c) {
    const cfg = c.phase.danLoi;
    if (!cfg) return;
    const ctr = arenaCenter(c.def);
    const st: DanLoiState = { x: ctr.x, z: ctr.z, lit: new Array<boolean>(STELE_COUNT).fill(false), nextAt: c.now + cfg.first * 1000, bolts: [] };
    (c.tr.mech ??= {}).dan_loi = st;
    sendSteles(c.host, c.p, st, cfg);
    c.host.sys(c.p, 'sys.dan_loi_start', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.danLoi;
    const st = danLoiOf(c.tr);
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    // Tia đã rơi: bia chưa sáng ở gần chỗ rơi thì sáng.
    for (const b of st.bolts.filter((x) => c.now >= x.at)) {
      const i = steleHit(st, cfg, st.lit, b.x, b.z);
      if (i >= 0) {
        st.lit[i] = true;
        sendSteles(c.host, c.p, st, cfg);
        c.host.sys(c.p, 'sys.dan_loi_lit', { n: i + 1, lit: litCount(st) }, 'good');
      }
    }
    st.bolts = st.bolts.filter((x) => c.now < x.at);
    if (c.now < st.nextAt) return;
    st.nextAt = c.now + cfg.every * 1000;
    const b: Bolt = { x: c.p.move.x, z: c.p.move.z, at: c.now + cfg.warn * 1000 };
    st.bolts.push(b);
    c.host.addHazard({ x: b.x, z: b.z, r: cfg.r }, cfg.warn, cfg.pct, true, 'lightning', c.p.sid);
  },
});

registerMechanic('nhat_thuc', {
  enter(c) {
    const cfg = c.phase.nhatThuc;
    if (!cfg) return;
    const boss = c.host.spawnBoss(c.p, cfg.boss, cfg.dist);
    const st: NhatThucState = { boss, boltAt: c.now + 2500, bolts: [], smashAt: c.now + 6000, cast: null, shieldAt: c.now + cfg.shieldEvery * 1000 };
    (c.tr.mech ??= {}).nhat_thuc = st;
    c.host.sys(c.p, 'sys.nhat_thuc_start', undefined, 'bad');
  },
  tick(c) {
    const cfg = c.phase.nhatThuc;
    const st = c.tr.mech?.nhat_thuc as NhatThucState | undefined;
    const dl = danLoiOf(c.tr);
    const dcfg = danLoiCfg(c.def);
    if (!cfg || !st || !dl || !dcfg || (c.p.s.fl & PF_DEAD) !== 0) return;
    const h = c.host;
    const boss = st.boss && st.boss.state !== MS_DEAD ? st.boss : null;
    // Tia đã rơi đánh cả hắn: đứng trong tầm thì mất thế.
    for (const b of st.bolts.filter((x) => c.now >= x.at)) {
      if (boss && Math.hypot(boss.s.x - b.x, boss.s.z - b.z) <= cfg.r + 1) {
        h.stunMonster(boss, cfg.stun);
        h.sys(c.p, 'sys.nhat_thuc_stun', undefined, 'good');
      }
    }
    st.bolts = st.bolts.filter((x) => c.now < x.at);
    if (c.now >= st.boltAt) {
      st.boltAt = c.now + cfg.every * 1000;
      st.bolts.push({ x: c.p.move.x, z: c.p.move.z, at: c.now + cfg.warn * 1000 });
      h.addHazard({ x: c.p.move.x, z: c.p.move.z, r: cfg.r }, cfg.warn, cfg.pct, true, 'lightning', c.p.sid, 0, false, 0, undefined, undefined, c.phase.hot);
    }
    // Dập bia: chọn lúc niệm, hủy nếu hắn bị ngắt (choáng/mất thế) trước khi chú xong.
    if (st.cast) {
      if (!boss || c.now < boss.stunUntil) {
        st.cast = null;
        h.sys(c.p, 'sys.nhat_thuc_cancel', undefined, 'good');
      } else if (c.now >= st.cast.at) {
        dl.lit[st.cast.idx] = false;
        st.cast = null;
        sendSteles(h, c.p, dl, dcfg);
        h.sys(c.p, 'sys.nhat_thuc_broken', { lit: litCount(dl) }, 'bad');
      }
    } else if (boss && c.now >= st.smashAt && c.now >= boss.stunUntil) {
      st.smashAt = c.now + cfg.smashEvery * 1000;
      const idx = pickSmash(dl, dcfg.ring, dl.lit, c.p.move.x, c.p.move.z);
      if (idx >= 0) {
        st.cast = { idx, at: c.now + cfg.smashWarn * 1000 };
        const s = tribSealPos(dl, dcfg.ring, idx);
        h.addHazard({ x: s.x, z: s.z, r: cfg.smashR }, cfg.smashWarn, cfg.smashPct, true, 'spirit', c.p.sid);
        h.sys(c.p, 'sys.nhat_thuc_smash', undefined, 'bad');
      }
    }
    if (c.now >= st.shieldAt) {
      st.shieldAt = c.now + cfg.shieldEvery * 1000;
      h.heal(c.p, c.p.char.mhp * 0.15);
      h.sys(c.p, 'sys.nhat_thuc_shield', undefined, 'good');
    }
  },
  exit(c) {
    dropBoss(c.host, c.tr);
  },
});

/** Gỡ Nhật Thực Dực Chủ (hết pha hoặc kiếp kết thúc giữa chừng). */
export function dropBoss(host: TribHost, tr: TribState): void {
  const st = tr.mech?.nhat_thuc as NhatThucState | undefined;
  if (st?.boss) host.removeMonster(st.boss);
  if (st) {
    st.boss = null;
    st.cast = null;
  }
}

/** Dọn mọi thứ cơ chế Anh Biến giữ trong sim (gọi khi kiếp kết thúc). */
export function tribCleanup(host: TribHost, p: PlayerEnt): void {
  if (p.trib) dropBoss(host, p.trib);
}

/** Tia cuối của pha Hàn: đủ `gate` bia sáng thì đánh vào khe thay vì người. Trả true nếu đã xử lý (không thả tia vào người). */
export function riftFinal(host: TribHost, p: PlayerEnt, tr: TribState, gate: number, delay: number, r: number): boolean {
  const def = tribDef(tr.id);
  const st = danLoiOf(tr);
  const cfg = danLoiCfg(def);
  if (!st || !cfg) return false;
  if (litCount(st) < gate) {
    host.sys(p, 'sys.anh_bien_rift_open', undefined, 'bad');
    return false;
  }
  const rp = riftPos(st, cfg.ring);
  host.addHazard({ x: rp.x, z: rp.z, r }, delay, 0, true, 'lightning', p.sid);
  host.fx({ t: 'rift', src: p.sid, x: rp.x, z: rp.z, r, d: delay, pg: 1 });
  host.sys(p, 'sys.anh_bien_rift_ok', undefined, 'good');
  return true;
}

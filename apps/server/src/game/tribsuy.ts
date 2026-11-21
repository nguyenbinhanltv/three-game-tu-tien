// Thiên Nhân Ngũ Suy (TN-4): năm cơ chế `suy_*` của `tribmech.ts`, mỗi cơ chế là một ải của kiếp chuỗi `ngu_suy`.
// Server giữ mọi trạng thái ở `tr.mech.suy`; client chỉ nhận FX hình (`suy` = thanh suy khí, `suymark` = dấu trên sân) và vạch báo (S.HAZARD).
//
//  - Linh Lực Suy (`suy_linh`): linh lực bị rút theo thanh. Một Linh Nhãn hiện trên vòng quanh tâm ải rồi dời chỗ; đứng trong đó thanh mới giảm.
//  - Nhục Thân Suy (`suy_the`): khí huyết rỉ theo thanh. Tôi Thể Lôi rơi gần người, phải BƯỚC VÀO đón tia (mất chút khí huyết) thanh mới giảm.
//  - Thần Thức Suy (`suy_thuc`): lôi ẩn nổ theo cung, server không báo trước. Phím X ngưng thần thì đợt đang chờ mới hiện vạch; hồi chiêu dài dần theo thanh.
//  - Thọ Nguyên Suy (`suy_tho`): suy phong thổi tắt dần các ngọn Thọ Đăng; đứng cạnh ngọn tắt đủ lâu để thắp lại. Tắt hết là thất bại.
//  - Đạo Tâm Suy (`suy_tam`): Tâm Ma Ảnh quấy nhiễu. Nhịp tĩnh thì nhịn không ra tay, nhịp phá vọng thì phải đánh trúng nó.
//
// Thanh chạm 100 ở ải nào thì kiếp thất bại tại ải đó; ải đã qua được `host.suyCleared` lưu lại (thưởng một lần qua transaction + sổ cái),
// lần sau vào tiếp từ ải chưa qua. Thao tác của người chơi chỉ là di chuyển, đòn đánh và phím X: tất cả đều đã đi qua kiểm tra của sim.

import {
  PF_DEAD,
  bumpSuy,
  isSuyMechanic,
  shadowStats,
  stepSuy,
  suyLerp,
  suyProgress,
  suyRevealCd,
  suyRingPos,
  suyRise,
  suySectorYaw,
  suyThucHit,
  suyThucWave,
  tribDef,
  tribPhaseStart,
  type TribSuy,
} from '@dtl/shared';
import type { PlayerEnt } from './entities';
import type { TribHost } from './tribhost';
import type { TribState } from './tribtypes';
import { registerMechanic, type TribMechCtx } from './tribmech';

/** Phần chung của một ải trong `tr.mech.suy` (chỉ server giữ). */
export interface SuyState {
  /** Cơ chế đang chạy (`suy_*` của Ngũ Suy hoặc `hk_*` của Huyền Kiếp, tribhuyen.ts). */
  id: string;
  /** Thanh suy khí 0..100. */
  pg: number;
  /** Tâm ải: chỗ người độ kiếp đứng lúc vào ải. */
  x: number;
  z: number;
  /** Mốc tick trước, mốc hết điều tức, mốc gửi thanh kế (ms). */
  last: number;
  restUntil: number;
  sendAt: number;
  /** Đã thất bại (không lưu ải khi thoát pha). */
  failed: boolean;
}

interface LinhState extends SuyState {
  id: 'suy_linh';
  /** Linh Nhãn đang mở: vị trí, góc trên vòng, mốc dời chỗ. */
  sx: number;
  sz: number;
  ang: number;
  until: number;
}

interface TheState extends SuyState {
  id: 'suy_the';
  nextAt: number;
  bleedAt: number;
  /** Tia Tôi Thể Lôi đang báo. */
  pend: { x: number; z: number; at: number } | null;
}

interface ThucState extends SuyState {
  id: 'suy_thuc';
  waveAt: number;
  /** Đợt lôi ẩn đang chờ: mặt nạ cung nổ, mốc nổ, đã ngưng thần soi ra chưa. */
  pend: { mask: number; at: number; shown: boolean } | null;
  /** Mốc ngưng thần lại được. */
  cdUntil: number;
}

interface ThoState extends SuyState {
  id: 'suy_tho';
  lit: boolean[];
  gustAt: number;
  pend: { i: number; at: number } | null;
  /** Đang đứng thắp ngọn `i` từ mốc `since`. */
  hold: { i: number; since: number } | null;
}

interface TamState extends SuyState {
  id: 'suy_tam';
  /** 0 = tĩnh, 1 = phá vọng. */
  mode: 0 | 1;
  modeUntil: number;
  /** Mốc hết nhịp phá vọng gần nhất (đòn bay dở rơi ngay sau đó không bị tính là động niệm). */
  graceUntil: number;
  /** Nhịp phá vọng này đã trúng. */
  struck: boolean;
  spawnAt: number;
}

/** Đòn rơi trong từng này ms sau nhịp phá vọng vẫn coi là của nhịp đó. */
const TAM_GRACE_MS = 600;

export function stateOf<T extends SuyState>(tr: TribState | null | undefined, id: T['id']): T | undefined {
  const st = tr?.mech?.suy as SuyState | undefined;
  return st && st.id === id ? (st as T) : undefined;
}

function grounded(p: PlayerEnt): boolean {
  return !p.move.flying;
}

export function near(p: PlayerEnt, x: number, z: number, r: number): boolean {
  return grounded(p) && Math.hypot(p.move.x - x, p.move.z - z) <= r;
}

export function sendBar(c: { host: TribHost; p: PlayerEnt }, st: SuyState, extra: { n?: number; d?: number } = {}): void {
  // Tròn số nhưng không bao giờ gửi 100 khi chưa thất bại: 100 là tín hiệu "suy khí công tâm" (client phát hình thất bại).
  c.host.fx({ t: 'suy', src: c.p.sid, s: st.id, pg: Math.min(99, Math.round(st.pg)), ...extra });
}

/** Vào ải: hồi đầy (ải nào cũng bắt đầu ngang nhau, nên vào tiếp từ ải dở không thiệt), đặt tâm, mở thanh. */
export function begin(c: TribMechCtx, id: string): { st: SuyState; cfg: TribSuy } | null {
  const cfg = c.phase.suy;
  if (!cfg) return null;
  c.host.refill(c.p);
  const st: SuyState = {
    id,
    pg: cfg.start,
    x: c.p.move.x,
    z: c.p.move.z,
    last: c.now,
    restUntil: c.now + cfg.rest * 1000,
    sendAt: c.now + 500,
    failed: false,
  };
  (c.tr.mech ??= {}).suy = st;
  c.host.fx({ t: 'suy', src: c.p.sid, s: id, pg: Math.round(st.pg), n: 0, d: cfg.rest, x: st.x, z: st.z });
  c.host.sys(c.p, 'sys.' + id + '_start', undefined, 'info');
  return { st, cfg };
}

export function fail(host: TribHost, p: PlayerEnt, st: SuyState): void {
  if (st.failed) return;
  st.failed = true;
  st.pg = 100;
  host.fx({ t: 'suy', src: p.sid, s: st.id, pg: 100 });
  host.sys(p, st.id.startsWith('hk_') ? 'sys.hk_fail' : 'sys.suy_fail', undefined, 'bad');
  host.end(p, false);
}

/**
 * Bước chung của thanh trong một tick: thanh tự tăng theo tiến độ ải cộng `extra` %/giây của cơ chế (âm = đang hóa giải).
 * Trả `dt` (giây) đã trôi, hoặc -1 nếu ải vừa thất bại / người đã chết / còn điều tức (cơ chế không làm gì thêm).
 */
export function step(c: TribMechCtx, st: SuyState, cfg: TribSuy, extra: number): number {
  const dt = Math.min(0.25, Math.max(0, (c.now - st.last) / 1000));
  st.last = c.now;
  if ((c.p.s.fl & PF_DEAD) !== 0 || st.failed) return -1;
  if (c.now < st.restUntil) return -1;
  st.pg = stepSuy(st.pg, dt, suyRise(cfg, suyProgress(c.def, c.phaseIdx, c.elapsed)) + extra);
  if (st.pg >= 100) {
    fail(c.host, c.p, st);
    return -1;
  }
  return dt;
}

export function tickBar(c: TribMechCtx, st: SuyState, extra?: { n?: number; d?: number }): void {
  if (st.failed || c.now < st.sendAt) return;
  st.sendAt = c.now + 500;
  sendBar(c, st, extra);
}

/** Thoát ải (hết giờ của pha): khép thanh; chưa thất bại và còn sống thì ải này đã qua. */
export function finish(c: TribMechCtx): void {
  const st = c.tr.mech?.suy as SuyState | undefined;
  if (!st) return;
  delete c.tr.mech!.suy;
  c.host.fx({ t: 'suy', src: c.p.sid, s: st.id, pg: -1 });
  if (!st.failed && (c.p.s.fl & PF_DEAD) === 0) c.host.suyCleared(c.p, c.phaseIdx);
}

// ---------- suy_linh: Linh Lực Suy ----------

function openSpring(c: TribMechCtx, st: LinhState, cfg: TribSuy): void {
  const l = cfg.linh!;
  // Linh Nhãn mới lệch ít nhất một phần tư vòng so với chỗ cũ: luôn phải bỏ chỗ đang đứng mà đi.
  st.ang = (st.ang + Math.PI / 2 + Math.random() * Math.PI) % (Math.PI * 2);
  st.sx = st.x + Math.sin(st.ang) * l.ring;
  st.sz = st.z + Math.cos(st.ang) * l.ring;
  const life = suyLerp(l.life, l.lifeEnd, suyProgress(c.def, c.phaseIdx, c.elapsed));
  st.until = c.now + life * 1000;
  c.host.fx({ t: 'suymark', src: c.p.sid, s: 'nhan', n: 0, x: st.sx, z: st.sz, r: l.r, d: life, pg: 1 });
}

registerMechanic('suy_linh', {
  enter(c) {
    const b = begin(c, 'suy_linh');
    if (!b?.cfg.linh) return;
    const st = b.st as LinhState;
    st.ang = Math.random() * Math.PI * 2;
    openSpring(c, st, b.cfg);
  },
  tick(c) {
    const cfg = c.phase.suy;
    const st = stateOf<LinhState>(c.tr, 'suy_linh');
    const l = cfg?.linh;
    if (!cfg || !l || !st) return;
    if (c.now >= st.until && (c.p.s.fl & PF_DEAD) === 0) openSpring(c, st, cfg);
    const inside = near(c.p, st.sx, st.sz, l.r);
    const dt = step(c, st, cfg, inside ? -l.cure : 0);
    if (dt < 0) return tickBar(c, st);
    // Linh lực khô dần theo thanh (không phải sát thương): thanh càng cao càng khó ra chiêu.
    c.host.drainMp(c.p, c.p.char.mmp * l.drain * (st.pg / 100) * dt);
    tickBar(c, st);
  },
  exit(c) {
    c.host.fx({ t: 'suymark', src: c.p.sid, s: 'nhan', n: 0, pg: 0 });
    finish(c);
  },
});

// ---------- suy_the: Nhục Thân Suy ----------

registerMechanic('suy_the', {
  enter(c) {
    const b = begin(c, 'suy_the');
    if (!b?.cfg.the) return;
    const st = b.st as TheState;
    st.nextAt = st.restUntil;
    st.bleedAt = st.restUntil + 1000;
    st.pend = null;
  },
  tick(c) {
    const cfg = c.phase.suy;
    const st = stateOf<TheState>(c.tr, 'suy_the');
    const t = cfg?.the;
    if (!cfg || !t || !st) return;
    const dt = step(c, st, cfg, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    if (st.pend && c.now >= st.pend.at) {
      const hit = near(p, st.pend.x, st.pend.z, t.r);
      c.host.fx({ t: 'suymark', src: p.sid, s: 'toi', n: 0, x: st.pend.x, z: st.pend.z, r: t.r, pg: hit ? 2 : 0 });
      st.pend = null;
      if (hit) {
        // Đón tia tôi thể: suy khí tan một mảng, đổi bằng khí huyết (không chết vì tia này).
        st.pg = bumpSuy(st.pg, -t.cure);
        c.host.sap(p, Math.min(p.char.mhp * t.cost, p.char.hp - 1));
      }
    }
    if (!st.pend && c.now >= st.nextAt) {
      st.nextAt = c.now + t.every * 1000;
      const a = Math.random() * Math.PI * 2;
      st.pend = { x: p.move.x + Math.sin(a) * t.dist, z: p.move.z + Math.cos(a) * t.dist, at: c.now + t.warn * 1000 };
      c.host.fx({ t: 'suymark', src: p.sid, s: 'toi', n: 0, x: st.pend.x, z: st.pend.z, r: t.r, d: t.warn, pg: 1 });
    }
    if (c.now >= st.bleedAt) {
      st.bleedAt = c.now + 1000;
      c.host.sap(p, p.char.mhp * t.bleed * (st.pg / 100));
      if (c.p.trib !== c.tr) return;
    }
    tickBar(c, st);
  },
  exit(c) {
    finish(c);
  },
});

// ---------- suy_thuc: Thần Thức Suy ----------

/** Soi đợt lôi ẩn đang chờ: gửi vạch báo (không sát thương) cho các cung sắp nổ. */
function showWave(host: TribHost, p: PlayerEnt, st: ThucState, cfg: TribSuy, now: number): void {
  const t = cfg.thuc!;
  const pend = st.pend!;
  pend.shown = true;
  const left = Math.max(0.05, (pend.at - now) / 1000);
  for (let i = 0; i < t.sectors; i++) {
    if ((pend.mask & (1 << i)) === 0) continue;
    host.addHazard(
      { x: st.x, z: st.z, r: t.r, sh: 'cone', yaw: suySectorYaw(i, t.sectors), w: Math.PI / t.sectors },
      left,
      0,
      false,
      'spirit',
      '',
    );
  }
  host.fx({ t: 'suymark', src: p.sid, s: 'thuc', n: pend.mask, lv: t.sectors, x: st.x, z: st.z, r: t.r, d: left, pg: 1 });
}

/**
 * Ngưng thần (phím X) trong ải Thần Thức Suy: soi đợt lôi ẩn đang chờ. Không có đợt nào đang chờ thì ngưng thần uổng (vẫn tính hồi chiêu).
 * Trả true nếu đã ngưng thần. Chỉ hợp lệ với chủ kiếp còn sống, đúng ải, hết hồi chiêu.
 */
export function suyReveal(host: TribHost, p: PlayerEnt): boolean {
  const tr = p.trib;
  if (!tr || (p.s.fl & PF_DEAD) !== 0) return false;
  const ph = tribDef(tr.id).phases[tr.pi ?? -1];
  const cfg = ph?.suy;
  const st = stateOf<ThucState>(tr, 'suy_thuc');
  const now = host.now();
  if (!cfg?.thuc || ph?.mechanic !== 'suy_thuc' || !st || st.failed || now < st.restUntil || now < st.cdUntil) return false;
  const cd = suyRevealCd(cfg.thuc, st.pg);
  st.cdUntil = now + cd * 1000;
  if (st.pend && !st.pend.shown) showWave(host, p, st, cfg, now);
  else host.fx({ t: 'suymark', src: p.sid, s: 'thuc', x: st.x, z: st.z, r: cfg.thuc.r, pg: 2 });
  host.fx({ t: 'suyreveal', src: p.sid, d: cd });
  return true;
}

registerMechanic('suy_thuc', {
  enter(c) {
    const b = begin(c, 'suy_thuc');
    if (!b?.cfg.thuc) return;
    const st = b.st as ThucState;
    st.waveAt = st.restUntil;
    st.pend = null;
    st.cdUntil = 0;
  },
  tick(c) {
    const cfg = c.phase.suy;
    const st = stateOf<ThucState>(c.tr, 'suy_thuc');
    const t = cfg?.thuc;
    if (!cfg || !t || !st) return;
    const dt = step(c, st, cfg, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    if (st.pend && c.now >= st.pend.at) {
      const mask = st.pend.mask;
      st.pend = null;
      c.host.fx({ t: 'suymark', src: p.sid, s: 'thuc', n: mask, lv: t.sectors, x: st.x, z: st.z, r: t.r, pg: 0 });
      if (suyThucHit(st, t, mask, p.move.x, p.move.z)) {
        st.pg = bumpSuy(st.pg, t.hurt);
        c.host.damage(p, p.char.mhp * t.pct);
        if (c.p.trib !== c.tr) return;
        if (st.pg >= 100) return fail(c.host, p, st);
      } else {
        st.pg = bumpSuy(st.pg, -t.cure);
      }
    }
    if (!st.pend && c.now >= st.waveAt) {
      st.waveAt = c.now + t.every * 1000;
      st.pend = { mask: suyThucWave(t.sectors, t.safe, Math.random), at: c.now + t.warn * 1000, shown: false };
      // Chỉ báo "có đợt lôi ẩn đang tụ" (không lộ cung nào nổ): thần thức đã suy, phải ngưng thần mới thấy.
      c.host.fx({ t: 'suymark', src: p.sid, s: 'thuc', x: st.x, z: st.z, r: t.r, d: t.warn, pg: 3 });
    }
    tickBar(c, st);
  },
  exit(c) {
    finish(c);
  },
});

// ---------- suy_tho: Thọ Nguyên Suy ----------

function lampFx(c: TribMechCtx, st: ThoState, cfg: TribSuy, i: number, pg: number, d?: number): void {
  const t = cfg.tho!;
  const pos = suyRingPos(st, t.ring, i, t.lamps);
  c.host.fx({ t: 'suymark', src: c.p.sid, s: 'den', n: i, x: pos.x, z: pos.z, r: t.r, pg, ...(d !== undefined ? { d } : {}) });
}

registerMechanic('suy_tho', {
  enter(c) {
    const b = begin(c, 'suy_tho');
    const t = b?.cfg.tho;
    if (!b || !t) return;
    const st = b.st as ThoState;
    st.lit = Array.from({ length: t.lamps }, () => true);
    st.gustAt = st.restUntil;
    st.pend = null;
    st.hold = null;
    for (let i = 0; i < t.lamps; i++) lampFx(c, st, b.cfg, i, 1);
  },
  tick(c) {
    const cfg = c.phase.suy;
    const st = stateOf<ThoState>(c.tr, 'suy_tho');
    const t = cfg?.tho;
    if (!cfg || !t || !st) return;
    const unlit = st.lit.filter((v) => !v).length;
    const dt = step(c, st, cfg, unlit > 0 ? unlit * t.per : -t.cure);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    // Suy phong thổi tắt ngọn đã nhắm.
    if (st.pend && c.now >= st.pend.at) {
      const i = st.pend.i;
      st.pend = null;
      if (st.lit[i]) {
        st.lit[i] = false;
        lampFx(c, st, cfg, i, 0);
        if (st.hold?.i === i) st.hold = null;
        if (st.lit.every((v) => !v)) return fail(c.host, p, st);
      }
    }
    if (!st.pend && c.now >= st.gustAt) {
      st.gustAt = c.now + suyLerp(t.gust, t.gustEnd, suyProgress(c.def, c.phaseIdx, c.elapsed)) * 1000;
      const litIdx = st.lit.flatMap((v, i) => (v ? [i] : []));
      if (litIdx.length > 0) {
        const i = litIdx[Math.min(litIdx.length - 1, Math.floor(Math.random() * litIdx.length))]!;
        st.pend = { i, at: c.now + t.warn * 1000 };
        lampFx(c, st, cfg, i, 2, t.warn);
      }
    }
    // Thắp lại: đứng liền `light` giây trong tầm một ngọn đã tắt (rời ra là mất công).
    let at = -1;
    for (let i = 0; i < t.lamps && at < 0; i++) {
      if (st.lit[i]) continue;
      const pos = suyRingPos(st, t.ring, i, t.lamps);
      if (near(p, pos.x, pos.z, t.r)) at = i;
    }
    if (at < 0) {
      if (st.hold) {
        if (!st.lit[st.hold.i]) lampFx(c, st, cfg, st.hold.i, 0);
        st.hold = null;
      }
    } else if (st.hold?.i !== at) {
      st.hold = { i: at, since: c.now };
      lampFx(c, st, cfg, at, 3, t.light);
    } else if (c.now - st.hold.since >= t.light * 1000) {
      st.lit[at] = true;
      st.hold = null;
      lampFx(c, st, cfg, at, 1);
    }
    tickBar(c, st);
  },
  exit(c) {
    c.host.fx({ t: 'suymark', src: c.p.sid, s: 'den', n: -1, pg: 0 });
    finish(c);
  },
});

// ---------- suy_tam: Đạo Tâm Suy ----------

export function dropVongAnh(host: TribHost, p: PlayerEnt): void {
  for (let guard = 0; guard < 8; guard++) {
    const m = host.shadowOf(p);
    if (!m) return;
    host.removeMonster(m);
  }
}

registerMechanic('suy_tam', {
  enter(c) {
    const b = begin(c, 'suy_tam');
    const t = b?.cfg.tam;
    if (!b || !t) return;
    const st = b.st as TamState;
    st.mode = 0;
    st.modeUntil = st.restUntil + t.calm * 1000;
    st.graceUntil = 0;
    st.struck = false;
    st.spawnAt = st.restUntil;
  },
  tick(c) {
    const cfg = c.phase.suy;
    const st = stateOf<TamState>(c.tr, 'suy_tam');
    const t = cfg?.tam;
    if (!cfg || !t || !st) return;
    const dt = step(c, st, cfg, 0);
    if (dt < 0) return tickBar(c, st, { n: st.mode });
    const p = c.p;
    if (!c.host.shadowOf(p) && c.now >= st.spawnAt) {
      st.spawnAt = c.now + 3000;
      const ch = p.char;
      const base = shadowStats(ch.level, ch.atk, ch.def);
      c.host.spawnShadow(p, { hp: Math.max(1, Math.round(ch.mhp * t.hpFrac)), atk: base.atk, def: base.def }, { level: ch.level });
    }
    if (c.now >= st.modeUntil) {
      if (st.mode === 1) {
        st.graceUntil = c.now + TAM_GRACE_MS;
        if (!st.struck) {
          st.pg = bumpSuy(st.pg, t.miss);
          c.host.fx({ t: 'suymark', src: p.sid, s: 'tam', pg: 2 });
          if (st.pg >= 100) return fail(c.host, p, st);
        }
      }
      st.mode = st.mode === 1 ? 0 : 1;
      st.struck = false;
      const len = st.mode === 1 ? t.strike : t.calm;
      st.modeUntil = c.now + len * 1000;
      st.sendAt = c.now + 500;
      sendBar(c, st, { n: st.mode, d: len });
      return;
    }
    tickBar(c, st, { n: st.mode });
  },
  exit(c) {
    dropVongAnh(c.host, c.p);
    finish(c);
  },
});

/**
 * Va chạm giữa chủ kiếp và Tâm Ma Ảnh trong ải Đạo Tâm Suy. `hurt`: bị bóng đánh trúng. `hit`: đánh trúng bóng (đúng nhịp phá vọng thì hóa giải, lúc tĩnh là động niệm).
 * Sát thương rỉ theo thời gian (`dot`) không tính là ra tay.
 */
export function suyTamHit(host: TribHost, p: PlayerEnt, kind: 'hurt' | 'hit', dot = false): void {
  const tr = p.trib;
  const st = stateOf<TamState>(tr, 'suy_tam');
  const t = tr ? tribDef(tr.id).phases[tr.pi ?? -1]?.suy?.tam : undefined;
  if (!tr || !st || !t || st.failed) return;
  const now = host.now();
  if (now < st.restUntil) return;
  if (kind === 'hurt') st.pg = bumpSuy(st.pg, t.hurt);
  else if (dot) return;
  else if (st.mode === 1) {
    if (st.struck) return;
    st.struck = true;
    st.pg = bumpSuy(st.pg, -t.hitGood);
    host.fx({ t: 'suymark', src: p.sid, s: 'tam', pg: 1 });
  } else if (now >= st.graceUntil) {
    st.pg = bumpSuy(st.pg, t.hitBad);
    host.fx({ t: 'suymark', src: p.sid, s: 'tam', pg: 0 });
  } else return;
  if (st.pg >= 100 && (p.s.fl & PF_DEAD) === 0) fail(host, p, st);
}

/** Dọn thứ ải suy để lại trong sim khi kiếp kết thúc giữa chừng (Tâm Ma Ảnh). */
export function suyCleanup(host: TribHost, p: PlayerEnt): void {
  const st = p.trib?.mech?.suy as SuyState | undefined;
  if (!st) return;
  if (st.id === 'suy_tam' || st.id === 'hk_huyet_anh') dropVongAnh(host, p);
  host.fx({ t: 'suy', src: p.sid, s: st.id, pg: -1 });
}

/** Ải (0-based) đang chạy của kiếp chuỗi, hoặc -1. Để test và GM đọc. */
export function suyStageOf(tr: TribState | null | undefined): number {
  const st = tr?.mech?.suy as SuyState | undefined;
  return st && isSuyMechanic(st.id) ? (tr?.pi ?? -1) : -1;
}

/** Giây còn lại của ải đang chạy (để test). */
export function suyStageLeft(tr: TribState, now: number): number {
  const def = tribDef(tr.id);
  const elapsed = def.duration - (tr.endAt - now) / 1000;
  const pi = tr.pi ?? 0;
  return (def.phases[pi]?.end ?? def.duration) - Math.max(elapsed, tribPhaseStart(def, pi));
}

// Ba cơ chế kiếp chương 6 (TN-3) của `tribmech.ts`. Server giữ mọi trạng thái và quyết định mọi thứ; client chỉ đi lại và dùng chiêu bình thường
// (không có tin nhắn mới) rồi vẽ dấu từ FX `kcmark` (chỉ là hình). Luật dùng chung ở packages/shared/src/kiepch6.ts.
//
//   hoi_dao    Vấn Đỉnh Kiếp: hỏi đạo. Dấu giữa sân có 1–3 vành, ba Đạo Môn mang 1–3 vành khác nhau; hết giờ đứng đúng cổng cùng số vành thì hồi, sai thì mất khí huyết.
//   am_lan     Âm Hư Kiếp: âm vực nảy mầm rồi lan dần; đứng trong vực (đã hết giai đoạn mầm) thì bị bào mỗi nhịp, nhiều vực chồng nhau không cộng dồn.
//   duong_dap  Dương Thực Kiếp: đòn nhịp nung cả sân giáng chủ kiếp (không né bằng chỗ đứng); dùng chiêu trong cửa sổ cuối là phản đòn (giảm đòn, hồi khí huyết).
//
// Tâm sân là chỗ người độ kiếp đứng lúc pha bắt đầu (cùng quy ước `ngu_hanh`). Mọi lần ngẫu nhiên lấy từ `st.rng` (seed theo nhân vật + giờ kiếp) để test tất định.

import {
  PF_DEAD,
  amInside,
  amPoolHurts,
  dapDamage,
  dapParryOk,
  gatePos,
  hoiDaoAnswer,
  hoiDaoGateAt,
  hoiDaoRound,
  packGates,
  seededRng,
  tribDef,
  type AmPool,
  type HoiDaoRound,
  type TribAmLan,
  type TribDuongDap,
} from '@dtl/shared';
import type { PlayerEnt } from './entities';
import type { TribHost } from './tribhost';
import type { TribState } from './tribtypes';
import { registerMechanic, type TribMechCtx } from './tribmech';

type Rng = () => number;

/** FX dấu trên sân: `s` = hd (hỏi đạo) | am (âm vực) | dt (đòn nhịp). Chỉ là hình. */
function mark(
  host: TribHost,
  p: PlayerEnt,
  s: 'hd' | 'am' | 'dt',
  m: { n?: number; x?: number; z?: number; r?: number; d?: number; pg: number; lv?: number },
): void {
  host.fx({ t: 'kcmark', src: p.sid, s, ...m });
}

function seedOf(p: PlayerEnt, tr: TribState): number {
  let h = 2166136261;
  for (const ch of `${p.char.id}:${tr.endAt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- hoi_dao ----------

export interface HoiDaoState {
  x: number;
  z: number;
  rng: Rng;
  /** Số vòng đã hỏi xong, mốc bắt đầu hỏi vòng kế (ms). */
  n: number;
  nextAt: number;
  /** Vòng đang chờ trả lời và mốc chốt đáp án (ms). */
  round: HoiDaoRound | null;
  deadline: number;
  right: number;
  wrong: number;
}

export function hoiDaoOf(tr: TribState | null | undefined): HoiDaoState | undefined {
  return tr?.mech?.hoi_dao as HoiDaoState | undefined;
}

registerMechanic('hoi_dao', {
  enter(c) {
    const cfg = c.phase.hoiDao;
    if (!cfg) return;
    const st: HoiDaoState = {
      x: c.p.move.x,
      z: c.p.move.z,
      rng: seededRng(seedOf(c.p, c.tr)),
      n: 0,
      nextAt: c.now + cfg.first * 1000,
      round: null,
      deadline: 0,
      right: 0,
      wrong: 0,
    };
    (c.tr.mech ??= {}).hoi_dao = st;
    c.host.sys(c.p, 'sys.hoi_dao_start', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.hoiDao;
    const st = hoiDaoOf(c.tr);
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    if (st.round) {
      if (c.now >= st.deadline) resolveRound(c, st);
      return;
    }
    if (st.n >= cfg.rounds || c.now < st.nextAt) return;
    // Còn đủ thời gian trong pha để chốt vòng này thì mới hỏi (không để câu hỏi treo qua pha sau).
    if (c.phase.end - c.elapsed < cfg.ask + 0.2) return;
    const round = hoiDaoRound(st.rng(), st.rng(), st.rng());
    st.round = round;
    st.deadline = c.now + cfg.ask * 1000;
    mark(c.host, c.p, 'hd', { n: round.mark, x: st.x, z: st.z, r: cfg.ring, d: cfg.ask, pg: 1, lv: packGates(round.gates) });
    c.host.sys(c.p, 'sys.hoi_dao_ask', { n: round.mark, sec: cfg.ask }, 'info');
  },
  exit(c) {
    const st = hoiDaoOf(c.tr);
    if (st) st.round = null;
  },
});

function resolveRound(c: TribMechCtx, st: HoiDaoState): void {
  const cfg = c.phase.hoiDao!;
  const round = st.round!;
  st.round = null;
  st.n++;
  st.nextAt = c.now + cfg.rest * 1000;
  const at = hoiDaoGateAt(st, cfg, c.p.move.x, c.p.move.z);
  const ok = at >= 0 && at === hoiDaoAnswer(round);
  const g = gatePos(st, cfg.ring, hoiDaoAnswer(round));
  mark(c.host, c.p, 'hd', { n: round.mark, x: g.x, z: g.z, r: cfg.gateR, pg: ok ? 2 : 3, lv: packGates(round.gates) });
  if (ok) {
    st.right++;
    c.host.heal(c.p, c.p.char.mhp * cfg.heal);
    c.host.sys(c.p, 'sys.hoi_dao_ok', undefined, 'good');
  } else {
    st.wrong++;
    c.host.damage(c.p, c.p.char.mhp * cfg.pct);
    c.host.sys(c.p, 'sys.hoi_dao_bad', undefined, 'bad');
  }
}

// ---------- am_lan ----------

export interface AmLanState {
  x: number;
  z: number;
  rng: Rng;
  pools: (AmPool & { id: number })[];
  nextAt: number;
  hurtAt: number;
  ids: number;
  /** Số lần bào (cho test và nhật ký). */
  hits: number;
}

export function amLanOf(tr: TribState | null | undefined): AmLanState | undefined {
  return tr?.mech?.am_lan as AmLanState | undefined;
}

registerMechanic('am_lan', {
  enter(c) {
    const cfg = c.phase.amLan;
    if (!cfg) return;
    const st: AmLanState = {
      x: c.p.move.x,
      z: c.p.move.z,
      rng: seededRng(seedOf(c.p, c.tr) ^ 0x9e3779b9),
      pools: [],
      nextAt: c.now + cfg.first * 1000,
      hurtAt: c.now,
      ids: 0,
      hits: 0,
    };
    (c.tr.mech ??= {}).am_lan = st;
    c.host.sys(c.p, 'sys.am_lan_start', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.amLan;
    const st = amLanOf(c.tr);
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    // Vực đã tan: bỏ và báo client dọn.
    const life = (cfg.seed + cfg.grow + cfg.hold) * 1000;
    const live = st.pools.filter((p) => c.now - p.at <= life);
    for (const gone of st.pools.filter((p) => !live.includes(p))) mark(c.host, c.p, 'am', { n: gone.id, x: gone.x, z: gone.z, pg: 3 });
    st.pools = live;
    if (c.now >= st.nextAt) {
      st.nextAt = c.now + cfg.every * 1000;
      if (st.pools.length < cfg.max) spawnPool(c, st, cfg);
    }
    // Mỗi `tick` giây bào MỘT lần nếu đứng trong ít nhất một vực đang gây hại (không cộng dồn theo số vực).
    if (c.now - st.hurtAt >= cfg.tick * 1000) {
      st.hurtAt = c.now;
      if (amInside(cfg, st.pools, c.now, c.p.move.x, c.p.move.z)) {
        st.hits++;
        c.host.sap(c.p, c.p.char.mhp * cfg.dps * cfg.tick);
      }
    }
  },
  exit(c) {
    const st = amLanOf(c.tr);
    if (!st) return;
    for (const p of st.pools) mark(c.host, c.p, 'am', { n: p.id, x: p.x, z: p.z, pg: 3 });
    st.pools = [];
  },
});

function spawnPool(c: TribMechCtx, st: AmLanState, cfg: TribAmLan): void {
  // Chỗ ngẫu nhiên trong vòng sân, cách người độ kiếp ít nhất `keep` m (thử vài lần, không được thì bỏ lượt).
  for (let i = 0; i < 8; i++) {
    const a = st.rng() * Math.PI * 2;
    const d = Math.sqrt(st.rng()) * cfg.ring;
    const x = st.x + Math.sin(a) * d;
    const z = st.z + Math.cos(a) * d;
    if (Math.hypot(x - c.p.move.x, z - c.p.move.z) < cfg.keep + cfg.r0) continue;
    const id = st.ids++;
    st.pools.push({ id, x, z, at: c.now });
    mark(c.host, c.p, 'am', { n: id, x, z, r: cfg.r1, d: cfg.seed + cfg.grow + cfg.hold, pg: 1 });
    return;
  }
}

/** Số vực đang gây hại (cho test). */
export function amHurting(st: AmLanState, cfg: TribAmLan, now: number): number {
  return st.pools.filter((p) => amPoolHurts(cfg, now - p.at)).length;
}

// ---------- duong_dap ----------

export interface DuongDapState {
  /** Tâm sân (chỉ để vẽ). */
  x: number;
  z: number;
  /** Số đòn nhịp đã phát, mốc phát đòn kế và đòn đang ủ. */
  n: number;
  nextAt: number;
  beat: { impactAt: number; parried: boolean; open: boolean } | null;
  parries: number;
  taken: number;
}

export function duongDapOf(tr: TribState | null | undefined): DuongDapState | undefined {
  return tr?.mech?.duong_dap as DuongDapState | undefined;
}

registerMechanic('duong_dap', {
  enter(c) {
    const cfg = c.phase.duongDap;
    if (!cfg) return;
    const st: DuongDapState = { x: c.p.move.x, z: c.p.move.z, n: 0, nextAt: c.now + cfg.first * 1000, beat: null, parries: 0, taken: 0 };
    (c.tr.mech ??= {}).duong_dap = st;
    c.host.sys(c.p, 'sys.duong_dap_start', undefined, 'info');
  },
  tick(c) {
    const cfg = c.phase.duongDap;
    const st = duongDapOf(c.tr);
    if (!cfg || !st || (c.p.s.fl & PF_DEAD) !== 0) return;
    const b = st.beat;
    if (b) {
      // Cửa sổ phản đòn mở: báo một lần.
      if (!b.open && c.now >= b.impactAt - cfg.win * 1000) {
        b.open = true;
        mark(c.host, c.p, 'dt', { x: c.p.move.x, z: c.p.move.z, d: cfg.win, pg: 2 });
        c.host.sys(c.p, 'sys.duong_dap_now', undefined, 'info');
      }
      if (c.now >= b.impactAt) land(c, st, cfg, b.parried);
      return;
    }
    // Chỉ ủ đòn nếu kịp giáng trong pha (không để đòn treo qua pha sau).
    if (c.now < st.nextAt || c.phase.end - c.elapsed < cfg.windup + 0.2) return;
    st.n++;
    st.nextAt = c.now + cfg.every * 1000;
    st.beat = { impactAt: c.now + cfg.windup * 1000, parried: false, open: false };
    mark(c.host, c.p, 'dt', { n: st.n, x: st.x, z: st.z, r: 12, d: cfg.windup, pg: 1 });
    c.host.sys(c.p, 'sys.duong_dap_wind', { sec: cfg.windup }, 'bad');
  },
  exit(c) {
    const st = duongDapOf(c.tr);
    if (st) st.beat = null;
  },
});

function land(c: TribMechCtx, st: DuongDapState, cfg: TribDuongDap, parried: boolean): void {
  st.beat = null;
  const dmg = dapDamage(cfg, c.p.char.mhp, parried);
  st.taken += dmg;
  mark(c.host, c.p, 'dt', { x: c.p.move.x, z: c.p.move.z, pg: parried ? 4 : 3 });
  c.host.damage(c.p, dmg);
  if (c.p.trib !== c.tr) return; // đòn đã kết thúc kiếp (chết)
  if (parried) {
    st.parries++;
    c.host.heal(c.p, c.p.char.mhp * cfg.heal);
    c.host.sys(c.p, 'sys.duong_dap_parry', undefined, 'good');
  } else c.host.sys(c.p, 'sys.duong_dap_hit', undefined, 'bad');
}

/**
 * Người độ kiếp vừa dùng một chiêu (server đã chấp nhận chiêu đó: đủ linh lực, hết hồi chiêu, không choáng). Trong cửa sổ cuối của đòn nhịp thì là phản đòn.
 * Dùng chiêu sớm hơn cửa sổ không tính; dùng nhiều lần trong cửa sổ cũng chỉ phản đòn một lần. Trả true nếu vừa phản đòn.
 */
export function duongDapSkill(host: TribHost, p: PlayerEnt, tr: TribState): boolean {
  const b = duongDapOf(tr)?.beat;
  const cfg = tribDef(tr.id).phases.find((ph) => ph.duongDap)?.duongDap;
  if (!b || b.parried || !cfg || !dapParryOk(cfg, b.impactAt, host.now())) return false;
  b.parried = true;
  mark(host, p, 'dt', { x: p.move.x, z: p.move.z, pg: 5 });
  return true;
}

// Huyền Kiếp (TN-6): chín cơ chế `hk_*` của `tribmech.ts`, mỗi cơ chế là một kiếp nhỏ của ba kiếp chuỗi `huyen_ngoai|huyen_noi|huyen_hon`.
// Dùng lại khung thanh 0..100 của Ngũ Suy (`tribsuy.ts`: begin/step/finish, trạng thái ở `tr.mech.suy`, FX `suy` cho thanh, lưu tiến độ qua
// `host.suyCleared`). Dấu trên sân gửi bằng FX `hkmark` (chỉ là hình). Thông số từng cơ chế: `phase.hk`, ý nghĩa ở packages/shared/src/huyenkiep.ts.
//
//  Ngoại kiếp  · Tuyết: không được đứng yên, tránh đụn tuyết.      · Phong: nấp sau trụ theo hướng gió.        · Lôi: xả lôi lực vào Dẫn Lôi Trụ rồi tránh trụ nổ.
//  Nội kiếp    · Trảm Ly: giữ mình trong vòng ấn giữa các nhát chém. · Huyết Ảnh: hạ Huyết Ảnh thật nhanh.       · Vấn Tâm: nhớ ấn thật sau khi các ấn đổi chỗ.
//  Hồn kiếp    · Thập Tức Khô Thần: điều tức (X) đúng mười nhịp.    · Hồn Thọ: nhặt Hồn Châu trước khi tan.     · Luân Hồi: bám theo cung sinh đang xoay.
//
// Thao tác của người chơi chỉ là di chuyển, đòn đánh và phím X (C.TRIB_SOUL, đã qua `rateOk`): không tin giá trị nào từ client.

import {
  PF_DEAD,
  bumpSuy,
  hkInRect,
  hkLuanAngle,
  hkLuanSafe,
  hkRingPos,
  hkSealAfter,
  hkSheltered,
  shadowStats,
  tribDef,
  type FxMsg,
} from '@dtl/shared';
import type { PlayerEnt } from './entities';
import type { TribHost } from './tribhost';
import { begin, dropVongAnh, fail, finish, near, stateOf, step, tickBar, type SuyState } from './tribsuy';
import { registerMechanic, type TribMechCtx } from './tribmech';

type Hk = Record<string, number>;

function mark(c: { host: TribHost; p: PlayerEnt }, s: string, m: Omit<FxMsg, 't' | 'src' | 's'>): void {
  c.host.fx({ t: 'hkmark', src: c.p.sid, s, ...m });
}

/** Vào kiếp nhỏ `id`; trả trạng thái chung + thông số riêng, hoặc null nếu dữ liệu thiếu. */
function open<T extends SuyState>(c: TribMechCtx, id: string): { st: T; k: Hk } | null {
  const k = c.phase.hk;
  const b = k ? begin(c, id) : null;
  return b && k ? { st: b.st as T, k } : null;
}

/** Trạng thái + thông số của kiếp nhỏ `id` đang chạy. */
function cur<T extends SuyState>(c: TribMechCtx, id: string): { st: T; k: Hk } | null {
  const st = stateOf<T>(c.tr, id as T['id']);
  const k = c.phase.hk;
  return st && k && c.phase.suy ? { st, k } : null;
}

/** Trúng đòn của kiếp: thanh tăng `hurt`, mất `pct` khí huyết tối đa; trả false nếu kiếp đã kết thúc vì thế. */
function punish(c: TribMechCtx, st: SuyState, hurt: number, pct: number): boolean {
  st.pg = bumpSuy(st.pg, hurt);
  if (pct > 0) c.host.damage(c.p, c.p.char.mhp * pct);
  if (c.p.trib !== c.tr) return false;
  if (st.pg >= 100) {
    fail(c.host, c.p, st);
    return false;
  }
  return true;
}

// ---------- hk_tuyet: Tuyết Kiếp ----------

interface TuyetState extends SuyState {
  lx: number;
  lz: number;
  driftAt: number;
  slot: number;
  drifts: { x: number; z: number; until: number }[];
}

registerMechanic('hk_tuyet', {
  enter(c) {
    const o = open<TuyetState>(c, 'hk_tuyet');
    if (!o) return;
    o.st.lx = c.p.move.x;
    o.st.lz = c.p.move.z;
    o.st.driftAt = o.st.restUntil;
    o.st.slot = 0;
    o.st.drifts = [];
    mark(c, 'tuyet', { n: -1, x: o.st.x, z: o.st.z, r: o.k.r, pg: 1 });
  },
  tick(c) {
    const o = cur<TuyetState>(c, 'hk_tuyet');
    if (!o) return;
    const { st, k } = o;
    const p = c.p;
    const dtRaw = Math.min(0.25, Math.max(0.001, (c.now - st.last) / 1000));
    const speed = Math.hypot(p.move.x - st.lx, p.move.z - st.lz) / dtRaw;
    st.lx = p.move.x;
    st.lz = p.move.z;
    st.drifts = st.drifts.filter((d) => c.now < d.until);
    const inField = near(p, st.x, st.z, k.r!);
    const moving = inField && speed >= k.still!;
    const inDrift = st.drifts.some((d) => near(p, d.x, d.z, k.driftR!));
    const dt = step(c, st, c.phase.suy!, (moving ? -k.cure! : k.cold!) + (inDrift ? k.driftHurt! : 0));
    if (dt < 0) return tickBar(c, st);
    if (c.now >= st.driftAt && st.drifts.length < k.drifts!) {
      st.driftAt = c.now + k.driftEvery! * 1000;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * k.ring!;
      const d = { x: st.x + Math.sin(a) * rr, z: st.z + Math.cos(a) * rr, until: c.now + (1.2 + k.driftDur!) * 1000 };
      // Đụn tuyết đọng sau 1,2 giây báo (vũng sương, không sát thương): giẫm vào thì hàn khí tăng.
      st.drifts.push(d);
      mark(c, 'tuyet', { n: st.slot++ % 8, x: d.x, z: d.z, r: k.driftR, d: k.driftDur! + 1.2, pg: 2 });
    }
    tickBar(c, st, { n: moving ? 1 : 0 });
  },
  exit(c) {
    mark(c, 'tuyet', { n: -1, pg: 0 });
    finish(c);
  },
});

// ---------- hk_phong: Phong Kiếp ----------

interface PhongState extends SuyState {
  gustAt: number;
  pend: { dx: number; dz: number; at: number } | null;
}

registerMechanic('hk_phong', {
  enter(c) {
    const o = open<PhongState>(c, 'hk_phong');
    if (!o) return;
    o.st.gustAt = o.st.restUntil;
    o.st.pend = null;
    mark(c, 'phong', { n: o.k.pillars, x: o.st.x, z: o.st.z, r: o.k.ring, pg: 1 });
  },
  tick(c) {
    const o = cur<PhongState>(c, 'hk_phong');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    if (st.pend && c.now >= st.pend.at) {
      const g = st.pend;
      st.pend = null;
      let ok = false;
      for (let i = 0; i < k.pillars! && !ok; i++) {
        const pp = hkRingPos(st, k.ring!, i, k.pillars!);
        ok = !p.move.flying && hkSheltered(pp.x, pp.z, g.dx, g.dz, p.move.x, p.move.z, k.depth!, k.shelterR!);
      }
      mark(c, 'phong', { x: st.x, z: st.z, ox: g.dx, oz: g.dz, pg: ok ? 3 : 4 });
      if (ok) st.pg = bumpSuy(st.pg, -k.cure!);
      else if (!punish(c, st, k.hurt!, k.pct!)) return;
    }
    if (!st.pend && c.now >= st.gustAt) {
      st.gustAt = c.now + k.every! * 1000;
      const a = Math.random() * Math.PI * 2;
      st.pend = { dx: Math.sin(a), dz: Math.cos(a), at: c.now + k.warn! * 1000 };
      // Hướng gió báo trước: phải vòng ra SAU một trụ theo chiều gió thổi.
      mark(c, 'phong', { x: st.x, z: st.z, r: k.ring, ox: st.pend.dx, oz: st.pend.dz, d: k.warn, pg: 2 });
    }
    tickBar(c, st);
  },
  exit(c) {
    mark(c, 'phong', { pg: 0 });
    finish(c);
  },
});

// ---------- hk_loi: Lôi Kiếp ----------

interface LoiState extends SuyState {
  hotUntil: number[];
  booms: { i: number; at: number }[];
}

registerMechanic('hk_loi', {
  enter(c) {
    const o = open<LoiState>(c, 'hk_loi');
    if (!o) return;
    o.st.hotUntil = Array.from({ length: o.k.rods! }, () => 0);
    o.st.booms = [];
    for (let i = 0; i < o.k.rods!; i++) {
      const rp = hkRingPos(o.st, o.k.ring!, i, o.k.rods!);
      mark(c, 'loi', { n: i, x: rp.x, z: rp.z, r: o.k.r, pg: 1 });
    }
  },
  tick(c) {
    const o = cur<LoiState>(c, 'hk_loi');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    for (let i = 0; i < k.rods!; i++) {
      const rp = hkRingPos(st, k.ring!, i, k.rods!);
      if (st.hotUntil[i]! > 0 && c.now >= st.hotUntil[i]!) {
        st.hotUntil[i] = 0;
        mark(c, 'loi', { n: i, x: rp.x, z: rp.z, r: k.r, pg: 1 });
      }
      // Chạm trụ nguội: xả lôi lực vào trụ. Trụ nóng lên và sắp nổ, phải rời ngay.
      if (st.hotUntil[i] === 0 && near(p, rp.x, rp.z, k.r!)) {
        st.hotUntil[i] = c.now + k.hot! * 1000;
        st.pg = bumpSuy(st.pg, -k.cure!);
        st.booms.push({ i, at: c.now + k.boomWarn! * 1000 });
        c.host.addHazard({ x: rp.x, z: rp.z, r: k.boomR! }, k.boomWarn!, 0, false, 'lightning', '');
        mark(c, 'loi', { n: i, x: rp.x, z: rp.z, r: k.boomR, d: k.hot, pg: 2 });
      }
    }
    for (const b of st.booms.filter((x) => c.now >= x.at)) {
      st.booms.splice(st.booms.indexOf(b), 1);
      const rp = hkRingPos(st, k.ring!, b.i, k.rods!);
      const hit = near(p, rp.x, rp.z, k.boomR!);
      mark(c, 'loi', { n: b.i, x: rp.x, z: rp.z, r: k.boomR, pg: hit ? 4 : 3 });
      if (hit && !punish(c, st, k.hurt!, k.pct!)) return;
    }
    tickBar(c, st);
  },
  exit(c) {
    mark(c, 'loi', { n: -1, pg: 0 });
    finish(c);
  },
});

// ---------- hk_tram_ly: Trảm Ly Kiếp ----------

interface LyState extends SuyState {
  cutAt: number;
  cuts: { ox: number; oz: number; yaw: number; at: number }[];
}

registerMechanic('hk_tram_ly', {
  enter(c) {
    const o = open<LyState>(c, 'hk_tram_ly');
    if (!o) return;
    o.st.cutAt = o.st.restUntil;
    o.st.cuts = [];
    mark(c, 'ly', { x: o.st.x, z: o.st.z, r: o.k.r, pg: 1 });
  },
  tick(c) {
    const o = cur<LyState>(c, 'hk_tram_ly');
    if (!o) return;
    const { st, k } = o;
    const p = c.p;
    const inside = near(p, st.x, st.z, k.r!);
    const dt = step(c, st, c.phase.suy!, inside ? -k.cure! : k.out!);
    if (dt < 0) return tickBar(c, st);
    for (const cut of st.cuts.filter((x) => c.now >= x.at)) {
      st.cuts.splice(st.cuts.indexOf(cut), 1);
      const hit = hkInRect(cut.ox, cut.oz, cut.yaw, k.len!, k.w!, p.move.x, p.move.z);
      if (hit && !punish(c, st, k.hurt!, k.pct!)) return;
    }
    if (c.now >= st.cutAt) {
      st.cutAt = c.now + k.every! * 1000;
      // Nhát chém đi qua đúng chỗ đang đứng, hướng ngẫu nhiên: phải bước ngang ra mà không rời vòng ấn.
      const yaw = Math.random() * Math.PI * 2;
      const ox = p.move.x - Math.sin(yaw) * (k.len! / 2);
      const oz = p.move.z - Math.cos(yaw) * (k.len! / 2);
      st.cuts.push({ ox, oz, yaw, at: c.now + k.warn! * 1000 });
      c.host.addHazard({ x: ox, z: oz, r: k.len!, sh: 'rect', yaw, w: k.w! }, k.warn!, 0, false, 'spirit', '');
    }
    tickBar(c, st, { n: inside ? 1 : 0 });
  },
  exit(c) {
    mark(c, 'ly', { pg: 0 });
    finish(c);
  },
});

// ---------- hk_huyet_anh: Huyết Ảnh Kiếp ----------

interface HuyetState extends SuyState {
  spawnAt: number;
  alive: boolean;
  kills: number;
}

registerMechanic('hk_huyet_anh', {
  enter(c) {
    const o = open<HuyetState>(c, 'hk_huyet_anh');
    if (!o) return;
    o.st.spawnAt = o.st.restUntil;
    o.st.alive = false;
    o.st.kills = 0;
  },
  tick(c) {
    const o = cur<HuyetState>(c, 'hk_huyet_anh');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st, { n: st.kills });
    const p = c.p;
    const sh = c.host.shadowOf(p);
    if (st.alive && !sh) {
      // Huyết Ảnh vừa bị hạ: kiếp lực tan một mảng, con kế tiếp sắp hiện.
      st.alive = false;
      st.kills++;
      st.pg = bumpSuy(st.pg, -k.kill!);
      st.spawnAt = c.now + k.respawn! * 1000;
      mark(c, 'huyet', { n: st.kills, pg: 2 });
    }
    if (!st.alive && !sh && c.now >= st.spawnAt) {
      const ch = p.char;
      const base = shadowStats(ch.level, ch.atk, ch.def);
      const m = c.host.spawnShadow(
        p,
        { hp: Math.max(1, Math.round(ch.mhp * k.hpFrac!)), atk: base.atk, def: base.def },
        { level: ch.level },
      );
      st.alive = !!m;
      st.spawnAt = c.now + 3000;
      if (m) mark(c, 'huyet', { n: st.kills, x: m.s.x, z: m.s.z, pg: 1 });
    }
    tickBar(c, st, { n: st.kills });
  },
  exit(c) {
    dropVongAnh(c.host, c.p);
    finish(c);
  },
});

/** Bị Huyết Ảnh đánh trúng trong Huyết Ảnh Kiếp: kiếp lực tăng. */
export function hkHurt(host: TribHost, p: PlayerEnt): void {
  const tr = p.trib;
  const st = stateOf<HuyetState>(tr, 'hk_huyet_anh');
  const k = tr ? tribDef(tr.id).phases[tr.pi ?? -1]?.hk : undefined;
  if (!tr || !st || !k || st.failed || host.now() < st.restUntil) return;
  st.pg = bumpSuy(st.pg, k.hurt!);
  if (st.pg >= 100 && (p.s.fl & PF_DEAD) === 0) fail(host, p, st);
}

// ---------- hk_van_tam: Vấn Tâm Kiếp ----------

interface VanState extends SuyState {
  roundAt: number;
  /** Lượt đang chạy: ấn thật ban đầu, số chỗ xoay, mốc giấu, mốc chấm, đã giấu chưa. */
  pend: { idx: number; shift: number; hideAt: number; at: number; hidden: boolean } | null;
}

registerMechanic('hk_van_tam', {
  enter(c) {
    const o = open<VanState>(c, 'hk_van_tam');
    if (!o) return;
    o.st.roundAt = o.st.restUntil;
    o.st.pend = null;
    mark(c, 'van', { n: o.k.seals, x: o.st.x, z: o.st.z, r: o.k.ring, lv: o.k.r, pg: 1 });
  },
  tick(c) {
    const o = cur<VanState>(c, 'hk_van_tam');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    const n = k.seals!;
    const r = st.pend;
    if (r && !r.hidden && c.now >= r.hideAt) {
      r.hidden = true;
      // Ấn tắt sáng rồi cả vòng xoay `shift` chỗ: phải nhớ ấn thật đã dời tới đâu.
      mark(c, 'van', { n: r.shift, x: st.x, z: st.z, r: k.ring, d: k.think, pg: 3 });
    }
    if (r && c.now >= r.at) {
      st.pend = null;
      const ans = hkSealAfter(r.idx, r.shift, n);
      const sp = hkRingPos(st, k.ring!, ans, n);
      const ok = near(p, sp.x, sp.z, k.r!);
      mark(c, 'van', { n: ans, x: sp.x, z: sp.z, r: k.r, pg: ok ? 4 : 5 });
      if (ok) st.pg = bumpSuy(st.pg, -k.cure!);
      else if (!punish(c, st, k.hurt!, k.pct!)) return;
    }
    if (!st.pend && c.now >= st.roundAt) {
      st.roundAt = c.now + k.every! * 1000;
      const idx = Math.min(n - 1, Math.floor(Math.random() * n));
      const shift = 1 + Math.min(n - 2, Math.floor(Math.random() * (n - 1)));
      st.pend = { idx, shift, hideAt: c.now + k.show! * 1000, at: c.now + (k.show! + k.think!) * 1000, hidden: false };
      const sp = hkRingPos(st, k.ring!, idx, n);
      mark(c, 'van', { n: idx, x: sp.x, z: sp.z, r: k.r, d: k.show, pg: 2 });
    }
    tickBar(c, st);
  },
  exit(c) {
    mark(c, 'van', { pg: 0 });
    finish(c);
  },
});

// ---------- hk_kho_than: Thập Tức Khô Thần ----------

interface TucState extends SuyState {
  /** Mốc (ms) của nhịp tức kế tiếp, số nhịp đã qua, nhịp kế đã điều tức chưa. */
  beatAt: number;
  beat: number;
  done: boolean;
}

function nextBeat(c: { host: TribHost; p: PlayerEnt }, st: TucState, k: Hk, now: number): void {
  st.beat++;
  st.done = false;
  if (st.beat > k.beats!) {
    st.beatAt = Number.POSITIVE_INFINITY;
    return;
  }
  st.beatAt += k.every! * 1000;
  mark(c, 'tuc', { n: st.beat, lv: k.beats, d: Math.max(0, (st.beatAt - now) / 1000), r: k.win, pg: 1 });
}

registerMechanic('hk_kho_than', {
  enter(c) {
    const o = open<TucState>(c, 'hk_kho_than');
    if (!o) return;
    o.st.beatAt = o.st.restUntil;
    o.st.beat = 0;
    o.st.done = false;
    nextBeat(c, o.st, o.k, c.now);
  },
  tick(c) {
    const o = cur<TucState>(c, 'hk_kho_than');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st, { n: st.beat });
    // Nhịp trôi qua cửa sổ: đã điều tức thì sang nhịp kế, chưa thì tính bỏ nhịp.
    if (c.now > st.beatAt + k.win! * 1000) {
      if (!st.done) {
        mark(c, 'tuc', { n: st.beat, pg: 4 });
        if (!punish(c, st, k.miss!, 0)) return;
      }
      nextBeat(c, st, k, c.now);
    }
    tickBar(c, st, { n: st.beat });
  },
  exit(c) {
    mark(c, 'tuc', { pg: 0 });
    finish(c);
  },
});

/**
 * Điều tức (phím X) trong Thập Tức Khô Thần. Trong ±`win` giây quanh nhịp và chưa điều tức nhịp này: hóa giải; còn lại (lệch nhịp, bấm thừa): thần càng khô.
 * Trả true nếu đang ở kiếp này (đã xử lý phím).
 */
export function hkBreath(host: TribHost, p: PlayerEnt): boolean {
  const tr = p.trib;
  if (!tr || (p.s.fl & PF_DEAD) !== 0) return false;
  const ph = tribDef(tr.id).phases[tr.pi ?? -1];
  const st = stateOf<TucState>(tr, 'hk_kho_than');
  const k = ph?.hk;
  if (!st || !k || ph?.mechanic !== 'hk_kho_than' || st.failed) return false;
  const now = host.now();
  if (now < st.restUntil) return true;
  const c = { host, p };
  if (!st.done && Math.abs(now - st.beatAt) <= k.win! * 1000) {
    st.done = true;
    st.pg = bumpSuy(st.pg, -k.cure!);
    mark(c, 'tuc', { n: st.beat, pg: 2 });
  } else {
    st.pg = bumpSuy(st.pg, k.hurt!);
    mark(c, 'tuc', { n: st.beat, pg: 3 });
    if (st.pg >= 100) fail(host, p, st);
  }
  return true;
}

// ---------- hk_hon_tho: Hồn Thọ Kiếp ----------

interface ThoState extends SuyState {
  orbAt: number;
  bleedAt: number;
  slot: number;
  orbs: { n: number; x: number; z: number; until: number }[];
}

registerMechanic('hk_hon_tho', {
  enter(c) {
    const o = open<ThoState>(c, 'hk_hon_tho');
    if (!o) return;
    o.st.orbAt = o.st.restUntil;
    o.st.bleedAt = o.st.restUntil + 1000;
    o.st.slot = 0;
    o.st.orbs = [];
  },
  tick(c) {
    const o = cur<ThoState>(c, 'hk_hon_tho');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    for (const orb of [...st.orbs]) {
      const got = near(p, orb.x, orb.z, k.r!);
      if (!got && c.now < orb.until) continue;
      st.orbs.splice(st.orbs.indexOf(orb), 1);
      mark(c, 'chau', { n: orb.n, x: orb.x, z: orb.z, pg: got ? 2 : 0 });
      if (got) {
        st.pg = bumpSuy(st.pg, -k.cure!);
        c.host.heal(p, p.char.mhp * k.heal!);
      }
    }
    if (c.now >= st.orbAt && st.orbs.length < k.orbs!) {
      st.orbAt = c.now + k.every! * 1000;
      const a = Math.random() * Math.PI * 2;
      const rr = (0.35 + 0.65 * Math.sqrt(Math.random())) * k.ring!;
      const orb = { n: st.slot++ % 8, x: st.x + Math.sin(a) * rr, z: st.z + Math.cos(a) * rr, until: c.now + k.life! * 1000 };
      st.orbs.push(orb);
      mark(c, 'chau', { n: orb.n, x: orb.x, z: orb.z, r: k.r, d: k.life, pg: 1 });
    }
    if (c.now >= st.bleedAt) {
      st.bleedAt = c.now + 1000;
      c.host.sap(p, p.char.mhp * k.bleed! * (st.pg / 100));
      if (c.p.trib !== c.tr) return;
    }
    tickBar(c, st);
  },
  exit(c) {
    mark(c, 'chau', { n: -1, pg: 0 });
    finish(c);
  },
});

// ---------- hk_luan_hoi: Luân Hồi Kiếp ----------

interface LuanState extends SuyState {
  /** Góc cung sinh tại mốc `t0` (ms) và vận tốc góc có dấu (rad/s). */
  theta0: number;
  omega: number;
  t0: number;
  grindAt: number;
  warned: boolean;
}

function sendWheel(c: TribMechCtx, st: LuanState, k: Hk): void {
  // `ox` = góc hiện tại, `oz` = vận tốc góc: client tự suy vị trí cung sinh tới lần nghiền kế.
  mark(c, 'luan', {
    n: k.sectors,
    x: st.x,
    z: st.z,
    r: k.r,
    ox: st.theta0,
    oz: st.omega,
    d: Math.max(0, (st.grindAt - c.now) / 1000),
    pg: 1,
  });
}

registerMechanic('hk_luan_hoi', {
  enter(c) {
    const o = open<LuanState>(c, 'hk_luan_hoi');
    if (!o) return;
    o.st.theta0 = Math.random() * Math.PI * 2;
    o.st.omega = o.k.speed!;
    // Cung sinh xoay ngay từ lúc vào kiếp (kể cả lúc điều tức) để người chơi kịp đọc chiều xoay trước lần nghiền đầu.
    o.st.t0 = c.now;
    o.st.grindAt = o.st.restUntil + o.k.every! * 1000;
    o.st.warned = false;
    sendWheel(c, o.st, o.k);
  },
  tick(c) {
    const o = cur<LuanState>(c, 'hk_luan_hoi');
    if (!o) return;
    const { st, k } = o;
    const dt = step(c, st, c.phase.suy!, 0);
    if (dt < 0) return tickBar(c, st);
    const p = c.p;
    if (!st.warned && c.now >= st.grindAt - k.warn! * 1000) {
      st.warned = true;
      mark(c, 'luan', { x: st.x, z: st.z, r: k.r, d: k.warn, pg: 2 });
    }
    if (c.now >= st.grindAt) {
      const theta = hkLuanAngle(st.theta0, st.omega, (st.grindAt - st.t0) / 1000);
      const ok = !p.move.flying && hkLuanSafe(st, theta, k.sectors!, k.r!, p.move.x, p.move.z);
      // Sau mỗi lần nghiền cung sinh đổi chiều xoay.
      st.theta0 = theta;
      st.t0 = st.grindAt;
      st.omega = -st.omega;
      st.grindAt += k.every! * 1000;
      st.warned = false;
      mark(c, 'luan', { x: st.x, z: st.z, r: k.r, ox: theta, pg: ok ? 3 : 4 });
      if (ok) st.pg = bumpSuy(st.pg, -k.cure!);
      else if (!punish(c, st, k.hurt!, k.pct!)) return;
      sendWheel(c, st, k);
    }
    tickBar(c, st);
  },
  exit(c) {
    mark(c, 'luan', { pg: 0 });
    finish(c);
  },
});

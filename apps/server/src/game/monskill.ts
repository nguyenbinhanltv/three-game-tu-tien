// Nguyên tắc quái mở rộng (E1-E): đường thẳng, lao tới, nhảy đập, chui đất, phản đòn, gọi đệ tử, lộ yếu điểm.
// Server phán định mọi va chạm: vạch báo là một `Hazard` của sim (nổ đúng lúc, ai đứng trong lúc đó mới trúng, xem
// `tickHazards`); chiêu này chỉ lên lịch vạch, di chuyển quái và giữ trạng thái. Hàm hình học dùng chung ở
// packages/shared/src/monskill.ts. sim.ts móc vào: tickMonster (tick), damageMonster (onHit), resetAi (reset),
// breakPosture/tryInterrupt (cancel).

import {
  burrowSpots,
  chargeEnd,
  coneGeom,
  leapPos,
  lineGeom,
  MF_BURROW,
  MF_MX_MASK,
  MF_REFLECT,
  MF_WEAK,
  MON_SKILLS,
  reflectPhase,
  reflectSplit,
  reflectWindow,
  revealMul,
  summonRoom,
  summonSpots,
  yawTo,
  type HazardGeom,
  type HazardMsg,
  type MonSkillName,
  type MonsterAi,
  type MonsterDef,
  type ReflectWin,
} from '@dtl/shared';

export interface MxPlayer {
  sid: string;
  move: { x: number; y: number; z: number };
  char: { mhp: number };
}

type Act =
  | { k: 'charge'; at: number; phase: 0 | 1; tx: number; tz: number; speed: number }
  | { k: 'leap'; at: number; fx: number; fz: number; tx: number; tz: number }
  | { k: 'burrow'; at: number; phase: 0 | 1; spots: { x: number; z: number }[]; coneEnd: number }
  | { k: 'summon'; at: number; spots: { x: number; z: number }[] };

/** Trạng thái chạy của một quái: gắn vào `MonEnt.mx`. */
export interface MonSkillRt {
  /** Lúc (ms) mỗi chiêu được dùng tiếp (0 = chưa hẹn). */
  next: Partial<Record<MonSkillName, number>>;
  act: Act | null;
  reflect: ReflectWin | null;
  weakUntil: number;
  /** id đệ tử đã gọi. */
  minions: string[];
  /** Cờ MF_* và `ce` do chiêu này giữ (sim ghép với cờ chú/choáng). */
  bits: number;
  ce: number;
}

export function newRt(): MonSkillRt {
  return { next: {}, act: null, reflect: null, weakUntil: 0, minions: [], bits: 0, ce: 0 };
}

/** Phần của quái mà chiêu cần (MonEnt thỏa cấu trúc này). */
export interface MxMon {
  id: string;
  def: MonsterDef;
  s: { x: number; y: number; z: number; yaw: number; hp: number; mhp: number; mf: number; ce: number };
  level: number;
  atk: number;
  state: number;
  attackAt: number;
  windUntil: number;
  comboAt: number;
  rules: { ai: MonsterAi };
  mx: MonSkillRt;
  /** Là đệ tử của quái này (id). */
  minionOf?: string;
}

export interface MonSkillHost {
  now(): number;
  mon(id: string): MxMon | undefined;
  isDead(m: MxMon): boolean;
  groundAt(x: number, z: number): number;
  /** Chỗ đứng được (không nước, không vách). */
  canStand(x: number, z: number): boolean;
  hazard(g: HazardGeom, delay: number, mul: number, kind: HazardMsg['kind'], m: MxMon, mv: HazardMsg['mv']): void;
  damagePlayer(p: MxPlayer, n: number, src: string): void;
  setFlags(m: MxMon, low: number, ce: number): void;
  setAttack(m: MxMon): void;
  spawnMinion(def: MonsterDef, level: number, x: number, z: number, owner: MxMon): MxMon | null;
  removeMinion(m: MxMon): void;
  addPosture(m: MxMon, n: number): void;
  /** Số đệ tử còn sống trong cả room. */
  minionsAlive(): number;
  monsterDef(id: string): MonsterDef | undefined;
}

type Ender = 'charge' | 'leap' | 'burrow' | 'summon';

export class MonSkills {
  constructor(private readonly h: MonSkillHost) {}

  /** Quái đang chui đất: miễn mọi sát thương, không bị đánh trúng. */
  underground(m: MxMon): boolean {
    return m.mx.act?.k === 'burrow' && m.mx.act.phase === 0;
  }

  /**
   * Gọi mỗi tick khi quái đang giao chiến với `target` ở khoảng cách `d`. Trả về true nếu tick này quái bận chiêu
   * (sim bỏ qua đi/đánh).
   */
  tick(m: MxMon, target: MxPlayer, d: number, reachable: boolean, dt: number): boolean {
    const now = this.h.now();
    const rt = m.mx;
    this.expire(m, now);
    if (rt.act) {
      this.runAct(m, target, dt, now);
      return true;
    }
    const ai = m.rules.ai;
    if (m.comboAt || !reachable) return false;
    for (const k of MON_SKILLS) {
      const cfg = ai[k];
      if (!cfg) continue;
      const ready = rt.next[k];
      if (!ready) {
        // Lần đầu: nửa chu kỳ; lao tới/nhảy đập cần khoảng cách nên dùng sớm (tối đa 1,5 s) trước khi quái áp sát.
        rt.next[k] = now + (k === 'charge' || k === 'leap' ? Math.min(cfg.cd * 500, 1500) : cfg.cd * 500);
        continue;
      }
      if (now < ready) continue;
      if (this.start(m, target, d, k, now)) return !!rt.act || m.windUntil > now;
    }
    return false;
  }

  /** Thử dùng chiêu `k`; false nếu điều kiện chưa đủ (khoảng cách, chỗ đứng, trần đệ tử). */
  private start(m: MxMon, t: MxPlayer, d: number, k: MonSkillName, now: number): boolean {
    const ai = m.rules.ai;
    const rt = m.mx;
    const yaw = yawTo(m.s.x, m.s.z, t.move.x, t.move.z);
    switch (k) {
      case 'line': {
        const c = ai.line!;
        if (d > c.range) return false;
        m.s.yaw = yaw;
        this.h.hazard(lineGeom(m.s.x, m.s.z, yaw, c.r, c.w), c.delay, c.mul, c.kind, m, 'line');
        m.windUntil = now + c.delay * 1000 + 250;
        m.attackAt = Math.max(m.attackAt, m.windUntil + 400);
        rt.next.line = now + c.cd * 1000;
        this.h.setAttack(m);
        return true;
      }
      case 'charge': {
        const c = ai.charge!;
        if (d < c.min || d > c.range) return false;
        let prev = this.h.groundAt(m.s.x, m.s.z);
        const end = chargeEnd(m.s.x, m.s.z, yaw, c.r, (x, z) => {
          const g = this.h.groundAt(x, z);
          const ok = this.h.canStand(x, z) && Math.abs(g - prev) < 1.2;
          prev = g;
          return ok;
        });
        // Đường bị chặn ngay trước mặt: không lao, thử lại sớm.
        if (end.len < Math.min(3, c.r)) {
          rt.next.charge = now + 1500;
          return false;
        }
        m.s.yaw = yaw;
        this.h.hazard(lineGeom(m.s.x, m.s.z, yaw, end.len, c.w), c.delay, c.mul, c.kind, m, 'charge');
        rt.act = { k: 'charge', at: now + c.delay * 1000, phase: 0, tx: end.x, tz: end.z, speed: c.speed };
        rt.next.charge = now + c.cd * 1000;
        this.h.setAttack(m);
        return true;
      }
      case 'leap': {
        const c = ai.leap!;
        if (d < c.min || d > c.range || !this.h.canStand(t.move.x, t.move.z)) return false;
        m.s.yaw = yaw;
        this.h.hazard({ x: t.move.x, z: t.move.z, r: c.r }, c.delay, c.mul, c.kind, m, 'leap');
        rt.act = { k: 'leap', at: now + c.delay * 1000, fx: m.s.x, fz: m.s.z, tx: t.move.x, tz: t.move.z };
        rt.next.leap = now + c.cd * 1000;
        this.h.setAttack(m);
        return true;
      }
      case 'burrow': {
        const c = ai.burrow!;
        if (d > c.range) return false;
        const spots = burrowSpots(t.move.x, t.move.z, c.n, c.spread, Math.random() * Math.PI * 2, (x, z) => this.h.canStand(x, z));
        for (const sp of spots) this.h.hazard({ x: sp.x, z: sp.z, r: c.r }, c.hide, c.mul, c.kind, m, 'burrow');
        rt.act = { k: 'burrow', at: now + c.hide * 1000, phase: 0, spots, coneEnd: 0 };
        rt.next.burrow = now + c.cd * 1000;
        this.refresh(m, now);
        this.h.setAttack(m);
        return true;
      }
      case 'summon': {
        const c = ai.summon!;
        const n = summonRoom(this.alive(m), c.n, c.max, this.h.minionsAlive());
        if (n <= 0) {
          rt.next.summon = now + 1500;
          return false;
        }
        const spots = summonSpots(m.s.x, m.s.z, n, c.r, Math.random() * Math.PI * 2).map((sp) => (this.h.canStand(sp.x, sp.z) ? sp : { x: m.s.x, z: m.s.z }));
        for (const sp of spots) this.h.hazard({ x: sp.x, z: sp.z, r: 1.6 }, c.delay, 0, 'spirit', m, 'summon');
        rt.act = { k: 'summon', at: now + c.delay * 1000, spots };
        rt.next.summon = now + c.cd * 1000;
        this.h.setAttack(m);
        return true;
      }
      case 'reflect': {
        const c = ai.reflect!;
        if (rt.reflect && now < rt.reflect.until) return false;
        rt.reflect = reflectWindow(c, now);
        rt.next.reflect = rt.reflect.until + c.cd * 1000;
        this.refresh(m, now);
        return false;
      }
      case 'reveal': {
        const c = ai.reveal!;
        // Chiêu `after`: chỉ mở khi chiêu đó xong (xem `finish`), không mở theo giờ.
        if (c.after) {
          rt.next.reveal = now + 1e12;
          return false;
        }
        this.openReveal(m, now);
        rt.next.reveal = now + (c.dur + c.cd) * 1000;
        return false;
      }
    }
  }

  private runAct(m: MxMon, t: MxPlayer, dt: number, now: number): void {
    const a = m.mx.act!;
    this.h.setAttack(m);
    switch (a.k) {
      case 'charge': {
        if (a.phase === 0) {
          if (now < a.at) return;
          a.phase = 1;
        }
        const dx = a.tx - m.s.x;
        const dz = a.tz - m.s.z;
        const dist = Math.hypot(dx, dz);
        const step = Math.min(dist, a.speed * dt);
        if (dist > 0.01) {
          m.s.x += (dx / dist) * step;
          m.s.z += (dz / dist) * step;
          m.s.y = this.h.groundAt(m.s.x, m.s.z);
        }
        if (dist - step < 0.05) this.finish(m, 'charge', now);
        return;
      }
      case 'leap': {
        const p = leapPos(a.fx, a.fz, a.tx, a.tz, a.at, now);
        m.s.x = p.x;
        m.s.z = p.z;
        m.s.yaw = yawTo(a.fx, a.fz, a.tx, a.tz);
        // Vòng cung: lên đỉnh giữa lúc bay, xuống đúng lúc đáp.
        m.s.y = this.h.groundAt(p.x, p.z) + Math.sin(p.k * Math.PI) * 2.2;
        if (now >= a.at) {
          m.s.x = a.tx;
          m.s.z = a.tz;
          m.s.y = this.h.groundAt(a.tx, a.tz);
          this.finish(m, 'leap', now);
        }
        return;
      }
      case 'burrow': {
        if (a.phase === 0) {
          if (now < a.at) return;
          const c = m.rules.ai.burrow;
          const sp = a.spots[0];
          if (sp) {
            m.s.x = sp.x;
            m.s.z = sp.z;
            m.s.y = this.h.groundAt(sp.x, sp.z);
          }
          a.phase = 1;
          if (!c) return this.finish(m, 'burrow', now);
          const yaw = yawTo(m.s.x, m.s.z, t.move.x, t.move.z);
          m.s.yaw = yaw;
          this.h.hazard(coneGeom(m.s.x, m.s.z, yaw, c.cone.r, c.cone.w), c.cone.delay, c.cone.mul, c.kind, m, 'emerge');
          a.coneEnd = now + c.cone.delay * 1000 + 250;
          this.refresh(m, now);
          return;
        }
        if (now >= a.coneEnd) this.finish(m, 'burrow', now);
        return;
      }
      case 'summon': {
        if (now < a.at) return;
        const c = m.rules.ai.summon;
        const def = c && this.h.monsterDef(c.mon);
        if (c && def) {
          for (const sp of a.spots) {
            if (this.alive(m) >= c.max) break;
            const e = this.h.spawnMinion(def, m.level, sp.x, sp.z, m);
            if (e) m.mx.minions.push(e.id);
          }
        }
        this.finish(m, 'summon', now);
        return;
      }
    }
  }

  private finish(m: MxMon, k: Ender, now: number): void {
    m.mx.act = null;
    m.attackAt = Math.max(m.attackAt, now + 600);
    this.refresh(m, now);
    const rv = m.rules.ai.reveal;
    if (rv && rv.after === k) this.openReveal(m, now);
  }

  private openReveal(m: MxMon, now: number): void {
    const rv = m.rules.ai.reveal!;
    m.mx.weakUntil = now + rv.dur * 1000;
    if (rv.posture) this.h.addPosture(m, rv.posture);
    this.refresh(m, now);
  }

  /** Đệ tử còn sống của `m`. */
  alive(m: MxMon): number {
    let n = 0;
    for (const id of m.mx.minions) {
      const e = this.h.mon(id);
      if (e && !this.h.isDead(e)) n++;
    }
    return n;
  }

  private expire(m: MxMon, now: number): void {
    const rt = m.mx;
    let dirty = false;
    if (rt.reflect && now >= rt.reflect.until) {
      rt.reflect = null;
      dirty = true;
    }
    if (rt.weakUntil && now >= rt.weakUntil) {
      rt.weakUntil = 0;
      dirty = true;
    }
    if (dirty) this.refresh(m, now);
  }

  /** Tính lại cờ MF_* của chiêu và ghi vào `s.mf`/`s.ce` (qua sim, giữ cờ chú/choáng). */
  private refresh(m: MxMon, now: number): void {
    const rt = m.mx;
    let bits = 0;
    let ce = 0;
    if (this.underground(m)) {
      bits |= MF_BURROW;
      ce = Math.max(ce, rt.act!.at);
    }
    const cfg = m.rules.ai.reflect;
    if (cfg && rt.reflect && reflectPhase(cfg, rt.reflect, now) !== 'off') {
      bits |= MF_REFLECT;
      ce = Math.max(ce, rt.reflect.until);
    }
    if (rt.weakUntil > now) {
      bits |= MF_WEAK;
      ce = Math.max(ce, rt.weakUntil);
    }
    rt.bits = bits;
    rt.ce = ce;
    const low = m.s.mf & ~MF_MX_MASK;
    this.h.setFlags(m, low, low ? m.s.ce : 0);
  }

  /**
   * Người chơi đánh trúng quái: trả sát thương quái thực nhận (đã áp phản đòn, yếu điểm, giáp). -1 = miễn (chui đất).
   * `dot`: chất độc/dot không bị phản.
   */
  onHit(m: MxMon, dmg: number, p: MxPlayer | null, dot: boolean): number {
    if (this.underground(m)) return -1;
    const ai = m.rules.ai;
    const now = this.h.now();
    let n = dmg;
    const rf = ai.reflect;
    if (rf && p && !dot && reflectPhase(rf, m.mx.reflect, now) === 'on') {
      const r = reflectSplit(rf, dmg, p.char.mhp);
      n = r.taken;
      if (r.back > 0) this.h.damagePlayer(p, r.back, m.id);
    }
    return Math.max(0, Math.round(n * revealMul(ai.reveal, m.mx.weakUntil > now)));
  }

  /** Hủy chiêu đang dở (quái bị quỵ/ngắt chú): vạch đã thả vẫn nổ đúng như báo. Chui đất không hủy được. */
  cancel(m: MxMon): void {
    if (!m.mx.act || this.underground(m)) return;
    m.mx.act = null;
    m.windUntil = 0;
  }

  /** Quái chủ chết hoặc bỏ trận: xóa đệ tử, hủy mọi chiêu, về trạng thái đầu. */
  reset(m: MxMon): void {
    const rt = m.mx;
    for (const id of rt.minions) {
      const e = this.h.mon(id);
      if (e) this.h.removeMinion(e);
    }
    rt.minions.length = 0;
    rt.act = null;
    rt.reflect = null;
    rt.weakUntil = 0;
    rt.next = {};
    rt.bits = 0;
    rt.ce = 0;
  }
}

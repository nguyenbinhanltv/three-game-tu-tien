// Thần Tàng Điện (E4-C): cơ chế riêng của Vô Diện Thần Quân. Server phán định mọi thứ; client chỉ vẽ vạch báo (S.HAZARD) và đọc cờ `ke` ở DmgMsg.
//  - Sáu tay: `n` vạch nón chia đều quanh boss, xoay thêm `turn` độ mỗi lần.
//  - Ngũ hành: mỗi `cd` giây chọn một hành, đánh vòng r m; năm ấn trên sàn, đứng trên ấn hành khắc chế thì giảm 80% (cờ `ke`).
//  - Thần niệm: hai phân thân; hạ hết trong `life` giây thì boss mất thế, để sống thì hợp lại, boss hồi máu.
//  - Mất tên: ba vòng đá xoay quanh sàn rồi tia Phản hồi (cả đội đứng gần nhau thì sát thương gấp đôi).
// Cấu hình ở `MonsterDef.than` (monsters.json). Hàm thuần (`handYaws`, `ringPos`, `counterOf`, `gathered`) có test riêng.

import { computeDamage, ELEM_BEATS, inHazard, MS_ATTACK, MS_CHASE, MS_DEAD, PF_DEAD, type Element, type FxMsg, type HazardGeom, type HazardMsg, type MonsterDef } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './sim';

export const ELEMS: readonly Element[] = ['kim', 'moc', 'tho', 'thuy', 'hoa'];
const KIND: Record<Element, HazardMsg['kind']> = { kim: 'lightning', moc: 'spirit', tho: 'spirit', thuy: 'frost', hoa: 'fire' };

/** Hành khắc chế `e` (hành nào thắng `e`). */
export function counterOf(e: Element): Element {
  return ELEMS.find((c) => ELEM_BEATS[c] === e)!;
}

/** Góc (rad, quy ước atan2(dx, dz)) của `n` tay chia đều; lần thứ `turn` xoay thêm `turnDeg` độ mỗi lần. */
export function handYaws(base: number, n: number, turn: number, turnDeg: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(base + (i * Math.PI * 2) / n + (turn * turnDeg * Math.PI) / 180);
  return out;
}

/** Vị trí vòng đá `i` (của `n`) quanh (cx, cz) lúc `t` giây sau khi bắt đầu quay. */
export function ringPos(cx: number, cz: number, orbit: number, i: number, n: number, spinDeg: number, t: number, theta0 = 0): { x: number; z: number } {
  const a = theta0 + (i * Math.PI * 2) / n + (spinDeg * Math.PI * t) / 180;
  return { x: cx + Math.cos(a) * orbit, z: cz + Math.sin(a) * orbit };
}

/** Cả đội (>= 2 người) có đứng trong `r` m quanh trọng tâm không. */
export function gathered(pts: readonly { x: number; z: number }[], r: number): boolean {
  if (pts.length < 2) return false;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  return pts.every((p) => Math.hypot(p.x - cx, p.z - cz) <= r);
}

export interface ThanHost {
  now(): number;
  players(): Iterable<PlayerEnt>;
  monsters(): readonly MonEnt[];
  isDead(p: PlayerEnt): boolean;
  monsterDef(id: string): MonsterDef | undefined;
  spawnMinion(def: MonsterDef, level: number, x: number, z: number, owner: MonEnt): MonEnt;
  /** Vạch báo (không sát thương ở sim; hệ thống này tự tính khi nổ). */
  telegraph(g: HazardGeom, delay: number, kind: HazardMsg['kind'], src: string): void;
  /** Dấu hiệu tồn tại `dur` giây (vòng ấn, vòng đá): không sát thương. */
  marker(x: number, z: number, r: number, dur: number, kind: HazardMsg['kind']): void;
  damagePlayer(p: PlayerEnt, n: number, src: string, hv?: boolean, ke?: 1 | -1): void;
  /** Boss mất thế `sec` giây. */
  stagger(m: MonEnt, sec: number): void;
  heal(m: MonEnt, n: number): void;
  kill(m: MonEnt): void;
  fx(m: FxMsg): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
  groundAt(x: number, z: number): number;
  /** Nguyên anh xuất khiếu: không bị nhắm, không tính vào gom nhóm. */
  isGhost(p: PlayerEnt): boolean;
  elemName(e: Element): string;
}

interface Strike {
  at: number;
  g: HazardGeom;
  mul: number;
  /** Hành đánh xuống (chỉ vòng ngũ hành). */
  e?: Element;
  /** Tia Phản hồi: gấp đôi khi cả đội đứng trong bán kính này. */
  gather?: number;
  hv: boolean;
}
interface Rings {
  t0: number;
  until: number;
  theta0: number;
  hitAt: Map<string, number>;
  markAt: number;
}
interface BossRt {
  started: boolean;
  cx: number;
  cz: number;
  handsNext: number;
  handsTurn: number;
  elemNext: number;
  lastElem: Element | null;
  sealMarkAt: number;
  cloneNext: number;
  clones: string[];
  cloneDeadline: number;
  ringsNext: number;
  rings: Rings | null;
  strikes: Strike[];
}

export class ThanTangSystem {
  private rt = new Map<string, BossRt>();

  constructor(private readonly h: ThanHost) {}

  private bosses(): MonEnt[] {
    return this.h.monsters().filter((m) => m.def.than && m.state !== MS_DEAD);
  }

  active(): boolean {
    return this.rt.size > 0;
  }

  /** Vị trí ấn ngũ hành `i` quanh tâm trận. */
  sealPos(rt: { cx: number; cz: number }, ring: number, i: number): { x: number; z: number } {
    const a = (i * Math.PI * 2) / 5;
    return { x: rt.cx + Math.sin(a) * ring, z: rt.cz + Math.cos(a) * ring };
  }

  tick(): void {
    const now = this.h.now();
    for (const m of this.bosses()) {
      const cfg = m.def.than!;
      const fighting = m.state === MS_CHASE || m.state === MS_ATTACK;
      let rt = this.rt.get(m.id);
      if (!fighting) {
        if (rt?.started) this.reset(m.id);
        continue;
      }
      if (!rt) {
        rt = { started: false, cx: m.s.x, cz: m.s.z, handsNext: 0, handsTurn: 0, elemNext: 0, lastElem: null, sealMarkAt: 0, cloneNext: 0, clones: [], cloneDeadline: 0, ringsNext: 0, rings: null, strikes: [] };
        this.rt.set(m.id, rt);
      }
      if (!rt.started) {
        rt.started = true;
        rt.cx = m.s.x;
        rt.cz = m.s.z;
        rt.handsNext = now + 5000;
        rt.elemNext = now + 8000;
        rt.cloneNext = now + 3000;
        rt.ringsNext = now + 4000;
      }
      this.fireStrikes(m, rt, now);
      if (cfg.hands && m.phase >= cfg.hands.phase) this.tickHands(m, rt, now);
      if (cfg.elem && m.phase >= cfg.elem.phase) this.tickElem(m, rt, now);
      if (cfg.clone && m.phase >= cfg.clone.phase) this.tickClone(m, rt, now);
      if (cfg.rings && m.phase >= cfg.rings.phase) this.tickRings(m, rt, now);
    }
    for (const id of [...this.rt.keys()]) {
      const m = this.h.monsters().find((o) => o.id === id);
      if (!m || m.state === MS_DEAD) this.reset(id);
    }
  }

  /** Boss chết thì dọn phân thân. */
  onKill(m: MonEnt): void {
    if (m.def.than) this.reset(m.id);
  }

  private nearestPlayer(m: MonEnt): PlayerEnt | null {
    let best: PlayerEnt | null = null;
    let bd = Infinity;
    for (const p of this.h.players()) {
      if (this.h.isDead(p) || (p.s.fl & PF_DEAD) !== 0 || this.h.isGhost(p)) continue;
      const d = Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private tickHands(m: MonEnt, rt: BossRt, now: number): void {
    const c = m.def.than!.hands!;
    if (now < rt.handsNext) return;
    rt.handsNext = now + c.cd * 1000;
    const tgt = this.nearestPlayer(m);
    const base = tgt ? Math.atan2(tgt.move.x - m.s.x, tgt.move.z - m.s.z) : m.s.yaw;
    const half = (c.w * Math.PI) / 360;
    for (const yaw of handYaws(base, c.n, rt.handsTurn, c.turn)) {
      const g: HazardGeom = { x: m.s.x, z: m.s.z, r: c.r, sh: 'cone', yaw, w: half };
      this.h.telegraph(g, c.delay, 'spirit', m.id);
      rt.strikes.push({ at: now + c.delay * 1000, g, mul: c.mul, hv: false });
    }
    rt.handsTurn++;
  }

  private tickElem(m: MonEnt, rt: BossRt, now: number): void {
    const c = m.def.than!.elem!;
    if (now >= rt.sealMarkAt) {
      rt.sealMarkAt = now + 9000;
      ELEMS.forEach((e, i) => {
        const p = this.sealPos(rt, c.ring, i);
        this.h.marker(p.x, p.z, c.sealR, 10, KIND[e]);
      });
    }
    if (now < rt.elemNext) return;
    rt.elemNext = now + c.cd * 1000;
    let e: Element;
    do e = ELEMS[Math.floor(Math.random() * ELEMS.length)];
    while (e === rt.lastElem);
    rt.lastElem = e;
    const g: HazardGeom = { x: m.s.x, z: m.s.z, r: c.r };
    this.h.telegraph(g, c.delay, KIND[e], m.id);
    rt.strikes.push({ at: now + c.delay * 1000, g, mul: c.mul, e, hv: true });
    this.h.sysAll('sys.tt_elem', { e: this.h.elemName(e), k: this.h.elemName(counterOf(e)) }, 'info');
  }

  private tickClone(m: MonEnt, rt: BossRt, now: number): void {
    const c = m.def.than!.clone!;
    if (rt.clones.length === 0) {
      if (now < rt.cloneNext) return;
      const def = this.h.monsterDef(c.mon);
      if (!def) return;
      const a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i < c.n; i++) {
        const a = a0 + (i * Math.PI * 2) / c.n;
        const e = this.h.spawnMinion(def, m.level, m.s.x + Math.cos(a) * c.r, m.s.z + Math.sin(a) * c.r, m);
        rt.clones.push(e.id);
      }
      rt.cloneDeadline = now + c.life * 1000;
      this.h.sysAll('sys.tt_clone', { s: c.life }, 'info');
      return;
    }
    const live = rt.clones.map((id) => this.h.monsters().find((o) => o.id === id)).filter((o): o is MonEnt => !!o && o.state !== MS_DEAD);
    if (live.length === 0) {
      rt.clones = [];
      rt.cloneNext = now + c.cd * 1000;
      this.h.stagger(m, c.weak);
      this.h.sysAll('sys.tt_clone_ok', undefined, 'good');
    } else if (now >= rt.cloneDeadline) {
      for (const o of live) this.h.kill(o);
      rt.clones = [];
      rt.cloneNext = now + c.cd * 1000;
      this.h.heal(m, Math.round(m.s.mhp * c.heal));
      this.h.sysAll('sys.tt_clone_merge', undefined, 'bad');
    }
  }

  private tickRings(m: MonEnt, rt: BossRt, now: number): void {
    const c = m.def.than!.rings!;
    if (!rt.rings) {
      if (now < rt.ringsNext) return;
      rt.rings = { t0: now, until: now + c.dur * 1000, theta0: Math.random() * Math.PI * 2, hitAt: new Map(), markAt: 0 };
      this.h.sysAll('sys.tt_rings', { s: c.dur }, 'info');
      return;
    }
    const r = rt.rings;
    if (now >= r.until) {
      rt.rings = null;
      rt.ringsNext = now + c.cd * 1000;
      const tgt = this.nearestPlayer(m);
      const yaw = tgt ? Math.atan2(tgt.move.x - m.s.x, tgt.move.z - m.s.z) : m.s.yaw;
      const g: HazardGeom = { x: m.s.x, z: m.s.z, r: c.final.r, sh: 'rect', yaw, w: c.final.w };
      this.h.telegraph(g, c.final.delay, 'spirit', m.id);
      rt.strikes.push({ at: now + c.final.delay * 1000, g, mul: c.final.mul, gather: c.final.gather, hv: true });
      this.h.sysAll('sys.tt_final', undefined, 'bad');
      return;
    }
    const t = (now - r.t0) / 1000;
    const pos = Array.from({ length: c.n }, (_, i) => ringPos(rt.cx, rt.cz, c.orbit, i, c.n, c.spin, t, r.theta0));
    if (now >= r.markAt) {
      r.markAt = now + 500;
      for (const p of pos) this.h.marker(p.x, p.z, c.r, 0.7, 'spirit');
    }
    for (const pl of this.h.players()) {
      if (this.h.isDead(pl) || (pl.s.fl & PF_DEAD) !== 0 || now < (r.hitAt.get(pl.sid) ?? 0)) continue;
      if (!pos.some((p) => Math.hypot(pl.move.x - p.x, pl.move.z - p.z) <= c.r)) continue;
      r.hitAt.set(pl.sid, now + 700);
      this.h.damagePlayer(pl, Math.max(1, Math.round(computeDamage(m.atk, c.mul, pl.char.def, Math.random(), 1).dmg)), m.id);
    }
  }

  /** Nổ các vạch tới giờ: người đứng trong hình lúc nổ mới trúng; ngũ hành xét ấn khắc chế. */
  private fireStrikes(m: MonEnt, rt: BossRt, now: number): void {
    for (let i = rt.strikes.length - 1; i >= 0; i--) {
      const s = rt.strikes[i];
      if (now < s.at) continue;
      rt.strikes.splice(i, 1);
      const c = m.def.than!;
      const live = [...this.h.players()].filter((p) => !this.h.isDead(p) && (p.s.fl & PF_DEAD) === 0 && !this.h.isGhost(p));
      const hitters = live.filter((p) => inHazard(s.g, p.move.x, p.move.z) && p.move.y - this.h.groundAt(p.move.x, p.move.z) <= 8);
      let mul = s.mul;
      if (s.gather !== undefined && gathered(hitters.map((p) => ({ x: p.move.x, z: p.move.z })), s.gather)) mul *= 2;
      for (const p of hitters) {
        let n = computeDamage(m.atk, mul, p.char.def, Math.random(), 1).dmg;
        let ke: 1 | undefined;
        if (s.e && c.elem) {
          const k = ELEMS.indexOf(counterOf(s.e));
          const sp = this.sealPos(rt, c.elem.ring, k);
          if (Math.hypot(p.move.x - sp.x, p.move.z - sp.z) <= c.elem.sealR) {
            n *= 1 - c.elem.cut;
            ke = 1;
          }
        }
        this.h.damagePlayer(p, Math.max(1, Math.round(n)), m.id, s.hv, ke);
      }
    }
  }

  private reset(id: string): void {
    const rt = this.rt.get(id);
    if (!rt) return;
    for (const cid of rt.clones) {
      const o = this.h.monsters().find((x) => x.id === cid);
      if (o && o.state !== MS_DEAD) this.h.kill(o);
    }
    this.rt.delete(id);
  }
}

// Cung gương (E3-M, Kính Nguyệt Cung): cơ chế riêng của Kính Nguyệt Chân Quân và Định Thần Phù.
// Mọi thứ do server phán định; client chỉ vẽ (FX `mirror_*`, cờ MF_REAL/MF_SENSED). Cấu hình ở `MonsterDef.mirror` (monsters.json).
//  - Ba bóng một thật: bóng giả là đệ tử một đòn, chết thì nổ vòng (Hazard báo trước). Thể thật mang cờ MF_REAL, thần thức soi ra MF_SENSED.
//  - Lặp lại: người chơi ra chiêu thì bóng thật phản lại đúng chỗ người đó sau một nhịp báo (Hazard), mỗi người có hồi riêng.
//  - Đĩa gương: các tia xoay quanh boss; server kiểm người trong tia theo thời gian (đồng hồ server), client vẽ theo cùng công thức.
//  - Nguyệt phản: người trong màn gương bị Tâm Ma Ảnh của chính mình đuổi và ném chiêu; hết màn thì bóng tan.
// Sát thương từ quái có `glass` (hoặc boss gương) bị Định Thần Phù giảm ở `GameSim.damagePlayer` (hàm `wardMul`).

import { computeDamage, MS_ATTACK, MS_CHASE, MS_DEAD, PF_DEAD, shadowStats, type FxMsg, type HazardGeom, type HazardMsg, type MonsterDef, type SpiritHit } from '@dtl/shared';
import { SKILL } from '@dtl/content';
import type { MonEnt, PlayerEnt } from './sim';
import { tamMaSkills } from './tribmech';

/** Tia đĩa gương: góc (rad) của tia `i` lúc `t` giây sau khi bắt đầu quay. Client dùng chính hàm này (qua `discAngle`). */
export function discAngle(theta0: number, i: number, beams: number, spinDeg: number, t: number): number {
  return theta0 + (i * Math.PI * 2) / beams + (spinDeg * Math.PI * t) / 180;
}

/** Điểm (px, pz) nằm trong tia từ (cx, cz) góc `a` dài `len` rộng `w` không. */
export function inBeam(cx: number, cz: number, a: number, len: number, w: number, px: number, pz: number): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  const ux = Math.sin(a);
  const uz = Math.cos(a);
  const along = dx * ux + dz * uz;
  if (along < 0 || along > len) return false;
  return Math.abs(dx * uz - dz * ux) <= w / 2;
}

/** Hệ số sát thương nhận khi có Định Thần Phù (`ward` là mức giảm 0–1). */
export function wardMul(ward: number): number {
  return 1 - Math.max(0, Math.min(0.9, ward));
}

/** Nhịp tính sát thương tia (ms) và hồi riêng của lặp lại. */
export const DISC_TICK_MS = 500;
/** Tầm (m) người chat còn được boss gương lặp lại câu nói; cùng tầm với `onSkill`. */
export const ECHO_CHAT_RANGE = 60;
/** Tầm (m) nhận thông báo tách bóng. */
export const SPLIT_NOTICE_RANGE = 120;
/** Thời gian thần thức làm thể thật sáng (ms). */
export const SENSE_MS = 6000;
/** Chiêu của Tâm Ma Ảnh trong màn gương: cách nhau (giây), báo trước (giây), hệ số. */
export const VEIL_CAST = { every: 4, warn: 1.2, pow: 0.5 };

export interface MirrorHost {
  now(): number;
  players(): Iterable<PlayerEnt>;
  monsters(): readonly MonEnt[];
  isDead(p: PlayerEnt): boolean;
  monsterDef(id: string): MonsterDef | undefined;
  spawnMinion(def: MonsterDef, level: number, x: number, z: number, owner: MonEnt): MonEnt;
  addHazard(g: HazardGeom, delay: number, mul: number, kind: HazardMsg['kind'], src: string, atk: number): void;
  damagePlayer(p: PlayerEnt, n: number, src: string): void;
  fx(m: FxMsg): void;
  sys(p: PlayerEnt, k: string, params?: Record<string, string | number>, type?: string): void;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
  spawnShadow(p: PlayerEnt, st: { hp: number; atk: number; def: number }, o?: { dyaw?: number; level?: number }): MonEnt | null;
  sense(m: MonEnt, until: number): void;
  markReal(m: MonEnt): void;
  groundAt(x: number, z: number): number;
}

interface Disc {
  t0: number;
  warnUntil: number;
  until: number;
  theta0: number;
  hitAt: Map<string, number>;
}
interface Veil {
  until: number;
  shadows: string[];
  castAt: number;
  turn: number;
}
interface BossRt {
  phase: number;
  started: boolean;
  decoys: string[];
  echoAt: Map<string, number>;
  discNext: number;
  disc: Disc | null;
  veilNext: number;
  veil: Veil | null;
}

export class MirrorSystem {
  private rt = new Map<string, BossRt>();

  constructor(private readonly h: MirrorHost) {}

  private get(m: MonEnt): BossRt {
    let r = this.rt.get(m.id);
    if (!r) {
      r = { phase: 0, started: false, decoys: [], echoAt: new Map(), discNext: 0, disc: null, veilNext: 0, veil: null };
      this.rt.set(m.id, r);
    }
    return r;
  }

  private bosses(): MonEnt[] {
    return this.h.monsters().filter((m) => m.def.mirror && m.state !== MS_DEAD);
  }

  /** Còn boss gương đang giao chiến trong room (để sim biết có cần gọi hook không). */
  active(): boolean {
    return this.rt.size > 0;
  }

  tick(): void {
    const now = this.h.now();
    for (const m of this.bosses()) {
      const cfg = m.def.mirror!;
      const rt = this.get(m);
      const fighting = m.state === MS_CHASE || m.state === MS_ATTACK;
      if (!fighting) {
        if (rt.started) this.reset(m);
        continue;
      }
      if (!rt.started) {
        rt.started = true;
        rt.phase = m.phase;
        this.h.markReal(m);
        rt.discNext = now + 4000;
        rt.veilNext = now + 6000;
        if (cfg.decoys && m.phase >= cfg.decoys.phase) this.spawnDecoys(m, rt);
      }
      if (cfg.disc && m.phase >= cfg.disc.phase) this.tickDisc(m, rt, now);
      if (cfg.veil && m.phase >= cfg.veil.phase) this.tickVeil(m, rt, now);
    }
    // Boss đã chết hoặc biến mất: dọn trạng thái.
    for (const id of [...this.rt.keys()]) {
      const m = this.h.monsters().find((o) => o.id === id);
      if (!m || m.state === MS_DEAD) this.reset(m ?? null, id);
    }
  }

  /** Boss vào pha mới (sim gọi sau `setPhase`): dựng lại bóng giả nếu cơ chế đã bật. */
  onPhase(m: MonEnt, ph: number): void {
    const cfg = m.def.mirror;
    if (!cfg) return;
    const rt = this.get(m);
    rt.phase = ph;
    if (rt.started && cfg.decoys && ph >= cfg.decoys.phase) this.spawnDecoys(m, rt);
    if (rt.started && cfg.disc && ph === cfg.disc.phase) rt.discNext = this.h.now() + 2500;
  }

  /** Quái chết: bóng giả nổ vòng. */
  onKill(m: MonEnt): void {
    if (m.def.mirror) return this.reset(m);
    if (!m.minionOf) return;
    const boss = this.h.monsters().find((o) => o.id === m.minionOf);
    const cfg = boss?.def.mirror?.decoys;
    if (!boss || !cfg || m.def.id !== cfg.mon) return;
    const rt = this.rt.get(boss.id);
    if (rt) rt.decoys = rt.decoys.filter((id) => id !== m.id);
    this.h.addHazard({ x: m.s.x, z: m.s.z, r: cfg.boom.r }, cfg.boom.delay, cfg.boom.mul, 'spirit', m.id, boss.atk);
    this.h.fx({ t: 'mirror_shatter', x: m.s.x, y: m.s.y, z: m.s.z, r: cfg.boom.r, d: cfg.boom.delay });
  }

  /** Người chơi ra chiêu sát thương: bóng thật phản lại đúng chỗ người đó. */
  onSkill(p: PlayerEnt, skillId: string): void {
    if (this.rt.size === 0) return;
    const sk = SKILL.get(skillId);
    if (!sk || !(sk.kind === 'damage' || sk.kind === 'aoe' || sk.kind === 'line' || sk.kind === 'dash')) return;
    const now = this.h.now();
    for (const m of this.bosses()) {
      const cfg = m.def.mirror?.echo;
      const rt = this.rt.get(m.id);
      if (!cfg || !rt?.started || m.phase < cfg.phase) continue;
      if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) > 60) continue;
      if (now < (rt.echoAt.get(p.sid) ?? 0)) continue;
      rt.echoAt.set(p.sid, now + cfg.cd * 1000);
      this.h.addHazard({ x: p.move.x, z: p.move.z, r: cfg.r }, cfg.delay, cfg.mul, 'spirit', m.id, m.atk);
      this.h.fx({ t: 'mirror_echo', src: m.id, dst: p.sid, s: skillId, x: p.move.x, z: p.move.z, r: cfg.r, d: cfg.delay });
    }
  }

  /** Câu chat gần boss: nó lặp lại câu cuối của người đối diện. Chỉ boss có `mirror.echo` đã giao chiến và người chat trong `ECHO_CHAT_RANGE` m. */
  echoLine(text: string, p: PlayerEnt): { boss: MonEnt; line: string } | null {
    if (this.rt.size === 0) return null;
    const m = this.bosses().find((o) => o.def.mirror?.echo && this.rt.get(o.id)?.started && Math.hypot(p.move.x - o.s.x, p.move.z - o.s.z) <= ECHO_CHAT_RANGE);
    if (!m) return null;
    const line = text.trim().replace(/[?!.…]+$/u, '');
    if (!line) return null;
    return { boss: m, line: line.slice(0, 60) + '.' };
  }

  /** Người chơi quét thần thức: thể thật trong tầm sáng vàng. */
  onScan(p: PlayerEnt, hits: readonly SpiritHit[]): void {
    void hits;
    const now = this.h.now();
    for (const m of this.bosses()) {
      if (!this.rt.get(m.id)?.started) continue;
      if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) > 120) continue;
      this.h.sense(m, now + SENSE_MS);
    }
  }

  // ---------- nội bộ ----------

  private spawnDecoys(m: MonEnt, rt: BossRt): void {
    const cfg = m.def.mirror!.decoys!;
    this.clearDecoys(rt);
    const def = this.h.monsterDef(cfg.mon);
    if (!def) return;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < cfg.n; i++) {
      const a = a0 + ((i + 1) * Math.PI * 2) / (cfg.n + 1);
      const e = this.h.spawnMinion(def, m.level, m.s.x + Math.cos(a) * cfg.r, m.s.z + Math.sin(a) * cfg.r, m);
      e.s.yaw = a + Math.PI;
      rt.decoys.push(e.id);
    }
    this.h.fx({ t: 'mirror_split', src: m.id, x: m.s.x, z: m.s.z, r: cfg.r });
    // Room thế giới mở (boss ngoài trời): chỉ người trong tầm boss nhận tin, không báo cả room.
    for (const p of this.h.players()) if (Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) <= SPLIT_NOTICE_RANGE) this.h.sys(p, 'sys.mirror_split', undefined, 'info');
  }

  private clearDecoys(rt: BossRt): void {
    for (const id of rt.decoys) {
      const d = this.h.monsters().find((o) => o.id === id);
      if (d && d.state !== MS_DEAD) {
        d.minionOf = undefined;
        d.s.hp = 0;
        d.state = MS_DEAD;
        d.s.st = MS_DEAD;
        d.removeAt = this.h.now() + 800;
      }
    }
    rt.decoys = [];
  }

  private tickDisc(m: MonEnt, rt: BossRt, now: number): void {
    const cfg = m.def.mirror!.disc!;
    if (!rt.disc) {
      if (now < rt.discNext) return;
      rt.disc = { t0: now, warnUntil: now + cfg.warn * 1000, until: now + (cfg.warn + cfg.dur) * 1000, theta0: Math.random() * Math.PI * 2, hitAt: new Map() };
      this.h.fx({ t: 'mirror_disc', src: m.id, x: m.s.x, z: m.s.z, r: cfg.len, d: cfg.dur, n: cfg.beams, sd: Math.round(rt.disc.theta0 * 1000), pg: cfg.warn * 100 });
      return;
    }
    const d = rt.disc;
    if (now >= d.until) {
      rt.disc = null;
      rt.discNext = now + cfg.cd * 1000;
      return;
    }
    if (now < d.warnUntil) return;
    const t = (now - d.warnUntil) / 1000;
    for (const p of this.h.players()) {
      if (this.h.isDead(p) || (p.s.fl & PF_DEAD) !== 0) continue;
      if (now < (d.hitAt.get(p.sid) ?? 0)) continue;
      for (let i = 0; i < cfg.beams; i++) {
        const a = discAngle(d.theta0, i, cfg.beams, cfg.spin, t);
        if (!inBeam(m.s.x, m.s.z, a, cfg.len, cfg.w, p.move.x, p.move.z)) continue;
        // Lướt/bay cao qua tia thì không trúng, như vùng nổ thường.
        if (p.move.y - this.h.groundAt(p.move.x, p.move.z) > 8) continue;
        d.hitAt.set(p.sid, now + DISC_TICK_MS);
        const n = computeDamage(m.atk, cfg.mul, p.char.def, Math.random(), 1).dmg;
        this.h.damagePlayer(p, Math.max(1, Math.round(n)), m.id);
        break;
      }
    }
  }

  private tickVeil(m: MonEnt, rt: BossRt, now: number): void {
    const cfg = m.def.mirror!.veil!;
    if (!rt.veil) {
      if (now < rt.veilNext) return;
      const inside = [...this.h.players()].filter((p) => !this.h.isDead(p) && Math.hypot(p.move.x - m.s.x, p.move.z - m.s.z) <= cfg.r);
      if (inside.length === 0) {
        rt.veilNext = now + 3000;
        return;
      }
      const shadows: string[] = [];
      for (const p of inside) {
        const c = p.char;
        const base = shadowStats(c.level, c.atk, c.def);
        const sh = this.h.spawnShadow(p, { hp: Math.max(1, Math.round(c.mhp * cfg.hpMul)), atk: Math.max(1, Math.round(base.atk * cfg.atkMul)), def: base.def });
        if (sh) {
          shadows.push(sh.id);
          this.h.sys(p, 'sys.mirror_veil', undefined, 'bad');
        }
      }
      rt.veil = { until: now + cfg.dur * 1000, shadows, castAt: now + 3000, turn: 0 };
      this.h.fx({ t: 'mirror_veil', src: m.id, x: m.s.x, z: m.s.z, r: cfg.r, d: cfg.dur });
      return;
    }
    const v = rt.veil;
    const live = v.shadows.map((id) => this.h.monsters().find((o) => o.id === id)).filter((o): o is MonEnt => !!o && o.state !== MS_DEAD);
    if (now >= v.until || live.length === 0) {
      // Hết màn: bóng còn lại tan.
      for (const sh of live) {
        sh.s.hp = 0;
        sh.state = MS_DEAD;
        sh.s.st = MS_DEAD;
        sh.removeAt = now + 600;
      }
      rt.veil = null;
      rt.veilNext = now + cfg.cd * 1000;
      this.h.fx({ t: 'mirror_veil', src: m.id, d: 0 });
      return;
    }
    if (now < v.castAt) return;
    v.castAt = now + VEIL_CAST.every * 1000;
    for (const sh of live) {
      const owner = [...this.h.players()].find((p) => p.sid === sh.owner);
      if (!owner || this.h.isDead(owner)) continue;
      const ids = tamMaSkills(owner.char.meta.method, owner.char.level);
      const id = ids[v.turn % Math.max(1, ids.length)];
      const sk = id ? SKILL.get(id) : undefined;
      if (!sk) continue;
      const pow = VEIL_CAST.pow * Math.max(1, sk.power);
      if (sk.kind === 'aoe') this.h.addHazard({ x: owner.move.x, z: owner.move.z, r: Math.min(8, sk.radius ?? 5) }, VEIL_CAST.warn, pow, 'spirit', sh.id, sh.atk);
      else {
        const dx = owner.move.x - sh.s.x;
        const dz = owner.move.z - sh.s.z;
        this.h.addHazard({ x: sh.s.x, z: sh.s.z, r: Math.min(16, Math.hypot(dx, dz) + 4), sh: 'rect', yaw: Math.atan2(dx, dz), w: 3 }, VEIL_CAST.warn, pow, 'spirit', sh.id, sh.atk);
      }
      this.h.fx({ t: 'tamma_cast', src: sh.id, s: sk.id, x: owner.move.x, z: owner.move.z, d: VEIL_CAST.warn });
    }
    v.turn++;
  }

  /** Boss thoát trận/chết: dọn bóng giả, đĩa, màn. */
  private reset(m: MonEnt | null, id = m?.id ?? ''): void {
    const rt = this.rt.get(id);
    if (!rt) return;
    this.clearDecoys(rt);
    if (rt.veil) {
      for (const sid of rt.veil.shadows) {
        const sh = this.h.monsters().find((o) => o.id === sid);
        if (sh && sh.state !== MS_DEAD) {
          sh.s.hp = 0;
          sh.state = MS_DEAD;
          sh.s.st = MS_DEAD;
          sh.removeAt = this.h.now() + 600;
        }
      }
      this.h.fx({ t: 'mirror_veil', src: id, d: 0 });
    }
    if (rt.disc) this.h.fx({ t: 'mirror_disc', src: id, d: 0 });
    this.rt.delete(id);
  }
}

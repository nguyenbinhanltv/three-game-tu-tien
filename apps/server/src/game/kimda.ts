// Kim Dạ Cung (DV-3E): cơ chế riêng của phó bản 2 chương 5, mọi thứ do server phán định (client chỉ vẽ cột bia `kd_stele` và vạch báo `pool`).
//  - Châm Bà (`kd.mend`): định kỳ hồi khí huyết cho bầy quanh nó; làm nó mất thế hoặc hạ nó trước để cắt.
//  - Tinh anh đôi (`kd.twin`): một con chết thì con còn lại nổi giận.
//  - Tẫn Hỏa Kiếm Cơ (`kd.trail`): mỗi đòn chém/lao nổ xong để lại vệt lửa trên sàn một lúc, đứng trong vệt mất khí huyết theo giây.
//  - Mặc cả (Ma Hậu, `kd.bargain`): mỗi lần niệm chú có thêm bóng niệm chú ở phía đối diện sảnh; chú xong mà bóng còn sống thì cả đội chịu phạt
//    (thay Tẫn ấn 5 tầng, chưa có hệ Tẫn ấn).
//  - Kim dạ (Ma Hậu, `kd.night`): sàn tối, chỉ vòng quanh các bia là sáng, ngoài vòng mất khí huyết; boss dập luân phiên từng bia, bia trống quá lâu cũng tắt.
// Cấu hình ở `monsters.json` (`kd`), kiểu `MonsterKimDa`. Hàm thuần và lớp `KimDaSystem` có test ở kimda.test.ts.

import { MS_DEAD, type FxMsg, type MonsterKimDa } from '@dtl/shared';
import type { Hazard, MonEnt, PlayerEnt } from './sim';

export interface Pt {
  x: number;
  z: number;
}
export interface Circle extends Pt {
  r: number;
}

/** Điểm (px, pz) có nằm trong ít nhất một vòng không. */
export function inAny(circles: readonly Circle[], px: number, pz: number): boolean {
  return circles.some((c) => (px - c.x) ** 2 + (pz - c.z) ** 2 <= c.r * c.r);
}

/** Chỗ bóng niệm chú đứng: đối xứng boss qua tâm sảnh, cách boss ít nhất `sep` mét (boss gần tâm thì đẩy ra phía +x). */
export function shadowSpot(boss: Pt, center: Pt, sep: number): Pt {
  let dx = 2 * (center.x - boss.x);
  let dz = 2 * (center.z - boss.z);
  let d = Math.hypot(dx, dz);
  if (d < 1e-3) {
    dx = 1;
    dz = 0;
    d = 1;
  }
  const k = Math.max(d, sep) / d;
  return { x: boss.x + dx * k, z: boss.z + dz * k };
}

/** Các điểm vệt lửa của một vùng đã nổ: hình chữ nhật (đường chém) thì rải dọc theo chiều dài mỗi `step` mét, vùng tròn nhỏ thì một điểm tâm. */
export function trailPoints(h: { x: number; z: number; r: number; sh?: string; yaw?: number }, step: number, max = 12): Pt[] {
  if (h.sh === 'cone') return [];
  if (h.sh !== 'rect') return h.r <= 8 ? [{ x: h.x, z: h.z }] : [];
  const yaw = h.yaw ?? 0;
  const n = Math.min(max, Math.max(1, Math.floor(h.r / step)));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) {
    const d = (i / n) * h.r;
    out.push({ x: h.x + Math.sin(yaw) * d, z: h.z + Math.cos(yaw) * d });
  }
  return out;
}

export interface KimDaHost {
  now(): number;
  monsters(): readonly MonEnt[];
  players(): Iterable<PlayerEnt>;
  isDead(p: PlayerEnt): boolean;
  isGhost(p: PlayerEnt): boolean;
  damagePlayer(p: PlayerEnt, n: number, src: string): void;
  healMonster(m: MonEnt, n: number): void;
  /** Gọi một quái (bóng niệm chú) đứng ở (x, z). */
  spawn(mon: string, level: number, x: number, z: number): MonEnt | null;
  /** Gỡ quái ngay, không rơi đồ, không tính hạ. */
  despawn(m: MonEnt): void;
  /** Vùng nguy hiểm của quái (để biết đòn nào vừa nổ xong). */
  hazardsOf(m: MonEnt): readonly Hazard[];
  marker(x: number, z: number, r: number, dur: number, kind: 'fire' | 'frost'): void;
  /** Đòn thật của boss: nổ sau `delay` giây, vòng tròn r. */
  smash(m: MonEnt, x: number, z: number, r: number, delay: number, mul: number): void;
  fx(msg: FxMsg): void;
  center(): Pt;
  sysAll(k: string, params?: Record<string, string | number>, type?: string): void;
}

interface Stele extends Circle {
  /** Tắt tới lúc này (ms); 0 = sáng. */
  dark: number;
  emptySince: number;
}

const MAX_POOLS = 40;

export class KimDaSystem {
  private mendAt = new Map<string, number>();
  private mendSaid = false;
  private twinPeak = new Map<string, number>();
  private enraged = new Set<string>();
  private seenHaz = new Map<string, Set<Hazard>>();
  private pools: { x: number; z: number; r: number; until: number; dps: number }[] = [];
  private bargainStart = 0;
  private bargainEnd = 0;
  private shadow: MonEnt | null = null;
  private night: Stele[] | null = null;
  private nightSmashAt = 0;
  private nightNext = 0;
  private nightFxAt = 0;
  private nightWho = '';
  private last: number;

  constructor(private readonly h: KimDaHost) {
    this.last = h.now();
  }

  /** Số tầng phạt mặc cả đã áp (để test/quan sát). */
  bargainPenalties = 0;

  tick(): void {
    const now = this.h.now();
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;
    const mons = this.h.monsters();
    for (const m of mons) {
      if (m.state === MS_DEAD) continue;
      const kd = m.def.kd;
      if (!kd) continue;
      if (kd.mend) this.tickMend(m, kd.mend, now, mons);
      if (kd.trail) this.tickTrail(m, kd.trail, now);
      if (kd.bargain) this.tickBargain(m, kd.bargain, now);
      if (kd.night) this.tickNight(m, kd.night, now, dt);
    }
    this.tickTwin(mons);
    this.tickPools(now, dt);
    this.cleanup(mons);
  }

  // ---------- Châm Bà ----------
  private tickMend(m: MonEnt, mend: NonNullable<MonsterKimDa['mend']>, now: number, mons: readonly MonEnt[]): void {
    if (m.stunUntil > now) return;
    const at = this.mendAt.get(m.id) ?? now + mend.cd * 500;
    if (now < at) {
      this.mendAt.set(m.id, at);
      return;
    }
    this.mendAt.set(m.id, now + mend.cd * 1000);
    let healed = 0;
    for (const o of mons) {
      if (o === m || o.state === MS_DEAD || o.def.boss || o.def.xpMul === 0 || o.s.hp >= o.s.mhp) continue;
      if ((o.s.x - m.s.x) ** 2 + (o.s.z - m.s.z) ** 2 > mend.r * mend.r) continue;
      this.h.healMonster(o, Math.round(o.s.mhp * mend.pct));
      healed++;
    }
    if (healed > 0) {
      this.h.marker(m.s.x, m.s.z, mend.r, 1.2, 'frost');
      if (!this.mendSaid) {
        this.mendSaid = true;
        this.h.sysAll('sys.kd_mend', undefined, 'info');
      }
    }
  }

  // ---------- Tinh anh đôi ----------
  private tickTwin(mons: readonly MonEnt[]): void {
    const alive = new Map<string, MonEnt[]>();
    for (const m of mons) {
      if (!m.def.kd?.twin || m.state === MS_DEAD) continue;
      const a = alive.get(m.def.id) ?? [];
      a.push(m);
      alive.set(m.def.id, a);
    }
    for (const [id, list] of alive) {
      const peak = Math.max(this.twinPeak.get(id) ?? 0, list.length);
      this.twinPeak.set(id, peak);
      if (list.length >= peak || peak < 2) continue;
      for (const m of list) {
        if (this.enraged.has(m.id)) continue;
        this.enraged.add(m.id);
        m.atk = Math.round(m.atk * m.def.kd!.twin!.mul);
        this.h.sysAll('sys.kd_twin_rage', undefined, 'bad');
      }
    }
  }

  // ---------- Vệt lửa ----------
  private tickTrail(m: MonEnt, tr: NonNullable<MonsterKimDa['trail']>, now: number): void {
    const cur = new Set(this.h.hazardsOf(m).filter((z) => z.dmg > 0));
    const prev = this.seenHaz.get(m.id);
    if (prev) {
      for (const z of prev) {
        if (cur.has(z)) continue;
        for (const p of trailPoints(z, tr.step)) this.addPool(p.x, p.z, tr.r, tr.dur, tr.dps, now);
      }
    }
    this.seenHaz.set(m.id, cur);
  }

  private addPool(x: number, z: number, r: number, dur: number, dps: number, now: number): void {
    if (this.pools.length >= MAX_POOLS) this.pools.shift();
    this.pools.push({ x, z, r, until: now + dur * 1000, dps });
    this.h.marker(x, z, r, dur, 'fire');
  }

  private tickPools(now: number, dt: number): void {
    this.pools = this.pools.filter((p) => p.until > now);
    if (this.pools.length === 0) return;
    for (const p of this.h.players()) {
      if (this.h.isDead(p) || this.h.isGhost(p)) continue;
      let dps = 0;
      for (const z of this.pools) if ((p.move.x - z.x) ** 2 + (p.move.z - z.z) ** 2 <= z.r * z.r) dps = Math.max(dps, z.dps);
      if (dps > 0) this.h.damagePlayer(p, Math.max(1, Math.round(p.s.mhp * dps * dt)), 'kd_flame');
    }
  }

  // ---------- Mặc cả ----------
  private tickBargain(m: MonEnt, cfg: NonNullable<MonsterKimDa['bargain']>, now: number): void {
    if (this.bargainEnd && now >= this.bargainEnd) this.resolveBargain();
    if (m.phase < cfg.phase || !m.chant || m.chant.startAt === this.bargainStart) return;
    this.bargainStart = m.chant.startAt;
    this.bargainEnd = m.chant.endAt;
    if (this.shadow) this.h.despawn(this.shadow);
    const at = shadowSpot({ x: m.s.x, z: m.s.z }, this.h.center(), cfg.sep);
    this.shadow = this.h.spawn(cfg.mon, m.level, at.x, at.z);
    this.h.marker(at.x, at.z, 4, Math.max(1, (m.chant.endAt - now) / 1000), 'fire');
    this.h.sysAll('sys.kd_bargain', undefined, 'info');
  }

  private resolveBargain(): void {
    this.bargainEnd = 0;
    const sh = this.shadow;
    this.shadow = null;
    if (!sh) return;
    const boss = this.h.monsters().find((x) => x.def.kd?.bargain && x.state !== MS_DEAD);
    const pen = boss?.def.kd?.bargain?.pen ?? 0;
    const alive = sh.state !== MS_DEAD && sh.s.hp > 0;
    if (alive) {
      this.bargainPenalties++;
      for (const p of this.h.players()) if (!this.h.isDead(p) && !this.h.isGhost(p)) this.h.damagePlayer(p, Math.max(1, Math.round(p.s.mhp * pen)), 'kd_bargain');
      this.h.sysAll('sys.kd_bargain_bad', undefined, 'bad');
      this.h.despawn(sh);
    } else this.h.sysAll('sys.kd_bargain_ok', undefined, 'good');
  }

  // ---------- Kim dạ ----------
  private tickNight(m: MonEnt, cfg: NonNullable<MonsterKimDa['night']>, now: number, dt: number): void {
    if (m.phase < cfg.phase) return;
    if (!this.night) {
      this.night = cfg.steles.map((s) => ({ ...s, dark: 0, emptySince: now + 2500 }));
      this.nightSmashAt = 0;
      this.nightNext = 0;
      this.nightWho = m.id;
      this.h.sysAll('sys.kd_night', { press: Math.round(cfg.press * 100) }, 'info');
    }
    const st = this.night;
    const pts: Pt[] = [];
    for (const p of this.h.players()) if (!this.h.isDead(p) && !this.h.isGhost(p)) pts.push({ x: p.move.x, z: p.move.z });
    // Bia trống người quá `grace` giây thì tắt; có người quay lại thì đếm lại (bia vẫn tắt tới hết `dur`).
    st.forEach((s, i) => {
      if (s.dark > now) return;
      const occ = pts.some((q) => (q.x - s.x) ** 2 + (q.z - s.z) ** 2 <= s.r * s.r);
      if (occ) s.emptySince = 0;
      else if (!s.emptySince) s.emptySince = now;
      else if (now - s.emptySince > cfg.grace * 1000) {
        s.dark = now + cfg.dur * 1000;
        s.emptySince = 0;
        this.h.sysAll('sys.kd_stele_out', { n: i + 1 }, 'bad');
      }
    });
    // Boss dập luân phiên từng bia còn sáng.
    if (!this.nightNext) this.nightNext = now + 4000;
    if (now >= this.nightNext) {
      const lit = st.map((s, i) => ({ s, i })).filter((o) => o.s.dark <= now);
      if (lit.length > 0) {
        const pick = lit.find((o) => o.i > (this.nightSmashAt - 1)) ?? lit[0];
        this.nightSmashAt = pick.i + 1;
        const s = pick.s;
        this.h.smash(m, s.x, s.z, s.r, cfg.warn, cfg.mul);
        this.h.marker(s.x, s.z, s.r, cfg.warn, 'fire');
        s.dark = now + (cfg.warn + cfg.dur) * 1000;
        this.h.sysAll('sys.kd_stele_smash', { n: pick.i + 1 }, 'bad');
        this.nightFxAt = 0;
      }
      this.nightNext = now + cfg.cd * 1000;
    }
    const lit = st.filter((s) => s.dark <= now);
    for (const q of this.h.players()) {
      if (this.h.isDead(q) || this.h.isGhost(q)) continue;
      if (!inAny(lit, q.move.x, q.move.z)) this.h.damagePlayer(q, Math.max(1, Math.round(q.s.mhp * cfg.press * dt)), 'kd_night');
    }
    if (now >= this.nightFxAt) {
      this.nightFxAt = now + 2000;
      st.forEach((s, i) => this.h.fx({ t: 'kd_stele', n: i, x: s.x, z: s.z, r: s.r, d: 3, pg: s.dark <= now ? 1 : 0 }));
    }
  }

  /**
   * Dọn khi chủ cơ chế không còn (chết, rút lui về pha trước, bỏ đuổi): bia/bóng mặc cả theo Ma Hậu, vệt lửa theo Kiếm Cơ.
   * Mỗi thứ dọn độc lập (Kiếm Cơ chết thì vệt lửa tắt dù Ma Hậu chưa xuất hiện; Ma Hậu chết thì bóng mặc cả không còn chặn đợt).
   */
  private cleanup(mons: readonly MonEnt[]): void {
    const now = this.h.now();
    const live = (m: MonEnt) => m.state !== MS_DEAD && m.evadeUntil <= now;
    if (this.night) {
      const ph = mons.find((m) => m.id === this.nightWho)?.def.kd?.night?.phase ?? 0;
      if (!mons.some((m) => m.id === this.nightWho && live(m) && m.phase >= ph)) {
        this.night.forEach((s, i) => this.h.fx({ t: 'kd_stele', n: i, x: s.x, z: s.z, r: s.r, d: 0, pg: 0 }));
        this.night = null;
      }
    }
    if (this.shadow || this.bargainEnd) {
      const boss = mons.find((m) => m.def.kd?.bargain && live(m) && m.phase >= m.def.kd.bargain.phase);
      if (!boss) {
        if (this.shadow) this.h.despawn(this.shadow);
        this.shadow = null;
        this.bargainEnd = 0;
      }
    }
    if (this.pools.length > 0 && !mons.some((m) => m.def.kd?.trail && m.state !== MS_DEAD)) this.pools = [];
  }

  /** Số bia đang sáng (test). */
  litCount(now = this.h.now()): number {
    return this.night ? this.night.filter((s) => s.dark <= now).length : -1;
  }
}

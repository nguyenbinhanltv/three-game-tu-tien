// Kim Dạ Cung (DV-3E): cơ chế riêng của phó bản 2 chương 5, mọi thứ do server phán định (client chỉ vẽ cột bia `kd_stele` và vạch báo `pool`).
//  - Châm Bà (`kd.mend`): định kỳ hồi khí huyết cho bầy quanh nó; làm nó mất thế hoặc hạ nó trước để cắt.
//  - Tinh anh đôi (`kd.twin`): một con chết thì con còn lại nổi giận.
//  - Mặc cả (Ma Hậu, `kd.bargain`): mỗi lần niệm chú có thêm bóng niệm chú ở phía đối diện sảnh; chú xong mà bóng còn sống thì cả đội chịu phạt
//    (thay Tẫn ấn 5 tầng, chưa có hệ Tẫn ấn).
//  - Kim dạ (Ma Hậu, `kd.night`): sàn tối, chỉ vòng quanh các bia là sáng, ngoài vòng mất khí huyết; boss dập luân phiên từng bia, bia trống quá lâu cũng tắt.
// Cấu hình ở `monsters.json` (`kd`), kiểu `MonsterKimDa`. Hàm thuần và lớp `KimDaSystem` có test ở kimda.test.ts.

import { MS_DEAD, MS_IDLE, MS_RETURN, type FxMsg, type MonsterKimDa } from '@dtl/shared';
import type { MonEnt, PlayerEnt } from './entities';

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

export interface KimDaHost {
  now(): number;
  monsters(): readonly MonEnt[];
  players(): Iterable<PlayerEnt>;
  isDead(p: PlayerEnt): boolean;
  isGhost(p: PlayerEnt): boolean;
  damagePlayer(p: PlayerEnt, n: number, src: string): void;
  healMonster(m: MonEnt, n: number): void;
  /** Gọi một quái (bóng niệm chú) đứng ở (x, z). */
  /** `owner` là boss gọi nó: quái đệ tử (`minionOf`) không rơi đồ, không tu vi, không tính hạ. */
  spawn(mon: string, level: number, x: number, z: number, owner: MonEnt): MonEnt | null;
  /** Gỡ quái ngay, không rơi đồ, không tính hạ. */
  despawn(m: MonEnt): void;
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

export class KimDaSystem {
  private mendAt = new Map<string, number>();
  private mendSaid = false;
  private twinPeak = new Map<string, number>();
  private enraged = new Map<string, number>();
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
      if (m.state === MS_DEAD || m.state === MS_RETURN) continue;
      const kd = m.def.kd;
      if (!kd) continue;
      if (kd.mend) this.tickMend(m, kd.mend, now, mons);
      if (kd.bargain) this.tickBargain(m, kd.bargain, now);
      if (kd.night) this.tickNight(m, kd.night, now, dt);
    }
    this.tickTwin(mons);
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
    // Con về chỗ cũ (bỏ đuổi, wipe): trả sức đánh gốc, đếm lại từ đầu.
    for (const [id, atk0] of [...this.enraged]) {
      const m = mons.find((x) => x.id === id);
      if (!m) this.enraged.delete(id);
      else if (m.state === MS_RETURN || m.state === MS_IDLE) {
        m.atk = atk0;
        this.enraged.delete(id);
        this.twinPeak.delete(m.def.id);
      }
    }
    const alive = new Map<string, MonEnt[]>();
    for (const m of mons) {
      if (!m.def.kd?.twin || m.state === MS_DEAD || m.state === MS_RETURN) continue;
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
        this.enraged.set(m.id, m.atk);
        m.atk = Math.round(m.atk * m.def.kd!.twin!.mul);
        this.h.sysAll('sys.kd_twin_rage', undefined, 'bad');
      }
    }
  }

  // ---------- Mặc cả ----------
  private tickBargain(m: MonEnt, cfg: NonNullable<MonsterKimDa['bargain']>, now: number): void {
    if (this.bargainEnd && now >= this.bargainEnd) this.resolveBargain();
    // Chú của boss bị ngắt (choáng) trước khi xong: chú kép tan, bóng gỡ, không phạt.
    else if (this.bargainEnd && !m.chant && m.stunUntil > now) {
      if (this.shadow) this.h.despawn(this.shadow);
      this.shadow = null;
      this.bargainEnd = 0;
      this.h.sysAll('sys.kd_bargain_ok', undefined, 'good');
    }
    if (m.phase < cfg.phase || !m.chant || m.chant.startAt === this.bargainStart) return;
    this.bargainStart = m.chant.startAt;
    this.bargainEnd = m.chant.endAt;
    if (this.shadow) this.h.despawn(this.shadow);
    const at = shadowSpot({ x: m.s.x, z: m.s.z }, this.h.center(), cfg.sep);
    this.shadow = this.h.spawn(cfg.mon, m.level, at.x, at.z, m);
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
      for (const p of this.h.players())
        if (!this.h.isDead(p) && !this.h.isGhost(p)) this.h.damagePlayer(p, Math.max(1, Math.round(p.s.mhp * pen)), 'kd_bargain');
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
        const pick = lit.find((o) => o.i > this.nightSmashAt - 1) ?? lit[0];
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
   * Dọn khi chủ cơ chế không còn (chết, rút lui về pha trước, bỏ đuổi): bia/bóng mặc cả theo Ma Hậu.
   * Mỗi thứ dọn độc lập (Ma Hậu chết thì bóng mặc cả không còn chặn đợt).
   */
  private cleanup(mons: readonly MonEnt[]): void {
    const now = this.h.now();
    const live = (m: MonEnt) => m.state !== MS_DEAD && m.state !== MS_RETURN && m.evadeUntil <= now;
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
  }

  /** Số bia đang sáng (test). */
  litCount(now = this.h.now()): number {
    return this.night ? this.night.filter((s) => s.dark <= now).length : -1;
  }
}

// Vùng kéo và vũng độc của quái (E3-G): "Nuốt" của Vân Hải Kình Vương kéo người về phía boss, Bích Ngọc Kim Thiền chết
// để lại vũng độc. Server phán định mọi thứ: vạch báo chỉ là `HazardMsg` (sát thương 0, `mv` 'pull'/'pool'); kéo người dùng
// `planDash` của shared nên không qua vách, không rơi khỏi đảo; vũng độc gây sát thương nhỏ mỗi nhịp cho ai đang đứng trong,
// ra khỏi vũng là hết. sim.ts móc vào: releaseChant (startPull), killMonster (onDeath), tick (tick).

import { type MonsterDeathPool, type MonsterPull, type MonsterTrail, inPool, pullStep, trailSpots } from '@dtl/shared';

/** Phần của người chơi mà vùng cần (PlayerEnt thỏa cấu trúc này). */
export interface ZonePlayer {
  sid: string;
  move: { x: number; y: number; z: number };
}

export interface ZoneMon {
  id: string;
  s: { x: number; z: number };
  atk: number;
  state: number;
  stunUntil: number;
}

export interface MonZoneHost {
  now(): number;
  players(): Iterable<ZonePlayer>;
  isDead(p: ZonePlayer): boolean;
  /** Người này kháng kéo (ngự kiếm, lơ lửng, độ kiếp, nguyên anh xuất khiếu...). */
  resists(p: ZonePlayer): boolean;
  /** Mon còn sống, không bỏ đuổi, không choáng/quỵ (chiêu dừng nếu mất điều kiện). */
  active(m: ZoneMon): boolean;
  /** Đi tối đa `dist` m theo hướng (dx, dz) bằng luật lướt (không xuyên vách); trả quãng đi được và áp lên người chơi. */
  drag(p: ZonePlayer, dx: number, dz: number, dist: number): number;
  /** Vạch báo (không sát thương) gửi client. */
  telegraph(x: number, z: number, r: number, delay: number, kind: string, src: string, mv: 'pull' | 'pool' | 'trail', dur?: number): void;
  /** Người ở quá cao so với mặt đất (ngự kiếm bay cao): vùng nổ và vũng độc không với tới (cùng luật `tickHazards`, > 8 m). */
  tooHigh(p: ZonePlayer): boolean;
  /** Sát thương vũng độc (đã tính phòng thủ). */
  poisonHit(p: ZonePlayer, atk: number, mul: number, src: string): void;
  /** Báo người bị kéo/kháng. */
  notify(p: ZonePlayer, key: 'sys.pull_hit' | 'sys.pull_resist'): void;
}

interface Pull {
  mon: ZoneMon;
  cfg: MonsterPull;
  at: number;
  endAt: number;
  last: number;
  victims: { p: ZonePlayer; d0: number }[] | null;
}

interface Pool {
  x: number;
  z: number;
  r: number;
  at: number;
  endAt: number;
  nextAt: number;
  cfg: MonsterDeathPool;
  atk: number;
  src: string;
}

/** Trần số vũng độc cùng lúc trong room (hạ cả bầy cùng lúc không làm đầy room). */
export const POOL_MAX = 32;

export class MonZones {
  private pulls: Pull[] = [];
  private pools: Pool[] = [];
  constructor(private readonly h: MonZoneHost) {}

  get poolCount(): number {
    return this.pools.length;
  }
  get pullCount(): number {
    return this.pulls.length;
  }

  /** Chú vừa thả: hiện vòng báo; sau `delay` giây kéo trong `dur` giây. */
  startPull(m: ZoneMon, cfg: MonsterPull, kind: string): void {
    const now = this.h.now();
    this.h.telegraph(m.s.x, m.s.z, cfg.range, cfg.delay, kind, m.id, 'pull');
    this.pulls.push({
      mon: m,
      cfg,
      at: now + cfg.delay * 1000,
      endAt: now + (cfg.delay + cfg.dur) * 1000,
      last: now + cfg.delay * 1000,
      victims: null,
    });
  }

  /**
   * Vệt dọc vạch (x, z, yaw, len): sau `delay` giây (lúc vạch nổ) chuỗi vũng tròn tồn tại `cfg.dur` giây, mỗi `cfg.tick` giây gây sát thương.
   * Vũng nào vượt trần `POOL_MAX` thì bỏ vũng cũ nhất.
   */
  addTrail(m: ZoneMon, x: number, z: number, yaw: number, len: number, cfg: MonsterTrail, delay: number): void {
    const now = this.h.now();
    const at = now + delay * 1000;
    for (const sp of trailSpots(x, z, yaw, len, cfg.r)) {
      if (this.pools.length >= POOL_MAX) this.pools.shift();
      this.pools.push({
        x: sp.x,
        z: sp.z,
        r: cfg.r,
        at,
        endAt: at + cfg.dur * 1000,
        nextAt: at + cfg.tick * 1000,
        cfg: { r: cfg.r, delay, dur: cfg.dur, tick: cfg.tick, mul: cfg.mul, kind: cfg.kind },
        atk: m.atk,
        src: m.id,
      });
      this.h.telegraph(sp.x, sp.z, cfg.r, delay, cfg.kind, m.id, 'trail', cfg.dur);
    }
  }

  /** Quái chết: để lại vũng độc theo `deathPool` (nếu có). */
  onDeath(m: ZoneMon, cfg: MonsterDeathPool | undefined): void {
    if (!cfg) return;
    const now = this.h.now();
    if (this.pools.length >= POOL_MAX) this.pools.shift();
    const at = now + cfg.delay * 1000;
    this.pools.push({
      x: m.s.x,
      z: m.s.z,
      r: cfg.r,
      at,
      endAt: at + cfg.dur * 1000,
      nextAt: at + cfg.tick * 1000,
      cfg,
      atk: m.atk,
      src: m.id,
    });
    this.h.telegraph(m.s.x, m.s.z, cfg.r, cfg.delay, cfg.kind, m.id, 'pool', cfg.dur);
  }

  tick(): void {
    const now = this.h.now();
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const pl = this.pulls[i];
      if (!this.h.active(pl.mon) || now >= pl.endAt + 100) {
        this.pulls.splice(i, 1);
        continue;
      }
      if (now < pl.at) continue;
      if (!pl.victims) this.begin(pl);
      const dt = (Math.min(now, pl.endAt) - pl.last) / 1000;
      pl.last = Math.min(now, pl.endAt);
      if (dt <= 0) continue;
      for (const v of pl.victims!) {
        if (this.h.isDead(v.p) || this.h.resists(v.p)) continue;
        const dx = pl.mon.s.x - v.p.move.x;
        const dz = pl.mon.s.z - v.p.move.z;
        const dist = Math.hypot(dx, dz);
        const step = pullStep(v.d0, dist, pl.cfg.stop, pl.cfg.dur, dt);
        if (step <= 0.001) continue;
        const moved = this.h.drag(v.p, dx / dist, dz / dist, step);
        // Bị vách/dốc chặn: ngừng kéo người này (không ép qua).
        if (moved < step * 0.5) v.d0 = 0;
      }
    }
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const po = this.pools[i];
      if (now >= po.endAt) {
        this.pools.splice(i, 1);
        continue;
      }
      if (now < po.nextAt) continue;
      po.nextAt += po.cfg.tick * 1000;
      for (const p of this.h.players()) {
        if (this.h.isDead(p) || !inPool(po.x, po.z, po.r, p.move.x, p.move.z) || this.h.tooHigh(p)) continue;
        this.h.poisonHit(p, po.atk, po.cfg.mul, po.src);
      }
    }
  }

  private begin(pl: Pull): void {
    pl.victims = [];
    for (const p of this.h.players()) {
      if (this.h.isDead(p)) continue;
      const d = Math.hypot(p.move.x - pl.mon.s.x, p.move.z - pl.mon.s.z);
      if (d > pl.cfg.range) continue;
      if (this.h.resists(p)) {
        this.h.notify(p, 'sys.pull_resist');
        continue;
      }
      this.h.notify(p, 'sys.pull_hit');
      pl.victims.push({ p, d0: d });
    }
  }

  /** Xóa mọi vùng (đổi level/đóng room). */
  clear(): void {
    this.pulls.length = 0;
    this.pools.length = 0;
  }
}

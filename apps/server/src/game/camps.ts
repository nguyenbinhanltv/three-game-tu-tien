// Bãi quái theo cụm (M-2): cụm 3–4 con giữ đội hình quanh tâm bãi, quái đánh xa nếu bãi có; cả cụm tái sinh cùng lúc sau khi bị dọn,
// thời gian hồi và số con theo số người trong vùng. Sim chỉ gọi `onKill`, `tick`; mọi luật số học ở packages/shared/src/spawnrules.ts.

import {
  campMeleeCount,
  campRespawnSec,
  formationSlots,
  MS_DEAD,
  type CampDef,
  type SpawnDef,
} from '@dtl/shared';
import type { CampRt, MonEnt } from './entities';
export type { CampRt };


export interface CampHost {
  now(): number;
  /** Sinh một quái sống ngay tại (x, z) (điểm nhà = vị trí này). */
  spawn(monId: string, level: number, x: number, z: number, sp: SpawnDef): MonEnt | null;
  /** Hồi sinh một quái đã chết tại (x, z). */
  revive(m: MonEnt, x: number, z: number): void;
  remove(m: MonEnt): void;
  /** Điểm hợp lệ (không dưới nước) gần (x, z). */
  snap(x: number, z: number): { x: number; z: number };
  /** Số người đang sống trong vùng `zone`. */
  playersIn(zone: string): number;
}

export class CampSystem {
  readonly camps: CampRt[] = [];

  constructor(private host: CampHost) {}

  /** Dựng các bãi lúc khởi động: mỗi bãi một cụm đủ số con gốc. */
  init(defs: readonly CampDef[]): void {
    for (const def of defs) {
      const base = { x: def.x, z: def.z, radius: def.radius, levelMin: def.levelMin, levelMax: def.levelMax, respawn: def.respawn };
      const rt: CampRt = {
        def,
        sp: { mon: def.mon, count: def.count, ...base },
        spRanged: def.ranged ? { mon: def.ranged, count: 1, ...base } : undefined,
        phase: hash01(def.id) * Math.PI * 2,
        melee: [],
        respawnAt: 0,
      };
      this.camps.push(rt);
      this.fill(rt, def.count, false);
    }
  }

  private level(rt: CampRt): number {
    const d = rt.def;
    return d.levelMin + Math.floor(Math.random() * (d.levelMax - d.levelMin + 1));
  }

  /** Dựng/hồi sinh cả cụm: `n` con thường (thêm con mới nếu thiếu, bỏ con thừa) và con đánh xa. */
  private fill(rt: CampRt, n: number, revive: boolean): void {
    const slots = formationSlots(rt.def.x, rt.def.z, rt.def.radius, n, rt.phase, !!rt.spRanged);
    const place = (s: { x: number; z: number }) => {
      const p = this.host.snap(s.x + (Math.random() - 0.5) * 1.6, s.z + (Math.random() - 0.5) * 1.6);
      return p;
    };
    // Bớt con thừa (đã chết hết nên chỉ cần gỡ khỏi thế giới).
    while (rt.melee.length > n) this.host.remove(rt.melee.pop()!);
    for (let i = 0; i < n; i++) {
      const at = place(slots.melee[i]);
      const m = rt.melee[i];
      if (m) {
        if (revive) this.host.revive(m, at.x, at.z);
      } else {
        const nm = this.host.spawn(rt.def.mon, this.level(rt), at.x, at.z, rt.sp);
        if (nm) {
          nm.camp = rt;
          rt.melee.push(nm);
        }
      }
    }
    if (rt.spRanged && slots.ranged) {
      const at = place(slots.ranged);
      if (rt.ranged) {
        if (revive) this.host.revive(rt.ranged, at.x, at.z);
      } else {
        const nm = this.host.spawn(rt.spRanged.mon, this.level(rt), at.x, at.z, rt.spRanged);
        if (nm) {
          nm.camp = rt;
          rt.ranged = nm;
        }
      }
    }
    rt.respawnAt = 0;
  }

  private members(rt: CampRt): MonEnt[] {
    return rt.ranged ? [...rt.melee, rt.ranged] : rt.melee;
  }

  /** Một thành viên bị hạ: nếu cả cụm đã bị dọn thì hẹn giờ tái sinh theo số người trong vùng. */
  onKill(m: MonEnt): void {
    const rt = m.camp;
    if (!rt) return;
    if (this.members(rt).some((x) => x.state !== MS_DEAD)) return;
    rt.respawnAt = this.host.now() + campRespawnSec(rt.def.respawn, this.host.playersIn(rt.def.zone)) * 1000;
  }

  /** Mỗi tick: cụm tới giờ thì tái sinh, số con theo số người lúc đó. */
  tick(): void {
    const now = this.host.now();
    for (const rt of this.camps) {
      if (!rt.respawnAt || now < rt.respawnAt) continue;
      this.fill(rt, campMeleeCount(rt.def.count, this.host.playersIn(rt.def.zone)), true);
    }
  }

  /** Bãi chứa quái `m` còn con nào sống không (cho báo cáo, test). */
  alive(rt: CampRt): number {
    return this.members(rt).filter((x) => x.state !== MS_DEAD).length;
  }
}

/** Băm chuỗi thành [0,1) ổn định (đặt góc đội hình theo id bãi). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}


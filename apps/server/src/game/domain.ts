// Lĩnh vực (E4-K): vùng quanh thân từ Nguyên Anh trung kỳ (8 m, 10 m ở cấp 26, 20 m ở Hóa Thần sơ kỳ), hiệu ứng thụ động theo vai trò công pháp.
//  - Kiếm tu (dps): chủ được cộng bạo kích (`critAdd`).
//  - Hộ pháp (tank): chủ và đồng đội trong vùng giảm sát thương nhận (`reduce`, lấy mức cao nhất, không cộng dồn).
//  - Đan sư (support): chủ và đồng đội trong vùng hồi một phần khí huyết mỗi giây (tick).
// Công thức ở `packages/shared/src/clone.ts`. Chỉ server tính; client chỉ vẽ vòng nhạt dưới chân chủ.

import { DOMAIN_EFFECT, DOMAIN_TICK_MS, domainRadius, domainScale, type MethodRole } from '@dtl/shared';
import { METHOD } from '@dtl/content';
import type { PlayerEnt } from './sim';

export interface DomainHost {
  now(): number;
  players(): Iterable<PlayerEnt>;
  canAssist(owner: PlayerEnt, o: PlayerEnt): boolean;
  heal(p: PlayerEnt, n: number): void;
}

interface Aura {
  p: PlayerEnt;
  r: number;
  reduce: number;
}

export function domainRole(p: PlayerEnt): MethodRole | null {
  const m = p.char.meta.method;
  return m ? (METHOD.get(m)?.role ?? null) : null;
}

export class DomainSystem {
  private nextAt = 0;
  /** Lĩnh vực hộ pháp đang mở (dựng lại mỗi nhịp, nên `reduce` rẻ ở giữa trận). */
  private tanks: Aura[] = [];

  constructor(private h: DomainHost) {}

  /** Bạo kích cộng thêm của chủ nhờ lĩnh vực kiếm tu. */
  critAdd(p: PlayerEnt): number {
    if (domainRadius(p.char.level) <= 0 || domainRole(p) !== 'dps') return 0;
    return DOMAIN_EFFECT.dps.crit * domainScale(p.char.level);
  }

  /** Tỉ lệ sát thương nhận giảm cho `p` nhờ lĩnh vực hộ pháp của chủ/đồng đội (0 nếu không). */
  reduce(p: PlayerEnt): number {
    let best = 0;
    for (const a of this.tanks) {
      if (a.reduce <= best) continue;
      if (a.p !== p && !(this.h.canAssist(a.p, p) && Math.hypot(p.move.x - a.p.move.x, p.move.z - a.p.move.z) <= a.r)) continue;
      best = a.reduce;
    }
    return best;
  }

  tick(): void {
    const now = this.h.now();
    if (now < this.nextAt) return;
    this.nextAt = now + DOMAIN_TICK_MS;
    this.tanks = [];
    const healers: { p: PlayerEnt; r: number; regen: number }[] = [];
    for (const p of this.h.players()) {
      const r = domainRadius(p.char.level);
      if (r <= 0) continue;
      const role = domainRole(p);
      if (role === 'tank') this.tanks.push({ p, r, reduce: DOMAIN_EFFECT.tank.reduce * domainScale(p.char.level) });
      else if (role === 'support') healers.push({ p, r, regen: DOMAIN_EFFECT.support.regen * domainScale(p.char.level) });
    }
    for (const hl of healers) {
      for (const o of this.h.players()) {
        if (o.char.hp >= o.char.mhp || o.char.hp <= 0) continue;
        if (o !== hl.p && !(this.h.canAssist(hl.p, o) && Math.hypot(o.move.x - hl.p.move.x, o.move.z - hl.p.move.z) <= hl.r)) continue;
        this.h.heal(o, Math.max(1, Math.round(o.char.mhp * hl.regen)));
      }
    }
  }
}

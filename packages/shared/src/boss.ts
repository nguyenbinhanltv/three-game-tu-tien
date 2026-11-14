// Luật boss dùng chung: pha theo máu và thanh phá thế. Hàm thuần.
// Server dùng để phán định; client chỉ dùng để vẽ (thanh niệm chú, vạch pha) cho khớp.

import type { MonsterAi, MonsterDef, MonsterPhase, MonsterPosture } from './types';

/**
 * Pha ứng với tỉ lệ máu `frac` (0–1). Pha 0 là pha đầu; pha i (≥ 1) bắt đầu khi máu ≤ `phases[i-1].hp`.
 * Không bao giờ trả về pha thấp hơn `cur` (pha không lùi trong một trận).
 */
export function bossPhaseAt(frac: number, phases: readonly MonsterPhase[] | undefined, cur = 0): number {
  let ph = 0;
  if (phases) {
    for (let i = 0; i < phases.length; i++) if (frac <= phases[i].hp) ph = i + 1;
  }
  return Math.max(cur, ph);
}

/** Bộ chiêu và hệ số nhịp của boss ở pha `ph`: lần lượt ghi đè pha 1..ph lên `def.ai`. */
export interface PhaseRules {
  ai: MonsterAi;
  cdMul: number;
  speedMul: number;
}

export function phaseRules(def: Pick<MonsterDef, 'ai' | 'phases'>, ph: number): PhaseRules {
  const ai: MonsterAi = { ...def.ai };
  let cdMul = 1;
  let speedMul = 1;
  const n = Math.min(ph, def.phases?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const p = def.phases![i];
    if (p.ai) {
      for (const k of Object.keys(p.ai) as (keyof MonsterAi)[]) {
        const v = p.ai[k];
        if (v === null) delete ai[k];
        else if (v !== undefined) (ai as Record<string, unknown>)[k] = v;
      }
    }
    if (p.cdMul !== undefined) cdMul = p.cdMul;
    if (p.speedMul !== undefined) speedMul = p.speedMul;
  }
  return { ai, cdMul, speedMul };
}

/** Phá thế lấp thêm sau một đòn (chưa cộng phần ngắt chú). */
export function postureGain(cfg: MonsterPosture, dmg: number, mhp: number, heavy: boolean): number {
  if (!(mhp > 0) || !(dmg > 0)) return heavy ? cfg.heavy : 0;
  return (dmg / mhp) * cfg.k + (heavy ? cfg.heavy : 0);
}

/** Phá thế sau `dt` giây, khi lần trúng đòn cuối cách đây `idle` giây. */
export function postureDecay(cfg: MonsterPosture, cur: number, idle: number, dt: number): number {
  if (idle < cfg.wait) return cur;
  return Math.max(0, cur - cfg.decay * dt);
}

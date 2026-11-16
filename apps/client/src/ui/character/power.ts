// TẠM THỜI (chờ TD-A merge): bản sao `combatPower` của TD-A (packages/shared/src/inventory.ts). Khi TD-A vào main, xóa tệp này
// và import `combatPower` từ '@dtl/shared'.
import type { PlayerStats } from '@dtl/shared';

export const POWER_W = { atk: 4, def: 3, hp: 0.2, mp: 0.1 } as const;

export function combatPower(s: Pick<PlayerStats, 'hp' | 'mp' | 'atk' | 'def'> & Partial<Pick<PlayerStats, 'critRate' | 'critMul' | 'cdr' | 'lifesteal' | 'healRecv' | 'eliteDmg'>>): number {
  const base = s.atk * POWER_W.atk + s.def * POWER_W.def + s.hp * POWER_W.hp + s.mp * POWER_W.mp;
  const crit = 1 + (s.critRate ?? 0) * Math.max(0, (s.critMul ?? 1) - 1);
  const misc = 1 + (s.cdr ?? 0) * 0.5 + (s.lifesteal ?? 0) * 2 + (s.healRecv ?? 0) * 0.3 + (s.eliteDmg ?? 0) * 0.3;
  return Math.round(base * crit * misc);
}

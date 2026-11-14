// Ước tính nhịp lên cảnh giới: một người chơi một mình, đánh quái hợp cấp, làm đủ chuỗi nhiệm vụ.
// Chạy: pnpm sim:progress

import { computeDamage, GCD, monsterStats, monsterXp, NGUNG_KHI_MAX, playerBaseStats, xpLevelFactor, xpNeed } from '@dtl/shared';
import { ITEM, LEVELS, MONSTER, QUESTS, realmName, SKILLS } from './index';

/** Trang bị dự kiến ở mỗi cảnh giới (theo phần thưởng nhiệm vụ). */
function gear(level: number): { atk: number; def: number; hp: number } {
  const pick = (ids: string[]) => {
    let best = { atk: 0, def: 0, hp: 0 };
    for (const id of ids) {
      const d = ITEM.get(id);
      if (d && (d.reqLevel ?? 1) <= level) best = { atk: d.stats?.atk ?? 0, def: d.stats?.def ?? 0, hp: d.stats?.hp ?? 0 };
    }
    return best;
  };
  const w = pick(['itm_moc_kiem', 'itm_thiet_kiem', 'itm_thanh_phong_kiem']);
  const r = pick(['itm_bo_y', 'itm_dao_bao', 'itm_linh_ti_bao']);
  return { atk: w.atk + r.atk, def: w.def + r.def, hp: w.hp + r.hp };
}

/** Sát thương trung bình mỗi giây của người chơi lên một quái (xoay vòng các chiêu đã mở). */
function playerDps(level: number, atk: number, monDef: number): number {
  let perSec = 0;
  let gcdUsed = 0;
  for (const s of SKILLS) {
    if (s.unlock > level || (s.kind !== 'damage' && s.kind !== 'aoe') || s.cd <= 0) continue;
    const dmg = computeDamage(atk, s.power, monDef, 0.5, 1).dmg * 1.06;
    perSec += dmg / s.cd;
    gcdUsed += (GCD + s.cast) / s.cd;
  }
  const basic = computeDamage(atk, SKILLS[0].power, monDef, 0.5, 1).dmg * 1.06;
  perSec += (basic / GCD) * Math.max(0, 1 - gcdUsed);
  return perSec;
}

const spawns = LEVELS.van_lam.spawns.filter((s) => !MONSTER.get(s.mon)?.boss);
let totalSec = 0;
let questXp = 0;
const questByLevel = new Map<number, number>();
for (const q of QUESTS) {
  // Nhiệm vụ làm xong quanh cấp của quái mục tiêu.
  let lv = q.minLevel ?? 1;
  for (const o of q.objectives) {
    const sp = spawns.find((s) => s.mon === o.target);
    if (sp) lv = Math.max(lv, sp.levelMin);
  }
  questByLevel.set(lv, (questByLevel.get(lv) ?? 0) + q.rewards.xp);
}

console.log('Cảnh giới            quái (cấp)              TTK   giết   phút   cộng dồn');
for (let level = 1; level <= NGUNG_KHI_MAX; level++) {
  const base = playerBaseStats(level);
  const g = gear(level);
  // Chọn bãi quái có cấp gần nhất không vượt quá cấp người chơi + 1.
  const sp = [...spawns].sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level))[0];
  const def = MONSTER.get(sp.mon)!;
  const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
  const ms = monsterStats(mlv, def.hpMul, def.atkMul);
  const ttk = ms.hp / playerDps(level, base.atk + g.atk, ms.def);
  const xpPerKill = monsterXp(mlv, def.xpMul) * xpLevelFactor(level, mlv);
  let need = xpNeed(level);
  const qx = questByLevel.get(level) ?? 0;
  questXp += qx;
  need = Math.max(0, need - qx);
  const kills = Math.ceil(need / xpPerKill);
  // Mỗi lần giết: thời gian đánh + 6 giây tìm quái và hồi phục.
  const sec = kills * (ttk + 6);
  totalSec += sec;
  console.log(
    `${realmName(level).padEnd(20)} ${(def.id + ' (' + mlv + ')').padEnd(23)} ${ttk.toFixed(1).padStart(4)}s ${String(kills).padStart(5)} ${(sec / 60).toFixed(0).padStart(6)} ${(totalSec / 3600).toFixed(1).padStart(8)} giờ`,
  );
}
console.log(`\nTổng tu vi từ nhiệm vụ: ${questXp}. Ước tính từ tầng 1 đến viên mãn tầng 15: ${(totalSec / 3600).toFixed(1)} giờ chơi một mình (chưa tính đi lại, boss, bí cảnh).`);

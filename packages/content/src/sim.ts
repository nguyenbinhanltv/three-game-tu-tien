// Ước tính nhịp lên cảnh giới: một người chơi một mình, đánh quái hợp cấp, làm đủ chuỗi nhiệm vụ.
// Tính cả máu mất mỗi lần giết (đứng yên, không né vùng) và thời gian đả tọa hồi lại.
// Chạy: pnpm sim:progress

import type { MonsterDef } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  computeDamage,
  GCD,
  HP_REGEN_MEDITATE,
  INTERRUPT_VULN_MUL,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  phaseRules,
  NGUNG_KHI_MAX,
  shadowStats,
  TRIAL_DURATION,
  playerBaseStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
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

function player(level: number): { atk: number; def: number; hp: number } {
  const b = playerBaseStats(level);
  const g = gear(level);
  return { atk: b.atk + g.atk, def: b.def + g.def, hp: b.hp + g.hp };
}

/** Sát thương trung bình một đòn (roll giữa, không bạo kích). */
const hit = (atk: number, power: number, def: number) => computeDamage(atk, power, def, 0.5, 1).dmg;

/** Sát thương trung bình mỗi giây của người chơi lên một quái (xoay vòng các chiêu đã mở). */
function playerDps(level: number, atk: number, monDef: number): number {
  let perSec = 0;
  let gcdUsed = 0;
  for (const s of SKILLS) {
    if (s.unlock > level || (s.kind !== 'damage' && s.kind !== 'aoe') || s.cd <= 0) continue;
    const dmg = hit(atk, s.power, monDef) * 1.06;
    perSec += dmg / s.cd;
    gcdUsed += (GCD + s.cast) / s.cd;
  }
  const basic = hit(atk, SKILLS[0].power, monDef) * 1.06;
  perSec += (basic / GCD) * Math.max(0, 1 - gcdUsed);
  return perSec;
}

/** Máu tự hồi bằng chiêu (khiên, hồi nguyên) tính theo tỉ lệ máu tối đa mỗi giây, nếu dùng đều tay. */
function selfSustain(level: number): number {
  let r = 0;
  for (const s of SKILLS) {
    if (s.unlock > level || s.cd <= 0) continue;
    if (s.kind === 'heal' || s.kind === 'shield') r += s.power / s.cd;
  }
  return r;
}

/** Sát thương mỗi giây một quái thường gây lên người đứng yên, không né vùng. */
function monsterDps(def: MonsterDef, atk: number, pDef: number): number {
  const cs = def.ai?.caster;
  if (cs) return hit(atk, cs.mul, pDef) / (cs.cast + cs.cd);
  const cb = def.ai?.combo;
  return (hit(atk, 1, pDef) + (cb ? cb.chance * hit(atk, cb.mul, pDef) : 0)) / def.attackCd;
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

// ---------- nhịp lên cấp ----------

const spawns = LEVELS.van_lam.spawns.filter((s) => !MONSTER.get(s.mon)?.boss);
let totalSec = 0;
let fightSec = 0;
let questXp = 0;
let trialSec = 0;
const trialRows: string[] = [];
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

console.log('Cảnh giới            quái (cấp)              TTK  máu/s  mất/lần  tọa   giết   phút   cộng dồn');
for (let level = 1; level <= NGUNG_KHI_MAX; level++) {
  const pl = player(level);
  // Chọn bãi quái có cấp gần nhất không vượt quá cấp người chơi + 1.
  const sp = [...spawns].sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level))[0];
  const def = MONSTER.get(sp.mon)!;
  const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
  const ms = monsterStats(mlv, def.hpMul, def.atkMul);
  const ttk = ms.hp / playerDps(level, pl.atk, ms.def);
  const inc = monsterDps(def, ms.atk, pl.def);
  // Máu mất mỗi lần giết trừ phần khiên/hồi nguyên kịp bù trong lúc đánh và đi tìm quái (6 giây).
  const lost = Math.max(0, inc * ttk - selfSustain(level) * pl.hp * (ttk + 6));
  const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
  const xpPerKill = monsterXp(mlv, def.xpMul) * xpLevelFactor(level, mlv) + meditateXpPerSec(level) * rest;
  let need = xpNeed(level);
  const qx = questByLevel.get(level) ?? 0;
  questXp += qx;
  need = Math.max(0, need - qx);
  const kills = Math.ceil(need / xpPerKill);
  // Mỗi lần giết: thời gian đánh + 6 giây tìm quái + đả tọa hồi máu.
  const sec = kills * (ttk + 6 + rest);
  totalSec += sec;
  fightSec += kills * (ttk + 6);
  // Bình cảnh tầng 5/10/15: thêm một thử thách tâm ma (đánh bóng của mình, mỗi lần ~ TTK + 20 giây chuẩn bị/đi lại).
  if (BOTTLENECK_LEVELS.includes(level)) {
    const sh = shadowStats(level, pl.atk, pl.def);
    const tt = sh.hp / playerDps(level, pl.atk, sh.def);
    // Bóng đánh mỗi 1,8 giây (xem monsters.json), người chơi dùng khiên/hồi nguyên như thường.
    const raw = (hit(sh.atk, 1, pl.def) / 1.8) * tt;
    const taken = Math.max(0, raw - selfSustain(level) * pl.hp * tt);
    trialSec += tt + 20;
    totalSec += tt + 20;
    trialRows.push(`${realmName(level).padEnd(20)} bóng hp ${String(sh.hp).padStart(5)}  TTK ${tt.toFixed(0).padStart(3)}s / ${TRIAL_DURATION}s  mất máu ${pct(raw / pl.hp).padStart(4)} nếu đứng yên, ${pct(taken / pl.hp).padStart(4)} sau khiên + hồi nguyên`);
  }
  console.log(
    `${realmName(level).padEnd(20)} ${(def.id + ' (' + mlv + ')').padEnd(23)} ${ttk.toFixed(1).padStart(4)}s ${pct(inc / pl.hp).padStart(5)} ${pct(lost / pl.hp).padStart(7)} ${rest.toFixed(0).padStart(4)}s ${String(kills).padStart(5)} ${(sec / 60).toFixed(0).padStart(6)} ${(totalSec / 3600).toFixed(1).padStart(8)} giờ`,
  );
}
console.log(
  `\nTổng tu vi từ nhiệm vụ: ${questXp}. Ước tính từ tầng 1 đến viên mãn tầng 15: ${(totalSec / 3600).toFixed(1)} giờ chơi một mình` +
    ` (${(fightSec / 3600).toFixed(1)} giờ đánh + ${((totalSec - fightSec - trialSec) / 3600).toFixed(1)} giờ đả tọa hồi máu; chưa tính đi lại, boss, bí cảnh; đã gồm ${(trialSec / 60).toFixed(0)} phút thử thách tâm ma ở bình cảnh).`,
);
console.log('\nThử thách tâm ma (bình cảnh):');
for (const r of trialRows) console.log(r);
console.log('máu/s: phần trăm máu tối đa mất mỗi giây khi đứng yên không né; mất/lần: sau khi trừ khiên + hồi nguyên; tọa: giây đả tọa hồi lại.');

// ---------- đòn dồn của quái đọc chú ----------

console.log('\nQuái đánh xa (người cùng cấp)   1 đòn    3 đòn (vùng/đạn) cùng lúc');
for (const [id, lv] of [
  ['mon_hoa_van_ho', 10],
  ['mon_u_minh_lang', 15],
  ['mon_kiem_linh', 11],
] as const) {
  const def = MONSTER.get(id)!;
  const cs = def.ai!.caster!;
  const pl = player(lv);
  const one = hit(monsterStats(lv, def.hpMul, def.atkMul).atk, cs.mul, pl.def);
  // Miễn vùng nổ (HAZARD_IFRAME) nên nổ cùng lúc chỉ trúng một vùng.
  console.log(`${(id + ' (' + lv + ')').padEnd(32)} ${pct(one / pl.hp).padStart(5)}   ${pct(one / pl.hp).padStart(5)} (không miễn vùng: ${pct((3 * one) / pl.hp)})`);
}

// ---------- boss ----------

/**
 * Nhóm `n` người cùng cấp `lv` đánh boss. Ngắt chú mọi lần: boss choáng `stun` giây trong mỗi chu kỳ `cd`,
 * nhận thêm sát thương và không đánh. Không ngắt: chú nổ, giả sử không ai né.
 */
console.log('\nBoss (nhóm × cấp)                 TTK ngắt/không   tank máu/s   chú   đập   cận chiến   chém   mất thế');
for (const [id, lv, n] of [
  ['boss_kiem_khoi', 12, 3],
  ['boss_huyet_lang_vuong', 13, 3],
  ['boss_thu_mo_tuong', 15, 3],
  ['boss_han_giao', 15, 4],
] as const) {
  const def = MONSTER.get(id)!;
  const ms = monsterStats(lv, def.hpMul, def.atkMul);
  const pl = player(lv);
  const grp = n * playerDps(lv, pl.atk, ms.def);
  const ch = def.ai?.chant;
  const sl = def.ai?.slam;
  // Thời gian boss bận (niệm chú hoặc choáng) trên mỗi chu kỳ chú.
  const stunFrac = ch ? ch.stun / ch.cd : 0;
  const chantFrac = ch ? ch.cast / ch.cd : 0;
  const ttkInt = ms.hp / (grp * (1 + (INTERRUPT_VULN_MUL - 1) * stunFrac));
  const ttkNo = ms.hp / grp;
  const melee = monsterDps({ ...def, ai: def.ai?.combo ? { combo: def.ai.combo } : undefined }, ms.atk, pl.def);
  const slamHit = sl ? hit(ms.atk, sl.mul, pl.def) : 0;
  const chantHit = ch ? hit(ms.atk, ch.mul, pl.def) : 0;
  // Pha sau: chiêu chém vùng mạnh nhất qua các pha; số lần mất thế ước tính từ sát thương (k lần thanh trên cả trận)
  // cộng các lần ngắt chú thành công.
  const swHit = Math.max(0, ...(def.phases ?? []).map((_, i) => phaseRules(def, i + 1).ai.sweep).map((w) => (w ? hit(ms.atk, w.mul, pl.def) : 0)));
  const ps = def.posture;
  const breaks = ps ? Math.floor(ps.k + (ch ? Math.floor(ttkInt / ch.cd) * ps.interrupt : 0)) : 0;
  // Tank đứng yên: cận chiến (trừ lúc boss bận) + đập vùng + chú (nếu không ngắt).
  const tankNo = melee * (1 - chantFrac) + (sl ? slamHit / sl.cd : 0) + (ch ? chantHit / ch.cd : 0);
  console.log(
    `${(id + ' (' + n + '×' + lv + ')').padEnd(32)} ${ttkInt.toFixed(0).padStart(4)}s/${ttkNo.toFixed(0).padStart(4)}s ${pct(tankNo / pl.hp).padStart(10)} ${(ch ? pct(chantHit / pl.hp) : '-').padStart(6)} ${pct(slamHit / pl.hp).padStart(5)} ${pct(hit(ms.atk, 1, pl.def) / pl.hp).padStart(8)} ${(swHit ? pct(swHit / pl.hp) : '-').padStart(6)} ${String(breaks).padStart(8)}`,
  );
}
console.log('chú/đập/cận chiến/chém: phần trăm máu một người cùng cấp mất mỗi đòn (trang bị theo nhiệm vụ). Mất thế: số lần ước tính mỗi trận.');

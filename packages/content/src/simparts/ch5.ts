// Tách từ sim.ts (tối ưu Đợt E): ch5.
import { levelSpawns, type Quality } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  promoteGold,
  PROMOTE_MAT_COUNT,
  tribDef,
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  NGUYEN_ANH_LEVEL,
  HOA_THAN_LEVEL,
  ANH_BIEN_LEVEL,
  shadowStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { RECIPE, ITEMS, LEVELS, MONSTER, QUESTS } from '../index';

import { at } from '@dtl/shared';
import { MethodId, methodAt, playerDps, monsterDps, PULL_FACTOR, selfSustain, METHOD_IDS, pct, METHOD_NAME } from './common';
import { fullSetTier } from './ch3';
import { CH4_GEAR_Q, dropExp } from './ch4';
import { HOP_SEC, PATH_FACTOR, RUN_SPEED } from './pace1';
import { CH2_PARTY_SHARE } from './ch2';
import { dgFirstMin } from './balance';

// ---------- Nhịp chương 5 (DV3-J): Hóa Thần sơ kỳ (cấp 28) → độ kiếp Anh Biến (Nhật Thực Kiếp, trần cấp 32) ----------
// Cùng cách dựng chương 4, thay dữ liệu bằng Bắc Hoang Tẫn Nguyên: cụm quái `bac_hoang.json` (cấp 28–31), nhiệm vụ `q5_*` + `s5_*`, hai phó bản (Xích Tẫn Khích cấp 28,
// Kim Dạ Cung cấp 31), hai boss ngoài trời (Tam Thủ Ngục Khuyển, Thủ Khích Dực Chủ), thử thách tâm ma ở bình cảnh, chế Anh Biến Lộ và Nhật Thực Kiếp (90 s; chưa mô phỏng
// cơ chế, lấy tỉ lệ qua của tay "thường" làm giả định ghi rõ). Mục tiêu 10 giờ ±12% (`docs/DIVUC_DESIGN.md` 2.2).
const CH5_TARGET_H = 10;
const CH5_TOL = 0.12;
const CH5_ELITE_EVERY = 900;
const CH5_QUEST_OVERHEAD = 150;
const CH5_BOSS_MIN = 8;
const CH5_CRAFT_MIN = 5;
const CH5_TRIB_PREP_SEC = 90;
/** Tỉ lệ mặc giáp bậc 5 (phẩm Linh) kỳ vọng ở từng cấp 28..31 (phần còn lại là bộ bậc 4). Tẫn Giác vào túi dần theo phó bản/boss. */
const CH5_GEAR_FRAC = [0.2, 0.4, 0.6, 0.8];
const CH5_GEAR_Q: Quality = 1;
/** Tỉ lệ qua Nhật Thực Kiếp của người chơi "thường" (giả định: kiếp giống Thiên Nhân Kiếp, 55–90% theo E4-J). */
const CH5_TRIB_PASS = 0.75;
const CH5_MATS = ['itm_kim_da_mien_phien', 'itm_tan_giac', 'itm_tinh_quang_mac', 'itm_yeu_dan'] as const;
const CH5_DUNGEONS: Record<number, string> = { 28: 'xich_tan_khich', 31: 'kim_da_cung' };
const CH5_BOSSES: Record<number, string[]> = { 29: ['boss_tam_thu_nguc_khuyen'], 31: ['boss_thu_khich_duc_chu'] };

function ch5Player(level: number, id: MethodId): { atk: number; def: number; hp: number } {
  const frac = CH5_GEAR_FRAC[Math.min(CH5_GEAR_FRAC.length - 1, level - HOA_THAN_LEVEL)] ?? 1;
  const prev = fullSetTier(level, CH4_GEAR_Q, NGUYEN_ANH_LEVEL);
  const t5 = fullSetTier(level, CH5_GEAR_Q, HOA_THAN_LEVEL);
  const pas = methodAt(level, id)?.passive;
  return {
    atk: prev.atk + frac * (t5.atk - prev.atk),
    def: Math.round((prev.def + frac * (t5.def - prev.def)) * (1 + (pas?.defMul ?? 0))),
    hp: Math.round((prev.hp + frac * (t5.hp - prev.hp)) * (1 + (pas?.hpMul ?? 0))),
  };
}

function ch5Camps(level: number) {
  const all = (at(LEVELS, 'bac_hoang').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite && !MONSTER.get(c.mon)?.boss);
  const hit = all.filter((c) => c.levelMax >= level - 2 && c.levelMin <= level + 1);
  if (hit.length) return hit;
  const d = (c: (typeof all)[number]) => Math.min(Math.abs(c.levelMin - level), Math.abs(c.levelMax - level));
  const best = Math.min(...all.map(d));
  return all.filter((c) => d(c) === best);
}

export interface Ch5Level {
  level: number;
  mobs: string;
  ttk: number;
  lostPct: number;
  eliteTtk: number;
  eliteLostPct: number;
  kills: number;
  sec: number;
  gold: number;
  mats: Record<string, number>;
}

function ch5Timeline(id: MethodId) {
  const rows: Ch5Level[] = [];
  const parts = { hunt: 0, elite: 0, rest: 0, quest: 0, dungeon: 0, boss: 0, trial: 0, craft: 0, trib: 0 };
  let gold = 0;
  let total = 0;
  let rate = 0;
  for (let level = HOA_THAN_LEVEL; level < ANH_BIEN_LEVEL; level++) {
    const pl = ch5Player(level, id);
    const camps = ch5Camps(level);
    const n = camps.reduce((s, c) => s + c.count, 0);
    const perCamp = n / camps.length;
    const nn = camps.map((a) => Math.min(...camps.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z)), 120));
    const seek = HOP_SEC + (PATH_FACTOR * (nn.reduce((s, d) => s + d, 0) / nn.length)) / RUN_SPEED / perCamp;
    let ttk = 0;
    let lost = 0;
    let xpKill = 0;
    let goldKill = 0;
    const mix: string[] = [];
    const killMats: Record<string, number> = {};
    for (const c of camps) {
      const def = MONSTER.get(c.mon)!;
      const w = c.count / n;
      const mlv = Math.min(c.levelMax, Math.max(c.levelMin, level));
      const ms = monsterStats(mlv, def.hpMul, def.atkMul);
      const t = ms.hp / playerDps(level, pl.atk, ms.def, id, def.elem);
      const inc = monsterDps(def, ms.atk, pl.def);
      const lt = lootOf(def.id);
      ttk += w * t;
      lost += w * Math.max(0, inc * t * PULL_FACTOR - selfSustain(level, id) * pl.hp * (t + seek));
      xpKill += w * monsterXp(mlv, def.xpMul) * xpLevelFactor(level, mlv);
      goldKill += w * ((lt.gold[0] + lt.gold[1]) / 2);
      for (const m of CH5_MATS) killMats[m] = (killMats[m] ?? 0) + w * dropExp(def.id, m);
      if (!mix.includes(def.id)) mix.push(def.id);
    }
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    xpKill += meditateXpPerSec(level) * rest;
    const cycle = ttk + seek + rest;
    const eSp = at(
      levelSpawns(at(LEVELS, 'bac_hoang'))
        .filter((s) => MONSTER.get(s.mon)?.elite)
        .sort((a, b) => Math.abs(a.levelMax - level) - Math.abs(b.levelMax - level)),
      0,
    );
    const eDef = MONSTER.get(eSp.mon)!;
    const eLv = Math.min(eSp.levelMax, Math.max(eSp.levelMin, level));
    const eMs = monsterStats(eLv, eDef.hpMul, eDef.atkMul);
    const eTtk = eMs.hp / playerDps(level, pl.atk, eMs.def, id, eDef.elem, 'avg', 0);
    const eLost = Math.max(0, monsterDps(eDef, eMs.atk, pl.def) * eTtk - selfSustain(level, id) * pl.hp * eTtk);
    const eRest = eLost / (pl.hp * HP_REGEN_MEDITATE);
    const eXp = monsterXp(eLv, eDef.xpMul) * xpLevelFactor(level, eLv) + meditateXpPerSec(level) * eRest;
    const eSec = eTtk + 25 + eRest;
    const eLoot = lootOf(eDef.id);
    const eGold = (eLoot.gold[0] + eLoot.gold[1]) / 2;

    const qs = QUESTS.filter(
      (q) => (q.id.startsWith('q5_') || q.id.startsWith('s5_')) && Math.max(HOA_THAN_LEVEL, q.minLevel ?? HOA_THAN_LEVEL) === level,
    );
    let fixedXp = qs.reduce((s, q) => s + q.rewards.xp, 0);
    let fixedSec = qs.length * CH5_QUEST_OVERHEAD;
    parts.quest += qs.length * CH5_QUEST_OVERHEAD;
    let fixedGold = qs.reduce((s, q) => s + (q.rewards.gold ?? 0), 0);
    const fixedMats: Record<string, number> = {};
    for (const q of qs) for (const it of q.rewards.items ?? []) fixedMats[it.id] = (fixedMats[it.id] ?? 0) + it.n;
    const dgId = CH5_DUNGEONS[level];
    if (dgId) {
      const dg = at(LEVELS, dgId).dungeon!;
      let waveXp = 0;
      for (const w of dg.waves) for (const g of w.mons) waveXp += monsterXp(g.level, MONSTER.get(g.id)!.xpMul) * g.n;
      fixedXp += xpNeed(level) * dg.reward!.xpPct + waveXp * CH2_PARTY_SHARE;
      const dgSec = (dgFirstMin.get(dgId) ?? 28) * 60;
      fixedSec += dgSec;
      parts.dungeon += dgSec;
      fixedGold += (at(dg.reward!.gold, 0) + at(dg.reward!.gold, 1)) / 2;
      for (const it of dg.reward!.items) fixedMats[it.item] = (fixedMats[it.item] ?? 0) + it.chance * ((it.min + it.max) / 2);
      for (const w of dg.waves)
        for (const g of w.mons)
          for (const m of CH5_MATS)
            fixedMats[m] =
              (fixedMats[m] ?? 0) +
              (g.n * dropExp(g.id, m)) / (MONSTER.get(g.id)!.boss || MONSTER.get(g.id)!.elite ? 1 : CH2_PARTY_SHARE * 4);
    }
    for (const b of CH5_BOSSES[level] ?? []) {
      const bd = MONSTER.get(b)!;
      fixedXp += monsterXp(level, bd.xpMul) * CH2_PARTY_SHARE;
      fixedSec += CH5_BOSS_MIN * 60;
      parts.boss += CH5_BOSS_MIN * 60;
      const bl = lootOf(bd.id);
      fixedGold += (bl.gold[0] + bl.gold[1]) / 2;
      for (const m of CH5_MATS) fixedMats[m] = (fixedMats[m] ?? 0) + dropExp(bd.id, m);
    }
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id) + 20;
      fixedSec += tt;
      parts.trial += tt;
    }
    const need = Math.max(0, xpNeed(level) - fixedXp);
    const mobsPerCycle = CH5_ELITE_EVERY / cycle;
    const cycXp = mobsPerCycle * xpKill + eXp;
    const cycSec = CH5_ELITE_EVERY + eSec;
    const cycles = need / cycXp;
    const lvSec = cycles * cycSec + fixedSec;
    parts.hunt += cycles * (CH5_ELITE_EVERY - mobsPerCycle * rest);
    parts.rest += cycles * (mobsPerCycle * rest + eRest);
    parts.elite += cycles * (eSec - eRest);
    if (level === ANH_BIEN_LEVEL - 1) rate = cycXp / cycSec;
    const g = cycles * (mobsPerCycle * goldKill + eGold) + fixedGold;
    gold += g;
    total += lvSec;
    const mats: Record<string, number> = {};
    for (const m of CH5_MATS) mats[m] = cycles * (mobsPerCycle * (killMats[m] ?? 0) + dropExp(eDef.id, m)) + (fixedMats[m] ?? 0);
    rows.push({
      level,
      mobs: mix.join('+'),
      ttk,
      lostPct: lost / pl.hp,
      eliteTtk: eTtk,
      eliteLostPct: eLost / pl.hp,
      kills: cycles * mobsPerCycle,
      sec: lvSec,
      gold: g,
      mats,
    });
  }
  const td = tribDef('anh_bien');
  const tribOnce = CH5_TRIB_PREP_SEC + td.duration;
  const retry = (1 - CH5_TRIB_PASS) / CH5_TRIB_PASS;
  const lossSec = (xpNeed(ANH_BIEN_LEVEL - 1) * td.failXpLoss) / rate;
  parts.craft += CH5_CRAFT_MIN * 60;
  parts.trib += tribOnce + retry * (tribOnce + lossSec + CH5_CRAFT_MIN * 60);
  total += parts.craft + parts.trib;
  return { hours: total / 3600, rows, gold, parts };
}

{
  const out = new Map<MethodId, ReturnType<typeof ch5Timeline>>(METHOD_IDS.map((m) => [m, ch5Timeline(m)] as const));
  console.log(
    '\nNhịp chương 5 (DV3-J): Hóa Thần cấp 28 → độ kiếp Anh Biến, một mình, đồ bậc 5 kỳ vọng ' +
      CH5_GEAR_FRAC.map(pct).join('/') +
      ` (phẩm ${CH5_GEAR_Q}); tinh anh 1 con/${CH5_ELITE_EVERY / 60} phút săn; Nhật Thực Kiếp qua ${pct(CH5_TRIB_PASS)} (giả định)`,
  );
  console.log('cấp  bãi                                   TTK  mất/lần  giết  tinh anh (TTK/mất)  giờ cấp');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    console.log(METHOD_NAME[id] + ': ' + t.hours.toFixed(2) + ' giờ');
    for (const r of t.rows) {
      console.log(
        `${String(r.level).padStart(3)}  ${r.mobs.slice(0, 36).padEnd(36)} ${r.ttk.toFixed(1).padStart(4)}s ${pct(r.lostPct).padStart(6)} ${r.kills.toFixed(0).padStart(5)}  ${r.eliteTtk.toFixed(0).padStart(3)}s ${pct(r.eliteLostPct).padStart(4)}  ${(r.sec / 3600).toFixed(2).padStart(6)}`,
      );
    }
    const p = t.parts;
    const h = (x: number) => (x / 3600).toFixed(2);
    console.log(
      `  thành phần (giờ): quái ${h(p.hunt)}, tinh anh ${h(p.elite)}, đả tọa ${h(p.rest)}, nhiệm vụ ${h(p.quest)}, phó bản ${h(p.dungeon)}, boss ${h(p.boss)}, tâm ma ${h(p.trial)}, chế Anh Biến Lộ ${h(p.craft)}, Nhật Thực Kiếp ${h(p.trib)}`,
    );
  }
  for (const id of METHOD_IDS) {
    for (const r of out.get(id)!.rows) {
      if (r.ttk < 3.7 || r.ttk > 7.3) {
        console.error(`LỖI: chương 5 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,7–7,3 s`);
        process.exitCode = 1;
      }
      if (r.eliteTtk < 18 || r.eliteTtk > 40) {
        console.error(`LỖI: chương 5 cấp ${r.level} ${METHOD_NAME[id]} TTK tinh anh ${r.eliteTtk.toFixed(0)}s ngoài 18–40 s`);
        process.exitCode = 1;
      }
      if (r.eliteLostPct > 0.6) {
        console.error(`LỖI: chương 5 cấp ${r.level} ${METHOD_NAME[id]} đánh tinh anh mất ${pct(r.eliteLostPct)} máu`);
        process.exitCode = 1;
      }
      if (r.lostPct > 0.45) {
        console.error(`LỖI: chương 5 cấp ${r.level} ${METHOD_NAME[id]} mất ${pct(r.lostPct)} máu mỗi lần giết`);
        process.exitCode = 1;
      }
    }
  }
  const hs = METHOD_IDS.map((m) => out.get(m)!.hours);
  console.log(`[pace5] ${METHOD_IDS.map((m, i) => m + '=' + at(hs, i).toFixed(2)).join(' ')} target=${CH5_TARGET_H} tol=${CH5_TOL}`);
  for (const [i, m] of METHOD_IDS.entries()) {
    if (Math.abs(at(hs, i) / CH5_TARGET_H - 1) > CH5_TOL) {
      console.error(`LỖI: chương 5 ${METHOD_NAME[m]} ra ${at(hs, i).toFixed(2)} giờ, ngoài ${CH5_TARGET_H} giờ ±${CH5_TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  const k = out.get('lac_kiem_quyet')!;
  const have = (m: string) => k.rows.reduce((n, r) => n + (r.mats[m] ?? 0), 0);
  const retryAB = 1 / CH5_TRIB_PASS;
  console.log('\nKinh tế chương 5 (một mình, tới độ kiếp Anh Biến):');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    console.log(
      `  ${METHOD_NAME[id].padEnd(8)} nguồn ${t.gold.toFixed(0)} vàng rơi/nhiệm vụ/phó bản/boss (chưa tính bán đồ); ${(t.gold / t.hours).toFixed(0)}/giờ`,
    );
  }
  const rcp = RECIPE.get('rcp_anh_bien_lo')!;
  for (const inp of rcp.inputs) {
    const nd = inp.n * retryAB;
    console.log(`  ${inp.id} ≈ ${have(inp.id).toFixed(1)} (cần ${nd.toFixed(1)} cho Anh Biến Lộ, kể cả làm lại)`);
    if (have(inp.id) < nd * 1.3) {
      console.error(`LỖI: ${inp.id} ≈ ${have(inp.id).toFixed(1)} không đủ dư (cần ${nd.toFixed(1)} × 1,3) cho Anh Biến Lộ`);
      process.exitCode = 1;
    }
  }
  const t5 = ITEMS.filter((i) => i.tier === 5 && !i.set);
  const forgeGold = rcp.gold * retryAB;
  const promote = t5.length * promoteGold(5);
  console.log(
    `  tiêu cầu toàn ≈ ${(promote + forgeGold).toFixed(0)} = Thăng Bậc 4 → 5 ${t5.length} ô ${promote} + Anh Biến Lộ ${forgeGold.toFixed(0)} (kể cả làm lại); Tẫn Giác ≈ ${have('itm_tan_giac').toFixed(0)} (Thăng Bậc cần ${PROMOTE_MAT_COUNT * t5.length} + Anh Biến Lộ ${rcp.inputs.find((i) => i.id === 'itm_tan_giac')!.n}).`,
  );
}

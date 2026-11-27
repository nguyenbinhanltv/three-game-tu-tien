// Tách từ sim.ts (tối ưu Đợt E): ch6.
import { levelSpawns, type Quality } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  promoteGold,
  PROMOTE_MAT,
  PROMOTE_MAT_COUNT,
  tribDef,
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  HOA_THAN_LEVEL,
  ANH_BIEN_LEVEL,
  DUONG_THUC_LEVEL,
  shadowStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { FORGE, RECIPE, ITEMS, LEVELS, MONSTER, QUESTS } from '../index';

import { at } from '@dtl/shared';
import { MethodId, methodAt, playerDps, monsterDps, PULL_FACTOR, selfSustain, METHOD_IDS, pct, METHOD_NAME } from './common';
import { fullSetTier } from './ch3';
import { Ch5Level } from './ch5';
import { HOP_SEC, PATH_FACTOR, RUN_SPEED } from './pace1';
import { dropExp } from './ch4';
import { CH2_PARTY_SHARE } from './ch2';
import { dgFirstMin } from './balance';

// ---------- Nhịp chương 6 (TN-3): Anh Biến (cấp 32) → độ kiếp Dương Thực (cấp 43→44, trần tạm) ----------
// Cùng cách dựng chương 5 nhưng dữ liệu là Vấn Đỉnh: cụm quái `van_dinh.json` (cấp 32–43), nhiệm vụ `q6_*` + `s6_*`, phó bản Giới Trì (cấp 42), hai boss ngoài trời
// (Hư Ảnh Chủ 39, Đỉnh Linh 43), thử thách tâm ma ở bình cảnh, ba lần chế Lộ và độ kiếp (Vấn Đỉnh 35, Âm Hư 39, Dương Thực 43; chưa mô phỏng cơ chế kiếp, lấy tỉ lệ qua
// giả định ghi rõ). Trang bị bậc 6 (Thăng Bậc/chế bằng Hư Ảnh + Đồng Văn Phiến) pha dần từ bộ bậc 5 theo `CH6_GEAR_FRAC`. Mục tiêu 12 giờ ±12% (`tn3/thiet-ke.md` mục 1).
const CH6_TARGET_H = 12;
const CH6_TOL = 0.12;
export const CH6_ELITE_EVERY = 900;
export const CH6_QUEST_OVERHEAD = 150;
export const CH6_BOSS_MIN = 8;
const CH6_CRAFT_MIN = 5;
const CH6_TRIB_PREP_SEC = 90;
const CH6_GEAR_Q: Quality = 1;
/** Tỉ lệ qua mỗi kiếp chương 6 của người chơi "thường" (giả định: dùng khung kiếp có sẵn, 55–90% theo E4-J). */
const CH6_TRIB_PASS = 0.75;
/** Tẫn Giác không rơi ở chương 6: Vấn Đỉnh Lộ cần 6, lấy từ phần dư của chương 5 (sim chương 5 ≈ 75, tiêu Thăng Bậc bậc 5 rồi vẫn còn). */
const CH6_MATS = ['itm_hu_anh_phien', 'itm_dong_van_phien', 'itm_thiet_tinh', 'itm_yeu_dan'] as const;
const CH6_DUNGEONS: Record<number, string> = { 42: 'gioi_tri' };
const CH6_BOSSES: Record<number, string[]> = { 39: ['boss_hu_anh_chu'], 43: ['boss_dinh_linh'] };
const CH6_LO: Record<number, { trib: string; recipe: string }> = {
  35: { trib: 'van_dinh', recipe: 'rcp_van_dinh_lo' },
  39: { trib: 'am_hu', recipe: 'rcp_am_hu_lo' },
  43: { trib: 'duong_thuc', recipe: 'rcp_duong_thuc_lo' },
};

/** Tỉ lệ mặc đồ bậc 6 (phẩm Linh) kỳ vọng ở từng cấp 32..43 (phần còn lại là bộ bậc 5); từ 43 mặc trọn bậc 6. Hư Ảnh/Đồng Văn Phiến vào túi dần từ quái chương 6. */
const CH6_GEAR_FRAC = [0, 0, 0, 0, 0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

export function ch6Player(level: number, id: MethodId): { atk: number; def: number; hp: number } {
  const frac = CH6_GEAR_FRAC[Math.min(CH6_GEAR_FRAC.length - 1, level - ANH_BIEN_LEVEL)] ?? 1;
  const prev = fullSetTier(level, CH6_GEAR_Q, HOA_THAN_LEVEL);
  const t6 = fullSetTier(level, CH6_GEAR_Q, ANH_BIEN_LEVEL);
  const pas = methodAt(level, id)?.passive;
  return {
    atk: prev.atk + frac * (t6.atk - prev.atk),
    def: Math.round((prev.def + frac * (t6.def - prev.def)) * (1 + (pas?.defMul ?? 0))),
    hp: Math.round((prev.hp + frac * (t6.hp - prev.hp)) * (1 + (pas?.hpMul ?? 0))),
  };
}

function ch6Camps(level: number) {
  const all = (at(LEVELS, 'van_dinh').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite && !MONSTER.get(c.mon)?.boss);
  const hit = all.filter((c) => c.levelMax >= level - 2 && c.levelMin <= level + 1);
  if (hit.length) return hit;
  const d = (c: (typeof all)[number]) => Math.min(Math.abs(c.levelMin - level), Math.abs(c.levelMax - level));
  const best = Math.min(...all.map(d));
  return all.filter((c) => d(c) === best);
}

function ch6Timeline(id: MethodId) {
  const rows: Ch5Level[] = [];
  const parts = { hunt: 0, elite: 0, rest: 0, quest: 0, dungeon: 0, boss: 0, trial: 0, craft: 0, trib: 0 };
  let gold = 0;
  let total = 0;
  const lastLevel = DUONG_THUC_LEVEL - 1;
  for (let level = ANH_BIEN_LEVEL; level <= lastLevel; level++) {
    const pl = ch6Player(level, id);
    const camps = ch6Camps(level);
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
      for (const m of CH6_MATS) killMats[m] = (killMats[m] ?? 0) + w * dropExp(def.id, m);
      if (!mix.includes(def.id)) mix.push(def.id);
    }
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    xpKill += meditateXpPerSec(level) * rest;
    const cycle = ttk + seek + rest;
    const eSp = at(
      levelSpawns(at(LEVELS, 'van_dinh'))
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
      (q) => (q.id.startsWith('q6_') || q.id.startsWith('s6_')) && Math.max(ANH_BIEN_LEVEL, q.minLevel ?? ANH_BIEN_LEVEL) === level,
    );
    let fixedXp = qs.reduce((s, q) => s + q.rewards.xp, 0);
    let fixedSec = qs.length * CH6_QUEST_OVERHEAD;
    parts.quest += qs.length * CH6_QUEST_OVERHEAD;
    let fixedGold = qs.reduce((s, q) => s + (q.rewards.gold ?? 0), 0);
    const fixedMats: Record<string, number> = {};
    for (const q of qs) for (const it of q.rewards.items ?? []) fixedMats[it.id] = (fixedMats[it.id] ?? 0) + it.n;
    const dgId = CH6_DUNGEONS[level];
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
          for (const m of CH6_MATS)
            fixedMats[m] =
              (fixedMats[m] ?? 0) +
              (g.n * dropExp(g.id, m)) / (MONSTER.get(g.id)!.boss || MONSTER.get(g.id)!.elite ? 1 : CH2_PARTY_SHARE * 4);
    }
    for (const b of CH6_BOSSES[level] ?? []) {
      const bd = MONSTER.get(b)!;
      fixedXp += monsterXp(level, bd.xpMul) * CH2_PARTY_SHARE;
      fixedSec += CH6_BOSS_MIN * 60;
      parts.boss += CH6_BOSS_MIN * 60;
      const bl = lootOf(bd.id);
      fixedGold += (bl.gold[0] + bl.gold[1]) / 2;
      for (const m of CH6_MATS) fixedMats[m] = (fixedMats[m] ?? 0) + dropExp(bd.id, m);
    }
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id) + 20;
      fixedSec += tt;
      parts.trial += tt;
    }
    const need = Math.max(0, xpNeed(level) - fixedXp);
    const mobsPerCycle = CH6_ELITE_EVERY / cycle;
    const cycXp = mobsPerCycle * xpKill + eXp;
    const cycSec = CH6_ELITE_EVERY + eSec;
    const cycles = need / cycXp;
    const lvSec = cycles * cycSec + fixedSec;
    parts.hunt += cycles * (CH6_ELITE_EVERY - mobsPerCycle * rest);
    parts.rest += cycles * (mobsPerCycle * rest + eRest);
    parts.elite += cycles * (eSec - eRest);
    const rate = cycXp / cycSec;
    let extra = 0;
    const lo = CH6_LO[level];
    if (lo) {
      const td = tribDef(lo.trib);
      const tribOnce = CH6_TRIB_PREP_SEC + td.duration;
      const retry = (1 - CH6_TRIB_PASS) / CH6_TRIB_PASS;
      const lossSec = (xpNeed(level) * td.failXpLoss) / rate;
      parts.craft += CH6_CRAFT_MIN * 60;
      const tr = tribOnce + retry * (tribOnce + lossSec + CH6_CRAFT_MIN * 60);
      parts.trib += tr;
      extra = CH6_CRAFT_MIN * 60 + tr;
    }
    const g = cycles * (mobsPerCycle * goldKill + eGold) + fixedGold;
    gold += g;
    total += lvSec + extra;
    const mats: Record<string, number> = {};
    for (const m of CH6_MATS) mats[m] = cycles * (mobsPerCycle * (killMats[m] ?? 0) + dropExp(eDef.id, m)) + (fixedMats[m] ?? 0);
    rows.push({
      level,
      mobs: mix.join('+'),
      ttk,
      lostPct: lost / pl.hp,
      eliteTtk: eTtk,
      eliteLostPct: eLost / pl.hp,
      kills: cycles * mobsPerCycle,
      sec: lvSec + extra,
      gold: g,
      mats,
    });
  }
  return { hours: total / 3600, rows, gold, parts };
}

{
  const out = new Map<MethodId, ReturnType<typeof ch6Timeline>>(METHOD_IDS.map((m) => [m, ch6Timeline(m)] as const));
  console.log(
    `\nNhịp chương 6 (TN-3): Anh Biến cấp ${ANH_BIEN_LEVEL} → độ kiếp Dương Thực (cấp ${DUONG_THUC_LEVEL - 1}), một mình, đồ bậc 5 pha dần sang bậc 6 (phẩm ${CH6_GEAR_Q}); ` +
      `tinh anh 1 con/${CH6_ELITE_EVERY / 60} phút săn; ba kiếp qua ${pct(CH6_TRIB_PASS)} (giả định)`,
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
      `  thành phần (giờ): quái ${h(p.hunt)}, tinh anh ${h(p.elite)}, đả tọa ${h(p.rest)}, nhiệm vụ ${h(p.quest)}, phó bản ${h(p.dungeon)}, boss ${h(p.boss)}, tâm ma ${h(p.trial)}, chế Lộ ${h(p.craft)}, ba kiếp ${h(p.trib)}`,
    );
  }
  for (const id of METHOD_IDS) {
    for (const r of out.get(id)!.rows) {
      if (r.ttk < 3.7 || r.ttk > 7.3) {
        console.error(`LỖI: chương 6 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,7–7,3 s`);
        process.exitCode = 1;
      }
      if (r.eliteTtk < 18 || r.eliteTtk > 40) {
        console.error(`LỖI: chương 6 cấp ${r.level} ${METHOD_NAME[id]} TTK tinh anh ${r.eliteTtk.toFixed(0)}s ngoài 18–40 s`);
        process.exitCode = 1;
      }
      if (r.eliteLostPct > 0.6) {
        console.error(`LỖI: chương 6 cấp ${r.level} ${METHOD_NAME[id]} đánh tinh anh mất ${pct(r.eliteLostPct)} máu`);
        process.exitCode = 1;
      }
      if (r.lostPct > 0.45) {
        console.error(`LỖI: chương 6 cấp ${r.level} ${METHOD_NAME[id]} mất ${pct(r.lostPct)} máu mỗi lần giết`);
        process.exitCode = 1;
      }
    }
  }
  const hs = METHOD_IDS.map((m) => out.get(m)!.hours);
  console.log(`[pace6] ${METHOD_IDS.map((m, i) => m + '=' + at(hs, i).toFixed(2)).join(' ')} target=${CH6_TARGET_H} tol=${CH6_TOL}`);
  for (const [i, m] of METHOD_IDS.entries()) {
    if (Math.abs(at(hs, i) / CH6_TARGET_H - 1) > CH6_TOL) {
      console.error(`LỖI: chương 6 ${METHOD_NAME[m]} ra ${at(hs, i).toFixed(2)} giờ, ngoài ${CH6_TARGET_H} giờ ±${CH6_TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  const k = out.get('lac_kiem_quyet')!;
  const have = (m: string) => k.rows.reduce((n, r) => n + (r.mats[m] ?? 0), 0);
  const retryTrib = 1 / CH6_TRIB_PASS;
  console.log('\nKinh tế chương 6 (một mình, tới độ kiếp Dương Thực):');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    console.log(
      `  ${METHOD_NAME[id].padEnd(8)} nguồn ${t.gold.toFixed(0)} vàng rơi/nhiệm vụ/phó bản/boss; ${(t.gold / t.hours).toFixed(0)}/giờ`,
    );
  }
  // Nguyên liệu cho ba Lộ (kể cả làm lại) và ba Hư Phá Cảnh Đan (bình cảnh 33/37/41).
  const need: Record<string, number> = {};
  for (const { recipe } of Object.values(CH6_LO)) {
    for (const inp of RECIPE.get(recipe)!.inputs) need[inp.id] = (need[inp.id] ?? 0) + inp.n * retryTrib;
  }
  for (const inp of RECIPE.get('rcp_pha_canh_dan_4')!.inputs) need[inp.id] = (need[inp.id] ?? 0) + inp.n * 3;
  for (const [m, nd] of Object.entries(need)) {
    const carried = !(CH6_MATS as readonly string[]).includes(m);
    console.log(
      `  ${m} ≈ ${carried ? 'mang từ chương 5' : have(m).toFixed(1)} (cần ${nd.toFixed(1)} cho 3 Lộ + 3 Hư Phá Cảnh Đan, kể cả làm lại)`,
    );
    if (!carried && have(m) < nd * 1.3) {
      console.error(`LỖI: ${m} ≈ ${have(m).toFixed(1)} không đủ dư (cần ${nd.toFixed(1)} × 1,3) cho chương 6`);
      process.exitCode = 1;
    }
  }
  // Bậc 6: Thăng Bậc 7 ô thường (20 Hư Ảnh Phiến + phí mỗi ô) và chế trọn một bộ (nguyên liệu theo `forge.json`) — chọn một trong hai theo ô, nên mỗi đường phải đủ riêng.
  const t6 = ITEMS.filter((i) => i.tier === 6 && !i.set);
  const promoteMat = at(PROMOTE_MAT, 6) as string;
  const promoteNeed = PROMOTE_MAT_COUNT * t6.length;
  const setNeed: Record<string, number> = {};
  for (const f of FORGE) {
    if (f.output.startsWith('itm_vdk_')) for (const inp of f.inputs) setNeed[inp.id] = (setNeed[inp.id] ?? 0) + inp.n;
  }
  const loNeed = Object.values(CH6_LO).reduce(
    (n, { recipe }) => n + (RECIPE.get(recipe)!.inputs.find((i) => i.id === promoteMat)?.n ?? 0) / CH6_TRIB_PASS,
    0,
  );
  console.log(
    `  bậc 6: Thăng Bậc ${t6.length} ô cần ${promoteNeed} ${promoteMat} (${promoteGold(6)} linh thạch mỗi ô, ≈ ${(t6.length * promoteGold(6)).toFixed(0)}); chế bộ Kiếm cần ${Object.entries(
      setNeed,
    )
      .map(([m, n]) => `${n} ${m}`)
      .join(', ')}; ` +
      `${promoteMat} ≈ ${have(promoteMat).toFixed(0)} và itm_dong_van_phien ≈ ${have('itm_dong_van_phien').toFixed(0)} trong chương (Lộ cần thêm ${loNeed.toFixed(0)}).`,
  );
  if (have(promoteMat) < (promoteNeed + loNeed) * 0.6)
    console.log('  (ghi chú: Thăng Bậc cả 7 ô cùng lúc không đủ trong chương 6; người chơi chọn ô cần hơn là Thăng Bậc hết)');
  for (const [m, n] of Object.entries(setNeed)) {
    if ((CH6_MATS as readonly string[]).includes(m) && have(m) < (n + (m === promoteMat ? loNeed : 0)) * 1.3) {
      console.error(`LỖI: ${m} ≈ ${have(m).toFixed(1)} không đủ chế một bộ bậc 6 (cần ${n} + Lộ)`);
      process.exitCode = 1;
    }
  }
}

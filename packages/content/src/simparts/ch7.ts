// Tách từ sim.ts (tối ưu Đợt E): ch7.
import { levelSpawns } from '@dtl/shared';
import {
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  DUONG_THUC_LEVEL,
  KIEU_COUNT,
  KIEU_XP_FRAC,
  kieuGold,
  kieuMinLevel,
  kieuPower,
  MAX_LEVEL,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { LEVELS, MONSTER, QUESTS } from '../index';

import { at } from '@dtl/shared';
import { MethodId, playerDps, monsterDps, PULL_FACTOR, selfSustain, METHOD_IDS, METHOD_NAME, pct } from './common';
import { Ch5Level } from './ch5';
import { ch6Player, CH6_QUEST_OVERHEAD, CH6_BOSS_MIN, CH6_ELITE_EVERY } from './ch6';
import { CH2_PARTY_SHARE } from './ch2';
import { HOP_SEC, PATH_FACTOR, RUN_SPEED } from './pace1';

// ---------- Nhịp chương 7 (TN-7): Dương Thực 44 → 47 ở Thiên Lộ Giới + chín cầu ----------
// Cùng cách dựng chương 6 nhưng dữ liệu là `cuu_kieu`: cụm quái (cấp 44–47), nhiệm vụ `q7_*` + `s7_*`, boss thế giới Kiều Thủ (cấp 45), tinh anh. Điểm khác:
// - Mỗi cấp 44/45/46 phải lên đủ xpNeed; cấp 47 là trần nên không còn tu vi để cày. Cầu n làm ở cấp `kieuMinLevel(n)` (1–3 ở 44, 4–6 ở 45, 7–9 ở 46).
// - Mỗi cầu lần đầu thưởng `KIEU_XP_FRAC` × xpNeed cấp hiện tại + `kieuGold(n)` và tốn `CH7_BRIDGE_MIN[n-1]` phút (giả định; phòng cầu chưa đo bằng bot).
// - Đồ bậc 6 trọn bộ (từ cấp 43) nhân Kiều Lực (+1%/cầu đã qua khi bắt đầu cấp đó).
// Mục tiêu ~8 giờ ±12% cả chương (`tn7/thiet-ke.md` mục 1).
const CH7_TARGET_H = 8;
const CH7_TOL = 0.12;
const CH7_BRIDGE_MIN = [35, 30, 20, 35, 35, 40, 15, 15, 45] as const;
/** Cầu làm ở cấp thấp nhất được vào (`kieuMinLevel`: 1–3 ở 44, 4–6 ở 45, 7–9 ở 46) nên xp thưởng cầu và xp nhiệm vụ `q7_cau_N` (minLevel khớp) cùng rơi vào đúng cấp đó; qua cầu 3 thì trần 46, qua cầu 6 trần 47 (`kieuLevelCap`), không chặn thứ tự này. Cấp 47 không còn cầu. */
const CH7_BRIDGES_AT: Record<number, number[]> = {};
for (let n = 1; n <= KIEU_COUNT; n++) (CH7_BRIDGES_AT[kieuMinLevel(n)] ??= []).push(n);
const CH7_BOSSES: Record<number, string[]> = { 45: ['boss_kieu_thu'] };

function ch7Camps(level: number) {
  const all = (at(LEVELS, 'cuu_kieu').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite && !MONSTER.get(c.mon)?.boss);
  const hit = all.filter((c) => c.levelMax >= level - 1 && c.levelMin <= level);
  if (hit.length) return hit;
  const d = (c: (typeof all)[number]) => Math.min(Math.abs(c.levelMin - level), Math.abs(c.levelMax - level));
  const best = Math.min(...all.map(d));
  return all.filter((c) => d(c) === best);
}

function ch7Timeline(id: MethodId) {
  const rows: Ch5Level[] = [];
  const parts = { hunt: 0, elite: 0, rest: 0, quest: 0, boss: 0, bridge: 0 };
  let gold = 0;
  let total = 0;
  for (let level = DUONG_THUC_LEVEL; level <= MAX_LEVEL; level++) {
    const done = Object.entries(CH7_BRIDGES_AT)
      .filter(([l]) => Number(l) < level)
      .reduce((s, [, b]) => s + b.length, 0);
    const kp = 1 + kieuPower(done);
    const base = ch6Player(level, id);
    const pl = { atk: base.atk * kp, def: Math.round(base.def * kp), hp: Math.round(base.hp * kp) };
    let fixedSec = 0;
    let fixedXp = 0;
    let fixedGold = 0;
    for (const n of CH7_BRIDGES_AT[level] ?? []) {
      const s = CH7_BRIDGE_MIN[n - 1]! * 60;
      fixedSec += s;
      parts.bridge += s;
      fixedGold += kieuGold(n);
      if (level < MAX_LEVEL) fixedXp += xpNeed(level) * KIEU_XP_FRAC;
    }
    const qs = QUESTS.filter(
      (q) => (q.id.startsWith('q7_') || q.id.startsWith('s7_')) && Math.max(DUONG_THUC_LEVEL, q.minLevel ?? DUONG_THUC_LEVEL) === level,
    );
    fixedSec += qs.length * CH6_QUEST_OVERHEAD;
    parts.quest += qs.length * CH6_QUEST_OVERHEAD;
    fixedGold += qs.reduce((s, q) => s + (q.rewards.gold ?? 0), 0);
    if (level < MAX_LEVEL) fixedXp += qs.reduce((s, q) => s + q.rewards.xp, 0);
    for (const b of CH7_BOSSES[level] ?? []) {
      const bd = MONSTER.get(b)!;
      if (level < MAX_LEVEL) fixedXp += monsterXp(level, bd.xpMul) * CH2_PARTY_SHARE;
      fixedSec += CH6_BOSS_MIN * 60;
      parts.boss += CH6_BOSS_MIN * 60;
      const bl = lootOf(bd.id);
      fixedGold += (bl.gold[0] + bl.gold[1]) / 2;
    }
    if (level >= MAX_LEVEL) {
      total += fixedSec;
      gold += fixedGold;
      continue;
    }
    const camps = ch7Camps(level);
    const n = camps.reduce((s, c) => s + c.count, 0);
    const perCamp = n / camps.length;
    const nn = camps.map((a) => Math.min(...camps.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z)), 120));
    const seek = HOP_SEC + (PATH_FACTOR * (nn.reduce((s, d) => s + d, 0) / nn.length)) / RUN_SPEED / perCamp;
    let ttk = 0;
    let lost = 0;
    let xpKill = 0;
    let goldKill = 0;
    const mix: string[] = [];
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
      if (!mix.includes(def.id)) mix.push(def.id);
    }
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    xpKill += meditateXpPerSec(level) * rest;
    const cycle = ttk + seek + rest;
    const eSp = at(
      levelSpawns(at(LEVELS, 'cuu_kieu'))
        .filter((s) => MONSTER.get(s.mon)?.elite)
        .sort((a, b) => Math.abs(a.levelMax - level) - Math.abs(b.levelMax - level)),
      0,
    );
    const eDef = MONSTER.get(eSp.mon)!;
    const eLv = Math.min(eSp.levelMax, Math.max(eSp.levelMin, level));
    const eMs = monsterStats(eLv, eDef.hpMul, eDef.atkMul);
    const eTtk = eMs.hp / playerDps(level, pl.atk, eMs.def, id, eDef.elem);
    const eLost = Math.max(0, monsterDps(eDef, eMs.atk, pl.def) * eTtk - selfSustain(level, id) * pl.hp * eTtk);
    const eRest = eLost / (pl.hp * HP_REGEN_MEDITATE);
    const eXp = monsterXp(eLv, eDef.xpMul) * xpLevelFactor(level, eLv) + meditateXpPerSec(level) * eRest;
    const eSec = eTtk + 25 + eRest;
    const eLoot = lootOf(eDef.id);
    const eGold = (eLoot.gold[0] + eLoot.gold[1]) / 2;
    const need = Math.max(0, xpNeed(level) - fixedXp);
    const mobsPerCycle = CH6_ELITE_EVERY / cycle;
    const cycXp = mobsPerCycle * xpKill + eXp;
    const cycSec = CH6_ELITE_EVERY + eSec;
    const cycles = need / cycXp;
    const lvSec = cycles * cycSec + fixedSec;
    parts.hunt += cycles * (CH6_ELITE_EVERY - mobsPerCycle * rest);
    parts.rest += cycles * (mobsPerCycle * rest + eRest);
    parts.elite += cycles * (eSec - eRest);
    const g = cycles * (mobsPerCycle * goldKill + eGold) + fixedGold;
    gold += g;
    total += lvSec;
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
      mats: {},
    });
  }
  return { hours: total / 3600, rows, gold, parts };
}

{
  const out = new Map<MethodId, ReturnType<typeof ch7Timeline>>(METHOD_IDS.map((m) => [m, ch7Timeline(m)] as const));
  console.log(
    `\nNhịp chương 7 (TN-7): Dương Thực cấp ${DUONG_THUC_LEVEL} → trần ${MAX_LEVEL}, một mình, đồ bậc 6 trọn bộ × Kiều Lực; ${KIEU_COUNT} cầu lần đầu (${CH7_BRIDGE_MIN.join('/')} phút, giả định), ` +
      `tinh anh 1 con/${CH6_ELITE_EVERY / 60} phút săn`,
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
      `  thành phần (giờ): quái ${h(p.hunt)}, tinh anh ${h(p.elite)}, đả tọa ${h(p.rest)}, nhiệm vụ ${h(p.quest)}, boss ${h(p.boss)}, chín cầu ${h(p.bridge)}`,
    );
  }
  for (const id of METHOD_IDS) {
    for (const r of out.get(id)!.rows) {
      if (r.ttk < 3.8 || r.ttk > 7.3) {
        console.error(`LỖI: chương 7 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,8–7,3 s`);
        process.exitCode = 1;
      }
      if (r.eliteTtk < 18 || r.eliteTtk > 40) {
        console.error(`LỖI: chương 7 cấp ${r.level} ${METHOD_NAME[id]} TTK tinh anh ${r.eliteTtk.toFixed(0)}s ngoài 18–40 s`);
        process.exitCode = 1;
      }
      if (r.eliteLostPct > 0.6 || r.lostPct > 0.45) {
        console.error(
          `LỖI: chương 7 cấp ${r.level} ${METHOD_NAME[id]} mất máu quá mức (thường ${pct(r.lostPct)}, tinh anh ${pct(r.eliteLostPct)})`,
        );
        process.exitCode = 1;
      }
    }
  }
  const hs = METHOD_IDS.map((m) => out.get(m)!.hours);
  console.log(`[pace7] ${METHOD_IDS.map((m, i) => m + '=' + at(hs, i).toFixed(2)).join(' ')} target=${CH7_TARGET_H} tol=${CH7_TOL}`);
  for (const [i, m] of METHOD_IDS.entries()) {
    if (Math.abs(at(hs, i) / CH7_TARGET_H - 1) > CH7_TOL) {
      console.error(`LỖI: chương 7 ${METHOD_NAME[m]} ra ${at(hs, i).toFixed(2)} giờ, ngoài ${CH7_TARGET_H} giờ ±${CH7_TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    console.log(
      `  ${METHOD_NAME[id].padEnd(8)} nguồn ${t.gold.toFixed(0)} linh thạch (quái/nhiệm vụ/boss/cầu); ${(t.gold / t.hours).toFixed(0)}/giờ`,
    );
  }
}

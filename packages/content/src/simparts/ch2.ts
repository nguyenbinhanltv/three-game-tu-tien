// Tách từ sim.ts (tối ưu Đợt E): ch2.
import { levelSpawns, type Quality } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  promoteGold,
  PROMOTE_MAT_COUNT,
  TIER_INCOME_HOUR,
  TRIB_PILL_MAX,
  tribDef,
  tribGapAt,
  seededRng,
  rollEquipDrops,
  sellPrice,
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  TRUC_CO_LEVEL,
  KET_DAN_LEVEL,
  shadowStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { FORGE, ITEM, ITEM_SYS, ITEMS, LEVELS, MONSTER, QUESTS } from '../index';

import { at } from '@dtl/shared';
import { MethodId, player, methodAt, playerDps, monsterDps, PULL_FACTOR, selfSustain, hit, METHOD_IDS, METHOD_NAME, pct } from './common';
import { fullSet, dgFirstMin, enhanceExpect } from './balance';
import { HOP_SEC, PATH_FACTOR, RUN_SPEED } from './pace1';

// ---------- nhịp chương 2: Trúc Cơ → Kết Đan (E2-J) ----------

/**
 * Mô hình một người chơi một mình làm chặng Trúc Cơ (cấp 16–19) tới lúc độ kiếp Kết Đan, thời gian tính từng phần:
 * săn quái thường Đoạn Mạch hợp cấp (tìm quái theo cụm của bản đồ), tinh anh gặp dọc đường, nhiệm vụ chính chương 2,
 * một lượt Phục Mạch Quật (khóa ngày: chỉ một lần), Địa Mạch Long (một lần, theo nhóm), thử thách tâm ma ở bình cảnh 17/19,
 * chế Kết Đan Dịch và Đan Hỏa Kiếp (kể cả thất bại làm lại). Số liệu và lý do: `docs/e2j-balance.md`.
 * Mục tiêu: 4 giờ ±12% cho cả ba công pháp (`docs/EXPANSION_DESIGN.md` 2.2).
 */
const CH2_TARGET_H = 4;
const CH2_TOL = 0.12;
/** Một tinh anh gặp mỗi bấy nhiêu giây săn quái thường (10 tinh anh, hồi sinh 240 s, người chơi chỉ ghé khi tiện đường). */
const CH2_ELITE_EVERY = 900;
/** Giây đi tới và nhận/trả một nhiệm vụ (mục tiêu giết quái trùng với săn thường, không tính thêm). */
const CH2_QUEST_OVERHEAD = 150;
/** Phần tu vi một người nhận khi đi nhóm 4: tổng thưởng × `partyXpPool(4)` / 4. */
export const CH2_PARTY_SHARE = 1.6 / 4;
/** Phút đi tới, gom nhóm và hạ Địa Mạch Long (TTK nhóm 4 ≈ 82 s, cộng chờ nhóm, đường đi, nhặt đồ). */
const CH2_BOSS_MIN = 8;
/** Phút chế Kết Đan Dịch (đi Dược sư, nguyên liệu đã có) và giây chuẩn bị tại chỗ độ kiếp. */
const CH2_CRAFT_MIN = 3;
const CH2_TRIB_PREP_SEC = 90;
/** Tỉ lệ mặc giáp bậc 2 (phẩm Linh) kỳ vọng ở từng cấp 16..19: rơi từ quái/tinh anh/phó bản, chế ở Hứa lão. */
let CH2_GEAR_FRAC = [0.3, 0.5, 0.7, 0.85];
export const CH2_GEAR_Q: Quality = 1;

interface Ch2Level {
  level: number;
  mobs: string;
  ttk: number;
  lostPct: number;
  rest: number;
  seek: number;
  kills: number;
  eliteTtk: number;
  eliteLostPct: number;
  elites: number;
  sec: number;
  gold: number;
  dan: number;
  yeu: number;
}
interface Ch2 {
  hours: number;
  rows: Ch2Level[];
  gold: number;
  parts: Record<'hunt' | 'elite' | 'rest' | 'quest' | 'dungeon' | 'boss' | 'trial' | 'craft' | 'trib', number>;
  /** Tu vi/giây khi săn ở cấp 19 (để đổi tu vi mất khi độ kiếp hỏng ra thời gian). */
  rate19: number;
}

/**
 * Cụm Đoạn Mạch (quái thường) người chơi cấp `level` săn: cụm có khoảng cấp từ `level − 2` (chênh ≤ 2 cấp vẫn nhận đủ tu vi, `xpLevelFactor`)
 * tới `level + 1` (quái cao hơn một cấp vẫn đánh được). Không có thì lấy cụm gần cấp nhất.
 */
function ch2Camps(level: number) {
  const all = (at(LEVELS, 'doan_mach').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite && !MONSTER.get(c.mon)?.boss);
  const hit = all.filter((c) => c.levelMax >= level - 2 && c.levelMin <= level + 1);
  if (hit.length) return hit;
  const d = (c: (typeof all)[number]) => Math.min(Math.abs(c.levelMin - level), Math.abs(c.levelMax - level));
  const best = Math.min(...all.map(d));
  return all.filter((c) => d(c) === best);
}

/** Chỉ số người chơi chương 2 cấp `level`: nền + đồ nhiệm vụ, pha dần sang bộ bậc 2 theo `CH2_GEAR_FRAC`, rồi nội tại công pháp. */
function ch2Player(level: number, id: MethodId): { atk: number; def: number; hp: number } {
  const base = player(level);
  const frac = CH2_GEAR_FRAC[Math.min(CH2_GEAR_FRAC.length - 1, level - TRUC_CO_LEVEL)] ?? 1;
  const t2 = fullSet(level, CH2_GEAR_Q);
  const pas = methodAt(level, id)?.passive;
  return {
    atk: base.atk + frac * (t2.atk - base.atk),
    def: Math.round((base.def + frac * (t2.def - base.def)) * (1 + (pas?.defMul ?? 0))),
    hp: Math.round((base.hp + frac * (t2.hp - base.hp)) * (1 + (pas?.hpMul ?? 0))),
  };
}

/** Tay nghề dùng để tính nhịp giờ: người chơi "thường" (né 80%), một mình. */
const CH2_TRIB_DODGE = 0.8;

function ch2Timeline(id: MethodId): Ch2 {
  const rows: Ch2Level[] = [];
  const parts = { hunt: 0, elite: 0, rest: 0, quest: 0, dungeon: 0, boss: 0, trial: 0, craft: 0, trib: 0 };
  let gold = 0;
  let rate19 = 0;
  let total = 0;
  for (let level = TRUC_CO_LEVEL; level < KET_DAN_LEVEL; level++) {
    const pl = ch2Player(level, id);
    const camps = ch2Camps(level);
    const n = camps.reduce((s, c) => s + c.count, 0);
    const perCamp = n / camps.length;
    const nn = camps.map((a) => Math.min(...camps.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z)), 120));
    const seek = HOP_SEC + (PATH_FACTOR * (nn.reduce((s, d) => s + d, 0) / nn.length)) / RUN_SPEED / perCamp;
    let ttk = 0;
    let lost = 0;
    let xpKill = 0;
    let goldKill = 0;
    let yeu = 0;
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
      yeu += w * lt.drops.filter((d) => d.item === 'itm_yeu_dan').reduce((s, d) => s + d.chance * ((d.min + d.max) / 2), 0);
      if (!mix.includes(def.id)) mix.push(def.id);
    }
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    xpKill += meditateXpPerSec(level) * rest;
    const cycle = ttk + seek + rest;
    // Tinh anh gần cấp nhất (17 → Liệt Cốt Báo, 18 → Hổ Mạch Khôi Tướng, 19 → Xích Sa Ngô Công).
    const eSp = at(
      levelSpawns(at(LEVELS, 'doan_mach'))
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
    const eDan = eLoot.drops.filter((d) => d.item === 'itm_ngung_dan_mach_tinh').reduce((s, d) => s + d.chance * ((d.min + d.max) / 2), 0);

    // Phần cố định của cấp: nhiệm vụ chính, phó bản (một lần, cấp 18), Địa Mạch Long (cấp 19, nhóm), thử thách tâm ma ở bình cảnh.
    const qs = QUESTS.filter((q) => q.id.startsWith('q2_') && Math.max(TRUC_CO_LEVEL, q.minLevel ?? TRUC_CO_LEVEL) === level);
    let fixedXp = qs.reduce((s, q) => s + q.rewards.xp, 0);
    let fixedSec = qs.length * CH2_QUEST_OVERHEAD;
    parts.quest += qs.length * CH2_QUEST_OVERHEAD;
    let fixedGold = qs.reduce((s, q) => s + (q.rewards.gold ?? 0), 0);
    let danFixed = 0;
    if (level === 18) {
      const dg = at(LEVELS, 'phuc_mach').dungeon!;
      let waveXp = 0;
      for (const w of dg.waves) for (const g of w.mons) waveXp += monsterXp(g.level, MONSTER.get(g.id)!.xpMul) * g.n;
      fixedXp += xpNeed(level) * dg.reward!.xpPct + waveXp * CH2_PARTY_SHARE;
      const dgSec = (dgFirstMin.get('phuc_mach') ?? 18) * 60;
      fixedSec += dgSec;
      parts.dungeon += dgSec;
      fixedGold += (at(dg.reward!.gold, 0) + at(dg.reward!.gold, 1)) / 2;
      danFixed += dg
        .reward!.items.filter((i) => i.item === 'itm_ngung_dan_mach_tinh')
        .reduce((s, i) => s + i.chance * ((i.min + i.max) / 2), 0);
    }
    if (level === 19) {
      const bd = MONSTER.get('boss_dia_mach_long')!;
      fixedXp += monsterXp(19, bd.xpMul) * CH2_PARTY_SHARE;
      fixedSec += CH2_BOSS_MIN * 60;
      parts.boss += CH2_BOSS_MIN * 60;
      const bl = lootOf(bd.id);
      fixedGold += (bl.gold[0] + bl.gold[1]) / 2;
      danFixed += bl.drops.filter((d) => d.item === 'itm_ngung_dan_mach_tinh').reduce((s, d) => s + d.chance * ((d.min + d.max) / 2), 0);
    }
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id) + 20;
      fixedSec += tt;
      parts.trial += tt;
    }
    // Tu vi còn thiếu kiếm bằng chu kỳ "CH2_ELITE_EVERY giây quái thường + một tinh anh".
    const need = Math.max(0, xpNeed(level) - fixedXp);
    const mobsPerCycle = CH2_ELITE_EVERY / cycle;
    const cycXp = mobsPerCycle * xpKill + eXp;
    const cycSec = CH2_ELITE_EVERY + eSec;
    const cycles = need / cycXp;
    const lvSec = cycles * cycSec + fixedSec;
    parts.hunt += cycles * (CH2_ELITE_EVERY - mobsPerCycle * rest);
    parts.rest += cycles * (mobsPerCycle * rest + eRest);
    parts.elite += cycles * (eSec - eRest);
    if (level === KET_DAN_LEVEL - 1) rate19 = cycXp / cycSec;
    const g = cycles * (mobsPerCycle * goldKill + eGold) + fixedGold;
    gold += g;
    total += lvSec;
    rows.push({
      level,
      mobs: mix.join('+'),
      ttk,
      lostPct: lost / pl.hp,
      rest,
      seek,
      kills: cycles * mobsPerCycle,
      eliteTtk: eTtk,
      eliteLostPct: eLost / pl.hp,
      elites: cycles,
      sec: lvSec,
      gold: g,
      dan: cycles * eDan + danFixed,
      yeu: cycles * mobsPerCycle * yeu,
    });
  }
  // Chế Kết Đan Dịch, chuẩn bị, Đan Hỏa Kiếp (55 s); thất bại mất `failXpLoss` tu vi cấp 19 và phải làm lại.
  const td = tribDef('ket_dan');
  const tribOnce = CH2_TRIB_PREP_SEC + td.duration;
  const failP = 1 - danHoaPass(id, CH2_TRIB_DODGE, 0, 2000).pass;
  const retry = failP / (1 - failP);
  const lossSec = (xpNeed(KET_DAN_LEVEL - 1) * td.failXpLoss) / rate19;
  parts.craft += CH2_CRAFT_MIN * 60;
  parts.trib += tribOnce + retry * (tribOnce + lossSec + CH2_CRAFT_MIN * 60);
  total += parts.craft + parts.trib;
  return { hours: total / 3600, rows, gold, parts, rate19 };
}

// ---------- Đan Hỏa Kiếp (E2-D, cân bằng E2-J) ----------

/** Người độ kiếp thử nghiệm: tay nghề `dodge` = xác suất né thành công mỗi lần cố né (tia nhắm, vạch quét). */
export const TRIB_SKILL: { name: string; dodge: number }[] = [
  { name: 'vụng', dodge: 0.6 },
  { name: 'thường', dodge: 0.8 },
  { name: 'giỏi', dodge: 0.92 },
];
/** Giây không đứng yên trong vòng khi né một đòn (bước ra rồi về) và lượng thở hồi bằng Hộ Thể. */
const TRIB_DODGE_COST = 1.0;
export const TRIB_SHIELD = 0.35;
/** Tia rơi quanh trúng người đứng yên với xác suất `r² / (dMax² − dMin²)`. */
export const trPHit = (r: number, d: { min: number; max: number }) => Math.min(1, (r * r) / (d.max * d.max - d.min * d.min));

/** Mô phỏng Monte Carlo một lần độ kiếp theo dữ liệu `tribulations.json`; trả về qua hay không và máu cuối. */
function danHoaRun(id: MethodId, dodge: number, guards: number, rng: () => number): { ok: boolean; why: string } {
  const td = tribDef('ket_dan');
  const lv = td.from;
  const pl = ch2Player(lv, id);
  const mhp = pl.hp;
  let hp = mhp;
  let pills = TRIB_PILL_MAX;
  let pillCd = 0;
  let shield = TRIB_SHIELD * mhp;
  const regen = selfSustain(lv, id) * 0.5; // chiêu hồi nguyên/hồi xuân dùng được trong kiếp (một nửa hiệu suất thường ngày).
  const T = td.duration;
  const dt = 0.1;
  const ph = td.phases;
  const dt2 = at(ph, 1).danTran!;
  const sh = at(ph, 1).shadows!;
  const base = shadowStats(lv, pl.atk, pl.def);
  const shHp = Math.max(1, Math.round(mhp * sh.hpFrac));
  const shDps = (hit(base.atk, 1, pl.def) / 1.8) * 0.8; // đánh mỗi 1,8 s, ~80% trúng
  const myDps = playerDps(lv, pl.atk, base.def, id);
  let pg = 0;
  let nextWave = td.firstDelay;
  let nextSweep = at(ph, 0).end + 1.5;
  let nextShadow = at(ph, 0).end;
  let shadows: number[] = []; // máu còn lại từng bóng
  let busy = 0; // giây còn lại đang né (không đứng yên)
  let finalAt = -1;
  let finalDone = false;
  const take = (x: number) => {
    const s = Math.min(shield, x);
    shield -= s;
    hp -= x - s;
  };
  for (let t = 0; t < T; t += dt) {
    const pi = t < at(ph, 0).end ? 0 : t < at(ph, 1).end ? 1 : 2;
    const p = at(ph, pi);
    busy = Math.max(0, busy - dt);
    pillCd = Math.max(0, pillCd - dt);
    hp = Math.min(mhp, hp + regen * mhp * dt);
    if (hp <= 0) return { ok: false, why: 'chết' };
    // Uống đan khi dưới nửa máu; trước tia cuối khóa mệnh (70%) thì dưỡng lên đầy hơn.
    const topUp = t >= at(ph, 1).end - 2 && !finalDone && hp < mhp * 0.85;
    if ((hp < mhp * 0.5 || topUp) && pills > 0 && pillCd <= 0) {
      pills--;
      pillCd = 12;
      hp = Math.min(mhp, hp + 0.4 * mhp);
    }
    // Tia cuối khóa mệnh mở pha 3.
    if (pi === 2 && finalAt < 0 && p.final) {
      finalAt = t + p.final.delay;
      nextWave = Math.max(nextWave, finalAt);
    }
    if (finalAt >= 0 && !finalDone && t >= finalAt) {
      finalDone = true;
      const f = p.final!;
      // Kim Cương Đan (người chơi chuẩn bị) giảm tia cuối `defMul × 15%`, tối đa `defMaxCut`.
      const cut = Math.min(f.defMaxCut ?? 0, 0.15 * (f.defMul ?? 1));
      take(mhp * f.pct * (1 - cut) * (guards > 0 ? 1 - (f.guardShare ?? 0) : 1));
    }
    // Pha ngưng đan: thanh đầy khi đứng yên trong vòng; bóng tâm ma.
    if (pi === 1) {
      const slackLeft = at(ph, 1).end - t;
      if (busy <= 0) pg = Math.min(100, pg + (100 / dt2.fill) * dt);
      else pg = Math.max(0, pg - dt2.drain * dt * 0.5);
      if (t >= nextShadow) {
        nextShadow += sh.every ?? 7;
        const room = Math.max(0, sh.maxAlive - shadows.length);
        for (let i = 0; i < Math.min(sh.count, room); i++) shadows.push(shHp);
      }
      if (shadows.length) {
        shadows[0] = (shadows[0] ?? 0) - myDps * dt;
        if (at(shadows, 0) <= 0) shadows.shift();
        take(shadows.length * shDps * dt);
      }
      if (t >= nextSweep) {
        nextSweep += dt2.sweepEvery;
        // Vạch quét: người đứng yên trúng ~75%; né tốn `TRIB_DODGE_COST` giây nếu còn đủ thời gian đầy thanh.
        const need = (100 - pg) / (100 / dt2.fill);
        const canDodge = slackLeft - TRIB_DODGE_COST >= need;
        if (canDodge) {
          busy = Math.max(busy, TRIB_DODGE_COST);
          if (rng() > dodge) take(mhp * dt2.sweepPct);
        } else if (rng() < 0.75) take(mhp * dt2.sweepPct);
      }
    }
    if (t >= nextWave) {
      nextWave += tribGapAt(td, pi, t);
      if (p.aimPct) {
        if (pi === 1) {
          const need = (100 - pg) / (100 / dt2.fill);
          const canDodge = at(ph, 1).end - t - TRIB_DODGE_COST >= need;
          if (canDodge) {
            busy = Math.max(busy, TRIB_DODGE_COST);
            if (rng() > dodge) take(mhp * p.aimPct);
          } else take(mhp * p.aimPct);
        } else if (rng() > dodge) take(mhp * p.aimPct);
      }
      for (let i = 0; i < (p.extra ?? 0); i++) if (rng() < trPHit(p.extraR ?? 3.6, td.extraDist)) take(mhp * (p.extraPct ?? 0.1));
    }
    if (pi === 1 && t + dt >= at(ph, 1).end && pg < 100) return { ok: false, why: 'ngưng đan thiếu' };
  }
  return hp > 0 ? { ok: true, why: '' } : { ok: false, why: 'chết' };
}

function danHoaPass(id: MethodId, dodge: number, guards: number, runs = 4000): { pass: number; fillFail: number } {
  const rng = seededRng(90210 + Math.round(dodge * 1000) + guards);
  let ok = 0;
  let fillFail = 0;
  for (let i = 0; i < runs; i++) {
    const r = danHoaRun(id, dodge, guards, rng);
    if (r.ok) ok++;
    else if (r.why === 'ngưng đan thiếu') fillFail++;
  }
  return { pass: ok / runs, fillFail: fillFail / runs };
}
{
  console.log(
    '\nĐan Hỏa Kiếp (Kết Đan, cấp 19, Monte Carlo 4000 lần): tỉ lệ qua theo tay nghề (né thành công mỗi lần cố né) và công pháp, một mình | có hộ pháp chắn tia cuối',
  );
  for (const sk of TRIB_SKILL) {
    const cells = METHOD_IDS.map((m) => {
      const a = danHoaPass(m, sk.dodge, 0);
      const b = danHoaPass(m, sk.dodge, 1);
      // Thang khó: người thường qua 55–90% một mình, người giỏi ≥ 90%, hộ pháp chắn luôn giúp; ngưng đan thiếu giờ không phải nguyên nhân chính.
      if (sk.name === 'thường' && (a.pass < 0.55 || a.pass > 0.9)) {
        console.error(`LỖI: Đan Hỏa Kiếp ${METHOD_NAME[m]} tay thường qua ${pct(a.pass)} một mình, ngoài 55–90%`);
        process.exitCode = 1;
      }
      if (sk.name === 'giỏi' && a.pass < 0.9) {
        console.error(`LỖI: Đan Hỏa Kiếp ${METHOD_NAME[m]} tay giỏi chỉ qua ${pct(a.pass)} (quá khó)`);
        process.exitCode = 1;
      }
      if (sk.name === 'vụng' && a.pass > 0.5) {
        console.error(`LỖI: Đan Hỏa Kiếp ${METHOD_NAME[m]} tay vụng qua ${pct(a.pass)} (quá dễ)`);
        process.exitCode = 1;
      }
      if (b.pass < a.pass) {
        console.error(`LỖI: Đan Hỏa Kiếp có hộ pháp (${pct(b.pass)}) kém hơn một mình (${pct(a.pass)})`);
        process.exitCode = 1;
      }
      return `${METHOD_NAME[m]} ${pct(a.pass)} | ${pct(b.pass)}`;
    });
    console.log(`  tay ${sk.name.padEnd(6)} (né ${pct(sk.dodge)}): ${cells.join('; ')}`);
  }
}

{
  const out = new Map<MethodId, Ch2>(METHOD_IDS.map((m) => [m, ch2Timeline(m)] as const));
  console.log(
    '\nNhịp chương 2 (E2-J): Trúc Cơ cấp 16 → độ kiếp Kết Đan, một mình, đồ bậc 2 kỳ vọng ' +
      CH2_GEAR_FRAC.map(pct).join('/') +
      ` (phẩm ${CH2_GEAR_Q}); tinh anh 1 con/${CH2_ELITE_EVERY / 60} phút săn`,
  );
  console.log('cấp  bãi                                   TTK  mất/lần  tọa  tìm   giết  tinh anh (TTK/mất)  giờ cấp');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    console.log(METHOD_NAME[id] + ': ' + t.hours.toFixed(2) + ' giờ');
    for (const r of t.rows) {
      console.log(
        `${String(r.level).padStart(3)}  ${r.mobs.slice(0, 36).padEnd(36)} ${r.ttk.toFixed(1).padStart(4)}s ${pct(r.lostPct).padStart(6)} ${r.rest.toFixed(0).padStart(4)}s ${r.seek.toFixed(1).padStart(4)}s ${r.kills.toFixed(0).padStart(5)}  ${r.eliteTtk.toFixed(0).padStart(3)}s ${pct(r.eliteLostPct).padStart(4)} x${r.elites.toFixed(1).padStart(4)}  ${(r.sec / 3600).toFixed(2).padStart(6)}`,
      );
    }
    const p = t.parts;
    const h = (x: number) => (x / 3600).toFixed(2);
    console.log(
      `  thành phần (giờ): quái ${h(p.hunt)}, tinh anh ${h(p.elite)}, đả tọa ${h(p.rest)}, nhiệm vụ ${h(p.quest)}, phó bản ${h(p.dungeon)}, Địa Mạch Long ${h(p.boss)}, tâm ma ${h(p.trial)}, chế Dịch ${h(p.craft)}, Đan Hỏa Kiếp ${h(p.trib)}`,
    );
  }
  // Thời gian hạ quái với đồ bậc 2 kỳ vọng: quái thường 4–7 s (hộ pháp/đan sư chậm hơn một chút nên cho tới 7,3 s), tinh anh 18–40 s.
  for (const id of METHOD_IDS) {
    for (const r of out.get(id)!.rows) {
      if (r.ttk < 3.7 || r.ttk > 7.3) {
        console.error(`LỖI: chương 2 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,7–7,3 s`);
        process.exitCode = 1;
      }
      if (r.eliteTtk < 18 || r.eliteTtk > 40) {
        console.error(`LỖI: chương 2 cấp ${r.level} ${METHOD_NAME[id]} TTK tinh anh ${r.eliteTtk.toFixed(0)}s ngoài 18–40 s`);
        process.exitCode = 1;
      }
      if (r.lostPct > 0.45) {
        console.error(`LỖI: chương 2 cấp ${r.level} ${METHOD_NAME[id]} mất ${pct(r.lostPct)} máu mỗi lần giết`);
        process.exitCode = 1;
      }
    }
  }
  const hs = METHOD_IDS.map((m) => out.get(m)!.hours);
  console.log(`[pace2] ${METHOD_IDS.map((m, i) => m + '=' + at(hs, i).toFixed(2)).join(' ')} target=${CH2_TARGET_H} tol=${CH2_TOL}`);
  for (const [i, m] of METHOD_IDS.entries()) {
    if (Math.abs(at(hs, i) / CH2_TARGET_H - 1) > CH2_TOL) {
      console.error(`LỖI: chương 2 ${METHOD_NAME[m]} ra ${at(hs, i).toFixed(2)} giờ, ngoài ${CH2_TARGET_H} giờ ±${CH2_TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  // Độ nhạy theo đồ bậc 2: không có món nào (mặc đồ cấp 15) và đủ bộ phẩm Linh từ đầu chương. Người chơi thật nằm giữa hai mốc này.
  const keep = CH2_GEAR_FRAC;
  const sens: string[] = [];
  for (const [name, f] of [
    ['không đồ bậc 2', [0, 0, 0, 0]],
    ['đủ bộ ngay', [1, 1, 1, 1]],
  ] as const) {
    CH2_GEAR_FRAC = [...f];
    const h = ch2Timeline('lac_kiem_quyet').hours;
    sens.push(`${name} ${h.toFixed(2)} giờ`);
  }
  CH2_GEAR_FRAC = keep;
  console.log(`Độ nhạy (Kiếm tu): ${sens.join(', ')}; kỳ vọng ${out.get('lac_kiem_quyet')!.hours.toFixed(2)} giờ.`);

  // Kinh tế chương 2 theo sim (một mình): nguồn = vàng rơi + bán trang bị rơi + vàng nhiệm vụ/phó bản/boss; tiêu = Thăng Bậc, cường hóa +5, chế một bộ, Kết Đan Dịch, Phá Cảnh Đan, đan hồi.
  const sellOf = (mon: string, lv: number) => {
    const lt = lootOf(mon);
    const rng = seededRng(5 + lv);
    let g = 0;
    const N = 1500;
    for (let i = 0; i < N; i++)
      for (const d of rollEquipDrops(lt.equip, ITEM_SYS, ITEMS, lv, rng))
        g += sellPrice({ id: d.id, n: 1, inst: { q: d.q, ilvl: d.ilvl, main: {}, affixes: [], gems: [], bound: false } }, ITEM.get(d.id)!);
    return g / N;
  };
  const price = (id: string) => Math.max(ITEM.get(id)!.price, ITEM.get(id)!.sell * 3);
  const t2 = ITEMS.filter((i) => (i.tier === 2 && !i.set && i.kind !== 'weapon') || i.id === 'itm_liet_mach_kiem');
  const promote = t2.length * promoteGold(2);
  const enh5 = ['itm_liet_mach_kiem', 'itm_mach_van_dao_bao', 'itm_sa_thach_ho_uyen', 'itm_kho_ha_van_ngoa'].reduce(
    (n, id) => n + enhanceExpect(5, price(id), false),
    0,
  );
  const forge = FORGE.filter((f) => f.id.startsWith('frg_lm_')).reduce((n, f) => n + f.gold, 0);
  const kdFail = 1 - danHoaPass('lac_kiem_quyet', CH2_TRIB_DODGE, 0, 2000).pass;
  const kdDich = (ITEMS.find((i) => i.id === 'itm_ket_dan_dich') ? 1500 : 0) * (1 + kdFail / (1 - kdFail));
  const phaCanh = 2 * 150 + 2 * 4 * 5;
  const consumables = 60 * 25;
  const sink = promote + enh5 + forge + kdDich + phaCanh + consumables;
  console.log('\nKinh tế chương 2 (một mình, tới độ kiếp Kết Đan):');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    let sold = 0;
    for (const r of t.rows)
      sold += r.kills * sellOf(at(ch2Camps(r.level), 0).mon, r.level) + r.elites * sellOf('elite_liet_cot_bao', r.level);
    const src = t.gold + sold;
    console.log(
      `  ${METHOD_NAME[id].padEnd(8)} nguồn ${src.toFixed(0)} = ${t.gold.toFixed(0)} vàng rơi/nhiệm vụ/phó bản/boss + ${sold.toFixed(0)} bán đồ; ${(src / t.hours).toFixed(0)}/giờ (thiết kế ~${at(TIER_INCOME_HOUR, 2) * 1.2}/giờ)`,
    );
    const r = sink / src;
    if (id === 'lac_kiem_quyet' && (r < 0.8 || r > 2.2)) {
      console.error(`LỖI: hố tiêu chương 2 gấp ${r.toFixed(2)} lần nguồn thu của sim, ngoài 0,8–2,2`);
      process.exitCode = 1;
    }
  }
  console.log(
    `  tiêu cầu toàn ${sink.toFixed(0)} = Thăng Bậc ${t2.length} ô ${promote} + cường hóa +5 bốn ô ${enh5.toFixed(0)} + chế một bộ ${forge} + Kết Đan Dịch ${kdDich.toFixed(0)} + Phá Cảnh Đan ${phaCanh} + đan hồi ${consumables}.`,
  );
  // Nguyên liệu: cần 3 Ngưng Đan Mạch Tinh + 10 Yêu Đan cho mỗi Kết Đan Dịch (+ làm lại), 20 Mạch Tinh Phiến mỗi lần Thăng Bậc.
  const k = out.get('lac_kiem_quyet')!;
  const dan = k.rows.reduce((n, r) => n + r.dan, 0);
  const yeu = k.rows.reduce((n, r) => n + r.yeu, 0);
  const need = 3 * (1 + kdFail / (1 - kdFail));
  console.log(
    `  Ngưng Đan Mạch Tinh ≈ ${dan.toFixed(1)} (cần ${need.toFixed(1)}), Yêu Đan ≈ ${yeu.toFixed(0)} (cần 10 + ${(2 * 4).toFixed(0)} Phá Cảnh Đan).`,
  );
  // Mạch Tinh Phiến: quái thường 12%/con + tinh anh 2–3 + phó bản 6–9 + Địa Mạch Long 6–9 (chưa tính điểm thu thập 8 cục/60 s); Thăng Bậc cần 20 mỗi món.
  const phien = k.rows.reduce((n, r) => n + r.kills * 0.12 + r.elites * 2.5, 0) + 7.5 + 7.5;
  console.log(
    `  Mạch Tinh Phiến ≈ ${phien.toFixed(0)} (từ rơi; chưa tính điểm thu thập), Thăng Bậc ${t2.length} ô cần ${t2.length * PROMOTE_MAT_COUNT}.`,
  );
  if (dan < need * 1.3) {
    console.error(`LỖI: Ngưng Đan Mạch Tinh ≈ ${dan.toFixed(1)} không đủ dư (cần ${need.toFixed(1)} × 1,3) cho Kết Đan Dịch`);
    process.exitCode = 1;
  }
}

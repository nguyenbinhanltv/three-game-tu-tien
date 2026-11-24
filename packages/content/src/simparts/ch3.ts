// Tách từ sim.ts (tối ưu Đợt E): ch3.
import { levelSpawns, type Quality } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  promoteGold,
  TIER_INCOME_HOUR,
  TRIB_PILL_MAX,
  tribDef,
  tribGapAt,
  computePlayerStats,
  rollItemInstance,
  seededRng,
  droppableSlots,
  rollEquipDrops,
  sellPrice,
  templatesFor,
  HP_REGEN_MEDITATE,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  KET_DAN_LEVEL,
  NGUYEN_ANH_LEVEL,
  shadowStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { FORGE, ITEM, ITEM_SYS, ITEMS, LEVELS, MONSTER, QUESTS } from '../index';

import { at } from '@dtl/shared';
import { MethodId, player, methodAt, selfSustain, playerDps, hit, monsterDps, PULL_FACTOR, METHOD_IDS, METHOD_NAME, pct } from './common';
import { CH2_GEAR_Q, TRIB_SHIELD, trPHit, CH2_PARTY_SHARE, TRIB_SKILL } from './ch2';
import { HOP_SEC, PATH_FACTOR, RUN_SPEED } from './pace1';
import { dgFirstMin, enhanceExpect } from './balance';

// ---------- Nhịp chương 3 (E3-G/E3-J): Kết Đan sơ kỳ (cấp 20) → độ kiếp Nguyên Anh ----------
// Cùng cách dựng với chương 2 (E2-J), thay dữ liệu bằng Vân Hải Phù Đảo: cụm quái `van_hai.json` (cấp 20–23), nhiệm vụ chính `q3_*` + phụ `s3_*`,
// Kính Nguyệt Cung (cấp 21, một lượt), Vân Hải Kình Vương (nhóm 4), thử thách tâm ma ở bình cảnh 21/23, chế Nguyên Anh Đan và Tam Trọng Kiếp.
// Mục tiêu: 6 giờ ±12% cho cả ba công pháp (`docs/EXPANSION_DESIGN.md` 2.2). Số liệu và lý do: `docs/e3j-balance.md`.
const CH3_TARGET_H = 6;
const CH3_TOL = 0.12;
/** Một tinh anh gặp mỗi bấy nhiêu giây săn (12 tinh anh trên 5 đảo, hồi sinh dài, người chơi ghé khi tiện đường). */
const CH3_ELITE_EVERY = 900;
const CH3_QUEST_OVERHEAD = 150;
const CH3_BOSS_MIN = 8;
/** Phút chế Nguyên Anh Đan (đi Tố Tâm, nguyên liệu đã có) và giây chuẩn bị tại sân Tam Trọng Kiếp. */
const CH3_CRAFT_MIN = 4;
const CH3_TRIB_PREP_SEC = 90;
/** Tỉ lệ mặc giáp bậc 3 (phẩm Linh) kỳ vọng ở từng cấp 20..23 (phần còn lại là bộ bậc 2). */
let CH3_GEAR_FRAC = [0.3, 0.5, 0.7, 0.85];
export const CH3_GEAR_Q: Quality = 1;
/** Tay nghề dùng để tính nhịp giờ: người chơi "thường" (né 80%), một mình. */
const CH3_TRIB_DODGE = 0.8;

/** Bộ 7 ô phẩm `q` của bậc có `reqLevel` = `req`, ilvl = `level` (như `fullSet`, nhưng chọn bậc). */
const fullSetTierCache = new Map<string, { atk: number; def: number; hp: number }>();
export function fullSetTier(level: number, q: Quality, req: number) {
  const key = `${level}:${q}:${req}`;
  const hitC = fullSetTierCache.get(key);
  if (hitC) return hitC;
  const slots = droppableSlots(ITEM_SYS, ITEMS);
  const acc = { atk: 0, def: 0, hp: 0 };
  const RUNS = 40;
  for (let run = 0; run < RUNS; run++) {
    const rng = seededRng(2000 + run);
    const worn = slots.map((sl) => {
      const tpl = at(templatesFor(ITEMS, sl, req), 0);
      return { item: { id: tpl.id, n: 1, inst: rollItemInstance(ITEM_SYS, sl, level, q, rng, tpl.tier) } };
    });
    const st = computePlayerStats(level, worn);
    acc.atk += st.atk;
    acc.def += st.def;
    acc.hp += st.hp;
  }
  const res = { atk: acc.atk / RUNS, def: acc.def / RUNS, hp: acc.hp / RUNS };
  fullSetTierCache.set(key, res);
  return res;
}

/** Chỉ số người chơi chương 3 cấp `level`: bộ bậc 2 (đang mặc từ chương 2) pha dần sang bộ bậc 3 theo `CH3_GEAR_FRAC`, rồi nội tại công pháp. */
function ch3Player(level: number, id: MethodId): { atk: number; def: number; hp: number } {
  const base = player(level);
  const t2 = fullSetTier(level, CH2_GEAR_Q, KET_DAN_LEVEL - 1);
  const prev = {
    atk: base.atk + 0.85 * (t2.atk - base.atk),
    def: base.def + 0.85 * (t2.def - base.def),
    hp: base.hp + 0.85 * (t2.hp - base.hp),
  };
  const frac = CH3_GEAR_FRAC[Math.min(CH3_GEAR_FRAC.length - 1, level - KET_DAN_LEVEL)] ?? 1;
  const t3 = fullSetTier(level, CH3_GEAR_Q, level);
  const pas = methodAt(level, id)?.passive;
  return {
    atk: prev.atk + frac * (t3.atk - prev.atk),
    def: Math.round((prev.def + frac * (t3.def - prev.def)) * (1 + (pas?.defMul ?? 0))),
    hp: Math.round((prev.hp + frac * (t3.hp - prev.hp)) * (1 + (pas?.hpMul ?? 0))),
  };
}

/** Cụm Vân Hải (quái thường) người chơi cấp `level` săn: khoảng cấp từ `level − 2` tới `level + 1` (như chương 2). */
function ch3Camps(level: number) {
  const all = (at(LEVELS, 'van_hai').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite && !MONSTER.get(c.mon)?.boss);
  const hit = all.filter((c) => c.levelMax >= level - 2 && c.levelMin <= level + 1);
  if (hit.length) return hit;
  const d = (c: (typeof all)[number]) => Math.min(Math.abs(c.levelMin - level), Math.abs(c.levelMax - level));
  const best = Math.min(...all.map(d));
  return all.filter((c) => d(c) === best);
}

/**
 * Tam Trọng Kiếp (Nguyên Anh, 65 s) theo `tribulations.json` (`nguyen_anh`): pha lôi (tia nhắm, tia rơi quanh, tia xích), pha hỏa (lưới 4×4, một ô luôn là ô
 * người độ kiếp đứng, một ô ngẫu nhiên; xuất khiếu 6 s mỗi 20 s đẩy lửa nặng sang ô kề), pha tâm ma (tia + Tâm Ma Ảnh dùng chiêu, tâm cảnh; hạ được bóng thì kiếp thành,
 * sống tới hết 65 s cũng thành). Hộ pháp: kiếp này không có tia khóa mệnh (`final`) nên luật server không cho hộ pháp chắn gì; `guards` chỉ để in đủ cột.
 */
const naCtxCache = new Map<string, { mhp: number; regen: number; shKill: number; skillDmg: number }>();
function tamTrongRun(id: MethodId, dodge: number, rng: () => number): { ok: boolean; why: string } {
  const td = tribDef('nguyen_anh');
  const lv = td.from;
  const ph = td.phases;
  const ckey = id + ':' + CH3_GEAR_FRAC.join(',');
  let ctx = naCtxCache.get(ckey);
  if (!ctx) {
    const pl = ch3Player(lv, id);
    const sh = shadowStats(lv, pl.atk, pl.def);
    const shHp = Math.max(1, Math.round(pl.hp * at(ph, 2).shadows!.hpFrac));
    ctx = {
      mhp: pl.hp,
      regen: selfSustain(lv, id) * 0.5,
      shKill: shHp / playerDps(lv, pl.atk, sh.def, id),
      skillDmg: hit(sh.atk, at(ph, 2).tamCanh!.skillPow, pl.def) / pl.hp,
    };
    naCtxCache.set(ckey, ctx);
  }
  const { mhp, regen, shKill, skillDmg } = ctx;
  let hp = mhp;
  let pills = td.pillMax ?? TRIB_PILL_MAX;
  let pillCd = 0;
  let shield = TRIB_SHIELD * mhp;
  const T = td.duration;
  const dt = 0.1;
  const grid = at(ph, 1).grid!;
  const xk = at(ph, 1).xuatKhieu!;
  const tc = at(ph, 2).tamCanh!;
  const tx = at(ph, 0).tiaXich!;
  let nextWave = td.firstDelay;
  let nextXich = 1.5;
  let nextGrid = at(ph, 0).end;
  let nextSkill = at(ph, 1).end + tc.skillEvery;
  let soulUntil = -1;
  let soulCd = at(ph, 0).end;
  let heart = 100;
  const take = (x: number) => {
    const s = Math.min(shield, x);
    shield -= s;
    hp -= x - s;
  };
  for (let t = 0; t < T; t += dt) {
    const pi = t < at(ph, 0).end ? 0 : t < at(ph, 1).end ? 1 : 2;
    const p = at(ph, pi);
    pillCd = Math.max(0, pillCd - dt);
    hp = Math.min(mhp, hp + regen * mhp * dt);
    if (hp <= 0) return { ok: false, why: 'chết' };
    if (hp < mhp * 0.5 && pills > 0 && pillCd <= 0) {
      pills--;
      pillCd = 12;
      hp = Math.min(mhp, hp + 0.4 * mhp);
    }
    // Hạ được Tâm Ma Ảnh: kiếp thành ngay.
    if (pi === 2 && t - at(ph, 1).end >= shKill) return { ok: true, why: '' };
    // Tia nhắm + tia rơi quanh theo nhịp co dần của pha.
    if (t >= nextWave) {
      nextWave += tribGapAt(td, pi, t);
      if (p.aimPct && rng() > dodge) take(mhp * p.aimPct);
      for (let i = 0; i < (p.extra ?? 0); i++) if (rng() < trPHit(p.extraR ?? 3.6, td.extraDist)) take(mhp * (p.extraPct ?? 0.1));
    }
    if (pi === 0 && t >= nextXich) {
      const k = Math.min(1, t / at(ph, 0).end);
      nextXich += tx.every * (1 - 0.3 * k);
      // Vạch sét đi qua chỗ đứng (lệch ngang ±2,5 m, rộng 2,6 m: người đứng yên trúng ~70%); hai tia hai đầu chỉ trúng người né sai hướng.
      if (rng() > dodge) {
        if (rng() < 0.7) take(mhp * tx.pct);
        if (rng() < 0.25) take(mhp * tx.endPct);
      }
    }
    if (pi === 1) {
      // Xuất khiếu: dùng ngay khi sẵn sàng, thân đứng yên nhưng lửa nặng không rơi vào ô thân.
      if (t >= soulCd && t >= soulUntil) {
        soulUntil = t + xk.dur;
        soulCd = t + xk.cd;
      }
      if (t >= nextGrid) {
        nextGrid += tribGapAt(td, pi, t);
        const heavy = t < soulUntil ? 0 : 1;
        if (heavy && rng() > dodge) take(mhp * grid.pct * (1 + (grid.burn > 0 ? 0.5 : 0)));
        if (rng() < (grid.pick - 1) / (grid.cols * grid.rows - 1) && rng() > dodge) take(mhp * grid.pct);
      }
    }
    if (pi === 2 && t >= nextSkill) {
      nextSkill += tc.skillEvery;
      if (rng() > dodge) {
        take(mhp * skillDmg);
        heart -= tc.hurt;
      }
    }
    if (pi === 2) heart = Math.min(100, heart + tc.hit * dt);
    if (heart <= 0) return { ok: false, why: 'tâm cảnh' };
  }
  return hp > 0 ? { ok: true, why: '' } : { ok: false, why: 'chết' };
}

function tamTrongPass(id: MethodId, dodge: number, runs = 4000): number {
  const rng = seededRng(77310 + Math.round(dodge * 1000));
  let ok = 0;
  for (let i = 0; i < runs; i++) if (tamTrongRun(id, dodge, rng).ok) ok++;
  return ok / runs;
}

interface Ch3Level {
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
  phach: number;
}
interface Ch3 {
  hours: number;
  rows: Ch3Level[];
  gold: number;
  parts: Record<'hunt' | 'elite' | 'rest' | 'quest' | 'dungeon' | 'boss' | 'trial' | 'craft' | 'trib', number>;
  rate23: number;
}

function ch3Timeline(id: MethodId): Ch3 {
  const rows: Ch3Level[] = [];
  const parts = { hunt: 0, elite: 0, rest: 0, quest: 0, dungeon: 0, boss: 0, trial: 0, craft: 0, trib: 0 };
  let gold = 0;
  let rate23 = 0;
  let total = 0;
  for (let level = KET_DAN_LEVEL; level < NGUYEN_ANH_LEVEL; level++) {
    const pl = ch3Player(level, id);
    const camps = ch3Camps(level);
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
      levelSpawns(at(LEVELS, 'van_hai'))
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
    const phachOf = (lt: ReturnType<typeof lootOf>) =>
      lt.drops.filter((d) => d.item === 'itm_ngung_anh_phach').reduce((s, d) => s + d.chance * ((d.min + d.max) / 2), 0);
    const ePhach = phachOf(eLoot);

    // Phần cố định của cấp: nhiệm vụ chính + phụ, Kính Nguyệt Cung (một lần, cấp 21), Vân Hải Kình Vương (cấp 23, nhóm), thử thách tâm ma ở bình cảnh.
    const qs = QUESTS.filter(
      (q) => (q.id.startsWith('q3_') || q.id.startsWith('s3_')) && Math.max(KET_DAN_LEVEL, q.minLevel ?? KET_DAN_LEVEL) === level,
    );
    let fixedXp = qs.reduce((s, q) => s + q.rewards.xp, 0);
    let fixedSec = qs.length * CH3_QUEST_OVERHEAD;
    parts.quest += qs.length * CH3_QUEST_OVERHEAD;
    let fixedGold = qs.reduce((s, q) => s + (q.rewards.gold ?? 0), 0);
    let phachFixed = 0;
    if (level === 21) {
      const dg = at(LEVELS, 'kinh_nguyet').dungeon!;
      let waveXp = 0;
      for (const w of dg.waves) for (const g of w.mons) waveXp += monsterXp(g.level, MONSTER.get(g.id)!.xpMul) * g.n;
      fixedXp += xpNeed(level) * dg.reward!.xpPct + waveXp * CH2_PARTY_SHARE;
      const dgSec = (dgFirstMin.get('kinh_nguyet') ?? 24) * 60;
      fixedSec += dgSec;
      parts.dungeon += dgSec;
      fixedGold += (at(dg.reward!.gold, 0) + at(dg.reward!.gold, 1)) / 2;
      phachFixed += dg
        .reward!.items.filter((i) => i.item === 'itm_ngung_anh_phach')
        .reduce((s, i) => s + i.chance * ((i.min + i.max) / 2), 0);
    }
    if (level === 23) {
      const bd = MONSTER.get('boss_van_hai_kinh_vuong')!;
      fixedXp += monsterXp(23, bd.xpMul) * CH2_PARTY_SHARE;
      fixedSec += CH3_BOSS_MIN * 60;
      parts.boss += CH3_BOSS_MIN * 60;
      const bl = lootOf(bd.id);
      fixedGold += (bl.gold[0] + bl.gold[1]) / 2;
      phachFixed += phachOf(bl);
    }
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id) + 20;
      fixedSec += tt;
      parts.trial += tt;
    }
    const need = Math.max(0, xpNeed(level) - fixedXp);
    const mobsPerCycle = CH3_ELITE_EVERY / cycle;
    const cycXp = mobsPerCycle * xpKill + eXp;
    const cycSec = CH3_ELITE_EVERY + eSec;
    const cycles = need / cycXp;
    const lvSec = cycles * cycSec + fixedSec;
    parts.hunt += cycles * (CH3_ELITE_EVERY - mobsPerCycle * rest);
    parts.rest += cycles * (mobsPerCycle * rest + eRest);
    parts.elite += cycles * (eSec - eRest);
    if (level === NGUYEN_ANH_LEVEL - 1) rate23 = cycXp / cycSec;
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
      phach: cycles * ePhach + phachFixed,
    });
  }
  // Chế Nguyên Anh Đan, chuẩn bị, Tam Trọng Kiếp (65 s); thất bại mất `failXpLoss` tu vi cấp 23 và phải làm lại (mất cả đan).
  const td = tribDef('nguyen_anh');
  const tribOnce = CH3_TRIB_PREP_SEC + td.duration;
  const failP = 1 - tamTrongPass(id, CH3_TRIB_DODGE, 2000);
  const retry = failP / (1 - failP);
  const lossSec = (xpNeed(NGUYEN_ANH_LEVEL - 1) * td.failXpLoss) / rate23;
  parts.craft += CH3_CRAFT_MIN * 60;
  parts.trib += tribOnce + retry * (tribOnce + lossSec + CH3_CRAFT_MIN * 60);
  total += parts.craft + parts.trib;
  return { hours: total / 3600, rows, gold, parts, rate23 };
}

{
  const out = new Map<MethodId, Ch3>(METHOD_IDS.map((m) => [m, ch3Timeline(m)] as const));
  console.log(
    '\nTam Trọng Kiếp (Nguyên Anh, cấp 23, Monte Carlo 4000 lần): tỉ lệ qua theo tay nghề; một mình = có hộ pháp (kiếp không có tia khóa mệnh nên hộ pháp không chắn được gì)',
  );
  for (const sk of TRIB_SKILL) {
    const cells = METHOD_IDS.map((m) => {
      const a = tamTrongPass(m, sk.dodge);
      if (sk.name === 'thường' && (a < 0.55 || a > 0.9)) {
        console.error(`LỖI: Tam Trọng Kiếp ${METHOD_NAME[m]} tay thường qua ${pct(a)}, ngoài 55–90%`);
        process.exitCode = 1;
      }
      if (sk.name === 'giỏi' && a < 0.9) {
        console.error(`LỖI: Tam Trọng Kiếp ${METHOD_NAME[m]} tay giỏi chỉ qua ${pct(a)} (quá khó)`);
        process.exitCode = 1;
      }
      if (sk.name === 'vụng' && a > 0.5) {
        console.error(`LỖI: Tam Trọng Kiếp ${METHOD_NAME[m]} tay vụng qua ${pct(a)} (quá dễ)`);
        process.exitCode = 1;
      }
      return `${METHOD_NAME[m]} ${pct(a)}`;
    });
    console.log(`  tay ${sk.name.padEnd(6)} (né ${pct(sk.dodge)}): ${cells.join('; ')}`);
  }

  console.log(
    '\nNhịp chương 3 (E3-G/J): Kết Đan cấp 20 → độ kiếp Nguyên Anh, một mình, đồ bậc 3 kỳ vọng ' +
      CH3_GEAR_FRAC.map(pct).join('/') +
      ` (phẩm ${CH3_GEAR_Q}); tinh anh 1 con/${CH3_ELITE_EVERY / 60} phút săn`,
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
      `  thành phần (giờ): quái ${h(p.hunt)}, tinh anh ${h(p.elite)}, đả tọa ${h(p.rest)}, nhiệm vụ ${h(p.quest)}, Kính Nguyệt Cung ${h(p.dungeon)}, Kình Vương ${h(p.boss)}, tâm ma ${h(p.trial)}, chế Đan ${h(p.craft)}, Tam Trọng Kiếp ${h(p.trib)}`,
    );
  }
  for (const id of METHOD_IDS) {
    for (const r of out.get(id)!.rows) {
      if (r.ttk < 3.8 || r.ttk > 7.3) {
        console.error(`LỖI: chương 3 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,8–7,3 s`);
        process.exitCode = 1;
      }
      if (r.eliteTtk < 18 || r.eliteTtk > 40) {
        console.error(`LỖI: chương 3 cấp ${r.level} ${METHOD_NAME[id]} TTK tinh anh ${r.eliteTtk.toFixed(0)}s ngoài 18–40 s`);
        process.exitCode = 1;
      }
      if (r.lostPct > 0.45) {
        console.error(`LỖI: chương 3 cấp ${r.level} ${METHOD_NAME[id]} mất ${pct(r.lostPct)} máu mỗi lần giết`);
        process.exitCode = 1;
      }
    }
  }
  const hs = METHOD_IDS.map((m) => out.get(m)!.hours);
  console.log(`[pace3] ${METHOD_IDS.map((m, i) => m + '=' + at(hs, i).toFixed(2)).join(' ')} target=${CH3_TARGET_H} tol=${CH3_TOL}`);
  for (const [i, m] of METHOD_IDS.entries()) {
    if (Math.abs(at(hs, i) / CH3_TARGET_H - 1) > CH3_TOL) {
      console.error(`LỖI: chương 3 ${METHOD_NAME[m]} ra ${at(hs, i).toFixed(2)} giờ, ngoài ${CH3_TARGET_H} giờ ±${CH3_TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  const keep = CH3_GEAR_FRAC;
  const sens: string[] = [];
  for (const [name, f] of [
    ['không đồ bậc 3', [0, 0, 0, 0]],
    ['đủ bộ ngay', [1, 1, 1, 1]],
  ] as const) {
    CH3_GEAR_FRAC = [...f];
    sens.push(`${name} ${ch3Timeline('lac_kiem_quyet').hours.toFixed(2)} giờ`);
  }
  CH3_GEAR_FRAC = keep;
  console.log(`Độ nhạy (Kiếm tu): ${sens.join(', ')}; kỳ vọng ${out.get('lac_kiem_quyet')!.hours.toFixed(2)} giờ.`);

  // Kinh tế chương 3 (một mình, tới độ kiếp Nguyên Anh): nguồn = vàng rơi + bán trang bị rơi + vàng nhiệm vụ/phó bản/boss.
  const sellOf = (mon: string, lv: number) => {
    const lt = lootOf(mon);
    const rng = seededRng(7 + lv);
    let g = 0;
    const N = 1500;
    for (let i = 0; i < N; i++)
      for (const d of rollEquipDrops(lt.equip, ITEM_SYS, ITEMS, lv, rng))
        g += sellPrice({ id: d.id, n: 1, inst: { q: d.q, ilvl: d.ilvl, main: {}, affixes: [], gems: [], bound: false } }, ITEM.get(d.id)!);
    return g / N;
  };
  const price = (id: string) => Math.max(ITEM.get(id)!.price, ITEM.get(id)!.sell * 3);
  const t3 = ITEMS.filter((i) => i.tier === 3 && !i.set);
  const promote = t3.length * promoteGold(3);
  const enh5 = ['itm_kinh_quang_kiem', 'itm_kinh_van_dao_bao', 'itm_luu_ly_ho_uyen', 'itm_phu_van_ngoa'].reduce(
    (n, id) => n + enhanceExpect(5, price(id), false),
    0,
  );
  const forge = FORGE.filter((f) => f.id.startsWith('frg_kq_')).reduce((n, f) => n + f.gold, 0);
  const naFail = 1 - tamTrongPass('lac_kiem_quyet', CH3_TRIB_DODGE, 2000);
  const naRetry = 1 + naFail / (1 - naFail);
  const naRecipe = FORGE.find((f) => f.id.includes('nguyen_anh')) as { gold?: number } | undefined;
  const naDan = (naRecipe?.gold ?? 5000) * naRetry;
  const phaCanh = 2 * 150 + 2 * 4 * 5;
  const consumables = 60 * 30;
  const sink = promote + enh5 + forge + naDan + phaCanh + consumables;
  console.log('\nKinh tế chương 3 (một mình, tới độ kiếp Nguyên Anh):');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    let sold = 0;
    for (const r of t.rows)
      sold += r.kills * sellOf(at(ch3Camps(r.level), 0).mon, r.level) + r.elites * sellOf('elite_van_hac_vuong', r.level);
    const src = t.gold + sold;
    console.log(
      `  ${METHOD_NAME[id].padEnd(8)} nguồn ${src.toFixed(0)} = ${t.gold.toFixed(0)} vàng rơi/nhiệm vụ/phó bản/boss + ${sold.toFixed(0)} bán đồ; ${(src / t.hours).toFixed(0)}/giờ (thiết kế ~${at(TIER_INCOME_HOUR, 3) * 1.2}/giờ)`,
    );
    const r = sink / src;
    if (id === 'lac_kiem_quyet' && (r < 0.8 || r > 2.2)) {
      console.error(`LỖI: hố tiêu chương 3 gấp ${r.toFixed(2)} lần nguồn thu của sim, ngoài 0,8–2,2`);
      process.exitCode = 1;
    }
  }
  console.log(
    `  tiêu cầu toàn ${sink.toFixed(0)} = Thăng Bậc ${t3.length} ô ${promote} + cường hóa +5 bốn ô ${enh5.toFixed(0)} + chế một bộ ${forge} + Nguyên Anh Đan ${naDan.toFixed(0)} (kể cả làm lại) + Phá Cảnh Đan ${phaCanh} + đan hồi ${consumables}.`,
  );
  // Ngưng Anh Phách: cần 3 mỗi Nguyên Anh Đan (+ làm lại).
  const k = out.get('lac_kiem_quyet')!;
  const phach = k.rows.reduce((n, r) => n + r.phach, 0);
  const needP = 3 * naRetry;
  console.log(`  Ngưng Anh Phách ≈ ${phach.toFixed(1)} (cần ${needP.toFixed(1)}, kể cả làm lại).`);
  if (phach < needP * 1.3) {
    console.error(`LỖI: Ngưng Anh Phách ≈ ${phach.toFixed(1)} không đủ dư (cần ${needP.toFixed(1)} × 1,3) cho Nguyên Anh Đan`);
    process.exitCode = 1;
  }
}

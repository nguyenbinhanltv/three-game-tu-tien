// Tách từ sim.ts (tối ưu Đợt E): ch4.
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
  KET_DAN_LEVEL,
  NGUYEN_ANH_LEVEL,
  HOA_THAN_LEVEL,
  shadowStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { FORGE, RECIPE, ITEM, ITEM_SYS, ITEMS, LEVELS, MONSTER, QUESTS } from '../index';

import { at } from '@dtl/shared';
import { MethodId, player, methodAt, selfSustain, playerDps, monsterDps, PULL_FACTOR, METHOD_IDS, METHOD_NAME, pct } from './common';
import { fullSetTier, CH3_GEAR_Q } from './ch3';
import { TRIB_SHIELD, trPHit, CH2_PARTY_SHARE, TRIB_SKILL } from './ch2';
import { HOP_SEC, PATH_FACTOR, RUN_SPEED } from './pace1';
import { dgFirstMin, enhanceExpect } from './balance';

// ---------- Nhịp chương 4 (E4-J): Nguyên Anh sơ kỳ (cấp 24) → độ kiếp Hóa Thần ----------
// Cùng cách dựng với chương 3 (E3-J), thay dữ liệu bằng Thiên Khuyết Cổ Thành: cụm quái `thien_khuyet.json` (cấp 24–27), nhiệm vụ chính `q4_*` + phụ `s4_*`
// (trừ `s4_thu_niem`, mở sau khi đã Hóa Thần), Thần Tàng Điện (cấp 26, một lượt), Thiên Khuyết Thủ Linh (nhóm 4), thử thách tâm ma ở bình cảnh 25/27, chế Hóa Thần Lộ
// và Ngũ Hành Thiên Nhân Kiếp (80 s, Monte Carlo). Mục tiêu: 8 giờ ±12% cho cả ba công pháp (`docs/EXPANSION_DESIGN.md` 2.2). Số liệu và lý do: `docs/e4j-balance.md`.
const CH4_TARGET_H = 8;
const CH4_TOL = 0.12;
const CH4_ELITE_EVERY = 900;
const CH4_QUEST_OVERHEAD = 150;
const CH4_BOSS_MIN = 8;
const CH4_CRAFT_MIN = 5;
const CH4_TRIB_PREP_SEC = 90;
/** Tỉ lệ mặc giáp bậc 4 (phẩm Linh) kỳ vọng ở từng cấp 24..27 (phần còn lại là bộ bậc 3). */
let CH4_GEAR_FRAC = [0.3, 0.5, 0.7, 0.85];
export const CH4_GEAR_Q: Quality = 1;
const CH4_TRIB_DODGE = 0.8;
const CH4_MATS = ['itm_tinh_quang_mac', 'itm_than_tang_ngoc', 'itm_co_thanh_phien', 'itm_yeu_dan', 'itm_tan_giac'] as const;

function ch4Player(level: number, id: MethodId): { atk: number; def: number; hp: number } {
  const base = player(level);
  const t3 = fullSetTier(level, CH3_GEAR_Q, KET_DAN_LEVEL);
  const prev = {
    atk: base.atk + 0.85 * (t3.atk - base.atk),
    def: base.def + 0.85 * (t3.def - base.def),
    hp: base.hp + 0.85 * (t3.hp - base.hp),
  };
  const frac = CH4_GEAR_FRAC[Math.min(CH4_GEAR_FRAC.length - 1, level - NGUYEN_ANH_LEVEL)] ?? 1;
  const t4 = fullSetTier(level, CH4_GEAR_Q, NGUYEN_ANH_LEVEL);
  const pas = methodAt(level, id)?.passive;
  return {
    atk: prev.atk + frac * (t4.atk - prev.atk),
    def: Math.round((prev.def + frac * (t4.def - prev.def)) * (1 + (pas?.defMul ?? 0))),
    hp: Math.round((prev.hp + frac * (t4.hp - prev.hp)) * (1 + (pas?.hpMul ?? 0))),
  };
}

function ch4Camps(level: number) {
  const all = (at(LEVELS, 'thien_khuyet').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite && !MONSTER.get(c.mon)?.boss);
  const hit = all.filter((c) => c.levelMax >= level - 2 && c.levelMin <= level + 1);
  if (hit.length) return hit;
  const d = (c: (typeof all)[number]) => Math.min(Math.abs(c.levelMin - level), Math.abs(c.levelMax - level));
  const best = Math.min(...all.map(d));
  return all.filter((c) => d(c) === best);
}

/** Số vật phẩm kỳ vọng mỗi lần giết quái `mon`. */
export function dropExp(mon: string, item: string): number {
  return lootOf(mon)
    .drops.filter((d) => d.item === item)
    .reduce((s, d) => s + d.chance * ((d.min + d.max) / 2), 0);
}

/**
 * Ngũ Hành Thiên Nhân Kiếp (Hóa Thần, 80 s) theo `tribulations.json` (`hoa_than`): ba pha (ngũ hành lôi, thần niệm, thiên nhân hợp nhất), tia nhắm + tia rơi quanh,
 * ấn ngũ hành (đứng sai ấn thì trúng), vạch quét/cột/liên kết của phân thân, lưới tia, tia khóa mệnh `final` (vòng r 11, 0,75 máu; hộ pháp chắn 25% mỗi người).
 * Giả định như E2-J/E3-J: người "thường" né đúng 80% mỗi sự kiện né được; sống tới 80 s là qua.
 */
const htCtxCache = new Map<string, { mhp: number; regen: number }>();
function hoaThanRun(id: MethodId, dodge: number, rng: () => number, guards = 0): boolean {
  const td = tribDef('hoa_than');
  const ph = td.phases;
  const ckey = id + ':' + CH4_GEAR_FRAC.join(',');
  let ctx = htCtxCache.get(ckey);
  if (!ctx) {
    const pl = ch4Player(td.from, id);
    ctx = { mhp: pl.hp, regen: selfSustain(td.from, id) * 0.5 };
    htCtxCache.set(ckey, ctx);
  }
  const { mhp, regen } = ctx;
  let hp = mhp;
  let pills = td.pillMax ?? TRIB_PILL_MAX;
  let pillCd = 0;
  let shield = TRIB_SHIELD * mhp;
  const take = (x: number) => {
    const s = Math.min(shield, x);
    shield -= s;
    hp -= x - s;
  };
  const avoidable = (pct: number, p = 1) => {
    if (rng() > dodge && rng() < p) take(mhp * pct);
  };
  let nextWave = td.firstDelay;
  const nh = at(ph, 0).nguHanh!;
  const pt = at(ph, 1).phanThan!;
  const net = at(ph, 1).net!;
  let nextSeal = nh.first;
  let nextNet = at(ph, 0).end + net.every;
  const sweeps = pt.sweeps!.map((s) => at(ph, 0).end + s);
  let pillarAt = at(ph, 0).end + pt.pillarAt!;
  let linkAt = at(ph, 0).end + pt.linkAt!;
  const fin = at(ph, 2).final;
  let finalAt = fin ? td.duration - fin.delay - 6 : Infinity;
  const dt = 0.1;
  for (let t = 0; t < td.duration; t += dt) {
    const pi = t < at(ph, 0).end ? 0 : t < at(ph, 1).end ? 1 : 2;
    const p = at(ph, pi);
    pillCd = Math.max(0, pillCd - dt);
    hp = Math.min(mhp, hp + regen * mhp * dt);
    if (hp <= 0) return false;
    if (hp < mhp * 0.5 && pills > 0 && pillCd <= 0) {
      pills--;
      pillCd = 12;
      hp = Math.min(mhp, hp + 0.4 * mhp);
    }
    if (t >= nextWave) {
      nextWave += tribGapAt(td, pi, t);
      if (p.aimPct && rng() > dodge) take(mhp * p.aimPct);
      for (let i = 0; i < (p.extra ?? 0); i++) if (rng() < trPHit(p.extraR ?? 3.6, td.extraDist)) take(mhp * (p.extraPct ?? 0.1));
    }
    if (pi === 0 && t >= nextSeal) {
      nextSeal += nh.every;
      // Server (`tribnhan.ts`): tia `reach` luôn trúng chủ kiếp; đứng đúng trận môn chỉ giảm `cut`.
      take(mhp * nh.pct * (rng() <= dodge ? 1 - nh.cut : 1));
    }
    if (pi === 1) {
      if (t >= nextNet) {
        nextNet += net.every;
        avoidable(net.pct, 0.5);
      }
      for (let i = 0; i < sweeps.length; i++) {
        if (t >= at(sweeps, i)) {
          sweeps[i] = Infinity;
          avoidable(pt.sweepPct!, 0.8);
        }
      }
      if (t >= pillarAt) {
        pillarAt = Infinity;
        avoidable(pt.pillarPct!, 0.6);
      }
      if (t >= linkAt) {
        linkAt = Infinity;
        // Thân chính đứng chắn vẫn ăn `linkPct × (1 − cut)`; không kịp thì ăn đủ (thế thân chắn trọn không tính, cách nghiêm hơn).
        take(mhp * pt.linkPct! * (rng() <= dodge ? 1 - nh.cut : 1));
      }
    }
    if (pi === 2 && t >= finalAt && fin) {
      finalAt = Infinity;
      // Tia khóa mệnh: vòng r 11 báo 4 s; đứng lại thì ăn `pct` máu, hộ pháp chắn `guardShare` mỗi người.
      if (rng() > dodge) take(mhp * fin.pct * (1 - Math.min(guards, fin.guardMax ?? 2) * (fin.guardShare ?? 0)));
    }
  }
  return hp > 0;
}
function hoaThanPass(id: MethodId, dodge: number, runs = 4000, guards = 0): number {
  const rng = seededRng(88410 + Math.round(dodge * 1000) + guards);
  let ok = 0;
  for (let i = 0; i < runs; i++) if (hoaThanRun(id, dodge, rng, guards)) ok++;
  return ok / runs;
}

interface Ch4Level {
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
  mats: Record<string, number>;
}
interface Ch4 {
  hours: number;
  rows: Ch4Level[];
  gold: number;
  parts: Record<'hunt' | 'elite' | 'rest' | 'quest' | 'dungeon' | 'boss' | 'trial' | 'craft' | 'trib', number>;
  rate27: number;
}

function ch4Timeline(id: MethodId): Ch4 {
  const rows: Ch4Level[] = [];
  const parts = { hunt: 0, elite: 0, rest: 0, quest: 0, dungeon: 0, boss: 0, trial: 0, craft: 0, trib: 0 };
  let gold = 0;
  let rate27 = 0;
  let total = 0;
  for (let level = NGUYEN_ANH_LEVEL; level < HOA_THAN_LEVEL; level++) {
    const pl = ch4Player(level, id);
    const camps = ch4Camps(level);
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
      for (const m of CH4_MATS) killMats[m] = (killMats[m] ?? 0) + w * dropExp(def.id, m);
      if (!mix.includes(def.id)) mix.push(def.id);
    }
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    xpKill += meditateXpPerSec(level) * rest;
    const cycle = ttk + seek + rest;
    const eSp = at(
      levelSpawns(at(LEVELS, 'thien_khuyet'))
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

    const qs = QUESTS.filter(
      (q) =>
        (q.id.startsWith('q4_') || q.id.startsWith('s4_')) &&
        (q.minLevel ?? NGUYEN_ANH_LEVEL) < HOA_THAN_LEVEL &&
        Math.max(NGUYEN_ANH_LEVEL, q.minLevel ?? NGUYEN_ANH_LEVEL) === level,
    );
    let fixedXp = qs.reduce((s, q) => s + q.rewards.xp, 0);
    let fixedSec = qs.length * CH4_QUEST_OVERHEAD;
    parts.quest += qs.length * CH4_QUEST_OVERHEAD;
    let fixedGold = qs.reduce((s, q) => s + (q.rewards.gold ?? 0), 0);
    const fixedMats: Record<string, number> = {};
    for (const q of qs) for (const it of q.rewards.items ?? []) fixedMats[it.id] = (fixedMats[it.id] ?? 0) + it.n;
    if (level === 26) {
      const dg = at(LEVELS, 'than_tang').dungeon!;
      let waveXp = 0;
      for (const w of dg.waves) for (const g of w.mons) waveXp += monsterXp(g.level, MONSTER.get(g.id)!.xpMul) * g.n;
      fixedXp += xpNeed(level) * dg.reward!.xpPct + waveXp * CH2_PARTY_SHARE;
      const dgSec = (dgFirstMin.get('than_tang') ?? 28) * 60;
      fixedSec += dgSec;
      parts.dungeon += dgSec;
      fixedGold += (at(dg.reward!.gold, 0) + at(dg.reward!.gold, 1)) / 2;
      for (const it of dg.reward!.items) fixedMats[it.item] = (fixedMats[it.item] ?? 0) + it.chance * ((it.min + it.max) / 2);
      // Quái trong phó bản (chia nhóm 4: mỗi người nhặt phần mình, tính trọn cho một người như mọi bảng khác của sim).
      for (const w of dg.waves)
        for (const g of w.mons)
          for (const m of CH4_MATS)
            fixedMats[m] =
              (fixedMats[m] ?? 0) +
              (g.n * dropExp(g.id, m)) / (MONSTER.get(g.id)!.boss || MONSTER.get(g.id)!.elite ? 1 : CH2_PARTY_SHARE * 4);
    }
    if (level === 27) {
      const bd = MONSTER.get('boss_thien_khuyet_thu_linh')!;
      fixedXp += monsterXp(27, bd.xpMul) * CH2_PARTY_SHARE;
      fixedSec += CH4_BOSS_MIN * 60;
      parts.boss += CH4_BOSS_MIN * 60;
      const bl = lootOf(bd.id);
      fixedGold += (bl.gold[0] + bl.gold[1]) / 2;
      for (const m of CH4_MATS) fixedMats[m] = (fixedMats[m] ?? 0) + dropExp(bd.id, m);
    }
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id) + 20;
      fixedSec += tt;
      parts.trial += tt;
    }
    const need = Math.max(0, xpNeed(level) - fixedXp);
    const mobsPerCycle = CH4_ELITE_EVERY / cycle;
    const cycXp = mobsPerCycle * xpKill + eXp;
    const cycSec = CH4_ELITE_EVERY + eSec;
    const cycles = need / cycXp;
    const lvSec = cycles * cycSec + fixedSec;
    parts.hunt += cycles * (CH4_ELITE_EVERY - mobsPerCycle * rest);
    parts.rest += cycles * (mobsPerCycle * rest + eRest);
    parts.elite += cycles * (eSec - eRest);
    if (level === HOA_THAN_LEVEL - 1) rate27 = cycXp / cycSec;
    const g = cycles * (mobsPerCycle * goldKill + eGold) + fixedGold;
    gold += g;
    total += lvSec;
    const mats: Record<string, number> = {};
    for (const m of CH4_MATS) mats[m] = cycles * (mobsPerCycle * (killMats[m] ?? 0) + dropExp(eDef.id, m)) + (fixedMats[m] ?? 0);
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
      mats,
    });
  }
  const td = tribDef('hoa_than');
  const tribOnce = CH4_TRIB_PREP_SEC + td.duration;
  const failP = 1 - hoaThanPass(id, CH4_TRIB_DODGE, 2000);
  const retry = failP / (1 - failP);
  const lossSec = (xpNeed(HOA_THAN_LEVEL - 1) * td.failXpLoss) / rate27;
  parts.craft += CH4_CRAFT_MIN * 60;
  parts.trib += tribOnce + retry * (tribOnce + lossSec + CH4_CRAFT_MIN * 60);
  total += parts.craft + parts.trib;
  return { hours: total / 3600, rows, gold, parts, rate27 };
}

{
  const out = new Map<MethodId, Ch4>(METHOD_IDS.map((m) => [m, ch4Timeline(m)] as const));
  console.log(
    '\nNgũ Hành Thiên Nhân Kiếp (Hóa Thần, cấp 27, Monte Carlo 4000 lần): tỉ lệ qua theo tay nghề; cột cuối: Kiếm tu có 2 hộ pháp chắn tia khóa mệnh',
  );
  for (const sk of TRIB_SKILL) {
    const cells = METHOD_IDS.map((m) => {
      const a = hoaThanPass(m, sk.dodge);
      if (sk.name === 'thường' && (a < 0.55 || a > 0.9)) {
        console.error(`LỖI: Hóa Thần Kiếp ${METHOD_NAME[m]} tay thường qua ${pct(a)}, ngoài 55–90%`);
        process.exitCode = 1;
      }
      if (sk.name === 'giỏi' && a < 0.9) {
        console.error(`LỖI: Hóa Thần Kiếp ${METHOD_NAME[m]} tay giỏi chỉ qua ${pct(a)} (quá khó)`);
        process.exitCode = 1;
      }
      if (sk.name === 'vụng' && a > 0.5) {
        console.error(`LỖI: Hóa Thần Kiếp ${METHOD_NAME[m]} tay vụng qua ${pct(a)} (quá dễ)`);
        process.exitCode = 1;
      }
      return `${METHOD_NAME[m]} ${pct(a)}`;
    });
    console.log(
      `  tay ${sk.name.padEnd(6)} (né ${pct(sk.dodge)}): ${cells.join('; ')}; có 2 hộ pháp (Kiếm tu): ${pct(hoaThanPass('lac_kiem_quyet', sk.dodge, 4000, 2))}`,
    );
  }

  console.log(
    '\nNhịp chương 4 (E4-J): Nguyên Anh cấp 24 → độ kiếp Hóa Thần, một mình, đồ bậc 4 kỳ vọng ' +
      CH4_GEAR_FRAC.map(pct).join('/') +
      ` (phẩm ${CH4_GEAR_Q}); tinh anh 1 con/${CH4_ELITE_EVERY / 60} phút săn`,
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
      `  thành phần (giờ): quái ${h(p.hunt)}, tinh anh ${h(p.elite)}, đả tọa ${h(p.rest)}, nhiệm vụ ${h(p.quest)}, Thần Tàng Điện ${h(p.dungeon)}, Thủ Linh ${h(p.boss)}, tâm ma ${h(p.trial)}, chế Hóa Thần Lộ ${h(p.craft)}, Thiên Nhân Kiếp ${h(p.trib)}`,
    );
  }
  for (const id of METHOD_IDS) {
    for (const r of out.get(id)!.rows) {
      if (r.ttk < 3.8 || r.ttk > 7.3) {
        console.error(`LỖI: chương 4 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,8–7,3 s`);
        process.exitCode = 1;
      }
      if (r.eliteTtk < 18 || r.eliteTtk > 40) {
        console.error(`LỖI: chương 4 cấp ${r.level} ${METHOD_NAME[id]} TTK tinh anh ${r.eliteTtk.toFixed(0)}s ngoài 18–40 s`);
        process.exitCode = 1;
      }
      if (r.eliteLostPct > 0.6) {
        console.error(`LỖI: chương 4 cấp ${r.level} ${METHOD_NAME[id]} đánh tinh anh mất ${pct(r.eliteLostPct)} máu (đứng yên), quá nặng`);
        process.exitCode = 1;
      }
      if (r.lostPct > 0.45) {
        console.error(`LỖI: chương 4 cấp ${r.level} ${METHOD_NAME[id]} mất ${pct(r.lostPct)} máu mỗi lần giết`);
        process.exitCode = 1;
      }
    }
  }
  const hs = METHOD_IDS.map((m) => out.get(m)!.hours);
  console.log(`[pace4] ${METHOD_IDS.map((m, i) => m + '=' + at(hs, i).toFixed(2)).join(' ')} target=${CH4_TARGET_H} tol=${CH4_TOL}`);
  for (const [i, m] of METHOD_IDS.entries()) {
    if (Math.abs(at(hs, i) / CH4_TARGET_H - 1) > CH4_TOL) {
      console.error(`LỖI: chương 4 ${METHOD_NAME[m]} ra ${at(hs, i).toFixed(2)} giờ, ngoài ${CH4_TARGET_H} giờ ±${CH4_TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  const keep = CH4_GEAR_FRAC;
  const sens: string[] = [];
  for (const [name, f] of [
    ['không đồ bậc 4', [0, 0, 0, 0]],
    ['đủ bộ ngay', [1, 1, 1, 1]],
  ] as const) {
    CH4_GEAR_FRAC = [...f];
    sens.push(`${name} ${ch4Timeline('lac_kiem_quyet').hours.toFixed(2)} giờ`);
  }
  CH4_GEAR_FRAC = keep;
  console.log(`Độ nhạy (Kiếm tu): ${sens.join(', ')}; kỳ vọng ${out.get('lac_kiem_quyet')!.hours.toFixed(2)} giờ.`);

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
  const t4 = ITEMS.filter((i) => i.tier === 4 && !i.set);
  const promote = t4.length * promoteGold(4);
  const enh5 = ['itm_tinh_khuyet_kiem', 'itm_tinh_khuyet_dao_bao', 'itm_co_thanh_ho_uyen', 'itm_da_hanh_van_ngoa'].reduce(
    (n, id) => n + enhanceExpect(5, price(id), false),
    0,
  );
  const forge = FORGE.filter((f) => f.id.startsWith('frg_tk_')).reduce((n, f) => n + f.gold, 0);
  const htFail = 1 - hoaThanPass('lac_kiem_quyet', CH4_TRIB_DODGE, 2000);
  const htRetry = 1 + htFail / (1 - htFail);
  const htGold = (RECIPE.get('rcp_hoa_than_lo')?.gold ?? 8000) * htRetry;
  const phaCanh = 2 * 150 + 2 * 4 * 5;
  const consumables = 60 * 35;
  const sink = promote + enh5 + forge + htGold + phaCanh + consumables;
  console.log('\nKinh tế chương 4 (một mình, tới độ kiếp Hóa Thần):');
  for (const id of METHOD_IDS) {
    const t = out.get(id)!;
    let sold = 0;
    for (const r of t.rows)
      sold += r.kills * sellOf(at(ch4Camps(r.level), 0).mon, r.level) + r.elites * sellOf('elite_cot_kiem_thong_linh', r.level);
    const src = t.gold + sold;
    console.log(
      `  ${METHOD_NAME[id].padEnd(8)} nguồn ${src.toFixed(0)} = ${t.gold.toFixed(0)} vàng rơi/nhiệm vụ/phó bản/boss + ${sold.toFixed(0)} bán đồ; ${(src / t.hours).toFixed(0)}/giờ (thiết kế ~${at(TIER_INCOME_HOUR, 4) * 1.2}/giờ)`,
    );
    const r = sink / src;
    if (id === 'lac_kiem_quyet' && (r < 0.8 || r > 2.2)) {
      console.error(`LỖI: hố tiêu chương 4 gấp ${r.toFixed(2)} lần nguồn thu của sim, ngoài 0,8–2,2`);
      process.exitCode = 1;
    }
  }
  console.log(
    `  tiêu cầu toàn ${sink.toFixed(0)} = Thăng Bậc ${t4.length} ô ${promote} + cường hóa +5 bốn ô ${enh5.toFixed(0)} + chế một bộ ${forge} + Hóa Thần Lộ ${htGold.toFixed(0)} (kể cả làm lại) + Phá Cảnh Đan ${phaCanh} + đan hồi ${consumables}.`,
  );
  const k = out.get('lac_kiem_quyet')!;
  const have = (m: string) => k.rows.reduce((n, r) => n + (r.mats[m] ?? 0), 0);
  const need: [string, number][] = [
    ['itm_than_tang_ngoc', 3],
    ['itm_tinh_quang_mac', 5],
    ['itm_co_thanh_phien', 2],
    ['itm_yeu_dan', 16],
  ];
  for (const [m, c] of need) {
    const nd = c * htRetry;
    console.log(
      `  ${m} ≈ ${have(m).toFixed(1)} (cần ${nd.toFixed(1)} cho Hóa Thần Lộ, kể cả làm lại${m === 'itm_tinh_quang_mac' ? `; Thăng Bậc bậc 4 cần thêm ${t4.length * PROMOTE_MAT_COUNT}` : ''})`,
    );
    if (have(m) < nd * 1.3) {
      console.error(`LỖI: ${m} ≈ ${have(m).toFixed(1)} không đủ dư (cần ${nd.toFixed(1)} × 1,3) cho Hóa Thần Lộ`);
      process.exitCode = 1;
    }
  }
  const t5 = ITEMS.filter((i) => i.tier === 5 && !i.set);
  console.log(
    `  Tẫn Giác ≈ ${have('itm_tan_giac').toFixed(0)} trong chặng (Thăng Bậc 4 → 5 cần ${PROMOTE_MAT_COUNT} mỗi ô × ${t5.length} ô = ${PROMOTE_MAT_COUNT * t5.length}, ${promoteGold(5)} linh thạch mỗi ô; làm sau khi đã Hóa Thần).`,
  );
}

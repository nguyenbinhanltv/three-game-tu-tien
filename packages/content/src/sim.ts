// Ước tính nhịp lên cảnh giới: một người chơi một mình, đánh quái hợp cấp, làm đủ chuỗi nhiệm vụ.
// Tính cả máu mất mỗi lần giết (đứng yên, không né vùng) và thời gian đả tọa hồi lại.
// Chạy: pnpm sim:progress

import { combatPower, formationHurts, levelSpawns, TIER_MIN_ILVL, type MonsterDef, type Quality, type SkillDef } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
  promoteGold,
  PROMOTE_MAT_COUNT,
  TIER_INCOME_HOUR,
  counterMul,
  CRIT_CHANCE,
  enhanceChance,
  enhanceCost,
  ENHANCE_RISK_FROM,
  CRIT_MULT,
  elemCounter,
  METHOD_UNLOCK_LEVEL,
  STAT_CAPS,
  TRIB_AIM,
  TRIB_EXTRA,
  TRIB_FIRST_DELAY,
  TRIB_FINAL,
  TRIB_NET,
  TRIB_PHASE_END,
  TRIB_PHASE_EXTRA,
  TRIB_PHASE_GAP,
  TRIB_PILL_MAX,
  tribDef,
  tribGapAt,
  TRIB_RAIN,
  tribPhaseAt,
  TRIBULATION_DURATION,
  TRIBULATION_REFUND_AFTER,
  computeDamage,
  computePlayerStats,
  rollItemInstance,
  seededRng,
  droppableSlots,
  rollEquipDrops,
  sellPrice,
  templatesFor,
  GCD,
  HP_REGEN_MEDITATE,
  INTERRUPT_VULN_MUL,
  meditateXpPerSec,
  monsterStats,
  monsterXp,
  phaseRules,
  NGUNG_KHI_MAX,
  TRUC_CO_LEVEL,
  KET_DAN_LEVEL,
  NGUYEN_ANH_LEVEL,
  HOA_THAN_LEVEL,
  AM_HU_LEVEL,
  ANH_BIEN_LEVEL,
  DUONG_THUC_LEVEL,
  VAN_DINH_LEVEL,
  MAX_SKILL_LEVEL,
  skillUpgradeCost,
  shadowStats,
  TRIAL_DURATION,
  playerBaseStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from './loot';
import {
  ENHANCE_ORE,
  FORGE,
  RECIPE,
  ITEM,
  ITEM_SYS,
  ITEMS,
  LEVELS,
  METHODS,
  MARK,
  METHOD_SKILLS,
  MONSTER,
  PATHS,
  SKILL,
  QUESTS,
  realmName,
  SKILLS,
  t,
} from './index';

import { at } from '@dtl/shared';
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

// ---------- công pháp (3-10) ----------

type MethodId = 'lac_kiem_quyet' | 'bat_dong_kim_than' | 'thanh_moc_dan_kinh';
// VS-3: danh sách và tên lấy từ hướng tu (thứ tự paths.json), không viết cứng.
const METHOD_IDS = PATHS.flatMap((p) => p.methods) as MethodId[];
const METHOD_NAME = Object.fromEntries(PATHS.flatMap((p) => p.methods.map((m) => [m, t(`path.${p.id}.name`)] as const))) as Record<
  MethodId,
  string
>;
const methodDef = (id?: MethodId) => (id ? METHODS.find((m) => m.id === id) : undefined);
/** Từ Ngưng Khí 5 mới chọn công pháp. */
const methodAt = (level: number, id?: MethodId) => (level >= METHOD_UNLOCK_LEVEL ? methodDef(id) : undefined);

/** Số quái bị kéo cùng lúc khi vào cụm (M-2: cụm 3–4 con, mỗi con thức giấc theo tầm `aggro`): bình quân hai con. */
const PULL = 2;
/** Một người đánh kéo `PULL` quái, hạ lần lượt: mỗi lần hạ chịu trung bình (PULL+1)/2 con đánh cùng lúc. */
const PULL_FACTOR = (PULL + 1) / 2;
/** Người chơi thật dùng khiên/hồi đúng lúc khoảng 60% so với "dùng đều tay". */
const SUSTAIN_EFF = 0.6;
/** Mộc độc phủ trung bình bấy nhiêu quái trong cụm. */
const POISON_MOBS = 2;

/** Chiêu công pháp dùng được ở cấp `level` và mô hình hóa: chiêu đặc trưng + lướt có sát thương (chiêu tối thượng không tính). */
function methodSkills(level: number, id?: MethodId): SkillDef[] {
  const m = methodAt(level, id);
  if (!m) return [];
  return [m.sig, m.dash].map((sid) => METHOD_SKILLS.find((s) => s.id === sid)!).filter((s) => s && s.unlock <= level);
}

/**
 * VS-2: người chơi thật làm đúng cơ chế mới (ấn, tư thế, xả tài nguyên) khoảng chừng này so với "làm đều tay".
 * Cùng ý với `SUSTAIN_EFF`; nhịp lên cấp tính theo mức này, bảng "VS-2" bên dưới in cả hai đầu mút.
 */
const SKILL_EFF = 0.6;
/** Hộ pháp có đủ 40 Huyết khí lúc tiêu Trấn ấn khoảng chừng này số lần (đánh một mình, kéo `PULL` quái). */
/** TN-8: tỉ lệ nhịp trận trúng quái khi đánh một mình (không phải quái nào cũng đứng trong trận suốt thời gian trận). */
const FORMATION_COVER = 0.7;
const TANK_RES_READY = 0.7;
/** `base`: bấm theo hồi chiêu, không dùng cơ chế VS-2 (mô hình trước VS-2); `skilled`: dùng đủ; `avg`: người chơi thật (`SKILL_EFF`). */
type PlayMode = 'base' | 'avg' | 'skilled';

/**
 * Sát thương trung bình mỗi giây của người chơi lên một quái (xoay vòng các chiêu đã mở). `monElem`: hệ quái, tính khắc chế.
 * Lớp VS-2 chỉ cộng phần cơ chế MỚI (nhát bắn thêm của Kiếm ấn, Mất thế, tư thế). Thưởng đã có từ trước VS-2 mà mô hình
 * vốn không tính (dấu Truy hồn +20%, Lôi Đình xả Kiếm ý, chuỗi cũ) vẫn để ngoài: nhịp 3–4 giờ đã được hiệu chỉnh như thế.
 */
function playerDps(level: number, atk: number, monDef: number, id?: MethodId, monElem?: string, mode: PlayMode = 'avg'): number {
  const m = methodAt(level, id);
  const pas = m?.passive;
  // Nhịp đánh: mọi đòn thường 1 GCD; kiếm tu hoàn 0,2 s mỗi chuỗi 3 đòn.
  const gcd = GCD - (pas?.gcdRefund ? pas.gcdRefund / 3 : 0);
  // Bạo kích: nền 10% + nội tại; đủ kiếm ý (đánh liên tục) thì thêm `critAtMax`.
  const crit = Math.min(STAT_CAPS.critRate, CRIT_CHANCE + (pas?.critBase ?? 0) + (pas?.critAtMax ?? 0));
  const critMul = 1 + crit * (CRIT_MULT - 1);
  const melee = 1 + (pas?.melee?.mul ?? 0);
  const one = (s: SkillDef) => hit(atk, s.power, monDef) * critMul * melee * counterMul(elemCounter(s.elem, monElem));
  // TN-8: trận đánh theo nhịp: số nhịp có hiệu lực của một lần đặt × tỉ lệ quái đứng trong trận (đánh một mình, kéo cụm nhỏ).
  const formHits = (s: SkillDef): number =>
    s.kind === 'formation' && s.formation && formationHurts(s.formation.mode)
      ? Math.floor((s.formation.dur - s.formation.arm) / s.formation.every) * FORMATION_COVER
      : 1;
  const deals = (s: SkillDef) =>
    s.kind === 'damage' ||
    s.kind === 'aoe' ||
    (s.kind === 'dash' && s.power > 0) ||
    (s.kind === 'formation' && !!s.formation && formationHurts(s.formation.mode));
  /** Xoay vòng: chiêu có hồi chiêu dùng ngay khi hồi xong, thời gian còn lại đánh đòn `basic`. */
  const rot = (skills: SkillDef[], basic: SkillDef): number => {
    let perSec = 0;
    let gcdUsed = 0;
    for (const s of skills) {
      if (s === basic || s.unlock > level || !deals(s) || s.cd <= 0) continue;
      perSec += (one(s) * formHits(s)) / s.cd;
      // Thiêu đốt của chiêu vùng (Đan Hỏa Vũ): sát thương theo thời gian, không giảm theo phòng ngự.
      if (s.burn) perSec += (atk * s.burn.mul * s.burn.dur) / s.cd;
      // Lướt không ăn GCD.
      if (s.kind !== 'dash') gcdUsed += (gcd + s.cast) / s.cd;
    }
    return perSec + (one(basic) / gcd) * Math.max(0, 1 - gcdUsed);
  };
  const bar = [...SKILLS, ...methodSkills(level, id)];
  const basic = at(SKILLS, 0);
  let perSec = rot(bar, basic);
  // Mộc độc đan sư: sát thương theo thời gian mỗi mục tiêu, không giảm theo phòng ngự, phủ `POISON_MOBS` quái trong cụm.
  const hx = m ? METHOD_SKILLS.find((s) => s.id === m.sig && s.poison) : undefined;
  if (hx?.poison && hx.unlock <= level) perSec += ((atk * hx.poison.mul * hx.poison.dur) / hx.cd) * POISON_MOBS;
  // TN-2: ấn bào mòn (Hồn ấn) là lõi của Hồn tu, đi kèm chiêu đặc trưng nên tính ở lớp nền như mộc độc: mỗi giây mỗi tầng
  // `dot.per` × công kích, không giảm theo phòng ngự. Số tầng giữ được = tổng (thời gian ấn / hồi chiêu) của các chiêu đặt ấn.
  // Phần rút máu và hồi khi thu hồn KHÔNG tính vào độ trụ (ước lượng dè dặt).
  if (m) {
    for (const md of MARK.values()) {
      if (!md.dot || md.method !== m.id) continue;
      const stacks = Math.min(
        md.max,
        bar.filter((a) => a.unlock <= level && a.cd > 0 && a.applyMark?.id === md.id).reduce((n, a) => n + md.dur / a.cd, 0),
      );
      perSec += atk * md.dot.per * stacks;
    }
  }
  if (mode === 'base' || !m) return perSec;

  // ---------- lớp VS-2 ----------
  const avail = bar.filter((s) => s.unlock <= level);
  const mine = (markId: string) => {
    const md = MARK.get(markId);
    return md && (!md.method || md.method === m.id) ? md : undefined;
  };
  let bonus = 0;
  // (1) Kiếm ấn: chiêu tiêu ấn bắn thêm một nhát mỗi tầng. Số tầng lúc tiêu = số lần chiêu đặt ấn kịp ra giữa hai lần tiêu.
  for (const s of avail) {
    const cm = s.consumeMark;
    const md = cm?.extraHit ? mine(cm.id) : undefined;
    if (!cm?.extraHit || !md || s.cd <= 0) continue;
    const stacks = Math.min(
      md.max,
      avail.filter((a) => a.applyMark?.id === cm.id && a.cd > 0).reduce((n, a) => n + s.cd / a.cd, 0),
    );
    bonus += (one(s) * cm.extraHit * stacks) / s.cd;
  }
  // (2) Mất thế: tiêu Trấn ấn + xả đủ Huyết khí → mọi sát thương lên quái +`ampAll` trong thời gian ấn.
  for (const s of avail) {
    const th = s.consumeMark?.then;
    const opener = th ? avail.find((a) => a.applyMark?.id === s.consumeMark!.id && a.cd > 0) : undefined;
    const md = th ? mine(th.mark) : undefined;
    if (!th || !opener || !md?.ampAll) continue;
    bonus += perSec * md.ampAll * Math.min(1, md.dur / opener.cd) * TANK_RES_READY;
    break;
  }
  // (3) Tư thế: trong `dur` giây mỗi `cd` giây, vài ô đổi sang chiêu tư thế.
  const st = METHOD_SKILLS.find((s) => s.method === m.id && s.kind === 'stance' && s.unlock <= level);
  if (st?.stance) {
    const swap = st.stance.swap;
    const inStance = bar.map((s) => (swap[s.id] ? (SKILL.get(swap[s.id]!) ?? s) : s));
    const basicIn = swap[basic.id] ? (SKILL.get(swap[basic.id]!) ?? basic) : basic;
    bonus += (st.stance.dur / st.cd) * (rot(inStance, basicIn) - rot(bar, basic));
  }
  return perSec + bonus * (mode === 'skilled' ? 1 : SKILL_EFF);
}

/** Máu tự hồi bằng chiêu (khiên, hồi nguyên, hồi xuân) theo tỉ lệ máu tối đa mỗi giây, nhân hiệu suất dùng thật. */
function selfSustain(level: number, id?: MethodId, mode: PlayMode = 'avg'): number {
  const m = methodAt(level, id);
  const healMul = 1 + (m?.passive.healMul ?? 0);
  const eff = mode === 'base' || !m ? 0 : mode === 'skilled' ? 1 : SKILL_EFF;
  // TN-8: trận hồi (Hộ Trận, Sinh Tử Cấm) hồi `heal` × số nhịp có hiệu lực mỗi lần đặt.
  const formHeal = (s: SkillDef): number =>
    s.kind === 'formation' && s.formation?.heal
      ? s.formation.heal * Math.floor((s.formation.dur - s.formation.arm) / s.formation.every)
      : 0;
  const sus = (s: SkillDef) => (s.kind === 'heal' || s.kind === 'hot' ? s.power * healMul : s.kind === 'shield' ? s.power : formHeal(s));
  let r = 0;
  for (const s of [...SKILLS, ...methodSkills(level, id)]) {
    if (s.unlock > level || s.cd <= 0) continue;
    r += sus(s) / s.cd;
    // VS-2: Đan sư xả Đan hỏa (`res.cost`) thì chiêu hồi mạnh thêm `bonusMul`.
    if (m && s.res?.cost && s.res.id === m.resource.id && s.res.bonusMul) r += ((sus(s) * (s.res.bonusMul - 1)) / s.cd) * eff;
  }
  // VS-2: tư thế đổi ô hồi/khiên (Lô Hỏa Hồi Nguyên, Kim Thân Hộ Thế) trong `dur` giây mỗi `cd` giây.
  const st = m ? METHOD_SKILLS.find((s) => s.method === m.id && s.kind === 'stance' && s.unlock <= level) : undefined;
  if (st?.stance) {
    for (const [from, to] of Object.entries(st.stance.swap)) {
      const a = SKILL.get(from);
      const b = SKILL.get(to);
      if (!a || !b || !(b.cd > 0) || !(sus(b) > 0)) continue;
      r += (st.stance.dur / st.cd) * (sus(b) / b.cd - (a.cd > 0 && a.unlock <= level ? sus(a) / a.cd : 0)) * eff;
    }
  }
  return r * SUSTAIN_EFF;
}

/** Trang bị và nội tại công pháp ở cảnh giới `level` (hộ pháp: khí huyết +12%, phòng ngự +15%). */
function playerM(level: number, id?: MethodId): { atk: number; def: number; hp: number } {
  const p = player(level);
  const pas = methodAt(level, id)?.passive;
  return { atk: p.atk, def: Math.round(p.def * (1 + (pas?.defMul ?? 0))), hp: Math.round(p.hp * (1 + (pas?.hpMul ?? 0))) };
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

// Nhịp lên cấp tính trên quái thường: tinh anh (cờ elite) ít gặp, tính riêng ở bảng tinh anh bên dưới.
const spawns = levelSpawns(at(LEVELS, 'van_lam')).filter((s) => !MONSTER.get(s.mon)?.boss && !MONSTER.get(s.mon)?.elite);
const CAMPS = (at(LEVELS, 'van_lam').camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite);
/** Tốc độ chạy bộ (m/s) và hệ số đường vòng khi đi từ cụm này sang cụm khác. */
const RUN_SPEED = 7;
const PATH_FACTOR = 1.3;
/** Giây đi từ con này sang con kế trong cùng cụm (tới gần + kéo quái). */
const HOP_SEC = 3.5;

/** Giây tìm quái mỗi lần giết: đi sang cụm gần nhất cùng loại, chia cho số con một cụm, cộng bước chuyển giữa các con. */
function seekModel(mon: string): { perCamp: number; seek: number } {
  const cs = CAMPS.filter((c) => c.mon === mon);
  if (!cs.length) return { perCamp: 1, seek: 6 };
  const perCamp = cs.reduce((n, c) => n + c.count, 0) / cs.length;
  const nn = cs.map((a) => Math.min(...cs.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.z - b.z)), 120));
  const dist = nn.reduce((n, d) => n + d, 0) / nn.length;
  return { perCamp, seek: HOP_SEC + (PATH_FACTOR * dist) / RUN_SPEED / perCamp };
}

interface Timeline {
  hours: number;
  fightHours: number;
  restHours: number;
  trialMin: number;
  rows: string[];
  trialRows: string[];
  questXp: number;
  scrollAt: number[];
  goldAt: number[];
  killsByLevel: number[];
  secByLevel: number[];
  goldTotal: number;
}
const SCROLL_ID = 'itm_bi_tich_tan_quyen';
const questByLevel = new Map<number, number>();
const questScrollByLevel = new Map<number, number>();
for (const q of QUESTS) {
  // Nhiệm vụ làm xong quanh cấp của quái mục tiêu.
  let lv = q.minLevel ?? 1;
  for (const o of q.objectives) {
    const sp = spawns.find((s) => s.mon === o.target);
    if (sp) lv = Math.max(lv, sp.levelMin);
  }
  questByLevel.set(lv, (questByLevel.get(lv) ?? 0) + q.rewards.xp);
  questScrollByLevel.set(
    lv,
    (questScrollByLevel.get(lv) ?? 0) + (q.rewards.items ?? []).filter((i) => i.id === SCROLL_ID).reduce((n, i) => n + i.n, 0),
  );
}

/** Bãi quái người chơi chọn ở cảnh giới `level`: cấp quái gần cấp mình nhất. */
function pickSpawn(level: number) {
  return at(
    [...spawns].sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level)),
    0,
    'spawns',
  );
}

function timeline(id?: MethodId): Timeline {
  let totalSec = 0;
  let fightSec = 0;
  let trialSec = 0;
  let questXp = 0;
  let scrollTotal = 0;
  let goldTotal = 0;
  const t: Timeline = {
    hours: 0,
    fightHours: 0,
    restHours: 0,
    trialMin: 0,
    rows: [],
    trialRows: [],
    questXp: 0,
    scrollAt: [],
    goldAt: [],
    killsByLevel: [],
    secByLevel: [],
    goldTotal: 0,
  };
  for (let level = 1; level <= NGUNG_KHI_MAX; level++) {
    const pl = playerM(level, id);
    const sp = pickSpawn(level);
    const def = MONSTER.get(sp.mon)!;
    const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
    const ms = monsterStats(mlv, def.hpMul, def.atkMul);
    const ttk = ms.hp / playerDps(level, pl.atk, ms.def, id, def.elem);
    const inc = monsterDps(def, ms.atk, pl.def);
    // Máu mất mỗi lần giết: quái đánh cả lúc kéo thêm (PULL_FACTOR), trừ phần khiên/hồi nguyên kịp bù trong lúc đánh và đi tìm quái.
    const sk = seekModel(def.id);
    const lost = Math.max(0, inc * ttk * PULL_FACTOR - selfSustain(level, id) * pl.hp * (ttk + sk.seek));
    const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
    const xpPerKill = monsterXp(mlv, def.xpMul) * xpLevelFactor(level, mlv) + meditateXpPerSec(level) * rest;
    let need = xpNeed(level);
    const qx = questByLevel.get(level) ?? 0;
    questXp += qx;
    need = Math.max(0, need - qx);
    const kills = Math.ceil(need / xpPerKill);
    const lt = lootOf(def.id);
    const d = lt.drops.find((x) => x.item === SCROLL_ID);
    scrollTotal += kills * (d ? d.chance * ((d.min + d.max) / 2) : 0) + (questScrollByLevel.get(level) ?? 0);
    goldTotal += kills * ((lt.gold[0] + lt.gold[1]) / 2);
    t.scrollAt[level] = scrollTotal;
    t.goldAt[level] = goldTotal;
    t.killsByLevel[level] = kills;
    // Mỗi lần giết: thời gian đánh + tìm quái (theo mật độ cụm) + đả tọa hồi máu.
    const sec = kills * (ttk + sk.seek + rest);
    t.secByLevel[level] = sec;
    totalSec += sec;
    fightSec += kills * (ttk + sk.seek);
    // Bình cảnh tầng 5/10/15: thêm một thử thách tâm ma (đánh bóng của mình, mỗi lần ~ TTK + 20 giây chuẩn bị/đi lại).
    if (BOTTLENECK_LEVELS.includes(level)) {
      const sh = shadowStats(level, pl.atk, pl.def);
      const tt = sh.hp / playerDps(level, pl.atk, sh.def, id);
      // Bóng đánh mỗi 1,8 giây (xem monsters.json), người chơi dùng khiên/hồi nguyên như thường.
      const raw = (hit(sh.atk, 1, pl.def) / 1.8) * tt;
      const taken = Math.max(0, raw - selfSustain(level, id) * pl.hp * tt);
      trialSec += tt + 20;
      totalSec += tt + 20;
      t.trialRows.push(
        `${realmName(level).padEnd(20)} bóng hp ${String(sh.hp).padStart(5)}  TTK ${tt.toFixed(0).padStart(3)}s / ${TRIAL_DURATION}s  mất máu ${pct(raw / pl.hp).padStart(4)} nếu đứng yên, ${pct(taken / pl.hp).padStart(4)} sau khiên + hồi nguyên`,
      );
    }
    t.rows.push(
      `${realmName(level).padEnd(20)} ${(def.id + ' (' + mlv + ')').padEnd(23)} ${ttk.toFixed(1).padStart(4)}s ${pct(inc / pl.hp).padStart(5)} ${pct(lost / pl.hp).padStart(7)} ${rest.toFixed(0).padStart(4)}s ${sk.seek.toFixed(1).padStart(5)}s ${String(kills).padStart(5)} ${(sec / 60).toFixed(0).padStart(6)} ${(totalSec / 3600).toFixed(1).padStart(8)} giờ`,
    );
  }
  t.hours = totalSec / 3600;
  t.fightHours = fightSec / 3600;
  t.trialMin = trialSec / 60;
  t.restHours = (totalSec - fightSec - trialSec) / 3600;
  t.questXp = questXp;
  t.goldTotal = goldTotal;
  return t;
}

const TL = new Map<MethodId, Timeline>(METHOD_IDS.map((m) => [m, timeline(m)] as const));
const main = TL.get('lac_kiem_quyet')!;
const scrollAt = main.scrollAt;
const goldTotal = main.goldTotal;
console.log(
  'Nhịp lên cấp (Kiếm tu; từ tầng 5 dùng công pháp; tìm quái = đi giữa các cụm của M-2, kéo ' +
    PULL +
    ' con mỗi cụm, hiệu suất khiên/hồi ' +
    pct(SUSTAIN_EFF) +
    ')',
);
console.log('Cảnh giới            quái (cấp)              TTK  máu/s  mất/lần  tọa   tìm   giết   phút   cộng dồn');
for (const r of main.rows) console.log(r);
console.log(
  `\nTổng tu vi từ nhiệm vụ: ${main.questXp}. Ước tính từ tầng 1 đến viên mãn tầng 15 (một mình, chưa tính boss, bí cảnh, tinh anh): ` +
    METHOD_IDS.map((m) => `${METHOD_NAME[m]} ${TL.get(m)!.hours.toFixed(2)} giờ`).join(', ') +
    ` (Kiếm tu: ${main.fightHours.toFixed(1)} giờ đánh và tìm quái + ${main.restHours.toFixed(1)} giờ đả tọa hồi máu; đã gồm ${main.trialMin.toFixed(0)} phút thử thách tâm ma ở bình cảnh).`,
);
{
  const hs = METHOD_IDS.map((m) => TL.get(m)!.hours);
  if (Math.min(...hs) < 3 || Math.max(...hs) > 4) {
    console.error('LỖI: nhịp tới viên mãn tầng 15 phải 3–4 giờ cho cả ba công pháp');
    process.exitCode = 1;
  }
}
{
  // VS-2: phần thưởng của cơ chế mới so với "bấm theo hồi chiêu" (mô hình trước VS-2), trên quái thường cùng cấp.
  //  - `đúng cơ chế`: làm đủ (ấn, tư thế, xả tài nguyên); `thực tế`: người chơi thật (`SKILL_EFF`), là số nhịp lên cấp dùng.
  //  - Ràng buộc: chơi đúng không được lợi quá +20% (cơ chế lấn át chỉ số), không bị thiệt; mức thực tế lệch mô hình cũ không quá +5%.
  console.log(
    `
VS-2: sát thương mỗi giây so với bấm theo hồi chiêu (đúng cơ chế / thực tế ${pct(SKILL_EFF)}), và máu tự hồi mỗi giây (thực tế so với cũ)`,
  );
  console.log('Cảnh giới            ' + METHOD_IDS.map((m) => METHOD_NAME[m].padEnd(22)).join(''));
  for (const level of [5, 8, 12, 15]) {
    const sp = pickSpawn(level);
    const def = MONSTER.get(sp.mon)!;
    const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
    const ms = monsterStats(mlv, def.hpMul, def.atkMul);
    const cells: string[] = [];
    for (const id of METHOD_IDS) {
      const pl = playerM(level, id);
      const dps = (mode: PlayMode) => playerDps(level, pl.atk, ms.def, id, def.elem, mode);
      const skilled = dps('skilled') / dps('base') - 1;
      const avg = dps('avg') / dps('base') - 1;
      const sus = selfSustain(level, id, 'avg') / Math.max(1e-9, selfSustain(level, id, 'base')) - 1;
      cells.push(`+${pct(skilled)} / +${pct(avg)}, hồi +${pct(sus)}`.padEnd(22));
      const who = `VS-2 tầng ${level} ${METHOD_NAME[id]}`;
      if (skilled < -1e-9 || skilled > 0.2) {
        console.error(`LỖI: ${who}: chơi đúng cơ chế đổi sát thương ${pct(skilled)}, ngoài 0–20%`);
        process.exitCode = 1;
      }
      if (avg > 0.05) {
        console.error(`LỖI: ${who}: sát thương thực tế lệch mô hình trước VS-2 ${pct(avg)}, quá +5%`);
        process.exitCode = 1;
      }
    }
    console.log(`${realmName(level).padEnd(20)} ${cells.join('')}`);
  }
}

// ---------- thang 28 cấp: Trúc Cơ → Nguyên Anh (E1-C, `docs/EXPANSION_DESIGN.md` 2.2) ----------
{
  const STAGES = [
    { name: 'Trúc Cơ', from: TRUC_CO_LEVEL, to: KET_DAN_LEVEL - 1, hours: 4 },
    { name: 'Kết Đan', from: KET_DAN_LEVEL, to: NGUYEN_ANH_LEVEL - 1, hours: 6 },
    { name: 'Nguyên Anh', from: NGUYEN_ANH_LEVEL, to: HOA_THAN_LEVEL - 1, hours: 8 },
  ] as const;
  /** Dung sai nhịp chặng mới so với 4/6/8 giờ (thiết kế: ±12%). */
  const TOL = 0.12;
  const INCOME_TARGETS_PER_HOUR = 400;
  /** Thu nhập tu vi/giờ theo thiết kế tại cấp L: 400 mục tiêu × (12+7L) × xpMul 1,25 × hệ số chênh cấp 0,9. */
  const designIncome = (level: number) => INCOME_TARGETS_PER_HOUR * (12 + 7 * level) * 1.25 * 0.9;

  console.log('\nThang 28 cấp (E1-C): tu vi, chỉ số người chơi (hệ số cảnh giới 1,6 / 2,5 / 3,8 / 5,5) và nhịp theo thu nhập của thiết kế');
  console.log('cảnh giới              xpNeed  tích lũy     hp     mp   atk   def   thu nhập/giờ  giờ/cấp  giờ tích lũy');
  for (const st of STAGES) {
    let cum = 0;
    let hrs = 0;
    for (let l = st.from; l <= st.to; l++) {
      const b = playerBaseStats(l);
      cum += xpNeed(l);
      const h = xpNeed(l) / designIncome(l);
      hrs += h;
      console.log(
        `${realmName(l).padEnd(22)} ${String(xpNeed(l)).padStart(7)} ${String(cum).padStart(9)} ${String(b.hp).padStart(6)} ${String(b.mp).padStart(6)} ${String(b.atk).padStart(5)} ${String(b.def).padStart(5)} ${designIncome(l).toFixed(0).padStart(12)} ${h.toFixed(2).padStart(8)} ${hrs.toFixed(2).padStart(10)}`,
      );
    }
    if (Math.abs(hrs / st.hours - 1) > TOL) {
      console.error(`LỖI: chặng ${st.name} ra ${hrs.toFixed(2)} giờ theo thu nhập thiết kế, ngoài ${st.hours} giờ ±${TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  const hb = playerBaseStats(HOA_THAN_LEVEL);
  console.log(
    `${realmName(HOA_THAN_LEVEL).padEnd(22)} ${'(trần tạm)'.padStart(7)} ${' '.padStart(9)} ${String(hb.hp).padStart(6)} ${String(hb.mp).padStart(6)} ${String(hb.atk).padStart(5)} ${String(hb.def).padStart(5)}`,
  );
  console.log(`Mốc thiết kế: Trúc Cơ 4 giờ, Kết Đan 6 giờ, Nguyên Anh 8 giờ (cờ LỖI nếu ngoài ±${TOL * 100}%).`);

  // Chương 6 (TN-3, `tn3/thiet-ke.md` mục 1): nhịp theo thu nhập thiết kế (chưa có quái/nhiệm vụ `van_dinh` để mô phỏng đủ như chương 5;
  // PR bản đồ sẽ thêm `ch6Timeline` khi có cụm quái). Anh Biến 32–35 ~2 giờ, Vấn Đỉnh 36–39 ~5 giờ, Âm Hư 40–43 ~5 giờ; Dương Thực 44 là trần tạm.
  const CH6_STAGES = [
    { name: 'Anh Biến', from: ANH_BIEN_LEVEL, to: VAN_DINH_LEVEL - 1, hours: 2 },
    { name: 'Vấn Đỉnh', from: VAN_DINH_LEVEL, to: AM_HU_LEVEL - 1, hours: 5 },
    { name: 'Âm Hư', from: AM_HU_LEVEL, to: DUONG_THUC_LEVEL - 1, hours: 5 },
  ] as const;
  console.log('\nChương 6 (TN-3): Anh Biến → Vấn Đỉnh → Âm Hư theo thu nhập thiết kế (khung; chưa mô phỏng quái van_dinh)');
  console.log('cảnh giới              xpNeed  thu nhập/giờ  giờ/cấp');
  let ch6Hours = 0;
  for (const st of CH6_STAGES) {
    let hrs = 0;
    for (let l = st.from; l <= st.to; l++) {
      const h = xpNeed(l) / designIncome(l);
      hrs += h;
      console.log(
        `${realmName(l).padEnd(22)} ${String(xpNeed(l)).padStart(7)} ${designIncome(l).toFixed(0).padStart(12)} ${h.toFixed(2).padStart(8)}`,
      );
    }
    ch6Hours += hrs;
    if (Math.abs(hrs / st.hours - 1) > TOL) {
      console.error(`LỖI: chặng ${st.name} ra ${hrs.toFixed(2)} giờ theo thu nhập thiết kế, ngoài ${st.hours} giờ ±${TOL * 100}%`);
      process.exitCode = 1;
    }
  }
  console.log(
    `Chương 6: ${ch6Hours.toFixed(2)} giờ (mốc 12 giờ ±${TOL * 100}%); trần tạm ${realmName(DUONG_THUC_LEVEL)} (cấp ${DUONG_THUC_LEVEL}).`,
  );
  if (Math.abs(ch6Hours / 12 - 1) > TOL) {
    console.error(`LỖI: chương 6 ra ${ch6Hours.toFixed(2)} giờ, ngoài 12 giờ ±${TOL * 100}%`);
    process.exitCode = 1;
  }

  // Thu nhập tu vi thực của mô phỏng ở cấp 15 (Kiếm tu), so với thu nhập thiết kế cùng cấp: mô hình thiết kế có sát thực không.
  const sim15 = (xpNeed(NGUNG_KHI_MAX) - (questByLevel.get(NGUNG_KHI_MAX) ?? 0)) / (at(main.secByLevel, NGUNG_KHI_MAX) / 3600);
  console.log(
    `Đối chiếu: thu nhập tu vi mô phỏng ở tầng ${NGUNG_KHI_MAX} (Kiếm tu, quái thường + đả tọa) ≈ ${sim15.toFixed(0)}/giờ, thiết kế đặt ${designIncome(NGUNG_KHI_MAX).toFixed(0)}/giờ.`,
  );

  // TTK và máu mất với quái "cùng khuôn" U Minh Lang đặt ở cấp L (monsterStats đã nhân hệ số cảnh giới): thời gian hạ quái không được sụp.
  const refDef = MONSTER.get('mon_u_minh_lang')!;
  console.log(
    '\nTTK quái thường cùng khuôn (u_minh_lang đặt ở cấp L, đã nhân hệ số cảnh giới), theo công pháp (trang bị theo nhiệm vụ chỉ tới cấp 15):',
  );
  console.log('cảnh giới              TTK Kiếm/Hộ/Đan         mất/lần Kiếm/Hộ/Đan');
  for (let l = TRUC_CO_LEVEL; l <= HOA_THAN_LEVEL; l++) {
    const ms = monsterStats(l, refDef.hpMul, refDef.atkMul);
    const sk = seekModel(refDef.id);
    const ttks: number[] = [];
    const losts: number[] = [];
    for (const id of METHOD_IDS) {
      const pl = playerM(l, id);
      const ttk = ms.hp / playerDps(l, pl.atk, ms.def, id, refDef.elem);
      ttks.push(ttk);
      losts.push(
        Math.max(0, monsterDps(refDef, ms.atk, pl.def) * ttk * PULL_FACTOR - selfSustain(l, id) * pl.hp * (ttk + sk.seek)) / pl.hp,
      );
    }
    console.log(
      `${realmName(l).padEnd(22)} ${ttks.map((x) => x.toFixed(1).padStart(5) + 's').join(' ')}   ${losts.map((x) => pct(x).padStart(5)).join(' ')}`,
    );
    ttks.forEach((x, i) => {
      if (x < 3.5 || x > 8.5) {
        console.error(
          `LỖI: cấp ${l} ${METHOD_NAME[at(METHOD_IDS, i)]} TTK ${x.toFixed(1)}s ngoài 3,5–8,5 s (hệ số cảnh giới quái lệch người chơi)`,
        );
        process.exitCode = 1;
      }
    });
  }

  // E3-F: cùng quái cùng khuôn, người chơi mặc trọn 8 ô đồ thường Huyền phẩm của từng bậc (ilvl đầu chương): TTK, máu mất và lực chiến.
  console.log('\nTrang bị theo bậc (bộ 7 món thường Huyền phẩm, trung bình 40 lần roll) so với không đồ, quái cùng khuôn ở cấp L:');
  console.log('cấp  bậc  lực chiến (không đồ → có đồ)  atk    def    hp     TTK Kiếm/Hộ/Đan         mất/lần Kiếm/Hộ/Đan');
  const gearRows: { level: number; tier: number; power: number }[] = [];
  for (const [l, tier] of [
    [13, 1],
    [17, 2],
    [19, 2],
    [21, 3],
    [23, 3],
  ] as const) {
    const slots = droppableSlots(ITEM_SYS, ITEMS);
    const ilvl = at(TIER_MIN_ILVL, tier) > 1 ? Math.max(at(TIER_MIN_ILVL, tier), 1) : l;
    const RUNS = 40;
    const acc = { atk: 0, def: 0, hp: 0, mp: 0 };
    for (let run = 0; run < RUNS; run++) {
      const rng = seededRng(2000 + run);
      const worn = slots.map((sl) => {
        const tpl =
          ITEMS.filter((i) => i.kind === sl && !i.set && (i.tier ?? 1) === tier && (i.reqLevel ?? 1) <= l)[0] ??
          at(templatesFor(ITEMS, sl, l), 0, 'templatesFor');
        return { item: { id: tpl.id, n: 1, inst: rollItemInstance(ITEM_SYS, sl, Math.min(ilvl, l + 1), 2, rng, tpl.tier) } };
      });
      const st = computePlayerStats(l, worn);
      acc.atk += st.atk;
      acc.def += st.def;
      acc.hp += st.hp;
      acc.mp += st.mp;
    }
    const g = { atk: acc.atk / RUNS, def: acc.def / RUNS, hp: acc.hp / RUNS, mp: acc.mp / RUNS };
    const base = playerBaseStats(l);
    const p0 = combatPower(base);
    const p1 = combatPower(g);
    gearRows.push({ level: l, tier, power: p1 });
    const ms = monsterStats(l, refDef.hpMul, refDef.atkMul);
    const sk = seekModel(refDef.id);
    const ttks = METHOD_IDS.map((id) => ms.hp / playerDps(l, g.atk, ms.def, id, refDef.elem));
    const losts = METHOD_IDS.map(
      (id, i) =>
        Math.max(0, monsterDps(refDef, ms.atk, g.def) * at(ttks, i) * PULL_FACTOR - selfSustain(l, id) * g.hp * (at(ttks, i) + sk.seek)) /
        g.hp,
    );
    console.log(
      `${String(l).padEnd(4)} ${String(tier).padEnd(4)} ${String(p0).padStart(7)} → ${String(p1).padStart(7)} (${(p1 / p0).toFixed(2)}×)   ${g.atk.toFixed(0).padStart(5)} ${g.def.toFixed(0).padStart(6)} ${g.hp.toFixed(0).padStart(6)}  ${ttks.map((x) => x.toFixed(1).padStart(5) + 's').join(' ')}   ${losts.map((x) => pct(x).padStart(5)).join(' ')}`,
    );
    for (const x of ttks)
      if (x < 2.5 || x > 8.5) {
        console.error(`LỖI: cấp ${l} đồ bậc ${tier} TTK ${x.toFixed(1)}s ngoài 2,5–8,5 s`);
        process.exitCode = 1;
      }
    if (p1 / p0 > 3.2 || p1 / p0 < 1.1) {
      console.error(`LỖI: cấp ${l} đồ bậc ${tier} đổi lực chiến ×${(p1 / p0).toFixed(2)}, ngoài 1,1–3,2`);
      process.exitCode = 1;
    }
  }
  // Bậc cao phải mạnh hơn bậc thấp ở cùng cấp (cấp 19: bậc 2 vs bậc 3 qua `gearRows` kế nhau; mỗi bậc tăng lực chiến so với bậc trước).
  for (const t of [2, 3]) {
    const lo = Math.max(...gearRows.filter((r) => r.tier === t - 1).map((r) => r.power));
    const hi = Math.min(...gearRows.filter((r) => r.tier === t).map((r) => r.power));
    if (!(hi > lo)) {
      console.error(`LỖI: lực chiến đồ bậc ${t} (${hi}) không vượt bậc ${t - 1} (${lo})`);
      process.exitCode = 1;
    }
  }

  // Giờ theo nguồn tu vi ĐANG CÓ: chỉ quái Vân Lam (cấp ≤ 15, `xpLevelFactor` hạ dần tới 0,1 khi chênh ≥ 8 cấp), nhiệm vụ hiện có,
  // đả tọa, thử thách tâm ma ở bình cảnh. Chưa có phó bản, tinh anh/boss, quái cấp 16+ của E-2/E-3/E-4, nên chặng mới KHÔNG đạt nhịp
  // 4/6/8 giờ cho tới khi nội dung đó vào: đây là số liệu thông tin, không phải cờ LỖI.
  const existing = (id: MethodId) =>
    STAGES.map((st) => {
      let sec = 0;
      let kills = 0;
      for (let l = st.from; l <= st.to; l++) {
        const pl = playerM(l, id);
        const sp = pickSpawn(l);
        const def = MONSTER.get(sp.mon)!;
        const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, l));
        const ms = monsterStats(mlv, def.hpMul, def.atkMul);
        const ttk = ms.hp / playerDps(l, pl.atk, ms.def, id, def.elem);
        const sk = seekModel(def.id);
        const lost = Math.max(0, monsterDps(def, ms.atk, pl.def) * ttk * PULL_FACTOR - selfSustain(l, id) * pl.hp * (ttk + sk.seek));
        const rest = lost / (pl.hp * HP_REGEN_MEDITATE);
        const xpPerKill = monsterXp(mlv, def.xpMul) * xpLevelFactor(l, mlv) + meditateXpPerSec(l) * rest;
        const k = Math.ceil(Math.max(0, xpNeed(l) - (questByLevel.get(l) ?? 0)) / xpPerKill);
        kills += k;
        sec += k * (ttk + sk.seek + rest);
        if (BOTTLENECK_LEVELS.includes(l)) {
          const sh = shadowStats(l, pl.atk, pl.def);
          sec += sh.hp / playerDps(l, pl.atk, sh.def, id) + 20;
        }
      }
      return { hours: sec / 3600, kills };
    });
  console.log(
    '\nNhịp theo nguồn tu vi hiện có (chỉ quái Vân Lam cấp ≤ 15 + nhiệm vụ + đả tọa + tâm ma; chưa phó bản, tinh anh/boss, quái cấp 16+):',
  );
  console.log('chặng         mục tiêu   ' + METHOD_IDS.map((m) => METHOD_NAME[m].padEnd(20)).join(' '));
  const ex = METHOD_IDS.map((m) => existing(m));
  STAGES.forEach((st, i) => {
    console.log(
      `${st.name.padEnd(13)} ${(st.hours + ' giờ').padEnd(10)} ${ex.map((e) => (at(e, i).hours.toFixed(1) + ' giờ, ' + at(e, i).kills + ' giết').padEnd(20)).join(' ')}`,
    );
  });
  console.log(
    'Quái Vân Lam (cấp ≤ 15) cho tu vi đủ cho Trúc Cơ (hơi dài hơn 4 giờ vì tu vi hạ dần theo chênh cấp), nhưng từ Kết Đan chênh cấp làm tu vi rơi về 10%: các chặng Kết Đan và Nguyên Anh cần quái, phó bản và boss của E-2/E-3/E-4 (mục 4–6, 11 của thiết kế) mới đạt 4/6/8 giờ.',
  );
}

// ---------- tu vi từ nhiệm vụ chương 2 (E2-H) ----------
{
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q2_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s2_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  let stageXp = 0;
  for (let l = TRUC_CO_LEVEL; l < KET_DAN_LEVEL; l++) stageXp += xpNeed(l);
  const income = (l: number) => 400 * (12 + 7 * l) * 1.25 * 0.9;
  console.log('\nNhiệm vụ chương 2 (E2-H): tu vi thưởng so với chặng Trúc Cơ (nhịp thiết kế 4 giờ)');
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng   giờ tương đương');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    const lv = Math.max(TRUC_CO_LEVEL, q.minLevel ?? TRUC_CO_LEVEL);
    console.log(
      `${q.id.padEnd(19)} ${String(lv).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)} ${(q.rewards.xp / income(lv)).toFixed(2).padStart(10)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  const sideXp = sum(sideQ);
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sideXp} (${pct(sideXp / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 4 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 2 chiếm ${pct(mainShare)} chặng Trúc Cơ, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = xpNeed(Math.max(q.minLevel ?? TRUC_CO_LEVEL, TRUC_CO_LEVEL));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

// ---------- tu vi từ nhiệm vụ chương 3 (E3-H) ----------
{
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q3_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s3_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  let stageXp = 0;
  for (let l = KET_DAN_LEVEL; l < NGUYEN_ANH_LEVEL; l++) stageXp += xpNeed(l);
  console.log('\nNhiệm vụ chương 3 (E3-H): tu vi thưởng so với chặng Kết Đan (nhịp thiết kế 6 giờ)');
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    const lv = Math.max(KET_DAN_LEVEL, q.minLevel ?? KET_DAN_LEVEL);
    console.log(
      `${q.id.padEnd(19)} ${String(lv).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sum(sideQ)} (${pct(sum(sideQ) / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 6 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 3 chiếm ${pct(mainShare)} chặng Kết Đan, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = xpNeed(Math.max(q.minLevel ?? KET_DAN_LEVEL, KET_DAN_LEVEL));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

// ---------- tu vi từ nhiệm vụ chương 4 (E4-H) ----------
{
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q4_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s4_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  let stageXp = 0;
  for (let l = NGUYEN_ANH_LEVEL; l < HOA_THAN_LEVEL; l++) stageXp += xpNeed(l);
  console.log('\nNhiệm vụ chương 4 (E4-H): tu vi thưởng so với chặng Nguyên Anh (nhịp thiết kế 8 giờ)');
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    const lv = Math.max(NGUYEN_ANH_LEVEL, q.minLevel ?? NGUYEN_ANH_LEVEL);
    console.log(
      `${q.id.padEnd(19)} ${String(lv).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sum(sideQ)} (${pct(sum(sideQ) / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 8 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 4 chiếm ${pct(mainShare)} chặng Nguyên Anh, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = xpNeed(Math.max(q.minLevel ?? NGUYEN_ANH_LEVEL, NGUYEN_ANH_LEVEL));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

// ---------- tu vi từ nhiệm vụ chương 5 (DV3-H) ----------
{
  // Chặng Hóa Thần 28→31 theo `xpNeed` thật của shared (docs/DIVUC_DESIGN.md mục 2.2).
  const DESIGN_NEED = [28, 29, 30, 31].map((l) => xpNeed(l));
  const stageXp = DESIGN_NEED.reduce((a, b) => a + b, 0);
  const mainQ = QUESTS.filter((q) => q.id.startsWith('q5_'));
  const sideQ = QUESTS.filter((q) => q.id.startsWith('s5_'));
  const sum = (qs: typeof mainQ) => qs.reduce((n, q) => n + q.rewards.xp, 0);
  console.log(`\nNhiệm vụ chương 5 (DV3-H): tu vi thưởng so với chặng Hóa Thần → Anh Biến (nhịp thiết kế 10 giờ, tổng ${stageXp})`);
  console.log('nhiệm vụ            cấp  tu vi   linh thạch  tích lũy   % chặng');
  let cum = 0;
  for (const q of mainQ) {
    cum += q.rewards.xp;
    console.log(
      `${q.id.padEnd(19)} ${String(q.minLevel ?? 28).padStart(3)} ${String(q.rewards.xp).padStart(6)} ${String(q.rewards.gold).padStart(10)} ${String(cum).padStart(9)} ${pct(cum / stageXp).padStart(9)}`,
    );
  }
  const mainShare = sum(mainQ) / stageXp;
  console.log(
    `Chính ${sum(mainQ)} (${pct(mainShare)} chặng, thiết kế ≈ 14%), phụ ${sum(sideQ)} (${pct(sum(sideQ) / stageXp)}); phần còn lại ${pct(1 - mainShare)} chặng đến từ quái, phó bản, boss và đả tọa để giữ nhịp ≈ 10 giờ.`,
  );
  if (mainShare < 0.12 || mainShare > 0.16) {
    console.error(`LỖI: tu vi nhiệm vụ chính chương 5 chiếm ${pct(mainShare)} chặng Hóa Thần, ngoài 12–16% (thiết kế ≈ 14%)`);
    process.exitCode = 1;
  }
  for (const q of [...mainQ, ...sideQ]) {
    const need = at(DESIGN_NEED, Math.min(Math.max((q.minLevel ?? 28) - 28, 0), 3));
    if (q.rewards.xp > need * 0.2) {
      console.error(`LỖI: ${q.id} thưởng ${q.rewards.xp} tu vi, hơn 20% một cấp (${need}): lên cấp quá nhanh bằng nhiệm vụ`);
      process.exitCode = 1;
    }
  }
}

console.log('\nThử thách tâm ma (bình cảnh, Kiếm tu):');
for (const r of main.trialRows) console.log(r);
console.log(
  'máu/s: phần trăm máu tối đa mất mỗi giây khi đứng yên không né; mất/lần: sau khi trừ khiên + hồi nguyên, đã nhân kéo cụm; tọa: giây đả tọa hồi lại; tìm: giây tìm quái mỗi lần giết.',
);

// ---------- TTK và áp lực theo cấp × công pháp (G9, 3-10) ----------

console.log('\nTTK và máu mất mỗi lần giết, theo cấp × công pháp (quái thường hợp cấp; đứng yên, không né):');
console.log('cảnh giới            quái                     TTK Kiếm/Hộ/Đan         mất/lần Kiếm/Hộ/Đan   nhận/s Kiếm/Hộ/Đan');
const pressureRows: { level: number; ttk: number[]; lost: number[] }[] = [];
for (let level = 1; level <= NGUNG_KHI_MAX; level++) {
  const sp = pickSpawn(level);
  const def = MONSTER.get(sp.mon)!;
  const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
  const ms = monsterStats(mlv, def.hpMul, def.atkMul);
  const sk = seekModel(def.id);
  const ttks: number[] = [];
  const losts: number[] = [];
  const incs: number[] = [];
  for (const id of METHOD_IDS) {
    const pl = playerM(level, id);
    const ttk = ms.hp / playerDps(level, pl.atk, ms.def, id, def.elem);
    const inc = monsterDps(def, ms.atk, pl.def);
    ttks.push(ttk);
    incs.push(inc / pl.hp);
    losts.push(Math.max(0, inc * ttk * PULL_FACTOR - selfSustain(level, id) * pl.hp * (ttk + sk.seek)) / pl.hp);
  }
  pressureRows.push({ level, ttk: ttks, lost: losts });
  console.log(
    `${realmName(level).padEnd(20)} ${(def.id + ' (' + mlv + ')').padEnd(24)} ${ttks.map((x) => x.toFixed(1).padStart(5) + 's').join(' ')}   ${losts.map((x) => pct(x).padStart(5)).join(' ')}   ${incs.map((x) => pct(x).padStart(5)).join(' ')}`,
  );
}
{
  // Ràng buộc 3-10: quái thường hạ trong ~3,5–8,5 giây, từ tầng 4 mỗi lần giết mất ≥ 8% máu (hộ pháp ≥ 4%),
  // và không công pháp nào mất quá 45% máu cho một lần giết (không chết vô lý).
  for (const r of pressureRows) {
    for (let i = 0; i < 3; i++) {
      const who = `tầng ${r.level} ${METHOD_NAME[at(METHOD_IDS, i)]}`;
      if (at(r.ttk, i) < 3.5 || at(r.ttk, i) > 8.5) {
        console.error(`LỖI: ${who} TTK ${at(r.ttk, i).toFixed(1)}s ngoài 3,5–8,5 s`);
        process.exitCode = 1;
      }
      if (at(r.lost, i) > 0.45) {
        console.error(`LỖI: ${who} mất ${pct(at(r.lost, i))} máu mỗi lần giết`);
        process.exitCode = 1;
      }
      if (r.level >= 6 && at(r.lost, i) < at([0.08, 0.06, 0], i)) {
        console.error(`LỖI: ${who} chỉ mất ${pct(at(r.lost, i))} máu mỗi lần giết (quái thường không tạo áp lực)`);
        process.exitCode = 1;
      }
    }
  }
}

{
  // Bí Tịch Tàn Quyển (3-6): nguồn từ quái thường + nhiệm vụ (chưa tính tinh anh, boss, rương bí cảnh, đổi ở Dược sư).
  const costTo = (lv: number) => {
    let s = 0;
    let g = 0;
    for (let l = 2; l <= lv; l++) {
      const c = skillUpgradeCost(l)!;
      s += c.scrolls;
      g += c.gold;
    }
    return { s, g };
  };
  const c3 = costTo(3);
  const c5 = costTo(MAX_SKILL_LEVEL);
  console.log(`
Bí Tịch Tàn Quyển (quái thường + nhiệm vụ): tầng 5 ≈ ${at(scrollAt, 5).toFixed(0)}, tầng 10 ≈ ${at(scrollAt, 10).toFixed(0)}, viên mãn tầng 15 ≈ ${at(scrollAt, 15).toFixed(0)} cuộn; linh thạch từ quái ≈ ${goldTotal.toFixed(0)}.`);
  console.log(
    `Nâng một chiêu: cấp 3 = ${c3.s} cuộn + ${c3.g} linh thạch, cấp 5 = ${c5.s} cuộn + ${c5.g} linh thạch. 4 chiêu chủ lực cấp 3 = ${4 * c3.s} cuộn; 8 chiêu cấp 3 = ${8 * c3.s}; 8 chiêu cấp 5 = ${8 * c5.s}.`,
  );
  console.log(
    'Đổi ở Dược sư (8 yêu đan + 2 thiết tinh + 120 linh thạch mỗi cuộn) là đường bù khi rơi xui; boss, tinh anh và rương bí cảnh cho thêm.',
  );
  // Nhịp: tới viên mãn nên đủ nâng 4 chiêu chủ lực lên cấp 3 (có biến thức), nhưng chưa đủ nâng đủ 8 chiêu lên cấp 5 (mục tiêu hậu kỳ).
  if (at(scrollAt, 15) < 4 * c3.s) {
    console.error('LỖI: tới tầng 15 chưa đủ cuộn nâng 4 chiêu chủ lực lên cấp 3');
    process.exitCode = 1;
  }
  if (at(scrollAt, 15) >= 8 * c5.s) {
    console.error('LỖI: tới tầng 15 đã đủ cuộn nâng mọi chiêu lên cấp 5 (quá dễ)');
    process.exitCode = 1;
  }
  if (goldTotal < 4 * c3.g) {
    console.error('LỖI: linh thạch từ quái không đủ nâng 4 chiêu lên cấp 3');
    process.exitCode = 1;
  }
}
// ---------- đường cong trang bị theo phẩm (3-2) ----------

/** Đủ 7 ô có chỉ số, cùng một phẩm, ilvl = cấp: trung bình 40 lần roll để bớt nhiễu. */
function fullSet(level: number, q: Quality) {
  const slots = droppableSlots(ITEM_SYS, ITEMS);
  const acc = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, dmg: 0 };
  const RUNS = 40;
  for (let run = 0; run < RUNS; run++) {
    const rng = seededRng(1000 + run);
    const worn = slots.map((sl) => {
      const tpl = at(templatesFor(ITEMS, sl, level), 0);
      return { item: { id: tpl.id, n: 1, inst: rollItemInstance(ITEM_SYS, sl, level, q, rng, tpl.tier) } };
    });
    const st = computePlayerStats(level, worn);
    acc.atk += st.atk;
    acc.def += st.def;
    acc.hp += st.hp;
    acc.mp += st.mp;
    acc.crit += st.critRate;
    // Sát thương kỳ vọng mỗi đòn (công kích × bạo kích trung bình), gồm cả dòng phụ.
    acc.dmg += st.atk * (1 + st.critRate * (st.critMul - 1));
  }
  return { atk: acc.atk / RUNS, def: acc.def / RUNS, hp: acc.hp / RUNS, mp: acc.mp / RUNS, crit: acc.crit / RUNS, dmg: acc.dmg / RUNS };
}

console.log('\nBộ 7 ô cùng phẩm ở Ngưng Khí 15 (so với không đồ):');
const base15 = playerBaseStats(NGUNG_KHI_MAX);
console.log('phẩm       công kích   phòng ngự   khí huyết   linh lực   bạo kích   sát thương kỳ vọng (x so với không đồ)');
const dmg0 = base15.atk * (1 + 0.1 * 0.6);
for (const q of [0, 1, 2, 3, 4, 5] as Quality[]) {
  const f = fullSet(NGUNG_KHI_MAX, q);
  const r = (a: number, b: number) => (a / b).toFixed(2) + 'x';
  console.log(
    `${String(q).padEnd(10)} ${f.atk.toFixed(0).padStart(6)} ${r(f.atk, base15.atk).padStart(6)} ${f.def.toFixed(0).padStart(8)} ${r(f.def, base15.def).padStart(6)} ${f.hp.toFixed(0).padStart(8)} ${r(f.hp, base15.hp).padStart(6)} ${f.mp.toFixed(0).padStart(8)} ${(f.crit * 100).toFixed(1).padStart(8)}% ${r(f.dmg, dmg0).padStart(8)}`,
  );
}

console.log('\nThu nhập kỳ vọng mỗi lần hạ quái (linh thạch): vàng rơi + bán trang bị rơi (giá theo ilvl, phẩm)');
const seenIncome = new Set<string>();
for (const sp of Object.values(LEVELS)
  .filter((l) => l.id === 'van_lam' || l.id === 'doan_mach')
  .flatMap((l) => levelSpawns(l))) {
  const m = MONSTER.get(sp.mon)!;
  const key = m.id + ':' + Math.round((sp.levelMin + sp.levelMax) / 2);
  if (seenIncome.has(key)) continue;
  seenIncome.add(key);
  const lt = lootOf(m.id);
  const lv = Math.round((sp.levelMin + sp.levelMax) / 2);
  const gold = (lt.gold[0] + lt.gold[1]) / 2;
  const rng = seededRng(42);
  let gear = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    for (const d of rollEquipDrops(lt.equip, ITEM_SYS, ITEMS, lv, rng)) {
      gear += sellPrice({ id: d.id, n: 1, inst: { q: d.q, ilvl: d.ilvl, main: {}, affixes: [], gems: [], bound: false } }, ITEM.get(d.id)!);
    }
  }
  console.log(
    `${m.id.padEnd(24)} vàng ${gold.toFixed(1).padStart(6)}  bán đồ ${(gear / N).toFixed(1).padStart(6)}  (${((gear / N / gold) * 100).toFixed(0)}% so với vàng)`,
  );
}
console.log(
  '\nTinh anh (người cùng cấp): TTK Kiếm/Hộ/Đan không đồ | bộ Huyền phẩm; máu/s đứng yên (bộ Huyền phẩm), máu mất cả trận (đứng yên, Kiếm tu)',
);
for (const m of MONSTERS_ELITE()) {
  const sp = Object.values(LEVELS)
    .flatMap((l) => levelSpawns(l))
    .find((x) => x.mon === m.id);
  if (!sp) continue;
  const lv = sp.levelMax;
  const ms = monsterStats(lv, m.hpMul, m.atkMul);
  const set = fullSet(lv, 2);
  const t0 = METHOD_IDS.map((id) => ms.hp / playerDps(lv, playerM(lv, id).atk, ms.def, id, m.elem));
  const t1 = METHOD_IDS.map((id) => ms.hp / playerDps(lv, set.atk, ms.def, id, m.elem));
  const inc = monsterDps(m, ms.atk, set.def);
  console.log(
    `${(m.id + ' (' + lv + ')').padEnd(26)} ${t0.map((x) => x.toFixed(0).padStart(3) + 's').join('/')} | ${t1.map((x) => x.toFixed(0).padStart(3) + 's').join('/')}   ${pct(inc / set.hp).padStart(4)}   cả trận ${pct((inc * at(t1, 0)) / set.hp)}`,
  );
  for (const x of t0)
    if (x < 20 || x > 40) {
      console.error(`LỖI: ${m.id} TTK không đồ ${x.toFixed(0)}s ngoài 20–40 s`);
      process.exitCode = 1;
    }
}
function MONSTERS_ELITE(): MonsterDef[] {
  // Chỉ tinh anh của Vân Lam (chặng Ngưng Khí, không đồ bậc 2); tinh anh Đoạn Mạch kiểm ở khối chương 2 theo đồ bậc 2 kỳ vọng.
  const home = new Set(levelSpawns(at(LEVELS, 'van_lam')).map((x) => x.mon));
  return [...MONSTER.values()].filter((m) => m.elite && home.has(m.id));
}

// ---------- cường hóa và kinh tế linh thạch (3-10) ----------

/** Giá trị quy đổi một Hộ Phù (chỉ rơi từ boss, không bán): ~ một nửa giá một món bậc giữa. */
const WARD_VALUE = 400;

/** Linh thạch kỳ vọng (gồm Thiết Tinh quy theo giá mua và Hộ Phù) để lên +`target` từ +0, giải bằng lặp giá trị. */
function enhanceExpect(target: number, price: number, ward: boolean): number {
  const orePrice = ITEM.get(ENHANCE_ORE)?.price ?? 60;
  const E = new Array<number>(target + 1).fill(0);
  for (let it = 0; it < 4000; it++) {
    for (let p = target - 1; p >= 0; p--) {
      const c = enhanceCost(p, price);
      const ok = enhanceChance(p);
      const risk = p >= ENHANCE_RISK_FROM;
      const failTo = risk && !ward ? p - 1 : p;
      E[p] = c.gold + c.ore * orePrice + (risk && ward ? WARD_VALUE * (1 - ok) : 0) + ok * at(E, p + 1) + (1 - ok) * at(E, failTo);
    }
  }
  return at(E, 0);
}

/** Linh thạch kiếm được mỗi giờ ở cảnh giới `level` (vàng rơi + bán trang bị rơi), theo bãi quái hợp cấp và nhịp của Kiếm tu. */
function incomePerHour(level: number): number {
  const sp = pickSpawn(level);
  const m = MONSTER.get(sp.mon)!;
  const lt = lootOf(m.id);
  const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, level));
  const rng = seededRng(7);
  let gear = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    for (const d of rollEquipDrops(lt.equip, ITEM_SYS, ITEMS, mlv, rng)) {
      gear += sellPrice({ id: d.id, n: 1, inst: { q: d.q, ilvl: d.ilvl, main: {}, affixes: [], gems: [], bound: false } }, ITEM.get(d.id)!);
    }
  }
  const perKill = (lt.gold[0] + lt.gold[1]) / 2 + gear / N;
  const kills = main.killsByLevel[level] || 1;
  return perKill * (kills / (at(main.secByLevel, level) / 3600));
}

console.log(
  '\nCường hóa vũ khí: linh thạch kỳ vọng từ +0 (Thiết Tinh tính theo giá mua; không Hộ Phù | có Hộ Phù) và số giờ thu nhập cấp tương ứng',
);
console.log('món (cấp)                 giá cơ sở  thu/giờ    +5            +7            +9                 +10');
for (const [id, lv] of [
  ['itm_thiet_kiem', 4],
  ['itm_thanh_phong_kiem', 8],
  ['itm_han_quang_kiem', 12],
  ['itm_tram_ta_kiem', 15],
] as const) {
  const d = ITEM.get(id)!;
  const price = Math.max(d.price, d.sell * 3);
  const inc = incomePerHour(lv);
  const f = (t: number, w: boolean) => enhanceExpect(t, price, w);
  const h = (g: number) => (g / inc).toFixed(1) + 'h';
  console.log(
    `${(id + ' (' + lv + ')').padEnd(26)} ${String(price).padStart(6)} ${inc.toFixed(0).padStart(8)}  ${f(5, false).toFixed(0).padStart(6)} (${h(f(5, false)).padStart(5)})  ${f(7, false).toFixed(0).padStart(6)} (${h(f(7, false)).padStart(5)})  ${f(9, false).toFixed(0).padStart(6)}|${f(9, true).toFixed(0).padStart(6)} (${h(f(9, true)).padStart(5)})  ${f(10, true).toFixed(0).padStart(6)} (${h(f(10, true)).padStart(5)})`,
  );
  // Mục tiêu 3-10: +5 trong ~1 giờ thu nhập, +9 (có Hộ Phù) 2–7 giờ, +10 không quá 14 giờ.
  if (f(5, false) / inc > 1.2) {
    console.error(`LỖI: ${id} +5 tốn ${h(f(5, false))} thu nhập (quá đắt)`);
    process.exitCode = 1;
  }
  if (f(9, true) / inc < 2 || f(9, true) / inc > 7) {
    console.error(`LỖI: ${id} +9 (Hộ Phù) tốn ${h(f(9, true))} thu nhập, ngoài 2–7 giờ`);
    process.exitCode = 1;
  }
  if (f(10, true) / inc > 14) {
    console.error(`LỖI: ${id} +10 (Hộ Phù) tốn ${h(f(10, true))} thu nhập (quá đắt)`);
    process.exitCode = 1;
  }
}
// Chương 2 (bậc 2, E2-F) và chương 3 (bậc 3, E3-F): hố tiêu của người cầu toàn so với thu nhập theo thiết kế (`docs/EXPANSION_DESIGN.md` 7.5).
// Quái bản đồ 2/3 chưa nằm trong sim nên thu nhập lấy theo `TIER_INCOME_HOUR` (6.000 / 7.400 một giờ) × số giờ chương (4 / 6), cộng ~20% bán đồ rơi.
for (const [tier, hours, pre, four] of [
  [2, 4, 'frg_lm_', ['itm_liet_mach_kiem', 'itm_mach_van_dao_bao', 'itm_sa_thach_ho_uyen', 'itm_kho_ha_van_ngoa']],
  [3, 6, 'frg_kq_', ['itm_kinh_quang_kiem', 'itm_kinh_van_dao_bao', 'itm_luu_ly_ho_uyen', 'itm_phu_van_ngoa']],
] as const) {
  const income = hours * at(TIER_INCOME_HOUR, tier) * 1.2;
  const plain = ITEMS.filter((i) => i.tier === tier && !i.set);
  const promote = plain.length * promoteGold(tier);
  const price = (id: string) => Math.max(ITEM.get(id)!.price, ITEM.get(id)!.sell * 3);
  // Cường hóa +5 cho bốn ô (kiếm, đạo bào, hộ uyển, ủng).
  const enh = four.reduce((n, id) => n + enhanceExpect(5, price(id), false), 0);
  const forge = FORGE.filter((f) => f.id.startsWith(pre)).reduce((n, f) => n + f.gold, 0);
  const sink = promote + enh + forge;
  console.log(
    `
Chương ${tier} (bậc ${tier}): thu nhập ~${income.toFixed(0)} (${hours} giờ) | hố tiêu cầu toàn ${sink.toFixed(0)} = Thăng Bậc ${plain.length} ô ${promote} + cường hóa +5 bốn ô ${enh.toFixed(0)} + chế một bộ ${forge} (${(sink / income).toFixed(2)}× thu nhập)`,
  );
  if (sink / income < 1 || sink / income > 2.5) {
    console.error(`LỖI: hố tiêu chương ${tier} gấp ${(sink / income).toFixed(2)} lần thu nhập, ngoài 1–2,5 (lạm phát hoặc quá đắt)`);
    process.exitCode = 1;
  }
}
{
  // Nguồn/tiêu tới viên mãn tầng 15 (một mình).
  // Chỉ nhiệm vụ làm được tới tầng 15 (nhiệm vụ chương 2 trở đi, minLevel ≥ 16, có bảng kinh tế riêng).
  const quest = QUESTS.filter((q) => (q.minLevel ?? 1) <= NGUNG_KHI_MAX).reduce((n, q) => n + (q.rewards.gold ?? 0), 0);
  let sold = 0;
  for (let l = 1; l <= NGUNG_KHI_MAX; l++) {
    const sp = pickSpawn(l);
    const lt = lootOf(MONSTER.get(sp.mon)!.id);
    const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, l));
    const rng = seededRng(11 + l);
    let g = 0;
    const N = 1000;
    for (let i = 0; i < N; i++)
      for (const d of rollEquipDrops(lt.equip, ITEM_SYS, ITEMS, mlv, rng))
        g += sellPrice({ id: d.id, n: 1, inst: { q: d.q, ilvl: d.ilvl, main: {}, affixes: [], gems: [], bound: false } }, ITEM.get(d.id)!);
    sold += (g / N) * at(main.killsByLevel, l);
  }
  const source = main.goldTotal + quest + sold;
  const shop = 280 + 380 + 900 + 60 * 25; // thiết kiếm, đạo bào, nhẫn Huyền Thiết, ~60 đan hồi
  let skill3 = 0;
  let skill5 = 0;
  for (let l = 2; l <= MAX_SKILL_LEVEL; l++) {
    const c = skillUpgradeCost(l)!;
    if (l <= 3) skill3 += c.gold;
    skill5 += c.gold;
  }
  const enh = enhanceExpect(7, 660, false);
  console.log(
    `\nKinh tế linh thạch tới viên mãn tầng 15 (Kiếm tu, một mình): nguồn ${source.toFixed(0)} = ${main.goldTotal.toFixed(0)} vàng rơi + ${quest} nhiệm vụ + ${sold.toFixed(0)} bán trang bị rơi.\n` +
      `Tiêu thiết yếu ${shop} (đồ cửa hàng, đan) + 4 chiêu cấp 3 ${4 * skill3} + 8 chiêu cấp 5 ${8 * skill5} + một kiếm Thanh Phong +7 ${enh.toFixed(0)} = ${(shop + 4 * skill3 + 8 * skill5 + enh).toFixed(0)}.`,
  );
  // Đủ cho thiết yếu và nâng bốn chiêu chủ lực; không đủ làm hết (còn chỗ tiêu, tránh dư thừa lạm phát).
  if (source < shop + 4 * skill3) {
    console.error('LỖI: nguồn linh thạch tới tầng 15 không đủ đồ thiết yếu và 4 chiêu cấp 3');
    process.exitCode = 1;
  }
  if (source > shop + 4 * skill3 + 8 * skill5 + enh) {
    console.error('LỖI: nguồn linh thạch tới tầng 15 vượt mọi chỗ tiêu (lạm phát)');
    process.exitCode = 1;
  }
}

// ---------- độ kiếp Trúc Cơ (ba pha, G11) ----------
{
  // Mô phỏng nhịp đợt thiên lôi (cùng hằng số với server): số đợt, số tia, sát thương nếu đứng yên.
  const pl = player(NGUNG_KHI_MAX);
  const pHitOf = (r: number) => (r * r) / (TRIB_EXTRA.distMax ** 2 - TRIB_EXTRA.distMin ** 2);
  let t = TRIB_FIRST_DELAY;
  let waves = 0;
  let aimed = 0;
  let extraN = 0;
  let aimDmg = 0;
  let chip = 0; // kỳ vọng sát thương tia rơi quanh với người luôn né tia nhắm thẳng và vạch
  let nets = 0;
  let finalAt = -1;
  while (t < TRIBULATION_DURATION) {
    const phase = tribPhaseAt(t);
    if (phase === 3 && finalAt < 0) {
      finalAt = Math.max(t, TRIB_PHASE_END[1]);
      t = finalAt + TRIB_FINAL.delay;
      continue;
    }
    waves++;
    aimed++;
    if (phase === 3) {
      aimDmg += TRIB_RAIN.aimPct;
      extraN += TRIB_RAIN.count;
      chip += TRIB_RAIN.count * TRIB_RAIN.pct * pHitOf(TRIB_RAIN.r);
      t += TRIB_RAIN.gap;
    } else {
      aimDmg += TRIB_AIM.pct;
      extraN += TRIB_PHASE_EXTRA[phase];
      chip += TRIB_PHASE_EXTRA[phase] * TRIB_EXTRA.pct * pHitOf(TRIB_EXTRA.r);
      if (phase === 2 && waves % TRIB_NET.every === 0) nets++;
      t += TRIB_PHASE_GAP[phase];
    }
  }
  const noTools = chip + TRIB_FINAL.pct;
  const shield = 0.35;
  console.log(
    `
Độ kiếp Trúc Cơ ba pha (Ngưng Khí 15, máu ${pl.hp}): ${waves} đợt trong ${TRIBULATION_DURATION} s (pha 1 đến ${TRIB_PHASE_END[0]} s, pha 2 đến ${TRIB_PHASE_END[1]} s, pha 3 đến hết) = ${aimed} tia nhắm thẳng + ${extraN} tia rơi quanh + ${nets} lần lôi võng (${TRIB_NET.lines} vạch) + 1 tia cuối khóa mệnh ${pct(TRIB_FINAL.pct)} máu lúc ${finalAt.toFixed(0)} s.
` +
      `Đứng yên mất ${pct(aimDmg + chip)} máu (chết chắc). Người luôn né tia nhắm và vạch: ăn ${pct(chip)} từ tia rơi quanh + ${pct(TRIB_FINAL.pct)} tia cuối = ${pct(noTools)}; ` +
      `có Hộ Thể (${pct(shield)}) còn ${pct(Math.max(0, noTools - shield))}; Kim Cương Đan giảm tia cuối ${pct(Math.min(TRIB_FINAL.defMaxCut, 0.15 * TRIB_FINAL.defMul))}. Dùng được tối đa ${TRIB_PILL_MAX} đan hồi phục; hoàn Trúc Cơ Đan nếu chết sau ${TRIBULATION_REFUND_AFTER} s.`,
  );
  // Phải cần chống đỡ (không công cụ nào thì dễ chết) nhưng một lớp chống đỡ là qua được.
  if (aimDmg + chip < 1.2) {
    console.error('LỖI: độ kiếp đứng yên không chết (quá dễ)');
    process.exitCode = 1;
  }
  if (noTools < 1.0) {
    console.error('LỖI: độ kiếp không cần chống đỡ tia cuối cũng qua (quá dễ)');
    process.exitCode = 1;
  }
  if (noTools - shield > 0.9) {
    console.error('LỖI: độ kiếp có Hộ Thể vẫn chết gần chắc (quá khó)');
    process.exitCode = 1;
  }
}

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
  console.log(
    `${(id + ' (' + lv + ')').padEnd(32)} ${pct(one / pl.hp).padStart(5)}   ${pct(one / pl.hp).padStart(5)} (không miễn vùng: ${pct((3 * one) / pl.hp)})`,
  );
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
  ['boss_dia_mach_long', 19, 4],
  ['boss_van_hai_kinh_vuong', 23, 4],
] as const) {
  const def = MONSTER.get(id)!;
  const ms = monsterStats(lv, def.hpMul, def.atkMul);
  const pl = player(lv);
  // Nhóm: 1 hộ pháp + 1 đan sư + (n−2) kiếm tu.
  const grp = [...Array(Math.max(0, n - 2)).fill('lac_kiem_quyet'), 'bat_dong_kim_than', 'thanh_moc_dan_kinh'].reduce(
    (sum: number, id) => sum + playerDps(lv, pl.atk, ms.def, id as MethodId, def.elem),
    0,
  );
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
  const swHit = Math.max(
    0,
    ...(def.phases ?? []).map((_, i) => phaseRules(def, i + 1).ai.sweep).map((w) => (w ? hit(ms.atk, w.mul, pl.def) : 0)),
  );
  const ps = def.posture;
  const breaks = ps ? Math.floor(ps.k + (ch ? Math.floor(ttkInt / ch.cd) * ps.interrupt : 0)) : 0;
  // Tank đứng yên: cận chiến (trừ lúc boss bận) + đập vùng + chú (nếu không ngắt).
  const tankNo = melee * (1 - chantFrac) + (sl ? slamHit / sl.cd : 0) + (ch ? chantHit / ch.cd : 0);
  console.log(
    `${(id + ' (' + n + '×' + lv + ')').padEnd(32)} ${ttkInt.toFixed(0).padStart(4)}s/${ttkNo.toFixed(0).padStart(4)}s ${pct(tankNo / pl.hp).padStart(10)} ${(ch ? pct(chantHit / pl.hp) : '-').padStart(6)} ${pct(slamHit / pl.hp).padStart(5)} ${pct(hit(ms.atk, 1, pl.def) / pl.hp).padStart(8)} ${(swHit ? pct(swHit / pl.hp) : '-').padStart(6)} ${String(breaks).padStart(8)}`,
  );
}
console.log(
  'chú/đập/cận chiến/chém: phần trăm máu một người cùng cấp mất mỗi đòn (trang bị theo nhiệm vụ). Mất thế: số lần ước tính mỗi trận.',
);

// ---------- phó bản (E2-C) ----------

/**
 * Thời gian dẹp một phó bản theo dữ liệu `levels/<id>.json`: nhóm 4 người (kiếm tu ×2, hộ pháp, đan sư) cùng cấp quái thấp nhất của phó bản.
 * Mỗi đợt: tổng máu / sát thương nhóm × hiệu suất (đứng vị trí, né vạch, đổi mục tiêu) + nghỉ trước đợt + gom đồ/hồi sức.
 * Boss: thời gian không đánh được (chui đất) và máu hút lại khi chú không bị phá được trừ vào sát thương. Cộng đường đi vào, rồi nhân hệ số
 * "lỡ tay lần đầu" (hồi sinh, học cơ chế). Mục tiêu thiết kế mục 5.1: khoảng 20 phút.
 */
const DG_EFF_TRASH = 0.7;
const DG_EFF_BOSS = 0.6;
const DG_REGROUP = 45;
const DG_ENTRY = 60;
const DG_FIRST_TRY = 1.8;
const DG_INTERRUPT_RATE = 0.7;
/** Phút dẹp phó bản kể cả lỡ tay lần đầu, theo id level (chương 2 dùng cho nhịp giờ). */
/** Hệ số hiệu suất DPS khi đánh boss gương (giả định chưa kiểm bằng người thật: bóng giả, né đĩa, nguyệt phản). */
const DG_MIRROR_EFF = 0.55;
const dgFirstMin = new Map<string, number>();
console.log('\nPhó bản (nhóm 4 × cấp thấp nhất)   đợt   sạch thuần   kể cả lỡ tay lần đầu   (mục tiêu ~20 phút, thiết kế 5.1)');
for (const lv of Object.values(LEVELS)) {
  const d = lv.dungeon;
  if (!d || lv.tribulation || !d.waves.length) continue;
  const L = Math.min(...d.waves.flatMap((w) => w.mons.map((m) => m.level)));
  const pl = player(L);
  const rows: string[] = [];
  let total = DG_ENTRY;
  d.waves.forEach((w, i) => {
    // Đợt giải đố ba gương (E3-M): không quái; tốn thời gian đố (đọc thứ tự, chạy ba cột, thường dư vài giây) cộng nghỉ.
    if (w.puzzle) {
      const tp = (w.delay ?? 6) + w.puzzle.secs * 0.75 + DG_REGROUP;
      total += tp;
      rows.push(`${i + 1}:${tp.toFixed(0)}s`);
      return;
    }
    let hp = 0;
    let boss: MonsterDef | undefined;
    let ref = 0;
    for (const g of w.mons) {
      const def = MONSTER.get(g.id)!;
      const ms = monsterStats(g.level, def.hpMul, def.atkMul);
      hp += ms.hp * g.n;
      if (def.boss) {
        boss = def;
        ref = ms.def;
      }
    }
    const refDef =
      ref || monsterStats(at(w.mons, 0).level, MONSTER.get(at(w.mons, 0).id)!.hpMul, MONSTER.get(at(w.mons, 0).id)!.atkMul).def;
    const grp = [...Array(2).fill('lac_kiem_quyet'), 'bat_dong_kim_than', 'thanh_moc_dan_kinh'].reduce(
      (s: number, id) => s + playerDps(L, pl.atk, refDef, id as MethodId, w.mons[0] ? MONSTER.get(w.mons[0].id)?.elem : undefined),
      0,
    );
    let dps = grp * (boss ? DG_EFF_BOSS : DG_EFF_TRASH);
    if (boss) {
      // Boss gương (E3-M): ba bóng giả phải tìm/đánh, tránh đĩa gương, Tâm Ma Ảnh chiếm người trong màn: hiệu suất giảm.
      if (boss.mirror) dps *= DG_MIRROR_EFF;
      const bu = boss.ai?.burrow ?? boss.phases?.map((_, k) => phaseRules(boss!, k + 1).ai.burrow).find(Boolean);
      if (bu) dps *= 1 - bu.hide / bu.cd;
      const ch = boss.ai?.chant;
      if (ch?.drain) {
        // Chú không bị phá hồi `drain × cast` máu tối đa mỗi chu kỳ; bị phá thì boss choáng (nhận thêm sát thương).
        const ms = monsterStats(at(w.mons, 0).level, boss.hpMul, boss.atkMul);
        const healPerSec = ((1 - DG_INTERRUPT_RATE) * ch.drain * ch.cast * ms.hp) / ch.cd;
        dps = dps * (1 + (INTERRUPT_VULN_MUL - 1) * DG_INTERRUPT_RATE * (ch.stun / ch.cd)) - healPerSec;
      }
    }
    const t = hp / Math.max(1, dps) + (w.delay ?? (i === 0 ? 8 : 6)) + DG_REGROUP;
    total += t;
    rows.push(`${i + 1}:${t.toFixed(0)}s`);
  });
  const first = (total * DG_FIRST_TRY) / 60;
  dgFirstMin.set(lv.id, first);
  if (lv.id === 'kinh_nguyet' && (first < 20 || first > 30)) {
    console.error(`LỖI: Kính Nguyệt Cung ra ${first.toFixed(1)} phút, ngoài khoảng 20–30 phút quanh mục tiêu ~25 phút`);
    process.exitCode = 1;
  }
  if (lv.id === 'phuc_mach' && (first < 15 || first > 25)) {
    console.error(`LỖI: Phục Mạch Quật ra ${first.toFixed(1)} phút, ngoài khoảng 15–25 phút quanh mục tiêu ~20 phút`);
    process.exitCode = 1;
  }
  console.log(
    `${(lv.id + ' (4×' + L + ')').padEnd(32)} ${String(d.waves.length).padStart(3)} ${(total / 60).toFixed(1).padStart(8)} phút ${((total * DG_FIRST_TRY) / 60).toFixed(1).padStart(14)} phút   [${rows.join(' ')}]`,
  );
}

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
const CH2_PARTY_SHARE = 1.6 / 4;
/** Phút đi tới, gom nhóm và hạ Địa Mạch Long (TTK nhóm 4 ≈ 82 s, cộng chờ nhóm, đường đi, nhặt đồ). */
const CH2_BOSS_MIN = 8;
/** Phút chế Kết Đan Dịch (đi Dược sư, nguyên liệu đã có) và giây chuẩn bị tại chỗ độ kiếp. */
const CH2_CRAFT_MIN = 3;
const CH2_TRIB_PREP_SEC = 90;
/** Tỉ lệ mặc giáp bậc 2 (phẩm Linh) kỳ vọng ở từng cấp 16..19: rơi từ quái/tinh anh/phó bản, chế ở Hứa lão. */
let CH2_GEAR_FRAC = [0.3, 0.5, 0.7, 0.85];
const CH2_GEAR_Q: Quality = 1;

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
    const eTtk = eMs.hp / playerDps(level, pl.atk, eMs.def, id, eDef.elem);
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
const TRIB_SKILL: { name: string; dodge: number }[] = [
  { name: 'vụng', dodge: 0.6 },
  { name: 'thường', dodge: 0.8 },
  { name: 'giỏi', dodge: 0.92 },
];
/** Giây không đứng yên trong vòng khi né một đòn (bước ra rồi về) và lượng thở hồi bằng Hộ Thể. */
const TRIB_DODGE_COST = 1.0;
const TRIB_SHIELD = 0.35;
/** Tia rơi quanh trúng người đứng yên với xác suất `r² / (dMax² − dMin²)`. */
const trPHit = (r: number, d: { min: number; max: number }) => Math.min(1, (r * r) / (d.max * d.max - d.min * d.min));

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
      if (r.ttk < 3.8 || r.ttk > 7.3) {
        console.error(`LỖI: chương 2 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,8–7,3 s`);
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
const CH3_GEAR_Q: Quality = 1;
/** Tay nghề dùng để tính nhịp giờ: người chơi "thường" (né 80%), một mình. */
const CH3_TRIB_DODGE = 0.8;

/** Bộ 7 ô phẩm `q` của bậc có `reqLevel` = `req`, ilvl = `level` (như `fullSet`, nhưng chọn bậc). */
const fullSetTierCache = new Map<string, { atk: number; def: number; hp: number }>();
function fullSetTier(level: number, q: Quality, req: number) {
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
const CH4_GEAR_Q: Quality = 1;
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
function dropExp(mon: string, item: string): number {
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

interface Ch5Level {
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
    const eTtk = eMs.hp / playerDps(level, pl.atk, eMs.def, id, eDef.elem);
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
      if (r.ttk < 3.8 || r.ttk > 7.3) {
        console.error(`LỖI: chương 5 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,8–7,3 s`);
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

// ---------- Nhịp chương 6 (TN-3): Anh Biến (cấp 32) → độ kiếp Dương Thực (cấp 43→44, trần tạm) ----------
// Cùng cách dựng chương 5 nhưng dữ liệu là Vấn Đỉnh: cụm quái `van_dinh.json` (cấp 32–43), nhiệm vụ `q6_*` + `s6_*`, phó bản Giới Trì (cấp 42), hai boss ngoài trời
// (Hư Ảnh Chủ 39, Đỉnh Linh 43), thử thách tâm ma ở bình cảnh, ba lần chế Lộ và độ kiếp (Vấn Đỉnh 35, Âm Hư 39, Dương Thực 43; chưa mô phỏng cơ chế kiếp, lấy tỉ lệ qua
// giả định ghi rõ). Chưa có trang bị bậc 6: người chơi mặc bộ bậc 5 cùng ilvl theo cấp. Mục tiêu 12 giờ ±12% (`tn3/thiet-ke.md` mục 1).
const CH6_TARGET_H = 12;
const CH6_TOL = 0.12;
const CH6_ELITE_EVERY = 900;
const CH6_QUEST_OVERHEAD = 150;
const CH6_BOSS_MIN = 8;
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

function ch6Player(level: number, id: MethodId): { atk: number; def: number; hp: number } {
  const t5 = fullSetTier(level, CH6_GEAR_Q, HOA_THAN_LEVEL);
  const pas = methodAt(level, id)?.passive;
  return { atk: t5.atk, def: Math.round(t5.def * (1 + (pas?.defMul ?? 0))), hp: Math.round(t5.hp * (1 + (pas?.hpMul ?? 0))) };
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
    const eTtk = eMs.hp / playerDps(level, pl.atk, eMs.def, id, eDef.elem);
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
    `\nNhịp chương 6 (TN-3): Anh Biến cấp ${ANH_BIEN_LEVEL} → độ kiếp Dương Thực (cấp ${DUONG_THUC_LEVEL - 1}), một mình, đồ bậc 5 theo ilvl (phẩm ${CH6_GEAR_Q}); ` +
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
      if (r.ttk < 3.8 || r.ttk > 7.3) {
        console.error(`LỖI: chương 6 cấp ${r.level} ${METHOD_NAME[id]} TTK quái thường ${r.ttk.toFixed(1)}s ngoài 3,8–7,3 s`);
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
}

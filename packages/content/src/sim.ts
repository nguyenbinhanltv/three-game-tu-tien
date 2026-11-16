// Ước tính nhịp lên cảnh giới: một người chơi một mình, đánh quái hợp cấp, làm đủ chuỗi nhiệm vụ.
// Tính cả máu mất mỗi lần giết (đứng yên, không né vùng) và thời gian đả tọa hồi lại.
// Chạy: pnpm sim:progress

import { levelSpawns, type MonsterDef, type Quality, type SkillDef } from '@dtl/shared';
import {
  BOTTLENECK_LEVELS,
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
  MAX_SKILL_LEVEL,
  skillUpgradeCost,
  shadowStats,
  TRIAL_DURATION,
  playerBaseStats,
  xpLevelFactor,
  xpNeed,
} from '@dtl/shared';
import { lootOf } from './loot';
import { ENHANCE_ORE, ITEM, ITEM_SYS, ITEMS, LEVELS, METHODS, METHOD_SKILLS, MONSTER, QUESTS, realmName, SKILLS } from './index';

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
const METHOD_IDS: MethodId[] = ['lac_kiem_quyet', 'bat_dong_kim_than', 'thanh_moc_dan_kinh'];
const METHOD_NAME: Record<MethodId, string> = { lac_kiem_quyet: 'Kiếm tu', bat_dong_kim_than: 'Hộ pháp', thanh_moc_dan_kinh: 'Đan sư' };
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

/** Sát thương trung bình mỗi giây của người chơi lên một quái (xoay vòng các chiêu đã mở). `monElem`: hệ quái, tính khắc chế. */
function playerDps(level: number, atk: number, monDef: number, id?: MethodId, monElem?: string): number {
  const m = methodAt(level, id);
  const pas = m?.passive;
  // Nhịp đánh: mọi đòn thường 1 GCD; kiếm tu hoàn 0,2 s mỗi chuỗi 3 đòn.
  const gcd = GCD - (pas?.gcdRefund ? pas.gcdRefund / 3 : 0);
  // Bạo kích: nền 10% + nội tại; đủ kiếm ý (đánh liên tục) thì thêm `critAtMax`.
  const crit = Math.min(STAT_CAPS.critRate, CRIT_CHANCE + (pas?.critBase ?? 0) + (pas?.critAtMax ?? 0));
  const critMul = 1 + crit * (CRIT_MULT - 1);
  const melee = 1 + (pas?.melee?.mul ?? 0);
  const one = (s: SkillDef) => hit(atk, s.power, monDef) * critMul * melee * counterMul(elemCounter(s.elem, monElem));
  let perSec = 0;
  let gcdUsed = 0;
  for (const s of [...SKILLS, ...methodSkills(level, id)]) {
    if (s.unlock > level || (s.kind !== 'damage' && s.kind !== 'aoe' && !(s.kind === 'dash' && s.power > 0)) || s.cd <= 0) continue;
    perSec += one(s) / s.cd;
    // Lướt không ăn GCD.
    if (s.kind !== 'dash') gcdUsed += (gcd + s.cast) / s.cd;
  }
  const basic = SKILLS[0];
  perSec += (one(basic) / gcd) * Math.max(0, 1 - gcdUsed);
  // Mộc độc đan sư: sát thương theo thời gian mỗi mục tiêu, không giảm theo phòng ngự, phủ `POISON_MOBS` quái trong cụm.
  const hx = m ? METHOD_SKILLS.find((s) => s.id === m.sig && s.poison) : undefined;
  if (hx?.poison && hx.unlock <= level) perSec += ((atk * hx.poison.mul * hx.poison.dur) / hx.cd) * POISON_MOBS;
  return perSec;
}

/** Máu tự hồi bằng chiêu (khiên, hồi nguyên, hồi xuân) theo tỉ lệ máu tối đa mỗi giây, nhân hiệu suất dùng thật. */
function selfSustain(level: number, id?: MethodId): number {
  const m = methodAt(level, id);
  const healMul = 1 + (m?.passive.healMul ?? 0);
  let r = 0;
  for (const s of [...SKILLS, ...methodSkills(level, id)]) {
    if (s.unlock > level || s.cd <= 0) continue;
    if (s.kind === 'heal' || s.kind === 'hot') r += (s.power * healMul) / s.cd;
    if (s.kind === 'shield') r += s.power / s.cd;
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
const spawns = levelSpawns(LEVELS.van_lam).filter((s) => !MONSTER.get(s.mon)?.boss && !MONSTER.get(s.mon)?.elite);
const CAMPS = (LEVELS.van_lam.camps ?? []).filter((c) => !MONSTER.get(c.mon)?.elite);
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
  questScrollByLevel.set(lv, (questScrollByLevel.get(lv) ?? 0) + (q.rewards.items ?? []).filter((i) => i.id === SCROLL_ID).reduce((n, i) => n + i.n, 0));
}

/** Bãi quái người chơi chọn ở cảnh giới `level`: cấp quái gần cấp mình nhất. */
function pickSpawn(level: number) {
  return [...spawns].sort((a, b) => Math.abs((a.levelMin + a.levelMax) / 2 - level) - Math.abs((b.levelMin + b.levelMax) / 2 - level))[0];
}

function timeline(id?: MethodId): Timeline {
  let totalSec = 0;
  let fightSec = 0;
  let trialSec = 0;
  let questXp = 0;
  let scrollTotal = 0;
  let goldTotal = 0;
  const t: Timeline = { hours: 0, fightHours: 0, restHours: 0, trialMin: 0, rows: [], trialRows: [], questXp: 0, scrollAt: [], goldAt: [], killsByLevel: [], secByLevel: [], goldTotal: 0 };
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
      t.trialRows.push(`${realmName(level).padEnd(20)} bóng hp ${String(sh.hp).padStart(5)}  TTK ${tt.toFixed(0).padStart(3)}s / ${TRIAL_DURATION}s  mất máu ${pct(raw / pl.hp).padStart(4)} nếu đứng yên, ${pct(taken / pl.hp).padStart(4)} sau khiên + hồi nguyên`);
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
console.log('Nhịp lên cấp (Kiếm tu; từ tầng 5 dùng công pháp; tìm quái = đi giữa các cụm của M-2, kéo ' + PULL + ' con mỗi cụm, hiệu suất khiên/hồi ' + pct(SUSTAIN_EFF) + ')');
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
  console.log(`${realmName(HOA_THAN_LEVEL).padEnd(22)} ${'(trần tạm)'.padStart(7)} ${' '.padStart(9)} ${String(hb.hp).padStart(6)} ${String(hb.mp).padStart(6)} ${String(hb.atk).padStart(5)} ${String(hb.def).padStart(5)}`);
  console.log(`Mốc thiết kế: Trúc Cơ 4 giờ, Kết Đan 6 giờ, Nguyên Anh 8 giờ (cờ LỖI nếu ngoài ±${TOL * 100}%).`);

  // Thu nhập tu vi thực của mô phỏng ở cấp 15 (Kiếm tu), so với thu nhập thiết kế cùng cấp: mô hình thiết kế có sát thực không.
  const sim15 = (xpNeed(NGUNG_KHI_MAX) - (questByLevel.get(NGUNG_KHI_MAX) ?? 0)) / (main.secByLevel[NGUNG_KHI_MAX] / 3600);
  console.log(`Đối chiếu: thu nhập tu vi mô phỏng ở tầng ${NGUNG_KHI_MAX} (Kiếm tu, quái thường + đả tọa) ≈ ${sim15.toFixed(0)}/giờ, thiết kế đặt ${designIncome(NGUNG_KHI_MAX).toFixed(0)}/giờ.`);

  // TTK và máu mất với quái "cùng khuôn" U Minh Lang đặt ở cấp L (monsterStats đã nhân hệ số cảnh giới): thời gian hạ quái không được sụp.
  const refDef = MONSTER.get('mon_u_minh_lang')!;
  console.log('\nTTK quái thường cùng khuôn (u_minh_lang đặt ở cấp L, đã nhân hệ số cảnh giới), theo công pháp (trang bị theo nhiệm vụ chỉ tới cấp 15):');
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
      losts.push(Math.max(0, monsterDps(refDef, ms.atk, pl.def) * ttk * PULL_FACTOR - selfSustain(l, id) * pl.hp * (ttk + sk.seek)) / pl.hp);
    }
    console.log(`${realmName(l).padEnd(22)} ${ttks.map((x) => x.toFixed(1).padStart(5) + 's').join(' ')}   ${losts.map((x) => pct(x).padStart(5)).join(' ')}`);
    ttks.forEach((x, i) => {
      if (x < 3.5 || x > 8.5) {
        console.error(`LỖI: cấp ${l} ${METHOD_NAME[METHOD_IDS[i]]} TTK ${x.toFixed(1)}s ngoài 3,5–8,5 s (hệ số cảnh giới quái lệch người chơi)`);
        process.exitCode = 1;
      }
    });
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
  console.log('\nNhịp theo nguồn tu vi hiện có (chỉ quái Vân Lam cấp ≤ 15 + nhiệm vụ + đả tọa + tâm ma; chưa phó bản, tinh anh/boss, quái cấp 16+):');
  console.log('chặng         mục tiêu   ' + METHOD_IDS.map((m) => METHOD_NAME[m].padEnd(20)).join(' '));
  const ex = METHOD_IDS.map((m) => existing(m));
  STAGES.forEach((st, i) => {
    console.log(`${st.name.padEnd(13)} ${(st.hours + ' giờ').padEnd(10)} ${ex.map((e) => (e[i].hours.toFixed(1) + ' giờ, ' + e[i].kills + ' giết').padEnd(20)).join(' ')}`);
  });
  console.log('Quái Vân Lam (cấp ≤ 15) cho tu vi đủ cho Trúc Cơ (hơi dài hơn 4 giờ vì tu vi hạ dần theo chênh cấp), nhưng từ Kết Đan chênh cấp làm tu vi rơi về 10%: các chặng Kết Đan và Nguyên Anh cần quái, phó bản và boss của E-2/E-3/E-4 (mục 4–6, 11 của thiết kế) mới đạt 4/6/8 giờ.');
}

console.log('\nThử thách tâm ma (bình cảnh, Kiếm tu):');
for (const r of main.trialRows) console.log(r);
console.log('máu/s: phần trăm máu tối đa mất mỗi giây khi đứng yên không né; mất/lần: sau khi trừ khiên + hồi nguyên, đã nhân kéo cụm; tọa: giây đả tọa hồi lại; tìm: giây tìm quái mỗi lần giết.');

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
      const who = `tầng ${r.level} ${METHOD_NAME[METHOD_IDS[i]]}`;
      if (r.ttk[i] < 3.5 || r.ttk[i] > 8.5) { console.error(`LỖI: ${who} TTK ${r.ttk[i].toFixed(1)}s ngoài 3,5–8,5 s`); process.exitCode = 1; }
      if (r.lost[i] > 0.45) { console.error(`LỖI: ${who} mất ${pct(r.lost[i])} máu mỗi lần giết`); process.exitCode = 1; }
      if (r.level >= 6 && r.lost[i] < [0.08, 0.06, 0][i]) { console.error(`LỖI: ${who} chỉ mất ${pct(r.lost[i])} máu mỗi lần giết (quái thường không tạo áp lực)`); process.exitCode = 1; }
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
Bí Tịch Tàn Quyển (quái thường + nhiệm vụ): tầng 5 ≈ ${scrollAt[5].toFixed(0)}, tầng 10 ≈ ${scrollAt[10].toFixed(0)}, viên mãn tầng 15 ≈ ${scrollAt[15].toFixed(0)} cuộn; linh thạch từ quái ≈ ${goldTotal.toFixed(0)}.`);
  console.log(`Nâng một chiêu: cấp 3 = ${c3.s} cuộn + ${c3.g} linh thạch, cấp 5 = ${c5.s} cuộn + ${c5.g} linh thạch. 4 chiêu chủ lực cấp 3 = ${4 * c3.s} cuộn; 8 chiêu cấp 3 = ${8 * c3.s}; 8 chiêu cấp 5 = ${8 * c5.s}.`);
  console.log('Đổi ở Dược sư (8 yêu đan + 2 thiết tinh + 120 linh thạch mỗi cuộn) là đường bù khi rơi xui; boss, tinh anh và rương bí cảnh cho thêm.');
  // Nhịp: tới viên mãn nên đủ nâng 4 chiêu chủ lực lên cấp 3 (có biến thức), nhưng chưa đủ nâng đủ 8 chiêu lên cấp 5 (mục tiêu hậu kỳ).
  if (scrollAt[15] < 4 * c3.s) { console.error('LỖI: tới tầng 15 chưa đủ cuộn nâng 4 chiêu chủ lực lên cấp 3'); process.exitCode = 1; }
  if (scrollAt[15] >= 8 * c5.s) { console.error('LỖI: tới tầng 15 đã đủ cuộn nâng mọi chiêu lên cấp 5 (quá dễ)'); process.exitCode = 1; }
  if (goldTotal < 4 * c3.g) { console.error('LỖI: linh thạch từ quái không đủ nâng 4 chiêu lên cấp 3'); process.exitCode = 1; }
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
      const tpl = templatesFor(ITEMS, sl, level)[0];
      return { item: { id: tpl.id, n: 1, inst: rollItemInstance(ITEM_SYS, sl, level, q, rng) } };
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
for (const q of [0, 1, 2, 3, 4] as Quality[]) {
  const f = fullSet(NGUNG_KHI_MAX, q);
  const r = (a: number, b: number) => (a / b).toFixed(2) + 'x';
  console.log(
    `${String(q).padEnd(10)} ${f.atk.toFixed(0).padStart(6)} ${r(f.atk, base15.atk).padStart(6)} ${f.def.toFixed(0).padStart(8)} ${r(f.def, base15.def).padStart(6)} ${f.hp.toFixed(0).padStart(8)} ${r(f.hp, base15.hp).padStart(6)} ${f.mp.toFixed(0).padStart(8)} ${(f.crit * 100).toFixed(1).padStart(8)}% ${r(f.dmg, dmg0).padStart(8)}`,
  );
}

console.log('\nThu nhập kỳ vọng mỗi lần hạ quái (linh thạch): vàng rơi + bán trang bị rơi (giá theo ilvl, phẩm)');
const seenIncome = new Set<string>();
for (const sp of Object.values(LEVELS).filter((l) => l.id === 'van_lam' || l.id === 'doan_mach').flatMap((l) => levelSpawns(l))) {
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
  console.log(`${m.id.padEnd(24)} vàng ${gold.toFixed(1).padStart(6)}  bán đồ ${(gear / N).toFixed(1).padStart(6)}  (${((gear / N / gold) * 100).toFixed(0)}% so với vàng)`);
}
console.log('\nTinh anh (người cùng cấp): TTK Kiếm/Hộ/Đan không đồ | bộ Huyền phẩm; máu/s đứng yên (bộ Huyền phẩm), máu mất cả trận (đứng yên, Kiếm tu)');
for (const m of MONSTERS_ELITE()) {
  const sp = Object.values(LEVELS).flatMap((l) => levelSpawns(l)).find((x) => x.mon === m.id);
  if (!sp) continue;
  const lv = sp.levelMax;
  const ms = monsterStats(lv, m.hpMul, m.atkMul);
  const set = fullSet(lv, 2);
  const t0 = METHOD_IDS.map((id) => ms.hp / playerDps(lv, playerM(lv, id).atk, ms.def, id, m.elem));
  const t1 = METHOD_IDS.map((id) => ms.hp / playerDps(lv, set.atk, ms.def, id, m.elem));
  const inc = monsterDps(m, ms.atk, set.def);
  console.log(`${(m.id + ' (' + lv + ')').padEnd(26)} ${t0.map((x) => x.toFixed(0).padStart(3) + 's').join('/')} | ${t1.map((x) => x.toFixed(0).padStart(3) + 's').join('/')}   ${pct(inc / set.hp).padStart(4)}   cả trận ${pct((inc * t1[0]) / set.hp)}`);
  for (const x of t0) if (x < 20 || x > 40) { console.error(`LỖI: ${m.id} TTK không đồ ${x.toFixed(0)}s ngoài 20–40 s`); process.exitCode = 1; }
}
function MONSTERS_ELITE(): MonsterDef[] {
  return [...MONSTER.values()].filter((m) => m.elite);
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
      E[p] = c.gold + c.ore * orePrice + (risk && ward ? WARD_VALUE * (1 - ok) : 0) + ok * E[p + 1] + (1 - ok) * E[failTo];
    }
  }
  return E[0];
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
  return perKill * (kills / (main.secByLevel[level] / 3600));
}

console.log('\nCường hóa vũ khí: linh thạch kỳ vọng từ +0 (Thiết Tinh tính theo giá mua; không Hộ Phù | có Hộ Phù) và số giờ thu nhập cấp tương ứng');
console.log('món (cấp)                 giá cơ sở  thu/giờ    +5            +7            +9                 +10');
for (const [id, lv] of [['itm_thiet_kiem', 4], ['itm_thanh_phong_kiem', 8], ['itm_han_quang_kiem', 12], ['itm_tram_ta_kiem', 15]] as const) {
  const d = ITEM.get(id)!;
  const price = Math.max(d.price, d.sell * 3);
  const inc = incomePerHour(lv);
  const f = (t: number, w: boolean) => enhanceExpect(t, price, w);
  const h = (g: number) => (g / inc).toFixed(1) + 'h';
  console.log(
    `${(id + ' (' + lv + ')').padEnd(26)} ${String(price).padStart(6)} ${inc.toFixed(0).padStart(8)}  ${f(5, false).toFixed(0).padStart(6)} (${h(f(5, false)).padStart(5)})  ${f(7, false).toFixed(0).padStart(6)} (${h(f(7, false)).padStart(5)})  ${f(9, false).toFixed(0).padStart(6)}|${f(9, true).toFixed(0).padStart(6)} (${h(f(9, true)).padStart(5)})  ${f(10, true).toFixed(0).padStart(6)} (${h(f(10, true)).padStart(5)})`,
  );
  // Mục tiêu 3-10: +5 trong ~1 giờ thu nhập, +9 (có Hộ Phù) 2–7 giờ, +10 không quá 14 giờ.
  if (f(5, false) / inc > 1.2) { console.error(`LỖI: ${id} +5 tốn ${h(f(5, false))} thu nhập (quá đắt)`); process.exitCode = 1; }
  if (f(9, true) / inc < 2 || f(9, true) / inc > 7) { console.error(`LỖI: ${id} +9 (Hộ Phù) tốn ${h(f(9, true))} thu nhập, ngoài 2–7 giờ`); process.exitCode = 1; }
  if (f(10, true) / inc > 14) { console.error(`LỖI: ${id} +10 (Hộ Phù) tốn ${h(f(10, true))} thu nhập (quá đắt)`); process.exitCode = 1; }
}
{
  // Nguồn/tiêu tới viên mãn tầng 15 (một mình).
  const quest = QUESTS.reduce((n, q) => n + (q.rewards.gold ?? 0), 0);
  let sold = 0;
  for (let l = 1; l <= NGUNG_KHI_MAX; l++) {
    const sp = pickSpawn(l);
    const lt = lootOf(MONSTER.get(sp.mon)!.id);
    const mlv = Math.min(sp.levelMax, Math.max(sp.levelMin, l));
    const rng = seededRng(11 + l);
    let g = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) for (const d of rollEquipDrops(lt.equip, ITEM_SYS, ITEMS, mlv, rng)) g += sellPrice({ id: d.id, n: 1, inst: { q: d.q, ilvl: d.ilvl, main: {}, affixes: [], gems: [], bound: false } }, ITEM.get(d.id)!);
    sold += (g / N) * main.killsByLevel[l];
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
  if (source < shop + 4 * skill3) { console.error('LỖI: nguồn linh thạch tới tầng 15 không đủ đồ thiết yếu và 4 chiêu cấp 3'); process.exitCode = 1; }
  if (source > shop + 4 * skill3 + 8 * skill5 + enh) { console.error('LỖI: nguồn linh thạch tới tầng 15 vượt mọi chỗ tiêu (lạm phát)'); process.exitCode = 1; }
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
  if (aimDmg + chip < 1.2) { console.error('LỖI: độ kiếp đứng yên không chết (quá dễ)'); process.exitCode = 1; }
  if (noTools < 1.0) { console.error('LỖI: độ kiếp không cần chống đỡ tia cuối cũng qua (quá dễ)'); process.exitCode = 1; }
  if (noTools - shield > 0.9) { console.error('LỖI: độ kiếp có Hộ Thể vẫn chết gần chắc (quá khó)'); process.exitCode = 1; }
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
  ['boss_dia_mach_long', 19, 4],
] as const) {
  const def = MONSTER.get(id)!;
  const ms = monsterStats(lv, def.hpMul, def.atkMul);
  const pl = player(lv);
  // Nhóm: 1 hộ pháp + 1 đan sư + (n−2) kiếm tu.
  const grp = [...Array(Math.max(0, n - 2)).fill('lac_kiem_quyet'), 'bat_dong_kim_than', 'thanh_moc_dan_kinh'].reduce((sum: number, id) => sum + playerDps(lv, pl.atk, ms.def, id as MethodId, def.elem), 0);
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

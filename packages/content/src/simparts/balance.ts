// Tách từ sim.ts (tối ưu Đợt E): balance.
import { levelSpawns, type MonsterDef, type Quality } from '@dtl/shared';
import {
  promoteGold,
  TIER_INCOME_HOUR,
  enhanceChance,
  enhanceCost,
  ENHANCE_RISK_FROM,
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
  computePlayerStats,
  rollItemInstance,
  seededRng,
  droppableSlots,
  rollEquipDrops,
  sellPrice,
  templatesFor,
  INTERRUPT_VULN_MUL,
  monsterStats,
  phaseRules,
  NGUNG_KHI_MAX,
  MAX_SKILL_LEVEL,
  skillUpgradeCost,
  playerBaseStats,
} from '@dtl/shared';
import { lootOf } from '../loot';
import { ENHANCE_ORE, FORGE, ITEM, ITEM_SYS, ITEMS, LEVELS, MONSTER, QUESTS, realmName } from '../index';

import { at } from '@dtl/shared';
import { pickSpawn, seekModel, scrollAt, goldTotal, main } from './pace1';
import { METHOD_IDS, playerM, playerDps, monsterDps, PULL_FACTOR, selfSustain, pct, METHOD_NAME, player, hit, MethodId } from './common';

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
export function fullSet(level: number, q: Quality) {
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
export function enhanceExpect(target: number, price: number, ward: boolean): number {
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
export const dgFirstMin = new Map<string, number>();
console.log('\nPhó bản (nhóm 4 × cấp thấp nhất)   đợt   sạch thuần   kể cả lỡ tay lần đầu   (mục tiêu ~20 phút, thiết kế 5.1)');
for (const lv of Object.values(LEVELS)) {
  const d = lv.dungeon;
  if (!d || lv.tribulation || !d.waves.length) continue;
  // Phòng cầu toàn đợt Kiếm Ảnh không có quái nào: lấy cấp vào cầu làm cấp thiết kế.
  const mlv = d.waves.flatMap((w) => w.mons.map((m) => m.level));
  const L = mlv.length ? Math.min(...mlv) : d.minLevel;
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
    // Đợt Kiếm Ảnh (TN-7, cầu 2): bóng của chính người chơi (khí huyết = hpMul × khí huyết chủ, giáp = 40% giáp chủ); mỗi người đánh bóng riêng song song,
    // nên thời gian là của một người, không chia cho nhóm. Hiệu suất như đánh boss (phải né vùng nổ định kỳ).
    if (w.shadow) {
      const dps = playerDps(L, pl.atk, Math.round(pl.def * 0.4), 'lac_kiem_quyet') * DG_EFF_BOSS;
      const tp = (w.delay ?? 6) + (pl.hp * w.shadow.hpMul) / dps;
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
      // Hai mặt (TN-3): mặt Âm miễn sát thương (`take` còn lọt), chỉ đánh được trong cửa sổ Dương.
      const fc = boss.ai?.faces;
      if (fc) dps *= (fc.duong + fc.am * fc.take) / (fc.duong + fc.am);
      // Giáp phá theo chu kỳ (TN-7, cầu 5): đội dồn đòn vào cửa sổ phá giáp; ngoài cửa sổ vẫn đánh nhưng nhận `take`.
      const ar = boss.ai?.armor;
      if (ar) dps *= (ar.take * (ar.cycle - ar.window) + ar.window) / ar.cycle;
      // Kháng nguồn (TN-7, cầu 6): nhóm bốn người đủ Bản Nguyên khác nhau; trung bình theo năm hệ (1 cùng hệ, 1 khắc hệ, 3 trung tính).
      const rs = boss.ai?.resist;
      if (rs) dps *= (rs.same + rs.counter + 3) / 5;
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

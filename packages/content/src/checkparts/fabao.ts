// Tách từ check.ts (tối ưu Đợt E): fabao.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_LEVEL, xpNeed } from '@dtl/shared';
import {
  thanThongSkill,
  ARTIFACTS,
  PILL_QUALITY,
  OUTFITS,
  APPEARANCE,
  GLOSSARY,
  ITEM,
  ITEMS,
  LEVELS,
  MONSTER,
  MONSTERS,
  NPC,
  POSES,
  QUEST,
  QUESTS,
  RECIPES,
  MARK,
  PATHS,
  METHODS,
  t,
} from '../index';
import {
  PILL_TIERS,
  ARTIFACT_MAX_LEVEL,
  PILL_BUFF_KINDS,
  BONDED_ARTIFACT_ID,
  BONDED_UNLOCK_LEVEL,
  bondedLevel,
  spiritRadius,
  SPIRIT_UNLOCK_LEVEL,
} from '@dtl/shared';
import { PLACE_ID, PLACES } from '../places';
import { TELE_PAD, terrainOf, questSpot, inPoly } from '@dtl/shared';

import { at } from '@dtl/shared';
import { uniqueIds, err, ALL_SKILLS } from './base';
import { needStr } from './palette';
// ---- Pháp bảo phụ và đan (P3-8) ----
uniqueIds('artifact', ARTIFACTS);
for (const a of ARTIFACTS) {
  const w = `pháp bảo ${a.id}`;
  const def = ITEM.get(a.id);
  if (!def || def.kind !== 'artifact') err(`${w}: vật phẩm phải có kind artifact`);
  // `proc`: chưa có GLB, client dựng mesh thủ tục theo id asset; khi có meta.json của asset thì phải bỏ cờ.
  const hasMeta = fs.existsSync(fileURLToPath(new URL(`../../../../assets/source/prop/${a.asset}/meta.json`, import.meta.url)));
  if (!a.proc && !hasMeta) err(`${w}: thiếu assets/source/prop/${a.asset}/meta.json`);
  if (a.proc && hasMeta) err(`${w}: đã có asset ${a.asset}, bỏ cờ proc`);
  if (a.passive.kind === 'soul' && !METHODS.some((m) => m.resource.id === a.passive.res))
    err(`${w}: nội tại soul phải khai passive.res là tài nguyên riêng của một công pháp`);
  if (a.passive.kind !== 'soul' && a.passive.res !== undefined) err(`${w}: passive.res chỉ dùng với nội tại soul`);
  if (a.kind === 'reap' && !(a.reap && MARK.get(a.reap.mark)?.on === 'mon' && a.reap.res > 0))
    err(`${w}: reap cần ấn trên quái và res dương`);
  if (a.granted) {
    if (def && def.sell !== 0) err(`${w}: vật phát khi lĩnh ngộ không bán được (sell 0)`);
    if (!PATHS.some((p) => p.unlock?.grant === a.id)) err(`${w}: granted nhưng không hướng tu nào phát`);
  }
  for (const k of [
    `item.${a.id}.name`,
    `item.${a.id}.desc`,
    `art.${a.id}.skill`,
    `art.${a.id}.skill.desc`,
    `art.passive.${a.passive.kind}`,
  ])
    needStr(k);
  if (t(`item.${a.id}.name`) !== (GLOSSARY.artifacts as Record<string, string>)[a.id]) err(`${w}: tên lệch glossary.artifacts`);
  if (!(a.cd > 0) || !(a.radius > 0) || !(a.power > 0)) err(`${w}: cd, radius, power phải > 0`);
  if (a.passive.per * ARTIFACT_MAX_LEVEL > 0.3) err(`${w}: nội tại cấp tối đa quá 30%`);
  if (!a.bonded && !a.granted && !RECIPES.some((r) => r.output.id === a.id)) err(`${w}: không có công thức chế`);
  if ((a.bonded || a.granted) && RECIPES.some((r) => r.output.id === a.id)) err(`${w}: bản mệnh pháp bảo tự có, không có công thức chế`);
}
for (const k of ['drain', 'seal', 'shield', 'heal', 'reap']) if (!ARTIFACTS.some((a) => a.kind === k)) err(`thiếu pháp bảo loại ${k}`);
// Bản mệnh pháp bảo (E2-E): đúng một cái là Ngưng Đan Lô.
{
  const bonded = ARTIFACTS.filter((a) => a.bonded);
  if (bonded.length !== 1 || at(bonded, 0).id !== BONDED_ARTIFACT_ID) err(`bản mệnh pháp bảo: phải đúng một, id ${BONDED_ARTIFACT_ID}`);
  if (ITEM.get(BONDED_ARTIFACT_ID)?.reqLevel !== BONDED_UNLOCK_LEVEL) err('Ngưng Đan Lô: reqLevel phải bằng BONDED_UNLOCK_LEVEL');
  if (bondedLevel(BONDED_UNLOCK_LEVEL - 1) !== 0 || bondedLevel(BONDED_UNLOCK_LEVEL) !== 1 || bondedLevel(999) !== ARTIFACT_MAX_LEVEL)
    err('bondedLevel: lệch khoảng 0..ARTIFACT_MAX_LEVEL');
  if (spiritRadius(SPIRIT_UNLOCK_LEVEL) !== 60 || spiritRadius(21) !== 80 || spiritRadius(28) !== 120)
    err('spiritRadius: phải 60 / 80 / 120 theo thiết kế (Kết Đan sơ/trung, Hóa Thần)');
  for (const m of METHODS)
    if (m.late && !(Number.isInteger(m.late.level) && m.late.level >= 16 && m.late.dmgMul >= 0.7 && m.late.dmgMul <= 1))
      err(`công pháp ${m.id}: late phải có level nguyên ≥ 16 và dmgMul trong 0,7–1`);
  for (const m of METHODS)
    if (thanThongSkill(m.id)?.unlock !== SPIRIT_UNLOCK_LEVEL)
      err(`công pháp ${m.id}: thiếu thần thông ô 9 (chiêu mở ở cấp ${SPIRIT_UNLOCK_LEVEL}, không khóa)`);
  for (const k of [
    'sys.spirit_locked',
    'sys.spirit_cd',
    'sys.spirit_busy',
    'sys.spirit_start',
    'sys.spirit_cancel',
    'sys.spirit_moved',
    'sys.spirit_done',
    'sys.spirit_none',
    'sys.bonded_locked',
    'ui.spirit.title',
    'ui.spirit.desc',
    'ui.bonded.title',
    'ui.spirit.kind.boss',
    'ui.spirit.kind.elite',
    'ui.spirit.kind.mon',
    'ui.spirit.kind.node',
    'ui.spirit.kind.player',
    'ui.spirit.kind.poi',
    'ui.spirit.scanning',
  ])
    needStr(k);
}
if (new Set(ARTIFACTS.map((a) => a.skill)).size !== ARTIFACTS.length) err('hai pháp bảo dùng chung khóa hồi chiêu');
for (const k of ['base', 'support', 'potency'] as const)
  if (PILL_QUALITY[k].length !== PILL_TIERS) err(`alchemy.quality.${k} cần ${PILL_TIERS} phần tử`);
for (const k of ['base', 'support'] as const)
  if (Math.abs(PILL_QUALITY[k].reduce((a, b) => a + b, 0) - 1) > 1e-6) err(`alchemy.quality.${k} phải cộng bằng 1`);
if (PILL_QUALITY.potency.some((x, i) => i > 0 && x < at(PILL_QUALITY.potency, i - 1)))
  err('alchemy.quality.potency phải không giảm theo phẩm');
if (PILL_QUALITY.potency.some((x) => x > 1.6)) err('alchemy.quality.potency quá 1,6 (phá nhịp lên cấp)');
GLOSSARY.pillQualities.forEach((nm, i) => {
  if (t(`ui.pill.q${i}`) !== nm) err(`phẩm đan ${i}: tên lệch glossary.pillQualities`);
});
for (const it of ITEMS) {
  const b = it.use?.buff;
  if (!b) continue;
  if (!PILL_BUFF_KINDS.includes(b.kind)) err(`${it.id}: loại buff ${b.kind} lạ`);
  // `ward` (Định Thần Phù, E3-M) là bùa ngắn mạnh: ≤ 50%, ≤ 60 giây.
  const ward = b.kind === 'ward';
  if (!(b.pct > 0 && b.pct <= (ward ? 0.5 : 0.2)) || !(b.sec > 0 && b.sec <= (ward ? 60 : 900)))
    err(`${it.id}: buff ngoài khoảng (pct ≤ 20%, ≤ 15 phút; bùa ward ≤ 50%, ≤ 60 giây)`);
  if (t(`item.${it.id}.name`) !== (GLOSSARY.pills as Record<string, string>)[it.id]) err(`${it.id}: tên lệch glossary.pills`);
  if (!RECIPES.some((r) => r.output.id === it.id)) err(`${it.id}: không có công thức luyện`);
}
for (const r of RECIPES) {
  if (r.quality && ITEM.get(r.output.id)?.kind !== 'consumable') err(`${r.id}: chỉ đan (consumable) mới có phẩm chất`);
  if (r.reqLevel !== undefined && !(r.reqLevel >= 1 && r.reqLevel <= MAX_LEVEL)) err(`${r.id}: reqLevel ngoài khoảng`);
}

// Điểm đặt tên cho ?at= / `/gm tp <id>` (chỉ server đọc).
uniqueIds('place', PLACES);
for (const pl of PLACES) {
  if (!PLACE_ID.test(pl.id)) err(`place ${pl.id}: id chỉ gồm a-z 0-9 _ (tối đa 24)`);
  if (!LEVELS[pl.level]) err(`place ${pl.id}: level không tồn tại ${pl.level}`);
  if (
    !Number.isFinite(pl.x) ||
    !Number.isFinite(pl.z) ||
    !Number.isFinite(LEVELS[pl.level] ? terrainOf(pl.level).groundAt(pl.x, pl.z) : NaN)
  )
    err(`place ${pl.id}: tọa độ ngoài bản đồ`);
}

let total = 0;
for (let l = 1; l <= 15; l++) total += xpNeed(l);
console.log(`Tổng tu vi Ngưng Khí 1 → viên mãn tầng 15: ${total}`);
{
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => xpNeed(a + i)).reduce((x, y) => x + y, 0);
  console.log(`Tu vi Trúc Cơ 16–19: ${span(16, 19)}, Kết Đan 20–23: ${span(20, 23)}, Nguyên Anh 24–27: ${span(24, 27)}`);
}
console.log(
  `${ITEMS.length} vật phẩm, ${MONSTERS.length} quái, ${ALL_SKILLS.length} skill (${METHODS.length} công pháp), ${QUESTS.length} nhiệm vụ, ${RECIPES.length} công thức, ${POSES.length} pose, ${APPEARANCE.dyes.length} màu áo`,
);

// E2-H: điểm phụ (`spots`), người đồng hành (`escorts`) và NPC trạm theo glossary.
{
  const glossSpots = GLOSSARY.spots as Record<string, string>;
  const glossNpc = GLOSSARY.stationNpcs as Record<string, string>;
  for (const lv of Object.values(LEVELS)) {
    const zones = lv.zones ?? [];
    for (const sp of lv.spots ?? []) {
      needStr(`spot.${sp.id}.name`);
      if (t(`spot.${sp.id}.name`) !== glossSpots[sp.id]) err(`level ${lv.id}: spot ${sp.id} lệch glossary.spots`);
      const zn = zones.find((z) => z.id === sp.zone);
      if (!zn || !inPoly(zn.poly, sp.x, sp.z)) err(`level ${lv.id}: spot ${sp.id} không nằm trong vùng ${sp.zone}`);
    }
    for (const e of lv.escorts ?? []) {
      needStr(`npc.${e.npc}.name`);
      if (e.path.length < 2) err(`level ${lv.id}: escort ${e.id} cần ≥ 2 điểm`);
      if (!(e.speed > 0 && e.speed <= 6)) err(`level ${lv.id}: escort ${e.id} tốc độ ${e.speed} ngoài (0; 6] m/s`);
      if (NPC.has(e.npc)) err(`level ${lv.id}: escort ${e.id} dùng npc ${e.npc} đang là NPC đứng thật (cần id riêng)`);
    }
  }
  for (const id of Object.keys(glossNpc)) {
    if (!NPC.has(id) && !Object.values(LEVELS).some((lv) => lv.escorts?.some((e) => e.npc === id)))
      err(`glossary.stationNpcs có ${id} nhưng không có NPC/escort`);
    if (t(`npc.${id}.name`) !== glossNpc[id]) err(`npc ${id}: tên lệch glossary.stationNpcs`);
  }
  for (const id of ['npc_to_van_ngu', 'npc_khieu_han_son', 'npc_lam_chieu_dung', 'npc_to_van_ngu_hai']) {
    const n = NPC.get(id);
    if (!n) err(`thiếu NPC ${id}`);
    else if (!LEVELS[n.level ?? 'van_lam']) err(`npc ${id}: level không tồn tại`);
  }
  // Chuỗi chương 2: q2_* nối đuôi nhau, không đứt (mỗi nhiệm vụ trừ đầu chương đều `requires` một nhiệm vụ có thật).
  for (const q of QUESTS)
    if (q.id.startsWith('q2_') && q.id !== 'q2_thu_ha_son' && !q.requires?.startsWith('q2_'))
      err(`quest ${q.id}: chuỗi chương 2 phải requires một q2_*`);
  // Bộ có trang phục riêng (N-7: hình là model v3; áo mô-đun đã gỡ nên không còn kiểm meta nguồn từng mảnh).
  for (const [set, parts] of Object.entries(OUTFITS)) {
    if (!parts.length) err(`outfits.json: bộ ${set} không có mảnh`);
  }
}
// Chuỗi chương 3 (E3-H): q3_* nối đuôi từ q2_ket_dan tới q3_nguyen_anh; phụ s3_* nhận sau khi vào chương; mọi nhiệm vụ nhận ở NPC có thật.
{
  const main3 = [
    'q3_len_may',
    'q3_van_hac',
    'q3_than_thuc',
    'q3_kinh_linh',
    'q3_thach_quy',
    'q3_loi_van',
    'q3_kinh_nguyet',
    'q3_kinh_vuong',
    'q3_nguyen_anh',
  ];
  main3.forEach((id, i) => {
    const q = QUEST.get(id);
    if (!q) return err(`thiếu nhiệm vụ chính chương 3 ${id}`);
    const want = i === 0 ? 'q2_ket_dan' : main3[i - 1];
    if (q.requires !== want) err(`quest ${id}: phải requires ${want}`);
  });
  for (const q of QUESTS)
    if (q.id.startsWith('s3_') && !q.requires?.startsWith('q3_')) err(`quest ${q.id}: phụ chương 3 phải requires một q3_*`);
  const first = QUEST.get('q3_len_may');
  if (first && !(first.unlockTele ?? []).includes('vh_tp_hub')) err('q3_len_may phải mở trận vh_tp_hub (unlockTele)');
  const na = QUEST.get('q3_nguyen_anh');
  if (na && (na.giver !== 'npc_lam_chieu_dung' || na.turnin !== 'npc_lam_chieu_dung'))
    err('q3_nguyen_anh phải giao và trả ở npc_lam_chieu_dung');
  if (na && !na.objectives.some((o) => o.type === 'breakthrough' && o.target === 'nguyen_anh'))
    err('q3_nguyen_anh phải có mục tiêu breakthrough nguyen_anh');
}

// Chuỗi chương 4 (E4-H): q4_* nối đuôi từ q3_nguyen_anh tới q4_hoa_than; phụ s4_* nhận sau khi vào chương; mục tiêu chỉ vào điểm/quái có thật.
{
  const main4 = [
    'q4_bac_len',
    'q4_thach_tuong',
    'q4_da_minh',
    'q4_xuat_khieu',
    'q4_chien_ma',
    'q4_thu_linh',
    'q4_than_tang',
    'q4_tra_mach',
    'q4_hoa_than',
  ];
  main4.forEach((id, i) => {
    const q = QUEST.get(id);
    if (!q) return err(`thiếu nhiệm vụ chính chương 4 ${id}`);
    const want = i === 0 ? 'q3_nguyen_anh' : main4[i - 1];
    if (q.requires !== want) err(`quest ${id}: phải requires ${want}`);
  });
  for (const q of QUESTS)
    if (q.id.startsWith('s4_') && !q.requires?.startsWith('q4_')) err(`quest ${q.id}: phụ chương 4 phải requires một q4_*`);
  const first = QUEST.get('q4_bac_len');
  if (first && !(first.unlockTele ?? []).includes('tk_tp_tram')) err('q4_bac_len phải mở trận tk_tp_tram (unlockTele)');
  const hn = QUEST.get('q4_hoa_than');
  if (hn && !hn.objectives.some((o) => o.type === 'breakthrough' && o.target === 'hoa_than'))
    err('q4_hoa_than phải có mục tiêu breakthrough hoa_than');
  const tk = at(LEVELS, 'thien_khuyet');
  for (const q of QUESTS) {
    if (!q.id.startsWith('q4_') && !q.id.startsWith('s4_')) continue;
    for (const o of q.objectives) {
      if (
        (o.type === 'touch' || o.type === 'scan') &&
        !tk.pois?.some((p) => p.id === o.target) &&
        !tk.spots?.some((p) => p.id === o.target)
      )
        err(`quest ${q.id}: điểm ${o.target} không có ở thien_khuyet`);
      if (o.type === 'escort' && !tk.escorts?.some((e) => e.id === o.target))
        err(`quest ${q.id}: escort ${o.target} không có ở thien_khuyet`);
      if (o.type === 'scan' && !tk.pois?.some((p) => p.id === o.target))
        err(`quest ${q.id}: scan ${o.target} phải là poi (spots không hiện trong bản quét)`);
    }
  }
}

// Chuỗi chương 5 (DV3-H): q5_* nối đuôi từ q4_hoa_than; phụ s5_* requires một q5_*; trận mở bằng nhiệm vụ phải kiểm cấp theo level đích.
{
  const main5 = [
    'q5_bac_hanh',
    'q5_tro_lanh',
    'q5_then_cai',
    'q5_cot_loc',
    'q5_nguc_khuyen',
    'q5_qua_khich',
    'q5_xich_tan',
    'q5_tinh_quang',
    'q5_thu_khich',
    'q5_kim_da',
    'q5_ngu_bia',
    'q5_anh_bien',
  ];
  main5.forEach((id, i) => {
    const q = QUEST.get(id);
    if (!q) return err(`thiếu nhiệm vụ chính chương 5 ${id}`);
    const want = i === 0 ? 'q4_hoa_than' : main5[i - 1];
    if (q.requires !== want) err(`quest ${id}: phải requires ${want}`);
    if (i > 0 && (q.minLevel ?? 1) < (QUEST.get(at(main5, i - 1))!.minLevel ?? 1)) err(`quest ${id}: minLevel thấp hơn nhiệm vụ trước`);
  });
  for (const q of QUESTS)
    if (q.id.startsWith('s5_') && !q.requires?.startsWith('q5_')) err(`quest ${q.id}: phụ chương 5 phải requires một q5_*`);
  const first = QUEST.get('q5_bac_hanh');
  if (first && !(first.unlockTele ?? []).includes('bh_tp_tram')) err('q5_bac_hanh phải mở trận bh_tp_tram (unlockTele)');
  const an = QUEST.get('q5_anh_bien');
  if (an && !an.objectives.some((o) => o.type === 'breakthrough' && o.target === 'anh_bien'))
    err('q5_anh_bien phải có mục tiêu breakthrough anh_bien');
  // Server kiểm minLevel của level lúc cấp vé (#213): nhiệm vụ mở trận không được cho nhận sớm hơn cấp vào level đích.
  for (const q of QUESTS) {
    for (const id of q.unlockTele ?? []) {
      const need = LEVELS[TELE_PAD.get(id)?.level ?? '']?.minLevel ?? 1;
      if ((q.minLevel ?? 1) < need) err(`quest ${q.id}: mở trận ${id} (level cần cấp ${need}) nhưng minLevel chỉ ${q.minLevel ?? 1}`);
    }
  }
  const bh = at(LEVELS, 'bac_hoang');
  const known = new Set(['npc_to_van_ngu_tk']);
  for (const q of QUESTS) {
    if (!q.id.startsWith('q5_') && !q.id.startsWith('s5_')) continue;
    for (const n of [q.giver, q.turnin])
      if (!known.has(n) && NPC.get(n)?.level !== 'bac_hoang') err(`quest ${q.id}: NPC ${n} phải đứng ở bac_hoang`);
    for (const o of q.objectives) {
      if ((o.type === 'touch' || o.type === 'scan') && !questSpot(bh, o.target))
        err(`quest ${q.id}: điểm ${o.target} không có ở bac_hoang`);
      if (o.type === 'scan' && !bh.pois?.some((p) => p.id === o.target)) err(`quest ${q.id}: scan ${o.target} phải là poi`);
      if (o.type === 'escort' && !bh.escorts?.some((e) => e.id === o.target)) err(`quest ${q.id}: escort ${o.target} không có ở bac_hoang`);
      if (o.type === 'kill' && MONSTER.has(o.target ?? '') && ![...(bh.camps ?? []), ...(bh.spawns ?? [])].some((c) => c.mon === o.target))
        err(`quest ${q.id}: quái ${o.target} không có trên bản đồ bac_hoang`);
    }
  }
}

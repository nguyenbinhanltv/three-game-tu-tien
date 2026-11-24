// Tách từ check.ts (tối ưu Đợt E): linhcan.
import { existsSync } from 'node:fs';

import { MAX_LEVEL, TRUC_CO_LEVEL, majorRealmOf, ROOT_IDS, PHA_CANH_PILL, BOTTLENECK_LEVELS, ELEMENTS, xpNeed } from '@dtl/shared';
import { LEVEL_ASSETS, GLOSSARY, ITEM, LEVELS, MONSTER, MONSTERS, NPC, NPCS, REALMS, RECIPES, ROOTS, ORIGINS, SKILLS, t } from '../index';
import { originErrors, ORIGIN_GROUPS } from '@dtl/shared';
import { checkLevel } from '../levelcheck';

import { at } from '@dtl/shared';
import { err } from './base';
import { needStr, needItem } from './palette';
// ---- linh căn ngũ hành và bình cảnh (P3-7) ----
// TN-1: 14 Bản Nguyên (origins.json). Nguồn người chơi mang (`ROOT_IDS`) đứng đầu bảng; nguồn khóa chưa có thưởng.
for (const e of originErrors(ORIGINS, ELEMENTS, ROOT_IDS)) err(e);
if (ROOTS.map((r) => r.id).join() !== ROOT_IDS.join())
  err(`origins.json phải có đủ các nguồn người chơi mang theo thứ tự ${ROOT_IDS.join(', ')}`);
{
  const gl = GLOSSARY.origins as Record<string, Record<string, string>>;
  const glGroups = GLOSSARY.originGroups as Record<string, string>;
  for (const g of ORIGIN_GROUPS) {
    needStr(`origin.group.${g}`);
    if (t(`origin.group.${g}`) !== glGroups[g]) err(`origin.group.${g}: tên lệch glossary.originGroups`);
    const have = ORIGINS.filter((o) => o.group === g).map((o) => o.id);
    if (have.join() !== Object.keys(gl[g] ?? {}).join())
      err(`origins.json nhóm ${g}: phải khớp glossary.origins.${g} (${Object.keys(gl[g] ?? {}).join(', ')})`);
  }
  for (const o of ORIGINS) {
    needStr(`origin.${o.id}.name`);
    needStr(`origin.${o.id}.desc`);
    if (t(`origin.${o.id}.name`) !== gl[o.group]?.[o.id]) err(`origin ${o.id}: tên lệch glossary.origins`);
  }
}
for (const r of ROOTS) {
  needStr(`root.${r.id}.desc`);
  needStr(`elem.${r.id}`);
}
for (const s of SKILLS)
  if (s.elem !== undefined && !(ELEMENTS as readonly string[]).includes(s.elem)) err(`skill ${s.id}: elem ${s.elem} không hợp lệ`);
for (const m of MONSTERS)
  if (m.elem !== undefined && !(ELEMENTS as readonly string[]).includes(m.elem)) err(`quái ${m.id}: elem ${m.elem} không hợp lệ`);
// Mỗi tinh anh/boss có hệ (khắc chế ngũ hành, 3-10): người chơi cần đọc được hệ để chọn chiêu.
for (const m of MONSTERS) if ((m.elite || m.boss) && !m.elem) err(`quái ${m.id}: tinh anh/boss phải có elem`);
needItem(PHA_CANH_PILL, 'Phá Cảnh Đan');
if (ITEM.get(PHA_CANH_PILL)?.use) err('Phá Cảnh Đan không có `use`: chỉ dùng qua bình cảnh (server)');
if (!RECIPES.some((r) => r.output.id === PHA_CANH_PILL)) err('thiếu công thức luyện Phá Cảnh Đan');
if (BOTTLENECK_LEVELS.join() !== '5,10,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43')
  err('bình cảnh phải ở cấp 5, 10, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43');
// Thang cảnh giới (E1-C): realms.json đủ 1…MAX_LEVEL, tên đúng đại cảnh giới của glossary, xpNeed tăng đều, hệ số cảnh giới tăng.
if (REALMS.length !== MAX_LEVEL) err(`realms.json phải có ${MAX_LEVEL} cấp (đang ${REALMS.length})`);
REALMS.forEach((r, i) => {
  if (r.level !== i + 1) err(`realms.json: cấp thứ ${i + 1} ghi level ${r.level}`);
  if (r.key !== `realm.${r.level}`) err(`realms.json: cấp ${r.level} key ${r.key}`);
  const major = GLOSSARY.realms[majorRealmOf(r.level)] ?? '';
  if (!t(r.key).startsWith(major)) err(`${r.key}: tên "${t(r.key)}" phải bắt đầu bằng đại cảnh giới "${major}" của glossary`);
  if (
    r.level > TRUC_CO_LEVEL &&
    r.level < MAX_LEVEL &&
    xpNeed(r.level) <= xpNeed(r.level - 1) &&
    majorRealmOf(r.level) === majorRealmOf(r.level - 1)
  )
    err(`xpNeed(${r.level}) phải lớn hơn cấp trước`);
});
if (!t(`realm.${MAX_LEVEL}`).startsWith('Dương Thực') || !t(`realm.${MAX_LEVEL}`).endsWith('đại viên mãn'))
  err('cấp tối đa (TN-7) là Dương Thực đại viên mãn');
if (!MONSTER.has('mon_tam_ma')) err('thiếu quái mon_tam_ma (bóng tâm ma của thử thách bình cảnh)');
if (!NPCS.some((n) => n.rootChange)) err('không NPC nào đổi linh căn');
for (const n of NPCS) if (n.rootChange) needStr(`npc.${n.id}.root`);
// Mọi level (E1-G): bố cục, camp, tinh anh, spawn, trận truyền tống, id quái/prop — xem levelcheck.ts.
for (const lv of Object.values(LEVELS)) for (const m of checkLevel(lv)) err(m);
// E1-D: mỗi level khai báo asset client (levels/<id>.assets.json): mood hợp lệ, bài nhạc có tên, minimap có nền nếu khai báo.
for (const lv of Object.values(LEVELS)) {
  const as = LEVEL_ASSETS[lv.id];
  if (!as) err(`level ${lv.id}: thiếu levels/${lv.id}.assets.json`);
  else {
    const known = [
      'sect',
      'wild',
      'wild_ochre',
      'wild_cloud',
      'wild_night',
      'wild_ash',
      'wild_rift',
      'forest',
      'lake',
      'dungeon',
      'dungeon_boss',
      'dungeon_rift',
      'dungeon_rift_boss',
      'combat',
      'boss',
      'tribulation',
      'meditate',
    ];
    for (const m of as.music) if (!known.includes(m)) err(`level ${lv.id}: assets.music không biết bài ${m}`);
    if (
      ![
        'default',
        'dawn',
        'day',
        'night',
        'ochre',
        'ochre_night',
        'cloud_dawn',
        'cloud',
        'cloud_night',
        'tk_dawn',
        'tk',
        'tk_dusk',
        'tk_night',
        'kt',
        'pm',
        'kn',
        'tt',
        'xk',
        'dk',
        'kd',
        'lk_dawn',
        'lk_day',
        'lk_dusk',
        'lk_night',
        'dm_dawn',
        'dm_day',
        'dm_dusk',
        'dm_night',
        'vh_dawn',
        'ck_dawn',
        'ckr_dawn',
        'ck_day',
        'ckr_day',
        'ck_dusk',
        'ckr_dusk',
        'ck_night',
        'ckr_night',
        'vh_day',
        'vh_dusk',
        'vh_night',
        'ash_dawn',
        'rift',
        'rift_pit',
        'bh_dawn',
        'bh_day',
        'bh_dusk',
        'bh_night',
        'bhr_dawn',
        'bhr_day',
        'bhr_dusk',
        'bhr_night',
        'vda_dawn',
        'vda_day',
        'vda_dusk',
        'vda_night',
        'vdd_dawn',
        'vdd_day',
        'vdd_dusk',
        'vdd_night',
      ].includes(as.mood)
    )
      err(`level ${lv.id}: assets.mood không hợp lệ: ${as.mood}`);
    if (as.minimap && !existsSync(new URL(`../../../../apps/client/public/map/${as.minimap}.json`, import.meta.url)))
      err(`level ${lv.id}: thiếu nền minimap public/map/${as.minimap}.json (pnpm minimap:build --level ${lv.id})`);
  }
}
for (const id of Object.keys(LEVEL_ASSETS)) if (!LEVELS[id]) err(`levels/${id}.assets.json không có level tương ứng`);
// Vân Lam: NPC giao việc ở các điểm đáng chú ý (M-5), tên theo glossary.poiNpcs.
{
  const vl = at(LEVELS, 'van_lam');
  const camps = vl.camps ?? [];
  const glossNpc = GLOSSARY.poiNpcs as Record<string, string>;
  const clearOfCamps = (x: number, z: number, margin: number) => camps.every((c) => Math.hypot(c.x - x, c.z - z) >= c.radius + margin);
  for (const id of Object.keys(glossNpc)) {
    const n = NPC.get(id);
    if (!n) {
      err(`glossary.poiNpcs có ${id} nhưng npcs.json không có`);
      continue;
    }
    if (t(`npc.${id}.name`) !== glossNpc[id]) err(`npc ${id}: tên lệch glossary.poiNpcs`);
    if (!(vl.pois ?? []).some((p) => Math.hypot(p.x - n.x, p.z - n.z) <= 10)) err(`npc ${id}: phải đứng trong 10 m quanh một poi`);
    if (!clearOfCamps(n.x, n.z, 4)) err(`npc ${id}: đứng trong bãi quái`);
  }
}

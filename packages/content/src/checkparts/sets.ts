// Tách từ check.ts (tối ưu Đợt E): sets.

import { isEquipSlot, QUALITY_COUNT } from '@dtl/shared';
import { FORGE, SETS, GLOSSARY, ITEM, ITEM_SYS, ITEMS, NPC, t } from '../index';
import { LOOT } from '../loot';

import { at } from '@dtl/shared';
import { uniqueIds, err } from './base';
import { needStr, needItem } from './palette';
// ---- bộ trang bị (P3-4) ----
{
  const LOOT_SETS = new Set<string>();
  for (const l of LOOT.values()) for (const r of l.equip ?? []) if (r.set) LOOT_SETS.add(r.set);
  const FX = [
    'phi_kiem_extra',
    'shield_boost',
    'heal_share',
    'crit_slow',
    'hoanh_kiem',
    'kim_chung',
    'moc_linh',
    'nghich_kiem',
    'dich_son',
    'ngung_dan',
    'phan_anh',
    'anh_thiet',
    'anh_duoc',
    'thuan_tram',
    'thuan_ho',
    'cuu_vien',
  ];
  const hex = /^#[0-9a-fA-F]{6}$/;
  uniqueIds('set', SETS);
  for (const st of SETS) {
    const w = `set ${st.id}`;
    needStr(`set.${st.id}.name`);
    if (t(`set.${st.id}.name`) !== (GLOSSARY.sets as Record<string, string>)[st.id]) err(`${w}: tên lệch glossary.sets`);
    if (st.pieces.length < 3 || st.pieces.length > 5) err(`${w}: bộ gồm 3-5 món`);
    const slots = new Set<string>();
    for (const pid of st.pieces) {
      const it = ITEM.get(pid);
      if (!it) {
        err(`${w}: món không tồn tại ${pid}`);
        continue;
      }
      if (it.set !== st.id) err(`${w}: ${pid} phải có set = ${st.id}`);
      if (!isEquipSlot(it.kind)) err(`${w}: ${pid} không phải trang bị`);
      if (slots.has(it.kind)) err(`${w}: hai món cùng ô ${it.kind}`);
      slots.add(it.kind);
      if (t(`item.${pid}.name`) !== (GLOSSARY.gear as Record<string, string>)[pid]) err(`${w}: tên ${pid} lệch glossary.gear`);
      needStr(`item.${pid}.desc`);
    }
    if (st.tiers.length !== 2 || at(st.tiers, 0).n !== 2 || !(at(st.tiers, 1).n > 2 && at(st.tiers, 1).n <= st.pieces.length))
      err(`${w}: cần bậc 2 món (chỉ số) và một bậc cao ≤ số món`);
    st.tiers.forEach((tr, i) => {
      if (tr.fx && !FX.includes(tr.fx)) err(`${w}: fx lạ ${tr.fx}`);
      if (tr.fx) {
        needStr(`set.fx.${tr.fx}`);
        if (!(tr.v! > 0)) err(`${w}: bậc ${i} thiếu v`);
      }
      if (!tr.fx && !tr.lines?.length) err(`${w}: bậc ${i} trống`);
      for (const l of tr.lines ?? []) {
        if (!ITEM_SYS.affixes.some((a) => a.id === l.id)) err(`${w}: dòng lạ ${l.id}`);
        if (!(l.v > 0 && l.v <= 0.25)) err(`${w}: dòng ${l.id} v ngoài (0; 0,25]`);
      }
    });
    for (const c of [st.look.hex, st.look.trim, st.look.blade]) if (!hex.test(c)) err(`${w}: màu sai ${c}`);
    if (st.src === 'forge' && !FORGE.some((f) => ITEM.get(f.output)?.set === st.id)) err(`${w}: src forge nhưng không có công thức`);
    if (st.src === 'drop' && !LOOT_SETS.has(st.id)) err(`${w}: src drop nhưng không có nguồn rơi trong loot.json`);
  }
  for (const it of ITEMS) if (it.set && !SETS.some((s) => s.id === it.set)) err(`vật phẩm ${it.id}: bộ không tồn tại ${it.set}`);
  uniqueIds('forge', FORGE);
  for (const f of FORGE) {
    const w = `forge ${f.id}`;
    const out = ITEM.get(f.output);
    if (!out?.set) err(`${w}: thành phẩm phải là món của bộ`);
    for (const n of [f.npc, ...(f.alsoAt ?? [])]) if (!NPC.get(n)?.enhance) err(`${w}: npc ${n} phải là thợ (enhance)`);
    if (f.reqLevel !== undefined && f.reqLevel !== (out ? (out.reqLevel ?? 1) : -1))
      err(`${w}: reqLevel phải bằng reqLevel của thành phẩm`);
    for (const i of f.inputs) needItem(i.id, w);
    if (f.q.length < 5 || f.q.length > QUALITY_COUNT || f.q.some((x) => !(x >= 0)) || !f.q.some((x) => x > 0)) err(`${w}: q sai`);
    if ((f.q[4] ?? 0) > 0 || (f.q[5] ?? 0) > 0 || (f.q[3] ?? 0) / (f.q.reduce((a, b) => a + b, 0) || 1) > 0.3)
      err(`${w}: chế tạo không ra Thiên/Thần phẩm, Địa phẩm ≤ 30%`);
    if (!(f.ilvl >= 1 && f.ilvl <= 99) || !(f.gold >= 0)) err(`${w}: ilvl/gold sai`);
  }
}

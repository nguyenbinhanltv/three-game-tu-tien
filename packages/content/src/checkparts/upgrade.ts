// Tách từ check.ts (tối ưu Đợt E): upgrade.

import {
  salvageYield,
  legacyQuality,
  allGemIds,
  gemId,
  parseGem,
  WARD_ITEM,
  REFINE_ITEM,
  DUST_ITEM,
  ELEMENTS,
  isEquipSlot,
} from '@dtl/shared';
import { ENHANCE_ORE, GLOSSARY, ITEM, ITEMS, NPCS, pathOf, METHODS, t } from '../index';
import { LOOT } from '../loot';

import { err } from './base';
import { needStr } from './palette';
// ---- nâng cấp trang bị (Phase 3-3): ngọc, tẩy luyện thạch, linh trần, hộ phù ----
{
  for (const id of allGemIds()) {
    const it = ITEM.get(id);
    if (!it) {
      err(`ngọc ${id}: thiếu trong items.json`);
      continue;
    }
    if (it.kind !== 'material') err(`ngọc ${id}: kind phải là material`);
    if (it.rarity !== parseGem(id)!.tier) err(`ngọc ${id}: rarity phải bằng cấp ngọc`);
  }
  for (const id of [WARD_ITEM, REFINE_ITEM, DUST_ITEM]) if (!ITEM.has(id)) err(`vật phẩm nâng cấp ${id}: thiếu trong items.json`);
  for (const id of ITEMS.map((x) => x.id)) if (id.startsWith('gem_') && !parseGem(id)) err(`ngọc ${id}: id không đúng dạng gem_<hệ>_<cấp>`);
  // Chống lỗ hổng mua-rồi-phân-giải: với mọi trang bị có bán ở NPC, nguyên liệu nhận về (tính theo giá mua Thiết Tinh) phải rẻ hơn giá mua.
  const orePrice = ITEM.get(ENHANCE_ORE)?.price ?? 0;
  for (const it of ITEMS) {
    if (!isEquipSlot(it.kind) || it.price <= 0) continue;
    for (const plus of [0, 10]) {
      const y = salvageYield(legacyQuality(it.rarity), plus, it.price, orePrice);
      if (y.ore * orePrice >= it.price || y.dust > 0)
        err(
          `${it.id}: phân giải (+${plus}) ra ${y.ore} Thiết Tinh/${y.dust} Linh Trần, giá trị >= giá mua ${it.price} (lỗ hổng mua-rồi-phân-giải)`,
        );
    }
  }
  for (const [role, name] of Object.entries(GLOSSARY.party.roles)) {
    if (t(`ui.party.role.${role}`) !== name) err(`vai trò tổ đội ${role}: tên lệch glossary.party.roles`);
  }
  for (const m of METHODS) {
    // Nhãn vai của công pháp là tên hướng tu của nó (ba hướng đầu trùng tên vai tổ đội; hướng mới như Hồn tu có tên riêng).
    const pathName = (GLOSSARY.paths as Record<string, string>)[pathOf(m.id)?.id ?? ''];
    if (t(`method.${m.id}.role`) !== pathName) err(`công pháp ${m.id}: nhãn vai phải là tên hướng tu (glossary.paths)`);
  }
  for (const k of ['gem', 'refineStone', 'dust', 'ward'] as const) if (!GLOSSARY.upgrade[k]) err(`glossary.upgrade.${k} thiếu`);
  if (t(`item.${REFINE_ITEM}.name`) !== GLOSSARY.upgrade.refineStone) err('tên Tẩy Luyện Thạch lệch glossary');
  if (t(`item.${DUST_ITEM}.name`) !== GLOSSARY.upgrade.dust) err('tên Linh Trần lệch glossary');
  if (t(`item.${WARD_ITEM}.name`) !== GLOSSARY.upgrade.ward) err('tên Hộ Phù lệch glossary');
  for (const id of allGemIds()) {
    const g = parseGem(id)!;
    const want = `${GLOSSARY.upgrade.gemTiers[g.tier - 1]} ${GLOSSARY.elements[g.elem]} ${GLOSSARY.upgrade.gem}`;
    if (t(`item.${id}.name`) !== want) err(`ngọc ${id}: tên "${t(`item.${id}.name`)}" lệch glossary ("${want}")`);
  }
  for (const k of ['ui.upg.tab.gem', 'ui.upg.tab.refine', 'ui.upg.tab.salvage']) needStr(k);
  // Ngọc/thạch/phù phải có nguồn: rơi từ quái, bán ở NPC hoặc ghép.
  const sources = new Set<string>();
  for (const l of LOOT.values()) for (const d of l.drops) sources.add(d.item);
  for (const n of NPCS) for (const i of n.sells ?? []) sources.add(i);
  for (const id of [WARD_ITEM, REFINE_ITEM]) if (!sources.has(id)) err(`${id}: không có nguồn nào (rơi/bán)`);
  for (const e of ELEMENTS) if (!sources.has(gemId(e, 1))) err(`ngọc hệ ${e} cấp 1: không có nguồn nào`);
}

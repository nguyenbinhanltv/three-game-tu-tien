// Tách từ check.ts (tối ưu Đợt E): tier.

import { MAX_LEVEL, isEquipSlot, MAX_TIER, TIER_OPEN, TIER_MUL, PROMOTE_MAT, TIER_MIN_ILVL } from '@dtl/shared';
import {
  itemTier,
  promoteTarget,
  SETS,
  GLOSSARY,
  ITEM,
  ITEMS,
  LEVELS,
  MONSTER,
  NPC,
  NPCS,
  QUEST,
  QUESTS,
  REALMS,
  PATHS,
  t,
} from '../index';
import { LOOT, LOOT_MATS } from '../loot';
import { SPIRIT_UNLOCK_LEVEL } from '@dtl/shared';
import { TRIB_DEFS, TRIB_IDS } from '@dtl/shared';
import { TELE_PAD, terrainOf, questSpot } from '@dtl/shared';

import { at } from '@dtl/shared';
import { err } from './base';
import { needItem, needStr } from './palette';
// ---- bậc trang bị và Thăng Bậc (E2-F) ----
{
  if (!(TIER_MUL.length === MAX_TIER + 1 && TIER_MUL.every((m, i) => i < 2 || m > at(TIER_MUL, i - 1)))) err('TIER_MUL phải tăng theo bậc');
  for (let to = 2; to <= TIER_OPEN; to++) {
    const mat = PROMOTE_MAT[to];
    if (!mat || !ITEM.has(mat)) err(`bậc ${to}: thiếu nguyên liệu Thăng Bậc ${mat}`);
    else if (t(`item.${mat}.name`) !== (GLOSSARY.materials as Record<string, string>)[mat]) err(`${mat}: tên lệch glossary.materials`);
  }
  for (const it of ITEMS) {
    if (!isEquipSlot(it.kind) || it.kind === 'artifact') continue;
    const tier = itemTier(it.id);
    if (it.tier !== undefined && !(Number.isInteger(it.tier) && it.tier >= 1 && it.tier <= MAX_TIER))
      err(`${it.id}: tier ${it.tier} ngoài [1; ${MAX_TIER}]`);
    if (tier >= 2 && (it.reqLevel ?? 1) < (TIER_MIN_ILVL[tier] ?? 1) - 1) err(`${it.id}: reqLevel ${it.reqLevel} quá thấp cho bậc ${tier}`);
    if (tier > TIER_OPEN) err(`${it.id}: bậc ${tier} chưa mở (TIER_OPEN = ${TIER_OPEN})`);
    if (it.promoteTo) {
      const to = ITEM.get(it.promoteTo);
      if (!to) err(`${it.id}: promoteTo không tồn tại ${it.promoteTo}`);
      else if (to.kind !== it.kind || itemTier(to.id) !== tier + 1) err(`${it.id}: promoteTo ${to.id} phải cùng ô và bậc ${tier + 1}`);
    }
    // Mọi món bậc thấp hơn bậc cao nhất đang mở đều phải thăng được.
    // Trang sức đầu (ô 9) chỉ có ở bậc 2 và 4 (bậc 3 chưa có): chưa thăng bậc được.
    if (tier < TIER_OPEN && it.kind !== 'head' && !promoteTarget(it.id)) err(`${it.id}: không có đích Thăng Bậc`);
    if (it.set)
      for (const o of SETS.find((x) => x.id === it.set)?.pieces ?? [])
        if (itemTier(o) !== tier) err(`bộ ${it.set}: ${o} khác bậc với ${it.id}`);
  }
  for (const r of LOOT_MATS) {
    for (const d of r.drops) {
      needItem(d.item, 'loot.$mats');
      if (!(d.chance > 0 && d.chance <= 1 && d.min >= 1 && d.max >= d.min)) err(`loot.$mats ${d.item}: chance/min/max sai`);
    }
    for (const m of r.mons) if (MONSTER.has(m) && !LOOT.has(m)) err(`loot.$mats: quái ${m} chưa có bảng rơi`);
  }
}
for (const n of NPCS) {
  needStr(`npc.${n.id}.name`);
  const nl = LEVELS[n.level ?? 'van_lam'];
  if (!nl) err(`npc ${n.id}: level không tồn tại ${n.level}`);
  else if (!Number.isFinite(terrainOf(nl).groundAt(n.x, n.z))) err(`npc ${n.id}: tọa độ (${n.x}, ${n.z}) ngoài bản đồ ${nl.id}`);
  needStr(`npc.${n.id}.title`);
  needStr(`npc.${n.id}.greet`);
  for (const s of n.sells ?? []) {
    needItem(s, `npc ${n.id}`);
    if ((ITEM.get(s)?.price ?? 0) <= 0) err(`npc ${n.id}: bán vật phẩm không có giá ${s}`);
  }
}
// Mục tiêu chương 5 chưa có dữ liệu (DV3-B/D/E/L chưa vào): nhiệm vụ trỏ tới chúng phải khóa bằng minLevel > MAX_LEVEL
// (cấp 29+ chưa mở nên không ai nhận được), để khỏi có nhiệm vụ nhận được mà không bao giờ xong. Gỡ id khỏi bảng khi dữ liệu thật vào.
const PENDING_OBJ: Record<string, readonly string[]> = {
  kill: [] as string[],
};
for (const q of QUESTS) {
  needStr(`quest.${q.id}.name`);
  needStr(`quest.${q.id}.desc`);
  needStr(`quest.${q.id}.done`);
  if (!NPC.has(q.giver)) err(`quest ${q.id}: giver không tồn tại`);
  if (!NPC.has(q.turnin)) err(`quest ${q.id}: turnin không tồn tại`);
  if (q.requires && !QUEST.has(q.requires)) err(`quest ${q.id}: requires không tồn tại ${q.requires}`);
  if (q.path) {
    // Nhánh Hướng tu: hướng phải có thật, nhiệm vụ không được nằm trên đường chính duy nhất của chương (người hướng khác sẽ kẹt).
    if (!PATHS.some((p) => p.id === q.path)) err(`quest ${q.id}: path ${q.path} không phải hướng tu`);
    const dep = q.requires ? QUEST.get(q.requires) : undefined;
    if (dep && dep.path && dep.path !== q.path) err(`quest ${q.id}: requires nhiệm vụ của hướng khác (${dep.path})`);
    for (const o of q.objectives) if (o.type === 'breakthrough') err(`quest ${q.id}: nhánh hướng không dùng mục tiêu breakthrough`);
  }
  for (const q2 of QUESTS)
    if (q2.requires === q.id && !q2.path && q.path) err(`quest ${q2.id}: requires nhiệm vụ nhánh hướng ${q.id}, người hướng khác sẽ kẹt`);
  for (const o of q.objectives) {
    const pend =
      !!o.target &&
      (PENDING_OBJ[o.type] ?? []).includes(o.target) &&
      !(o.type === 'kill' && MONSTER.has(o.target)) &&
      !(o.type === 'breakthrough' && (TRIB_IDS as readonly string[]).includes(o.target));
    if (pend && (q.minLevel ?? 1) <= MAX_LEVEL)
      err(`quest ${q.id}: mục tiêu ${o.type} ${o.target} chưa có dữ liệu, minLevel phải > ${MAX_LEVEL} để khóa`);
    if (pend) continue;
    if (o.type === 'kill' && !MONSTER.has(o.target ?? '')) err(`quest ${q.id}: quái không tồn tại ${o.target}`);
    if ((o.type === 'gather' || o.type === 'craft') && !ITEM.has(o.target ?? '')) err(`quest ${q.id}: vật phẩm không tồn tại ${o.target}`);
    if (o.type === 'talk' && !NPC.has(o.target ?? '')) err(`quest ${q.id}: npc không tồn tại ${o.target}`);
    // Kiếp chuỗi còn mốc tạm (to = from): mục tiêu `breakthrough` tính theo cấp `to` nên sẽ tự xong ngay ở cấp `from`. Chặn cho tới khi chuỗi gắn vào thang cấp.
    if (
      o.type === 'breakthrough' &&
      o.target &&
      TRIB_DEFS[o.target as keyof typeof TRIB_DEFS]?.chain &&
      TRIB_DEFS[o.target as keyof typeof TRIB_DEFS].to <= TRIB_DEFS[o.target as keyof typeof TRIB_DEFS].from
    )
      err(
        `quest ${q.id}: breakthrough ${o.target} là kiếp chuỗi chưa gắn vào thang cấp (to = from), nhiệm vụ sẽ tự xong; chưa dùng làm mục tiêu được`,
      );
    if (o.type === 'breakthrough' && o.target && !(TRIB_IDS as readonly string[]).includes(o.target))
      err(`quest ${q.id}: breakthrough target phải là id kiếp, không phải ${o.target}`);
  }
  for (const i of q.rewards.items ?? []) needItem(i.id, `quest ${q.id}`);
  for (const id of q.unlockTele ?? []) if (!TELE_PAD.has(id)) err(`quest ${q.id}: unlockTele ${id} không phải trận`);
  // E2-H: mục tiêu do server chấm. Mỗi loại phải trỏ tới đúng thứ có trong một level; level của người nhận suy từ NPC giao việc.
  for (const o of q.objectives) {
    if (o.type === 'touch' || o.type === 'scan') {
      if (!Object.values(LEVELS).some((lv) => questSpot(lv, o.target)))
        err(`quest ${q.id}: ${o.type} ${o.target} không phải poi/spot của level nào`);
      if (o.type === 'scan' && (q.minLevel ?? 1) < SPIRIT_UNLOCK_LEVEL)
        err(`quest ${q.id}: scan cần minLevel ≥ ${SPIRIT_UNLOCK_LEVEL} (thần thức mở từ Kết Đan)`);
    }
    if (o.type === 'dungeon' && o.target) needStr(`dungeon.${o.target}.name`);
    if (o.type === 'escort' && !Object.values(LEVELS).some((lv) => lv.escorts?.some((e) => e.id === o.target)))
      err(`quest ${q.id}: escort ${o.target} không có trong level nào`);
  }
}
for (const r of REALMS) needStr(r.key);

// Kiểm tra nội dung game: id trùng, tham chiếu hỏng, thiếu chuỗi hiển thị.
// Chạy: pnpm content:check

import { groundAt, heightAt, WATER_Y, xpNeed } from '@dtl/shared';
import { hasString, ITEM, ITEMS, LEVELS, MONSTER, MONSTERS, NPC, NPCS, QUEST, QUESTS, REALMS, RECIPES, SKILLS } from './index';

const errors: string[] = [];
const err = (m: string) => errors.push(m);

function uniqueIds(kind: string, list: { id: string }[]) {
  const seen = new Set<string>();
  for (const e of list) {
    if (seen.has(e.id)) err(`${kind}: id trùng ${e.id}`);
    seen.add(e.id);
    if (!/^[a-z0-9_]+$/.test(e.id)) err(`${kind}: id không hợp lệ ${e.id}`);
  }
}

uniqueIds('item', ITEMS);
uniqueIds('monster', MONSTERS);
uniqueIds('skill', SKILLS);
uniqueIds('recipe', RECIPES);
uniqueIds('npc', NPCS);
uniqueIds('quest', QUESTS);

const needItem = (id: string, where: string) => {
  if (!ITEM.has(id)) err(`${where}: vật phẩm không tồn tại ${id}`);
};
const needStr = (key: string) => {
  if (!hasString(key)) err(`thiếu chuỗi i18n: ${key}`);
};

for (const it of ITEMS) {
  needStr(`item.${it.id}.name`);
  needStr(`item.${it.id}.desc`);
  if ((it.kind === 'weapon' || it.kind === 'robe' || it.kind === 'accessory') && it.stack !== 1) err(`item ${it.id}: trang bị phải stack = 1`);
  if (it.price > 0 && it.sell >= it.price) err(`item ${it.id}: giá bán >= giá mua (lỗ hổng kiếm tiền vô hạn)`);
}
for (const m of MONSTERS) {
  needStr(`mon.${m.id}`);
  for (const d of m.drops) needItem(d.item, `monster ${m.id}`);
}
for (const s of SKILLS) {
  needStr(`skill.${s.id}.name`);
  needStr(`skill.${s.id}.desc`);
}
for (const r of RECIPES) {
  needItem(r.output.id, `recipe ${r.id}`);
  for (const i of r.inputs) needItem(i.id, `recipe ${r.id}`);
  if (!NPC.has(r.npc)) err(`recipe ${r.id}: npc không tồn tại ${r.npc}`);
  // Luyện rồi bán không được lời.
  const out = ITEM.get(r.output.id);
  if (out) {
    const cost = r.gold + r.inputs.reduce((s, i) => s + (ITEM.get(i.id)?.sell ?? 0) * i.n, 0);
    if (out.sell * r.output.n > cost + 30) err(`recipe ${r.id}: bán thành phẩm lời quá nhiều (${out.sell * r.output.n} so với ${cost})`);
  }
}
for (const n of NPCS) {
  needStr(`npc.${n.id}.name`);
  needStr(`npc.${n.id}.title`);
  needStr(`npc.${n.id}.greet`);
  for (const s of n.sells ?? []) {
    needItem(s, `npc ${n.id}`);
    if ((ITEM.get(s)?.price ?? 0) <= 0) err(`npc ${n.id}: bán vật phẩm không có giá ${s}`);
  }
}
for (const q of QUESTS) {
  needStr(`quest.${q.id}.name`);
  needStr(`quest.${q.id}.desc`);
  needStr(`quest.${q.id}.done`);
  if (!NPC.has(q.giver)) err(`quest ${q.id}: giver không tồn tại`);
  if (!NPC.has(q.turnin)) err(`quest ${q.id}: turnin không tồn tại`);
  if (q.requires && !QUEST.has(q.requires)) err(`quest ${q.id}: requires không tồn tại ${q.requires}`);
  for (const o of q.objectives) {
    if (o.type === 'kill' && !MONSTER.has(o.target ?? '')) err(`quest ${q.id}: quái không tồn tại ${o.target}`);
    if ((o.type === 'gather' || o.type === 'craft') && !ITEM.has(o.target ?? '')) err(`quest ${q.id}: vật phẩm không tồn tại ${o.target}`);
    if (o.type === 'talk' && !NPC.has(o.target ?? '')) err(`quest ${q.id}: npc không tồn tại ${o.target}`);
  }
  for (const i of q.rewards.items ?? []) needItem(i.id, `quest ${q.id}`);
}
for (const r of REALMS) needStr(r.key);
for (const lv of Object.values(LEVELS)) {
  for (const s of lv.spawns) {
    if (!MONSTER.has(s.mon)) err(`level ${lv.id}: quái không tồn tại ${s.mon}`);
    const g = groundAt(s.x, s.z);
    if (!MONSTER.get(s.mon)?.boss && heightAt(s.x, s.z) < WATER_Y) err(`level ${lv.id}: spawn ${s.mon} nằm dưới nước`);
    if (!Number.isFinite(g)) err(`level ${lv.id}: spawn ${s.mon} ngoài bản đồ`);
  }
  for (const n of lv.nodes) needItem(n.item, `level ${lv.id}`);
}

let total = 0;
for (let l = 1; l <= 15; l++) total += xpNeed(l);
console.log(`Tổng tu vi Ngưng Khí 1 → viên mãn tầng 15: ${total}`);
console.log(`${ITEMS.length} vật phẩm, ${MONSTERS.length} quái, ${SKILLS.length} skill, ${QUESTS.length} nhiệm vụ, ${RECIPES.length} công thức`);

if (errors.length) {
  console.error(`\n${errors.length} lỗi nội dung:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nội dung hợp lệ.');

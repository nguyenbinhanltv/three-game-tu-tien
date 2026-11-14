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
  const combo = m.ai?.combo;
  if (combo) {
    if (!(combo.chance > 0 && combo.chance <= 1)) err(`monster ${m.id}: combo.chance phải trong (0, 1]`);
    if (!(combo.delay >= 0.25 && combo.delay < m.attackCd)) err(`monster ${m.id}: combo.delay phải từ 0,25 tới dưới attackCd`);
    if (!(combo.mul > 0 && combo.mul <= 3)) err(`monster ${m.id}: combo.mul phải trong (0, 3]`);
  }
  const cs = m.ai?.caster;
  if (cs) {
    if (m.boss) err(`monster ${m.id}: boss chưa hỗ trợ caster`);
    if (!['circle', 'rect', 'cone'].includes(cs.shape)) err(`monster ${m.id}: caster.shape không hợp lệ`);
    if (!['lightning', 'frost', 'fire', 'spirit'].includes(cs.kind)) err(`monster ${m.id}: caster.kind không hợp lệ`);
    // Né bằng di chuyển phải làm được: vùng hiện ít nhất 0,9 giây, tổng thời gian báo trước ít nhất 1,5 giây.
    if (!(cs.delay >= 0.9)) err(`monster ${m.id}: caster.delay phải >= 0,9 giây`);
    if (!(cs.cast >= 0.3 && cs.cast + cs.delay >= 1.5)) err(`monster ${m.id}: caster.cast + delay phải >= 1,5 giây`);
    if (!(cs.cd >= 2)) err(`monster ${m.id}: caster.cd phải >= 2 giây`);
    if (!(cs.mul > 0 && cs.mul <= 3)) err(`monster ${m.id}: caster.mul phải trong (0, 3]`);
    if (!(cs.range > 3 && cs.range <= m.aggro + 4)) err(`monster ${m.id}: caster.range phải trong (3, aggro + 4]`);
    if (!(cs.r > 0 && cs.r <= 20)) err(`monster ${m.id}: caster.r phải trong (0, 20]`);
    if ((cs.shape === 'rect' || cs.shape === 'cone') && cs.r < cs.range) err(`monster ${m.id}: caster.r phải >= range với hình rect/cone`);
    if (cs.shape === 'rect' && !(cs.w !== undefined && cs.w > 0 && cs.w <= 6)) err(`monster ${m.id}: rect cần w trong (0, 6]`);
    if (cs.shape === 'cone' && !(cs.w !== undefined && cs.w > 0 && cs.w <= 75)) err(`monster ${m.id}: cone cần w (nửa góc, độ) trong (0, 75]`);
  }
  const ch = m.ai?.chant;
  if (ch) {
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới niệm chú`);
    if (!['lightning', 'frost', 'fire', 'spirit'].includes(ch.kind)) err(`monster ${m.id}: chant.kind không hợp lệ`);
    if (!(ch.cast >= 1.2 && ch.cast <= 5)) err(`monster ${m.id}: chant.cast phải trong [1,2; 5] giây`);
    if (!(ch.open >= 0 && ch.open <= 0.6)) err(`monster ${m.id}: chant.open phải trong [0; 0,6]`);
    // Cửa sổ ngắt phải đủ rộng cho độ trễ mạng + GCD 1 giây.
    if (!(ch.cast * (1 - ch.open) >= 1.2)) err(`monster ${m.id}: cửa sổ ngắt cast·(1 − open) phải >= 1,2 giây`);
    if (!(ch.delay >= 0.9)) err(`monster ${m.id}: chant.delay phải >= 0,9 giây`);
    if (!(ch.stun >= 1 && ch.stun <= 6)) err(`monster ${m.id}: chant.stun phải trong [1; 6] giây`);
    if (!(ch.cd > ch.cast + ch.delay + ch.stun)) err(`monster ${m.id}: chant.cd phải lớn hơn cast + delay + stun`);
    if (!(ch.mul > 0 && ch.mul <= 3)) err(`monster ${m.id}: chant.mul phải trong (0, 3]`);
    if (!(ch.r > 0 && ch.r <= 20)) err(`monster ${m.id}: chant.r phải trong (0, 20]`);
  }
  const sl = m.ai?.slam;
  if (sl) {
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có slam`);
    if (!['lightning', 'frost', 'fire', 'spirit'].includes(sl.kind)) err(`monster ${m.id}: slam.kind không hợp lệ`);
    if (!(sl.delay >= 1.2)) err(`monster ${m.id}: slam.delay phải >= 1,2 giây (vùng hiện dưới chân, cần thời gian chạy ra)`);
    if (!(sl.cd > sl.delay + 2)) err(`monster ${m.id}: slam.cd phải lớn hơn delay + 2`);
    if (!(sl.mul > 0 && sl.mul <= 3)) err(`monster ${m.id}: slam.mul phải trong (0, 3]`);
    if (!(sl.r > 0 && sl.r <= 8)) err(`monster ${m.id}: slam.r phải trong (0, 8]`);
    if (!(Number.isInteger(sl.max) && sl.max >= 1 && sl.max <= 5)) err(`monster ${m.id}: slam.max phải là số nguyên 1–5`);
  }
}
for (const s of SKILLS) {
  needStr(`skill.${s.id}.name`);
  needStr(`skill.${s.id}.desc`);
  if (s.interrupt && s.kind !== 'damage') err(`skill ${s.id}: interrupt chỉ dùng cho skill kind 'damage'`);
}
if (MONSTERS.some((m) => m.ai?.chant) && !SKILLS.some((s) => s.interrupt && s.unlock === 1)) {
  err('có boss niệm chú nhưng không có skill ngắt mở từ tầng 1');
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

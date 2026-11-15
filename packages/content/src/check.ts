// Kiểm tra nội dung game: id trùng, tham chiếu hỏng, thiếu chuỗi hiển thị.
// Chạy: pnpm content:check

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GCD, groundAt, heightAt, type LootDef, type MonsterAi, type MonsterDef, phaseRules, POSE_CAST, POSE_FLY, validatePose, validateSkillPose, WATER_Y, xpNeed } from '@dtl/shared';
import { APPEARANCE, DYE, hasString, ITEM, ITEMS, LEVELS, MONSTER, MONSTERS, NPC, NPCS, POSES, QUEST, QUESTS, REALMS, RECIPES, SKILLS, t } from './index';
import { LOOT } from './loot';
import { PLACE_ID, PLACES } from './places';

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
uniqueIds('pose', POSES);
for (const p of POSES) for (const m of validatePose(p)) err(m);
const POSE = new Map(POSES.map((p) => [p.id, p]));
// Mỗi skill một động tác riêng, không dài quá GCD (chiêu niệm chú: động tác chém sau khi niệm xong cũng ≤ GCD).
for (const s of SKILLS) for (const m of validateSkillPose(s.id, s.pose, POSE, GCD)) err(m);
const skillPoses = SKILLS.map((s) => s.pose);
if (new Set(skillPoses).size !== skillPoses.length) err('hai skill dùng chung một pose');
// Client chọn động tác theo fx của chiêu (FX của server chỉ mang loại hiệu ứng): fx phải riêng cho mỗi chiêu.
const skillFx = SKILLS.map((s) => s.fx);
if (new Set(skillFx).size !== skillFx.length) err('hai skill dùng chung một fx');
for (const id of [POSE_FLY, POSE_CAST]) if (!POSE.get(id)?.loop) err(`pose ${id} (trạng thái nền) phải có và lặp`);

// ---- ngoại hình người chơi: khớp bảng màu tâm trạng (assets/palette.json) ----
uniqueIds('dye', APPEARANCE.dyes);
{
  const palette = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../assets/palette.json', import.meta.url)), 'utf8')) as {
    colors: { id: string; hex: string }[];
    playerDyes: { default: string; options: string[] };
  };
  const opts = palette.playerDyes.options;
  if (APPEARANCE.dyes.map((d) => d.id).join() !== opts.join()) err(`appearance: dyes phải đúng thứ tự playerDyes.options trong palette.json (${opts.join(', ')})`);
  if (APPEARANCE.defaultDye !== palette.playerDyes.default) err(`appearance: defaultDye khác playerDyes.default (${palette.playerDyes.default})`);
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const d of APPEARANCE.dyes) {
    const c = palette.colors.find((x) => x.id === d.id);
    if (!c) err(`appearance: màu ${d.id} không có trong palette.json`);
    else if (c.hex.toLowerCase() !== d.hex.toLowerCase()) err(`appearance: ${d.id} hex ${d.hex} khác palette.json ${c.hex}`);
    if (!hex.test(d.hex) || !hex.test(d.trim)) err(`appearance: ${d.id} hex/trim không hợp lệ`);
    if (!hasString(`appearance.dye.${d.id}`)) err(`appearance: thiếu chuỗi appearance.dye.${d.id}`);
  }
  if (!DYE.has(APPEARANCE.defaultDye)) err(`appearance: defaultDye ${APPEARANCE.defaultDye} không có trong dyes`);
  const g = APPEARANCE.genders.find((x) => x.id === APPEARANCE.defaultGender);
  if (!g || !g.enabled || !g.model) err(`appearance: defaultGender ${APPEARANCE.defaultGender} phải bật và có model`);
  for (const x of APPEARANCE.genders) {
    if (x.enabled && !x.model) err(`appearance: giới tính ${x.id} bật nhưng chưa có model`);
    if (!hasString(`appearance.gender.${x.id}`)) err(`appearance: thiếu chuỗi appearance.gender.${x.id}`);
  }
  if (APPEARANCE.legacyByNameHash.length !== 8) err('appearance: legacyByNameHash phải có 8 phần tử (8 phối màu cũ)');
  for (const id of APPEARANCE.legacyByNameHash) if (!DYE.has(id)) err(`appearance: legacyByNameHash có màu lạ ${id}`);
}

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
const KINDS = ['lightning', 'frost', 'fire', 'spirit'];

/** Kiểm bộ chiêu của quái (với boss có pha: kiểm bộ chiêu đã ghép của từng pha). `at` ghi rõ pha trong thông báo lỗi. */
function checkAi(m: MonsterDef, ai: MonsterAi, attackCd: number, at: string) {
  const id = `monster ${m.id}${at}`;
  const combo = ai.combo;
  if (combo) {
    if (!(combo.chance > 0 && combo.chance <= 1)) err(`${id}: combo.chance phải trong (0, 1]`);
    if (!(combo.delay >= 0.25 && combo.delay < attackCd)) err(`${id}: combo.delay phải từ 0,25 tới dưới attackCd`);
    if (!(combo.mul > 0 && combo.mul <= 3)) err(`${id}: combo.mul phải trong (0, 3]`);
  }
  const cs = ai.caster;
  if (cs) {
    if (m.boss) err(`${id}: boss chưa hỗ trợ caster`);
    if (!['circle', 'rect', 'cone', 'bolt'].includes(cs.shape)) err(`${id}: caster.shape không hợp lệ`);
    if (!KINDS.includes(cs.kind)) err(`${id}: caster.kind không hợp lệ`);
    // Né bằng di chuyển phải làm được: vùng hiện ít nhất 0,9 giây, tổng thời gian báo trước ít nhất 1,5 giây.
    if (!(cs.delay >= 0.9)) err(`${id}: caster.delay phải >= 0,9 giây`);
    if (!(cs.cast >= 0.3 && cs.cast + cs.delay >= 1.5)) err(`${id}: caster.cast + delay phải >= 1,5 giây`);
    if (!(cs.cd >= 2)) err(`${id}: caster.cd phải >= 2 giây`);
    if (!(cs.mul > 0 && cs.mul <= 3)) err(`${id}: caster.mul phải trong (0, 3]`);
    if (!(cs.range > 3 && cs.range <= m.aggro + 4)) err(`${id}: caster.range phải trong (3, aggro + 4]`);
    if (cs.shape !== 'bolt' && !(cs.r > 0 && cs.r <= 20)) err(`${id}: caster.r phải trong (0, 20]`);
    if ((cs.shape === 'rect' || cs.shape === 'cone') && cs.r < cs.range) err(`${id}: caster.r phải >= range với hình rect/cone`);
    if (cs.shape === 'rect' && !(cs.w !== undefined && cs.w > 0 && cs.w <= 6)) err(`${id}: rect cần w trong (0, 6]`);
    if (cs.shape === 'cone' && !(cs.w !== undefined && cs.w > 0 && cs.w <= 75)) err(`${id}: cone cần w (nửa góc, độ) trong (0, 75]`);
    if (cs.shape === 'bolt') {
      // Đạn phải bay chậm, nhìn thấy, né được bằng bước ngang (D1).
      const v = cs.speed ?? 0;
      if (!(v >= 5 && v <= 14)) err(`${id}: bolt cần speed trong [5, 14] m/s (chậm, né được)`);
      if (!(cs.r >= 0.2 && cs.r <= 1.2)) err(`${id}: bolt cần r (bán kính đạn) trong [0,2; 1,2]`);
      if (cs.n !== undefined && !(Number.isInteger(cs.n) && cs.n >= 1 && cs.n <= 5)) err(`${id}: bolt.n phải nguyên trong [1, 5]`);
      if (cs.spread !== undefined && !(cs.spread >= 0 && cs.spread <= 60)) err(`${id}: bolt.spread (độ) trong [0, 60]`);
      if ((cs.n ?? 1) > 1 && !(cs.spread! > 0)) err(`${id}: bolt nhiều viên cần spread > 0`);
      // Quái lùi giữ khoảng cách từ 0,35 × range: lúc đó vẫn phải có ít nhất 1,2 giây từ khi tụ lực tới khi đạn tới.
      if (v > 0 && !(cs.cast + (cs.range * 0.35) / v >= 1.2)) err(`${id}: bolt cast + (0,35 × range)/speed phải >= 1,2 giây`);
    }
  }
  const ch = ai.chant;
  if (ch) {
    if (!m.boss) err(`${id}: chỉ boss mới niệm chú`);
    if (!KINDS.includes(ch.kind)) err(`${id}: chant.kind không hợp lệ`);
    if (!(ch.cast >= 1.2 && ch.cast <= 5)) err(`${id}: chant.cast phải trong [1,2; 5] giây`);
    if (!(ch.open >= 0 && ch.open <= 0.6)) err(`${id}: chant.open phải trong [0; 0,6]`);
    // Cửa sổ ngắt phải đủ rộng cho độ trễ mạng + GCD 1 giây.
    if (!(ch.cast * (1 - ch.open) >= 1.2)) err(`${id}: cửa sổ ngắt cast·(1 − open) phải >= 1,2 giây`);
    if (!(ch.delay >= 0.9)) err(`${id}: chant.delay phải >= 0,9 giây`);
    if (!(ch.stun >= 1 && ch.stun <= 6)) err(`${id}: chant.stun phải trong [1; 6] giây`);
    if (!(ch.cd > ch.cast + ch.delay + ch.stun)) err(`${id}: chant.cd phải lớn hơn cast + delay + stun`);
    if (!(ch.mul > 0 && ch.mul <= 3)) err(`${id}: chant.mul phải trong (0, 3]`);
    if (!(ch.r > 0 && ch.r <= 20)) err(`${id}: chant.r phải trong (0, 20]`);
  }
  const sl = ai.slam;
  if (sl) {
    if (!m.boss) err(`${id}: chỉ boss mới có slam`);
    if (!KINDS.includes(sl.kind)) err(`${id}: slam.kind không hợp lệ`);
    if (!(sl.delay >= 1.2)) err(`${id}: slam.delay phải >= 1,2 giây (vùng hiện dưới chân, cần thời gian chạy ra)`);
    if (!(sl.cd > sl.delay + 2)) err(`${id}: slam.cd phải lớn hơn delay + 2`);
    if (!(sl.mul > 0 && sl.mul <= 3)) err(`${id}: slam.mul phải trong (0, 3]`);
    if (!(sl.r > 0 && sl.r <= 8)) err(`${id}: slam.r phải trong (0, 8]`);
    if (!(Number.isInteger(sl.max) && sl.max >= 1 && sl.max <= 5)) err(`${id}: slam.max phải là số nguyên 1–5`);
  }
  const sw = ai.sweep;
  if (sw) {
    if (!m.boss) err(`${id}: chỉ boss mới có sweep`);
    if (!KINDS.includes(sw.kind)) err(`${id}: sweep.kind không hợp lệ`);
    if (sw.shape !== 'rect' && sw.shape !== 'cone') err(`${id}: sweep.shape phải là rect hoặc cone`);
    // Vùng hiện ngay khi boss khóa hướng: cần đủ thời gian đi ngang ra khỏi vùng.
    if (!(sw.delay >= 1.2 && sw.delay <= 3)) err(`${id}: sweep.delay phải trong [1,2; 3] giây`);
    if (!(sw.cd > sw.delay + 2)) err(`${id}: sweep.cd phải lớn hơn delay + 2`);
    if (!(sw.mul > 0 && sw.mul <= 3)) err(`${id}: sweep.mul phải trong (0, 3]`);
    if (!(sw.r > m.attackRange && sw.r <= 20)) err(`${id}: sweep.r phải trong (attackRange, 20]`);
    if (sw.shape === 'rect' && !(sw.w > 0 && sw.w <= 6)) err(`${id}: sweep rect cần w trong (0, 6]`);
    if (sw.shape === 'cone' && !(sw.w > 0 && sw.w <= 75)) err(`${id}: sweep cone cần w (nửa góc, độ) trong (0, 75]`);
  }
}

function checkLoot(id: string, l: LootDef) {
  const [g0, g1] = l.gold ?? [];
  if (!(Number.isInteger(g0) && Number.isInteger(g1) && g0 >= 0 && g1 >= g0)) err(`loot ${id}: gold phải là [min, max] nguyên, 0 <= min <= max`);
  for (const d of l.drops ?? []) {
    needItem(d.item, `loot ${id}`);
    if (!(d.chance > 0 && d.chance <= 1)) err(`loot ${id}/${d.item}: chance phải trong (0, 1]`);
    if (!(Number.isInteger(d.min) && Number.isInteger(d.max) && d.min >= 1 && d.max >= d.min)) err(`loot ${id}/${d.item}: min/max không hợp lệ`);
  }
}
for (const id of LOOT.keys()) if (!MONSTER.has(id)) err(`loot: quái không tồn tại ${id}`);

for (const m of MONSTERS) {
  needStr(`mon.${m.id}`);
  if (m.boss) needStr(`mon.${m.id}.title`);
  // Tỉ lệ rơi chỉ nằm trong loot.json (server đọc); monsters.json vào bundle client nên cấm.
  if ('drops' in m || 'gold' in m) err(`monster ${m.id}: drops/gold phải nằm trong data/loot.json, không ở monsters.json`);
  const loot = LOOT.get(m.id);
  if (!loot) err(`monster ${m.id}: thiếu bảng rơi trong data/loot.json`);
  else checkLoot(m.id, loot);
  checkAi(m, m.ai ?? {}, m.attackCd, '');
  if (m.phases) {
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có pha`);
    if (m.phases.length > 3) err(`monster ${m.id}: tối đa 3 pha sau pha đầu`);
    let prev = 1;
    m.phases.forEach((p, i) => {
      if (!(p.hp > 0.05 && p.hp < prev)) err(`monster ${m.id} pha ${i + 1}: hp phải giảm dần trong (0,05; 1)`);
      prev = p.hp;
      if (p.cdMul !== undefined && !(p.cdMul >= 0.6 && p.cdMul <= 1.2)) err(`monster ${m.id} pha ${i + 1}: cdMul phải trong [0,6; 1,2]`);
      if (p.speedMul !== undefined && !(p.speedMul >= 0.8 && p.speedMul <= 1.3)) err(`monster ${m.id} pha ${i + 1}: speedMul phải trong [0,8; 1,3]`);
      const r = phaseRules(m, i + 1);
      checkAi(m, r.ai, m.attackCd * r.cdMul, ` pha ${i + 1}`);
      // Thoại khi vào pha: ngắn, đọc kịp trong lúc vẫn đánh (letterbox ~3 giây).
      const key = `mon.${m.id}.say.${i + 1}`;
      needStr(key);
      if (hasString(key) && t(key).length > 90) err(`${key}: thoại quá dài (> 90 ký tự)`);
    });
    if (hasString(`mon.${m.id}.say.dead`) && t(`mon.${m.id}.say.dead`).length > 90) err(`mon.${m.id}.say.dead: thoại quá dài`);
  }
  const ps = m.posture;
  if (ps) {
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có thanh phá thế`);
    if (!(ps.k > 0 && ps.k <= 6)) err(`monster ${m.id}: posture.k phải trong (0, 6]`);
    if (!(ps.heavy >= 0 && ps.heavy <= 0.2)) err(`monster ${m.id}: posture.heavy phải trong [0; 0,2]`);
    if (!(ps.interrupt >= 0 && ps.interrupt <= 1)) err(`monster ${m.id}: posture.interrupt phải trong [0; 1]`);
    if (!(ps.wait >= 1 && ps.decay > 0 && ps.decay <= 0.5)) err(`monster ${m.id}: posture.wait >= 1 và decay trong (0; 0,5]`);
    if (!(ps.brk >= 1 && ps.brk <= 6)) err(`monster ${m.id}: posture.brk phải trong [1; 6] giây`);
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

// Điểm đặt tên cho ?at= / `/gm tp <id>` (chỉ server đọc).
uniqueIds('place', PLACES);
for (const pl of PLACES) {
  if (!PLACE_ID.test(pl.id)) err(`place ${pl.id}: id chỉ gồm a-z 0-9 _ (tối đa 24)`);
  if (!LEVELS[pl.level]) err(`place ${pl.id}: level không tồn tại ${pl.level}`);
  if (!Number.isFinite(pl.x) || !Number.isFinite(pl.z) || !Number.isFinite(groundAt(pl.x, pl.z))) err(`place ${pl.id}: tọa độ ngoài bản đồ`);
}

let total = 0;
for (let l = 1; l <= 15; l++) total += xpNeed(l);
console.log(`Tổng tu vi Ngưng Khí 1 → viên mãn tầng 15: ${total}`);
console.log(`${ITEMS.length} vật phẩm, ${MONSTERS.length} quái, ${SKILLS.length} skill, ${QUESTS.length} nhiệm vụ, ${RECIPES.length} công thức, ${POSES.length} pose, ${APPEARANCE.dyes.length} màu áo`);

if (errors.length) {
  console.error(`\n${errors.length} lỗi nội dung:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nội dung hợp lệ.');

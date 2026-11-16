import { existsSync } from 'node:fs';
// Kiểm tra nội dung game: id trùng, tham chiếu hỏng, thiếu chuỗi hiển thị.
// Chạy: pnpm content:check

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_LEVEL, TRUC_CO_LEVEL, majorRealmOf, poseIdsFor, salvageYield, legacyQuality, allGemIds, gemId, parseGem, WARD_ITEM, REFINE_ITEM, DUST_ITEM, AFFIX_ILVL_CAP, ROOT_IDS, PHA_CANH_PILL, BOTTLENECK_LEVELS, droppableSlots, templatesFor, type EquipSlot, budget, ELEMENTS, EQUIP_SLOTS, GCD, isEquipSlot, QUALITY_COUNT, QUALITY_MUL, rollItemInstance, seededRng, parseInst, STAT_PER_POINT, type LootDef, type MonsterAi, type MonsterDef, phaseRules, POSE_CAST, POSE_FLY, POSE_SWORD_SWAP, validatePose, validateSkillPose, validateSkillRules, SKILL_ID_ALIASES, WATER_Y, xpNeed, MAX_TIER, TIER_OPEN, TIER_MUL, PROMOTE_MAT, TIER_MIN_ILVL } from '@dtl/shared';
import { itemTier, promoteTarget, LEVEL_ASSETS, ARTIFACTS, ARTIFACT, PILL_QUALITY, FORGE, SETS, ENHANCE_ORE, APPEARANCE, DYE, GLOSSARY, hasString, ITEM, ITEM_SYS, ITEMS, LEVELS, MONSTER, MONSTERS, NPC, NPCS, POSES, QUEST, QUESTS, REALMS, RECIPES, ROOTS, SKILLS, METHODS, METHOD, METHOD_SKILLS, SKILL, VARIANTS, t } from './index';
import { LOOT, LOOT_MATS } from './loot';
import { monSkillsOf } from '@dtl/shared';
import { PILL_TIERS, ARTIFACT_MAX_LEVEL, PILL_BUFF_KINDS } from '@dtl/shared';
import { PLACE_ID, PLACES } from './places';
import { PEAK_LEVELS, TRIB_DEFS, TRIB_IDS, TRIB_MECHANIC_IDS } from '@dtl/shared';
import { TELE_PADS, terrainOf } from '@dtl/shared';
import { checkLevel } from './levelcheck';

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
const ALL_SKILLS = [...SKILLS, ...METHOD_SKILLS];
uniqueIds('skill', ALL_SKILLS);
uniqueIds('method', METHODS);
uniqueIds('recipe', RECIPES);
uniqueIds('npc', NPCS);
uniqueIds('quest', QUESTS);
uniqueIds('pose', POSES);
for (const p of POSES) for (const m of validatePose(p)) err(m);
const POSE = new Map(POSES.map((p) => [p.id, p]));
// Mỗi skill một động tác riêng, không dài quá GCD (chiêu niệm chú: động tác chém sau khi niệm xong cũng ≤ GCD).
// Chiêu lướt (K-2) không có động tác riêng: dùng chung fx `dash`, hình lướt do client dựng.
const POSED = ALL_SKILLS.filter((s) => s.kind !== 'dash');
for (const s of POSED) for (const m of validateSkillPose(s.id, s.pose, POSE, GCD)) err(m);
const skillPoses = POSED.map((s) => s.pose);
if (new Set(skillPoses).size !== skillPoses.length) err('hai skill dùng chung một pose');
// Client chọn động tác theo fx của chiêu (FX của server chỉ mang loại hiệu ứng): fx phải riêng cho mỗi chiêu.
const skillFx = POSED.map((s) => s.fx);
if (new Set(skillFx).size !== skillFx.length) err('hai skill dùng chung một fx');
for (const id of [POSE_FLY, POSE_CAST]) if (!POSE.get(id)?.loop) err(`pose ${id} (trạng thái nền) phải có và lặp`);
for (const [id, swap] of Object.entries(POSE_SWORD_SWAP)) {
  const p = POSE.get(id);
  if (!p || p.loop) err(`pose ${id} (rút/tra kiếm) phải có và là một lần`);
  else if (!(swap > 0 && swap < p.duration)) err(`pose ${id}: lúc đổi kiếm ${swap}s nằm ngoài clip (${p.duration}s)`);
}

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

// ---- công pháp (Phase 3-5): chiêu công pháp, nội tại, biến thức ----
for (const s of SKILLS) if (s.method || s.ult) err(`skill ${s.id}: chiêu chung không có method/ult (đặt trong methods.json)`);
for (const m of METHODS) {
  const sig = SKILL.get(m.sig);
  const ult = SKILL.get(m.ult);
  if (!sig || sig.method !== m.id || sig.ult) err(`method ${m.id}: chiêu đặc trưng ${m.sig} phải thuộc công pháp và không phải tối thượng`);
  if (!ult || ult.method !== m.id || !ult.ult) err(`method ${m.id}: chiêu tối thượng ${m.ult} phải thuộc công pháp và có ult`);
  if (!/^[0-9a-f]{6}$/i.test(m.color)) err(`method ${m.id}: màu phải là hex 6 ký tự`);
  if (m.passive.kind === 'kiem_y' || m.passive.kind === 'the') {
    if (!(m.passive.max! >= 1 && m.passive.max! <= 9 && m.passive.perStack! > 0 && m.passive.decay! > 0)) err(`method ${m.id}: nội tại thiếu max/perStack/decay`);
  }
  needStr(`method.${m.id}.name`);
  needStr(`method.${m.id}.desc`);
  needStr(`method.${m.id}.passive`);
  needStr(`method.${m.id}.role`);
  const dash = SKILL.get(m.dash);
  if (!dash || dash.method !== m.id || dash.kind !== 'dash') err(`method ${m.id}: chiêu lướt ${m.dash} phải thuộc công pháp và có kind dash`);
}
// Quy tắc thời gian/liên hoàn (K-2): hitAt trùng nhịp pose, combo, cường hóa, lướt.
const SKILL_IDS = new Set(ALL_SKILLS.map((s) => s.id));
for (const s of ALL_SKILLS) for (const m of validateSkillRules(s, s.pose ? POSE.get(s.pose) : undefined, SKILL_IDS)) err(m);
// K-5: pose theo đòn trong chuỗi và theo giọng công pháp phải đủ bộ và khớp nhịp từng đòn.
for (const s of ALL_SKILLS) {
  if (!s.pose) continue;
  const hits = s.combo?.hits.length ?? 1;
  const ids = poseIdsFor(s.pose, hits);
  // `poseIdsFor` liệt kê theo giọng rồi theo đòn: đòn thứ n = n % hits.
  ids.forEach((id, i) => {
    const p = POSE.get(id);
    if (!p) return err(`skill ${s.id}: thiếu pose ${id} (đòn/giọng của pose ${s.pose})`);
    const hitAt = s.combo ? s.combo.hits[i % hits].hitAt : s.hitAt?.[0];
    if (hitAt !== undefined && p.hit && Math.abs(p.hit[0] - hitAt) > 0.03) err(`skill ${s.id}: hitAt ${hitAt} lệch hit[0] = ${p.hit[0]} của pose ${id}`);
    if (s.recovery !== undefined && hitAt !== undefined && Math.abs(hitAt + s.recovery - p.duration) > 0.06) err(`skill ${s.id}: hitAt + recovery lệch độ dài pose ${id} (${p.duration}s)`);
  });
}
for (const [from, to] of Object.entries(SKILL_ID_ALIASES)) {
  if (SKILL.has(from)) err(`SKILL_ID_ALIASES: ${from} vẫn còn là chiêu, không thể là id cũ`);
  if (!SKILL.has(to)) err(`SKILL_ID_ALIASES: ${from} → ${to} không phải chiêu`);
}
for (const s of METHOD_SKILLS) {
  if (!s.method || !METHOD.has(s.method)) err(`skill ${s.id}: công pháp không tồn tại ${s.method}`);
  if (s.ult && (s.mp !== 0 || s.cd !== 0)) err(`skill ${s.id}: chiêu tối thượng chỉ giới hạn bằng vòng sạc (mp, cd phải 0)`);
  if (s.kind === 'taunt' && !(s.radius! > 0 && s.duration! > 0)) err(`skill ${s.id}: khiêu khích cần radius và duration`);
  if (s.kind === 'guard' && !(s.reduce! > 0 && s.reduce! <= 0.9 && s.duration! > 0)) err(`skill ${s.id}: giữ cần reduce (0–0,9) và duration`);
  if ((s.kind === 'hot' || s.kind === 'revive') && !(s.allyRadius! > 0)) err(`skill ${s.id}: cần allyRadius`);
  if (s.kind === 'hot' && !(s.duration! > 0)) err(`skill ${s.id}: hồi theo thời gian cần duration`);
}
for (const [id, v] of Object.entries(VARIANTS)) {
  const sk = SKILL.get(id);
  if (!sk) {
    err(`variants: chiêu không tồn tại ${id}`);
    continue;
  }
  if (sk.ult) err(`variants ${id}: chiêu tối thượng không có biến thức`);
  if (v.a.id !== 'a' || v.b.id !== 'b') err(`variants ${id}: id biến thức phải là a và b`);
  if (v.a.fx === v.b.fx) err(`variants ${id}: hai biến thức dùng chung fx`);
  needStr(`skill.${id}.var.a.name`);
  needStr(`skill.${id}.var.a.desc`);
  needStr(`skill.${id}.var.b.name`);
  needStr(`skill.${id}.var.b.desc`);
  for (const x of [v.a, v.b]) {
    const kindOk =
      (x.hits || x.pierce || x.cleave || x.trail || x.stunOnInterrupt || x.markBonus || x.markSpread) ? sk.kind === 'damage' || sk.kind === 'aoe' : true;
    if (!kindOk) err(`variants ${id}.${x.id}: tham số sát thương trên chiêu ${sk.kind}`);
    if (x.ally && sk.kind !== 'shield') err(`variants ${id}.${x.id}: ally chỉ cho lá chắn`);
    if (x.hot && sk.kind !== 'heal') err(`variants ${id}.${x.id}: hot chỉ cho chiêu hồi tức thì`);
    if (x.hits && x.hits.some((h) => !(h > 0))) err(`variants ${id}.${x.id}: hits phải dương`);
  }
}
for (const s of ALL_SKILLS) {
  if (!s.ult && s.kind !== 'revive' && !VARIANTS[s.id] && !s.method) err(`skill ${s.id}: chiêu chung thiếu biến thức A/B`);
}
for (const id of ['itm_bi_tich_tan_quyen']) if (!ITEM.has(id)) err(`thiếu vật phẩm ${id}`);


for (const it of ITEMS) {
  needStr(`item.${it.id}.name`);
  needStr(`item.${it.id}.desc`);
  if (isEquipSlot(it.kind) && it.stack !== 1) err(`item ${it.id}: trang bị phải stack = 1`);
  if (it.price > 0 && it.sell >= it.price) err(`item ${it.id}: giá bán >= giá mua (lỗ hổng kiếm tiền vô hạn)`);
}
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
      if (y.ore * orePrice >= it.price || y.dust > 0) err(`${it.id}: phân giải (+${plus}) ra ${y.ore} Thiết Tinh/${y.dust} Linh Trần, giá trị >= giá mua ${it.price} (lỗ hổng mua-rồi-phân-giải)`);
    }
  }
  for (const [role, name] of Object.entries(GLOSSARY.party.roles)) {
    if (t(`ui.party.role.${role}`) !== name) err(`vai trò tổ đội ${role}: tên lệch glossary.party.roles`);
  }
  for (const m of METHODS) {
    if (t(`method.${m.id}.role`) !== GLOSSARY.party.roles[m.role]) err(`công pháp ${m.id}: tên vai trò lệch glossary.party.roles`);
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
// ---- trang bị 8 ô (Phase 3-1) ----
{
  const sys = ITEM_SYS;
  const where = 'equipment';
  if (sys.slots.map((x) => x.id).join() !== EQUIP_SLOTS.join()) err(`${where}: slots.json phải đúng thứ tự EQUIP_SLOTS (${EQUIP_SLOTS.join(', ')})`);
  for (const sd of sys.slots) {
    needStr(`ui.equip.${sd.id}`);
    needStr(`ui.item.kind.${sd.id}`);
    if (GLOSSARY.equipSlots[sd.id as keyof typeof GLOSSARY.equipSlots] !== t(`ui.equip.${sd.id}`)) err(`${where}: tên ô ${sd.id} lệch glossary.equipSlots`);
    if (!(sd.weight >= 0 && sd.weight <= 3)) err(`slot ${sd.id}: weight phải trong [0, 3]`);
    const shares = Object.entries(sd.main);
    const sum = shares.reduce((s, [, v]) => s + (v ?? 0), 0);
    if (sd.weight > 0 && Math.abs(sum - 1) > 1e-9) err(`slot ${sd.id}: tổng chia dòng chính phải bằng 1 (đang ${sum})`);
    if (sd.weight === 0 && shares.length) err(`slot ${sd.id}: weight 0 thì không có dòng chính`);
    for (const [k] of shares) if (!(k in STAT_PER_POINT)) err(`slot ${sd.id}: chỉ số chính lạ ${k}`);
  }
  if (sys.qualities.length !== QUALITY_COUNT || QUALITY_MUL.length !== QUALITY_COUNT) err(`${where}: phải có ${QUALITY_COUNT} phẩm khớp QUALITY_MUL`);
  sys.qualities.forEach((q, i) => {
    if (q.id !== i) err(`quality ${i}: id phải bằng chỉ số`);
    needStr(`ui.quality.${i}`);
    if (GLOSSARY.qualities[i] !== t(`ui.quality.${i}`)) err(`${where}: tên phẩm ${i} lệch glossary.qualities`);
    if (q.affixes !== i) err(`quality ${i}: số dòng phụ phải bằng ${i} (thiết kế 3.2)`);
    if (!(q.affixFrac >= 0 && q.affixFrac < 0.6) || (i === 0) !== (q.affixFrac === 0)) err(`quality ${i}: affixFrac không hợp lệ`);
    if (!/^#[0-9a-fA-F]{6}$/.test(q.color)) err(`quality ${i}: màu không hợp lệ`);
    if (i > 0 && !(q.affixFrac >= sys.qualities[i - 1].affixFrac)) err(`quality ${i}: affixFrac phải không giảm`);
  });
  if (sys.affixes.length !== 14) err(`${where}: phải có đúng 14 loại dòng phụ (đang ${sys.affixes.length})`);
  const slotIds = new Set<string>(EQUIP_SLOTS);
  for (const a of sys.affixes) {
    needStr(`ui.affix.${a.id}`);
    if (!(a.min > 0 && a.max >= a.min && a.max < 1)) err(`affix ${a.id}: khoảng giá trị không hợp lệ`);
    if (!(a.weight > 0)) err(`affix ${a.id}: weight phải > 0`);
    for (const s of a.slots ?? []) if (!slotIds.has(s)) err(`affix ${a.id}: ô lạ ${s}`);
    if (a.param && !sys.params[a.param]?.length) err(`affix ${a.id}: thiếu danh sách tham số ${a.param}`);
    if (a.param && !t(`ui.affix.${a.id}`).includes('{p}')) err(`affix ${a.id}: chuỗi phải có {p}`);
    if (!t(`ui.affix.${a.id}`).includes('{v}')) err(`affix ${a.id}: chuỗi phải có {v}`);
  }
  if (new Set(sys.affixes.map((a) => a.id)).size !== sys.affixes.length) err(`${where}: id dòng phụ trùng`);
  for (const sk of sys.params.skill) if (!SKILLS.some((s) => s.id === sk)) err(`${where}: chiêu không tồn tại ${sk}`);
  if (sys.params.element.join() !== ELEMENTS.join()) err(`${where}: params.element phải là ${ELEMENTS.join(', ')}`);
  for (const e of sys.params.element) needStr(`ui.element.${e}`);
  // Mọi ô có chỉ số phải có đủ dòng phụ hợp lệ để roll đủ phẩm Thiên (4 dòng khác nhau).
  for (const sd of sys.slots) {
    if (sd.weight <= 0) continue;
    const pool = sys.affixes.filter((a) => !a.slots || a.slots.includes(sd.id)).reduce((n, a) => n + (a.param ? sys.params[a.param].length : 1), 0);
    if (pool < sys.qualities[QUALITY_COUNT - 1].affixes) err(`slot ${sd.id}: không đủ dòng phụ để roll phẩm cao nhất`);
  }
  // Mô phỏng nhanh: roll nhiều lần mọi ô × phẩm phải qua parseInst, không vượt ngân sách, số dòng đúng.
  const rng = seededRng(20261115);
  for (const sd of sys.slots) {
    for (let q = 0; q < QUALITY_COUNT; q++) {
      for (const ilvl of [1, 8, AFFIX_ILVL_CAP, 30]) {
        for (let n = 0; n < 40; n++) {
          const inst = rollItemInstance(sys, sd.id, ilvl, q as 0, rng);
          if (!parseInst(sys, sd.id, inst)) err(`roll ${sd.id}/q${q}/ilvl${ilvl}: parseInst từ chối kết quả roll`);
          if (inst.affixes.length !== (sd.weight > 0 ? q : 0)) err(`roll ${sd.id}/q${q}: số dòng phụ sai (${inst.affixes.length})`);
          const bound = budget(ilvl, q as 0, sd.weight) * 1.06;
          const mainPts = Object.entries(inst.main).reduce((s, [k, v]) => s + (v ?? 0) / STAT_PER_POINT[k as 'atk'], 0);
          if (mainPts > bound + 2) err(`roll ${sd.id}/q${q}/ilvl${ilvl}: dòng chính ${mainPts.toFixed(1)} vượt ngân sách ${bound.toFixed(1)}`);
        }
      }
    }
  }
  // Mẫu trang bị: kind khớp ô hợp lệ, reqLevel có mặt.
  for (const it of ITEMS) {
    if (isEquipSlot(it.kind) && (it.reqLevel ?? 0) < 1) err(`item ${it.id}: trang bị phải có reqLevel`);
  }
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

  checkMonSkills(m, ai, id);
}

/** Kiểm nguyên tắc quái mở rộng (E1-E): thời gian báo đủ để né, cd lớn hơn lần dùng, tham số trong khoảng hợp lý. */
function checkMonSkills(m: MonsterDef, ai: MonsterAi, id: string) {
  const inR = (v: unknown, lo: number, hi: number) => typeof v === 'number' && v >= lo && v <= hi;
  const mulOk = (v: unknown) => typeof v === 'number' && v > 0 && v <= 3;
  const kindOk = (c: { kind: string }, k: string) => {
    if (!KINDS.includes(c.kind)) err(`${id}: ${k}.kind không hợp lệ`);
  };
  const { line, charge, leap, burrow, reflect, summon, reveal } = ai;
  if (line) {
    kindOk(line, 'line');
    if (!inR(line.delay, 0.9, 3)) err(`${id}: line.delay phải trong [0,9; 3] giây`);
    if (!(line.cd > line.delay + 2)) err(`${id}: line.cd phải lớn hơn delay + 2`);
    if (!mulOk(line.mul)) err(`${id}: line.mul phải trong (0, 3]`);
    if (!(inR(line.r, 2, 20) && line.r > m.attackRange)) err(`${id}: line.r phải trong (attackRange, 20]`);
    if (!inR(line.w, 0.5, 6)) err(`${id}: line.w phải trong [0,5; 6] mét`);
    if (!(line.range > 0 && line.range <= line.r)) err(`${id}: line.range phải trong (0, r]`);
  }
  if (charge) {
    kindOk(charge, 'charge');
    if (!inR(charge.delay, 0.9, 3)) err(`${id}: charge.delay phải trong [0,9; 3] giây`);
    if (!(charge.cd > charge.delay + 3)) err(`${id}: charge.cd phải lớn hơn delay + 3`);
    if (!mulOk(charge.mul)) err(`${id}: charge.mul phải trong (0, 3]`);
    if (!inR(charge.w, 0.5, 6)) err(`${id}: charge.w phải trong [0,5; 6] mét`);
    if (!inR(charge.speed, 8, 30)) err(`${id}: charge.speed phải trong [8; 30] m/s`);
    if (!(inR(charge.min, 2, 20) && charge.range > charge.min && charge.range <= 30)) err(`${id}: charge cần 2 <= min < range <= 30`);
    if (!(inR(charge.r, 4, 30) && charge.r >= charge.min)) err(`${id}: charge.r phải trong [4; 30] và >= min`);
  }
  if (leap) {
    kindOk(leap, 'leap');
    if (!inR(leap.delay, 0.8, 3)) err(`${id}: leap.delay phải trong [0,8; 3] giây`);
    if (!(leap.cd > leap.delay + 2)) err(`${id}: leap.cd phải lớn hơn delay + 2`);
    if (!mulOk(leap.mul)) err(`${id}: leap.mul phải trong (0, 3]`);
    if (!inR(leap.r, 1, 8)) err(`${id}: leap.r phải trong [1; 8] mét`);
    if (!(inR(leap.min, 2, 20) && leap.range > leap.min && leap.range <= 24)) err(`${id}: leap cần 2 <= min < range <= 24`);
  }
  if (burrow) {
    kindOk(burrow, 'burrow');
    if (!inR(burrow.hide, 1.2, 4)) err(`${id}: burrow.hide phải trong [1,2; 4] giây`);
    if (!(Number.isInteger(burrow.n) && inR(burrow.n, 1, 4))) err(`${id}: burrow.n phải là số nguyên 1–4`);
    if (!inR(burrow.r, 1, 8)) err(`${id}: burrow.r phải trong [1; 8] mét`);
    if (!inR(burrow.spread, 2, 12)) err(`${id}: burrow.spread phải trong [2; 12] mét`);
    if (!(burrow.range > 0 && burrow.range <= 30)) err(`${id}: burrow.range phải trong (0, 30]`);
    if (!mulOk(burrow.mul)) err(`${id}: burrow.mul phải trong (0, 3]`);
    const c = burrow.cone;
    if (!c) err(`${id}: burrow thiếu cone`);
    else {
      if (!inR(c.delay, 1.2, 3)) err(`${id}: burrow.cone.delay phải trong [1,2; 3] giây`);
      if (!inR(c.r, 4, 20)) err(`${id}: burrow.cone.r phải trong [4; 20] mét`);
      if (!inR(c.w, 5, 75)) err(`${id}: burrow.cone.w (nửa góc, độ) phải trong [5; 75]`);
      if (!mulOk(c.mul)) err(`${id}: burrow.cone.mul phải trong (0, 3]`);
      if (!(burrow.cd > burrow.hide + c.delay + 3)) err(`${id}: burrow.cd phải lớn hơn hide + cone.delay + 3`);
    }
  }
  if (reflect) {
    if (!inR(reflect.warn, 0.6, 3)) err(`${id}: reflect.warn phải trong [0,6; 3] giây (thấy cờ trước khi phản)`);
    if (!inR(reflect.dur, 1, 6)) err(`${id}: reflect.dur phải trong [1; 6] giây`);
    if (!(reflect.ratio > 0 && reflect.ratio <= 1)) err(`${id}: reflect.ratio phải trong (0, 1]`);
    if (!(reflect.cap > 0 && reflect.cap <= 0.5)) err(`${id}: reflect.cap phải trong (0; 0,5] máu tối đa người đánh`);
    if (!(reflect.take >= 0 && reflect.take < 1)) err(`${id}: reflect.take phải trong [0, 1)`);
    if (!(reflect.cd >= reflect.warn + reflect.dur + 3)) err(`${id}: reflect.cd phải >= warn + dur + 3`);
  }
  if (summon) {
    const mm = MONSTER.get(summon.mon);
    if (!mm) err(`${id}: summon.mon không tồn tại ${summon.mon}`);
    else {
      if (mm.boss || mm.elite) err(`${id}: summon.mon phải là quái thường`);
      if (mm.ai && monSkillsOf(mm.ai).includes('summon')) err(`${id}: đệ tử không được tự gọi đệ tử`);
      if (mm.id === m.id) err(`${id}: không tự gọi chính mình`);
    }
    if (!(Number.isInteger(summon.n) && inR(summon.n, 1, 4))) err(`${id}: summon.n phải là số nguyên 1–4`);
    if (!(Number.isInteger(summon.max) && inR(summon.max, summon.n, 8))) err(`${id}: summon.max phải là số nguyên trong [n; 8]`);
    if (!inR(summon.r, 2, 12)) err(`${id}: summon.r phải trong [2; 12] mét`);
    if (!inR(summon.delay, 1, 4)) err(`${id}: summon.delay phải trong [1; 4] giây`);
    if (!(summon.cd >= 6)) err(`${id}: summon.cd phải >= 6 giây`);
  }
  if (reveal) {
    if (!inR(reveal.dur, 1, 8)) err(`${id}: reveal.dur phải trong [1; 8] giây`);
    if (!(reveal.mul > 1 && reveal.mul <= 3)) err(`${id}: reveal.mul phải trong (1, 3]`);
    if (reveal.guard !== undefined && !(reveal.guard > 0 && reveal.guard <= 1)) err(`${id}: reveal.guard phải trong (0, 1]`);
    if (reveal.posture !== undefined && !(reveal.posture > 0 && reveal.posture <= 1)) err(`${id}: reveal.posture phải trong (0, 1]`);
    if (reveal.posture !== undefined && !m.posture) err(`${id}: reveal.posture cần quái có thanh phá thế (posture)`);
    if (reveal.after) {
      if (!['charge', 'leap', 'burrow'].includes(reveal.after)) err(`${id}: reveal.after phải là charge, leap hoặc burrow`);
      else if (!ai[reveal.after]) err(`${id}: reveal.after = ${reveal.after} nhưng quái không có chiêu đó`);
    } else if (!(reveal.cd >= reveal.dur + 2)) err(`${id}: reveal.cd phải >= dur + 2`);
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
function checkEquipLoot(id: string, l: LootDef) {
  const m = MONSTER.get(id);
  const want = !m ? undefined : m.boss ? 'boss' : m.elite ? 'elite' : undefined;
  if (want && l.src !== want) err(`loot ${id}: src phải là '${want}'`);
  if (!want && l.src !== 'common' && l.src !== 'dungeon') err(`loot ${id}: quái thường có src 'common' hoặc 'dungeon'`);
  if (!l.src) return;
  const rolls = l.equip ?? [];
  if (!rolls.length) err(`loot ${id}: thiếu bảng rơi trang bị (equip)`);
  const slots = droppableSlots(ITEM_SYS, ITEMS);
  rolls.forEach((r, i) => {
    const w = `loot ${id}/equip[${i}]`;
    if (!(r.chance > 0 && r.chance <= 1)) err(`${w}: chance phải trong (0, 1]`);
    if (!Array.isArray(r.q) || r.q.length !== QUALITY_COUNT || r.q.some((x) => !(x >= 0)) || !r.q.some((x) => x > 0)) err(`${w}: q phải là ${QUALITY_COUNT} trọng số >= 0, có ít nhất một số dương`);
    if (r.set && !SETS.some((x) => x.id === r.set)) err(`${w}: bộ không tồn tại ${r.set}`);
    for (const k of Object.keys(r.slots ?? {})) if (!slots.includes(k as EquipSlot)) err(`${w}: ô ${k} không rơi được`);
    if (r.ilvlBonus !== undefined && !(Number.isInteger(r.ilvlBonus) && r.ilvlBonus >= 0 && r.ilvlBonus <= 3)) err(`${w}: ilvlBonus phải nguyên trong [0; 3]`);
    const tot = r.q.reduce((a, b) => a + b, 0) || 1;
    const lo = r.q.findIndex((x) => x > 0);
    // Phẩm theo nguồn (thiết kế 3.2): quái thường chỉ Phàm/Linh; tinh anh từ Linh, tối đa Địa; Thiên chỉ boss.
    const hi = r.q.reduce((a, x, k) => (x > 0 ? k : a), 0);
    if (l.src === 'common' && hi > 1) err(`${w}: quái thường chỉ rơi Phàm/Linh phẩm`);
    if (l.src === 'dungeon' && hi > 3) err(`${w}: bí cảnh thường chỉ rơi tới Địa phẩm`);
    if (l.src === 'elite' && i === 0 && (hi > 3 || r.q[2] / tot < 0.3)) err(`${w}: tinh anh chủ yếu Huyền phẩm, tối đa Địa phẩm`);
    if (l.src === 'boss' && i === 0 && lo < 2) err(`${w}: boss chỉ rơi từ Huyền phẩm`);
  });
  if (l.src === 'boss' && !(rolls[0]?.chance === 1)) err(`loot ${id}: boss phải chắc chắn rơi một món (equip[0].chance = 1)`);
}
for (const id of LOOT.keys()) if (!MONSTER.has(id)) err(`loot: quái không tồn tại ${id}`);
for (const [id, l] of LOOT) checkEquipLoot(id, l);
// Mọi ô có chỉ số phải có mẫu để rơi ở mọi ilvl >= 1.
for (const s of ITEM_SYS.slots) {
  if (s.weight > 0 && templatesFor(ITEMS, s.id, 1).length === 0) err(`ô ${s.id}: thiếu mẫu có reqLevel <= 1 để rơi ở ilvl 1`);
}
// Tinh anh: máu gấp ~4 quái thường cùng loài, có ít nhất một kỹ năng riêng, có tên và biệt hiệu.
for (const m of MONSTERS) {
  if (!m.elite) continue;
  if (m.boss) err(`monster ${m.id}: elite và boss loại trừ nhau`);
  if (!(m.hpMul >= 4)) err(`monster ${m.id}: tinh anh phải có hpMul >= 4`);
  if (!(m.ai?.caster || m.ai?.slam || m.ai?.sweep || m.ai?.chant || (m.ai && monSkillsOf(m.ai).some((k) => k !== 'reveal')))) err(`monster ${m.id}: tinh anh cần một kỹ năng riêng (caster/slam/sweep/chant/line/charge/leap/burrow/reflect/summon)`);
  needStr(`mon.${m.id}.title`);
}

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
for (const s of ALL_SKILLS) {
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

// ---- bộ trang bị (P3-4) ----
{
  const LOOT_SETS = new Set<string>();
  for (const l of LOOT.values()) for (const r of l.equip ?? []) if (r.set) LOOT_SETS.add(r.set);
  const FX = ['phi_kiem_extra', 'shield_boost', 'heal_share', 'crit_slow', 'hoanh_kiem', 'kim_chung', 'moc_linh'];
  const hex = /^#[0-9a-fA-F]{6}$/;
  uniqueIds('set', SETS);
  for (const st of SETS) {
    const w = `set ${st.id}`;
    needStr(`set.${st.id}.name`);
    if (t(`set.${st.id}.name`) !== (GLOSSARY.sets as Record<string, string>)[st.id]) err(`${w}: tên lệch glossary.sets`);
    if (st.pieces.length < 3 || st.pieces.length > 4) err(`${w}: bộ gồm 3-4 món`);
    const slots = new Set<string>();
    for (const pid of st.pieces) {
      const it = ITEM.get(pid);
      if (!it) { err(`${w}: món không tồn tại ${pid}`); continue; }
      if (it.set !== st.id) err(`${w}: ${pid} phải có set = ${st.id}`);
      if (!isEquipSlot(it.kind)) err(`${w}: ${pid} không phải trang bị`);
      if (slots.has(it.kind)) err(`${w}: hai món cùng ô ${it.kind}`);
      slots.add(it.kind);
      if (t(`item.${pid}.name`) !== (GLOSSARY.gear as Record<string, string>)[pid]) err(`${w}: tên ${pid} lệch glossary.gear`);
      needStr(`item.${pid}.desc`);
    }
    if (st.tiers.length !== 2 || st.tiers[0].n !== 2 || !(st.tiers[1].n > 2 && st.tiers[1].n <= st.pieces.length)) err(`${w}: cần bậc 2 món (chỉ số) và một bậc cao ≤ số món`);
    st.tiers.forEach((tr, i) => {
      if (tr.fx && !FX.includes(tr.fx)) err(`${w}: fx lạ ${tr.fx}`);
      if (tr.fx) { needStr(`set.fx.${tr.fx}`); if (!(tr.v! > 0)) err(`${w}: bậc ${i} thiếu v`); }
      if (!tr.fx && !(tr.lines?.length)) err(`${w}: bậc ${i} trống`);
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
    if (f.reqLevel !== undefined && f.reqLevel !== (out ? (out.reqLevel ?? 1) : -1)) err(`${w}: reqLevel phải bằng reqLevel của thành phẩm`);
    for (const i of f.inputs) needItem(i.id, w);
    if (f.q.length !== QUALITY_COUNT || f.q.some((x) => !(x >= 0)) || !f.q.some((x) => x > 0)) err(`${w}: q sai`);
    if (f.q[4] > 0 || f.q[3] / (f.q.reduce((a, b) => a + b, 0) || 1) > 0.3) err(`${w}: chế tạo không ra Thiên phẩm, Địa phẩm ≤ 30%`);
    if (!(f.ilvl >= 1 && f.ilvl <= 99) || !(f.gold >= 0)) err(`${w}: ilvl/gold sai`);
  }
}
// ---- bậc trang bị và Thăng Bậc (E2-F) ----
{
  if (!(TIER_MUL.length === MAX_TIER + 1 && TIER_MUL.every((m, i) => i < 2 || m > TIER_MUL[i - 1]))) err('TIER_MUL phải tăng theo bậc');
  for (let to = 2; to <= TIER_OPEN; to++) {
    const mat = PROMOTE_MAT[to];
    if (!mat || !ITEM.has(mat)) err(`bậc ${to}: thiếu nguyên liệu Thăng Bậc ${mat}`);
    else if (t(`item.${mat}.name`) !== (GLOSSARY.materials as Record<string, string>)[mat]) err(`${mat}: tên lệch glossary.materials`);
  }
  for (const it of ITEMS) {
    if (!isEquipSlot(it.kind) || it.kind === 'artifact') continue;
    const tier = itemTier(it.id);
    if (it.tier !== undefined && !(Number.isInteger(it.tier) && it.tier >= 1 && it.tier <= MAX_TIER)) err(`${it.id}: tier ${it.tier} ngoài [1; ${MAX_TIER}]`);
    if (tier >= 2 && (it.reqLevel ?? 1) < (TIER_MIN_ILVL[tier] ?? 1) - 1) err(`${it.id}: reqLevel ${it.reqLevel} quá thấp cho bậc ${tier}`);
    if (tier > TIER_OPEN) err(`${it.id}: bậc ${tier} chưa mở (TIER_OPEN = ${TIER_OPEN})`);
    if (it.promoteTo) {
      const to = ITEM.get(it.promoteTo);
      if (!to) err(`${it.id}: promoteTo không tồn tại ${it.promoteTo}`);
      else if (to.kind !== it.kind || itemTier(to.id) !== tier + 1) err(`${it.id}: promoteTo ${to.id} phải cùng ô và bậc ${tier + 1}`);
    }
    // Mọi món bậc thấp hơn bậc cao nhất đang mở đều phải thăng được.
    if (tier < TIER_OPEN && !promoteTarget(it.id)) err(`${it.id}: không có đích Thăng Bậc`);
    if (it.set) for (const o of SETS.find((x) => x.id === it.set)?.pieces ?? []) if (itemTier(o) !== tier) err(`bộ ${it.set}: ${o} khác bậc với ${it.id}`);
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
// ---- linh căn ngũ hành và bình cảnh (P3-7) ----
uniqueIds('root', ROOTS);
if (ROOTS.map((r) => r.id).join() !== ROOT_IDS.join()) err(`roots.json phải đủ năm linh căn theo thứ tự ${ROOT_IDS.join(', ')}`);
for (const r of ROOTS) {
  needStr(`root.${r.id}.name`);
  needStr(`root.${r.id}.desc`);
  needStr(`elem.${r.id}`);
  if (!(ELEMENTS as readonly string[]).includes(r.elem)) err(`root ${r.id}: hệ ${r.elem} không hợp lệ`);
  if (!(r.elemDmg > 0 && r.elemDmg <= 0.1)) err(`root ${r.id}: elemDmg phải trong (0; 0,1] (thiết kế: +8%)`);
  const vals = Object.values(r.stat);
  if (vals.length !== 1 || !(vals[0]! > 0 && vals[0]! <= 0.05)) err(`root ${r.id}: đúng một chỉ số phụ, tối đa +5%`);
}
for (const s of SKILLS) if (s.elem !== undefined && !(ELEMENTS as readonly string[]).includes(s.elem)) err(`skill ${s.id}: elem ${s.elem} không hợp lệ`);
for (const m of MONSTERS) if (m.elem !== undefined && !(ELEMENTS as readonly string[]).includes(m.elem)) err(`quái ${m.id}: elem ${m.elem} không hợp lệ`);
// Mỗi tinh anh/boss có hệ (khắc chế ngũ hành, 3-10): người chơi cần đọc được hệ để chọn chiêu.
for (const m of MONSTERS) if ((m.elite || m.boss) && !m.elem) err(`quái ${m.id}: tinh anh/boss phải có elem`);
needItem(PHA_CANH_PILL, 'Phá Cảnh Đan');
if (ITEM.get(PHA_CANH_PILL)?.use) err('Phá Cảnh Đan không có `use`: chỉ dùng qua bình cảnh (server)');
if (!RECIPES.some((r) => r.output.id === PHA_CANH_PILL)) err('thiếu công thức luyện Phá Cảnh Đan');
if (BOTTLENECK_LEVELS.join() !== '5,10,15,17,19,21,23,25,27') err('bình cảnh phải ở cấp 5, 10, 15, 17, 19, 21, 23, 25, 27');
// Thang cảnh giới (E1-C): realms.json đủ 1…MAX_LEVEL, tên đúng đại cảnh giới của glossary, xpNeed tăng đều, hệ số cảnh giới tăng.
if (REALMS.length !== MAX_LEVEL) err(`realms.json phải có ${MAX_LEVEL} cấp (đang ${REALMS.length})`);
REALMS.forEach((r, i) => {
  if (r.level !== i + 1) err(`realms.json: cấp thứ ${i + 1} ghi level ${r.level}`);
  if (r.key !== `realm.${r.level}`) err(`realms.json: cấp ${r.level} key ${r.key}`);
  const major = GLOSSARY.realms[majorRealmOf(r.level)];
  if (!t(r.key).startsWith(major)) err(`${r.key}: tên "${t(r.key)}" phải bắt đầu bằng đại cảnh giới "${major}" của glossary`);
  if (r.level > TRUC_CO_LEVEL && r.level < MAX_LEVEL && xpNeed(r.level) <= xpNeed(r.level - 1) && majorRealmOf(r.level) === majorRealmOf(r.level - 1)) err(`xpNeed(${r.level}) phải lớn hơn cấp trước`);
});
if (!t(`realm.${MAX_LEVEL}`).endsWith('sơ kỳ')) err('cấp tối đa tạm là Hóa Thần sơ kỳ');
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
    const known = ['sect', 'wild', 'forest', 'lake', 'dungeon', 'dungeon_boss', 'combat', 'boss', 'tribulation', 'meditate'];
    for (const m of as.music) if (!known.includes(m)) err(`level ${lv.id}: assets.music không biết bài ${m}`);
    if (!['default', 'dawn', 'day', 'night'].includes(as.mood)) err(`level ${lv.id}: assets.mood không hợp lệ: ${as.mood}`);
    if (as.minimap && !existsSync(new URL(`../../../apps/client/public/map/${as.minimap}.json`, import.meta.url))) err(`level ${lv.id}: thiếu nền minimap public/map/${as.minimap}.json (pnpm minimap:build --level ${lv.id})`);
  }
}
for (const id of Object.keys(LEVEL_ASSETS)) if (!LEVELS[id]) err(`levels/${id}.assets.json không có level tương ứng`);
// Vân Lam: NPC giao việc ở các điểm đáng chú ý (M-5), tên theo glossary.poiNpcs.
{
  const vl = LEVELS.van_lam;
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

// ---- Truyền Tống Trận liên level (E1-B): bản đồ đích phải có thật và là bản đồ thế giới. Kiểm chi tiết từng trận: levelcheck.ts ----
// TELE_PAD là Map toàn cục theo id (server/character tra không kèm level): id trận phải duy nhất trên mọi level.
uniqueIds('trận', [...TELE_PADS]);
for (const pad of TELE_PADS) {
  const dest = LEVELS[pad.level];
  if (!dest || dest.dungeon) err(`trận ${pad.id}: level ${pad.level} không phải bản đồ thế giới`);
}

// ---- Cổng và bí cảnh theo dữ liệu (E1-B) ----
for (const lv of Object.values(LEVELS)) {
  for (const q of lv.portals ?? []) {
    if (!LEVELS[q.to]?.dungeon) err(`level ${lv.id}: cổng dẫn tới ${q.to} không phải bí cảnh`);
    if (lv.dungeon) err(`level ${lv.id}: bí cảnh không có cổng vào bí cảnh khác`);
  }
  const d = lv.dungeon;
  if (!d) continue;
  const w = `bí cảnh ${lv.id}`;
  const ret = LEVELS[d.returnLevel];
  if (!ret || ret.dungeon) err(`${w}: returnLevel ${d.returnLevel} không phải bản đồ thế giới`);
  // Sân độ kiếp (E1-F) vào bằng vé của kiếp, không có cổng và không có đợt quái.
  if (lv.tribulation) {
    if (d.waves.length) err(`${w}: sân độ kiếp không có đợt quái`);
  } else {
    if (!(ret?.portals ?? []).some((q) => q.to === lv.id)) err(`${w}: ${d.returnLevel} không có cổng dẫn vào`);
    if (!d.waves.length) err(`${w}: thiếu đợt quái`);
  }
  for (const wv of d.waves) for (const g of wv.mons) if (!MONSTER.get(g.id)) err(`${w}: quái ${g.id} không tồn tại`);
  for (const pt of [d.spawn, d.exit, d.center]) if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${w}: điểm (${pt.x}, ${pt.z}) ngoài bản đồ`);
}
if (!LEVELS.van_lam.spawn) err('van_lam: thiếu spawn');

// ---- Độ kiếp theo dữ liệu (E1-F) ----
{
  const peaks = new Set<number>(PEAK_LEVELS);
  const seenFrom = new Set<number>();
  for (const id of TRIB_IDS) {
    const d = TRIB_DEFS[id];
    const w = `độ kiếp ${id}`;
    if (!peaks.has(d.from) || d.to !== d.from + 1) err(`${w}: from ${d.from} phải là đại viên mãn và to = from + 1`);
    if (seenFrom.has(d.from)) err(`${w}: hai kiếp cùng from ${d.from}`);
    seenFrom.add(d.from);
    if (d.item !== null && !ITEM.get(d.item)) err(`${w}: vật phẩm đột phá ${d.item} không tồn tại`);
    if (d.enabled && d.item === null) err(`${w}: bật (enabled) mà chưa có vật phẩm đột phá`);
    if (d.room !== 'world' && d.room !== 'tribulation') err(`${w}: room phải là world hoặc tribulation`);
    if (!(d.duration > 0) || !(d.firstDelay >= 0) || !(d.failXpLoss >= 0 && d.failXpLoss <= 0.5) || !(d.pillMax >= 0)) err(`${w}: thời lượng/phạt/đan ngoài khoảng`);
    if (!d.phases.length) err(`${w}: thiếu pha`);
    let prev = 0;
    const ids = new Set<string>();
    d.phases.forEach((p, i) => {
      const pw = `${w}, pha ${p.id}`;
      if (ids.has(p.id)) err(`${pw}: trùng id pha`);
      ids.add(p.id);
      if (!(p.end > prev)) err(`${pw}: mốc end phải tăng dần`);
      prev = p.end;
      if (i === d.phases.length - 1 && p.end !== d.duration) err(`${pw}: pha cuối phải kết thúc đúng lúc duration (${d.duration})`);
      if (!(p.gap > 0) || (p.gapEnd !== undefined && !(p.gapEnd > 0))) err(`${pw}: gap phải > 0`);
      if (p.extra && (p.extraR === undefined || p.extraPct === undefined)) err(`${pw}: có extra thì cần extraR và extraPct`);
      for (const pct of [p.aimPct, p.extraPct, p.net?.pct, p.final?.pct, p.grid?.pct]) if (pct !== undefined && !(pct >= 0 && pct <= 0.9)) err(`${pw}: phần trăm sát thương ngoài [0, 0,9]`);
      if (p.kind === 'hoa' && !p.grid) err(`${pw}: pha hoa cần grid`);
      if (p.grid && p.grid.pick > p.grid.cols * p.grid.rows) err(`${pw}: pick vượt số ô`);
      if (p.final && p.final.guardShare !== undefined && !(p.final.guardShare >= 0 && p.final.guardShare <= 0.6)) err(`${pw}: guardShare ngoài [0, 0,6]`);
      if (p.mechanic && !(TRIB_MECHANIC_IDS as readonly string[]).includes(p.mechanic)) err(`${pw}: cơ chế ${p.mechanic} chưa đăng ký`);
      if (p.shadows && !MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma`);
      needStr(`ui.trib.${id}.${p.id}`);
      needStr(`ui.trib.${id}.${p.id}.hint`);
      if (p.final) needStr(`ui.trib.${id}.${p.id}.hint2`);
    });
    needStr(`ui.trib.${id}.title`);
  }
  if (TRIB_DEFS.truc_co.room !== 'world' || !TRIB_DEFS.truc_co.enabled) err('độ kiếp truc_co: phải chạy ở room world và đang bật');
}

// ---- Pháp bảo phụ và đan (P3-8) ----
uniqueIds('artifact', ARTIFACTS);
for (const a of ARTIFACTS) {
  const w = `pháp bảo ${a.id}`;
  const def = ITEM.get(a.id);
  if (!def || def.kind !== 'artifact') err(`${w}: vật phẩm phải có kind artifact`);
  if (!fs.existsSync(fileURLToPath(new URL(`../../../assets/source/prop/${a.asset}/meta.json`, import.meta.url)))) err(`${w}: thiếu assets/source/prop/${a.asset}/meta.json`);
  for (const k of [`item.${a.id}.name`, `item.${a.id}.desc`, `art.${a.id}.skill`, `art.${a.id}.skill.desc`, `art.passive.${a.passive.kind}`]) needStr(k);
  if (t(`item.${a.id}.name`) !== (GLOSSARY.artifacts as Record<string, string>)[a.id]) err(`${w}: tên lệch glossary.artifacts`);
  if (!(a.cd > 0) || !(a.radius > 0) || !(a.power > 0)) err(`${w}: cd, radius, power phải > 0`);
  if (a.passive.per * ARTIFACT_MAX_LEVEL > 0.3) err(`${w}: nội tại cấp tối đa quá 30%`);
  if (!RECIPES.some((r) => r.output.id === a.id)) err(`${w}: không có công thức chế`);
}
for (const k of ['drain', 'seal', 'shield']) if (!ARTIFACTS.some((a) => a.kind === k)) err(`thiếu pháp bảo loại ${k}`);
if (new Set(ARTIFACTS.map((a) => a.skill)).size !== ARTIFACTS.length) err('hai pháp bảo dùng chung khóa hồi chiêu');
for (const k of ['base', 'support', 'potency'] as const) if (PILL_QUALITY[k].length !== PILL_TIERS) err(`alchemy.quality.${k} cần ${PILL_TIERS} phần tử`);
for (const k of ['base', 'support'] as const) if (Math.abs(PILL_QUALITY[k].reduce((a, b) => a + b, 0) - 1) > 1e-6) err(`alchemy.quality.${k} phải cộng bằng 1`);
if (PILL_QUALITY.potency.some((x, i) => i > 0 && x < PILL_QUALITY.potency[i - 1])) err('alchemy.quality.potency phải không giảm theo phẩm');
if (PILL_QUALITY.potency.some((x) => x > 1.6)) err('alchemy.quality.potency quá 1,6 (phá nhịp lên cấp)');
GLOSSARY.pillQualities.forEach((nm, i) => { if (t(`ui.pill.q${i}`) !== nm) err(`phẩm đan ${i}: tên lệch glossary.pillQualities`); });
for (const it of ITEMS) {
  const b = it.use?.buff;
  if (!b) continue;
  if (!PILL_BUFF_KINDS.includes(b.kind)) err(`${it.id}: loại buff ${b.kind} lạ`);
  if (!(b.pct > 0 && b.pct <= 0.2) || !(b.sec > 0 && b.sec <= 900)) err(`${it.id}: buff ngoài khoảng (pct ≤ 20%, ≤ 15 phút)`);
  if (t(`item.${it.id}.name`) !== (GLOSSARY.pills as Record<string, string>)[it.id]) err(`${it.id}: tên lệch glossary.pills`);
  if (!RECIPES.some((r) => r.output.id === it.id)) err(`${it.id}: không có công thức luyện`);
}
for (const r of RECIPES) {
  if (r.quality && ITEM.get(r.output.id)?.kind !== 'consumable') err(`${r.id}: chỉ đan (consumable) mới có phẩm chất`);
  if (r.reqLevel !== undefined && !(r.reqLevel >= 1 && r.reqLevel <= 18)) err(`${r.id}: reqLevel ngoài khoảng`);
}

// Điểm đặt tên cho ?at= / `/gm tp <id>` (chỉ server đọc).
uniqueIds('place', PLACES);
for (const pl of PLACES) {
  if (!PLACE_ID.test(pl.id)) err(`place ${pl.id}: id chỉ gồm a-z 0-9 _ (tối đa 24)`);
  if (!LEVELS[pl.level]) err(`place ${pl.id}: level không tồn tại ${pl.level}`);
  if (!Number.isFinite(pl.x) || !Number.isFinite(pl.z) || !Number.isFinite(LEVELS[pl.level] ? terrainOf(pl.level).groundAt(pl.x, pl.z) : NaN)) err(`place ${pl.id}: tọa độ ngoài bản đồ`);
}

let total = 0;
for (let l = 1; l <= 15; l++) total += xpNeed(l);
console.log(`Tổng tu vi Ngưng Khí 1 → viên mãn tầng 15: ${total}`);
{
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => xpNeed(a + i)).reduce((x, y) => x + y, 0);
  console.log(`Tu vi Trúc Cơ 16–19: ${span(16, 19)}, Kết Đan 20–23: ${span(20, 23)}, Nguyên Anh 24–27: ${span(24, 27)}`);
}
console.log(`${ITEMS.length} vật phẩm, ${MONSTERS.length} quái, ${ALL_SKILLS.length} skill (${METHODS.length} công pháp), ${QUESTS.length} nhiệm vụ, ${RECIPES.length} công thức, ${POSES.length} pose, ${APPEARANCE.dyes.length} màu áo`);

if (errors.length) {
  console.error(`\n${errors.length} lỗi nội dung:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nội dung hợp lệ.');

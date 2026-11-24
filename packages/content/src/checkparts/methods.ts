// Tách từ check.ts (tối ưu Đợt E): methods.

import { poseIdsFor, isEquipSlot, validateSkillRules, SKILL_ID_ALIASES } from '@dtl/shared';
import {
  ARTIFACTS,
  GLOSSARY,
  ITEM,
  ITEMS,
  MONSTER,
  MONSTERS,
  SKILLS,
  JOINTS,
  MARK,
  PATHS,
  STARS,
  MARKS,
  METHODS,
  METHOD,
  METHOD_SKILLS,
  SKILL,
  VARIANTS,
  t,
} from '../index';
import {
  jointErrors,
  pathErrors,
  starErrors,
  COTHAN_METHOD,
  COTHAN_STAR_MAX,
  POSE_VOICES,
  stanceErrors,
  branchErrors,
  chainErrors,
  formationErrors,
  markDefErrors,
  resourceErrors,
  skillMarkErrors,
  skillResErrors,
} from '@dtl/shared';
import { isHitTier } from '@dtl/shared';

import { err, ALL_SKILLS, POSE } from './base';
import { needStr } from './palette';
// ---- công pháp (Phase 3-5): chiêu công pháp, nội tại, biến thức ----
// VS-2a: `res` của chiêu phải trỏ tới tài nguyên có thật; chiêu công pháp chỉ dùng tài nguyên của chính công pháp đó.
for (const s of [...SKILLS, ...METHOD_SKILLS]) {
  if (!s.res) continue;
  const owner = METHODS.find((m) => m.resource?.id === s.res!.id);
  for (const e of skillResErrors(s.res, owner?.resource.max, `skill ${s.id}`)) err(e);
  if (owner && s.method && s.method !== owner.id) err(`skill ${s.id}: res.id ${s.res.id} không phải tài nguyên của công pháp ${s.method}`);
}
for (const s of SKILLS) if (s.method || s.ult) err(`skill ${s.id}: chiêu chung không có method/ult (đặt trong methods.json)`);
for (const m of METHODS) {
  const sig = SKILL.get(m.sig);
  const ult = SKILL.get(m.ult);
  if (!sig || sig.method !== m.id || sig.ult) err(`method ${m.id}: chiêu đặc trưng ${m.sig} phải thuộc công pháp và không phải tối thượng`);
  if (!ult || ult.method !== m.id || !ult.ult) err(`method ${m.id}: chiêu tối thượng ${m.ult} phải thuộc công pháp và có ult`);
  if (!/^[0-9a-f]{6}$/i.test(m.color)) err(`method ${m.id}: màu phải là hex 6 ký tự`);
  // VS-2a: tài nguyên riêng của công pháp.
  if (!m.resource) err(`method ${m.id}: thiếu resource`);
  else {
    for (const e of resourceErrors(m.resource, `method ${m.id}.resource`)) err(e);
    if (METHODS.some((o) => o !== m && o.resource?.id === m.resource.id))
      err(`method ${m.id}: tài nguyên ${m.resource.id} trùng công pháp khác`);
    needStr(`ui.method.res.${m.resource.id}`);
    needStr(`ui.method.res.${m.resource.id}.tip`);
    if (t(`ui.method.res.${m.resource.id}`) !== (GLOSSARY.resources as Record<string, string>)[m.resource.id])
      err(`method ${m.id}: tên tài nguyên lệch glossary.resources`);
  }
  needStr(`method.${m.id}.name`);
  needStr(`method.${m.id}.desc`);
  needStr(`method.${m.id}.passive`);
  needStr(`method.${m.id}.role`);
  const dash = SKILL.get(m.dash);
  if (!dash || dash.method !== m.id || dash.kind !== 'dash')
    err(`method ${m.id}: chiêu lướt ${m.dash} phải thuộc công pháp và có kind dash`);
}
// Quy tắc thời gian/liên hoàn (K-2): hitAt trùng nhịp pose, combo, cường hóa, lướt.
for (const s of ALL_SKILLS) {
  if (s.tier !== undefined && !isHitTier(s.tier)) err(`skill ${s.id}: tier phải là light/medium/heavy/finisher`);
  for (const h of s.combo?.hits ?? []) if (h.tier !== undefined && !isHitTier(h.tier)) err(`skill ${s.id}: combo.hits[].tier không hợp lệ`);
}
for (const m of MONSTERS) {
  if (m.tier !== undefined && !isHitTier(m.tier)) err(`monster ${m.id}: tier phải là light/medium/heavy/finisher`);
  if (m.poise !== undefined && !isHitTier(m.poise)) err(`monster ${m.id}: poise phải là light/medium/heavy/finisher`);
  if (m.boss && m.poise === 'light') err(`monster ${m.id}: thủ lĩnh phải có poise từ medium trở lên (miễn khựng nhẹ)`);
}
for (const s of ALL_SKILLS) for (const m of validateSkillRules(s, s.pose ? POSE.get(s.pose) : undefined)) err(m);
// VS-2b: đồ thị chuỗi chiêu (id có thật, cùng công pháp, không vòng, hệ số trong khoảng).
for (const m of chainErrors(ALL_SKILLS)) err(m);
// VS-3: hướng tu (mỗi công pháp thuộc đúng một hướng; màu, bộ động tác, ấn phối hợp hợp lệ; tên khớp glossary.paths).
for (const e of pathErrors(PATHS, METHODS, new Set(MARKS.map((m) => m.id)), POSE_VOICES)) err(e);
// TN-5: thang sao Cổ Thần, chiêu đòi sao chỉ thuộc Cổ Thần Quyết, điều kiện lĩnh ngộ trỏ đúng công pháp.
for (const e of starErrors(STARS, (id) => ITEMS.some((i) => i.id === id))) err(e);
for (const s of ALL_SKILLS) {
  if (s.star === undefined) continue;
  if (!Number.isInteger(s.star) || s.star < 1 || s.star > COTHAN_STAR_MAX) err(`skill ${s.id}: star phải là 1–${COTHAN_STAR_MAX}`);
  if (s.method !== COTHAN_METHOD) err(`skill ${s.id}: star chỉ dùng cho công pháp ${COTHAN_METHOD}`);
}
for (const p of PATHS)
  if (p.unlock?.from && !METHODS.some((m) => m.id === p.unlock?.from))
    err(`path ${p.id}: unlock.from "${p.unlock.from}" không phải công pháp`);
for (const p of PATHS) {
  if (p.unlock?.grant && !ARTIFACTS.find((a) => a.id === p.unlock?.grant)?.granted)
    err(`path ${p.id}: unlock.grant phải là pháp bảo có cờ granted`);
  needStr(`path.${p.id}.name`);
  needStr(`path.${p.id}.desc`);
  if (t(`path.${p.id}.name`) !== (GLOSSARY.paths as Record<string, string>)[p.id]) err(`path ${p.id}: tên lệch glossary.paths`);
  // Tên vai của công pháp (hiện trên bảng Công pháp) phải trùng tên hướng tu của nó.
  for (const m of p.methods) if (t(`method.${m}.role`) !== t(`path.${p.id}.name`)) err(`path ${p.id}: tên lệch method.${m}.role`);
}
// VS-2f: hợp kích tổ đội.
for (const e of jointErrors(JOINTS, MARK)) err(e);
for (const j of JOINTS) {
  needStr(`joint.${j.id}.name`);
  needStr(`joint.${j.id}.desc`);
  if (t(`joint.${j.id}.name`) !== (GLOSSARY.joints as Record<string, string>)[j.id]) err(`joint ${j.id}: tên lệch glossary.joints`);
}
// VS-2e: tư thế (mỗi công pháp đúng một chiêu tư thế, đổi 3–4 ô chiêu chung, chiêu tư thế trỏ ngược về nó).
for (const e of stanceErrors(ALL_SKILLS, new Set(SKILLS.map((s) => s.id)))) err(e);
for (const m of METHODS) {
  const n = METHOD_SKILLS.filter((s) => s.method === m.id && s.kind === 'stance').length;
  if (n !== 1) err(`method ${m.id}: cần đúng một chiêu tư thế (đang có ${n})`);
}
for (const s of ALL_SKILLS) {
  if ((s.stance || s.stanceOf) && t(`skill.${s.id}.name`) !== (GLOSSARY.stances as Record<string, string>)[s.id])
    err(`chiêu tư thế ${s.id}: tên lệch glossary.stances`);
}
// VS-2d: cây nhánh công pháp (mỗi mốc 2–3 nhánh, chiêu bậc cao nào cũng thuộc một nhánh), tên khớp glossary.branches.
for (const m of METHODS) {
  for (const e of branchErrors(m, ALL_SKILLS)) err(e);
  const names = (GLOSSARY.branches as Record<string, Record<string, string>>)[m.id] ?? {};
  for (const b of m.branches ?? []) {
    needStr(`branch.${m.id}.${b.id}.name`);
    needStr(`branch.${m.id}.${b.id}.desc`);
    if (t(`branch.${m.id}.${b.id}.name`) !== names[b.id]) err(`method ${m.id} nhánh ${b.id}: tên lệch glossary.branches`);
  }
}
// VS-2c: bảng ấn và chiêu đặt/tiêu ấn.
for (const m of markDefErrors(MARKS)) err(m);
for (const m of MARKS) {
  if (m.method && !METHOD.has(m.method)) err(`mark ${m.id}: công pháp ${m.method} không tồn tại`);
  needStr(`mark.${m.id}.name`);
  needStr(`mark.${m.id}.desc`);
  if (t(`mark.${m.id}.name`) !== (GLOSSARY.marks as Record<string, string>)[m.id]) err(`mark ${m.id}: tên lệch glossary.marks`);
}
for (const s of ALL_SKILLS) for (const m of skillMarkErrors(s, MARK)) err(m);
for (const m of MARKS) {
  if (!ALL_SKILLS.some((s) => s.applyMark?.id === m.id || s.consumeMark?.then?.mark === m.id)) err(`mark ${m.id}: không chiêu nào đặt`);
}
// K-5: pose theo đòn trong chuỗi và theo giọng công pháp phải đủ bộ và khớp nhịp từng đòn.
for (const s of ALL_SKILLS) {
  if (!s.pose) continue;
  const hits = s.combo?.hits.length ?? 1;
  const ids = poseIdsFor(s.pose, hits);
  // `poseIdsFor` liệt kê theo giọng rồi theo đòn: đòn thứ n = n % hits.
  ids.forEach((id, i) => {
    const p = POSE.get(id);
    if (!p) return err(`skill ${s.id}: thiếu pose ${id} (đòn/giọng của pose ${s.pose})`);
    const hitAt = s.combo ? s.combo.hits[i % hits]?.hitAt : s.hitAt?.[0];
    if (hitAt !== undefined && p.hit && Math.abs(p.hit[0] - hitAt) > 0.03)
      err(`skill ${s.id}: hitAt ${hitAt} lệch hit[0] = ${p.hit[0]} của pose ${id}`);
    if (
      s.recovery !== undefined &&
      hitAt !== undefined &&
      Math.abs((s.combo ? hitAt : (s.hitAt?.[s.hitAt.length - 1] ?? hitAt)) + s.recovery - p.duration) > 0.06
    )
      err(`skill ${s.id}: hitAt + recovery lệch độ dài pose ${id} (${p.duration}s)`);
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
  if (s.kind === 'guard' && !(s.reduce! > 0 && s.reduce! <= 0.9 && s.duration! > 0))
    err(`skill ${s.id}: giữ cần reduce (0–0,9) và duration`);
  if ((s.kind === 'hot' || s.kind === 'revive') && !(s.allyRadius! > 0)) err(`skill ${s.id}: cần allyRadius`);
  if (s.kind === 'hot' && !(s.duration! > 0)) err(`skill ${s.id}: hồi theo thời gian cần duration`);
}
// DV-2: tên quái chương 5 (Dị Vực) khớp glossary.divucMonsters.
for (const [id, name] of Object.entries(GLOSSARY.divucMonsters)) {
  if (!MONSTER.has(id)) err(`glossary.divucMonsters: ${id} không phải quái`);
  else if (t(`mon.${id}`) !== name) err(`quái ${id}: tên "${t(`mon.${id}`)}" lệch glossary.divucMonsters ("${name}")`);
}

// E2-G: tên chiêu bậc 2–3 khớp glossary.skillsTier; chiêu khóa (Nguyên Anh trở lên) không được nằm trong hàng chiêu chơi được.
for (const [id, name] of Object.entries(GLOSSARY.skillsTier)) {
  if (!SKILL.has(id)) err(`glossary.skillsTier: ${id} không phải chiêu`);
  else if (t(`skill.${id}.name`) !== name) err(`chiêu ${id}: tên "${t(`skill.${id}.name`)}" lệch glossary.skillsTier ("${name}")`);
}
for (const s of METHOD_SKILLS) {
  if (s.unlock >= 16 && !(s.id in GLOSSARY.skillsTier)) err(`chiêu bậc cao ${s.id}: thiếu trong glossary.skillsTier`);
  if (s.kind === 'line' && !s.line) err(`chiêu ${s.id}: kind line cần trường line`);
  if (s.kind === 'summon' && !s.summon) err(`chiêu ${s.id}: kind summon cần trường summon`);
  for (const m of formationErrors(s)) err(m);
  if (s.kind === 'buff' && !(s.duration! > 0 && s.buff)) err(`chiêu ${s.id}: kind buff cần duration và buff`);
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
      x.hits || x.pierce || x.cleave || x.trail || x.stunOnInterrupt || x.markBonus || x.markSpread
        ? sk.kind === 'damage' || sk.kind === 'aoe' || sk.kind === 'line' || sk.kind === 'buff'
        : true;
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
  if (it.kind === 'skin') {
    const want = (GLOSSARY.skins as Record<string, string>)[it.id];
    if (!want) err(`skin ${it.id}: thiếu trong glossary.skins`);
    else if (t(`item.${it.id}.name`) !== want) err(`skin ${it.id}: tên lệch glossary.skins ("${want}")`);
    if (!it.gender) err(`skin ${it.id}: thiếu gender (m|f): mỗi skin chỉ có model cho một giới`);
  }
}

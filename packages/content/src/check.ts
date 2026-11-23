import { existsSync } from 'node:fs';
// Kiểm tra nội dung game: id trùng, tham chiếu hỏng, thiếu chuỗi hiển thị.
// Chạy: pnpm content:check

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MAX_LEVEL,
  TRUC_CO_LEVEL,
  majorRealmOf,
  poseIdsFor,
  salvageYield,
  legacyQuality,
  allGemIds,
  gemId,
  parseGem,
  WARD_ITEM,
  REFINE_ITEM,
  DUST_ITEM,
  AFFIX_ILVL_CAP,
  ROOT_IDS,
  PHA_CANH_PILL,
  BOTTLENECK_LEVELS,
  droppableSlots,
  templatesFor,
  type EquipSlot,
  budget,
  ELEMENTS,
  EQUIP_SLOTS,
  GCD,
  isEquipSlot,
  QUALITY_COUNT,
  QUALITY_MUL,
  rollItemInstance,
  seededRng,
  parseInst,
  STAT_PER_POINT,
  type LootDef,
  type MonsterAi,
  type MonsterDef,
  phaseRules,
  POSE_CAST,
  POSE_FLY,
  POSE_SKY,
  POSE_SWORD_SWAP,
  validatePose,
  validateFxTimeline,
  validateVfxCard,
  FLIP_ATLASES,
  type VfxCard,
  fxDrawCount,
  fxParticleCount,
  FX_SKILL_DRAW_MAX,
  validateSkillPose,
  validateSkillRules,
  SKILL_ID_ALIASES,
  xpNeed,
  MAX_TIER,
  TIER_OPEN,
  TIER_MUL,
  PROMOTE_MAT,
  TIER_MIN_ILVL,
  kieuOfLevel,
} from '@dtl/shared';
import {
  thanThongSkill,
  itemTier,
  promoteTarget,
  LEVEL_ASSETS,
  ARTIFACTS,
  PILL_QUALITY,
  FORGE,
  SETS,
  OUTFITS,
  ENHANCE_ORE,
  APPEARANCE,
  DYE,
  GLOSSARY,
  hasString,
  ITEM,
  ITEM_SYS,
  ITEMS,
  LEVELS,
  MONSTER,
  MONSTERS,
  NPC,
  NPCS,
  POSES,
  FX_TIMELINES,
  MON_FX_TIMELINES,
  HK_FX,
  HK_FX_STAGE,
  KC_FX,
  KC_FX_STAGE,
  KC_FX_TIMELINES,
  HK_FX_TIMELINES,
  HON_FX_TIMELINES,
  CO_FX_TIMELINES,
  TRAN_FX_TIMELINES,
  SUY_FX,
  SUY_FX_STAGE,
  SUY_FX_TIMELINES,
  QUEST,
  QUESTS,
  CHAPTERS,
  REALMS,
  RECIPES,
  ROOTS,
  ORIGINS,
  SKILLS,
  JOINTS,
  MARK,
  PATHS,
  STARS,
  pathOf,
  MARKS,
  METHODS,
  METHOD,
  METHOD_SKILLS,
  SKILL,
  VARIANTS,
  t,
} from './index';
import { LOOT, LOOT_MATS } from './loot';
import {
  jointErrors,
  pathErrors,
  starErrors,
  COTHAN_METHOD,
  COTHAN_STAR_MAX,
  originErrors,
  ORIGIN_GROUPS,
  POSE_VOICES,
  stanceErrors,
  branchErrors,
  chainErrors,
  formationErrors,
  markDefErrors,
  monSkillsOf,
  resourceErrors,
  skillMarkErrors,
  skillResErrors,
} from '@dtl/shared';
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
import { PLACE_ID, PLACES } from './places';
import {
  PEAK_LEVELS,
  HK_MECHANICS,
  HK_PARAMS,
  HUYEN_CHAINS,
  SUY_MECHANICS,
  TRIB_DEFS,
  TRIB_IDS,
  TRIB_MECHANIC_IDS,
  isHkMechanic,
  isSuyMechanic,
  tribForLevel,
  peakGated,
} from '@dtl/shared';
import { isHitTier } from '@dtl/shared';
import { TELE_PADS, TELE_PAD, terrainOf, questSpot, inPoly } from '@dtl/shared';
import { checkLevel } from './levelcheck';
import { CREDITS, CREDIT_KINDS, CREDIT_LICENSE_URL, PATH } from './index';

import { at } from '@dtl/shared';
import { checkLoreTerms, scanBannedDir } from './lore';
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
// Dòng thời gian hiệu ứng (VFX-V0): chiêu có thật, mốc hợp lệ, ngân sách ≤ 12 draw và ≤ 1.500 hạt mỗi chiêu.
for (const f of FX_TIMELINES) for (const m of validateFxTimeline(f, (id) => SKILL.has(id) || id.startsWith('fx_'))) err(m);
// Thẻ chiêu VFX (V-P0): mỗi file data/vfx/cards/<skillId>.json, tên file = skillId; chiêu và hướng tu có thật, ngân sách trong trần.
{
  const dir = new URL('../data/vfx/cards/', import.meta.url);
  const manifestUrl = new URL('../../../apps/client/public/assets/vfx/manifest.json', import.meta.url);
  const vfxTexIds = new Set<string>(
    fs.existsSync(manifestUrl) ? (JSON.parse(fs.readFileSync(manifestUrl, 'utf8')) as { id: string }[]).map((e) => e.id) : [],
  );
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const card = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')) as VfxCard;
    if (f !== `${card.skillId}.json`) err(`vfxcard ${f}: tên file phải là ${card.skillId}.json`);
    for (const m of validateVfxCard(
      card,
      (id) => SKILL.has(id),
      (id) => PATH.has(id),
    ))
      err(m);
    // Texture KTX2 do vfx-forge ghi vào manifest; `proc:*` là atlas thủ tục có sẵn.
    for (const t of card.textures) {
      if (t.id.startsWith('proc:')) {
        if (!(FLIP_ATLASES as readonly string[]).includes(t.id.slice(5))) err(`vfxcard ${card.skillId}: atlas thủ tục lạ ${t.id}`);
      } else if (!vfxTexIds.has(t.id)) err(`vfxcard ${card.skillId}: texture ${t.id} chưa có trong assets/vfx/manifest.json`);
    }
  }
}
for (const f of MON_FX_TIMELINES) for (const m of validateFxTimeline(f, (id) => id.startsWith('mon_'))) err(m);
// TN-4: hiệu ứng Thiên Nhân Ngũ Suy. Mỗi timeline theo luật chung (≤ 12 draw); cả một ải (mọi timeline của ải hợp lại) ≤ 25 draw.
for (const f of SUY_FX_TIMELINES) for (const m of validateFxTimeline(f, (id) => id.startsWith('suy_'))) err(m);
{
  const used = new Set<string>();
  for (const mech of SUY_MECHANICS) {
    const keys = SUY_FX_STAGE[mech] ?? [];
    if (!keys.length) err(`fx ngũ suy: ải ${mech} chưa có timeline`);
    const events = keys.flatMap((k) => {
      used.add(k);
      const tl = SUY_FX.get(k);
      if (!tl) err(`fx ngũ suy: ải ${mech} cần timeline ${k} (chạy python tools/vfx/gen-fx-suy.py)`);
      return tl?.events ?? [];
    });
    const n = fxDrawCount(events);
    if (n > FX_SKILL_DRAW_MAX) err(`fx ngũ suy: ải ${mech} dùng ${n} draw > ${FX_SKILL_DRAW_MAX}`);
  }
  for (const f of SUY_FX_TIMELINES) if (!used.has(f.skill)) err(`fx ngũ suy: timeline ${f.skill} không thuộc ải nào (SUY_FX_STAGE)`);
}
// TN-2: hiệu ứng tại điểm của Hồn tu. Nhịp hồn binh phát tới 3 lần mỗi giây và tia hồn phát mỗi lần quái chết nên phải rất nhẹ:
// mỗi timeline ≤ 3 draw, ≤ 30 hạt, không khựng hình/rung/chớp.
for (const f of HON_FX_TIMELINES) {
  for (const m of validateFxTimeline(f, (id) => id.startsWith('hon_'))) err(m);
  const n = fxDrawCount(f.events);
  if (n > 3) err(`fx hồn tu: ${f.skill} dùng ${n} draw > 3`);
  if (fxParticleCount(f.events) > 30) err(`fx hồn tu: ${f.skill} quá 30 hạt`);
  if (f.events.some((e) => e.type === 'hitstop' || e.type === 'shake' || e.type === 'flash'))
    err(`fx hồn tu: ${f.skill} không được khựng/rung/chớp`);
  if (f.palette !== 'dan_hon_kinh') err(`fx hồn tu: ${f.skill} phải dùng bảng màu dan_hon_kinh`);
}
// Cổ tu: hiệu ứng tại điểm. Nhịp cắn phát tới 4 lần mỗi giây nên rất nhẹ (≤ 3 draw, ≤ 30 hạt, không khựng/rung/chớp); đoạn bầy cổ đứng
// quanh người gọi phát nối tiếp (≤ 6 draw, ≤ 30 hạt).
for (const f of CO_FX_TIMELINES) {
  for (const m of validateFxTimeline(f, (id) => id.startsWith('co_'))) err(m);
  const n = fxDrawCount(f.events);
  const cap = f.skill.endsWith('_stand') ? 6 : 3;
  if (n > cap) err(`fx cổ tu: ${f.skill} dùng ${n} draw > ${cap}`);
  if (fxParticleCount(f.events) > 30) err(`fx cổ tu: ${f.skill} quá 30 hạt`);
  if (f.events.some((e) => e.type === 'hitstop' || e.type === 'shake' || e.type === 'flash'))
    err(`fx cổ tu: ${f.skill} không được khựng/rung/chớp`);
  if (f.palette !== 'duong_co_kinh') err(`fx cổ tu: ${f.skill} phải dùng bảng màu duong_co_kinh`);
}
// TN-8: hình trận của Cấm chế sư. Đoạn đứng phát nối tiếp (≤ 6 draw), nhịp trận phát mỗi nhịp (≤ 3 draw, ≤ 30 hạt), không khựng/rung/chớp.
for (const f of TRAN_FX_TIMELINES) {
  for (const m of validateFxTimeline(f, (id) => id.startsWith('tran_'))) err(m);
  const cap = f.skill.endsWith('_stand') ? 6 : 3;
  const n = fxDrawCount(f.events);
  if (n > cap) err(`fx trận: ${f.skill} dùng ${n} draw > ${cap}`);
  if (fxParticleCount(f.events) > 30) err(`fx trận: ${f.skill} quá 30 hạt`);
  if (f.events.some((e) => e.type === 'hitstop' || e.type === 'shake' || e.type === 'flash'))
    err(`fx trận: ${f.skill} không được khựng/rung/chớp`);
  const pal = f.skill.replace(/_(stand|tick)$/, '');
  if (f.palette !== pal) err(`fx trận: ${f.skill} phải dùng bảng màu ${pal}`);
}
// TN-6: hiệu ứng Huyền Kiếp, cùng luật: mỗi timeline ≤ 12 draw, cả một kiếp nhỏ ≤ 25 draw.
for (const f of HK_FX_TIMELINES) for (const m of validateFxTimeline(f, (id) => id.startsWith('hk_'))) err(m);
{
  const used = new Set<string>();
  for (const mech of HK_MECHANICS) {
    const keys = HK_FX_STAGE[mech] ?? [];
    if (!keys.length) err(`fx huyền kiếp: ${mech} chưa có timeline`);
    const events = keys.flatMap((k) => {
      used.add(k);
      const tl = HK_FX.get(k) ?? SUY_FX.get(k);
      if (!tl) err(`fx huyền kiếp: ${mech} cần timeline ${k} (chạy python tools/vfx/gen-fx-hk.py)`);
      return tl?.events ?? [];
    });
    const n = fxDrawCount(events);
    if (n > FX_SKILL_DRAW_MAX) err(`fx huyền kiếp: ${mech} dùng ${n} draw > ${FX_SKILL_DRAW_MAX}`);
  }
  for (const f of HK_FX_TIMELINES) if (!used.has(f.skill)) err(`fx huyền kiếp: timeline ${f.skill} không thuộc kiếp nào (HK_FX_STAGE)`);
}
// TN-3: hiệu ứng ba cơ chế kiếp chương 6, cùng luật: mỗi timeline ≤ 12 draw, cả một cơ chế ≤ 25 draw; hình có khối cao phải camFade.
for (const f of KC_FX_TIMELINES) for (const m of validateFxTimeline(f, (id) => id.startsWith('kc_'))) err(m);
{
  const used = new Set<string>();
  for (const [mech, keys] of Object.entries(KC_FX_STAGE)) {
    const events = keys.flatMap((k) => {
      used.add(k);
      const tl = KC_FX.get(k);
      if (!tl) err(`fx kiếp chương 6: ${mech} cần timeline ${k} (chạy python tools/vfx/gen-fx-ch6.py)`);
      return tl?.events ?? [];
    });
    const n = fxDrawCount(events);
    if (n > FX_SKILL_DRAW_MAX) err(`fx kiếp chương 6: ${mech} dùng ${n} draw > ${FX_SKILL_DRAW_MAX}`);
  }
  for (const f of KC_FX_TIMELINES) {
    if (!used.has(f.skill)) err(`fx kiếp chương 6: timeline ${f.skill} không thuộc cơ chế nào (KC_FX_STAGE)`);
    const n = fxDrawCount(f.events);
    if (n > 12) err(`fx kiếp chương 6: ${f.skill} dùng ${n} draw > 12`);
    if (!f.palette?.startsWith('kc_')) err(`fx kiếp chương 6: ${f.skill} phải dùng bảng màu kc_*`);
    for (const e of f.events)
      if (e.type === 'mesh' && (e.shape === 'rock_spire' || e.shape === 'burst') && !e.camFade)
        err(`fx kiếp chương 6: ${f.skill} khối cao ${e.shape} thiếu camFade`);
  }
}
// Mỗi skill một động tác riêng, không dài quá GCD (chiêu niệm chú: động tác chém sau khi niệm xong cũng ≤ GCD).
// Chiêu lướt (K-2) không có động tác riêng: dùng chung fx `dash`, hình lướt do client dựng.
const POSED = ALL_SKILLS.filter((s) => s.kind !== 'dash');
for (const s of POSED) for (const m of validateSkillPose(s.id, s.pose, POSE, GCD)) err(m);
// VS-2e: chiêu tư thế (`kind: 'stance'` và chiêu có `stanceOf`) mượn hình của một chiêu thường: không tính vào luật "riêng",
// nhưng phải trùng khít pose + fx + mốc ra đòn với đúng một chiêu thường để client (tra chiêu theo fx) vẫn ra đúng động tác.
// TN-5: chiêu tư thế có fx RIÊNG (Hóa Hình) không mượn của ai, thành chiêu có hình + động tác riêng như chiêu thường.
const borrows = (s: (typeof POSED)[number]) =>
  !!s.stanceOf || (s.kind === 'stance' && POSED.some((o) => o !== s && o.kind !== 'stance' && !o.stanceOf && o.fx === s.fx));
const OWN = POSED.filter((s) => !borrows(s));
const skillPoses = OWN.map((s) => s.pose);
if (new Set(skillPoses).size !== skillPoses.length) err('hai skill dùng chung một pose');
// Client chọn động tác theo fx của chiêu (FX của server chỉ mang loại hiệu ứng): fx phải riêng cho mỗi chiêu.
const skillFx = OWN.map((s) => s.fx);
if (new Set(skillFx).size !== skillFx.length) err('hai skill dùng chung một fx');
for (const s of POSED.filter(borrows)) {
  const base = OWN.find((o) => o.fx === s.fx);
  if (!base) err(`skill ${s.id}: chiêu tư thế phải mượn fx của một chiêu thường (fx "${s.fx}" không có)`);
  else if (base.pose !== s.pose || base.hitAt?.[0] !== s.hitAt?.[0])
    err(`skill ${s.id}: mượn fx của ${base.id} thì pose và hitAt[0] phải trùng với nó`);
}
for (const id of [POSE_FLY, POSE_SKY, POSE_CAST]) if (!POSE.get(id)?.loop) err(`pose ${id} (trạng thái nền) phải có và lặp`);
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
  if (APPEARANCE.dyes.map((d) => d.id).join() !== opts.join())
    err(`appearance: dyes phải đúng thứ tự playerDyes.options trong palette.json (${opts.join(', ')})`);
  if (APPEARANCE.defaultDye !== palette.playerDyes.default)
    err(`appearance: defaultDye khác playerDyes.default (${palette.playerDyes.default})`);
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
// ---- trang bị 8 ô (Phase 3-1) ----
{
  const sys = ITEM_SYS;
  const where = 'equipment';
  if (sys.slots.map((x) => x.id).join() !== EQUIP_SLOTS.join())
    err(`${where}: slots.json phải đúng thứ tự EQUIP_SLOTS (${EQUIP_SLOTS.join(', ')})`);
  for (const sd of sys.slots) {
    needStr(`ui.equip.${sd.id}`);
    needStr(`ui.item.kind.${sd.id}`);
    if (GLOSSARY.equipSlots[sd.id as keyof typeof GLOSSARY.equipSlots] !== t(`ui.equip.${sd.id}`))
      err(`${where}: tên ô ${sd.id} lệch glossary.equipSlots`);
    if (!(sd.weight >= 0 && sd.weight <= 3)) err(`slot ${sd.id}: weight phải trong [0, 3]`);
    const shares = Object.entries(sd.main);
    const sum = shares.reduce((s, [, v]) => s + (v ?? 0), 0);
    if (sd.weight > 0 && Math.abs(sum - 1) > 1e-9) err(`slot ${sd.id}: tổng chia dòng chính phải bằng 1 (đang ${sum})`);
    if (sd.weight === 0 && shares.length) err(`slot ${sd.id}: weight 0 thì không có dòng chính`);
    for (const [k] of shares) if (!(k in STAT_PER_POINT)) err(`slot ${sd.id}: chỉ số chính lạ ${k}`);
  }
  if (sys.qualities.length !== QUALITY_COUNT || QUALITY_MUL.length !== QUALITY_COUNT)
    err(`${where}: phải có ${QUALITY_COUNT} phẩm khớp QUALITY_MUL`);
  sys.qualities.forEach((q, i) => {
    if (q.id !== i) err(`quality ${i}: id phải bằng chỉ số`);
    needStr(`ui.quality.${i}`);
    if (GLOSSARY.qualities[i] !== t(`ui.quality.${i}`)) err(`${where}: tên phẩm ${i} lệch glossary.qualities`);
    if (q.affixes !== i) err(`quality ${i}: số dòng phụ phải bằng ${i} (thiết kế 3.2)`);
    if (!(q.affixFrac >= 0 && q.affixFrac < 0.6) || (i === 0) !== (q.affixFrac === 0)) err(`quality ${i}: affixFrac không hợp lệ`);
    if (!/^#[0-9a-fA-F]{6}$/.test(q.color)) err(`quality ${i}: màu không hợp lệ`);
    if (i > 0 && !(q.affixFrac >= at(sys.qualities, i - 1).affixFrac)) err(`quality ${i}: affixFrac phải không giảm`);
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
    const pool = sys.affixes
      .filter((a) => !a.slots || a.slots.includes(sd.id))
      .reduce((n, a) => n + (a.param ? sys.params[a.param].length : 1), 0);
    if (pool < (sys.qualities[QUALITY_COUNT - 1]?.affixes ?? 0)) err(`slot ${sd.id}: không đủ dòng phụ để roll phẩm cao nhất`);
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
          if (mainPts > bound + 2)
            err(`roll ${sd.id}/q${q}/ilvl${ilvl}: dòng chính ${mainPts.toFixed(1)} vượt ngân sách ${bound.toFixed(1)}`);
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
    // Trần 5: đòn tự bạo cuối trận của Thôn Mạch (E2-C) cần ~65% máu tối đa người cấp 19.
    if (!(ch.mul > 0 && ch.mul <= 5)) err(`${id}: chant.mul phải trong (0, 5]`);
    if (!(ch.r > 0 && ch.r <= 20)) err(`${id}: chant.r phải trong (0, 20]`);
    const pu = ch.pull;
    if (pu) {
      if (!(pu.range >= ch.r && pu.range <= 30)) err(`${id}: chant.pull.range phải trong [chant.r; 30] m`);
      if (!(pu.delay >= 0.9 && pu.delay <= 3)) err(`${id}: chant.pull.delay phải trong [0,9; 3] giây (đủ thời gian báo)`);
      if (!(pu.dur >= 0.4 && pu.dur <= 2)) err(`${id}: chant.pull.dur phải trong [0,4; 2] giây`);
      if (!(pu.stop >= 1 && pu.stop <= ch.r)) err(`${id}: chant.pull.stop phải trong [1; chant.r] m (kéo vào trong vùng nổ)`);
      if (!(ch.cd > ch.cast + pu.delay + pu.dur + ch.delay + ch.stun))
        err(`${id}: chant.cd phải lớn hơn cast + pull.delay + pull.dur + delay + stun`);
    }
  }
  const dp = m.deathPool;
  if (dp) {
    if (m.boss) err(`${id}: vũng độc khi chết chỉ cho quái thường/tinh anh`);
    if (!KINDS.includes(dp.kind)) err(`${id}: deathPool.kind không hợp lệ`);
    if (!(dp.r >= 1 && dp.r <= 6)) err(`${id}: deathPool.r phải trong [1; 6] m`);
    if (!(dp.delay >= 0.9 && dp.delay <= 3)) err(`${id}: deathPool.delay phải trong [0,9; 3] giây (đủ thời gian báo)`);
    if (!(dp.dur >= 2 && dp.dur <= 10)) err(`${id}: deathPool.dur phải trong [2; 10] giây`);
    if (!(dp.tick >= 0.5 && dp.tick <= 2)) err(`${id}: deathPool.tick phải trong [0,5; 2] giây`);
    if (!(dp.mul > 0 && dp.mul <= 0.5)) err(`${id}: deathPool.mul phải trong (0; 0,5] (sát thương nhỏ mỗi nhịp)`);
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
  // Vệt để lại (DV-2 đợt 4): đủ lâu để đọc, không phủ kín sân (≤ 8 vũng mỗi vệt, ≤ 12 s), sát thương mỗi nhịp nhỏ.
  for (const [k, c] of [
    ['line', line],
    ['charge', charge],
  ] as const) {
    const tr = c?.trail;
    if (!tr) continue;
    kindOk(tr, `${k}.trail`);
    if (!inR(tr.dur, 3, 12)) err(`${id}: ${k}.trail.dur phải trong [3; 12] giây`);
    if (!inR(tr.tick, 0.5, 2)) err(`${id}: ${k}.trail.tick phải trong [0,5; 2] giây`);
    if (!inR(tr.mul, 0.05, 0.6)) err(`${id}: ${k}.trail.mul phải trong [0,05; 0,6]`);
    if (!inR(tr.r, 1, 4)) err(`${id}: ${k}.trail.r phải trong [1; 4] mét`);
  }
  if (ai.anchor && !(inR(ai.anchor.r, 4, 20) && inR(ai.anchor.pct, 0.002, 0.03)))
    err(`${id}: anchor cần r trong [4; 20] m và pct trong [0,002; 0,03] mỗi giây`);
  if (line) {
    kindOk(line, 'line');
    if (!inR(line.delay, 0.9, 3)) err(`${id}: line.delay phải trong [0,9; 3] giây`);
    if (!(line.cd > line.delay + 2)) err(`${id}: line.cd phải lớn hơn delay + 2`);
    if (!mulOk(line.mul)) err(`${id}: line.mul phải trong (0, 3]`);
    if (!(inR(line.r, 2, m.boss ? 40 : 20) && line.r > m.attackRange)) err(`${id}: line.r phải trong (attackRange, ${m.boss ? 40 : 20}]`);
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
  if (ai.armor) {
    const a = ai.armor;
    if (!m.boss) err(`${id}: armor chỉ dành cho boss`);
    if (!inR(a.cycle, 15, 60)) err(`${id}: armor.cycle phải trong [15; 60] giây`);
    if (!inR(a.window, 4, 15) || !(a.window <= a.cycle / 2)) err(`${id}: armor.window phải trong [4; 15] giây và không quá nửa chu kỳ`);
    if (!(a.take >= 0 && a.take <= 0.4)) err(`${id}: armor.take phải trong [0; 0,4]`);
  }
  if (m.look !== undefined && !['golem', 'wisp', 'road'].includes(m.look)) err(`${id}: look ${m.look} không hợp lệ`);
  if (ai.resist) {
    const r = ai.resist;
    if (!m.boss) err(`${id}: resist chỉ dành cho boss`);
    const nph = (m.phases?.length ?? 0) + 1;
    if (r.forms.length !== nph) err(`${id}: resist.forms (${r.forms.length}) phải bằng số pha (${nph})`);
    for (const f of r.forms) if (!ROOT_IDS.includes(f as never)) err(`${id}: resist.forms có hệ lạ ${f}`);
    if (!(r.same > 0 && r.same <= 0.6)) err(`${id}: resist.same phải trong (0; 0,6]`);
    if (!(r.counter >= 1 && r.counter <= 2)) err(`${id}: resist.counter phải trong [1; 2]`);
  }
  if (ai.faces) {
    const f = ai.faces;
    if (!m.boss) err(`${id}: faces chỉ dành cho boss`);
    if (!inR(f.duong, 8, 30)) err(`${id}: faces.duong phải trong [8; 30] giây (đủ dồn chiêu một đợt)`);
    if (!inR(f.am, 4, 15)) err(`${id}: faces.am phải trong [4; 15] giây`);
    if (!inR(f.warn, 1, 3)) err(`${id}: faces.warn phải trong [1; 3] giây (thấy báo trước khi lật)`);
    if (!(f.am >= f.warn + 2)) err(`${id}: faces.am phải >= warn + 2`);
    if (!(f.take >= 0 && f.take <= 0.2)) err(`${id}: faces.take phải trong [0; 0,2] (mặt Âm gần như miễn)`);
    if (f.am / (f.duong + f.am) > 0.45) err(`${id}: mặt Âm chiếm quá 45% chu kỳ (kéo dài trận quá mức)`);
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
  if (!(Number.isInteger(g0) && Number.isInteger(g1) && g0 >= 0 && g1 >= g0))
    err(`loot ${id}: gold phải là [min, max] nguyên, 0 <= min <= max`);
  for (const d of l.drops ?? []) {
    needItem(d.item, `loot ${id}`);
    if (!(d.chance > 0 && d.chance <= 1)) err(`loot ${id}/${d.item}: chance phải trong (0, 1]`);
    if (!(Number.isInteger(d.min) && Number.isInteger(d.max) && d.min >= 1 && d.max >= d.min))
      err(`loot ${id}/${d.item}: min/max không hợp lệ`);
  }
}
function checkEquipLoot(id: string, l: LootDef) {
  const m = MONSTER.get(id);
  const want = !m ? undefined : m.boss ? 'boss' : m.elite ? 'elite' : undefined;
  if (want && l.src !== want) err(`loot ${id}: src phải là '${want}'`);
  if (!want && l.src !== 'common' && l.src !== 'dungeon') err(`loot ${id}: quái thường có src 'common' hoặc 'dungeon'`);
  if (!l.src) return;
  const rolls = l.equip ?? [];
  // Bóng không cho xp (xpMul 0, bóng gương/bóng mặc cả) được để trống để khỏi bị farm.
  if (!rolls.length && MONSTER.get(id)?.xpMul !== 0) err(`loot ${id}: thiếu bảng rơi trang bị (equip)`);
  const slots = droppableSlots(ITEM_SYS, ITEMS);
  rolls.forEach((r, i) => {
    const w = `loot ${id}/equip[${i}]`;
    if (!(r.chance > 0 && r.chance <= 1)) err(`${w}: chance phải trong (0, 1]`);
    if (!Array.isArray(r.q) || r.q.length < 5 || r.q.length > QUALITY_COUNT || r.q.some((x) => !(x >= 0)) || !r.q.some((x) => x > 0))
      err(`${w}: q phải là 5–${QUALITY_COUNT} trọng số >= 0 (thiếu = 0), có ít nhất một số dương`);
    if (r.set && !SETS.some((x) => x.id === r.set)) err(`${w}: bộ không tồn tại ${r.set}`);
    for (const k of Object.keys(r.slots ?? {})) if (!slots.includes(k as EquipSlot)) err(`${w}: ô ${k} không rơi được`);
    if (r.ilvlBonus !== undefined && !(Number.isInteger(r.ilvlBonus) && r.ilvlBonus >= 0 && r.ilvlBonus <= 3))
      err(`${w}: ilvlBonus phải nguyên trong [0; 3]`);
    const tot = r.q.reduce((a, b) => a + b, 0) || 1;
    const lo = r.q.findIndex((x) => x > 0);
    // Phẩm theo nguồn (thiết kế 3.2): quái thường chỉ Phàm/Linh; tinh anh từ Linh, tối đa Địa; Thiên chỉ boss.
    const hi = r.q.reduce((a, x, k) => (x > 0 ? k : a), 0);
    // Thần phẩm (thiết kế bậc 6): chỉ boss, chỉ ở bảng rơi chính (i = 0), xác suất mỗi lần rơi ≤ 1%.
    const pThan = (r.q[5] ?? 0) / tot;
    if (pThan > 0 && (l.src !== 'boss' || i !== 0 || pThan > 0.01)) err(`${w}: Thần phẩm chỉ ở boss, bảng đầu, ≤ 1% mỗi lần rơi`);
    if (l.src === 'common' && hi > 1) err(`${w}: quái thường chỉ rơi Phàm/Linh phẩm`);
    if (l.src === 'dungeon' && hi > 3) err(`${w}: bí cảnh thường chỉ rơi tới Địa phẩm`);
    if (l.src === 'elite' && i === 0 && (hi > 3 || (r.q[2] ?? 0) / tot < 0.3)) err(`${w}: tinh anh chủ yếu Huyền phẩm, tối đa Địa phẩm`);
    if (l.src === 'boss' && i === 0 && lo < 2) err(`${w}: boss chỉ rơi từ Huyền phẩm`);
  });
  // Quái kiếp (Nhật Thực Dực Chủ) không rơi đồ (`minionOf`), nên không cần bảng rơi trang bị.
  const tribBoss = Object.values(TRIB_DEFS).some((d) => d.phases.some((p) => p.nhatThuc?.boss === id));
  if (l.src === 'boss' && !tribBoss && !(rolls[0]?.chance === 1)) err(`loot ${id}: boss phải chắc chắn rơi một món (equip[0].chance = 1)`);
}
for (const id of LOOT.keys()) if (!MONSTER.has(id)) err(`loot: quái không tồn tại ${id}`);
for (const [id, l] of LOOT) checkEquipLoot(id, l);
// Mọi ô có chỉ số phải có mẫu để rơi ở mọi ilvl >= 1.
for (const s of ITEM_SYS.slots) {
  if (s.weight > 0 && s.drop !== false && templatesFor(ITEMS, s.id, 1).length === 0)
    err(`ô ${s.id}: thiếu mẫu có reqLevel <= 1 để rơi ở ilvl 1`);
}
// Tinh anh: máu gấp ~4 quái thường cùng loài, có ít nhất một kỹ năng riêng, có tên và biệt hiệu.
for (const m of MONSTERS) {
  if (!m.elite) continue;
  if (m.boss) err(`monster ${m.id}: elite và boss loại trừ nhau`);
  if (!(m.hpMul >= 4)) err(`monster ${m.id}: tinh anh phải có hpMul >= 4`);
  if (!(m.ai?.caster || m.ai?.slam || m.ai?.sweep || m.ai?.chant || (m.ai && monSkillsOf(m.ai).some((k) => k !== 'reveal'))))
    err(`monster ${m.id}: tinh anh cần một kỹ năng riêng (caster/slam/sweep/chant/line/charge/leap/burrow/reflect/summon)`);
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
      if (p.speedMul !== undefined && !(p.speedMul >= 0.8 && p.speedMul <= 1.3))
        err(`monster ${m.id} pha ${i + 1}: speedMul phải trong [0,8; 1,3]`);
      const r = phaseRules(m, i + 1);
      checkAi(m, r.ai, m.attackCd * r.cdMul, ` pha ${i + 1}`);
      // Thoại khi vào pha: ngắn, đọc kịp trong lúc vẫn đánh (letterbox ~3 giây).
      const key = `mon.${m.id}.say.${i + 1}`;
      needStr(key);
      if (hasString(key) && t(key).length > 90) err(`${key}: thoại quá dài (> 90 ký tự)`);
    });
    if (hasString(`mon.${m.id}.say.dead`) && t(`mon.${m.id}.say.dead`).length > 90) err(`mon.${m.id}.say.dead: thoại quá dài`);
  }
  if (m.mirror) {
    const mi = m.mirror;
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có mirror`);
    const nph = (m.phases?.length ?? 0) + 1;
    for (const [k, f] of Object.entries(mi) as [string, { phase: number } | undefined][])
      if (f && !(Number.isInteger(f.phase) && f.phase >= 0 && f.phase < nph)) err(`monster ${m.id}: mirror.${k}.phase ngoài số pha`);
    if (mi.decoys) {
      const dd = MONSTER.get(mi.decoys.mon);
      if (!dd) err(`monster ${m.id}: mirror.decoys.mon không tồn tại`);
      else if (dd.boss || dd.elite || !(dd.hpMul <= 0.1))
        err(`monster ${m.id}: bóng giả phải là quái thường chết trong một đòn (hpMul ≤ 0,1)`);
      if (!(mi.decoys.n >= 1 && mi.decoys.n <= 5 && mi.decoys.boom.delay >= 1 && mi.decoys.boom.r <= 8))
        err(`monster ${m.id}: mirror.decoys n ∈ [1;5], nổ báo ≥ 1 giây, r ≤ 8`);
    }
    if (mi.echo && !(mi.echo.delay >= 1 && mi.echo.cd >= 4)) err(`monster ${m.id}: mirror.echo báo ≥ 1 giây, hồi ≥ 4 giây`);
    if (mi.disc) {
      const dc = mi.disc;
      if (!(dc.warn >= 1 && dc.beams >= 2 && dc.beams <= 4 && dc.spin > 0 && dc.spin <= 40 && dc.w >= 2 && dc.dur <= 10))
        err(`monster ${m.id}: mirror.disc: báo ≥ 1 s, 2–4 tia, quay ≤ 40°/s (đi vòng kịp), rộng ≥ 2 m, ≤ 10 s`);
    }
    if (mi.veil && !(mi.veil.r <= 16 && mi.veil.dur <= 25 && mi.veil.hpMul > 0 && mi.veil.hpMul <= 0.5))
      err(`monster ${m.id}: mirror.veil: r ≤ 16, ≤ 25 s, hpMul ∈ (0; 0,5]`);
  }
  if (m.than) {
    const th = m.than;
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có than`);
    const nph = (m.phases?.length ?? 0) + 1;
    for (const [k, f] of Object.entries(th) as [string, { phase: number } | undefined][])
      if (f && !(Number.isInteger(f.phase) && f.phase >= 0 && f.phase < nph)) err(`monster ${m.id}: than.${k}.phase ngoài số pha`);
    if (
      th.hands &&
      !(th.hands.n >= 2 && th.hands.n <= 8 && th.hands.delay >= 1.3 && th.hands.w * th.hands.n < 360 - 20 * th.hands.n && th.hands.cd >= 6)
    )
      err(`monster ${m.id}: than.hands: 2–8 tay, báo ≥ 1,3 s, khe giữa các tay ≥ 20°, hồi ≥ 6 s`);
    if (
      th.elem &&
      !(
        th.elem.delay >= 1.5 &&
        th.elem.cut > 0 &&
        th.elem.cut <= 0.9 &&
        th.elem.ring + th.elem.sealR <= th.elem.r + 0.5 &&
        th.elem.ring >= th.elem.sealR * 2.2
      )
    )
      err(`monster ${m.id}: than.elem: báo ≥ 1,5 s, ấn nằm trong vòng đánh và không chồng nhau`);
    if (th.clone) {
      const cd = MONSTER.get(th.clone.mon);
      if (!cd) err(`monster ${m.id}: than.clone.mon không tồn tại`);
      else if (cd.boss || cd.elite || cd.xpMul !== 0)
        err(`monster ${m.id}: phân thân không phải boss/tinh anh và không cho tu vi (xpMul 0)`);
      if (!(th.clone.n >= 1 && th.clone.n <= 4 && th.clone.life >= 10 && th.clone.heal <= 0.15))
        err(`monster ${m.id}: than.clone: 1–4 con, sống ≥ 10 s, hồi ≤ 15%`);
    }
    if (th.rings && !(th.rings.dur <= 15 && th.rings.spin <= 30 && th.rings.final.delay >= 1.5 && th.rings.final.gather >= 6))
      err(`monster ${m.id}: than.rings: ≤ 15 s, quay ≤ 30°/s (chạy kịp), Phản hồi báo ≥ 1,5 s`);
  }
  if (m.rift) {
    const rf = m.rift;
    if (!m.boss) err(`monster ${m.id}: chỉ boss mới có rift`);
    const nph = (m.phases?.length ?? 0) + 1;
    if (!(Number.isInteger(rf.phase) && rf.phase >= 0 && rf.phase < nph)) err(`monster ${m.id}: rift.phase ngoài số pha`);
    if (!(rf.burn >= 1 && rf.burn <= 5 && rf.weak >= 3 && rf.veins.length >= 2))
      err(`monster ${m.id}: rift: 1–5 tầng cháy, mất thế ≥ 3 s, ≥ 2 khe`);
    if (!m.phases?.[rf.phase - 1]?.ai?.chant && !m.ai?.chant) err(`monster ${m.id}: rift cần chú (ai.chant) từ pha ${rf.phase}`);
    for (const v of rf.veins) if (!(v.r >= 3 && v.r <= 10)) err(`monster ${m.id}: khe mạch r 3–10 m`);
  }
  if (m.kd) {
    const k = m.kd;
    const nph = (m.phases?.length ?? 0) + 1;
    if (k.mend && !(k.mend.cd >= 3 && k.mend.r >= 4 && k.mend.pct > 0 && k.mend.pct <= 0.2))
      err(`monster ${m.id}: kd.mend cd ≥ 3 s, r ≥ 4 m, pct ∈ (0; 20%]`);
    if (k.twin && !(k.twin.mul > 1 && k.twin.mul <= 2.5)) err(`monster ${m.id}: kd.twin.mul ∈ (1; 2,5]`);
    if (k.bargain) {
      if (!m.boss || (!m.ai?.chant && !m.phases?.some((ph) => ph.ai?.chant))) err(`monster ${m.id}: kd.bargain cần boss có chú (ai.chant)`);
      if (!(Number.isInteger(k.bargain.phase) && k.bargain.phase >= 0 && k.bargain.phase < nph))
        err(`monster ${m.id}: kd.bargain.phase ngoài số pha`);
      if (!MONSTER.get(k.bargain.mon)) err(`monster ${m.id}: kd.bargain.mon ${k.bargain.mon} không tồn tại`);
      if (!(k.bargain.sep >= 10 && k.bargain.pen > 0 && k.bargain.pen <= 0.4))
        err(`monster ${m.id}: kd.bargain sep ≥ 10 m, pen ∈ (0; 40%]`);
    }
    if (k.night) {
      const n = k.night;
      if (!m.boss) err(`monster ${m.id}: chỉ boss mới có kd.night`);
      if (!(Number.isInteger(n.phase) && n.phase >= 0 && n.phase < nph)) err(`monster ${m.id}: kd.night.phase ngoài số pha`);
      if (!(n.steles.length >= 2 && n.steles.every((s) => s.r >= 4 && s.r <= 12))) err(`monster ${m.id}: kd.night cần ≥ 2 bia, r 4–12 m`);
      if (!(n.press > 0 && n.press <= 0.06 && n.cd >= 8 && n.warn >= 1.5 && n.mul > 0 && n.dur >= 3 && n.grace >= 3))
        err(`monster ${m.id}: kd.night press ∈ (0; 6%], cd ≥ 8 s, warn ≥ 1,5 s, dur ≥ 3 s, grace ≥ 3 s`);
    }
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
    if (as.minimap && !existsSync(new URL(`../../../apps/client/public/map/${as.minimap}.json`, import.meta.url)))
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

// ---- Truyền Tống Trận liên level (E1-B): bản đồ đích phải có thật và là bản đồ thế giới. Kiểm chi tiết từng trận: levelcheck.ts ----
// TELE_PAD là Map toàn cục theo id (server/character tra không kèm level): id trận phải duy nhất trên mọi level.
uniqueIds('trận', [...TELE_PADS]);
for (const pad of TELE_PADS) {
  const dest = LEVELS[pad.level];
  if (!dest || dest.dungeon) err(`trận ${pad.id}: level ${pad.level} không phải bản đồ thế giới`);
}

// ---- Hành trình theo chương (U2-4): chapters.json chỉ tham chiếu thứ có thật ----
{
  const chIds = new Set<string>();
  const art = JSON.parse(
    fs.readFileSync(fileURLToPath(new URL('../../../apps/client/public/assets/art/art.json', import.meta.url)), 'utf8'),
  ) as {
    files: Record<string, Record<string, unknown>>;
  };
  let prevHi = 0;
  for (const c of CHAPTERS) {
    const w = `chương ${c.id}`;
    if (chIds.has(c.id)) err(`${w}: id trùng`);
    chIds.add(c.id);
    if (!LEVELS[c.level] || LEVELS[c.level]!.dungeon) err(`${w}: level ${c.level} không phải bản đồ thế giới`);
    if (!art.files.loading?.[c.art]) err(`${w}: thiếu tranh nền art/loading/${c.art}`);
    if (c.levels[0] > c.levels[1] || c.levels[0] !== prevHi + 1)
      err(`${w}: khoảng cấp ${c.levels.join('–')} phải nối liền chương trước (${prevHi})`);
    prevHi = c.levels[1];
    if (!QUESTS.some((q) => q.id === c.closeQuest)) err(`${w}: nhiệm vụ chốt ${c.closeQuest} không có`);
    for (const k of ['name', 'desc']) if (!hasString(`ui.chapters.${c.id}.${k}`)) err(`${w}: thiếu chuỗi ui.chapters.${c.id}.${k}`);
    if (!c.featured.length) err(`${w}: featured rỗng`);
    for (const i of c.featured) if (!ITEMS.some((x) => x.id === i)) err(`${w}: vật phẩm nổi bật ${i} không có`);
    const nodeIds = new Set<string>();
    for (const n of c.nodes) {
      const nw = `${w} nút ${n.id}`;
      if (nodeIds.has(n.id)) err(`${nw}: id trùng`);
      nodeIds.add(n.id);
      if (n.x < 0 || n.x > 100 || n.y < 0 || n.y > 100) err(`${nw}: x,y ngoài 0–100`);
      if (n.kind === 'world' && n.ref !== c.level) err(`${nw}: nút thế giới phải trỏ level của chương`);
      if (n.kind === 'dungeon' && !LEVELS[n.ref]?.dungeon) err(`${nw}: ${n.ref} không phải phó bản`);
      if (n.kind === 'boss' && !MONSTERS.some((m) => m.id === n.ref && m.boss)) err(`${nw}: ${n.ref} không phải boss`);
      if (n.kind === 'trib' && !(TRIB_IDS as readonly string[]).includes(n.ref)) err(`${nw}: kiếp ${n.ref} không có`);
      if (n.tele && !TELE_PADS.some((p) => p.id === n.tele && p.level === c.level))
        err(`${nw}: trận ${n.tele} không thuộc level ${c.level}`);
      const key = {
        world: `ui.chapters.world.${n.ref}`,
        dungeon: `dungeon.${n.ref}.name`,
        boss: `mon.${n.ref}`,
        trib: `ui.chapters.trib.${n.ref}`,
      }[n.kind];
      if (!hasString(key)) err(`${nw}: thiếu chuỗi ${key}`);
    }
    if (c.nodes.filter((n) => n.kind === 'world').length !== 1) err(`${w}: phải có đúng một nút thế giới`);
  }
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
    // Phòng cầu Cửu Kiều vào bằng vé của Dẫn Kiều Nhân (KieuSystem.plan), không có cổng trên bản đồ thế giới.
    if (kieuOfLevel(lv.id) === null && !(ret?.portals ?? []).some((q) => q.to === lv.id))
      err(`${w}: ${d.returnLevel} không có cổng dẫn vào`);
    if (kieuOfLevel(lv.id) !== null) {
      if (!d.private) err(`${w}: phòng cầu phải là phó bản riêng (private)`);
      if (!NPCS.some((n) => n.id === 'npc_dan_kieu_nhan' && n.level === d.returnLevel))
        err(`${w}: returnLevel ${d.returnLevel} không có Dẫn Kiều Nhân`);
    }
    if (!d.waves.length) err(`${w}: thiếu đợt quái`);
  }
  for (const wv of d.waves) for (const g of wv.mons) if (!MONSTER.get(g.id)) err(`${w}: quái ${g.id} không tồn tại`);
  d.waves.forEach((wv, i) => {
    const ww = `${w}, đợt ${i + 1}`;
    for (const g of wv.mons) {
      if (g.at !== undefined && !wv.points?.[g.at]) err(`${ww}: quái ${g.id} trỏ điểm sinh ${g.at} không có`);
      if (!(g.n >= 1)) err(`${ww}: quái ${g.id} số lượng phải >= 1`);
    }
    for (const pt of wv.points ?? [])
      if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${ww}: điểm sinh (${pt.x}, ${pt.z}) ngoài bản đồ`);
    if (wv.seals) {
      const sl = wv.seals;
      if (sl.doors.length < 1 || sl.doors.length > 5) err(`${ww}: phong ấn cần 1–5 cửa`);
      for (const d of sl.doors) {
        for (const [x, z] of [
          [d.x, d.z],
          [d.gx, d.gz],
        ] as const)
          if (!Number.isFinite(terrainOf(lv).groundAt(x, z))) err(`${ww}: cửa phong ấn (${x}, ${z}) ngoài bản đồ`);
        const c = lv.dungeon!.center;
        if (Math.hypot(d.gx - c.x, d.gz - c.z) > (lv.dungeon!.bound ?? 90) - 6)
          err(`${ww}: trận môn (${d.gx}, ${d.gz}) ngoài vòng bí cảnh`);
        if (Math.hypot(d.x - d.gx, d.z - d.gz) < sl.bar + 2) err(`${ww}: cửa phải cách trận môn ≥ bar + 2 m để chặn không đè lên cửa`);
      }
      if (!(sl.touch > 0 && sl.touch <= 6 && sl.phuR >= 4 && sl.bar >= sl.touch + 2))
        err(`${ww}: seals touch ≤ 6, phuR ≥ 4, bar ≥ touch + 2`);
      if (!MONSTER.get(sl.reinforce.mon)) err(`${ww}: quái tiếp viện ${sl.reinforce.mon} không tồn tại`);
      if (!wv.title) err(`${ww}: đợt phong ấn phải có title`);
    }
    if (wv.steles) {
      const sl = wv.steles;
      const c = lv.dungeon!.center;
      if (Math.hypot(sl.x - c.x, sl.z - c.z) > (lv.dungeon!.bound ?? 90) - sl.r - 8)
        err(`${ww}: bia (${sl.x}, ${sl.z}) ngoài vòng bí cảnh`);
      if (!(sl.r >= 4 && sl.r <= 12 && sl.secs >= 20 && sl.secs <= 120 && sl.grace >= 3 && sl.press > 0 && sl.press <= 0.05))
        err(`${ww}: steles r 4–12, 20–120 s, grace ≥ 3 s, press ∈ (0; 5%]`);
      for (const g of sl.reinforce) {
        if (!MONSTER.get(g.mon)) err(`${ww}: quái tiếp viện ${g.mon} không tồn tại`);
        if (!(g.at >= 0 && g.at < sl.secs && g.n >= 1)) err(`${ww}: tiếp viện phải có at trong [0; secs) và n ≥ 1`);
      }
      if (!wv.title) err(`${ww}: đợt giữ bia phải có title`);
    }
    if (wv.shadow) {
      const sh = wv.shadow;
      if (kieuOfLevel(lv.id) === null) err(`${ww}: đợt Kiếm Ảnh chỉ dùng ở phòng cầu`);
      if (!(sh.hpMul > 0 && sh.hpMul <= 3 && sh.atkMul > 0 && sh.atkMul <= 4)) err(`${ww}: shadow hpMul ∈ (0; 3], atkMul ∈ (0; 4]`);
      if (!(sh.strikeEvery >= 3 && sh.r >= 2 && sh.r <= 8 && sh.mul > 0)) err(`${ww}: shadow strikeEvery ≥ 3 s, r 2–8 m, mul > 0`);
      if (!wv.title) err(`${ww}: đợt Kiếm Ảnh phải có title`);
    }
    if (wv.puzzle) {
      const pz = wv.puzzle;
      if (pz.points.length < 3 || pz.points.length > 4) err(`${ww}: đố gương/đèn cần 3–4 điểm`);
      if (pz.msg !== undefined && !hasString(`sys.${pz.msg}_puzzle`)) err(`${ww}: thiếu chuỗi sys.${pz.msg}_puzzle`);
      for (const pt of pz.points)
        if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${ww}: cột gương (${pt.x}, ${pt.z}) ngoài bản đồ`);
      if (!(pz.secs >= 10 && pz.secs <= 60)) err(`${ww}: đố gương secs phải trong [10; 60]`);
      if (!MONSTER.get(pz.wrong.mon)) err(`${ww}: quái phạt ${pz.wrong.mon} không tồn tại`);
      if (!(pz.bossCut >= 0 && pz.bossCut <= 0.2)) err(`${ww}: bossCut phải trong [0; 0,2]`);
      if (!wv.title) err(`${ww}: đợt đố gương phải có title`);
    }
    if (wv.title && !hasString(`dungeon.${lv.id}.wave.${i + 1}`)) err(`${ww}: thiếu chuỗi dungeon.${lv.id}.wave.${i + 1}`);
  });
  if (!lv.tribulation && !hasString(`dungeon.${lv.id}.name`)) err(`${w}: thiếu chuỗi dungeon.${lv.id}.name`);
  if (d.timeLimit !== undefined && !(d.timeLimit >= 60 && d.timeLimit <= 900)) err(`${w}: timeLimit phải trong [60; 900] giây`);
  if (d.maxRevives !== undefined && !(d.maxRevives >= 0)) err(`${w}: maxRevives không hợp lệ`);
  if (d.lockAt !== undefined && !(d.lockAt >= 1 && d.lockAt <= d.waves.length)) err(`${w}: lockAt ngoài số đợt`);
  const rw = d.reward;
  if (rw) {
    if (!(rw.xpPct > 0 && rw.xpPct <= 0.5)) err(`${w}: thưởng xpPct phải trong (0; 0,5]`);
    if (!(rw.gold.length === 2 && at(rw.gold, 0) >= 0 && at(rw.gold, 1) >= at(rw.gold, 0))) err(`${w}: thưởng gold phải là [thấp, cao]`);
    for (const it of rw.items) {
      if (!ITEM.get(it.item)) err(`${w}: thưởng vật phẩm ${it.item} không tồn tại`);
      if (!(it.chance > 0 && it.chance <= 1 && it.min >= 1 && it.max >= it.min)) err(`${w}: thưởng ${it.item} chance/min/max không hợp lệ`);
    }
    for (const e of rw.equip ?? []) {
      if (e.set && !SETS.some((x) => x.id === e.set)) err(`${w}: thưởng bộ ${e.set} không tồn tại`);
      if (e.q.length !== 5 || e.q.reduce((a, b) => a + b, 0) !== 100) err(`${w}: thưởng equip.q phải 5 phần tử tổng 100`);
    }
  }
  for (const pt of [d.spawn, d.exit, d.center])
    if (!Number.isFinite(terrainOf(lv).groundAt(pt.x, pt.z))) err(`${w}: điểm (${pt.x}, ${pt.z}) ngoài bản đồ`);
}
if (!at(LEVELS, 'van_lam').spawn) err('van_lam: thiếu spawn');

// ---- Độ kiếp theo dữ liệu (E1-F) ----
{
  const peaks = new Set<number>(PEAK_LEVELS);
  const seenFrom = new Set<number>();
  for (const id of TRIB_IDS) {
    const d = TRIB_DEFS[id];
    const w = `độ kiếp ${id}`;
    if (d.chain) {
      // Kiếp chuỗi (TN-4): hoặc đã gắn vào thang cấp (to = from + 1), hoặc còn là mốc tạm (to = from) thì chưa được bật cho người chơi.
      if (d.to !== d.from && d.to !== d.from + 1) err(`${w}: kiếp chuỗi cần to = from (mốc tạm) hoặc to = from + 1`);
      if (d.to === d.from && d.enabled) err(`${w}: kiếp chuỗi chưa gắn vào thang cấp (to = from) thì không được bật`);
    } else if (!peaks.has(d.from) || d.to !== d.from + 1) err(`${w}: from ${d.from} phải là đại viên mãn và to = from + 1`);
    if (d.to > d.from) {
      if (seenFrom.has(d.from)) err(`${w}: hai kiếp cùng from ${d.from}`);
      seenFrom.add(d.from);
    }
    if (d.item !== null && !ITEM.get(d.item)) err(`${w}: vật phẩm đột phá ${d.item} không tồn tại`);
    if (d.enabled && d.item === null) err(`${w}: bật (enabled) mà chưa có vật phẩm đột phá`);
    if (d.room !== 'world' && d.room !== 'tribulation') err(`${w}: room phải là world hoặc tribulation`);
    if (d.level !== undefined) {
      const lv = LEVELS[d.level];
      if (d.room !== 'tribulation' || !lv?.tribulation || !lv.dungeon)
        err(`${w}: level ${d.level} phải là sân độ kiếp (tribulation + dungeon) và room = tribulation`);
    }
    if (!(d.duration > 0) || !(d.firstDelay >= 0) || !(d.failXpLoss >= 0 && d.failXpLoss <= 0.5) || !(d.pillMax >= 0))
      err(`${w}: thời lượng/phạt/đan ngoài khoảng`);
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
      for (const pct of [p.aimPct, p.extraPct, p.net?.pct, p.final?.pct, p.grid?.pct])
        if (pct !== undefined && !(pct >= 0 && pct <= 0.9)) err(`${pw}: phần trăm sát thương ngoài [0, 0,9]`);
      if (p.kind === 'hoa' && !p.grid) err(`${pw}: pha hoa cần grid`);
      if (p.grid && p.grid.pick > p.grid.cols * p.grid.rows) err(`${pw}: pick vượt số ô`);
      if (p.final && p.final.guardShare !== undefined && !(p.final.guardShare >= 0 && p.final.guardShare <= 0.6))
        err(`${pw}: guardShare ngoài [0, 0,6]`);
      if (p.mechanic && !(TRIB_MECHANIC_IDS as readonly string[]).includes(p.mechanic)) err(`${pw}: cơ chế ${p.mechanic} chưa đăng ký`);
      if (p.shadows && !MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma`);
      needStr(`ui.trib.${id}.${p.id}`);
      needStr(`ui.trib.${id}.${p.id}.hint`);
      if (p.final) needStr(`ui.trib.${id}.${p.id}.hint2`);
    });
    needStr(`ui.trib.${id}.title`);
  }
  // Kiếp đã bật cho người chơi phải có vật phẩm đột phá thật, chế được, nhặt được; cơ chế `dan_tran` phải có thông số Đan Trận (E2-D).
  for (const [id, d] of Object.entries(TRIB_DEFS)) {
    if (d.enabled && d.item) {
      if (!ITEM.get(d.item)) err(`độ kiếp ${id}: vật phẩm ${d.item} không tồn tại`);
      if (!RECIPES.some((r) => r.output.id === d.item)) err(`độ kiếp ${id}: ${d.item} không có công thức chế`);
    }
    if (d.enabled && !d.item && id !== 'truc_co') err(`độ kiếp ${id}: bật mà chưa có vật phẩm đột phá`);
    for (const p of d.phases) {
      if (p.mechanic === 'dan_tran') {
        const dt = p.danTran;
        if (
          !dt ||
          !(
            dt.r > 0 &&
            dt.fill > 0 &&
            dt.drain >= 0 &&
            dt.sweepEvery > 0 &&
            dt.sweepLen > 0 &&
            dt.sweepW > 0 &&
            dt.sweepWarn > 0 &&
            dt.sweepPct > 0 &&
            dt.sweepPct < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số danTran`);
        else if (dt.fill > p.end - (d.phases[d.phases.indexOf(p) - 1]?.end ?? 0))
          err(`độ kiếp ${id}/${p.id}: fill dài hơn pha, không thể ngưng đan`);
      }
      if (p.mechanic === 'tia_xich') {
        const x = p.tiaXich;
        if (
          !x ||
          !(x.every > 0 && x.len > 0 && x.w > 0 && x.warn > 0 && x.pct > 0 && x.pct < 1 && x.endR > 0 && x.endPct > 0 && x.endPct < 1)
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số tiaXich`);
      }
      if (p.mechanic === 'xuat_khieu') {
        const x = p.xuatKhieu;
        if (!x || !(x.dur > 0 && x.cd >= x.dur) || !p.grid)
          err(`độ kiếp ${id}/${p.id}: xuat_khieu cần xuatKhieu {dur, cd >= dur} và lưới ô lửa (grid)`);
      }
      if (p.mechanic === 'dan_loi') {
        const x = p.danLoi;
        if (!x || !(x.ring > 0 && x.steleR > 0 && x.first >= 0 && x.every > 0 && x.warn > 0 && x.pct > 0 && x.pct < 1 && x.r > 0))
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số danLoi`);
        else if (!(x.first + 5 * x.every <= p.end - (d.phases[d.phases.indexOf(p) - 1]?.end ?? 0)))
          err(`độ kiếp ${id}/${p.id}: pha dẫn lôi quá ngắn để thắp đủ năm bia`);
      }
      if (p.mechanic === 'nhat_thuc') {
        const x = p.nhatThuc;
        if (
          !x ||
          !MONSTER.get(x.boss) ||
          !(
            x.dist > 0 &&
            x.smashEvery > 0 &&
            x.smashWarn > 0 &&
            x.smashR > 0 &&
            x.every > 0 &&
            x.warn > 0 &&
            x.r > 0 &&
            x.stun > 0 &&
            x.shieldEvery > 0 &&
            x.pct > 0 &&
            x.pct < 1 &&
            x.smashPct > 0 &&
            x.smashPct < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số nhatThuc (boss phải tồn tại)`);
        if (!d.phases.some((q) => q.danLoi)) err(`độ kiếp ${id}/${p.id}: nhat_thuc cần một pha dan_loi trước đó (bia của kiếp)`);
      }
      if (p.mechanic === 'hoi_dao') {
        const x = p.hoiDao;
        if (
          !x ||
          !(
            x.ring > 0 &&
            x.gateR > 0 &&
            x.rounds >= 1 &&
            x.first >= 0 &&
            x.ask > 0 &&
            x.rest >= 0 &&
            x.pct > 0 &&
            x.pct < 1 &&
            x.heal >= 0 &&
            x.heal < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số hoiDao`);
        else {
          // Ba Đạo Môn không chồng nhau, và đủ thời gian trong pha cho mọi vòng.
          if (!(x.ring * 2 * Math.sin(Math.PI / 3) > x.gateR * 2))
            err(`độ kiếp ${id}/${p.id}: hoiDao ba cổng chồng nhau (ring ${x.ring}, gateR ${x.gateR})`);
          if (!(x.first + x.rounds * (x.ask + x.rest) - x.rest <= p.end - (d.phases[d.phases.indexOf(p) - 1]?.end ?? 0)))
            err(`độ kiếp ${id}/${p.id}: pha hỏi đạo quá ngắn cho ${x.rounds} vòng`);
        }
      }
      if (p.mechanic === 'am_lan') {
        const x = p.amLan;
        if (
          !x ||
          !(
            x.ring > 0 &&
            x.keep >= 0 &&
            x.first >= 0 &&
            x.every > 0 &&
            x.seed >= 0 &&
            x.grow > 0 &&
            x.hold >= 0 &&
            x.r0 > 0 &&
            x.r1 > x.r0 &&
            x.max >= 1 &&
            x.tick > 0 &&
            x.dps > 0 &&
            x.dps * x.tick < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số amLan`);
        // Vực lan phải chậm hơn người chạy (7 m/s) để né được.
        else if (!((x.r1 - x.r0) / x.grow < 6)) err(`độ kiếp ${id}/${p.id}: amLan lan nhanh hơn người chạy được`);
      }
      if (p.mechanic === 'duong_dap') {
        const x = p.duongDap;
        if (
          !x ||
          !(
            x.first >= 0 &&
            x.every > x.windup &&
            x.windup > x.win &&
            x.win >= 0.8 &&
            x.pct > 0 &&
            x.pct < 0.5 &&
            x.cut > 0 &&
            x.cut < 1 &&
            x.heal >= 0 &&
            x.heal < 1
          )
        )
          err(`độ kiếp ${id}/${p.id}: thiếu hoặc sai thông số duongDap (cửa sổ phản đòn >= 0,8 s cho nhịp GCD, đòn < 50% khí huyết)`);
      }
      if (p.final?.gateSteles !== undefined && !(p.final.gateSteles >= 1 && p.final.gateSteles <= 5 && d.phases.some((q) => q.danLoi)))
        err(`độ kiếp ${id}/${p.id}: gateSteles ngoài 1–5 hoặc thiếu pha dan_loi`);
      if (p.mechanic === 'tam_canh') {
        const x = p.tamCanh;
        if (!x || !(x.hurt > 0 && x.hit >= 0 && x.skillEvery > 0 && x.skillWarn > 0 && x.skillPow > 0) || !p.shadows)
          err(`độ kiếp ${id}/${p.id}: tam_canh cần tamCanh {hurt, hit, skillEvery, skillWarn, skillPow} và shadows`);
      }
    }
  }
  // Thiên Nhân Ngũ Suy (TN-4): mỗi pha của kiếp chuỗi là một ải có cơ chế `suy_*` riêng, đủ thông số và qua được bằng thao tác.
  for (const [id, d] of Object.entries(TRIB_DEFS)) {
    const w = `độ kiếp ${id}`;
    const suyPhases = d.phases.filter((p) => isSuyMechanic(p.mechanic) || p.suy);
    if (!d.chain) {
      if (suyPhases.length) err(`${w}: cơ chế suy_* chỉ dùng trong kiếp chuỗi (chain)`);
      if (d.stageGold || d.law) err(`${w}: stageGold/law chỉ dùng trong kiếp chuỗi`);
      continue;
    }
    if (d.room !== 'tribulation') err(`${w}: kiếp chuỗi phải chạy ở room tribulation`);
    if (d.to === d.from && d.enabled) err(`${w}: kiếp chuỗi còn mốc tạm (to = from) thì không được bật`);
    // Huyền Kiếp (TN-6): ba chuỗi × ba kiếp nhỏ `hk_*`, tên theo glossary.huyenKiep, thông số đủ theo HK_PARAMS.
    if (d.phases.some((p) => isHkMechanic(p.mechanic))) {
      const ci = (HUYEN_CHAINS as readonly string[]).indexOf(id);
      const grp = ['ngoai', 'noi', 'hon'][ci];
      if (ci < 0 || !grp) err(`${w}: cơ chế hk_* chỉ dùng trong ${HUYEN_CHAINS.join(', ')}`);
      else {
        const names = GLOSSARY.huyenKiep[grp as keyof typeof GLOSSARY.huyenKiep] as Record<string, string>;
        if (d.phases.map((p) => p.id).join() !== Object.keys(names).join())
          err(`${w}: pha phải đúng thứ tự ${Object.keys(names).join(', ')} (glossary.huyenKiep.${grp})`);
        if (d.phases.map((p) => p.mechanic).join() !== HK_MECHANICS.slice(ci * 3, ci * 3 + 3).join())
          err(`${w}: cơ chế phải là ${HK_MECHANICS.slice(ci * 3, ci * 3 + 3).join(', ')}`);
        if ((d.after ?? '') !== (HUYEN_CHAINS[ci - 1] ?? '')) err(`${w}: after phải là ${HUYEN_CHAINS[ci - 1] ?? '(không có)'}`);
        if (t(`ui.trib.${id}.title`) !== `Huyền Kiếp · ${(GLOSSARY.huyenKiepGroups as Record<string, string>)[grp]}`)
          err(`${w}: tiêu đề lệch glossary.huyenKiepGroups`);
        for (const p of d.phases)
          if (hasString(`ui.trib.${id}.${p.id}`) && t(`ui.trib.${id}.${p.id}`) !== names[p.id])
            err(`${w}/${p.id}: tên lệch glossary.huyenKiep ("${names[p.id]}")`);
      }
      if (!d.stageGold || d.stageGold.length !== d.phases.length || d.stageGold.some((g) => !Number.isInteger(g) || g < 0 || g > 5000))
        err(`${w}: stageGold cần đúng ${d.phases.length} số nguyên trong [0, 5000]`);
      if (d.law) err(`${w}: Huyền Kiếp không có law (thưởng là bậc Bản Nguyên, móc huyenOriginTier)`);
      if (d.failXpLoss !== 0) err(`${w}: Huyền Kiếp không phạt tu vi (failXpLoss = 0)`);
      d.phases.forEach((p, i) => {
        const pw = `${w}/${p.id}`;
        const s = p.suy;
        const k = p.hk ?? {};
        const len = p.end - (d.phases[i - 1]?.end ?? 0);
        if (!s || !(s.rest >= 0 && s.rest < len && s.start >= 0 && s.start < 100 && s.rise >= 0 && s.riseEnd >= s.rise))
          return err(`${pw}: thiếu hoặc sai khối suy {rest, start, rise, riseEnd >= rise}`);
        if (!isHkMechanic(p.mechanic)) return err(`${pw}: mọi pha của Huyền Kiếp phải là một cơ chế hk_*`);
        for (const key of HK_PARAMS[p.mechanic]) if (!(k[key]! > 0)) err(`${pw}: hk.${key} phải là số dương`);
        for (const key of Object.keys(k))
          if (!HK_PARAMS[p.mechanic].includes(key)) err(`${pw}: hk.${key} không thuộc cơ chế ${p.mechanic}`);
        for (const key of ['pct', 'heal', 'bleed']) if (k[key] !== undefined && !(k[key]! <= 0.3)) err(`${pw}: hk.${key} quá 0,3`);
        const act = len - s.rest;
        const avg = (s.rise + s.riseEnd) / 2;
        // Không thao tác thì phải thất bại (Tuyết Kiếp: đứng yên còn bị cộng `cold`).
        if (!(s.start + (avg + (p.mechanic === 'hk_tuyet' ? k.cold! : 0)) * act >= 100)) err(`${pw}: đứng yên vẫn qua được`);
        // Thao tác đủ thì phải hóa giải nổi phần tự tăng.
        const best: Record<string, number> = {
          hk_tuyet: k.cure! * act,
          hk_phong: Math.floor(act / k.every!) * k.cure!,
          hk_loi: Math.floor(act / (k.hot! / k.rods!)) * k.cure!,
          hk_tram_ly: k.cure! * act,
          hk_huyet_anh: 3 * k.kill!,
          hk_van_tam: Math.floor(act / k.every!) * k.cure!,
          hk_kho_than: k.beats! * k.cure!,
          hk_hon_tho: Math.floor(act / k.every!) * k.cure!,
          hk_luan_hoi: Math.floor(act / k.every!) * k.cure!,
        };
        if (!(best[p.mechanic]! > avg * act - (100 - s.start))) err(`${pw}: thao tác đủ vẫn không giữ nổi thanh dưới 100`);
        if (p.mechanic === 'hk_kho_than' && !(k.beats! * k.every! <= act)) err(`${pw}: mười nhịp không vừa thời lượng kiếp`);
        if (p.mechanic === 'hk_phong' && !(k.every! > k.warn! && k.warn! >= 2)) err(`${pw}: every > warn >= 2 (kịp chạy ra sau trụ)`);
        if (p.mechanic === 'hk_van_tam' && !(k.every! >= k.show! + k.think! && k.seals! >= 3 && k.seals! <= 6))
          err(`${pw}: every >= show + think, seals 3–6`);
        if (p.mechanic === 'hk_luan_hoi' && !(k.sectors! >= 3 && k.sectors! <= 12 && k.every! > k.warn!))
          err(`${pw}: sectors 3–12, every > warn`);
        if (p.mechanic === 'hk_huyet_anh' && !MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma (Huyết Ảnh)`);
        needStr(`sys.${p.mechanic}_start`);
      });
      for (const key of ['fail', 'keep', 'stage', 'stage_gold', 'ok', 'done', 'need_prev']) needStr(`sys.hk_${key}`);
      for (const key of ['label', 'short']) needStr(`ui.trib.hk.${key}`);
      continue;
    }
    if (suyPhases.length !== d.phases.length) err(`${w}: mọi pha của kiếp chuỗi phải là một ải suy_*`);
    if (new Set(d.phases.map((p) => p.mechanic)).size !== d.phases.length) err(`${w}: mỗi ải phải dùng một cơ chế riêng`);
    if (id === 'ngu_suy' && d.phases.map((p) => p.mechanic).join() !== SUY_MECHANICS.join())
      err(`${w}: năm ải phải theo thứ tự ${SUY_MECHANICS.join(', ')}`);
    if (!d.stageGold || d.stageGold.length !== d.phases.length || d.stageGold.some((g) => !Number.isInteger(g) || g < 0 || g > 5000))
      err(`${w}: stageGold cần đúng ${d.phases.length} số nguyên trong [0, 5000]`);
    const law = d.law;
    if (!law || [law.hp, law.mp, law.atk, law.def].some((v) => !(v >= 0 && v <= 0.1)))
      err(`${w}: law cần hp/mp/atk/def trong [0, 0,1] (nội tại nhỏ, không phá cân bằng)`);
    if (d.failXpLoss !== 0) err(`${w}: Ngũ Suy không phạt tu vi (failXpLoss = 0)`);
    const names = (GLOSSARY as unknown as { nguSuy?: Record<string, string> }).nguSuy ?? {};
    d.phases.forEach((p, i) => {
      const pw = `${w}/${p.id}`;
      const s = p.suy;
      const len = p.end - (d.phases[i - 1]?.end ?? 0);
      if (!s || !(s.rest >= 0 && s.rest < len && s.start >= 0 && s.start < 100 && s.rise >= 0 && s.riseEnd >= s.rise)) {
        err(`${pw}: thiếu hoặc sai khối suy {rest, start, rise, riseEnd >= rise}`);
        return;
      }
      const act = len - s.rest;
      const avg = (s.rise + s.riseEnd) / 2;
      if (id === 'ngu_suy') {
        if (names[p.id] === undefined) err(`${pw}: tên ải phải có trong glossary.nguSuy`);
        else if (hasString(`ui.trib.${id}.${p.id}`) && t(`ui.trib.${id}.${p.id}`) !== names[p.id])
          err(`${pw}: chuỗi ui.trib.${id}.${p.id} phải đúng tên trong glossary ("${names[p.id]}")`);
      }
      needStr(`sys.${p.mechanic}_start`);
      // Không thao tác thì phải thất bại (ải không qua được bằng cách đứng chịu): riêng Thọ Nguyên Suy thất bại vì đèn tắt hết.
      if (p.mechanic !== 'suy_tho' && !(s.start + avg * act >= 100)) err(`${pw}: đứng yên vẫn qua được (start + tăng < 100)`);
      if (p.mechanic === 'suy_linh') {
        const x = s.linh;
        if (!x || !(x.ring > 0 && x.r > 0 && x.lifeEnd > 0 && x.life >= x.lifeEnd && x.cure > s.riseEnd && x.drain >= 0 && x.drain <= 0.2))
          err(`${pw}: linh cần {ring, r, life >= lifeEnd > 0, cure > riseEnd, drain trong [0, 0,2]}`);
      }
      if (p.mechanic === 'suy_the') {
        const x = s.the;
        if (
          !x ||
          !(
            x.every > x.warn &&
            x.warn > 0 &&
            x.r > 0 &&
            x.dist > x.r &&
            x.cure > 0 &&
            x.cost >= 0 &&
            x.cost <= 0.15 &&
            x.bleed >= 0 &&
            x.bleed <= 0.05
          )
        )
          err(`${pw}: the cần {every > warn > 0, r, dist > r, cure, cost <= 0,15, bleed <= 0,05}`);
        else if (!(Math.floor(act / x.every) * x.cure > avg * act)) err(`${pw}: đón đủ mọi tia vẫn không hóa giải nổi suy khí`);
      }
      if (p.mechanic === 'suy_thuc') {
        const x = s.thuc;
        if (
          !x ||
          !(x.sectors >= 3 && x.sectors <= 16 && x.safe >= 1 && x.safe < x.sectors && x.r > 0 && x.every > x.warn && x.warn >= 1.5) ||
          !(x.pct > 0 && x.pct <= 0.3 && x.hurt > 0 && x.cure > 0 && x.cd > 0 && x.cdEnd >= x.cd)
        )
          err(`${pw}: thuc cần {sectors 3–16, 1 <= safe < sectors, r, every > warn >= 1,5, pct <= 0,3, hurt, cure, cdEnd >= cd > 0}`);
        else if (!(Math.floor(act / x.every) * x.cure > avg * act)) err(`${pw}: né đủ mọi đợt vẫn không hóa giải nổi suy khí`);
      }
      if (p.mechanic === 'suy_tho') {
        const x = s.tho;
        if (
          !x ||
          !(x.lamps >= 3 && x.lamps <= 8 && x.ring > 0 && x.r > 0 && x.light > 0 && x.gustEnd > 0 && x.gust >= x.gustEnd && x.warn > 0) ||
          !(x.per > 0 && x.cure >= 0)
        )
          err(`${pw}: tho cần {lamps 3–8, ring, r, light, gust >= gustEnd > 0, warn, per, cure}`);
        else if (!(x.gustEnd + x.warn > x.light)) err(`${pw}: đèn tắt nhanh hơn thời gian thắp một ngọn, không thể giữ`);
      }
      if (p.mechanic === 'suy_tam') {
        const x = s.tam;
        if (!x || !(x.calm > 0 && x.strike >= 2 && x.hitBad > 0 && x.hitGood > 0 && x.miss >= 0 && x.hurt >= 0 && x.hpFrac >= 1))
          err(`${pw}: tam cần {calm, strike >= 2, hitBad, hitGood, miss, hurt, hpFrac >= 1}`);
        else if (!(Math.floor(act / (x.calm + x.strike)) * x.hitGood > avg * act - (100 - s.start)))
          err(`${pw}: trúng đủ mọi nhịp phá vọng vẫn không giữ nổi thanh dưới 100`);
        if (!MONSTER.get('mon_tam_ma')) err(`${pw}: thiếu quái mon_tam_ma (Tâm Ma Ảnh)`);
      }
    });
    for (const k of ['sys.suy_fail', 'sys.suy_keep', 'sys.suy_stage', 'sys.suy_stage_gold', 'sys.suy_law', 'sys.suy_ok', 'sys.suy_done'])
      needStr(k);
    for (const k of ['label', 'rest', 'stage']) needStr(`ui.trib.suy.${k}`);
  }
  if (!tribForLevel(19)?.enabled) err('độ kiếp Kết Đan (cấp 19) phải đang bật (E2-D)');
  if (peakGated(19) || peakGated(23) || peakGated(27))
    err('peakGated: không còn bình cảnh nào bị chặn (Trúc Cơ 19, Kết Đan 23, Nguyên Anh 27 đã mở)');
  if (!tribForLevel(27)?.enabled) err('độ kiếp Hóa Thần (cấp 27) phải đang bật (E4-D)');
  if (!tribForLevel(23)?.enabled) err('độ kiếp Nguyên Anh (cấp 23) phải đang bật (E3-L)');
  if (TRIB_DEFS.truc_co.room !== 'world' || !TRIB_DEFS.truc_co.enabled) err('độ kiếp truc_co: phải chạy ở room world và đang bật');
}

// ---- Pháp bảo phụ và đan (P3-8) ----
uniqueIds('artifact', ARTIFACTS);
for (const a of ARTIFACTS) {
  const w = `pháp bảo ${a.id}`;
  const def = ITEM.get(a.id);
  if (!def || def.kind !== 'artifact') err(`${w}: vật phẩm phải có kind artifact`);
  // `proc`: chưa có GLB, client dựng mesh thủ tục theo id asset; khi có meta.json của asset thì phải bỏ cờ.
  const hasMeta = fs.existsSync(fileURLToPath(new URL(`../../../assets/source/prop/${a.asset}/meta.json`, import.meta.url)));
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

// ---- Ghi công (DV1-B): credits.json đối chiếu meta.json + assets/LICENSES.md ----
{
  const root = fileURLToPath(new URL('../../../assets/', import.meta.url));
  const licenses = fs.readFileSync(root + 'LICENSES.md', 'utf8');
  const metas = new Map<string, { kind?: string; spdx?: string }>();
  for (const type of fs.readdirSync(root + 'source')) {
    for (const id of fs.readdirSync(root + `source/${type}`)) {
      const f = root + `source/${type}/${id}/meta.json`;
      if (!fs.existsSync(f)) continue;
      const m = JSON.parse(fs.readFileSync(f, 'utf8')) as { import?: { kind?: string }; license?: { spdx?: string } };
      metas.set(id, { kind: m.import?.kind, spdx: m.license?.spdx });
    }
  }
  uniqueIds('credit', CREDITS);
  const covered = new Set<string>();
  for (const c of CREDITS) {
    const w = `credits ${c.id}`;
    if (!CREDIT_KINDS.includes(c.kind)) err(`${w}: kind không hợp lệ ${c.kind}`);
    if (!c.title || !c.author || !/^https:\/\//.test(c.url)) err(`${w}: thiếu title/author hoặc url https`);
    if (!CREDIT_LICENSE_URL[c.license]) err(`${w}: giấy phép chưa có link ở CREDIT_LICENSE_URL: ${c.license}`);
    if (!hasString(`ui.credits.license.${c.license}`)) err(`${w}: thiếu chuỗi ui.credits.license.${c.license}`);
    if (!hasString(`ui.credits.kind.${c.kind}`)) err(`${w}: thiếu chuỗi ui.credits.kind.${c.kind}`);
    for (const m of c.mods) if (!hasString(`ui.credits.mod.${m}`)) err(`${w}: thiếu chuỗi ui.credits.mod.${m}`);
    if (c.license.startsWith('CC-BY') && c.mods.length === 0) err(`${w}: CC BY phải ghi rõ đã chỉnh sửa gì (mods)`);
    if (c.license === 'CC-BY-NC-4.0' && c.note !== 'nc')
      err(`${w}: CC BY-NC phải có note: "nc" (màn Ghi công nhắc gỡ nếu game có thu tiền)`);
    if (c.note && !hasString(`ui.credits.note.${c.note}`)) err(`${w}: thiếu chuỗi ui.credits.note.${c.note}`);
    if (c.pending) continue;
    if (c.license.startsWith('CC-BY') && !licenses.includes(c.url)) err(`${w}: assets/LICENSES.md thiếu link nguồn ${c.url}`);
    for (const a of c.assets ?? []) {
      covered.add(a);
      const m = metas.get(a);
      if (!m) err(`${w}: không có assets/source/*/${a}/meta.json (nếu asset chưa vào main thì đặt pending: true)`);
      else if (m.spdx && m.spdx !== c.license) err(`${w}: giấy phép ${c.license} lệch meta.json của ${a} (${m.spdx})`);
      if (!licenses.includes('`' + a + '`')) err(`${w}: assets/LICENSES.md thiếu dòng cho ${a}`);
    }
  }
  // Mọi asset nguồn ngoài (import.kind external) hoặc có giấy phép bên thứ ba (spdx) phải có mục ghi công.
  for (const [id, m] of metas) {
    if (covered.has(id)) continue;
    if (m.kind === 'external' || m.spdx)
      err(`asset ${id} (${m.spdx ?? 'external'}) chưa có mục ghi công trong packages/content/data/credits.json`);
  }
}

// TN-0: ranh giới Tiên Nghịch (docs/handbook/lore-boundary.md). Các bộ thuật ngữ mượn đủ số lượng; không file nào trong
// data/ (dữ liệu game, i18n, level, fx…) chứa tên cấm: nhân vật, nơi khởi đầu, tông môn, pháp bảo trung tâm, tên truyện.
for (const e of checkLoreTerms(GLOSSARY)) err(e);
for (const e of scanBannedDir(fileURLToPath(new URL('../data/', import.meta.url)))) err(e);

if (errors.length) {
  console.error(`\n${errors.length} lỗi nội dung:`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log('Nội dung hợp lệ.');

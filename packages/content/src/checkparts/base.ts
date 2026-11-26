// Tách từ check.ts (tối ưu Đợt E): base.

import fs from 'node:fs';
import {
  GCD,
  POSE_CAST,
  POSE_FLY,
  POSE_SKY,
  POSE_SWORD_SWAP,
  validatePose,
  validateFxTimeline,
  validateVfxCard,
  checkStandard2,
  isRedOrange,
  validateMonVfxCard,
  FLIP_ATLASES,
  type VfxCard,
  type MonVfxCard,
  fxDrawCount,
  fxParticleCount,
  FX_SKILL_DRAW_MAX,
  validateSkillPose,
} from '@dtl/shared';
import {
  ITEMS,
  MONSTER,
  MONSTERS,
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
  QUESTS,
  RECIPES,
  SKILLS,
  METHODS,
  METHOD_SKILLS,
  SKILL,
} from '../index';
import { checkFxCover, fxCoverEstimate, HK_MECHANICS, SUY_MECHANICS } from '@dtl/shared';
import { PATH } from '../index';

import { err, errors } from './errors';
export { err, errors };

export function uniqueIds(kind: string, list: { id: string }[]) {
  const seen = new Set<string>();
  for (const e of list) {
    if (seen.has(e.id)) err(`${kind}: id trùng ${e.id}`);
    seen.add(e.id);
    if (!/^[a-z0-9_]+$/.test(e.id)) err(`${kind}: id không hợp lệ ${e.id}`);
  }
}

uniqueIds('item', ITEMS);
uniqueIds('monster', MONSTERS);
export const ALL_SKILLS = [...SKILLS, ...METHOD_SKILLS];
uniqueIds('skill', ALL_SKILLS);
uniqueIds('method', METHODS);
uniqueIds('recipe', RECIPES);
uniqueIds('npc', NPCS);
uniqueIds('quest', QUESTS);
uniqueIds('pose', POSES);
for (const p of POSES) for (const m of validatePose(p)) err(m);
export const POSE = new Map(POSES.map((p) => [p.id, p]));
// Dòng thời gian hiệu ứng (VFX-V0): chiêu có thật, mốc hợp lệ, ngân sách ≤ 12 draw và ≤ 1.500 hạt mỗi chiêu.
for (const f of FX_TIMELINES) for (const m of validateFxTimeline(f, (id) => SKILL.has(id) || id.startsWith('fx_'))) err(m);
// Thẻ chiêu VFX (V-P0): mỗi file data/vfx/cards/<skillId>.json, tên file = skillId; chiêu và hướng tu có thật, ngân sách trong trần.
{
  const dir = new URL('../../data/vfx/cards/', import.meta.url);
  const manifestUrl = new URL('../../../../apps/client/public/assets/vfx/manifest.json', import.meta.url);
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
      (id) => id.startsWith('fx_') && FX_TIMELINES.some((t) => t.skill === id),
    ))
      err(m);
    // Chuẩn "Họa Pháp Lô 2": thẻ khai `standard: 2` thì kiểm các luật đo được trên timeline (xem `checkStandard2`).
    if (card.standard === 2) {
      const tl2 = FX_TIMELINES.find((t) => t.skill === card.skillId);
      const pal = (card.scene?.palette ?? PATH.get(card.path)?.palette) as Record<string, string> | undefined;
      const redTones = new Set(
        Object.entries(pal ?? {})
          .filter(([, hex]) => isRedOrange(hex))
          .map(([tone]) => tone),
      );
      for (const m of checkStandard2(card, tl2?.events ?? [], !!SKILL.get(card.skillId)?.ult, {
        redTones,
        hitAt: SKILL.get(card.skillId)?.hitAt?.[0],
        impactAt: card.scene?.impactAt,
      }))
        err(m);
    }
    // Thẻ là nguồn ý đồ: `impactFrame` phải khớp việc timeline có sự kiện `impact`.
    const tl = FX_TIMELINES.find((t) => t.skill === card.skillId);
    const hasImpact = !!tl?.events.some((e) => e.type === 'impact');
    if (tl && !!card.impactFrame !== hasImpact) {
      err(`vfxcard ${card.skillId}: impactFrame=${!!card.impactFrame} nhưng timeline ${hasImpact ? 'có' : 'không có'} sự kiện impact`);
    }
    // Texture KTX2 do vfx-forge ghi vào manifest; `proc:*` là atlas thủ tục có sẵn.
    for (const t of card.textures) {
      if (t.id.startsWith('proc:')) {
        if (!(FLIP_ATLASES as readonly string[]).includes(t.id.slice(5))) err(`vfxcard ${card.skillId}: atlas thủ tục lạ ${t.id}`);
      } else if (!vfxTexIds.has(t.id)) err(`vfxcard ${card.skillId}: texture ${t.id} chưa có trong assets/vfx/manifest.json`);
    }
  }
}
// Thẻ chiêu VFX của quái/boss (V-P9): data/vfx/cards/mon/<monId>__<move>.json; vùng và nhịp nạp phải bằng `ai` của quái (không vẽ nói dối hitbox).
{
  const dir = new URL('../../data/vfx/cards/mon/', import.meta.url);
  const moveOf = (key: string) => {
    const [monId, mv] = key.split(':');
    const def = MONSTER.get(monId!) as
      | {
          ai?: Record<
            string,
            { r: number; delay: number; w?: number; shape?: string; cone?: { r: number; delay: number; w?: number } } | undefined
          >;
          phases?: { ai?: Record<string, { r: number; delay: number; w?: number; shape?: string } | undefined> }[];
        }
      | undefined;
    // Chui đất (E1-E): `burrow` = vòng tròn bán kính `r`, báo `hide` giây; `emerge` = quạt `cone` (dài `cone.r`, báo `cone.delay`). Chiêu khác đọc thẳng `ai[mv]`.
    if (mv === 'burrow' || mv === 'emerge') {
      const bu = [def?.ai, ...(def?.phases?.map((p) => p.ai) ?? [])].map((a) => a?.burrow).find(Boolean) as
        { r: number; hide: number; cone: { r: number; delay: number; w?: number } } | undefined;
      if (!bu) return undefined;
      return mv === 'burrow'
        ? { r: bu.r, delay: bu.hide, shape: 'circle' as const }
        : { r: bu.cone.r, delay: bu.cone.delay, shape: 'cone' as const, w: bu.cone.w };
    }
    const c = def?.ai?.[mv!] ?? def?.phases?.map((p) => p.ai?.[mv!]).find(Boolean);
    if (!c) return undefined;
    // Đòn niệm của tinh anh (`caster`): vùng `circle`/`cone` theo `shape` của chiêu (đạn `bolt` là đạn bay, không có thẻ vùng).
    const shape =
      mv === 'sweep'
        ? c.shape === 'rect'
          ? 'rect'
          : 'cone'
        : mv === 'caster'
          ? c.shape === 'cone'
            ? 'cone'
            : 'circle'
          : mv === 'line' || mv === 'charge'
            ? 'rect'
            : 'circle';
    return { r: c.r, delay: c.delay, shape: shape as 'circle' | 'cone' | 'rect', w: shape === 'circle' ? undefined : c.w };
  };
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const card = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')) as MonVfxCard;
      if (f !== `${card.monId}__${card.move}.json`) err(`vfxcard mon ${f}: tên file phải là ${card.monId}__${card.move}.json`);
      for (const m of validateMonVfxCard(card, { move: moveOf, exists: (id) => MONSTER.has(id) })) err(m);
    }
  }
}
// B10: ước lượng TĨNH độ phủ màn + overdraw của timeline vùng nổ (`mon_boom_*`) so với trần của thẻ (ước lượng thô, xem shared/fxcover.ts; `pixelCover` đo trên ảnh mới là số thật).
{
  const dir = new URL('../../data/vfx/cards/mon/', import.meta.url);
  const byKey = new Map(MON_FX_TIMELINES.map((t) => [t.skill, t]));
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const card = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')) as MonVfxCard;
      const sh = card.zone.shape === 'circle' ? 'circle' : card.zone.shape === 'cone' ? 'cone' : 'line';
      const tl = byKey.get(`mon_boom_${sh}__${card.monId}__${card.move}`);
      if (!tl) continue;
      const mul = Math.min(4, Math.max(0.5, card.zone.r / (sh === 'circle' ? 4 : 8)));
      const est = fxCoverEstimate(tl.events, { mul });
      for (const m of checkFxCover(`fx ${tl.skill}`, est, card.budget)) err(m);
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

// Sinh thẻ chiêu VFX cho mọi chiêu của một hướng tu (V-P2..P8): từ dữ liệu chiêu (loại, tầm, bán kính, nhịp), timeline hiện có (ngân sách thật,
// hình khối, khung va chạm) và mô tả chiêu. Không ghi đè thẻ đã có (thẻ pilot sửa tay). `idea` lấy từ mô tả chiêu; sửa tay nếu cần.
import fs from 'node:fs';
import path from 'node:path';
import {
  FLIP_ATLASES,
  VFX_CARD_CAPS,
  fxDrawCount,
  fxParticleCount,
  type FxTimeline,
  type VfxCard,
  type VfxElement,
  type VfxShapeLang,
} from '@dtl/shared';
import { FX_TIMELINES, METHOD_SKILLS, PATHS, SKILLS } from '@dtl/content';

const ELEM: Record<string, VfxElement> = {
  kim: 'kim',
  moc: 'moc',
  thuy: 'thuy',
  hoa: 'hoa',
  tho: 'tho',
  loi: 'loi',
  am: 'am',
  quang: 'quang',
};

function shapesOf(tl: FxTimeline | undefined): VfxShapeLang[] {
  const out = new Set<VfxShapeLang>();
  for (const e of tl?.events ?? []) {
    if (e.type !== 'mesh') continue;
    const s = String(e.shape);
    if (s.startsWith('slash') || s === 'crescent' || s.startsWith('blade')) out.add('arc');
    else if (s.startsWith('bolt') || s === 'spark_streak' || s === 'kite') out.add('line');
    else if (s.includes('ring') || s === 'ripple' || s === 'shock_cone') out.add('ring');
    else if (s === 'spike' || s.startsWith('crack') || s.startsWith('rubble') || s.endsWith('_spire')) out.add('spike');
    else if (s === 'burst' || s === 'flip') out.add('burst');
    else if (s === 'helix' || s === 'ribbon' || s === 'dragon') out.add('spiral');
    else if (s === 'smoke') out.add('cloud');
  }
  return out.size ? [...out].slice(0, 3) : ['arc'];
}

export function cardFor(skillId: string, name: string, desc: string): VfxCard {
  const def = [...SKILLS, ...METHOD_SKILLS].find((s) => s.id === skillId)!;
  const tl = FX_TIMELINES.find((t) => t.skill === skillId);
  const path_ = PATHS.find((p) => p.methods.includes(def.method ?? ''));
  const hit = def.hitAt?.[0] ?? 0.3;
  const windup = def.windup ?? hit;
  const radius = def.radius ?? 0;
  const range = def.range ?? 0;
  const draws = tl ? fxDrawCount(tl.events) : 6;
  const parts = tl ? fxParticleCount(tl.events) : 100;
  const textures = new Set<string>();
  for (const e of tl?.events ?? [])
    if (e.type === 'mesh' && e.shape === 'flip' && e.flip && (FLIP_ATLASES as readonly string[]).includes(e.flip))
      textures.add(`proc:${e.flip}`);
  const lengthM = radius > 0 ? radius * 2 : def.kind === 'dash' ? Math.min(range || 10, 12) : Math.min(Math.max(range, 4), 14);
  const widthM = radius > 0 ? radius * 2 : def.kind === 'line' ? 3 : 2.5;
  const cap = VFX_CARD_CAPS;
  return {
    skillId,
    idea: `${name}: ${desc}`.slice(0, 280),
    element: ELEM[def.elem ?? ''] ?? 'vo',
    path: path_?.id ?? 'kiem_tu',
    shapeLang: shapesOf(tl),
    timing: {
      anticipationMs: Math.round(Math.max(0, windup) * 1000),
      impactMs: 80,
      lingerMs: Math.round(Math.max(0.4, def.recovery ?? 0.6) * 1000),
    },
    footprint: { lengthM: Math.max(1, lengthM), widthM: Math.max(1, widthM), heightM: def.kind === 'aoe' || def.ult ? 6 : 2 },
    colorRole: 'own',
    telegraph: false,
    budget: {
      drawCalls: Math.min(cap.drawCalls, Math.max(4, Math.ceil(draws * 1.2))),
      particles: Math.min(cap.particles, Math.max(120, Math.ceil(parts * 1.3 + 100))),
      screenCover: def.kind === 'aoe' || def.ult ? 0.35 : 0.2,
      overdraw: def.kind === 'aoe' || def.ult ? 6 : 4,
    },
    textures: [...textures].map((id) => ({ id, kind: 'flipbook' as const })),
    ...(tl?.events.some((e) => e.type === 'impact') ? { impactFrame: true } : {}),
  };
}

/** Ghi thẻ cho mọi chiêu của hướng tu `pathId` chưa có thẻ; trả các id mới và id bỏ qua. */
export function writeCards(pathId: string, root: string, i18n: Record<string, string>): { written: string[]; skipped: string[] } {
  const p = PATHS.find((x) => x.id === pathId);
  if (!p) throw new Error(`hướng tu lạ: ${pathId}`);
  const dir = path.join(root, 'packages/content/data/vfx/cards');
  fs.mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const skipped: string[] = [];
  const all = [...SKILLS, ...METHOD_SKILLS].filter((s) => p.methods.includes(s.method ?? ''));
  for (const s of all) {
    const f = path.join(dir, `${s.id}.json`);
    if (fs.existsSync(f)) {
      skipped.push(s.id);
      continue;
    }
    const name = i18n[`skill.${s.id}.name`] ?? s.id;
    const desc = i18n[`skill.${s.id}.desc`] ?? name;
    const card = cardFor(s.id, name, desc);
    fs.writeFileSync(f, JSON.stringify(card, null, 2) + '\n');
    written.push(s.id);
  }
  return { written, skipped };
}

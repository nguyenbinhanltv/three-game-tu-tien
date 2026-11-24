// Bộ texture dùng chung theo hệ (Họa Pháp Lô 2): decal nhìn thẳng từ trên + flipbook, Codex vẽ, nền đen thuần (alpha tách từ độ sáng ở `forge import`).
// Dùng chung giữa quái/boss (V-P9) và chiêu người chơi (-265): mỗi boss vẫn phải có silhouette riêng, texture chỉ là LỚP CHẤT LIỆU.
import type { CodexJob } from './codex.js';

export interface SharedTex {
  id: string;
  kind: 'decal' | 'flipbook';
  grid?: string;
  /** Mô tả riêng; phần chung (nền đen, nhìn từ trên, cấm chữ) thêm ở `sharedJob`. */
  brief: string;
}

export const SHARED_TEX: SharedTex[] = [
  {
    id: 'warn_crack',
    kind: 'decal',
    brief:
      'A circular ground-warning disc seen from straight above: a network of jagged radial fracture veins spreading from the center to the rim, hand-painted. Thin white-hot core lines inside thicker saturated crimson-red glow, with darker deep-red gaps between veins, a few branching hairline cracks, and a thin continuous bright rim ring at the edge. Menacing enemy-attack warning look.',
  },
  {
    id: 'ice_crack',
    kind: 'decal',
    brief:
      'A circular sheet of frozen cracked ice seen from straight above: dense irregular fissures radiating from the center, deep navy-blue cracks under translucent cyan ice plates, pale frost crystals dusting the edges, a bright white-gold thin rim ring at the edge with tiny ice shards flying outward. Hand-painted semi-realistic cultivation-fantasy style.',
  },
  {
    id: 'ice_flip',
    kind: 'flipbook',
    grid: '4x4',
    brief:
      'Flipbook of a ground ice eruption seen from a 52-degree overhead angle, 16 frames in reading order: frame 1 a small frost puff, frames 2-6 jagged ice shards thrusting up with cold white mist, frames 7-10 peak burst with flying crystal fragments, frames 11-16 shards shattering and thin frost mist dissipating to nothing. Cyan, pale blue and white tones with deep navy shadow edges.',
  },
  {
    id: 'steel_crack',
    kind: 'decal',
    brief:
      'A circular patch of cracked dark flagstone seen from straight above: fine bright silver-white fracture lines radiating from the center, small steel blade fragments and metal sparks scattered on the cracks, cold blue-grey tones with a thin continuous bright white-silver rim ring at the edge. Hand-painted semi-realistic cultivation-fantasy style, no red or orange.',
  },
  {
    id: 'ember_crack',
    kind: 'decal',
    brief:
      'A circular patch of scorched charred ground seen from straight above: black burnt cracks with thin white-gold hot glowing veins (the hot light is pale yellow-white, NOT flat orange), grey ash drifts, a few ember sparks, and a thin continuous pale-gold rim ring at the edge. The core of the patch stays dark charcoal black. Hand-painted semi-realistic cultivation-fantasy style.',
  },
  {
    id: 'bolt_scorch',
    kind: 'decal',
    brief:
      'A circular scorch mark seen from straight above: branching fractal lightning burn scars radiating from the center, glowing violet-blue and white electric arcs along the scars, dark burnt ground between them, small sparks, and a thin continuous pale-yellow rim ring at the edge. Hand-painted semi-realistic cultivation-fantasy style.',
  },
  {
    id: 'jade_crack',
    kind: 'decal',
    brief:
      'A circular patch of cracked dry earth seen from straight above: brown clay plates split by glowing jade-teal fissures, small stone chips, a soft dust haze at the edges, and a thin continuous warm golden rim ring at the edge. Hand-painted semi-realistic cultivation-fantasy style, no red.',
  },
  {
    id: 'root_mat',
    kind: 'decal',
    brief:
      'A circular mat of twisting thorny brown roots seen from straight above, roots radiating and curling from the center over dark ground with toxic lime-green glow in the gaps, floating green spores, and a thin continuous pale-lime rim ring at the edge. Hand-painted semi-realistic cultivation-fantasy style, no red.',
  },
  {
    id: 'steel_flip',
    kind: 'flipbook',
    grid: '4x4',
    brief:
      'Flipbook of a ground burst of steel sword blades seen from a 52-degree overhead angle, 16 frames in reading order: frame 1 a tiny spark flash, frames 2-6 sharp steel blades thrusting up from the ground with white sparks, frames 7-10 peak burst with flying metal shards, frames 11-16 blades fading into thin silver dust and sparks until nothing. Silver, white and cold blue-grey tones with dark shadow edges.',
  },
  {
    id: 'fire_flip',
    kind: 'flipbook',
    grid: '4x4',
    brief:
      'Flipbook of a ground ember burst seen from a 52-degree overhead angle, 16 frames in reading order: frame 1 a small white-gold flash on the ground, frames 2-6 a claw-shaped splash of molten white-gold sparks and black ash thrusting up, frames 7-10 peak burst with flying embers and a dark ash plume, frames 11-16 the plume thinning to drifting grey ash and sparks until nothing. Dark charcoal cores with pale gold-white hot edges, avoid flat orange.',
  },
  {
    id: 'bolt_flip',
    kind: 'flipbook',
    grid: '4x4',
    brief:
      'Flipbook of a lightning column strike seen from a 52-degree overhead angle, 16 frames in reading order: frame 1 a thin crackle on the ground, frames 2-5 a jagged violet-white bolt slamming down with a bright flash, frames 6-9 peak with branching arcs and a glowing impact ring, frames 10-16 the bolt fading into thin electric arcs and violet smoke until nothing. Violet, blue and white tones with pale yellow cores.',
  },
  {
    id: 'earth_flip',
    kind: 'flipbook',
    grid: '4x4',
    brief:
      'Flipbook of a ground eruption of rock spires seen from a 52-degree overhead angle, 16 frames in reading order: frame 1 a small dust puff, frames 2-6 brown stone spires and slabs thrusting up with jade-teal glints and dust, frames 7-10 peak burst with flying rubble, frames 11-16 spires crumbling and dust settling until nothing. Warm brown clay tones with jade-teal light in the cracks.',
  },
  {
    id: 'root_flip',
    kind: 'flipbook',
    grid: '4x4',
    brief:
      'Flipbook of thorny roots bursting out of the ground seen from a 52-degree overhead angle, 16 frames in reading order: frame 1 a small soil crack with green glow, frames 2-6 thick brown thorny roots whipping upward with toxic green spores, frames 7-10 peak tangle with flying spores and leaves, frames 11-16 the roots withering and green mist dissipating until nothing. Brown wood with lime-green toxic glow.',
  },
];

export function sharedJob(id: string, outDir: string, refs: string[] = []): CodexJob {
  const t = SHARED_TEX.find((x) => x.id === id);
  if (!t) throw new Error(`texture dùng chung không có: ${id} (có: ${SHARED_TEX.map((x) => x.id).join(', ')})`);
  const common =
    'Pure solid black (#000000) background, no ground, no sky, no shadows, no text, no letters, no logo, no watermark, no people, no weapons. Hand-painted stylized semi-realistic game VFX texture, high contrast, strokes not thinner than 3% of the frame, subject centered and fully inside the frame (not cut at edges).';
  const layout =
    t.kind === 'decal'
      ? 'One single square image, the subject fills about 92% of the frame, perfectly top-down orthographic, circular.'
      : `A ${t.grid} grid sprite sheet on one square image, equal square cells, each frame fully inside its cell with black margin, no borders between cells.`;
  return { name: id, prompt: `${t.brief}\n${layout}\n${common}`, images: refs, outDir };
}

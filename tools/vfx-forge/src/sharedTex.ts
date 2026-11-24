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

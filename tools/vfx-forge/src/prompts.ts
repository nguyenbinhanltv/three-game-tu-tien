// Dựng prompt Codex cho quy trình Họa Pháp Lô: concept 4 khung đúng góc camera (image-to-image trên ảnh chụp game) và bộ texture
// (flipbook nền đen, decal nhìn từ trên, noise lát được, ramp 3 tông). Hàm thuần để kiểm; chạy Codex ở codex.ts.
import type { VfxCard } from '@dtl/shared';

export interface StyleSheet {
  name: string;
  summary: string;
  ramp: { core: string; body: string; rim: string };
  stroke: { minWidthPctOfFrame: number; note: string };
  contrast: string;
  forbidden: string[];
  perspective: string;
  approvedSamples: string;
}

export interface PalHex {
  core: string;
  body: string;
  rim: string;
  accent: string;
  shadow: string;
}

const hex = (s: string): string => `#${s.replace(/^#/, '').toUpperCase()}`;

/** Khối chữ bảng phong cách + bảng màu hướng tu, dùng chung cho mọi prompt. */
export function styleBlock(style: StyleSheet, pal: PalHex): string {
  return [
    `Style sheet "${style.name}": ${style.summary}`,
    `Color ramp (three tones, nothing else): core ${hex(pal.core)} (${style.ramp.core}); body ${hex(pal.body)} (${style.ramp.body}); rim ${hex(pal.rim)} (${style.ramp.rim}). Small accent ${hex(pal.accent)} only for tiny highlights.`,
    `Line weight: ${style.stroke.note}.`,
    `Contrast: ${style.contrast}.`,
    `Perspective: ${style.perspective}.`,
    `Forbidden: ${style.forbidden.join('; ')}.`,
    `${style.approvedSamples}`,
  ].join('\n');
}

/** Hình khối chủ đạo của thẻ, tả bằng tiếng Anh cho Codex. */
const SHAPE_WORDS: Record<string, string> = {
  arc: 'a sweeping curved crescent arc',
  spiral: 'a tight spiral swirl',
  spike: 'sharp radiating spikes',
  ring: 'an expanding ring',
  beam: 'a straight focused beam',
  cloud: 'a billowing cloud mass',
  burst: 'a radial burst',
  line: 'long thin speed lines',
};

export function shapeWords(card: VfxCard): string {
  return card.shapeLang.map((s) => SHAPE_WORDS[s] ?? s).join(' with ');
}

/**
 * Concept 4 khung trong MỘT ảnh lưới 2×2: dồn lực, va chạm, +150 ms, tan. Ảnh đính kèm đầu tiên là ảnh chụp game (nền, nhân vật và hình nộm
 * ở camera chéo): giữ nguyên phối cảnh, nhân vật và vị trí, chỉ vẽ thêm hiệu ứng chiêu.
 */
export function conceptPrompt(card: VfxCard, style: StyleSheet, pal: PalHex): string {
  const t = card.timing;
  return `Use case: stylized-concept (image-to-image on the attached game screenshot). Original VFX concept for a Chinese-fantasy cultivation action game. Do not copy any existing game's effects.
The FIRST attached image is a real screenshot of our game from its locked diagonal camera (tilt 52 degrees, FOV 32). Keep the background, the character, the training dummies and the camera perspective EXACTLY; only paint the skill effect over it.
Skill idea: ${card.idea}
Shape language: ${shapeWords(card)}. Ground footprint about ${card.footprint.lengthM} m long by ${card.footprint.widthM} m wide, up to ${card.footprint.heightM} m high (the character is 1.7 m tall).
Output ONE image: a 2x2 grid of the same screenshot framing, four time frames, left to right then top to bottom:
1) anticipation (about ${t.anticipationMs} ms before impact): energy gathering, small and tight; 2) impact (the instant of the hit): peak brightness and size; 3) +150 ms after impact: effect stretched and fraying; 4) +400 ms: fading, only embers and a faint trail left.
${styleBlock(style, pal)}
The effect must never hide the character's body or the target. No text, no labels, no UI, no watermark.`;
}

export type TextureKind = 'flipbook' | 'decal' | 'noise' | 'ramp' | 'slash';

/** Prompt cho từng loại texture. `grid` chỉ dùng cho flipbook/slash. */
export function texturePrompt(kind: TextureKind, card: VfxCard, style: StyleSheet, pal: PalHex, grid = '4x4'): string {
  const head = `Use case: texture-asset. Original game VFX texture for a Chinese-fantasy cultivation action game. Output ONE square PNG, no text, no watermark.`;
  const sb = styleBlock(style, pal);
  switch (kind) {
    case 'flipbook':
    case 'slash': {
      const n = Number(grid.split('x')[0]) || 4;
      const what =
        kind === 'slash'
          ? `a sword-qi slash: ${shapeWords(card)}, growing from a thin line to full length, then thinning and fraying away`
          : `the skill effect "${card.idea}"`;
      return `${head}
Subject: a flipbook sprite sheet of ${what}. Exactly ${grid} frames (${n} columns, ${n} rows), each frame a perfectly square cell of equal size, read left to right then top to bottom, frame 1 = start, last frame = nearly gone.
Rules: PURE BLACK background (#000000) behind every frame (the black is later converted to transparency), the effect centered in its cell with at least 10% empty margin on every side so nothing touches a cell border, no grid lines, no frame numbers, no ground, no shadow. The motion must flow smoothly between consecutive frames.
${sb}`;
    }
    case 'decal':
      return `${head}
Subject: a top-down decal as seen looking straight down from above, centered, round-ish, fading to pure black at all edges: ${card.idea} (ground scorch / crack / sigil mark left on the floor).
Rules: PURE BLACK background (#000000), nothing outside the central 85%, no perspective, no character, no ground texture.
${sb}`;
    case 'noise':
      return `${head}
Subject: a seamless tileable grayscale noise texture used to erode and dissolve effects: soft cloudy shapes with some sharper crack-like veins, full range from black to white.
Rules: grayscale only, perfectly tileable on all four edges, no vignette, no center focus, no color.`;
    case 'ramp':
      return `${head}
Subject: a horizontal gradient strip (aspect 8:1) that maps intensity to color: left = transparent black, then core ${hex(pal.core)}, then body ${hex(pal.body)}, then rim ${hex(pal.rim)} at the right end, with hard-ish steps between the three tones (cel-shaded look, 3 bands).
Rules: no noise, no texture, only the three-tone gradient.
${sb}`;
  }
}

/** Phần mềm chạy Codex đọc tiêu đề này để biết cần đính kèm những ảnh nào (xem codex.ts). */
export const DEFAULT_RUN_NOTE = 'Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./OUT in the current directory (shell copy). Do nothing else.';

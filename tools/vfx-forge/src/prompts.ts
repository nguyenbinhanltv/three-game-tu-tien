// Dựng prompt Codex cho quy trình Họa Pháp Lô: concept 4 khung đúng góc camera (image-to-image trên ảnh chụp game) và bộ texture
// (flipbook nền đen, decal nhìn từ trên, noise lát được, ramp 3 tông). Hàm thuần để kiểm; chạy Codex ở codex.ts.
import type { MonVfxCard, VfxCard } from '@dtl/shared';

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
Standard 2 (mandatory): the effect has ONE signature silhouette of its own${card.silhouette ? ` (${card.silhouette})` : ''} - NOT a starburst of rays, NOT a rune circle under the feet, NOT a plain crescent as the main shape; it has at least one material layer (smoke, hand-painted texture, cracks, particles or distortion); it is readable on BOTH a bright daylight stone floor and a dark night floor: dark core / ink body with a bright rim, never only additive glow; three beats are visible across the four frames (build-up, hit accent, dissipating aftermath); colors only from the ramp above, never red or orange.
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
export const DEFAULT_RUN_NOTE =
  'Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./OUT in the current directory (shell copy). Do nothing else.';

/** Cách tả hình vùng server bằng mét (kèm tỉ lệ so với nhân vật cao 1,7 m) để Codex vẽ ĐÚNG cỡ. */
export function zoneWords(z: MonVfxCard['zone']): string {
  const rel = (m: number) => `${(m / 1.7).toFixed(1)} character heights`;
  if (z.shape === 'circle')
    return `a perfect circle of radius ${z.r} m (diameter ${z.r * 2} m = about ${rel(z.r * 2)}), ${z.at === 'self' ? "centered on the boss's own body" : 'centered under the targeted player'}`;
  if (z.shape === 'cone')
    return `a circular sector (fan) of radius ${z.r} m (about ${rel(z.r)}) and half-angle ${z.w}° (total opening ${(z.w ?? 0) * 2}°), its apex at the boss's mouth, opening toward the player`;
  return `a rectangle ${z.r} m long (about ${rel(z.r)}) and ${z.w} m wide from the boss toward the player`;
}

/** Hue (độ) của màu hex 6 ký tự. */
function hueOf(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * Luật màu của vạch báo trong concept quái. Mặc định (accent đỏ) là đỏ-cam đặc. Thẻ có `palette.accent` KHÔNG ở vùng đỏ/cam (hue ngoài 345°–36°; hổ phách ~40° vẫn là màu hệ) là thẻ
 * "báo theo màu hệ" (A4: tinh anh hỏa ám tím, thổ hổ phách): vạch báo đọc rõ bằng màu accent đó, tuyệt đối không đỏ/cam.
 */
export function warnColorRule(p: { accent: string; rim: string; core: string; body: string }): string {
  const H = (x: string) => `#${x.toUpperCase()}`;
  const hue = hueOf(p.accent);
  const redOrange = hue >= 345 || hue <= 36;
  const warn = redOrange
    ? `the WARNING (frames 1 and 2) uses vivid RED-ORANGE only, accent ${H(p.accent)} with a hot rim ${H(p.rim)}; red is reserved for enemy warnings and must read clearly on a bright stone floor and on dark floors.`
    : `the WARNING (frames 1 and 2) uses the element's own warning color ${H(p.accent)} (solid, saturated, with a bright rim ${H(p.rim)}); it must NOT be red and NOT orange anywhere (no red fill, no orange outline, no red-orange flame edges), and it must read clearly on a bright stone floor and on dark floors.`;
  return `${warn} The HIT effect (frames 3 and 4) uses the element palette: core ${H(p.core)} (darkest, 15-25%), body ${H(p.body)} (50-60%), rim ${H(p.rim)} (10-20%); also no red or orange in the hit effect.`;
}

/**
 * Concept VFX của QUÁI/BOSS (V-P9): 4 khung trong một ảnh lưới 2×2 — vạch báo vừa hiện, vạch báo đã nạp ~60%, lúc nổ, +150 ms dư ba.
 * Vạch báo ĐỎ/CAM (accent đỏ, luật màu: đỏ/cam chỉ dành cho cảnh báo địch) hoặc màu hệ khi accent của thẻ không đỏ/cam (`warnColorRule`), đúng HÌNH và CỠ vùng server; vùng nổ/dư ba theo màu hệ.
 */
export function monConceptPrompt(card: MonVfxCard, style: StyleSheet): string {
  const t = card.timing;
  const p = card.palette;
  return `Use case: stylized-concept (image-to-image on the attached game screenshot). Original VFX concept for an enemy boss attack telegraph in a Chinese-fantasy cultivation action game. Do not copy any existing game's effects.
The FIRST attached image is a real screenshot of our game from its locked diagonal camera (tilt 52 degrees, FOV 32). Keep the background, the player character, the boss and the camera perspective EXACTLY as in the screenshot; only paint the attack effect on top.
Attack idea: ${card.idea}
DANGER ZONE GEOMETRY (must be exact, the zone is the real hitbox): ${zoneWords(card.zone)}. The painted warning must cover exactly this area on the ground (seen at the 52 degree tilt, a circle appears as an ellipse) and not one meter more or less.
Output ONE image: a 2x2 grid of the same screenshot framing, four time frames, left to right then top to bottom:
1) telegraph just appeared (${t.anticipationMs} ms before the hit): thin bright warning outline of the full zone with faint ground runes/cracks; 2) telegraph about 60% charged (about ${Math.round(t.anticipationMs * 0.4)} ms before the hit): the fill is advancing and the outline is brighter, readable progress so a player knows how long is left; 3) the instant of the hit (${t.impactMs} ms): the zone detonates in the boss's element, peak size and brightness, the warning outline flashes; 4) +150 ms after: the element effect lingers and fades, the warning gone.
COLOR RULES: ${warnColorRule(p)}
Readability: ${card.readability}
Stroke weight: not thinner than ${style.stroke.minWidthPctOfFrame}% of the frame. Perspective: ${style.perspective}.
The effect must never hide the player character's body. No text, no labels, no numbers, no UI, no watermark.`;
}

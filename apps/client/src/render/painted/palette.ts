import * as THREE from 'three/webgpu';
import { float, mix, smoothstep } from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * Họa Cảnh (`?style=painted`): bảng màu ít tông và bước tô phẳng.
 *
 * Ý tưởng dựa trên painted-valley (MIT, © 2026 Patch; xem assets/LICENSES.md), viết lại bằng TSL: mỗi vật có đúng hai màu,
 * một màu khi sáng và một màu khi tối, nối bằng một bước ngắn. Màu tối được PHA TAY (lạnh hơn, ít bão hòa hơn), không phải
 * màu sáng nhân cho tối. Một bảng dùng chung cho cỏ, đất, đồi xa, cây... để cả cảnh là một bức tranh. Các số màu dưới đây
 * là của riêng dự án (Vân Lam sáng sớm), không chép từ nguồn.
 *
 * Chưa gắn vào vật liệu nào (P1); các bước sau (P2+) đọc bảng này sau cờ `FLAGS.style === 'painted'`.
 */

/** Một cặp màu: [sáng, tối], sRGB hex (giống mọi bảng màu khác của repo; chuyển sang tuyến tính ở `paintedColor`). */
export type PaintPair = readonly [lit: number, shade: number];

export const PAINTED = {
  /** Cỏ chính và cỏ sáng của đồng/đồi (một mảng xanh chậm). */
  meadow: [0x6b9a3c, 0x2f5a44],
  meadowLight: [0x9bbf4e, 0x4a7a4c],
  /** Đất đường mòn, bờ đất. */
  earth: [0xb98f5c, 0x6b5560],
  /** Đá, vách núi gần. */
  rock: [0xa9a597, 0x575a70],
  /** Tán cây lá rộng và lá kim. */
  foliage: [0x4f8a3a, 0x1f4a47],
  conifer: [0x2f6b45, 0x16384a],
  /** Mái ngói, tường vôi, gỗ (nhà ngoài tông). */
  roof: [0x9c4a3a, 0x4a2f48],
  wall: [0xe8dcc0, 0x8f8aa8],
  wood: [0x8a5a34, 0x3f2c3c],
  /** Núi xa: tông sáng/tối của dải sơn (P3 trộn thêm sương theo giờ). */
  farRock: [0x8fa0b8, 0x4c5a7e],
} as const satisfies Record<string, PaintPair>;

export type PaintedKey = keyof typeof PAINTED;

/** Màu tuyến tính của một nửa cặp (0 = sáng, 1 = tối). */
export function paintedColor(key: PaintedKey, which: 0 | 1, out = new THREE.Color()): THREE.Color {
  return out.setHex(PAINTED[key][which], THREE.SRGBColorSpace);
}

/** Điểm giữa và nửa độ rộng mặc định của bước sáng/tối: ngắn nhưng không răng cưa. */
export const CEL_EDGE = 0.5;
export const CEL_SOFT = 0.035;

/** Hệ số 0..1 của bước tô: 0 = hẳn trong bóng, 1 = hẳn trong sáng. Thuần số, dùng được ở CPU (test) và là nền của `cel2`. */
export function celFactor(t: number, edge = CEL_EDGE, soft = CEL_SOFT): number {
  const x = soft <= 0 ? (t < edge ? 0 : 1) : Math.min(1, Math.max(0, (t - (edge - soft)) / (2 * soft)));
  return x * x * (3 - 2 * x);
}

/**
 * Tô hai tông: `lit` khi `t` (thường là N·L dịch về 0..1, hoặc mặt nạ bóng) trên `edge`, `shade` khi dưới, nối bằng một bước
 * ngắn bề rộng `soft` mỗi bên. Cùng công thức với `celFactor`.
 */
export function cel2(lit: Node, shade: Node, t: Node, edge: Node | number = CEL_EDGE, soft: Node | number = CEL_SOFT): Node {
  const e = typeof edge === 'number' ? float(edge) : float(edge);
  const w = typeof soft === 'number' ? float(soft) : float(soft);
  return mix(shade, lit, smoothstep(e.sub(w), e.add(w), t));
}

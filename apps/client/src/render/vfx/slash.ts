import * as THREE from 'three/webgpu';
import { exp, float, min, mix, smoothstep, step, time, uv, vec2, vec3 } from 'three/tsl';
import { vnoise, type FxUniforms } from './common';

/**
 * Kiếm khí (M4-1): một lưới quạt hình trăng lưỡi liềm bám theo quỹ đạo nhát chém, tô bằng TSL.
 *
 * Lưới: dải cung nằm ngang (mặt XZ), mặt lồi hướng +Z, đỉnh cung ở gốc tọa độ, bán kính 1. Dày giữa
 * thon hai đầu như nét bút (art bible mục 7). UV: `u` chạy dọc cung từ mũi này sang mũi kia (chiều
 * quét), `v` từ mép trong (0) ra mép ngoài (1). Hiệu ứng xoay/đặt lưới; biến thể chém dọc chỉ là
 * cùng lưới dựng đứng.
 *
 * Tham số theo lưới (`fxA`): x = đầu quét 0..1 (phần cung đã hiện), y = ngưỡng ăn mòn 0..1,1
 * (0: còn nguyên, ≥1,05: tan hết), z = seed để mỗi nhát một vân nhiễu.
 *
 * Viền cắt sáng gắt theo EdgeFlux (MIT, xem assets/LICENSES.md).
 *
 * Hai lớp, mỗi lớp một material dùng chung:
 * - `slash` (cộng sáng, bloom): thân mờ, viền ngoài sáng, sọc nhiễu cuộn theo chiều quét, mép ăn mòn
 *   bừng sáng. Đuôi tối hơn đầu.
 * - `ink` (hòa trộn thường, có sương): lớp mực nền nằm dưới, trễ hơn một chút, mép khô kiểu bút lông.
 *   Cho nhát chém có hình trên nền sáng (đá sân, sương sớm), nơi cộng sáng bị nhạt.
 */

/** Góc mở của cung (rad). */
const SLASH_ARC = (150 * Math.PI) / 180;
/** Độ dày lớn nhất của dải so với bán kính. */
const SLASH_WIDTH = 0.42;
/** Màu mực nền: lam ngọc rất tối (bóng ngả ngọc lam, không đen tuyền). */
export const SLASH_INK = 0x14272b;

/** Dựng lưới cung. Gọi một lần, dùng chung cho mọi nhát chém. */
export function slashGeometry(arc = SLASH_ARC, segs = 32, width = SLASH_WIDTH): THREE.BufferGeometry {
  const rows = 3;
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const th = -arc / 2 + arc * u;
    // Mặt cắt nét bút: dày giữa, thon về hai mũi.
    const prof = Math.pow(Math.sin(Math.PI * u), 0.7);
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      const rad = 1 - width * prof * (1 - v);
      pos.push(rad * Math.sin(th), 0, rad * Math.cos(th) - 1);
      uvs.push(u, v);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = a + rows;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const SLASH_GEO = slashGeometry();

interface SlashPhase {
  /** Đầu quét 0..1. */
  head: number;
  /** Ngưỡng ăn mòn (0 còn nguyên, 1,1 tan hết). */
  erode: number;
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Nhịp một nhát chém theo tiến độ k: quét hết cung trong `sweep` đầu, ăn mòn từ `erodeFrom` tới
 * hết. Lớp mực dùng cùng hàm với k trễ hơn.
 */
export function slashPhase(k: number, sweep = 0.35, erodeFrom = 0.5): SlashPhase {
  return {
    head: Math.min(1, Math.max(0, k / sweep)) * 1.06,
    erode: sstep(erodeFrom, 1, k) * 1.1,
  };
}

/** Node màu/độ trong cho lớp sáng (`ink = false`) hoặc lớp mực (`ink = true`). */
export function slashNodes(U: FxUniforms, ink: boolean) {
  const st = uv();
  const u = st.x;
  const v = st.y;
  const head = U.a.x;
  const erode = U.a.y;
  const seed = U.a.z;
  const one = float(1);

  // Quét theo độ dài cung: phần sau đầu quét hiện ra, mép đầu mềm.
  const reveal = one.sub(smoothstep(head.sub(0.06), head, u));
  // Đuôi (xa đầu quét) mờ dần.
  const trail = smoothstep(head.sub(0.9), head, u);
  // Hai mũi nhọn tắt mềm.
  const ends = smoothstep(0, 0.05, u).mul(one.sub(smoothstep(0.95, 1, u)));

  // Ăn mòn: đuôi và mép trong tan trước, theo vân nhiễu cuộn.
  const flow = vnoise(vec2(u.mul(7).sub(time.mul(3)).add(seed.mul(17)), v.mul(2.5)));
  const e = flow.mul(0.6).add(one.sub(trail).mul(0.3)).add(one.sub(v).mul(0.15));
  const alive = smoothstep(erode.sub(0.08), erode, e);

  if (ink) {
    // Mép khô bút lông: sọc dọc nét, đứt nhiều hơn ở đuôi.
    const bristle = vnoise(vec2(u.mul(4).add(seed.mul(11)), v.mul(22)));
    const dry = smoothstep(0.14, 0.38, bristle.add(trail.mul(0.25)));
    const edge = smoothstep(0, 0.22, v).mul(one.sub(smoothstep(0.86, 1, v)));
    return {
      color: U.color,
      opacity: U.opacity.mul(reveal).mul(alive).mul(ends).mul(edge).mul(dry).mul(trail.mul(0.65).add(0.35)),
    };
  }

  // Viền ngoài sáng, thân mờ dần vào trong, sọc nhiễu chạy theo chiều quét.
  const rim = smoothstep(0.55, 0.9, v).mul(one.sub(smoothstep(0.95, 1, v)));
  const body = smoothstep(0, 0.45, v);
  const streak = vnoise(vec2(u.mul(3).sub(time.mul(5)).add(seed.mul(5)), v.mul(14)));
  // Mép đang ăn mòn bừng sáng (chỉ khi đã bắt đầu tan).
  const burn = alive.mul(one.sub(smoothstep(erode, erode.add(0.1), e))).mul(step(0.02, erode));
  const hot = one.sub(U.k).pow(2).mul(0.25).add(1);
  // Viền cắt (kỹ thuật EdgeFlux, MIT): sáng gắt sát mép ngoài, tắt theo hàm mũ, chỉ ở phần đầu quét (đuôi không có), mũi nhọn tắt mềm.
  const cutEdge = exp(one.sub(v).negate().div(0.07))
    .mul(smoothstep(0.15, 0.9, trail))
    .mul(ends);
  const lum = float(0.6).add(rim.mul(1.2)).add(streak.mul(0.35)).add(burn.mul(1.2)).add(cutEdge.mul(1.1)).mul(trail.mul(0.6).add(0.4));
  const tint = mix(U.color, vec3(1, 1, 1), min(cutEdge.mul(0.7), 0.7));
  return {
    color: min(tint.mul(lum).mul(hot), U.maxHdr),
    opacity: U.opacity.mul(reveal).mul(alive).mul(ends).mul(body).mul(trail.mul(0.7).add(0.3)).mul(streak.mul(0.3).add(0.7)),
  };
}

import * as THREE from 'three/webgpu';
import { float, min, uniform, vec3 } from 'three/tsl';
import { markBloom } from '../post';
import type { FxUniforms } from '../vfx/common';
import { sigilNodes } from '../vfx/sigil';
import { slashNodes } from '../vfx/slash';

/**
 * Material hiệu ứng (VFX) dùng chung, viết bằng TSL.
 *
 * Mỗi kiểu hòa trộn chỉ có MỘT material cho cả game; màu, độ trong và tiến độ là uniform theo
 * từng lưới (nhóm `object`, cập nhật bằng `onObjectUpdate` giống `modelWorldMatrix`), đọc từ các
 * trường của `FxMesh`. Lưới cũng được giữ trong pool, nên phát hiệu ứng không cấp phát material
 * hay mesh mới, không biên dịch lại shader.
 *
 * Giới hạn HDR (art bible mục 5.2, bài học R2): màu ra = màu × `boost` × (1 + lõi nóng lúc đầu),
 * chặn ở `FX_MAX_HDR` trước khi nhân độ trong. Một lớp cộng sáng không vượt 2,4; bloom nhận thêm
 * hệ số `markBloom` (≤ BLOOM.maxHdr) nên vệt sáng mềm, không lóa trắng.
 */

/** Đỉnh màu tuyến tính của một lớp hiệu ứng (trước khi nhân opacity). */
export const FX_MAX_HDR = 2.4;

/**
 * Kiểu material:
 * - `glow`: cộng sáng, có bloom (phi kiếm, kiếm khí, nổ, sét, cột sáng, viền vùng báo trước).
 * - `flat`: cộng sáng, không bloom (nền/tô tiến độ của vùng báo trước: phải đọc rõ, không nhòe).
 * - `solid`: hòa trộn thường, bloom nhẹ (gai băng).
 * - `shade`: hòa trộn thường, có sương, không bloom (mây kiếp tối).
 * - `slash`: lớp sáng của kiếm khí, cộng sáng có bloom (render/vfx/slash.ts).
 * - `ink`: lớp mực nền của kiếm khí, hòa trộn thường, có sương (render/vfx/slash.ts).
 * - `sigil`: pháp trận/vùng báo trước vẽ trong fragment, hòa trộn thường để có nền mực tối, bloom
 *   rất nhẹ (render/vfx/sigil.ts).
 */
export type FxKind = 'glow' | 'flat' | 'solid' | 'shade' | 'slash' | 'ink' | 'sigil';

const SPEC: Record<FxKind, { blending: THREE.Blending; boost: number; bloom: number; fog: boolean }> = {
  glow: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.5, fog: false },
  flat: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0, fog: false },
  solid: { blending: THREE.NormalBlending, boost: 1.15, bloom: 0.5, fog: false },
  shade: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0, fog: true },
  slash: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.5, fog: false },
  ink: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0, fog: true },
  sigil: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.15, fog: false },
};

/** Lưới hiệu ứng: dữ liệu theo lưới thay cho material riêng. */
export class FxMesh extends THREE.Mesh {
  /** Màu (sRGB hex như cũ; lưu dạng tuyến tính). */
  readonly fxColor = new THREE.Color();
  fxOpacity = 1;
  /** Tiến độ 0..1 của hiệu ứng; đầu hiệu ứng lõi sáng hơn một chút rồi nguội dần. */
  fxK = 1;
  fxKind: FxKind = 'glow';
  /** Tham số riêng theo kiểu (kiếm khí, pháp trận): xem render/vfx/*.ts. */
  readonly fxA = new THREE.Vector4();
  readonly fxB = new THREE.Vector4();
}

const asFx = (o: THREE.Object3D | null) => (o instanceof FxMesh ? o : null);
const uColor = uniform(new THREE.Color()).onObjectUpdate(({ object }) => asFx(object)?.fxColor);
const uOpacity = uniform(1).onObjectUpdate(({ object }) => asFx(object)?.fxOpacity);
const uK = uniform(1).onObjectUpdate(({ object }) => asFx(object)?.fxK);
const uA = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => asFx(object)?.fxA);
const uB = uniform(new THREE.Vector4()).onObjectUpdate(({ object }) => asFx(object)?.fxB);
const U: FxUniforms = { color: vec3(uColor), opacity: uOpacity, k: uK, a: uA, b: uB, maxHdr: FX_MAX_HDR };

const EMPTY_GEO = new THREE.BufferGeometry();
const materials = new Map<FxKind, THREE.MeshBasicNodeMaterial>();

/** Material dùng chung của một kiểu (tạo một lần, không bao giờ dispose khi phát). */
export function fxMaterial(kind: FxKind): THREE.MeshBasicNodeMaterial {
  let m = materials.get(kind);
  if (m) return m;
  const s = SPEC[kind];
  m = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: s.blending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: s.fog,
  });
  // Trong suốt + DoubleSide mặc định vẽ 2 lượt (mặt sau rồi mặt trước). Cộng sáng không phụ thuộc
  // thứ tự, còn `solid`/`shade` là một màu phẳng không ghi depth, nên một lượt là đủ: nửa số draw call.
  m.forceSinglePass = true;
  const custom = kind === 'slash' || kind === 'ink' ? slashNodes(U, kind === 'ink') : kind === 'sigil' ? sigilNodes(U) : null;
  if (custom) {
    m.colorNode = custom.color;
    m.opacityNode = custom.opacity;
  } else {
    const hot = float(1).sub(uK).pow(2).mul(0.25).add(1);
    m.colorNode = min(vec3(uColor).mul(s.boost).mul(hot), FX_MAX_HDR);
    m.opacityNode = uOpacity;
  }
  m.name = `fx-${kind}`;
  if (s.bloom > 0) markBloom(m, s.bloom);
  materials.set(kind, m);
  return m;
}

/** Pool lưới hiệu ứng. Lưới trả về pool giữ material dùng chung; chỉ geometry được gán lại. */
export class FxPool {
  private free: FxMesh[] = [];
  /** Số lưới đã tạo (để kiểm: đứng yên sau khi pool đã ấm). */
  created = 0;

  constructor(prewarm = 0) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.make());
  }

  private make(): FxMesh {
    this.created++;
    // Truyền sẵn geometry/material: `new Mesh()` trống sẽ tự tạo MeshBasicMaterial + BufferGeometry.
    const m = new FxMesh(EMPTY_GEO, fxMaterial('glow'));
    m.frustumCulled = false;
    return m;
  }

  acquire(geo: THREE.BufferGeometry, kind: FxKind, color: number, opacity: number): FxMesh {
    const m = this.free.pop() ?? this.make();
    m.geometry = geo;
    if (m.fxKind !== kind) {
      m.material = fxMaterial(kind);
      m.fxKind = kind;
    }
    m.fxColor.setHex(color);
    m.fxOpacity = opacity;
    m.fxK = 1;
    m.fxA.set(0, 0, 0, 0);
    m.fxB.set(0, 0, 0, 0);
    m.renderOrder = 0;
    m.visible = true;
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.scale.set(1, 1, 1);
    return m;
  }

  release(m: FxMesh): void {
    m.removeFromParent();
    this.free.push(m);
  }

  get freeCount(): number {
    return this.free.length;
  }
}

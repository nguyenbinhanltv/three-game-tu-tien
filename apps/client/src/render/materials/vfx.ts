import * as THREE from 'three/webgpu';
import { abs, attribute, dot, float, min, normalize, normalView, positionView, pow, sin, uniform, uv, vec3 } from 'three/tsl';
import { markBloom, markVfxMask } from '../post';
import type { FxUniforms } from '../vfx/common';
import { inkNodes } from '../vfx/ink';
import { boltNodes, vortexNodes, windNodes } from '../vfx/lightning';
import { flipNodes } from '../vfx/flipbook';
import { mapDecalNodes, mapFlipNodes } from '../vfx/forgeTex';
import { beamNodes } from '../vfx/loot';
import { sigilNodes } from '../vfx/sigil';
import { slashNodes } from '../vfx/slash';
import { artNodes, burstNodes, cardNodes, crystalNodes, decalNodes, spriteNodesFor, toonNodes } from '../vfx/stylized';
import { trailNodes } from '../vfx/trail';
import { FLAGS } from '../../base/flags';

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
 * - `bolt`: tia sét thiên lôi, dải quay về camera, cộng sáng có bloom (render/vfx/lightning.ts).
 * - `vortex`: mây kiếp xoáy, hòa trộn thường, có sương, không bloom (render/vfx/lightning.ts).
 * - `trail`: dải vệt sáng phi kiếm khi ngự kiếm, cộng sáng có bloom (render/vfx/trail.ts).
 * - `beam`: cột sáng đồ rơi theo bậc phẩm chất, cộng sáng có bloom (render/vfx/loot.ts).
 * - `dome`: khiên trong suốt kiểu fresnel: rìa sáng, giữa gần như trong suốt (thấy rõ người bên trong), vân phù văn rất mờ; cộng sáng, bloom nhẹ.
 * - `inkpool`: vết mực loang trên đất khi quái chết/đòn nặng, hòa trộn thường, có sương (render/vfx/ink.ts).
 * - `toon`: hình vẽ tay ba tầng màu (lõi/thân/viền) mép rách, hòa trộn thường nên đọc được trên nền sáng; cũng dùng cho lớp bóng sẫm (render/vfx/stylized.ts, VFX-V0).
 * - `crystal`: gai/mũi tinh thể phẳng mặt, ba tông theo hướng sáng, viền fresnel, gân vàng (stylized.ts).
 * - `burst`: chớp va chạm + vạch tốc độ tỏa tròn, quay mặt về camera, cộng sáng có bloom (stylized.ts).
 * - `wind`: chùm đường gió cuộn quanh một trục, vệt mảnh chạy dọc đường rồi tan, cộng sáng, bloom nhẹ, không gộp (render/vfx/lightning.ts).
 * - `decal`: tấm trên mặt đất: vết nứt phát sáng, vòng triện văn, vết cháy, khói toon (stylized.ts).
 */
export type FxKind =
  | 'glow'
  | 'flat'
  | 'solid'
  | 'shade'
  | 'slash'
  | 'ink'
  | 'sigil'
  /** Như `sigil` nhưng không thử độ sâu (vạch báo của boss luôn thấy; V-P9). */
  | 'sigilTop'
  | 'bolt'
  | 'vortex'
  | 'trail'
  | 'beam'
  | 'dome'
  | 'inkpool'
  | 'toon'
  | 'crystal'
  | 'burst'
  | 'decal'
  /** Như `decal` nhưng KHÔNG thử độ sâu: luôn vẽ đè lên mọi vật (vạch báo của boss không bị thân boss/vật che; V-P9). */
  | 'decalTop'
  | 'card'
  | 'art'
  /** Sprite vẽ tay, MỘT kind cho mỗi nhóm atlas hướng tu (`render/vfx/art.ts` `SPRITE_GROUPS`): `sprite` = hồn, `sprite_loi`, `sprite_kiem`, `sprite_hp`. */
  | 'sprite'
  | 'sprite_loi'
  | 'sprite_kiem'
  | 'sprite_hp'
  | 'sprite_dao'
  | 'sprite_hai'
  | 'sprite_tinh'
  | 'sprite_lam'
  | 'wind'
  | 'flip'
  /** Decal từ trên bằng texture Codex (`forgeTex.ts`; vân nứt vạch báo, băng nứt). */
  | 'mapDecal'
  /** Như `mapDecal` nhưng không thử độ sâu (vạch báo của boss). */
  | 'mapDecalTop'
  /** Flipbook texture Codex (`ice_flip`), quay mặt về camera. */
  | 'mapFlip';

const SPEC: Record<FxKind, { blending: THREE.Blending; boost: number; bloom: number; fog: boolean }> = {
  glow: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.5, fog: false },
  flat: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0, fog: false },
  solid: { blending: THREE.NormalBlending, boost: 1.15, bloom: 0.5, fog: false },
  shade: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0, fog: true },
  slash: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.5, fog: false },
  ink: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0, fog: true },
  sigil: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.15, fog: false },
  sigilTop: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.15, fog: false },
  bolt: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.6, fog: false },
  vortex: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0, fog: true },
  trail: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.45, fog: false },
  beam: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.5, fog: false },
  dome: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.25, fog: false },
  inkpool: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0, fog: true },
  toon: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.3, fog: false },
  crystal: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.35, fog: false },
  burst: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.5, fog: false },
  decal: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: true },
  decalTop: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: true },
  card: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.25, fog: false },
  art: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.3, fog: false },
  sprite: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_loi: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_kiem: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_hp: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_dao: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_hai: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_tinh: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  sprite_lam: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.2, fog: false },
  wind: { blending: THREE.AdditiveBlending, boost: 1.0, bloom: 0.2, fog: false },
  flip: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.25, fog: false },
  mapDecal: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.1, fog: false },
  mapDecalTop: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.1, fog: false },
  mapFlip: { blending: THREE.NormalBlending, boost: 1.0, bloom: 0.15, fog: false },
};

const BUILDERS: Partial<Record<FxKind, (u: FxUniforms) => { color: unknown; opacity: unknown }>> = {
  slash: (u) => slashNodes(u, false),
  ink: (u) => slashNodes(u, true),
  sigil: sigilNodes,
  sigilTop: sigilNodes,
  bolt: boltNodes,
  vortex: vortexNodes,
  trail: trailNodes,
  beam: beamNodes,
  inkpool: inkNodes,
  toon: toonNodes,
  crystal: crystalNodes,
  burst: burstNodes,
  decal: decalNodes,
  decalTop: decalNodes,
  card: cardNodes,
  art: artNodes,
  sprite: spriteNodesFor('hon'),
  sprite_loi: spriteNodesFor('loi'),
  sprite_kiem: spriteNodesFor('kiem'),
  sprite_hp: spriteNodesFor('hp'),
  sprite_dao: spriteNodesFor('dao'),
  sprite_hai: spriteNodesFor('hai'),
  sprite_tinh: spriteNodesFor('tinh'),
  sprite_lam: spriteNodesFor('lam'),
  wind: windNodes,
  flip: flipNodes,
  mapDecal: mapDecalNodes,
  mapDecalTop: mapDecalNodes,
  mapFlip: mapFlipNodes,
  dome: (u) => {
    // Fresnel: 1 ở rìa (nhìn lướt), ~0 ở giữa (nhìn thẳng). Vân phù văn: dải ngang mờ chạy theo độ cao.
    const fres = pow(float(1).sub(abs(dot(normalize(normalView), normalize(positionView.negate())))), 2.6);
    const runes = sin(uv().y.mul(28)).mul(0.5).add(0.5).mul(0.06);
    const a = min(fres.mul(2.2).add(runes).add(0.012), 1);
    return { color: min(u.color.mul(1.0), u.maxHdr), opacity: u.opacity.mul(a) };
  },
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
  if (kind === 'sigilTop') m.depthTest = false;
  const custom = BUILDERS[kind]?.(U);
  if (custom) {
    m.colorNode = custom.color as THREE.Node;
    m.opacityNode = custom.opacity as THREE.Node;
  } else {
    const hot = float(1).sub(uK).pow(2).mul(0.25).add(1);
    m.colorNode = min(vec3(uColor).mul(s.boost).mul(hot), FX_MAX_HDR);
    m.opacityNode = uOpacity;
  }
  m.name = `fx-${kind}`;
  if (s.bloom > 0) markBloom(m, s.bloom);
  else markVfxMask(m);
  materials.set(kind, m);
  return m;
}

/**
 * Các kiểu gộp thành `InstancedMesh` (K-6, T4): mọi lưới cùng (kiểu, hình, renderOrder) vẽ trong một draw call.
 * `FxMesh` của các kiểu này chỉ là "tay cầm" (vị trí, màu, độ trong...), không nằm trong cảnh; `FxBatcher`
 * (fxBatch.ts) ghi tay cầm vào thuộc tính theo instance mỗi khung.
 */
/** `?batch=0` tắt gộp draw call để so ảnh/số đo trước-sau (mỗi lưới một draw call như cũ). */
export const BATCHING = FLAGS.batching;

/**
 * `sigil` KHÔNG gộp (S2-C): nhiều pháp trận cùng lúc (lôi võng độ kiếp có 21 vòng cùng vòng nhắm, hay nhiều vùng báo của boss) khi gộp chỉ vẽ ra
 * MỘT cái (dữ liệu instance ghi đúng, vẽ thiếu; `?batch=0` vẽ đủ). Nguyên nhân chưa rõ. Giá: thêm chừng 23 draw call trong 1 giây mỗi đợt lôi võng.
 */
export const BATCH_KINDS: ReadonlySet<FxKind> = new Set<FxKind>([
  'glow',
  'flat',
  'solid',
  'slash',
  'ink',
  'dome',
  'inkpool',
  'toon',
  'crystal',
  'burst',
  'decal',
  'decalTop',
  'card',
  'art',
  'flip',
  'mapDecal',
  'mapDecalTop',
  'mapFlip',
]);

/** Tên thuộc tính instance: màu + độ trong, `fxA`, `fxB`, (`fxK`, 0, 0, 0). */
export const BATCH_ATTR = { c: 'aFxC', a: 'aFxA', b: 'aFxB', k: 'aFxK' } as const;

const batchNodes = (() => {
  const c = attribute(BATCH_ATTR.c, 'vec4');
  const a = attribute(BATCH_ATTR.a, 'vec4');
  const b = attribute(BATCH_ATTR.b, 'vec4');
  const k = attribute(BATCH_ATTR.k, 'vec4');
  const U: FxUniforms = { color: c.xyz, opacity: c.w, k: k.x, a, b, maxHdr: FX_MAX_HDR };
  return U;
})();

const batchMaterials = new Map<FxKind, THREE.MeshBasicNodeMaterial>();

/** Bản instanced của material một kiểu gộp được: cùng shader, đọc uniform từ thuộc tính theo instance. */
export function fxBatchMaterial(kind: FxKind): THREE.MeshBasicNodeMaterial {
  let m = batchMaterials.get(kind);
  if (m) return m;
  const s = SPEC[kind];
  m = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: s.blending, depthWrite: false, side: THREE.DoubleSide, fog: s.fog });
  m.forceSinglePass = true;
  if (kind === 'decalTop' || kind === 'mapDecalTop') m.depthTest = false;
  const custom = BUILDERS[kind]?.(batchNodes);
  if (custom) {
    m.colorNode = custom.color as THREE.Node;
    m.opacityNode = custom.opacity as THREE.Node;
  } else {
    const hot = float(1).sub(batchNodes.k).pow(2).mul(0.25).add(1);
    m.colorNode = min(batchNodes.color.mul(s.boost).mul(hot), FX_MAX_HDR);
    m.opacityNode = batchNodes.opacity;
  }
  m.name = `fx-${kind}-i`;
  if (s.bloom > 0) markBloom(m, s.bloom);
  else markVfxMask(m);
  batchMaterials.set(kind, m);
  return m;
}

/** Pool lưới hiệu ứng. Lưới trả về pool giữ material dùng chung; chỉ geometry được gán lại. */
export class FxPool {
  private free: FxMesh[] = [];
  /** Tay cầm đang sống của các kiểu gộp (`BATCH_KINDS`): `FxBatcher` đọc tập này mỗi khung. */
  readonly batched = new Set<FxMesh>();
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
      // Kiểu gộp: tay cầm không vẽ riêng nên không cần material (tránh dựng shader thừa).
      if (!BATCHING || !BATCH_KINDS.has(kind)) m.material = fxMaterial(kind);
      m.fxKind = kind;
    }
    if (BATCHING && BATCH_KINDS.has(kind)) this.batched.add(m);
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
    this.batched.delete(m);
    this.free.push(m);
  }

  get freeCount(): number {
    return this.free.length;
  }

  /** Số lưới đang dùng (mỗi lưới một draw call; ngân sách hiệu ứng người khác đọc số này, xem fxBudget.ts). */
  get live(): number {
    return this.created - this.free.length;
  }
}

import * as THREE from 'three/webgpu';
import {
  BRDF_Lambert,
  diffuseColor,
  float,
  luminance,
  mix,
  normalLocal,
  normalView,
  positionLocal,
  positionView,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import type { LightingModelDirectInput, Node, NodeBuilder } from 'three/webgpu';

/**
 * Material toon dùng chung cho thế giới low-poly (địa hình, kiến trúc, nhân vật, quái)
 * và sau này cho model nhập từ pipeline asset.
 *
 * - 3 bậc sáng cho ánh sáng trực tiếp: tối (chỉ còn ánh sáng môi trường), trung, sáng.
 * - Phần nhận ánh sáng môi trường dùng albedo giảm bão hòa và nhuộm lam xám, nên vùng bóng ngả lam
 *   thay vì đen hay đậm màu gốc.
 * - Càng xa camera càng giảm bão hòa và ngả lam xám (kiểu núi xa thủy mặc), rồi mới hòa vào fog.
 * - Viền mực tùy chọn bằng inverted hull: `addOutline(mesh)`; tốn thêm 1 draw call mỗi mesh nên
 *   chỉ dùng cho vật ở gần (LOD0).
 *
 * Mọi tham số là uniform dùng chung cho cả cảnh, chỉnh lúc chạy được (panel debug sau này).
 */
export const toonParams = {
  /** Ngưỡng dot(N, L) chuyển từ tối sang trung và từ trung sang sáng. */
  bandLow: uniform(0.02),
  bandHigh: uniform(0.42),
  /** Mức sáng của bậc trung (bậc tối = 0, bậc sáng = 1). */
  bandMid: uniform(0.5),
  /** Màu lam xám mà phần bóng (chỉ có ánh sáng môi trường) ngả về. */
  shadowTint: uniform(new THREE.Color(0.86, 0.94, 1.12)),
  /** Mức giảm bão hòa albedo ở phần ánh sáng môi trường (0 = giữ màu gốc). */
  shadowDesat: uniform(0.45),
  /** Khoảng cách (m) bắt đầu và đạt tối đa việc giảm bão hòa. */
  desatNear: uniform(40),
  desatFar: uniform(700),
  /** Lượng giảm bão hòa tối đa ở xa (0..1). */
  desatAmount: uniform(0.75),
  /** Màu nhuộm phần đã giảm bão hòa (nhân với độ sáng), lam xám của núi xa. */
  distTint: uniform(new THREE.Color(0.9, 0.97, 1.08)),
};

/** Mô hình chiếu sáng 3 bậc. Bóng đổ (nếu bật) đã nằm sẵn trong `lightColor`. */
class InkToonLighting extends THREE.LightingModel {
  direct({ lightDirection, lightColor, reflectedLight }: LightingModelDirectInput): void {
    const ndl = normalView.dot(lightDirection as Node);
    // fwidth giữ mép bậc mịn, không răng cưa.
    const fw = ndl.fwidth().mul(0.75).add(0.0001);
    const toMid = smoothstep(toonParams.bandLow.sub(fw), toonParams.bandLow.add(fw), ndl);
    const toHigh = smoothstep(toonParams.bandHigh.sub(fw), toonParams.bandHigh.add(fw), ndl);
    const band = toMid.mul(toonParams.bandMid).add(toHigh.mul(float(1).sub(toonParams.bandMid)));
    const irradiance = vec3(lightColor as Node).mul(band);
    (reflectedLight.directDiffuse as ReturnType<typeof vec3>).addAssign(irradiance.mul(BRDF_Lambert({ diffuseColor: diffuseColor.rgb })));
  }

  indirect(builder: NodeBuilder): void {
    const ctx = (builder as unknown as { context: unknown }).context as { ambientOcclusion: Node; irradiance: Node; reflectedLight: Record<string, ReturnType<typeof vec3>> };
    const indirect = ctx.reflectedLight.indirectDiffuse;
    const albedo = diffuseColor.rgb;
    const shadowAlbedo = mix(albedo, vec3(luminance(albedo)).mul(toonParams.shadowTint), toonParams.shadowDesat);
    indirect.addAssign(vec3(ctx.irradiance).mul(BRDF_Lambert({ diffuseColor: shadowAlbedo })));
    indirect.mulAssign(ctx.ambientOcclusion);
  }
}

/** Giảm bão hòa theo độ sâu view, trước khi fog được áp. */
function depthDesaturate(color: Node): Node {
  const c = vec4(color);
  const depth = positionView.z.negate();
  const k = smoothstep(toonParams.desatNear, toonParams.desatFar, depth).mul(toonParams.desatAmount);
  const far = vec3(luminance(c.rgb)).mul(toonParams.distTint);
  return vec4(mix(c.rgb, far, k), c.a);
}

export class ToonMaterial extends THREE.MeshToonNodeMaterial {
  readonly isToonMaterial = true;

  constructor(params?: THREE.MeshToonNodeMaterialParameters) {
    super(params);
  }

  override setupLightingModel(): THREE.LightingModel {
    return new InkToonLighting();
  }

  override setupOutput(builder: NodeBuilder, outputNode: Node): Node {
    return super.setupOutput(builder, depthDesaturate(outputNode));
  }
}

/** Tạo material toon. Dùng chung một instance cho nhiều mesh, đừng tạo mới cho từng mesh. */
export function createToonMaterial(params: THREE.MeshToonNodeMaterialParameters = {}): ToonMaterial {
  return new ToonMaterial(params);
}

// ---------- viền mực (inverted hull) ----------

/** Màu mực theo art bible (#2B2B2E). */
export const outlineParams = {
  color: uniform(new THREE.Color(0x2b2b2e)),
};

const outlineCache = new Map<number, THREE.MeshBasicNodeMaterial>();

/** Material viền dùng chung theo độ dày (m). Đẩy đỉnh theo pháp tuyến, chỉ vẽ mặt sau. */
export function getOutlineMaterial(width = 0.025): THREE.MeshBasicNodeMaterial {
  let m = outlineCache.get(width);
  if (!m) {
    m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    m.positionNode = positionLocal.add(normalLocal.mul(width));
    m.colorNode = outlineParams.color;
    outlineCache.set(width, m);
  }
  return m;
}

/**
 * Thêm viền mực cho mesh (con dùng chung geometry). Geometry tô phẳng (đỉnh tách theo mặt)
 * có thể hở viền ở cạnh sắc; mesh có xương/morph cần material viền riêng, chưa hỗ trợ.
 */
export function addOutline(mesh: THREE.Mesh, width = 0.025): THREE.Mesh {
  const hull = new THREE.Mesh(mesh.geometry, getOutlineMaterial(width));
  hull.name = 'outline';
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}

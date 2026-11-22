import * as THREE from 'three/webgpu';
import { attribute, clamp, dot, float, length, materialColor, max, min, mix, pow, smoothstep, step, uniform, vec3, vec4 } from 'three/tsl';
import { GAMMA, hexToLinear, LUMA as LUMA_ARR, toGamma, type V3DyeColors, type V3DyeRef } from '@dtl/shared';

/**
 * Nhuộm nhân vật v3 (N-7): màu đạo bào chọn lúc tạo nhân vật và 3 kênh của Tủ ngoại trang (`dye3`: vải chính, viền/lót/đai, tua/kim loại).
 *
 * Model v3 là lưới nguyên khối với texture Tripo, không có texture mặt nạ vải. Hai lớp mặt nạ tính trong shader:
 * 1. **Hình học** (`dyeMask`, thuộc tính đỉnh tính một lần lúc dựng mẫu từ trọng số xương): đỉnh thuộc đầu, cổ, bàn tay, tóc = 0.
 *    Nhờ đó da và tóc không bao giờ bị nhuộm, kể cả với bộ có vải tông ấm trùng sắc da (Liệt Mạch, Địa Long).
 * 2. **Màu** theo từng model (`V3_DYE_REF` trong `packages/shared/src/v3dye.ts`, đo trên texture gốc): kênh 1 `chroma` = texel cùng hướng sắc độ với vải chính
 *    (như `dye.ts` của v1), `neutral` = texel ít bão hòa (giáp/vải xám, ngà); kênh 2 và 3 = texel gần màu tham chiếu của vùng đó (lót/đai tối,
 *    viền vàng/bạc), thắng kênh 1. Phần còn lại giữ nguyên.
 * Trong mặt nạ: màu nhuộm × (độ sáng texel / độ sáng tham chiếu), giữ nếp gấp và vân vải.
 */
export { V3_DYE_REF, v3DyeRefOf, type V3DyeColors, type V3DyeRef, type V3DyeRegion } from '@dtl/shared';

/** Xương mà đỉnh bám vào thì không nhuộm: đầu, cổ, phụ kiện đầu, bàn tay và ngón, tóc. */
export function isUndyedBone(name: string): boolean {
  return (
    name === 'Head' ||
    name.startsWith('neck_') ||
    name === 'dtl_head_acc' ||
    name.startsWith('dtl_o_hair') ||
    /^hand_[lr]$/.test(name) ||
    /^(thumb|index|middle|ring|pinky)_/.test(name)
  );
}

export const DYE_MASK_ATTR = 'dyeMask';
/** Ngưỡng đầu = gốc xương `neck_01` hạ đoạn này (m) để lấy cả cằm, hàm dưới; thiếu `neck_01` thì lấy gốc `Head` (cách cổ cỡ đó). */
const NECK_DROP = 0.08;

/**
 * Thêm thuộc tính đỉnh `dyeMask` (1 = nhuộm được, 0 = đầu/tay/tóc) cho mọi lưới skin trong `scene` (một lần mỗi hình học). Gọi lúc dựng mẫu,
 * trước khi gộp lưới LOD (các lưới phải cùng bộ thuộc tính mới gộp được).
 */
export function addDyeMask(scene: THREE.Object3D): void {
  const done = new Set<THREE.BufferGeometry>();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || done.has(m.geometry)) return;
    const g = m.geometry;
    done.add(g);
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    if (!si || !sw || g.hasAttribute(DYE_MASK_ATTR)) return;
    const skip = m.skeleton.bones.map((b) => isUndyedBone(b.name));
    // Đỉnh mặt/tóc không bám xương `Head` đủ nặng (nhiều đỉnh chia trọng số cho cổ, vai): thêm điều kiện theo độ cao ở tư thế bind,
    // đỉnh cao hơn gốc cổ không bao giờ nhuộm.
    const bindY = (name: string): number | null => {
      const k = m.skeleton.bones.findIndex((b) => b.name === name);
      const inv = k >= 0 ? m.skeleton.boneInverses[k] : undefined;
      return inv ? new THREE.Vector3().setFromMatrixPosition(inv.clone().invert()).y : null;
    };
    // Gốc cổ (`neck_01`); thiếu thì lấy gốc `Head` hạ một đoạn.
    const neckY = (bindY('neck_01') ?? (bindY('Head') ?? Infinity) + NECK_DROP) - NECK_DROP;
    const headInv = Number.isFinite(neckY);
    const headY = neckY;
    const pos = g.getAttribute('position');
    const v = new THREE.Vector3();
    const out = new Float32Array(si.count);
    for (let i = 0; i < si.count; i++) {
      if (headInv && v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).y > headY) continue;
      let w = 0;
      let total = 0;
      for (let k = 0; k < 4; k++) {
        const wk = sw.getComponent(i, k);
        total += wk;
        if (skip[si.getComponent(i, k)]) w += wk;
      }
      out[i] = total > 0 ? 1 - w / total : 1;
    }
    g.setAttribute(DYE_MASK_ATTR, new THREE.BufferAttribute(out, 1));
  });
}

const LUMA = new THREE.Vector3(...LUMA_ARR);
const lin = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
const lumOf = (c: THREE.Color): number => c.r * LUMA.x + c.g * LUMA.y + c.b * LUMA.z;

type U<T> = ReturnType<typeof uniform<T>>;

/** Tham số nhuộm một vùng màu (kênh 2 hoặc 3): đều là uniform. */
export interface V3RegionUniforms {
  /** Màu nhuộm (tuyến tính). */
  target: U<THREE.Color>;
  /** Màu tham chiếu trong không gian gamma 2,2. */
  refG: U<THREE.Vector3>;
  /** Bán kính vùng; 0 = model không có vùng này. */
  r: U<number>;
  /** Độ sáng của màu tham chiếu (tuyến tính). */
  refLum: U<number>;
  /** Số mũ nén tương phản. */
  gamma: U<number>;
  /** 1 = áp màu nhuộm; 0 = giữ gốc (chưa chọn màu kênh này). */
  on: U<number>;
}

/** Tham số nhuộm của một vật liệu, đều là uniform: mọi vật liệu nhuộm dùng chung MỘT chương trình shader, chỉ khác giá trị. */
export interface V3DyeUniforms {
  /** Màu nhuộm (tuyến tính). */
  target: U<THREE.Color>;
  /** Hướng sắc độ của vải tham chiếu (chuẩn hóa); chế độ `neutral` không dùng. */
  dir: U<THREE.Vector3>;
  /** Độ sáng của vải tham chiếu. */
  refLum: U<number>;
  /** Số mũ nén tương phản (0,6 khi màu nhuộm sáng hơn vải gốc, không thì 1). */
  gamma: U<number>;
  /** 0 = `chroma`, 1 = `neutral`. */
  neutral: U<number>;
  /** Kênh 2: viền, lót, đai. */
  trim: V3RegionUniforms;
  /** Kênh 3: tua, kim loại, điểm nhấn. */
  accent: V3RegionUniforms;
}

/** Giá trị uniform của một vùng màu (kênh 2/3); `dye` thiếu hoặc model không có vùng thì tắt. */
export function v3RegionValues(
  region: { ref: string; r: number } | undefined,
  dye: string | undefined,
): { target: THREE.Color; refG: THREE.Vector3; r: number; refLum: number; gamma: number; on: number } {
  const refHex = region?.ref ?? '#808080';
  const refC = lin(refHex);
  const target = lin(dye ?? refHex);
  const g = toGamma(hexToLinear(refHex));
  const refLum = Math.max(lumOf(refC), 0.02);
  return {
    target,
    refG: new THREE.Vector3(g[0], g[1], g[2]),
    r: region?.r ?? 0,
    refLum,
    gamma: lumOf(target) > refLum ? 0.6 : 1,
    on: region && dye ? 1 : 0,
  };
}

/** Giá trị uniform kênh 1 của một cặp (vải tham chiếu, màu nhuộm). */
export function v3DyeValues(
  ref: V3DyeRef,
  dye: string,
): { target: THREE.Color; dir: THREE.Vector3; refLum: number; gamma: number; neutral: number } {
  const refC = lin(ref.ref);
  const target = lin(dye);
  const refLum = Math.max(lumOf(refC), 0.02);
  const rm = (refC.r + refC.g + refC.b) / 3;
  const dir = new THREE.Vector3(refC.r - rm, refC.g - rm, refC.b - rm);
  if (dir.lengthSq() > 1e-10) dir.normalize();
  else dir.set(0, 0, 1);
  // Màu sáng hơn vải gốc thì nén tương phản để vùng sáng không cháy trắng (như `dye.ts`).
  return { target, dir, refLum, gamma: lumOf(target) > refLum ? 0.6 : 1, neutral: ref.mode === 'neutral' ? 1 : 0 };
}

function regionUniforms(region: { ref: string; r: number } | undefined, dye: string | undefined): V3RegionUniforms {
  const v = v3RegionValues(region, dye);
  return {
    target: uniform(v.target),
    refG: uniform(v.refG),
    r: uniform(v.r),
    refLum: uniform(v.refLum),
    gamma: uniform(v.gamma),
    on: uniform(v.on),
  };
}

/**
 * Gắn nhuộm v3 vào vật liệu (bản sao riêng theo bộ màu; hình học phải có `dyeMask`). Chồng lên `colorNode` sẵn có của vật liệu
 * (bảng màu Lạc Kiếm, voan của model giữ gốc) nếu có. Màu, vải tham chiếu, bán kính vùng và chế độ là uniform (`material.userData.v3Dye`),
 * không nướng thành hằng số trong shader: người chơi xuất hiện với màu chưa gặp không gây biên dịch shader/pipeline mới.
 * Ba kênh cùng một lượt đọc texel: không thêm draw call hay texture. Công thức trọng số khớp `dyeWeights` trong `packages/shared/src/v3dye.ts`.
 */
export function applyV3Dye(m: THREE.MeshStandardNodeMaterial, ref: V3DyeRef, dye: V3DyeColors | string): THREE.MeshStandardNodeMaterial {
  const colors: V3DyeColors = typeof dye === 'string' ? { main: dye } : dye;
  const v = v3DyeValues(ref, colors.main);
  const u: V3DyeUniforms = {
    target: uniform(v.target),
    dir: uniform(v.dir),
    refLum: uniform(v.refLum),
    gamma: uniform(v.gamma),
    neutral: uniform(v.neutral),
    trim: regionUniforms(ref.trim, colors.trim),
    accent: regionUniforms(ref.accent, colors.accent),
  };
  const base = m.colorNode ? vec4(m.colorNode) : materialColor;
  const c = base.rgb;
  const mean = dot(c, vec3(1 / 3, 1 / 3, 1 / 3));
  const ch = c.sub(mean);
  const mag = length(ch);
  const sat = mag.div(mean.add(1e-3));
  const cosA = dot(ch, u.dir).div(max(mag, float(1e-4)));
  const chromaMask = smoothstep(0.7, 0.85, cosA).mul(smoothstep(0.1, 0.2, sat));
  const neutralMask = float(1).sub(smoothstep(0.2, 0.34, sat));
  const colorMask = mix(chromaMask, neutralMask, u.neutral);
  const geo = smoothstep(0.35, 0.65, attribute(DYE_MASK_ATTR, 'float'));
  const lum = dot(c, vec3(LUMA.x, LUMA.y, LUMA.z));
  const cg = pow(max(c, vec3(0, 0, 0)), vec3(GAMMA, GAMMA, GAMMA));
  // Vùng màu (kênh 2/3): gần màu tham chiếu trong không gian gamma. Bán kính 0 thì mặt nạ 0.
  const region = (z: V3RegionUniforms) => {
    const d = length(cg.sub(z.refG));
    const rr = max(z.r, float(1e-4));
    return float(1)
      .sub(smoothstep(rr.mul(0.6), rr, d))
      .mul(step(float(1e-3), z.r));
  };
  const w2 = region(u.trim);
  const w3 = region(u.accent).mul(float(1).sub(w2));
  const w1 = colorMask.mul(float(1).sub(w2)).mul(float(1).sub(w3));
  const recolor = (z: V3RegionUniforms) => min(z.target.mul(pow(clamp(lum.div(z.refLum), 0.35, 2.4), z.gamma)), vec3(1, 1, 1));
  const dyed1 = min(u.target.mul(pow(lum.div(u.refLum), u.gamma)), vec3(1, 1, 1));
  // Kênh 2/3 chưa chọn màu (`on = 0`) vẫn chiếm vùng của mình (thắng kênh 1) nhưng giữ màu gốc: không để kênh 1 nhuộm lót, đai, kim loại.
  let out = mix(c, dyed1, w1.mul(geo));
  out = mix(out, recolor(u.trim), w2.mul(geo).mul(u.trim.on));
  out = mix(out, recolor(u.accent), w3.mul(geo).mul(u.accent.on));
  m.colorNode = vec4(out, base.a);
  m.userData.v3Dye = u;
  m.needsUpdate = true;
  return m;
}

/**
 * Bộ màu nhuộm áp lên model v3 của một nhân vật; null = giữ màu gốc của model.
 * - Tủ ngoại trang (`tint`, bộ ba `dye3`): áp lên mọi model; kênh 2/3 thiếu thì giữ màu gốc của vùng đó.
 * - Màu đạo bào lúc tạo nhân vật: chỉ khi không mặc bộ nào (đồ khởi đầu) và khác màu mặc định, chỉ kênh 1; mặc bộ thì model của bộ giữ
 *   màu riêng (như áo mô-đun của v1).
 * - Đang mặc skin toàn thân: không nhuộm.
 */
export function v3DyeColors(
  look: { dye: string; set?: string; skin?: string; tint?: { hex: string; trim?: string; accent?: string } },
  dyes: { get(id: string): { hex: string } | undefined },
  defaultDye: string,
): V3DyeColors | null {
  if (look.skin) return null;
  if (look.tint)
    return {
      main: look.tint.hex,
      ...(look.tint.trim ? { trim: look.tint.trim } : {}),
      ...(look.tint.accent ? { accent: look.tint.accent } : {}),
    };
  if (look.set || look.dye === defaultDye) return null;
  const hex = dyes.get(look.dye)?.hex;
  return hex ? { main: hex } : null;
}

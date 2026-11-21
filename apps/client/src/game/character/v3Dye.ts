import * as THREE from 'three/webgpu';
import { attribute, dot, float, length, materialColor, max, min, mix, pow, smoothstep, uniform, vec3, vec4 } from 'three/tsl';

/**
 * Nhuộm áo nhân vật v3 (N-7): màu đạo bào chọn lúc tạo nhân vật và kênh 1 của Tủ ngoại trang (`dye3`).
 *
 * Model v3 là lưới nguyên khối với texture Tripo, không có texture mặt nạ vải. Hai lớp mặt nạ tính trong shader:
 * 1. **Hình học** (`dyeMask`, thuộc tính đỉnh tính một lần lúc dựng mẫu từ trọng số xương): đỉnh thuộc đầu, cổ, bàn tay, tóc = 0.
 *    Nhờ đó da và tóc không bao giờ bị nhuộm, kể cả với bộ có vải tông ấm trùng sắc da (Liệt Mạch, Địa Long).
 * 2. **Màu** theo từng model (`V3_DYE_REF`, đo trên texture gốc): `chroma` = texel cùng hướng sắc độ với vải chính (như `dye.ts` của v1);
 *    `neutral` = texel ít bão hòa (giáp/vải xám, ngà: Huyền Giáp, Cổ Thành, Kính Quang, Vạn Kinh). Phần còn lại (viền vàng, lớp vải phụ) giữ nguyên.
 * Trong mặt nạ: màu nhuộm × (độ sáng texel / độ sáng tham chiếu), giữ nếp gấp và vân vải.
 */
export interface V3DyeRef {
  mode: 'chroma' | 'neutral';
  /** Màu vải chính trong texture (hex sRGB, đo bằng cụm màu lớn nhất của texture gốc). */
  ref: string;
}

const chroma = (ref: string): V3DyeRef => ({ mode: 'chroma', ref });
const neutral = (ref: string): V3DyeRef => ({ mode: 'neutral', ref });

/** Khóa = id asset bỏ hậu tố giới (`_nam|_nu`). Model không có ở đây (skin toàn thân) không nhuộm. */
export const V3_DYE_REF: Readonly<Record<string, V3DyeRef>> = {
  chr_v3_de_tu: chroma('#435466'),
  chr_v3_dan_tam: chroma('#41574b'),
  // Lạc Kiếm: sau bảng màu `v3Palette` lớp lam nằm quanh #3B6584.
  chr_v3_lac_kiem: chroma('#3B6584'),
  chr_v3b_lac_kiem: chroma('#3B6584'),
  chr_v3b2_lac_kiem: chroma('#3B6584'),
  chr_v3_huyen_giap: neutral('#363435'),
  chr_v3_kinh_quang: neutral('#b9b5b9'),
  chr_v3_liet_mach: chroma('#ae937b'),
  chr_v3_tinh_khuyet: chroma('#a484b5'),
  chr_v3_co_thanh: neutral('#899084'),
  chr_v3_dia_long: chroma('#836747'),
  chr_v3_van_kinh: neutral('#a7a6a3'),
  chr_v3_luu_ly: chroma('#6d8b91'),
  chr_v3_phuc_mach: chroma('#9c987b'),
  chr_v3_than_tang: chroma('#55546a'),
};

export function v3DyeRefOf(assetId: string): V3DyeRef | null {
  return V3_DYE_REF[assetId.replace(/_(nam|nu)$/, '')] ?? null;
}

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
    const out = new Float32Array(si.count);
    for (let i = 0; i < si.count; i++) {
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

const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);
const lin = (hex: string): THREE.Color => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
const lumOf = (c: THREE.Color): number => c.r * LUMA.x + c.g * LUMA.y + c.b * LUMA.z;

/** Tham số nhuộm của một vật liệu, đều là uniform: mọi vật liệu nhuộm dùng chung MỘT chương trình shader, chỉ khác giá trị. */
export interface V3DyeUniforms {
  /** Màu nhuộm (tuyến tính). */
  target: ReturnType<typeof uniform<THREE.Color>>;
  /** Hướng sắc độ của vải tham chiếu (chuẩn hóa); chế độ `neutral` không dùng. */
  dir: ReturnType<typeof uniform<THREE.Vector3>>;
  /** Độ sáng của vải tham chiếu. */
  refLum: ReturnType<typeof uniform<number>>;
  /** Số mũ nén tương phản (0,6 khi màu nhuộm sáng hơn vải gốc, không thì 1). */
  gamma: ReturnType<typeof uniform<number>>;
  /** 0 = `chroma`, 1 = `neutral`. */
  neutral: ReturnType<typeof uniform<number>>;
}

/** Giá trị uniform của một cặp (vải tham chiếu, màu nhuộm). */
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

/**
 * Gắn nhuộm v3 vào vật liệu (bản sao riêng theo màu; hình học phải có `dyeMask`). Chồng lên `colorNode` sẵn có của vật liệu
 * (bảng màu Lạc Kiếm, voan của model giữ gốc) nếu có. Màu, vải tham chiếu và chế độ là uniform (`material.userData.v3Dye`), không nướng
 * thành hằng số trong shader: người chơi xuất hiện với màu chưa gặp không gây biên dịch shader/pipeline mới.
 */
export function applyV3Dye(m: THREE.MeshStandardNodeMaterial, ref: V3DyeRef, dye: string): THREE.MeshStandardNodeMaterial {
  const v = v3DyeValues(ref, dye);
  const u: V3DyeUniforms = {
    target: uniform(v.target),
    dir: uniform(v.dir),
    refLum: uniform(v.refLum),
    gamma: uniform(v.gamma),
    neutral: uniform(v.neutral),
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
  const ratio = dot(c, vec3(LUMA.x, LUMA.y, LUMA.z)).div(u.refLum);
  const dyed = min(u.target.mul(pow(ratio, u.gamma)), vec3(1, 1, 1));
  m.colorNode = vec4(mix(c, dyed, colorMask.mul(geo)), base.a);
  m.userData.v3Dye = u;
  m.needsUpdate = true;
  return m;
}

/**
 * Màu nhuộm áp lên model v3 của một nhân vật; null = giữ màu gốc của model.
 * - Tủ ngoại trang (`tint`, kênh 1 của `dye3`): áp lên mọi model.
 * - Màu đạo bào lúc tạo nhân vật: chỉ khi không mặc bộ nào (đồ khởi đầu) và khác màu mặc định; mặc bộ thì model của bộ giữ màu riêng
 *   (như áo mô-đun của v1).
 * - Đang mặc skin toàn thân: không nhuộm.
 */
export function v3DyeHex(
  look: { dye: string; set?: string; skin?: string; tint?: { hex: string } },
  dyes: { get(id: string): { hex: string } | undefined },
  defaultDye: string,
): string | null {
  if (look.skin) return null;
  if (look.tint) return look.tint.hex;
  if (look.set || look.dye === defaultDye) return null;
  return dyes.get(look.dye)?.hex ?? null;
}

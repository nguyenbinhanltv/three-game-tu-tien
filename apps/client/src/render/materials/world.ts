import * as THREE from 'three/webgpu';
import {
  cameraFar,
  cameraNear,
  diffuseColor,
  float,
  mix,
  normalView,
  normalWorld,
  positionView,
  positionViewDirection,
  smoothstep,
  uniform,
  vec3,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { rimParams } from '../atmosphere';
import { skyParams } from '../sky';
import { registerDerived } from './derived';

/**
 * Material PBR cách điệu dùng chung cho thế giới (địa hình, cây, kiến trúc, nhân vật, quái) và sau
 * này cho model từ pipeline asset. Màu lấy từ màu đỉnh/texture; độ nhám cao, không kim loại, nên
 * nắng cho mảng sáng mềm và một chút ánh bóng ở góc nghiêng, không bóng loáng.
 * Sương, giảm bão hòa theo độ sâu nằm ở `scene.fogNode` (atmosphere.ts); chỉnh màu ở post.ts.
 * Dùng chung một instance cho nhiều mesh, đừng tạo mới cho từng mesh.
 */
export function createWorldMaterial(params: THREE.MeshStandardNodeMaterialParameters = {}): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ roughness: 0.86, metalness: 0, ...params });
}

/**
 * Thay material glTF (MeshStandardMaterial do GLTFLoader tạo) trong cây `root` bằng `MeshStandardNodeMaterial`
 * giữ nguyên thông số PBR, màu đỉnh, texture (cả KHR_texture_transform nằm trên texture). `wrap` gắn thêm node
 * (vd. `withOccluderFade`) cho từng material mới. Mỗi material gốc chỉ đổi một lần.
 * Trả về các material mới: người gọi dispose khi bỏ asset; texture vẫn thuộc bản gốc trong AssetCache.
 */
export function adoptGltfMaterials(
  root: THREE.Object3D,
  wrap: (m: THREE.MeshStandardNodeMaterial) => THREE.MeshStandardNodeMaterial = (m) => m,
): THREE.MeshStandardNodeMaterial[] {
  const made = new Map<THREE.Material, THREE.MeshStandardNodeMaterial>();
  const convert = (src: THREE.Material): THREE.MeshStandardNodeMaterial => {
    let m = made.get(src);
    if (m) return m;
    const s = src as THREE.MeshStandardMaterial;
    m = wrap(
      createWorldMaterial({
        name: s.name,
        color: s.color,
        map: s.map,
        roughness: s.roughness ?? 0.86,
        metalness: s.metalness ?? 0,
        roughnessMap: s.roughnessMap,
        metalnessMap: s.metalnessMap,
        normalMap: s.normalMap,
        normalScale: s.normalScale,
        aoMap: s.aoMap,
        emissive: s.emissive,
        emissiveMap: s.emissiveMap,
        emissiveIntensity: s.emissiveIntensity ?? 1,
        vertexColors: s.vertexColors,
        side: s.side,
        transparent: s.transparent,
        alphaTest: s.alphaTest,
      }),
    );
    made.set(src, m);
    registerDerived(src, m);
    return m;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  return [...made.values()];
}

/** Thuộc tính PBR thường mà `MeshStandardNodeMaterial.clone()` của three r178 KHÔNG chép (nó chỉ chép các `*Node` và phần chung của `Material`). */
const PBR_TEXTURES = ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap', 'alphaMap', 'envMap'] as const;
const PBR_SCALARS = ['roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity', 'aoMapIntensity'] as const;

/**
 * Bản sao đầy đủ của một material thế giới (biến thể theo người chơi: nhuộm áo, linh thể): giữ node, texture, màu và thông số PBR.
 * Texture dùng chung với bản gốc (không dispose theo bản sao).
 */
export function cloneWorldMaterial(src: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  const m = src.clone();
  const a = src as unknown as Record<string, unknown>;
  const b = m as unknown as Record<string, unknown>;
  for (const k of PBR_TEXTURES) b[k] = a[k] ?? null;
  for (const k of PBR_SCALARS) if (typeof a[k] === 'number') b[k] = a[k];
  m.color.copy(src.color);
  m.emissive.copy(src.emissive);
  m.normalScale.copy(src.normalScale);
  return m;
}

/**
 * Viền sáng (rim) tách khối nhân vật khỏi nền: fresnel hẹp ở mép hình bóng, sắc nắng, mạnh hơn ở phía hướng mặt trời
 * và ở phần trên thân, gần tắt ở phía khuất nắng. Yếu có chủ ý (art bible 5.3: không rim trắng gắt); cường độ theo preset
 * (`rimParams`, khối `grading` của palette.json). Cộng vào `emissiveNode`, không vào bloom, không thêm draw call hay texture.
 * Chỉ gọi cho material chưa dùng emissive (thân người chơi, NPC).
 */
export function rimLight(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1)).pow(2.6);
  const sunSide = normalWorld.dot(skyParams.sunDir).mul(0.5).add(0.5);
  const up = normalWorld.y.mul(0.5).add(0.5);
  // Hero light (Chân Cảnh C1): đèn phụ bám camera + viền theo hướng tu, CHỈ cho mesh có `userData.hero` (mình, đồng đội).
  // Không phải đèn thật (không thêm bóng, không đổi cảnh): một thành phần sáng trong không gian nhìn, nhân với màu gốc của vật liệu.
  const fillDir = vec3(-0.3, 0.55, 0.78).normalize();
  const fill = normalView.dot(fillDir).clamp(0, 1).mul(HERO_FILL);
  const heroRim = float(1)
    .sub(normalView.dot(positionViewDirection).clamp(0, 1))
    .pow(2.2)
    .mul(mix(float(0.55), float(1), up))
    .mul(HERO_RIM);
  const hero = heroParams.k.mul(heroParams.enabled);
  m.emissiveNode = rimParams.color
    .mul(
      fres
        .mul(mix(float(0.25), float(1), sunSide))
        .mul(mix(float(0.6), float(1), up))
        .mul(rimParams.strength),
    )
    .add(diffuseColor.rgb.mul(fill).mul(hero))
    .add(heroParams.tint.mul(heroRim).mul(hero));
  return m;
}

/** Độ lệch độ sâu (m) của bản sao viền tối: dưới mức này coi là tự che, không vẽ. */
export const HERO_GHOST_BIAS = 0.6;

/** Cường độ đèn phụ (nhân màu gốc) và viền hướng tu của hero light. */
export const HERO_FILL = 0.28;
export const HERO_RIM = 1.5;

/**
 * Tham số hero light theo TỪNG VẬT (`onObjectUpdate`): mesh mang `userData.hero = { k, tint }` (k 0–1, tint số hex) thì vật liệu
 * dùng chung vẫn cho mỗi nhân vật một màu riêng. `enabled` là công tắc chung (Cài đặt "Viền nhân vật").
 */
export const heroParams = {
  enabled: uniform(1),
  k: uniform(0).onObjectUpdate((frame) => {
    const h = frame.object?.userData.hero as { k: number } | undefined;
    heroParams.k.value = h ? h.k : 0;
  }),
  tint: uniform(new THREE.Color(1, 1, 1)).onObjectUpdate((frame) => {
    const h = frame.object?.userData.hero as { tint: number } | undefined;
    heroParams.tint.value.setHex(h ? h.tint : 0xffffff);
  }),
};

/**
 * Vật liệu "ma" cho viền khi bị che (Chân Cảnh C1): vẽ lại thân nhân vật CHỈ ở điểm sau một vật khác (`depthFunc` GREATER, không ghi
 * sâu), mực tối mờ, đậm ở mép (fresnel) để thành đường viền mảnh. Nơi dùng gắn vào bản sao SkinnedMesh dùng chung xương.
 */
export function createHeroGhostMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  m.depthFunc = THREE.GreaterDepth;
  // Chống tự che: dời độ sâu bản sao về phía camera `HERO_GHOST_BIAS` m, nên chỉ điểm thân nằm SAU vật khác quá ngần ấy mới được vẽ.
  // Tay đè thân, tóc sau đầu, chân bắt chéo (cách nhau dưới ngưỡng) không bị phủ mực; vật cảnh che thật (cây, tường, mái) thì xa hơn.
  m.depthNode = viewZToPerspectiveDepth(positionView.z.add(HERO_GHOST_BIAS), cameraNear, cameraFar);
  const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1));
  m.colorNode = vec3(0.04, 0.05, 0.08);
  m.opacityNode = smoothstep(float(0.0), float(1), fres).mul(0.7).add(0.12).mul(heroParams.enabled);
  return m;
}

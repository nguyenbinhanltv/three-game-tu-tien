import * as THREE from 'three/webgpu';
import {
  cameraFar,
  cameraNear,
  diffuseColor,
  float,
  luminance,
  mix,
  normalLocal,
  normalView,
  normalWorld,
  output,
  positionLocal,
  positionView,
  positionViewDirection,
  smoothstep,
  uniform,
  vec3,
  vec4,
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

/** Ba bậc sáng của kiểu tô Dạ Cảnh (tỉ lệ so với màu gốc): bóng, thân, sáng; và hai ngưỡng chuyển bậc (nửa bề rộng mép `TOON_SOFT`). */
export const TOON_LEVELS = [0.34, 0.7, 1.08] as const;
export const TOON_EDGES = [0.42, 0.86] as const;
export const TOON_SOFT = 0.03;
/** Tỉ lệ sáng từ mức này trở lên (viền sáng, đèn mạnh) được cộng nguyên phần vượt, không bị ép về bậc sáng nhất. */
export const TOON_HILITE = 1.25;

/** Bậc sáng (thuần số, cùng công thức với shader) của một tỉ lệ sáng `r` = độ sáng sau chiếu sáng / độ sáng màu gốc. */
export function toonLevel(r: number): number {
  const ss = (e: number) => {
    const x = Math.min(1, Math.max(0, (r - (e - TOON_SOFT)) / (2 * TOON_SOFT)));
    return x * x * (3 - 2 * x);
  };
  const a = TOON_LEVELS[0] + (TOON_LEVELS[1] - TOON_LEVELS[0]) * ss(TOON_EDGES[0]);
  return a + (TOON_LEVELS[2] - a) * ss(TOON_EDGES[1]);
}

/**
 * Tô bóng CHIA BẬC cho nhân vật/quái ở Dạ Cảnh (`?style=da`): giữ nguyên texture và mọi đường chiếu sáng PBR, chỉ lượng tử hóa ĐỘ SÁNG của kết quả
 * so với màu gốc thành ba bậc có mép ngắn (không răng cưa). Sắc của ánh sáng (nắng, trời, đèn lồng) và phần viền sáng `rimLight` được giữ.
 * Không thêm draw call hay texture. Ngoại lệ của Dạ Cảnh so với art bible v3 (xem docs/handbook/da-canh.md).
 */
/** Phòng thử (khu Phong cách): độ sâu chia bậc của Dạ Cảnh, 1 = ba bậc như quy định, 0 = tô mịn không chia bậc. Mặc định 1 cho ra đúng kết quả cũ. */
export const toonDepth = uniform(1);

/**
 * Dạ Cảnh: cường độ VIỀN SÁNG TÁCH NỀN của quái (0 = tắt). Quái xám/nâu trên nền đêm lam tối gần như cùng độ sáng với nền, mà viền mực lại tối trên
 * tối; một viền fresnel hẹp sắc trăng lạnh ở mép hình bóng tách khối. ĐO ĐÚNG (`pnpm shots daread`, 28/11, cổng riêng, có đối chứng lặp cùng giá trị lệch ≤ ±1,5):
 * tách nền tăng ở mức 0,7 / 1,2 so với 0: bầy sói 33 → 39 / 42, tinh anh 26 → 35 / 40, boss 31 → 36 / 40, chìm 3,5% → 1,4% (bầy). NHƯNG ở tinh anh và boss
 * viền sáng làm thân ngả hồng tím, mất sắc ĐỎ nhận diện (xem ảnh). Vì vậy chưa bật mặc định; dự kiến chỉ bật cho quái thường (xám) và giữ nguyên tinh anh/boss.
 */
export const DA_SEP_RIM = 0;
export const daSepRim = uniform(DA_SEP_RIM);
/** Sắc viền tách nền (tuyến tính): trăng lạnh, khớp ánh viền đạo cụ của Dạ Họa. */
const DA_SEP_COLOR = vec3(0.5, 0.68, 1.0);

export function toonBands(m: THREE.MeshStandardNodeMaterial, sepRim = false): THREE.MeshStandardNodeMaterial {
  const lit = output.rgb;
  const base = luminance(diffuseColor.rgb).max(0.02);
  const r = luminance(lit).div(base);
  const lo = mix(float(TOON_LEVELS[0]), float(TOON_LEVELS[1]), smoothstep(TOON_EDGES[0] - TOON_SOFT, TOON_EDGES[0] + TOON_SOFT, r));
  const banded = mix(lo, float(TOON_LEVELS[2]), smoothstep(TOON_EDGES[1] - TOON_SOFT, TOON_EDGES[1] + TOON_SOFT, r));
  const lvl = mix(r.min(TOON_HILITE), banded, toonDepth);
  // Phần vượt bậc sáng nhất (viền sáng, đèn mạnh) giữ nguyên để rim và điểm sáng không bị cắt.
  const k = lvl.add(r.sub(TOON_HILITE).max(0)).div(r.max(0.02));
  if (sepRim) {
    // Mép hình bóng (pháp tuyến gần vuông góc hướng nhìn), mạnh hơn ở nửa trên thân để chân không sáng hơn lưng; cộng SAU chia bậc nên viền không bị lượng tử.
    const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1)).pow(3);
    const up = normalWorld.y.mul(0.5).add(0.5);
    m.outputNode = vec4(lit.mul(k).add(DA_SEP_COLOR.mul(fres.mul(mix(float(0.45), float(1), up)).mul(daSepRim))), output.a);
    return m;
  }
  m.outputNode = vec4(lit.mul(k), output.a);
  return m;
}

/**
 * Viền sáng (rim) tách khối nhân vật khỏi nền: fresnel hẹp ở mép hình bóng, sắc nắng, mạnh hơn ở phía hướng mặt trời
 * và ở phần trên thân, gần tắt ở phía khuất nắng. Yếu có chủ ý (art bible 5.3: không rim trắng gắt); cường độ theo preset
 * (`rimParams`, khối `grading` của palette.json). Cộng vào `emissiveNode`, không vào bloom, không thêm draw call hay texture.
 * Vật liệu đã có `emissiveNode` (voan bóng lụa của v3) thì CỘNG thêm, không ghi đè.
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
  const rim = rimParams.color
    .mul(
      fres
        .mul(mix(float(0.25), float(1), sunSide))
        .mul(mix(float(0.6), float(1), up))
        .mul(rimParams.strength),
    )
    .add(diffuseColor.rgb.mul(fill).mul(hero))
    .add(heroParams.tint.mul(heroRim).mul(hero));
  m.emissiveNode = m.emissiveNode ? vec3(m.emissiveNode).add(rim) : rim;
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
    heroParams.tint.value.setHex(h && Number.isFinite(h.tint) ? h.tint : 0xffffff);
  }),
};

/**
 * Vật liệu "ma" cho viền khi bị che (Chân Cảnh C1): vẽ lại thân nhân vật CHỈ ở điểm sau một vật khác (`depthFunc` GREATER, không ghi
 * sâu), mực tối mờ, đậm ở mép (fresnel) để thành đường viền mảnh. Nơi dùng gắn vào bản sao SkinnedMesh dùng chung xương.
 */
/** Tham số viền mực theo từng vật (`userData.ink = { w, color }`, đặt bởi `InkHulls`): bề dày theo đơn vị CỤC BỘ của lưới và màu viền. */
const _inkCol = new THREE.Color();
export const inkParams = {
  w: uniform(0).onObjectUpdate(({ object }) => (object?.userData.ink as { w?: number } | undefined)?.w ?? 0),
  color: uniform(new THREE.Color(0x05040a)).onObjectUpdate(({ object }) =>
    _inkCol.setHex((object?.userData.ink as { color?: number } | undefined)?.color ?? 0x05040a),
  ),
};

/**
 * Viền mực kiểu "vỏ lộn ngược" (Dạ Cảnh): vẽ lại lưới thân với mặt SAU, phồng theo pháp tuyến `inkParams.w`, tô một màu phẳng. Ba lưu ý:
 * dùng `MeshStandardNodeMaterial` tắt đèn (xem ghi chú ở `createHeroGhostMaterial` về lỗi của vật liệu Basic trên pass MRT); `positionNode` chạy SAU
 * skinning của three nên vỏ bám đúng tư thế; không sương, không bóng. Mỗi thể được viền thêm 1 draw call: `InkHulls` giữ trần số thể.
 */
export function createInkHullMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.BackSide, fog: false });
  m.lights = false;
  m.positionNode = positionLocal.add(normalLocal.mul(inkParams.w));
  m.colorNode = inkParams.color;
  m.emissiveNode = vec3(0, 0, 0);
  return m;
}

export function createHeroGhostMaterial(): THREE.MeshStandardNodeMaterial {
  // Lưu ý: KHÔNG dùng `MeshBasicNodeMaterial` ở đây. Trên cảnh có pass MRT + vật vẽ trong lượt trong suốt (phòng thử VFX, chr=v3) vật liệu Basic
  // tự dựng làm three báo `TypeError: Cannot read properties of undefined (reading 'r')` ở `NodeUniformsGroup.updateColor` mỗi khung (lỗi hồi quy
  // của C1, khoanh bằng cách đổi từng phần của vật liệu). Dùng `MeshStandardNodeMaterial` tắt đèn (`lights = false`) cho cùng kết quả không lỗi.
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  m.lights = false;
  m.depthFunc = THREE.GreaterDepth;
  // Chống tự che: dời độ sâu bản sao về phía camera `HERO_GHOST_BIAS` m, nên chỉ điểm thân nằm SAU vật khác quá ngần ấy mới được vẽ.
  // Tay đè thân, tóc sau đầu, chân bắt chéo (cách nhau dưới ngưỡng) không bị phủ mực; vật cảnh che thật (cây, tường, mái) thì xa hơn.
  m.depthNode = viewZToPerspectiveDepth(positionView.z.add(HERO_GHOST_BIAS), cameraNear, cameraFar);
  const fres = float(1).sub(normalView.dot(positionViewDirection).clamp(0, 1));
  m.colorNode = vec3(0.04, 0.05, 0.08);
  m.opacityNode = smoothstep(float(0.0), float(1), fres).mul(0.7).add(0.12).mul(heroParams.enabled);
  m.emissiveNode = vec3(0, 0, 0);
  return m;
}

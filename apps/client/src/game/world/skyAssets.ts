import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  float,
  luminance,
  mix,
  normalGeometry,
  normalize,
  positionWorld,
  texture,
  transformNormalToView,
  vec2,
  vec3,
} from 'three/tsl';
import { createWorldMaterial } from '../../render/materials/world';

/**
 * Texture của cảnh trên không (MAP-1 bản B tả thực): đá vách đảo nổi (PBR, chiếu ba mặt phẳng) và atlas tán lá có alpha.
 * Dựng bằng `pnpm assets:sky-textures` → `public/sky/` (manifest + WebP băm nội dung); nạp lười, lỗi thì rơi về màu đỉnh/khối tán cũ.
 */

/** Node TSL: kiểu của three/tsl không phơi bày toán tử trên `Node` trần, dùng any cho gọn (như ground.ts). */
type Node = any;

interface SkyManifest {
  rock: { albedo: string; normal: string };
  foliage: { atlas: string; tiles: string[] };
}

export interface SkyTextures {
  rockAlbedo: THREE.Texture;
  rockNormal: THREE.Texture;
  foliage: THREE.Texture;
  dispose(): void;
}

async function loadTexture(url: string, srgb: boolean, anisotropy = 8): Promise<THREE.Texture> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const t = new THREE.Texture(bmp);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.flipY = false;
  t.premultiplyAlpha = false;
  t.needsUpdate = true;
  return t;
}

let cached: Promise<SkyTextures> | null = null;

/** Nạp một lần cho cả phiên (dùng lại khi đổi level); null nếu thiếu file. */
export function loadSkyTextures(): Promise<SkyTextures | null> {
  cached ??= (async () => {
    const base = `${import.meta.env.BASE_URL}sky/`;
    const m = (await (await fetch(`${base}manifest.json`)).json()) as SkyManifest;
    const [rockAlbedo, rockNormal, foliage] = await Promise.all([
      loadTexture(`${base}${m.rock.albedo}`, true),
      loadTexture(`${base}${m.rock.normal}`, false),
      loadTexture(`${base}${m.foliage.atlas}`, true),
    ]);
    return {
      rockAlbedo,
      rockNormal,
      foliage,
      dispose() {
        rockAlbedo.dispose();
        rockNormal.dispose();
        foliage.dispose();
      },
    };
  })();
  return cached.catch(() => null);
}

/** Kích thước một ô trong atlas tán lá (4×2) theo u, v. */
export const FOLIAGE_TILE_SIZE: [number, number] = [0.25, 0.5];

/** Góc trên-trái của ô trong atlas tán lá (4×2, v=0 ở hàng trên vì texture không lật). `bark` là ô đặc (không alpha) cho thân cây. */
export const FOLIAGE_TILE: Record<'pine' | 'maple' | 'bamboo' | 'peach' | 'oak' | 'bark', [number, number]> = {
  pine: [0, 0],
  maple: [0.25, 0],
  bamboo: [0.5, 0],
  peach: [0.75, 0],
  oak: [0, 0.5],
  bark: [0.25, 0.5],
};

/**
 * Vật liệu đá vách đảo: màu đỉnh (tầng đá ấm/lạnh, rêu) nhân với albedo chiếu ba mặt phẳng, pháp tuyến + nhám từ texture PBR.
 * Pháp tuyến cộng lệch theo ba mặt chiếu (cùng cách `render/materials/ground.ts`), mềm hơn flat shading của bản A.
 */
export function rockMaterial(tex: SkyTextures): THREE.MeshStandardNodeMaterial {
  const mat = createWorldMaterial({ roughness: 0.9 });
  const p = positionWorld;
  const nGeo = normalize(normalGeometry);
  const w: Node = vec3(abs(nGeo.x).pow(4), abs(nGeo.y).pow(4), abs(nGeo.z).pow(4));
  const wsum = w.x.add(w.y).add(w.z).max(0.0001);
  const scale = float(1 / 13);
  const uvX: Node = vec2(p.z, p.y.negate()).mul(scale); // mặt chiếu theo trục x (nhìn từ +x): u = z, v = -y
  const uvY: Node = vec2(p.x, p.z).mul(scale);
  const uvZ: Node = vec2(p.x, p.y.negate()).mul(scale);
  const A = (uv: Node): Node => texture(tex.rockAlbedo, uv).rgb;
  const N = (uv: Node): Node => texture(tex.rockNormal, uv);
  const albedo: Node = A(uvX).mul(w.x).add(A(uvY).mul(w.y)).add(A(uvZ).mul(w.z)).div(wsum);
  const nrm: Node = N(uvX).mul(w.x).add(N(uvY).mul(w.y)).add(N(uvZ).mul(w.z)).div(wsum);
  const vc = attribute('color', 'vec3');
  // Giữ sắc/tầng của màu đỉnh, lấy chi tiết sáng tối từ ảnh đá (độ sáng ảnh ~0,5 → hệ số ~1).
  const detail = clamp(luminance(albedo).mul(2.1), 0.35, 1.7);
  mat.colorNode = mix(vc.mul(detail), vc.mul(albedo.mul(2.2)), 0.35);
  // Pháp tuyến: (R, G) = (x, y) của ảnh theo từng mặt chiếu; quy về lệch ở không gian thế giới.
  const ox: Node = vec3(0, nrm.y.mul(2).sub(1), nrm.x.mul(2).sub(1));
  const oy: Node = vec3(nrm.x.mul(2).sub(1), 0, float(1).sub(nrm.y.mul(2)));
  const oz: Node = vec3(nrm.x.mul(2).sub(1), nrm.y.mul(2).sub(1), 0);
  const off = ox.mul(w.x).add(oy.mul(w.y)).add(oz.mul(w.z)).div(wsum);
  mat.normalNode = transformNormalToView(normalize(nGeo.add(off.mul(0.9))));
  mat.roughnessNode = clamp(nrm.z, 0.45, 1);
  return mat;
}

/** Vật liệu tán lá thẻ: alpha cắt, hai mặt, màu đỉnh nhân màu ảnh (đổi sắc theo cây). */
export function foliageMaterial(tex: SkyTextures): THREE.MeshStandardNodeMaterial {
  const mat = createWorldMaterial({ map: tex.foliage, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  return mat;
}

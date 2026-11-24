import * as THREE from 'three/webgpu';
import { RINGS, type Ring } from './lab/blades';
import { RefField } from './lab/field';
import { smoothNoiseTexture, whiteNoiseTexture, createStrokes } from './lab/ref/textures';

/**
 * Dữ liệu dùng chung của cánh đồng Họa Cảnh trong game (RefField một bản, lưới cuộn). Lớp vẽ cỏ ở game/world/paintedField.ts. Cánh đồng Họa Cảnh trong game (`?style=painted`): dùng NGUYÊN bản dịch TSL đã đạt đo khớp ở cảnh thử (render/painted/lab: SSIM 0,93,
 * ΔE00 1,82 so với painted-valley) cho lá, hoa và màu đất, nhưng đọc độ cao và độ phủ cỏ từ địa hình của game: một texture lưới 1 m cuộn
 * quanh người chơi (độ cao R32F, `dry/growth/wet/flowers` RGBA8, độ dốc RG8) dựng bằng CPU từng ô 16 m, luật mọc cỏ chung với cỏ thường
 * (`grassDensityAt`: nước, dốc, sân đá, công trình). Ánh sáng, sương, gió là uniform của painted-valley ở giờ 15,5 (không theo mood của game).
 *
 * Khác cảnh thử (ngân sách game): vòng `mid` và `wide` thưa hơn và ít ô hơn (`GAME_RINGS`), hoa ít ô hơn; không có rạp lá theo người/quái.
 */
export const REGION = 160; // mét mỗi cạnh = texel (lưới 1 m, cuộn)
export const CT = 16; // texel mỗi ô dựng
export const SLOTS = REGION / CT;
export const WINDOW = 3; // ô mỗi phía quanh người chơi
export const SEED = 3;
export const HEIGHT = 0.5;

/** Giá trị uniform của painted-valley ở giờ 15,5 (đo bằng tools/painted-compare/ref-capture.mjs): ánh sáng, sương, gió. */
export const LIGHT = {
  sunDir: [0.7167861208222469, 0.6889814992611429, -0.10734128130623025],
  sunColor: [2.7140227398048826, 2.507931780585353, 2.0878180815609415],
  skyColor: [0.3, 0.46439090407804706, 0.8087818081560941],
  bounceColor: [0.1, 0.15719545203902355, 0.05],
  fogColor: [0.40560909592195293, 0.6728045479609766, 0.8471954520390235],
  fogSunColor: [0.7132864112585527, 0.7968272877658588, 0.8663454244682824],
  fogDensity: 0.00017,
  cloudShade: 0.15,
  wind: [-0.253695546739588, 0.9672841203930216, 4.5, 1],
};

/** Vòng lá của game: cùng công thức, thưa hơn và ít ô hơn so với nguồn (`RINGS`) để giữ ngân sách tam giác. */
export const GAME_RINGS: Ring[] = RINGS.filter((r) => r.name === 'mid' || r.name === 'wide').map((r) =>
  r.name === 'mid' ? { ...r, cell: 0.13, tile: 7.8, tiles: 6, width: 2.6 } : { ...r, cell: 0.28, tile: 22.4, tiles: 4, width: 5.8 },
);

let singleton: RefField | null = null;
let latData: { heights: Float32Array; map: Uint8Array; slope: Uint8Array } | null = null;
let latTex: { tHeight: THREE.DataTexture; tMap: THREE.DataTexture; tSlope: THREE.DataTexture } | null = null;

/** RefField dùng chung cho đất và cỏ của game (texture nhiễu, nét cọ dựng một lần; cuộn quanh người chơi). */
export function getPaintedRefField(): RefField {
  if (singleton) return singleton;
  const heights = new Float32Array(REGION * REGION);
  const map = new Uint8Array(REGION * REGION * 4);
  const slope = new Uint8Array(REGION * REGION * 2).fill(128);
  latData = { heights, map, slope };
  const tHeight = new THREE.DataTexture(heights, REGION, REGION, THREE.RedFormat, THREE.FloatType);
  tHeight.minFilter = tHeight.magFilter = THREE.NearestFilter;
  tHeight.wrapS = tHeight.wrapT = THREE.RepeatWrapping;
  tHeight.needsUpdate = true;
  const tMap = new THREE.DataTexture(map, REGION, REGION, THREE.RGBAFormat, THREE.UnsignedByteType);
  tMap.minFilter = tMap.magFilter = THREE.LinearFilter;
  tMap.wrapS = tMap.wrapT = THREE.RepeatWrapping;
  tMap.needsUpdate = true;
  const tSlope = new THREE.DataTexture(slope, REGION, REGION, THREE.RGFormat, THREE.UnsignedByteType);
  tSlope.minFilter = tSlope.magFilter = THREE.LinearFilter;
  tSlope.wrapS = tSlope.wrapT = THREE.RepeatWrapping;
  tSlope.unpackAlignment = 1;
  tSlope.needsUpdate = true;
  latTex = { tHeight, tMap, tSlope };
  const one = (r: number, g: number, b: number, a: number): THREE.DataTexture => {
    const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1);
    t.needsUpdate = true;
    return t;
  };
  const F = new RefField({
    tHeight,
    tMap,
    tNoise: smoothNoiseTexture(256, SEED * 13 + 1),
    tNoiseHi: smoothNoiseTexture(256, SEED * 13 + 1, true),
    tWhite: whiteNoiseTexture(256, SEED * 7 + 2),
    tStrokes: createStrokes(),
    tSlope,
    tShade: one(0, 0, 0, 255),
    tFloor: one(0, 0, 0, 0),
  });
  F.wrap = true;
  F.uExtentMin.value.set(0, 0);
  F.uExtentInv.value = 1 / REGION;
  F.uHeightRes.value = REGION;
  F.uSunDir.value.fromArray(LIGHT.sunDir).normalize();
  F.uSunColor.value.fromArray(LIGHT.sunColor);
  F.uSkyColor.value.fromArray(LIGHT.skyColor);
  F.uBounceColor.value.fromArray(LIGHT.bounceColor);
  F.uFogColor.value.fromArray(LIGHT.fogColor);
  F.uFogSunColor.value.fromArray(LIGHT.fogSunColor);
  F.uFogDensity.value = LIGHT.fogDensity;
  F.uCloudShade.value = LIGHT.cloudShade;
  F.uWind.value.fromArray(LIGHT.wind);
  F.uHeroEye.value.set(0, 54.74, 0);
  F.uFloor.value.set(0.6, 0.8, 250, -1200);
  F.uFloorInv.value = 1 / 2400;
  singleton = F;
  return F;
}

/** Dữ liệu lưới cuộn (độ cao, độ phủ, độ dốc) và texture của chúng, dựng cùng RefField. */
export function getPaintedLattice(): { data: NonNullable<typeof latData>; tex: NonNullable<typeof latTex> } {
  getPaintedRefField();
  return { data: latData!, tex: latTex! };
}

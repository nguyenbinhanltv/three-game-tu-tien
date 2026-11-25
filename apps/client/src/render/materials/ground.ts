import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  dot,
  clamp,
  cos,
  float,
  floor,
  fract,
  int,
  luminance,
  max,
  min,
  distance,
  mix,
  mrt,
  normalGeometry,
  normalize,
  positionView,
  positionWorld,
  select,
  sin,
  smoothstep,
  step,
  texture,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { SUOI, WORLD_SIZE } from '@dtl/shared';
import { GROUND_LAYER as L, type GroundTextures } from '../../base/groundTextures';
import { FLAGS } from '../../base/flags';
import { isoTerrainDetail } from './isoDetail';
import { lampPoolAt } from '../painted/lampPools';
import { withLowMist } from '../painted/lowMist';
import { paintedColor } from '../painted/palette';
import { getPaintedRefField } from '../painted/fieldShared';
import { flatTextures, groundColor } from '../painted/lab/ground';

/**
 * Shader mặt đất PBR (P2-A2): trộn 8 lớp texture CC0 Poly Haven theo vùng, độ dốc, độ cao.
 *   - Vùng: thuộc tính đỉnh `biome` (rừng, đất khô, đất chết) + mặt nạ thủ tục (groundMask.ts: đường mòn,
 *     sân lát đá, cát ven hồ, nhiễu vĩ mô). Màu đỉnh cũ vẫn là "bảng màu" của art bible: chỉ lấy sắc
 *     (hue) nhân vào texture, nên đổi màu vùng vẫn ở `terrainColor`.
 *   - Độ dốc: đá núi (chiếu từ trên xuống), vách đá chiếu hai mặt phẳng (theo hướng pháp tuyến), tuyết ở đỉnh.
 *   - Chống lặp: cỏ lấy hai mẫu khác tần số/góc xoay trộn theo nhiễu; cộng nhiễu vĩ mô; xa thì chuyển sang mẫu thưa.
 *   - Pháp tuyến: gộp thành một vector lệch ở không gian thế giới (UDN), một lần transformNormalToView.
 * Số mẫu texture theo preset: Cao 8 albedo + 5 pháp tuyến; Vừa 5 + 2; Thấp 3 + 0 (độ nhám cố định).
 * Mọi lớp nằm trong 2 texture mảng nên chỉ tốn 2 slot texture (+ 1 mặt nạ).
 */
/** Node TSL: kiểu của three/tsl không phơi bày toán tử trên `Node` trần, dùng any cho gọn. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

export type GroundLevel = 'low' | 'medium' | 'high';

const groundParams = {
  /** Độ sáng của albedo texture so với bảng màu cũ. */
  gain: uniform(1.5),
  normalStrength: uniform(0.85),
};

/** Đỉnh cao: đá xám phủ rêu và cỏ khô (art bible cấm tuyết), không phải màu trắng. */
const SNOW = vec3(0.26, 0.27, 0.22);
const TOMB_TINT = vec3(0.6, 0.58, 0.7);

/** Phá lặp texture (DV-3K, hẻm Xích Tẫn Khích): thêm mẫu thứ hai xoay + tỉ lệ khác, trộn theo nhiễu thế giới, và nhân sáng tối quy mô lớn. Terrain bật trước khi dựng shader. */
let breakTiling = false;
export function setGroundTileBreak(on: boolean): void {
  breakTiling = on;
}

/**
 * Vân đá sơn thủy + tuyết chỉ ở đỉnh rất cao (MAP-1): chỉ bật cho Lạc Kiếm/Vân Lam (đã duyệt ảnh); các level khác giữ nguyên
 * ngưỡng tuyết 252–312 m và không có vân. Terrain bật trước khi dựng shader.
 */
let strata = false;
export function setGroundStrata(on: boolean): void {
  strata = on;
}

/** Bí cảnh không có tuyết (Kiếm Trủng, DUN-1): đỉnh núi xa giữ màu đá thay vì phủ SNOW sáng. Terrain bật trước khi dựng shader. */
let noSnow = false;
export function setGroundNoSnow(on: boolean): void {
  noSnow = on;
}

/**
 * Vân vách sa thạch xám-đỏ (MAP-2 Đoạn Mạch): tầng ngang theo độ cao + khe dọc như `strata`, nhưng không đổi ngưỡng tuyết
 * và ngả xám-đỏ thay vì lam nhạt. Tắt ở level khác.
 */
/** Tỉ lệ texture vách (m mỗi ô, mặc định 11) và chế độ vách mềm (Thiên Lộ Giới, TN-7): phối thêm lớp tỉ lệ lớn, macro và gradient sáng dần lên đỉnh. */
let cliffUv = 11;
let cliffSoft = false;
export function setGroundCliff(uv: number, soft: boolean): void {
  cliffUv = uv;
  cliffSoft = soft;
}
let redStrata = false;
/** Hai màu vách (tối ↔ sáng) và vỉa nứt tùy chọn của vân vách theo nhiễu (không dùng khung texture 11 m, nên không ra ô caro). */
interface CliffTones {
  lo: [number, number, number];
  hi: [number, number, number];
  /** Màu vỉa chạy theo khe nứt (vàng kim Thiên Khuyết); bỏ trống = khe chỉ tối đi. */
  vein?: [number, number, number];
  /** Vách dựng từ khối đá xếp lệch (cột khối ngẫu nhiên × tầng lệch nhau, khe giữa các khối): hết dải ngang lặp (Thiên Khuyết, POLISH-1). */
  blocks?: boolean;
  /** Vách dùng texture đá PBR thật (CC0, lớp `cliff` của bộ texture level, triplanar) nhuộm sắc đỏ nâu thay cho nhiễu tạo màu: hết sọc ngang (Đoạn Mạch, POLISH-1). */
  pbr?: boolean;
  /** Vách triplanar thuần theo toạ độ thế giới, hai tỉ lệ trộn bằng nhiễu, không dùng toạ độ suy từ pháp tuyến (hết răng cưa/ô lặp trên vách gồ ghề; Vấn Đỉnh, TN-3). */
  tri?: boolean;
  /** Tâm vùng chơi (x, z): vách `tri` chọn mặt chiếu theo vị trí so với tâm (không theo pháp tuyến nhiễu), nên góc vách không còn hoa văn chữ V. */
  center?: [number, number];
  /** Vấn Đỉnh hai mặt: bảng màu vách (tối ↔ sáng) của mặt Dương (phía đông tâm); `lo`/`hi` là của mặt Âm. Bật cả nền thủ tục hai mặt (Âm: đá phiến nứt, Dương: đất nung nứt khô + cỏ khô). */
  duong?: { lo: [number, number, number]; hi: [number, number, number] };
}
const RED_TONES: CliffTones = { lo: [0.4, 0.2, 0.16], hi: [0.58, 0.52, 0.5] };
let cliffTones: CliffTones = RED_TONES;
export function setGroundRedStrata(on: boolean, tones: CliffTones = RED_TONES): void {
  redStrata = on;
  cliffTones = tones;
}

/** Gắn node shader vào `mat`. Gọi lại khi đổi preset (đổi cấu hình, `needsUpdate`). */
export function applyGroundShader(mat: THREE.MeshStandardNodeMaterial, tex: GroundTextures, level: GroundLevel): void {
  const hi = level === 'high';
  const lo = level === 'low';
  const p = positionWorld.xz;
  const A = (uv: Node, layer: Node | number) => texture(tex.albedo, uv).depth(typeof layer === 'number' ? int(layer) : layer).rgb;
  const N = (uv: Node, layer: Node | number) => texture(tex.normal, uv).depth(typeof layer === 'number' ? int(layer) : layer);
  /** Pháp tuyến cục bộ (đã giải mã) → vector lệch ở không gian thế giới cho mặt chiếu xz / xy / zy. */
  const offXZ = (t: Node) => vec3(t.x.mul(2).sub(1), 0, float(1).sub(t.y.mul(2)));
  const offXY = (t: Node) => vec3(t.x.mul(2).sub(1), t.y.mul(2).sub(1), 0);
  const offZY = (t: Node) => vec3(0, t.y.mul(2).sub(1), t.x.mul(2).sub(1));

  const nGeo = normalize(normalGeometry);
  const slope = float(1).sub(nGeo.y);
  const h = positionWorld.y;
  const dist = positionView.length();
  const ndv = dot(normalize(positionWorld.sub(cameraPosition)), nGeo).abs();
  const vc = attribute('color', 'vec3');
  const bio = attribute('biome', 'vec4'); // x rừng, y đất khô, z đất chết Kiếm Trủng
  const mask = texture(tex.mask, p.div(WORLD_SIZE));
  const macro = mask.a;
  const noise2 = texture(tex.mask, p.mul(0.0043)).a;

  // ----- trọng số -----
  // Sân lát đá chỉ nằm trên mặt gần phẳng: sườn dốc quanh sân lát chiếu từ trên xuống bị kéo giãn thành sọc kẻ ô khi nhìn
  // lướt (P2-E4), nên mặt nạ lát đá tắt dần theo độ dốc và để đá núi/cỏ lo phần sườn.
  const pavRaw = mask.g.mul(float(1).sub(smoothstep(0.05, 0.14, slope)));
  // Bệ cổng bí cảnh Vân Lam (POLISH-1): lát đá không phủ đều như thảm mà vỡ thành mảng theo nhiễu (rìa lởm chởm, đứt đoạn, cỏ lấn vào).
  const portalK = strata ? smoothstep(48, 34, p.sub(vec2(2048, 1708)).length()) : float(0);
  const pavBreak = smoothstep(
    0.4,
    0.56,
    texture(tex.mask, p.mul(0.0075).add(0.13))
      .a.mul(0.7)
      .add(texture(tex.mask, p.mul(0.021).add(0.71)).a.mul(0.3)),
  );
  // vỡ mảng chỉ ở rìa (r > 16 m): lõi quanh cổng lát liền, nếu không cả vòng thành lốm đốm
  const pav = pavRaw.mul(mix(float(1), pavBreak, portalK.mul(smoothstep(16, 27, p.sub(vec2(2048, 1708)).length()))));
  const rockW = max(smoothstep(0.1, 0.26, slope), smoothstep(175, 235, h).mul(0.65)).mul(float(1).sub(pav));
  const cliffW = smoothstep(0.3, 0.46, slope);
  // Tuyết chỉ ở đỉnh rất cao (MAP-1): núi gần không còn phủ trắng phẳng.
  const snowW = (strata ? smoothstep(340, 420, h) : smoothstep(252, 312, h)).mul(float(1).sub(smoothstep(0.3, 0.42, slope)));
  const pathD = mask.r.add(noise2.sub(0.5).mul(0.1));
  const pathW = smoothstep(0.44, 0.54, pathD).mul(float(1).sub(rockW));
  const pathEdge = smoothstep(0.3, 0.46, pathD);
  const sand = mask.b;
  const spW = clamp(max(max(pathW, pav), sand), 0, 1);
  const spLayer = select(pav.greaterThan(0.5), int(L.paving), select(sand.greaterThan(0.5), int(L.sand), int(L.gravel)));
  const spScale = select(pav.greaterThan(0.5), float(2.6), select(sand.greaterThan(0.5), float(4), float(2.4)));
  const wetEdge = pathEdge.mul(float(1).sub(spW));

  // Cỏ / rừng / đất khô: Cao trộn 3 mẫu, Vừa/Thấp chọn lớp trội (ranh giới bị nhiễu làm lệch cho tự nhiên).
  const pick = bio.x.add(noise2.sub(0.5).mul(0.5));
  const baseLayer = select(
    pick.greaterThan(0.5),
    int(L.forest),
    select(bio.y.add(noise2.sub(0.5).mul(0.4)).greaterThan(0.5), int(L.dirt), int(L.grass)),
  );
  const baseScale = select(pick.greaterThan(0.5), float(5.5), float(6));

  // ----- albedo -----
  let base: Node;
  let baseUvA = p.div(6);
  if (hi) {
    const ca = cos(0.9);
    const sa = sin(0.9);
    const pr = vec2(p.x.mul(ca).sub(p.y.mul(sa)), p.x.mul(sa).add(p.y.mul(ca)));
    const farK = smoothstep(35, 130, dist);
    const mixK = clamp(smoothstep(0.3, 0.7, noise2).mul(0.55).add(farK.mul(0.5)), 0, 1);
    const grass = mix(A(baseUvA, L.grass), A(pr.div(26).add(0.37), L.grass), mixK);
    const forest = A(p.div(5.5), L.forest);
    const dirt = A(p.div(5), L.dirt);
    base = mix(mix(grass, forest, bio.x), dirt, bio.y.mul(0.85));
  } else {
    baseUvA = p.div(baseScale);
    base = A(baseUvA, baseLayer);
  }
  if (breakTiling) {
    // Hai tỉ lệ + xoay ~0,9 rad (không thẳng hàng lưới 6 m), trộn theo nhiễu thế giới và khoảng cách; thêm vệt sáng tối ~230 m và ~40 m.
    const ca2 = cos(0.9);
    const sa2 = sin(0.9);
    const pr2 = vec2(p.x.mul(ca2).sub(p.y.mul(sa2)), p.x.mul(sa2).add(p.y.mul(ca2)));
    const second = A(pr2.div(19).add(0.37), hi ? L.grass : baseLayer);
    const k2 = clamp(smoothstep(0.25, 0.75, noise2).mul(0.5).add(0.25), 0, 1);
    base = mix(base, second, k2);
    const big = texture(tex.mask, p.mul(0.0043).add(0.31)).a;
    const mid = texture(tex.mask, p.mul(0.021).add(0.57)).a;
    base = base.mul(float(0.72).add(big.mul(0.5)).add(mid.sub(0.5).mul(0.22)));
  }
  // Sân lát đá có mạch vữa tương phản cao: từ ~20 m hoặc khi nhìn lướt thì hòa về màu đỉnh lưới, nếu không sinh vân ô/sọc kẻ ô (P2-E4).
  const pavFar = max(smoothstep(20, 75, dist), smoothstep(0.35, 0.08, ndv))
    .mul(0.88)
    .mul(step(0.5, pav));
  const special = mix(A(p.div(spScale), spLayer), vc.mul(0.7), pavFar);
  const hue = mix(vec3(1), vc.div(luminance(vc).max(0.04)), float(0.6).sub(spW.mul(0.5)));
  const dirtEdge = hi ? A(p.div(5), L.dirt) : base.mul(0.85);
  let col: Node = mix(base, dirtEdge.mul(0.9), wetEdge.mul(0.8));
  col = mix(col, special, spW);
  if (strata) {
    // Phiến đá lớn có viền: lưới ô ~3,4 m méo theo nhiễu; mỗi phiến một sắc, mạch tối có rêu, vài phiến sứt mép; chỉ ở bệ cổng.
    const warp = texture(tex.mask, p.mul(0.0045)).a.sub(0.5).mul(0.45); // mặt nạ phủ 4096 m: nhân 0,0045 ≈ vân ~15 m (bản trước 0,06 → nhiễu từng điểm ảnh)
    const q = p.div(3.4).add(warp);
    const cell = floor(q);
    const f = fract(q);
    const hsh = fract(sin(dot(cell, vec2(12.9898, 78.233))).mul(43758.5453));
    const jointW = float(0.07).add(hsh.mul(0.05));
    const joint = max(smoothstep(jointW, jointW.mul(0.45), f.x), smoothstep(jointW, jointW.mul(0.45), f.y))
      .max(smoothstep(float(1).sub(jointW), float(1).sub(jointW.mul(0.45)), f.x))
      .max(smoothstep(float(1).sub(jointW), float(1).sub(jointW.mul(0.45)), f.y));
    // Phiến đá xanh xám: màu phẳng theo từng phiến (xen kẽ sáng/tối kiểu bàn cờ lệch + mỗi phiến một độ), giữ chút chi tiết từ texture lát
    const checker = step(0.5, fract(cell.x.add(cell.y).mul(0.5)));
    const stone = mix(vec3(0.2, 0.23, 0.24), vec3(0.42, 0.45, 0.44), hsh.mul(0.6).add(checker.mul(0.4)));
    const detail = float(0.82).add(luminance(col).mul(0.5));
    const slabTop = stone.mul(detail);
    const mossMix = joint.mul(float(0.4).add(hsh.mul(0.5)));
    // rãnh: trộn đất tối và rêu sẫm (50/50 theo từng ô), không còn xanh cỏ sáng đều như kẻ lưới; vài phiến sứt mép (rãnh rộng ra theo nhiễu mịn)
    const grout = mix(vec3(0.13, 0.095, 0.065), vec3(0.07, 0.115, 0.05), step(0.5, fract(hsh.mul(7.31))));
    const chip = smoothstep(0.55, 0.8, texture(tex.mask, p.mul(0.09)).a).mul(0.35);
    const jointC = clamp(joint.add(chip.mul(joint)), 0, 1);
    const slabMoss = mix(slabTop.mul(float(1).sub(jointC.mul(0.35))), grout.mul(float(0.8).add(hsh.mul(0.5))), jointC.mul(0.85));
    void mossMix;
    // vùng phiến theo bán kính quanh cổng (không phụ thuộc mặt nạ): lõi r ≤ 24 lát liền, rìa 24–31 vỡ theo nhiễu
    const dPortal = p.sub(vec2(2048, 1708)).length();
    const slabArea = smoothstep(31, 25, dPortal).mul(mix(float(1), pavBreak, smoothstep(22, 28, dPortal)));
    col = mix(col, slabMoss, step(0.5, slabArea).mul(portalK));
  }
  col = col.mul(hue).mul(float(0.84).add(macro.mul(0.32)));
  col = mix(col, col.mul(TOMB_TINT), bio.z);

  const rock = A(p.div(9), L.rock);
  // Vách đá: chiếu theo hai mặt phẳng đứng, trọng số theo |nx|, |nz|.
  // Vách `tri` (Vấn Đỉnh): vùng trộn hai mặt chiếu hẹp lại (mũ 9) để khỏi thành hoa văn chữ V nơi vách xoay chéo.
  const wPow = redStrata && cliffTones.tri ? 9 : 3;
  const wx = nGeo.x.abs().pow(wPow);
  const wz = nGeo.z.abs().pow(wPow);
  const wsum = wx.add(wz).max(0.0001);
  const uvXY = vec2(positionWorld.x, positionWorld.y.negate()).div(cliffUv);
  const uvZY = vec2(positionWorld.z, positionWorld.y.negate()).div(cliffUv);
  let cliff: Node;
  if (lo) cliff = rock;
  else cliff = mix(A(uvZY, L.cliff), A(uvXY, L.cliff), wz.div(wsum));
  if (cliffSoft && !lo) {
    // Vách rất cao (~140 m): phối thêm một lớp tỉ lệ lớn hơn (×2,7) để phá lặp ô, nhân macro tỉ lệ lớn (mảng sáng/tối) và gradient sáng dần lên đỉnh.
    const c2 = mix(A(uvZY.div(2.7).add(0.31), L.cliff), A(uvXY.div(2.7).add(0.31), L.cliff), wz.div(wsum));
    const cm = texture(tex.mask, positionWorld.xz.mul(0.0061).add(positionWorld.y.mul(0.0043))).a;
    const grade = mix(float(1.15), float(1.9), smoothstep(8, 78, positionWorld.y));
    // nhuộm ấm nhẹ (kéo khỏi xanh lam của ánh sáng môi trường), nhân macro + gradient
    cliff = mix(cliff, c2, 0.4)
      .mul(grade)
      .mul(float(0.75).add(cm.mul(0.6)))
      .mul(vec3(1.12, 1.0, 0.86));
  }
  const rockCol = mix(rock, rock.mul(TOMB_TINT.mul(1.15)), bio.z);
  col = mix(col, rockCol.mul(float(0.9).add(macro.mul(0.2))), rockW);
  col = mix(col, cliff.mul(float(0.9).add(macro.mul(0.2))), cliffW);
  if (!lo) {
    // Camera chéo (Thiên Nhãn P2b): xem isoDetail.ts. Chỉ trên đất bằng (không vách/đá/tuyết), tắt dần theo khoảng cách.
    col = isoTerrainDetail(col, {
      p,
      dist,
      flat: float(1).sub(max(max(rockW, cliffW), snowW)),
      soil: float(1).sub(spW.mul(0.7)),
      forest: bio.x,
      dry: bio.y,
      path: spW,
      wet: wetEdge,
      paving: pav,
    });
  }
  col = col.mul(groundParams.gain);
  col = mix(col, SNOW.mul(float(0.85).add(macro.mul(0.3))), noSnow ? float(0) : snowW.mul(0.9));
  // Xa thì texture nhỏ hơn điểm ảnh (mipmap mảng texture không đủ) sinh vân ô vuông: hòa dần về màu đỉnh lưới.
  col = mix(col, vc.mul(0.62), smoothstep(70, 230, dist).mul(0.9));
  // Nhìn lướt (góc giữa tia nhìn và mặt gần song song): texture bị nén mạnh theo một phương nên sinh vân ô lưới, hòa dần về
  // màu đỉnh lưới như ở xa. Mặt phẳng nhìn từ camera thường (ndv > 0,3) không bị ảnh hưởng.
  col = mix(col, vc.mul(0.62), smoothstep(0.3, 0.06, ndv).mul(0.55));
  // Vân đá sơn thủy (MAP-1), tính theo điểm ảnh nên không phụ thuộc độ thô của lưới xa: tầng ngang theo độ cao + khe dọc theo
  // nhiễu kéo dài; vách và đá lộ ngả lam nhạt dần theo độ cao. Áp sau khi hòa về màu đỉnh lưới ở xa.
  if (strata || (redStrata && !cliffTones.pbr && !cliffTones.tri)) {
    // Sườn dốc phủ cỏ cũng có vân ở Vân Lam (núi xa không còn mượt): trọng số theo độ dốc; vách sa thạch MAP-2 giữ như cũ.
    const base = max(cliffW, rockW.mul(0.7));
    const rockish = strata ? max(base, smoothstep(0.1, 0.3, slope).mul(0.6)) : base;
    if (strata) {
      // Nhiễu vĩ mô theo khoảng cách (xa thì chỉ còn màu đỉnh lưới, nên thêm biến thiên để không mịn đều).
      const farK = smoothstep(60, 380, dist).mul(0.9);
      const macroA = texture(tex.mask, p.mul(0.0098)).a;
      const macroB = texture(tex.mask, p.mul(0.0023).add(0.37)).a;
      col = col.mul(mix(float(1), float(0.72).add(macroA.mul(0.34)).add(macroB.sub(0.5).mul(0.3)), farK));
    }
    const band = sin(h.mul(0.13).add(macro.mul(5)).add(noise2.mul(4)))
      .mul(0.5)
      .add(0.5);
    const fissure = texture(tex.mask, vec2(p.x.add(p.y).mul(0.0011), h.mul(0.00018))).a;
    const strataMul = float(0.7).add(band.mul(0.5)).sub(float(1).sub(fissure).mul(0.45));
    if (redStrata) {
      // Vách sa thạch (MAP-2): không dùng khung texture 11 m (lặp thành ô caro); dựng vân từ nhiễu theo tọa độ dọc vách `u` (tiếp tuyến
      // ngang của mặt) và độ cao: tầng ngang méo theo nhiễu, hai thang đỏ gạch ↔ xám đá, khe nứt dọc, gờ đá (mép sáng, bóng đổ dưới).
      const tan = normalize(vec2(nGeo.z.negate(), nGeo.x).add(vec2(0.0001, 0)));
      const u = dot(p, tan);
      const nA = texture(tex.mask, vec2(u.mul(0.0057), h.mul(0.0019))).a; // mảng lớn, kéo dài theo chiều dọc
      const nB = texture(tex.mask, vec2(u.mul(0.017).add(0.4), h.mul(0.009))).a;
      const nC = texture(tex.mask, vec2(u.mul(0.061), h.mul(0.037))).a; // hạt mịn
      const bandA = sin(h.mul(0.045).add(nA.mul(5)))
        .mul(0.5)
        .add(0.5);
      const bandB = sin(h.mul(0.16).add(nA.mul(6)))
        .mul(0.5)
        .add(0.5);
      // vệt loang dọc (nước chảy lâu năm): kéo dài theo chiều cao, phá nhịp tầng ngang
      const streak = texture(tex.mask, vec2(u.mul(0.043).add(0.17), h.mul(0.0014))).a;
      const mixTone = smoothstep(0.25, 0.75, bandA.mul(0.25).add(nB.mul(0.45)).add(streak.mul(0.3)));
      let tone: Node = mix(vec3(...cliffTones.lo), vec3(...cliffTones.hi), mixTone);
      tone = tone
        .mul(float(0.72).add(nC.mul(0.56)))
        .mul(float(0.93).add(bandB.mul(0.1)))
        .mul(float(0.66).add(streak.mul(0.7)));
      // khe nứt dọc: đường tối mảnh nơi nA gần 0,5
      const crack = smoothstep(0.045, 0.0, nA.sub(0.5).abs()).mul(smoothstep(0.2, 0.8, nB));
      tone = tone.mul(float(1).sub(crack.mul(0.6)));
      if (cliffTones.vein) tone = mix(tone, vec3(...cliffTones.vein), crack.mul(0.85));
      if (cliffTones.blocks) {
        // Khối đá xếp lệch, hai cỡ (khối lớn ~60–120 m + khối nhỏ ~20–40 m): cột theo tọa độ dọc vách (méo mạnh bởi nhiễu), bề cao tầng mỗi cột một kiểu,
        // màu từng khối khác nhau, khe tối quanh khối, mép trên khối sáng, vài khối chạy vỉa vàng ở khe.
        const layer = (su: number, wob: number, sh: number, k: number) => {
          const ub = u
            .mul(su)
            .add(nA.mul(wob))
            .add(nB.mul(wob * 0.35));
          const ci = floor(ub);
          const cf = fract(ub);
          const hb = fract(sin(ci.mul(127.1).add(k * 311.7)).mul(43758.5453));
          const hy = h
            .mul(float(sh).mul(float(0.65).add(hb.mul(0.8))))
            .add(hb.mul(9))
            .add(nB.mul(1.2));
          const ri = floor(hy);
          const rf = fract(hy);
          const hr = fract(sin(ri.mul(91.7).add(ci.mul(17.3)).add(k)).mul(24634.6345));
          const gw = float(0.03).add(hb.mul(0.05));
          const gap = max(smoothstep(gw, 0, cf), smoothstep(float(1).sub(gw), 1, cf)).max(smoothstep(0.07, 0, rf));
          return { hb, rf, hr, gap };
        };
        const big = layer(0.0062, 2.4, 0.026, 1);
        const small = layer(0.022, 1.6, 0.055, 2);
        let blk: Node = mix(vec3(...cliffTones.lo), vec3(...cliffTones.hi), big.hr.mul(0.7).add(small.hr.mul(0.3)).mul(0.85).add(0.07));
        blk = blk
          .mul(mix(vec3(1.18, 0.96, 0.78), vec3(0.82, 0.9, 1.1), big.hb))
          .mul(float(0.7).add(big.hr.mul(0.6)))
          .mul(float(0.86).add(small.hb.mul(0.2)))
          .mul(float(0.78).add(nC.mul(0.44)));
        // xa thì khe mờ dần (đường kẻ thẳng dài thành ô lưới): chỉ còn mảng màu
        const gap = max(big.gap.mul(0.85), small.gap.mul(0.45)).mul(float(1).sub(smoothstep(120, 650, dist).mul(0.75)));
        tone = mix(tone, blk, 0.82);
        tone = tone
          .mul(float(1).sub(gap.mul(0.7)))
          .mul(float(1).add(smoothstep(0.86, 1, big.rf).mul(0.26)))
          .mul(float(1).add(smoothstep(0.88, 1, small.rf).mul(0.1)));
        if (cliffTones.vein) tone = mix(tone, vec3(...cliffTones.vein), big.gap.mul(smoothstep(0.6, 0.92, big.hb)).mul(0.32));
      }
      // gờ đá: mép trên mỗi tầng sáng, ngay dưới tối
      // chỉ ở vài tầng (nA cao): gờ không chạy đều khắp vách
      const ledgeOn = smoothstep(0.35, 0.6, nA);
      tone = tone
        .mul(float(1).add(smoothstep(0.92, 1, bandB).mul(0.2).mul(ledgeOn)))
        .mul(float(1).sub(smoothstep(0.12, 0, bandB).mul(0.3).mul(ledgeOn)));
      // giữ chút chi tiết của texture gốc nhưng không để nó lộ khung lặp
      const detail = float(0.7).add(luminance(col).mul(0.5));
      col = mix(col, tone.mul(detail).mul(1.05), rockish.mul(0.92));
    } else {
      col = col.mul(mix(float(1), strataMul, rockish));
      col = mix(col, col.mul(vec3(0.82, 0.94, 1.1)), rockish.mul(smoothstep(140, 300, h)).mul(0.6));
    }
  }
  if (redStrata && cliffTones.pbr) {
    // Vách đá thật: giữ màu texture `cliff` triplanar đã trộn ở trên (cliffW/rockW), chỉ nhuộm sắc đỏ nâu theo độ sáng, phá lặp bằng mảng lớn + vỉa theo độ cao,
    // rêu/đất vàng đọng ở gờ ngang (mặt ít dốc hơn) và vệt nước chảy sẫm theo toạ độ ngang.
    const rockish2 = max(cliffW, rockW.mul(0.7));
    // hai lớp đá triplanar ở hai tỉ lệ khác nhau (11 m đã có trong `col`; thêm lớp `rock` 29 m xoay trục) → hết lặp ô nhỏ nhìn từ xa
    const uvXYb = vec2(positionWorld.x.mul(0.8).add(positionWorld.z.mul(0.6)), positionWorld.y.negate()).div(29);
    const uvZYb = vec2(positionWorld.z.mul(0.8).sub(positionWorld.x.mul(0.6)), positionWorld.y.negate()).div(29);
    // chỉ dùng lớp `cliff` (đá nâu có vân, khe nứt thật), không trộn lớp `rock` (đất nứt màu cát)
    const bigRock = mix(A(uvZYb, L.cliff), A(uvXYb, L.cliff), wz.div(wsum));
    const near = mix(A(uvZY, L.cliff), A(uvXY, L.cliff), wz.div(wsum));
    const mixed = mix(near, bigRock, smoothstep(10, 90, dist).mul(0.5).add(0.35));
    const lum2 = luminance(mixed);
    const macroA = texture(tex.mask, p.mul(0.0042).add(0.21)).a;
    const macroB = texture(tex.mask, p.mul(0.019).add(0.63)).a;
    const hs = texture(tex.mask, vec2(p.x.add(p.y).mul(0.0035), h.mul(0.0032))).a; // mảng theo độ cao: tầng đá sáng/tối KHÔNG đều
    // giữ màu thật của texture đá, chỉ đẩy sắc về đỏ gạch + thêm mảng sáng/tối lớn và tầng theo độ cao
    const warm = vec3(1.28, 0.82, 0.66);
    let rockCol: Node = mixed.mul(warm).mul(float(0.85).add(lum2.mul(0.5)));
    rockCol = rockCol.mul(float(0.62).add(macroA.mul(0.55)).add(hs.sub(0.5).mul(0.55))).mul(float(0.78).add(macroB.mul(0.46)));
    const ledge = smoothstep(0.62, 0.34, slope).mul(smoothstep(0.1, 0.3, slope)); // gờ ngang giữa vách
    const mossN = smoothstep(0.5, 0.72, texture(tex.mask, p.mul(0.03).add(0.4)).a);
    rockCol = mix(rockCol, vec3(0.42, 0.36, 0.16), ledge.mul(mossN).mul(0.55));
    rockCol = mix(rockCol, vec3(0.2, 0.28, 0.12), ledge.mul(mossN.mul(smoothstep(250, 90, h))).mul(0.4));
    const streakN = texture(tex.mask, vec2(p.x.add(p.y).mul(0.017), h.mul(0.0011))).a;
    rockCol = rockCol.mul(float(1).sub(smoothstep(0.5, 0.78, streakN).mul(0.45)));
    // khe nứt dọc tối (đường mảnh theo toạ độ ngang)
    const crackN = smoothstep(
      0.03,
      0.0,
      texture(tex.mask, vec2(p.x.add(p.y).mul(0.0061), h.mul(0.0009)))
        .a.sub(0.5)
        .abs(),
    );
    rockCol = rockCol.mul(float(1).sub(crackN.mul(0.55)));
    col = mix(col, rockCol, rockish2.mul(0.97));
  }
  if (redStrata && cliffTones.tri) {
    // Vách Vấn Đỉnh: texture đá `cliff` triplanar ở BA tỉ lệ (11 m có sẵn trong `col`, 29 m và 83 m xoay trục), trộn theo nhiễu thế giới (không theo
    // khoảng cách) nên không lộ khung lặp; sắc theo `lo`/`hi` của level (mood hai mặt tự ngả lam hoặc vàng). Mọi toạ độ là toạ độ thế giới, không dùng
    // tiếp tuyến suy từ pháp tuyến nên vách gồ ghề không còn răng cưa.
    const cen = cliffTones.center ?? [WORLD_SIZE / 2, WORLD_SIZE / 2];
    if (cliffTones.duong && !lo) {
      // Nền hai mặt (TN-3): Âm = đá phiến tím lạnh vỡ thành tấm (Voronoi) có khe nứt + vết sương đọng; Dương = đất nung vàng cam nứt khô thành mảnh + cỏ khô.
      // Toàn bộ theo toạ độ thế giới (không phụ thuộc UV), khe mờ dần theo khoảng cách để khỏi vân ô ở xa.
      const tF = smoothstep(-40, 40, positionWorld.x.sub(cen[0]));
      const farF = smoothstep(45, 190, dist);
      const jointK = float(1).sub(farF.mul(0.8));
      // Băm không dùng sin (sin với toạ độ ô lớn mất độ chính xác fp32 → vệt lưới dài): dạng Hoskins hash12.
      const hsh2 = (c: Node, k: number) => {
        const p3 = fract(vec3(c.x.add(k * 7.13), c.y.add(k * 3.71), c.x.add(k * 7.13)).mul(0.1031));
        const q = p3.add(dot(p3, p3.yzx.add(33.33)));
        return fract(q.x.add(q.y).mul(q.z));
      };
      const broad = texture(tex.mask, p.mul(0.0067).add(0.21)).a;
      const mid = texture(tex.mask, p.mul(0.019).add(0.77)).a;
      // Voronoi 3×3: f1 = khoảng cách tới tâm gần nhất, f2 − f1 = khoảng cách tới cạnh; id = số ngẫu nhiên của mảnh
      const vor = (q: Node, k: number) => {
        const ip = floor(q);
        const fp = fract(q);
        let f1: Node = float(8);
        let f2: Node = float(8);
        let id: Node = float(0);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const g = vec2(dx, dy);
            const cell = ip.add(g);
            const o = vec2(hsh2(cell, k), hsh2(cell, k + 17));
            const d = g.add(o.mul(0.9)).sub(fp).length();
            id = select(d.lessThan(f1), hsh2(cell, k + 31), id);
            f2 = min(max(d, f1), f2);
            f1 = min(f1, d);
          }
        return { f1, edge: f2.sub(f1), id };
      };
      const ra = vec2(p.x.mul(0.62).add(p.y.mul(0.78)), p.y.mul(0.62).sub(p.x.mul(0.78)));
      // Tỉ lệ ô CỐ ĐỊNH mỗi bên Giới Tuyến (đổi liên tục theo x làm ô bị kéo giãn thành sọc toả tia); chỉ màu trộn dần qua vùng chuyển.
      const east = step(0, positionWorld.x.sub(cen[0]));
      const s1 = mix(float(5.2), float(2.6), east);
      const s2 = mix(float(15), float(8.5), east);
      const v1 = vor(p.div(s1), 1);
      const v2 = vor(ra.div(s2).add(3.7), 5);
      const c2 = smoothstep(0.035, 0.0, v2.edge).mul(jointK);
      // --- Âm: tấm đá phiến, kích thước tấm biến thiên (tấm nhỏ lẫn tấm lớn), mảng màu macro, viền tấm lẫn bụi, tối hơn
      const macroA = texture(tex.mask, p.mul(0.0031).add(0.57)).a;
      const merge = smoothstep(0.1, 0.5, v1.id); // tấm có id thấp bỏ viền ⇒ nhập với tấm bên cạnh thành tấm lớn
      const widthA = float(0.03).add(v1.id.mul(0.07)); // bề rộng khe mỗi tấm một kiểu
      const c1a = smoothstep(widthA, 0.0, v1.edge).mul(jointK).mul(merge);
      let am: Node = mix(
        vec3(0.15, 0.14, 0.2),
        vec3(0.36, 0.34, 0.43),
        v1.id.mul(0.4).add(v2.id.mul(0.25)).add(mid.mul(0.15)).add(macroA.mul(0.35)),
      );
      am = am.mul(float(0.62).add(broad.mul(0.55)).add(macroA.sub(0.5).mul(0.5)));
      am = am.mul(float(1).sub(c1a.mul(0.6))).mul(float(1).sub(c2.mul(0.4)));
      // bụi/sương lẫn ở viền tấm và vệt lan: sáng xám lam nhạt, đậm hơn nơi nhiễu cao
      const dust = smoothstep(0.34, 0.04, v1.edge)
        .mul(float(0.25).add(mid.mul(0.5)))
        .mul(jointK);
      am = mix(am, vec3(0.42, 0.43, 0.52), dust.mul(0.4));
      const pool = smoothstep(0.52, 0.8, broad.mul(0.7).add(mid.mul(0.3)));
      am = mix(am, vec3(0.5, 0.55, 0.68), pool.mul(0.22));
      // --- Dương: đất nung nứt khô, nứt có bề rộng/độ sâu khác nhau (không đều), mảng macro sáng tối, mảnh phồng
      const widthD = float(0.025).add(v1.id.mul(0.075));
      const wob = hsh2(floor(p.div(0.9)), 33)
        .sub(0.5)
        .mul(0.05); // mép nứt lởm chởm
      const c1d = smoothstep(widthD.add(wob), 0.0, v1.edge)
        .mul(jointK)
        .mul(smoothstep(0.05, 0.3, v1.id.add(mid.mul(0.25))));
      let du: Node = mix(
        vec3(0.54, 0.29, 0.12),
        vec3(0.84, 0.5, 0.22),
        v1.id.mul(0.3).add(v2.id.mul(0.2)).add(mid.mul(0.2)).add(macroA.mul(0.3)),
      );
      du = du.mul(float(0.66).add(broad.mul(0.5)).add(macroA.sub(0.5).mul(0.5)));
      du = du.mul(float(1).add(smoothstep(0.55, 0.1, v1.f1).mul(0.12)));
      du = du.mul(float(1).sub(c1d.mul(0.55))).mul(float(1).sub(c2.mul(0.4)));
      du = mix(du, vec3(0.78, 0.62, 0.4), smoothstep(0.3, 0.05, v1.edge).mul(mid).mul(0.22).mul(jointK)); // bụi vàng ở mép nứt
      // cỏ khô: mảng theo nhiễu thấp tần, bên trong là cụm sợi (ô 0,8 m, tâm lệch ngẫu nhiên) màu rơm
      const grassBand = smoothstep(0.5, 0.74, texture(tex.mask, p.mul(0.0052).add(0.61)).a.mul(0.7).add(mid.mul(0.3)));
      const gq = p.div(0.8);
      const gc = floor(gq);
      const gj = vec2(hsh2(gc, 11), hsh2(gc, 12));
      const gd = fract(gq).sub(gj.mul(0.5).add(0.25)).length();
      const tuft = smoothstep(0.26, 0.1, gd).mul(step(0.3, hsh2(gc, 13)));
      const straw = mix(vec3(0.62, 0.5, 0.22), vec3(0.82, 0.7, 0.34), hsh2(gc, 14));
      du = mix(
        du,
        straw,
        tuft
          .mul(grassBand)
          .mul(float(1).sub(farF.mul(0.6)))
          .mul(0.8),
      );
      du = mix(du, vec3(0.6, 0.47, 0.22), grassBand.mul(0.18));
      const proc = mix(am, du, tF);
      // chút chi tiết texture gốc (nhân sáng) để nền không phẳng quá; xa thì về màu trung bình
      const det = float(0.8).add(luminance(col).mul(0.4));
      // mặt bậc phẳng của vách (cao hơn nền chơi ~96 m) không phải nền: nếu để nền thủ tục phủ lên, nắng chiếu ngang làm chúng sáng thành hàng lỗ thoi trắng ở góc vách
      const floorW = float(1)
        .sub(max(rockW, cliffW.mul(1.2)))
        .clamp(0, 1)
        .mul(float(1).sub(smoothstep(97, 108, h)));
      col = mix(col, proc.mul(mix(det, float(1), farF)), floorW.mul(0.94));
    }
    const rockish3 = max(max(cliffW, rockW.mul(0.7)), smoothstep(97, 108, h)); // trên mặt nền chơi: luôn là đá (kể cả mặt bậc phẳng)
    // Vách bắc/nam (|z − cz| lớn hơn) chiếu theo mặt XY, vách đông/tây chiếu theo ZY; chuyển trong ~100 m quanh đường chéo.
    const wXY = smoothstep(-50, 50, positionWorld.z.sub(cen[1]).abs().sub(positionWorld.x.sub(cen[0]).abs()));
    const mk = (k: number, rot: number) => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const ux = positionWorld.x.mul(c).add(positionWorld.z.mul(s));
      const uz = positionWorld.z.mul(c).sub(positionWorld.x.mul(s));
      const xy = vec2(ux, positionWorld.y.negate()).div(k);
      const zy = vec2(uz, positionWorld.y.negate()).div(k);
      return mix(A(zy, L.cliff), A(xy, L.cliff), wXY);
    };
    const t1 = mk(11, 0);
    const t2 = mk(29, 0.9);
    const t3 = mk(83, 2.1);
    const n1 = texture(tex.mask, p.mul(0.0061).add(0.17)).a;
    const n2 = texture(tex.mask, p.mul(0.0173).add(0.55)).a;
    const m12 = mix(t1, t2, smoothstep(0.25, 0.75, n1));
    const mixed3 = mix(m12, t3, smoothstep(0.35, 0.8, n2).mul(0.6));
    const lum3 = luminance(mixed3);
    const hband = texture(tex.mask, vec2(p.x.add(p.y).mul(0.0029), h.mul(0.0041))).a; // tầng sáng/tối theo độ cao, không đều
    let rock3: Node = mix(vec3(...cliffTones.lo), vec3(...cliffTones.hi), lum3.mul(0.9).add(hband.mul(0.5)).sub(0.1).clamp(0, 1));
    // Vân mịn của texture chỉ giữ ở gần: từ ~30 m tương phản hòa về mức trung bình (hết vân mịn lặp/răng cưa ở khoảng trung bình).
    const fineK = float(1).sub(smoothstep(28, 130, dist).mul(0.85));
    const texMul = mix(vec3(0.74), mixed3.mul(1.1).add(0.35), fineK);
    rock3 = rock3
      .mul(0.62)
      .mul(texMul)
      .mul(float(0.7).add(n1.mul(0.5)).add(hband.sub(0.5).mul(0.4)));
    if (cliffTones.duong) {
      const dTone = cliffTones.duong;
      const tD = smoothstep(-40, 40, positionWorld.x.sub(cen[0]));
      // Vách thủ tục riêng, toạ độ thế giới: hàng đá theo độ cao (méo bởi nhiễu), khối xếp lệch trong mỗi hàng, hai cỡ; khe và gờ mờ dần theo khoảng cách.
      const uc = mix(positionWorld.z, positionWorld.x, wXY);
      const w1 = texture(tex.mask, vec2(uc.mul(0.0047), h.mul(0.0031))).a;
      const w2 = texture(tex.mask, vec2(uc.mul(0.0151).add(0.3), h.mul(0.0097))).a;
      const hash = (v: Node, k: number) => fract(sin(v.mul(127.1).add(k * 311.7)).mul(43758.5453));
      const strat = (rowsPerM: number, wob: number, blocksPerM: number, k: number) => {
        // mỗi cột rộng (2 khối) lệch hàng một đoạn riêng ⇒ khối cao thấp khác nhau, hàng không chạy thẳng suốt vách
        const col0 = floor(uc.mul(blocksPerM * 0.5));
        const hy = h
          .mul(rowsPerM)
          .add(w1.mul(wob))
          .add(w2.mul(wob * 0.3))
          .add(hash(col0, k + 9).mul(2.4));
        const ri = floor(hy);
        const rf = fract(hy);
        const hr = hash(ri, k);
        const ub = uc.mul(blocksPerM).add(hr.mul(11)).add(w2.mul(0.9));
        const ci = floor(ub);
        const cf = fract(ub);
        const hb = hash(ci.add(ri.mul(13.1)), k + 5);
        const gw = float(0.035).add(hb.mul(0.04));
        const gap = max(smoothstep(gw, 0, cf), smoothstep(float(1).sub(gw), 1, cf)).max(smoothstep(0.07, 0, rf));
        return { hb, hr, rf, gap };
      };
      const big = strat(0.034, 2.6, 0.012, 1);
      const small = strat(0.115, 1.8, 0.05, 2);
      const lo = mix(vec3(...cliffTones.lo), vec3(...dTone.lo), tD);
      const hi = mix(vec3(...cliffTones.hi), vec3(...dTone.hi), tD);
      let proc: Node = mix(lo, hi, big.hb.mul(0.55).add(small.hb.mul(0.3)).add(big.hr.mul(0.15)).mul(0.9).add(0.05));
      proc = proc
        .mul(float(0.7).add(small.hr.mul(0.55)))
        .mul(float(0.7).add(big.hb.mul(0.5)))
        .mul(float(0.7).add(hband.mul(0.6)));
      // hạt mịn ~0,7 m trên mặt khối (đá sần), mờ dần theo khoảng cách
      const grain = hash(floor(vec2(uc.mul(1.4), h.mul(1.4))), 7);
      proc = proc.mul(
        float(1).add(
          grain
            .sub(0.5)
            .mul(0.3)
            .mul(float(1).sub(smoothstep(40, 200, dist))),
        ),
      );
      // mỗi khối: sáng trên, tối dưới (nổi khối) mạnh hơn
      proc = proc.mul(float(0.84).add(smoothstep(0, 1, big.rf).mul(0.3))).mul(float(0.88).add(smoothstep(0, 1, small.rf).mul(0.2)));
      const gapK = float(1).sub(smoothstep(70, 380, dist).mul(0.8));
      const gap = max(big.gap.mul(0.8), small.gap.mul(0.4)).mul(gapK);
      proc = proc
        .mul(float(1).sub(gap.mul(0.62)))
        .mul(float(1).add(smoothstep(0.86, 1, big.rf).mul(0.2).mul(gapK)))
        .mul(float(1).add(smoothstep(0.88, 1, small.rf).mul(0.08).mul(gapK)));
      // vệt nước/bụi chảy dọc vách
      const streak = texture(tex.mask, vec2(uc.mul(0.037).add(0.17), h.mul(0.0013))).a;
      proc = proc.mul(float(0.78).add(streak.mul(0.44)));
      // chút chi tiết texture gốc ở gần (đã giảm tương phản), còn lại là màu thủ tục
      proc = proc.mul(mix(vec3(1), texMul.div(0.74).mul(0.82).add(0.18), 0.6));
      rock3 = mix(rock3, proc, 0.88);
    }
    // gờ bậc thang: mặt ít dốc (đỉnh mỗi bậc) sáng và phủ bụi; chân dốc tối
    const tread = smoothstep(0.7, 0.4, slope).mul(smoothstep(0.1, 0.3, slope));
    rock3 = mix(rock3, rock3.mul(1.45).add(vec3(0.04, 0.035, 0.03)), tread.mul(0.8).mul(float(1).sub(smoothstep(30, 110, dist).mul(0.9)))); // xa thì bỏ viền sáng bậc (răng cưa ở góc vách)
    if (cliffTones.vein) {
      const crack = smoothstep(
        0.03,
        0.0,
        texture(tex.mask, vec2(p.x.add(p.y).mul(0.0047), h.mul(0.0011)))
          .a.sub(0.5)
          .abs(),
      );
      rock3 = mix(rock3, vec3(...cliffTones.vein), crack.mul(0.35));
    }
    col = mix(col, rock3, rockish3.mul(0.96));
  }
  mat.vertexColors = false;
  mat.colorNode = col;
  if (FLAGS.style === 'painted') {
    // Họa Cảnh: đất cỏ và đường mòn dùng đúng màu đất của painted-valley (bản dịch TSL đã đo khớp ở render/painted/lab), phát sáng không qua
    // đèn (không ACES/mood); đá, vách, tuyết, lát đá, mộ giữ shader cũ có đèn. Độ phủ cỏ ở đây là mặt nạ của chính địa hình (đường mòn = đất trần).
    const keep = max(max(max(rockW, cliffW), snowW), bio.z);
    // đá lát: bỏ vân ảnh chụp, chỉ giữ khe gạch (độ chói thấp) thành hai tông xám ngọc sáng/lam tối
    const pavW = pav.mul(float(1).sub(keep));
    const grassW = float(1).sub(keep).mul(float(1).sub(pav));
    const F = getPaintedRefField();
    const painted = groundColor(F, flatTextures(), positionWorld, nGeo, {
      m: vec4(0.25, float(1).sub(pathW), 0, 0.55),
      landNormal: nGeo,
      // vùng suối nhiều hoa hơn: hệ số chấm hoa lên tới 2,4 trong bán kính phẳng của suối, tắt dần tới ~0,75 bán kính ngoài (toạ độ SUOI của Vân Lam; level khác ở xa nên không ảnh hưởng)
      dab: mix(
        float(1),
        float(2.4),
        float(1).sub(smoothstep(SUOI.flatR, SUOI.outerR * 0.75, distance(positionWorld.xz, vec2(SUOI.x, SUOI.z)))),
      ),
    });
    const pavLit = paintedColor('paving', 0);
    const pavShade = paintedColor('paving', 1);
    const pavTone = mix(
      vec3(pavShade.r, pavShade.g, pavShade.b),
      vec3(pavLit.r, pavLit.g, pavLit.b),
      smoothstep(0.14, 0.26, dot(col.rgb, vec3(0.299, 0.587, 0.114))),
    );
    mat.colorNode = col.mul(keep);
    // + sương thấp sát đáy thung lũng (render/painted/lowMist.ts), chỉ trên phần đất tô phẳng
    const groundBase = painted.mul(grassW).add(pavTone.mul(pavW));
    mat.emissiveNode = withLowMist(F, groundBase, positionWorld.xz, positionWorld.y, grassW.add(pavW).min(1));
    // vũng sáng đèn đêm: ghi vào đích MRT `lamp`, pass cuối cộng SAU bước nhuộm trăng (giữ tông hổ phách)
    (mat as unknown as { mrtNode: unknown }).mrtNode = mrt({ lamp: vec4(lampPoolAt(positionWorld.xz), 1) });
  }

  // ----- pháp tuyến + độ nhám -----
  if (lo) {
    mat.roughnessNode = float(0.9);
    mat.normalNode = null;
  } else {
    const nb = N(baseUvA, baseLayer);
    const ns = N(p.div(spScale), spLayer);
    const nr = N(p.div(9), L.rock);
    let off: Node = mix(offXZ(nb), offXZ(ns), spW);
    const rockNrmK: Node = redStrata && cliffTones.tri ? float(1).sub(smoothstep(18, 80, dist).mul(0.95)) : float(1);
    off = mix(off, offXZ(nr).mul(rockNrmK), rockW);
    let rough: Node = mix(nb.z, ns.z, spW);
    rough = mix(rough, nr.z, rockW);
    // Vấn Đỉnh: pháp tuyến texture vách (11 m) từ xa thành vân dây thừng răng cưa dưới nắng chiếu ngang: mờ dần từ 18 m, gần như tắt ở 80 m.
    const cliffNrmK: Node = redStrata && cliffTones.tri ? float(1).sub(smoothstep(18, 80, dist).mul(0.95)) : float(1);
    if (hi) {
      const nc = mix(offZY(N(uvZY, L.cliff)), offXY(N(uvXY, L.cliff)), wz.div(wsum));
      off = mix(off, nc.mul(cliffNrmK), cliffW);
    } else {
      off = mix(off, offXZ(nr).mul(cliffNrmK), cliffW);
    }
    // Vấn Đỉnh: pháp tuyến đỉnh của vách bậc thang so le theo lưới ⇒ từ xa sáng tối thành răng cưa dọc; xa thì kéo về pháp tuyến danh nghĩa (hướng vào tâm vùng chơi).
    let nShade: Node = nGeo;
    if (redStrata && cliffTones.tri) {
      const c0 = cliffTones.center ?? [WORLD_SIZE / 2, WORLD_SIZE / 2];
      const wallN = normalize(vec3(float(c0[0]).sub(positionWorld.x), 0.55, float(c0[1]).sub(positionWorld.z)).mul(vec3(1, 1, 1)));
      nShade = normalize(mix(nGeo, wallN, max(cliffW, smoothstep(97, 108, h)).mul(smoothstep(20, 90, dist))));
    }
    const nrm = normalize(
      nShade.add(off.mul(groundParams.normalStrength).mul(redStrata && cliffTones.pbr ? mix(float(1), float(2.4), cliffW) : float(1))),
    );
    mat.normalNode = transformNormalToView(nrm);
    mat.roughnessNode = mix(clamp(rough, 0.35, 1), float(0.7), snowW);
  }
  mat.needsUpdate = true;
}

/** Gỡ shader texture, về màu đỉnh (chưa nạp xong texture, hoặc nạp lỗi). */
export function clearGroundShader(mat: THREE.MeshStandardNodeMaterial): void {
  mat.colorNode = null;
  mat.normalNode = null;
  mat.roughnessNode = null;
  mat.vertexColors = true;
  mat.needsUpdate = true;
}

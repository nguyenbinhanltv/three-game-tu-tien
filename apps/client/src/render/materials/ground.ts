import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  dot,
  clamp,
  cos,
  float,
  int,
  luminance,
  max,
  mix,
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
  floor,
  fract,
} from 'three/tsl';
import { WORLD_SIZE } from '@dtl/shared';
import { GROUND_LAYER as L, type GroundTextures } from '../../base/groundTextures';

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
let redStrata = false;
/** Hai màu vách (tối ↔ sáng) và vỉa nứt tùy chọn của vân vách theo nhiễu (không dùng khung texture 11 m, nên không ra ô caro). */
export interface CliffTones {
  lo: [number, number, number];
  hi: [number, number, number];
  /** Màu vỉa chạy theo khe nứt (vàng kim Thiên Khuyết); bỏ trống = khe chỉ tối đi. */
  vein?: [number, number, number];
  /** Vách dựng từ khối đá xếp lệch (cột khối ngẫu nhiên × tầng lệch nhau, khe giữa các khối): hết dải ngang lặp (Thiên Khuyết, POLISH-1). */
  blocks?: boolean;
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
  const pav = mask.g.mul(float(1).sub(smoothstep(0.05, 0.14, slope)));
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
  col = col.mul(hue).mul(float(0.84).add(macro.mul(0.32)));
  col = mix(col, col.mul(TOMB_TINT), bio.z);

  const rock = A(p.div(9), L.rock);
  // Vách đá: chiếu theo hai mặt phẳng đứng, trọng số theo |nx|, |nz|.
  const wx = nGeo.x.abs().pow(3);
  const wz = nGeo.z.abs().pow(3);
  const wsum = wx.add(wz).max(0.0001);
  const uvXY = vec2(positionWorld.x, positionWorld.y.negate()).div(11);
  const uvZY = vec2(positionWorld.z, positionWorld.y.negate()).div(11);
  let cliff: Node;
  if (lo) cliff = rock;
  else cliff = mix(A(uvZY, L.cliff), A(uvXY, L.cliff), wz.div(wsum));
  const rockCol = mix(rock, rock.mul(TOMB_TINT.mul(1.15)), bio.z);
  col = mix(col, rockCol.mul(float(0.9).add(macro.mul(0.2))), rockW);
  col = mix(col, cliff.mul(float(0.9).add(macro.mul(0.2))), cliffW);
  col = col.mul(groundParams.gain);
  col = mix(col, SNOW.mul(float(0.85).add(macro.mul(0.3))), noSnow ? float(0) : snowW.mul(0.9));
  // Xa thì texture nhỏ hơn điểm ảnh (mipmap mảng texture không đủ) sinh vân ô vuông: hòa dần về màu đỉnh lưới.
  col = mix(col, vc.mul(0.62), smoothstep(70, 230, dist).mul(0.9));
  // Nhìn lướt (góc giữa tia nhìn và mặt gần song song): texture bị nén mạnh theo một phương nên sinh vân ô lưới, hòa dần về
  // màu đỉnh lưới như ở xa. Mặt phẳng nhìn từ camera thường (ndv > 0,3) không bị ảnh hưởng.
  col = mix(col, vc.mul(0.62), smoothstep(0.3, 0.06, ndv).mul(0.55));
  // Vân đá sơn thủy (MAP-1), tính theo điểm ảnh nên không phụ thuộc độ thô của lưới xa: tầng ngang theo độ cao + khe dọc theo
  // nhiễu kéo dài; vách và đá lộ ngả lam nhạt dần theo độ cao. Áp sau khi hòa về màu đỉnh lưới ở xa.
  if (strata || redStrata) {
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
  mat.vertexColors = false;
  mat.colorNode = col;

  // ----- pháp tuyến + độ nhám -----
  if (lo) {
    mat.roughnessNode = float(0.9);
    mat.normalNode = null;
  } else {
    const nb = N(baseUvA, baseLayer);
    const ns = N(p.div(spScale), spLayer);
    const nr = N(p.div(9), L.rock);
    let off: Node = mix(offXZ(nb), offXZ(ns), spW);
    off = mix(off, offXZ(nr), rockW);
    let rough: Node = mix(nb.z, ns.z, spW);
    rough = mix(rough, nr.z, rockW);
    if (hi) {
      const nc = mix(offZY(N(uvZY, L.cliff)), offXY(N(uvXY, L.cliff)), wz.div(wsum));
      off = mix(off, nc, cliffW);
    } else {
      off = mix(off, offXZ(nr), cliffW);
    }
    const nrm = normalize(nGeo.add(off.mul(groundParams.normalStrength)));
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

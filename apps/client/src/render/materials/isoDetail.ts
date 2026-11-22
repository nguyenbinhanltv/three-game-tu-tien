import * as THREE from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  floor,
  fract,
  materialColor,
  mix,
  normalWorld,
  positionView,
  positionWorld,
  sin,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * Chi tiết mặt đất cho camera chéo (Thiên Nhãn P2b, chỉ khi `?cam=iso`): mặt đất chiếm ~70% khung và nhìn ở 15–45 m nên cần chi tiết tầm gần rõ:
 * biến thiên màu macro, mảng đất trồi trong cỏ, rêu, vết ố, vết nứt, lá rơi, sỏi, đá mẻ. Toàn bộ theo nhiễu/ô băm thủ tục theo tọa độ thế giới:
 * không texture mới, không draw call.
 */

/** Node TSL: kiểu của three/tsl không phơi bày toán tử trên `Node` trần, dùng any cho gọn. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

/** Băm ô → [0,1) (ổn định theo tọa độ thế giới). */
export const hash2 = (c: Node, k = 0): Node => fract(sin(dot(c, vec2(127.1, 311.7)).add(k * 74.7)).mul(43758.5453));

/** Nhiễu giá trị 2D mượt, [0,1). */
export function vnoise(q: Node): Node {
  const i = floor(q);
  const f = fract(q);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  const a = hash2(i);
  const b = hash2(i.add(vec2(1, 0)));
  const c = hash2(i.add(vec2(0, 1)));
  const d = hash2(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Chấm tròn mềm trong ô lưới `cell` m: có mặt với xác suất `prob`, lệch ngẫu nhiên trong ô, bán kính r0..r1 (m). Trả (độ phủ, băm cho màu). */
export function specks(p: Node, cell: number, prob: number, r0: number, r1: number, k: number): { cover: Node; rnd: Node } {
  const q = p.div(cell);
  const id = floor(q);
  const rnd = hash2(id, k);
  const off = vec2(hash2(id, k + 1.3), hash2(id, k + 2.7))
    .mul(0.6)
    .add(0.2);
  const dm = fract(q).sub(off).length().mul(cell);
  const r = mix(float(r0), float(r1), hash2(id, k + 4.1));
  const present = step(rnd, float(prob));
  return { cover: smoothstep(r, r.mul(0.55), dm).mul(present), rnd: hash2(id, k + 5.9) };
}

/**
 * Lá rơi hình lá thon (nhọn hai đầu), xoay ngẫu nhiên, kích thước/màu biến thiên, MẬT ĐỘ THƯA và GOM CỤM theo nhiễu (không rải đều):
 * trong cụm xác suất `prob`, ngoài cụm gần như không có. `cluster` 0..1 nhân thêm mật độ (rừng, mép lát...).
 */
export function leafShapes(p: Node, cell: number, prob: number, cluster: Node, k: number): { cover: Node; rnd: Node } {
  const q = p.div(cell);
  const id = floor(q);
  const rnd = hash2(id, k);
  const off = vec2(hash2(id, k + 1.3), hash2(id, k + 2.7))
    .mul(0.5)
    .add(0.25);
  const local = fract(q).sub(off).mul(cell);
  const ang = hash2(id, k + 3.3).mul(6.2832);
  const ca = ang.cos();
  const sa = ang.sin();
  const lx = local.x.mul(ca).add(local.y.mul(sa));
  const ly = local.y.mul(ca).sub(local.x.mul(sa));
  const a = mix(float(0.07), float(0.16), hash2(id, k + 4.1)); // nửa dài
  const taper = float(1).sub(lx.div(a).abs().mul(0.75)).max(0.12);
  const b = a.mul(0.36).mul(taper);
  const e = lx
    .div(a)
    .mul(lx.div(a))
    .add(ly.div(b).mul(ly.div(b)));
  const clusterN = smoothstep(0.52, 0.74, vnoise(p.mul(0.17).add(k)));
  const present = step(rnd, clamp(float(prob).mul(clusterN).mul(cluster).add(0.006), 0, 1));
  return { cover: smoothstep(1, 0.6, e).mul(present), rnd: hash2(id, k + 5.9) };
}

export interface TerrainDetailIn {
  /** Tọa độ thế giới xz. */
  p: Node;
  /** Khoảng cách tới camera. */
  dist: Node;
  /** 1 = đất bằng (không vách/đá/tuyết). */
  flat: Node;
  /** 1 = đất thường, thấp hơn trên đường mòn/sân lát. */
  soil: Node;
  /** Trọng số rừng, đất khô, đường mòn/lát, mép ẩm, đá lát. */
  forest: Node;
  dry: Node;
  path: Node;
  wet: Node;
  paving: Node;
}

/** Lớp chi tiết cho shader địa hình: nhận màu đã phối, trả màu có chi tiết. */
export function isoTerrainDetail(col: Node, t: TerrainDetailIn): Node {
  const { p } = t;
  const near = float(1).sub(smoothstep(30, 95, t.dist));
  const flat = t.flat.mul(near);
  let c: Node = col;
  // biến thiên màu macro: mảng sáng/tối ~25 m và ~7 m, nghiêng khô vàng ↔ tươi xanh
  const m1 = vnoise(p.mul(0.04).add(2.3));
  const m2 = vnoise(p.mul(0.14).add(7.7));
  c = c.mul(mix(float(1), float(0.72).add(m1.mul(0.4)).add(m2.sub(0.5).mul(0.3)), flat));
  const dryTint = smoothstep(0.55, 0.8, vnoise(p.mul(0.055).add(11.1)));
  c = mix(c, c.mul(vec3(1.18, 1.0, 0.7)), dryTint.mul(flat).mul(t.soil).mul(0.75));
  // hạt vi mô: tương phản rõ ở 0,45 m và 1,7 m
  const grain = vnoise(p.mul(2.4))
    .mul(0.5)
    .add(vnoise(p.mul(0.65).add(9.1)).mul(0.5));
  c = c.mul(mix(float(1), float(0.62).add(grain.mul(0.72)), flat));
  // mảng đất trồi trong cỏ: loang ~3 m, rìa mềm
  const soilN = vnoise(p.mul(0.23).add(4.4))
    .mul(0.7)
    .add(vnoise(p.mul(0.9).add(1.9)).mul(0.3));
  const patch = smoothstep(0.58, 0.68, soilN).mul(flat).mul(t.soil).mul(float(1).sub(t.paving));
  const dirtCol = mix(vec3(0.27, 0.19, 0.11), vec3(0.19, 0.13, 0.08), vnoise(p.mul(3.1)));
  c = mix(c, dirtCol.mul(float(0.8).add(grain.mul(0.5))), patch.mul(0.88));
  // rêu: mảng sẫm xanh ~4 m, nhiều ở rừng, mép ẩm, quanh đá lát
  const mossN = vnoise(p.mul(0.3).add(3.3))
    .mul(0.6)
    .add(vnoise(p.mul(1.3)).mul(0.4));
  const mossW = smoothstep(0.52, 0.72, mossN).mul(t.forest.mul(0.6).add(0.35).add(t.wet.mul(0.5)).add(t.paving.mul(0.6)));
  c = mix(c, c.mul(vec3(0.5, 0.82, 0.38)), clamp(mossW, 0, 1).mul(flat).mul(0.9));
  // vết nứt: đường mảnh (ridge), CHỈ trên đá lát và đất khô hẳn (không trên cỏ)
  const crackN = vnoise(p.mul(0.8).add(vec2(5.2, 1.7)))
    .sub(0.5)
    .abs();
  const crack = float(1)
    .sub(smoothstep(0.0, 0.02, crackN))
    .mul(t.paving.mul(0.3).add(smoothstep(0.55, 0.9, t.dry).mul(0.7)));
  c = c.mul(float(1).sub(clamp(crack, 0, 1).mul(flat).mul(0.5)));
  // lá rơi: lá thon xoay ngẫu nhiên, thưa, gom cụm (nhiều ở rừng và mép lát/ẩm), không rải đều
  const leaf = leafShapes(p, 0.5, 0.55, t.forest.mul(0.8).add(0.25).add(t.wet.mul(0.6)).add(t.paving.mul(0.4)), 11);
  const leafCol = mix(
    mix(vec3(0.5, 0.33, 0.11), vec3(0.4, 0.15, 0.07), leaf.rnd),
    mix(vec3(0.3, 0.4, 0.12), vec3(0.55, 0.45, 0.14), leaf.rnd),
    step(0.62, hash2(vec2(leaf.rnd.mul(91.7), 3.1))),
  ).mul(float(0.75).add(leaf.rnd.mul(0.5)));
  c = mix(c, leafCol, leaf.cover.mul(flat).mul(t.soil).mul(0.92));
  // sỏi: hạt sáng/tối 0,05–0,12 m, nhiều trên đường mòn, đất khô, đất trồi
  const peb = specks(p, 0.5, 0.14, 0.04, 0.09, 31);
  const pebCol = mix(vec3(0.44, 0.41, 0.36), vec3(0.24, 0.22, 0.2), peb.rnd);
  c = mix(
    c,
    pebCol,
    peb.cover
      .mul(flat)
      .mul(clamp(t.path.mul(0.8).add(t.dry.mul(0.6)).add(patch.mul(0.9)), 0, 1))
      .mul(0.95),
  );
  return c;
}

/**
 * Bề mặt kiến trúc ngửa lên (sàn đá, bậc, mái bằng) cho camera chéo: vết ố, rêu ở khe, đá mẻ cạnh, lá rơi, biến thiên sáng tối theo viên.
 * Tính theo tọa độ thế giới nên không cần UV hay texture; chỉ áp lên mặt có pháp tuyến hướng lên. Giữ màu/texture/màu đỉnh gốc (nhân vào `materialColor`).
 */
export function withIsoSurfaceDetail<M extends THREE.MeshStandardNodeMaterial>(m: M): M {
  const p = positionWorld.xz;
  const up = smoothstep(0.75, 0.92, normalWorld.y);
  const near = float(1).sub(smoothstep(30, 95, positionView.length()));
  const w = up.mul(near);
  // viên lát/đá: tông sáng tối riêng từng ô ~2,4 m (lệch lưới) — phá vẻ phẳng một màu
  const q = p.div(2.4).add(vec2(0.31, 0.17));
  const slab = hash2(floor(q), 3).sub(0.5);
  let mul: Node = float(1).add(slab.mul(0.28));
  // vết ố/bẩn: mảng loang ~6 m và ~1,5 m, ngả vàng nâu
  const stain = vnoise(p.mul(0.16).add(5.5))
    .mul(0.6)
    .add(vnoise(p.mul(0.7).add(1.1)).mul(0.4));
  mul = mul.mul(float(1).sub(smoothstep(0.45, 0.75, stain).mul(0.38)));
  // hạt vi mô
  const grain = vnoise(p.mul(3.2))
    .mul(0.5)
    .add(vnoise(p.mul(0.9).add(2.2)).mul(0.5));
  mul = mul.mul(float(0.8).add(grain.mul(0.4)));
  let tint: Node = vec3(1);
  tint = mix(tint, vec3(1.08, 0.97, 0.78), smoothstep(0.5, 0.78, stain).mul(0.7));
  // rêu loang + dọc cạnh viên (khe lát)
  const f = fract(q);
  const edgeD = f.x.min(float(1).sub(f.x)).min(f.y).min(float(1).sub(f.y));
  const edge = float(1).sub(smoothstep(0.0, 0.1, edgeD));
  const mossN = vnoise(p.mul(0.45).add(8.8))
    .mul(0.6)
    .add(vnoise(p.mul(2.0)).mul(0.4));
  const moss = clamp(
    smoothstep(0.5, 0.7, mossN)
      .mul(0.55)
      .add(edge.mul(smoothstep(0.4, 0.62, mossN)).mul(0.9)),
    0,
    1,
  );
  tint = mix(tint, vec3(0.5, 0.78, 0.38), moss.mul(0.85));
  // đá mẻ cạnh: vết sẫm lởm chởm ở cạnh viên
  const chip = edge.mul(step(0.62, vnoise(p.mul(5.5)))).mul(0.5);
  mul = mul.mul(float(1).sub(chip));
  // vết nứt
  const crackN = vnoise(p.mul(0.9).add(vec2(2.2, 6.1)))
    .sub(0.5)
    .abs();
  mul = mul.mul(
    float(1).sub(
      float(1)
        .sub(smoothstep(0.0, 0.03, crackN))
        .mul(0.32),
    ),
  );
  // lá rơi trên sàn đá: rất thưa, gom ở mép viên lát
  const leaf = leafShapes(p, 0.55, 0.4, edge.mul(0.9).add(0.1), 11);
  const leafCol = mix(vec3(0.46, 0.3, 0.11), vec3(0.36, 0.14, 0.07), leaf.rnd).mul(float(0.75).add(leaf.rnd.mul(0.5)));
  // Giữ alpha (map/alphaTest/transparent của GLB: song cửa, lan can, phướn, lá) và colorNode riêng nếu material đã có.
  const src: Node = m.colorNode ? vec4(m.colorNode) : vec4(materialColor);
  const base = src.rgb.mul(mix(float(1), mul, w)).mul(mix(vec3(1), tint, w));
  m.colorNode = vec4(mix(base, leafCol, leaf.cover.mul(w).mul(0.8)), src.a);
  return m;
}

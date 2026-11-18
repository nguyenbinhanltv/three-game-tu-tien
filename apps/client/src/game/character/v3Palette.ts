// Bảng màu Lạc Kiếm Môn Phục v3 (N-4): texture Tripo tối và nhạt hơn concept (đo trên raw_v3: lam ≈ #282E3E, ngà ≈ #C6BBA8; concept: lam
// viền #27476E, giáp xanh sơn mài #3B6584 với sáng #4C86B0, ngà #E4DEC8), cộng sương/grading của game làm giáp lam ám xám bạc.
// Ba lớp màu nhận ra ngay trong shader (cùng cách `dye.ts`, không cần texture mặt nạ riêng): lam (độ lệch b − r), ngà/bạc (độ bão hòa
// thấp và sáng), còn lại (da, tóc, kim loại tối) giữ nguyên. Lam đi qua dải màu theo độ sáng texel (viền tối → #27476E, giáp → #3B6584,
// mép sáng → #4C86B0) nên giữ nguyên nếp, vân, mép bạc. Albedo đưa về ĐÚNG màu concept dưới ánh sáng trung tính; không bù grading của một cảnh (mood
// đêm, Vân Hải, Thiên Khuyết sẽ tự lệch theo grading của chúng như mọi vật khác). `?v3pal=0` tắt để so ảnh.
import * as THREE from 'three/webgpu';
import { dot, float, materialColor, max, min, mix, smoothstep, vec3, vec4 } from 'three/tsl';
import { FLAGS } from '../flags';

const V3_PALETTE_ON = FLAGS.v3Palette;

const lin = (hex: string): THREE.Vector3 => {
  const c = new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
  return new THREE.Vector3(c.r, c.g, c.b);
};
/** Màu đích (concept) và màu ngà trung bình của texture (đo) để tính hệ số nhân theo kênh. */
const V3_PAL = {
  navy: '#27476E',
  armor: '#3B6584',
  armorHi: '#4C86B0',
  ivory: '#E4DEC8',
  ivoryTex: '#C6BBA8',
} as const;

/** Gắn `colorNode` bảng màu v3 vào material (giữ map/alpha). Gọi một lần cho mỗi material gốc. */
export function applyV3Palette(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  if (!V3_PALETTE_ON) return m;
  const navy = lin(V3_PAL.navy);
  const armor = lin(V3_PAL.armor);
  const hi = lin(V3_PAL.armorHi);
  const ivMul = lin(V3_PAL.ivory).divide(lin(V3_PAL.ivoryTex));
  const c = materialColor.rgb;
  const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  const mx = max(max(c.x, c.y), c.z);
  const mn = min(min(c.x, c.y), c.z);
  // Lam: b vượt r đáng kể so với độ sáng (texture lam ≈ b/r 1,5–2; da/ngà/tóc ≤ 1).
  const blue = smoothstep(float(0.18), float(0.4), c.z.sub(c.x).div(lum.add(1e-3))).mul(smoothstep(float(0.004), float(0.02), lum));
  const t = smoothstep(float(0.02), float(0.2), lum);
  const mid = smoothstep(float(0.0), float(0.5), t);
  const ramp = mix(mix(vec3(navy.x, navy.y, navy.z), vec3(armor.x, armor.y, armor.z), mid), vec3(hi.x, hi.y, hi.z), smoothstep(float(0.5), float(1.0), t));
  // Ngà/bạc: bão hòa thấp và sáng (tóc đen, da ấm, kim loại tối nằm ngoài).
  const sat = mx.sub(mn).div(mx.add(1e-3));
  const ivory = smoothstep(float(0.3), float(0.42), lum).mul(smoothstep(float(0.44), float(0.34), sat)).mul(float(1).sub(blue));
  // Chuẩn hóa theo kênh lớn nhất khi vượt 1 (giữ tỉ lệ kênh và vân, không cắt phẳng một kênh).
  const ivRaw = c.mul(vec3(ivMul.x, ivMul.y, ivMul.z));
  const ivOut = ivRaw.div(max(float(1), max(max(ivRaw.x, ivRaw.y), ivRaw.z)));
  const out = mix(mix(c, ivOut, ivory), ramp, blue);
  m.colorNode = vec4(out, materialColor.a);
  m.needsUpdate = true;
  return m;
}

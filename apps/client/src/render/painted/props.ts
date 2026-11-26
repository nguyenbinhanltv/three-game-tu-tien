import * as THREE from 'three/webgpu';
import {
  diffuseColor,
  dot,
  faceDirection,
  float,
  materialEmissive,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import { FLAGS } from '../../base/flags';
import { LIGHT } from './fieldShared';
import type { N } from './lab/field';
import { themeU } from './theme';

/**
 * Họa Cảnh P6: cây và nhà (vật thể tĩnh của thế giới) tô theo kiểu painted-valley, thay đèn PBR: mỗi mặt chỉ có hai tông, sáng (ngả ấm) và
 * tối (ngả lam lạnh, ít bão hòa), nối bằng một bước ngắn theo hướng mặt so với nắng cố định của Họa Cảnh (cùng `LIGHT` với cỏ và đất, nên cả
 * cảnh một ánh sáng). Màu gốc (texture × màu đỉnh) giữ nguyên làm nền, nên không đổi asset. Không đèn, không sương của mood, không phản xạ.
 * Vật liệu có phát sáng (đèn lồng, tinh thể: cả `emissive`/`emissiveMap` lẫn `emissiveNode` do lớp bọc trước đặt) giữ phần phát sáng của nó. Chỉ chạy khi `?style=painted`; mặc định trả lại đúng vật liệu đưa vào.
 */
const SUN = new THREE.Vector3(...LIGHT.sunDir).normalize();

/** Hai tông nhân với màu gốc: sáng ngả ấm, tối ngả lam (pha tay, không phải sáng nhân cho tối). */
const LIT_TINT = [1.1, 1.05, 0.9] as const;
const SHADE_TINT = [0.46, 0.56, 0.82] as const;
const EDGE = 0.5;
const SOFT = 0.05;

/** Vật liệu đá của kiến trúc tông môn (`arch_sect_stone|jade|plaster`): vân texture ảnh chụp được làm phẳng thành hai mức (P6c). */
const FLATTEN_NAME = /(^|_)(stone|jade|plaster)$/;

/**
 * Làm phẳng vân ảnh chụp của đá: độ chói của texture gốc được lượng tử thành hai mức (khe/vết nứt tối, phiến sáng) rồi nhuộm xám ngọc;
 * rêu xanh của ảnh chụp mất vì màu gốc bị kéo gần về xám (giữ 15% màu gốc). Trộn 80% để khe nứt vẫn có nét.
 */
function flattenStone(albedo: N): N {
  const l = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  const q = mix(float(0.13), float(0.5), smoothstep(0.2, 0.38, l));
  const flat = vec3(0.88, 1.0, 0.96).mul(mix(l, q, 0.8));
  return mix(flat, albedo, 0.15);
}

/** Tông nhân theo hướng mặt so với nắng cố định của Họa Cảnh: sáng ngả ấm, tối ngả lam, nối bằng một bước ngắn. */
function sunTint(): N {
  const sun = uniform(SUN);
  // nửa-Lambert: 0..1 theo hướng mặt (mặt sau của thẻ lá hai mặt lật pháp tuyến để cùng một cách tô)
  const t = normalWorld.mul(faceDirection).dot(sun).mul(0.5).add(0.5);
  const lit = smoothstep(float(EDGE - SOFT), float(EDGE + SOFT), t);
  return mix(vec3(...SHADE_TINT), vec3(...LIT_TINT), lit);
}

/** Dải độ chói của màu gốc ánh xạ vào cặp đá lát: dưới `PAV_LO` là khe/bó vỉa/rêu (tông tối), trên `PAV_HI` là phiến sáng; khoảng giữa giữ sắc độ từng phiến. */
const PAV_LO = 0.1;
const PAV_HI = 0.46;
/** Mức ánh xạ vào cặp đá lát; phần còn lại giữ màu gốc (rêu ở mép phiến, sắc ấm riêng từng khối). */
const PAV_MIX = 0.7;

/**
 * Họa Cảnh: đá lát dựng bằng lưới riêng (mặt đường, mặt cầu, lan can của Cửu Kiều; địa hình ở đó không có mặt nạ lát đá nên `pavTone` của shader đất không
 * chạm tới). Bỏ đèn PBR: độ chói màu gốc (sắc độ từng phiến, khe, rêu) ánh xạ vào cặp `paving` của level (`themeU.pLit/pShade`), rồi tô hai tông theo hướng
 * mặt như `paintedProp`: mặt lát hướng lên sáng ấm, thành cầu và vòm khuất nắng ngả lam, nên cầu có khối thay vì một mảng phẳng tối. Không thêm draw call hay
 * texture. Chỉ chạy khi `?style=painted`; mặc định trả lại đúng vật liệu đưa vào.
 */
export function paintedPaving<M extends THREE.MeshStandardNodeMaterial>(m: M): M {
  if (!FLAGS.painted) return m;
  m.lights = false;
  const base: N = diffuseColor.rgb;
  const ink: N = dot(base, vec3(0.2126, 0.7152, 0.0722));
  const tone: N = mix(vec3(themeU.pShade), vec3(themeU.pLit), smoothstep(PAV_LO, PAV_HI, ink));
  const albedo: N = mix(base, tone, PAV_MIX);
  // màu ra = diffuseColor + emissive (xem `paintedProp`)
  m.emissiveNode = albedo.mul(sunTint()).sub(diffuseColor.rgb);
  m.needsUpdate = true;
  return m;
}

/**
 * Vật liệu chuẩn cho lưới dựng bằng code (ván cầu, đá trôi, xương...): mặc định trả đúng `MeshStandardMaterial` như trước; với `?style=painted` trả bản node
 * đã qua `paintedProp` (hai tông theo hướng mặt, không đèn). Màu theo instance (`instanceColor`) và màu đỉnh vẫn là màu gốc.
 */
export function paintedStd(opts: THREE.MeshStandardMaterialParameters): THREE.Material {
  if (!FLAGS.painted) return new THREE.MeshStandardMaterial(opts);
  return paintedProp(new THREE.MeshStandardNodeMaterial(opts));
}

export function paintedProp<M extends THREE.MeshStandardNodeMaterial>(m: M): M {
  if (!FLAGS.painted) return m;
  const tint = sunTint();
  m.lights = false;
  // màu ra = diffuseColor + emissive; phần cộng thêm = màu gốc × (tông − 1) để tổng là màu gốc × tông
  // giữ phần phát sáng đã có: node tùy biến do lớp bọc trước đặt (vd. `propCrystal`: lõi + viền tinh thể), nếu không thì phát sáng chuẩn của vật liệu
  const prev = m.emissiveNode as THREE.Node | null;
  const glow: THREE.Node = prev ?? (m.emissiveMap || m.emissive.getHex() !== 0 ? materialEmissive : vec3(0));
  // đá tông môn: albedo đã làm phẳng (cộng phần chênh vào phát sáng, vì màu ra = diffuseColor + emissive)
  const base: N = FLATTEN_NAME.test(m.name) ? flattenStone(diffuseColor.rgb) : diffuseColor.rgb;
  // bảng theo level (theme.ts): đổi tông theo độ chói sang cặp đá của level (propMix = 0 ở Vân Lam, giữ nguyên)
  const ink: N = dot(base, vec3(0.2126, 0.7152, 0.0722));
  const themed: N = mix(vec3(themeU.rShade), vec3(themeU.rLit), smoothstep(0.04, 0.4, ink));
  // level hai mặt (theme.ts `face`; mặc định tông 1,1,1): nhuộm theo phía của Giới Tuyến, đổi dần quanh nó
  const faceTint: N = mix(
    vec3(themeU.faceW),
    vec3(themeU.faceE),
    smoothstep(themeU.face.y.negate(), themeU.face.y, positionWorld.x.sub(themeU.face.x)),
  );
  const albedo: N = mix(base, themed, themeU.propMix).mul(faceTint);
  m.emissiveNode = albedo.mul(tint).sub(diffuseColor.rgb).add(glow);
  m.needsUpdate = true;
  return m;
}

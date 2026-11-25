import * as THREE from 'three/webgpu';
import { diffuseColor, faceDirection, float, materialEmissive, mix, normalWorld, smoothstep, uniform, vec3 } from 'three/tsl';
import { FLAGS } from '../../base/flags';
import { LIGHT } from './fieldShared';

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

export function paintedProp<M extends THREE.MeshStandardNodeMaterial>(m: M): M {
  if (FLAGS.style !== 'painted') return m;
  const sun = uniform(SUN);
  // nửa-Lambert: 0..1 theo hướng mặt (mặt sau của thẻ lá hai mặt lật pháp tuyến để cùng một cách tô)
  const t = normalWorld.mul(faceDirection).dot(sun).mul(0.5).add(0.5);
  const lit = smoothstep(float(EDGE - SOFT), float(EDGE + SOFT), t);
  const tint = mix(vec3(...SHADE_TINT), vec3(...LIT_TINT), lit);
  m.lights = false;
  // màu ra = diffuseColor + emissive; phần cộng thêm = màu gốc × (tông − 1) để tổng là màu gốc × tông
  // giữ phần phát sáng đã có: node tùy biến do lớp bọc trước đặt (vd. `propCrystal`: lõi + viền tinh thể), nếu không thì phát sáng chuẩn của vật liệu
  const prev = m.emissiveNode as THREE.Node | null;
  const glow: THREE.Node = prev ?? (m.emissiveMap || m.emissive.getHex() !== 0 ? materialEmissive : vec3(0));
  m.emissiveNode = diffuseColor.rgb.mul(tint.sub(1)).add(glow);
  m.needsUpdate = true;
  return m;
}

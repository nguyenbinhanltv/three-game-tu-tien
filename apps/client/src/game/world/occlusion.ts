import * as THREE from 'three/webgpu';
import type { ShaderNodeObject } from 'three/tsl';
import {
  clamp,
  dot,
  float,
  fract,
  length,
  max,
  positionWorld,
  screenCoordinate,
  screenSize,
  smoothstep,
  step,
  uniform,
  vec2,
} from 'three/tsl';
import { OCCLUDERS } from '@dtl/shared';

/**
 * Làm mờ vật che giữa camera và nhân vật.
 *
 * Kiến trúc: CPU kiểm đoạn camera→nhân vật (2D) cắt hình tròn nào trong `OCCLUDERS` (O(n)),
 * mờ dần/hiện dần từng vật, rồi đẩy tối đa `SLOTS` vật đang mờ vào uniform. Shader của material
 * kiến trúc bỏ điểm ảnh theo dither (không cần transparent, không sắp xếp lại, không tạo material mới)
 * nếu điểm nằm trong hình tròn đó, gần camera hơn nhân vật và cao hơn chân nhân vật.
 *
 * Cây: không có collider nên dùng ống quanh đoạn camera→ngực nhân vật (3D) ngay trong shader.
 * Bóng đổ không bị ảnh hưởng vì shadow pass dùng material ghi đè không có `maskNode`.
 */

const SLOTS = 4;
/** Tỉ lệ điểm ảnh bị bỏ khi mờ hẳn (còn lại 1 − MAX_FADE để vẫn thấy dáng vật). */
const MAX_FADE = 0.78;
/** Mờ/hiện hết trong khoảng 1 / FADE_RATE giây. */
const FADE_RATE = 5;
/** Đoạn nhìn cắt hình tròn khi khoảng cách < r + PAD. */
const PAD = 0.6;
/** Camera chéo: tia nhìn dốc, mái/tường rộng hơn dấu chân nên nới lề để mái phủ lên nhân vật cũng mờ. */
const PAD_ISO = 2.4;
/** Bán kính vùng mờ quanh nhân vật (camera chéo), m. */
const ZONE_R = 4;

const uCam = uniform(new THREE.Vector3());
const uFocus = uniform(new THREE.Vector3());
/** Độ cao chân nhân vật. */
const uFeetY = uniform(0);
/** Khoảng cách camera→ngực trừ lề: điểm xa hơn thế thì nằm sau nhân vật, giữ nguyên. */
const uNear = uniform(0);
/** Mức mờ của cây trong ống tầm nhìn (0 khi camera quá gần). */
const uVeg = uniform(0);
/** Ống mờ cây: mờ hẳn trong `uVegIn`, hết mờ ở `uVegOut` (m). Camera chéo nới rộng: tán cây gần camera che cả góc màn hình, không chỉ đường thẳng tới nhân vật. */
const uVegIn = uniform(1.1);
const uVegOut = uniform(2.2);
/** Ngự kiếm (camera chéo): 1 = mờ cây/prop ở RÌA màn hình (tán cây gần camera che góc khung), 0 = tắt. */
const uEdge = uniform(0);
const uSlots = Array.from({ length: SLOTS }, () => uniform(new THREE.Vector4()));

/** Nhiễu gradient đan xen theo tọa độ màn hình: dither ổn định, không cần texture. */
const ign = fract(float(52.9829189).mul(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)))));
const nearer = step(length(positionWorld.sub(uCam)), uNear);
const aboveFeet = step(uFeetY.add(0.25), positionWorld.y);

function archFade() {
  const parts = uSlots.map((s) =>
    float(1)
      .sub(smoothstep(s.z, s.z.add(1), length(positionWorld.xz.sub(s.xy))))
      .mul(s.w),
  );
  let f: ShaderNodeObject<THREE.Node> = parts[0]!;
  for (let i = 1; i < parts.length; i++) f = max(f, parts[i]!);
  return f.mul(nearer).mul(aboveFeet);
}

function vegFade() {
  const seg = uFocus.sub(uCam);
  const len = max(length(seg), 0.001);
  const dir = seg.div(len);
  const t = clamp(dot(positionWorld.sub(uCam), dir), 0, len);
  const d = length(positionWorld.sub(uCam.add(dir.mul(t))));
  const inside = float(1).sub(smoothstep(uVegIn, uVegOut, d));
  const uv = screenCoordinate.xy.div(screenSize);
  const edge = smoothstep(0.38, 0.7, length(uv.sub(0.5).mul(vec2(1.78, 1)))).mul(uEdge);
  // Ngự kiếm: cây ở rìa màn hình là cảnh nền nhưng che góc khung nên mờ theo vị trí màn hình (không cần nằm trên đường nhìn).
  return max(inside.mul(step(uFeetY.add(0.8), positionWorld.y)).mul(nearer), edge).mul(uVeg);
}

/** Gắn làm mờ vật che theo danh sách `OCCLUDERS` cho material kiến trúc. Gọi một lần lúc tạo. */
export function withOccluderFade<M extends THREE.NodeMaterial>(m: M): M {
  m.maskNode = ign.greaterThanEqual(archFade());
  return m;
}

/** Gắn làm mờ cây nằm trên đường nhìn camera→nhân vật. Gọi một lần lúc tạo. */
export function withSightFade<M extends THREE.NodeMaterial>(m: M): M {
  m.maskNode = ign.greaterThanEqual(vegFade());
  return m;
}

const fade = new Float32Array(OCCLUDERS.length);
const slotIdx = new Int16Array(SLOTS);

/** Khoảng cách bình phương từ (px, pz) tới đoạn (ax, az)→(bx, bz) trên mặt phẳng XZ. */
function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-6 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px;
  const ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}

/** Vật (tâm, bán kính) nằm trong vùng 4 m quanh nhân vật và ở nửa mặt phẳng phía camera. */
function zoneHit(ox: number, oz: number, r: number, cam: THREE.Vector3, chest: THREE.Vector3): boolean {
  const dx = ox - chest.x;
  const dz = oz - chest.z;
  if (dx * dx + dz * dz > (r + ZONE_R) * (r + ZONE_R)) return false;
  return dx * (cam.x - chest.x) + dz * (cam.z - chest.z) > -r * 0.5 * Math.hypot(cam.x - chest.x, cam.z - chest.z);
}

/**
 * Gọi mỗi khung sau khi đặt camera. `chest`: điểm camera nhìn vào trên nhân vật; `feetY`: chân.
 * Chỉ ghi số vào uniform có sẵn, không cấp phát.
 */
export function updateOcclusion(dt: number, cam: THREE.Vector3, chest: THREE.Vector3, feetY: number, wide: 0 | 1 | 2 = 0): void {
  const iso = wide > 0;
  uEdge.value = wide === 2 ? 1 : 0;
  uVegIn.value = wide === 2 ? 4.5 : wide === 1 ? 3.2 : 1.1;
  uVegOut.value = wide === 2 ? 8.5 : wide === 1 ? 6.4 : 2.2;
  uCam.value.copy(cam);
  uFocus.value.copy(chest);
  uFeetY.value = feetY;
  const dist = cam.distanceTo(chest);
  uNear.value = dist - 0.7;
  uVeg.value = dist > 2.5 ? MAX_FADE : 0;
  const k = dt * FADE_RATE;
  for (let i = 0; i < OCCLUDERS.length; i++) {
    const o = OCCLUDERS[i]!;
    const rr = o.r + (iso ? PAD_ISO : PAD);
    // Camera chéo: ngoài đường nhìn, cả VÙNG quanh nhân vật phía camera (mái/tường kề bên) cũng mờ.
    const zone = iso && zoneHit(o.x, o.z, o.r, cam, chest);
    const hit = zone || segDist2(o.x, o.z, cam.x, cam.z, chest.x, chest.z) < rr * rr;
    fade[i] = hit ? Math.min(1, fade[i]! + k) : Math.max(0, fade[i]! - k);
  }
  // Đổ vào các ô uniform: ưu tiên vật mờ nhiều nhất (thường chỉ 1–3 vật cùng lúc).
  for (let s = 0; s < SLOTS; s++) {
    let best = -1;
    for (let i = 0; i < fade.length; i++) {
      if (fade[i]! <= 0 || (best >= 0 && fade[i]! <= fade[best]!)) continue;
      let used = false;
      for (let j = 0; j < s; j++) if (slotIdx[j] === i) used = true;
      if (!used) best = i;
    }
    slotIdx[s] = best;
    const v = uSlots[s]!.value;
    if (best < 0) v.set(0, 0, 0, 0);
    else {
      const o = OCCLUDERS[best]!;
      v.set(o.x, o.z, o.r, fade[best]! * MAX_FADE);
    }
  }
}

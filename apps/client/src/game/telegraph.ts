import * as THREE from 'three/webgpu';
import { groundAt, type HazardMsg } from '@dtl/shared';
import type { Vfx } from './vfx';

/**
 * Vùng báo trước hình chữ nhật/quạt (đòn của quái đánh xa). Chỉ vẽ; ai trúng do server phán định
 * bằng `inHazard` trong packages/shared. Hình tròn vẫn đi qua `Vfx.hazard`.
 *
 * Mỗi vùng gồm: nền mờ đúng hình, phần tô tiến độ chạy từ gốc ra ngoài, rồi chớp sáng khi nổ.
 * 2 lưới mỗi vùng (lấy từ pool của `Vfx`, material dùng chung kiểu `flat`: cộng sáng, không bloom để
 * vùng đọc rõ không nhòe), sống 1–2 giây; chớp khi nổ là `Vfx.burst` (có bloom).
 */

/** Tấm 1×1 nằm ngang, trải z từ 0 tới 1 (gốc ở mép sau), x từ -0,5 tới 0,5. */
const RECT_GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2);

const COLORS: Record<string, [number, number]> = {
  lightning: [0x6a3fd0, 0xb48cff],
  frost: [0x2f8fd0, 0x9fe4ff],
  fire: [0xb0401a, 0xffa060],
  spirit: [0x4a7fb0, 0xd8f0ff],
};

/** Quạt nằm ngang, bán kính 1, nửa góc `half`, hướng về +z. Lưu đệm theo góc (mỗi loại quái một góc). */
const CONE_CACHE = new Map<number, THREE.BufferGeometry>();
function coneGeo(half: number): THREE.BufferGeometry {
  const key = Math.round(half * 100);
  let g = CONE_CACHE.get(key);
  if (!g) {
    const h = key / 100;
    g = new THREE.CircleGeometry(1, Math.max(8, Math.ceil(h * 20)), Math.PI / 2 - h, h * 2).rotateX(Math.PI / 2);
    if (CONE_CACHE.size < 16) CONE_CACHE.set(key, g);
  }
  return g;
}

const _p = new THREE.Vector3();

export function telegraph(v: Vfx, m: HazardMsg): void {
  if (!m.sh || !(m.r > 0) || !(m.delay > 0)) return;
  const [dark, light] = COLORS[m.kind] ?? COLORS.frost;
  const yaw = m.yaw ?? 0;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Mặt đất không phẳng: đặt cao hơn điểm cao nhất dọc trục để không bị cắt.
  let y = -Infinity;
  for (let i = 0; i <= 4; i++) y = Math.max(y, groundAt(m.x + fx * m.r * (i / 4), m.z + fz * m.r * (i / 4)));
  y += 0.3;

  const rect = m.sh === 'rect';
  const half = Math.min(Math.PI * 0.45, Math.max(0.05, m.w ?? Math.PI / 6));
  const geo = rect ? RECT_GEO : coneGeo(half);
  const base = v.fx(geo, dark, 0.22, 'flat');
  const fill = v.fx(geo, light, 0.32, 'flat');
  base.position.set(m.x, y, m.z);
  fill.position.set(m.x, y + 0.02, m.z);
  base.rotation.y = fill.rotation.y = yaw;
  const w = rect ? (m.w ?? 2) : m.r;
  base.scale.set(w, 1, m.r);
  fill.scale.set(rect ? w : 0.001, 1, 0.001);

  v.track(
    m.delay,
    (k) => {
      // Vạch tiến độ: chữ nhật dài dần theo trục; quạt nở dần theo bán kính.
      const s = Math.max(0.001, k);
      if (rect) fill.scale.z = m.r * s;
      else fill.scale.set(m.r * s, 1, m.r * s);
      base.fxOpacity = 0.18 + 0.12 * Math.abs(Math.sin(k * 18));
    },
    () => {
      v.drop(base);
      v.drop(fill);
      if (!rect && CONE_CACHE.get(Math.round(half * 100)) !== geo) geo.dispose();
      // Nổ: vài chớp sáng dọc trục chiêu.
      for (let i = 1; i <= 3; i++) {
        const d = m.r * (i / 3.4);
        _p.set(m.x + fx * d, 0, m.z + fz * d);
        _p.y = groundAt(_p.x, _p.z) + 0.6;
        v.burst(_p, light, rect ? (m.w ?? 2) * 0.9 : 1 + d * 0.35, 0.35);
      }
    },
  );
}

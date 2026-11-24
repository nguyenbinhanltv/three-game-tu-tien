import type * as THREE from 'three/webgpu';
import { float, instanceIndex, positionLocal, sin, smoothstep, time, uv, vec3 } from 'three/tsl';

/**
 * Gió cho phướn (PROP-1): material vải (`cloth`) của GLB lưu trọng số lắc ở UV.x (0 ở mép treo, 1 ở đầu tự do; vải không có texture
 * nên UV rảnh). Dịch đỉnh trong không gian cục bộ trước ma trận instance, pha lệch theo instance để các lá phướn không lắc đồng bộ.
 * Material khác (cột, xà, đồng) giữ nguyên.
 */
export function bannerSway(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  if (!m.name.includes('cloth')) return m;
  const w = uv().x.clamp(0, 1);
  const w2 = w.mul(w);
  const phase = instanceIndex.toFloat().mul(1.73);
  const p = positionLocal;
  const t = time.mul(1.7).add(phase);
  const dx = sin(t.add(p.y.mul(1.1)))
    .mul(0.16)
    .add(sin(t.mul(2.3).add(p.y.mul(2.4))).mul(0.05))
    .mul(w2);
  const dz = sin(t.mul(1.3).add(p.y.mul(0.8)).add(1.1))
    .mul(0.1)
    .add(0.03)
    .mul(w2);
  m.positionNode = vec3(p.x.add(dx), p.y.sub(w2.mul(0.04).mul(float(1))), p.z.add(dz));
  return m;
}

/** Phần treo của prop nằm ở x > 0,3 m và y > 1,5 m (cột tre và đế ở x ≈ 0 hoặc y ≈ 0 đứng yên). */
const LANTERN_ARM_X = [0.25, 0.45] as const;
const LANTERN_ARM_Y = [1.4, 1.6] as const;

/** Đỉnh chỗ treo của lồng đèn giấy `prop_tc_long_den_giay` (m, hình học đã nướng ma trận nút): đèn nằm 1,84–2,76 m, cần treo ~2,85 m. */
const LANTERN_PIVOT_Y = 2.85;
/** Thân đèn dưới điểm treo (m) tại đó độ lắc đạt tối đa. */
const LANTERN_HANG = 0.9;

/**
 * Đèn lồng lắc (M4): con lắc quanh điểm treo, biên độ tỉ lệ với độ thấp so với điểm treo (đèn lắc nhiều, cần treo đứng yên), hai tần số lệch pha theo instance
 * nên cả hàng đèn không đồng bộ, thêm nhịp "gió giật" chậm. Áp cho MỌI vật liệu của prop có cờ `lantern` (giấy, nan, vòng, nắp, dây, tua) với CÙNG một độ dịch, để cả cụm treo
 * lắc như một khối; cột tre và đế được loại theo vị trí cục bộ (không theo tên vật liệu: tua và nan dùng chung vật liệu với phần đứng yên). Thay hẳn `bannerSway` cho prop này.
 */
export function lanternSway(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardNodeMaterial {
  const p = positionLocal;
  const arm = smoothstep(LANTERN_ARM_X[0], LANTERN_ARM_X[1], p.x).mul(smoothstep(LANTERN_ARM_Y[0], LANTERN_ARM_Y[1], p.y));
  const w = float(LANTERN_PIVOT_Y).sub(p.y).div(LANTERN_HANG).clamp(0, 1).mul(arm);
  const phase = instanceIndex.toFloat().mul(2.39);
  const gust = sin(time.mul(0.31).add(phase.mul(0.37)))
    .mul(0.5)
    .add(0.9);
  const t = time.mul(1.35).add(phase);
  const ax = sin(t)
    .mul(0.1)
    .add(sin(t.mul(2.1).add(1.3)).mul(0.03))
    .mul(gust);
  const az = sin(t.mul(0.83).add(2.0)).mul(0.07).mul(gust);
  m.positionNode = vec3(p.x.add(ax.mul(w)), p.y.sub(ax.abs().mul(w).mul(0.25)), p.z.add(az.mul(w)));
  return m;
}

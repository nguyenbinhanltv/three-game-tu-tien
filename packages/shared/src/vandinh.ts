// Bố cục kiến trúc Vấn Đỉnh dùng chung client (dựng hình, `vdWonders.ts`) và server/content (va chạm), để hình và vòng chặn không lệch nhau (TN-3).
// Mọi kích thước theo `VdWonders`/`VdDungeon` ở client; đổi bên đó thì đổi ở đây.

export interface VdCircle {
  x: number;
  z: number;
  r: number;
}

/** Bán kính vòng chặn thân Đỉnh Vô Danh (thân bầu 4,6 m × tỉ lệ 1,5 ≈ 6,9 m; chừa mép chân/quai). */
export const VD_DINH_R = 6.4;
/** Ảnh Bia: phiến 2,6 m bề ngang → vòng nửa rộng 1,3 m; người chơi vẫn chạm `touch` (TOUCH_R 5 m) từ trước mặt. */
export const VD_BIA_R = 1.3;
/** Trụ cổng Giới Trì: bán kính chân 1,5 m, đặt ±6,2 m quanh tâm cổng theo trục ngang cục bộ. */
export const VD_GATE_PILLAR_R = 1.7;
export const VD_GATE_HALF = 6.2;
/** 14 cột đồng phó bản: vòng bán kính 74 m quanh tâm sân, chân 2,1 m. */
export const GIOI_TRI_PILLARS = 14;
export const GIOI_TRI_PILLAR_RING = 74;
export const GIOI_TRI_PILLAR_R = 2.3;

/** Hướng cổng Giới Trì nhìn ra (rad, `rotation.y`): về phía tâm bản đồ. */
export function vdGateYaw(gate: { x: number; z: number }, center: number): number {
  return Math.atan2(center - gate.x, center - gate.z);
}

/** Hai vòng chặn trụ cổng quanh `gate` quay `yaw` (cùng phép quay `rotation.y` của Three.js). */
export function vdGateCircles(gate: { x: number; z: number }, yaw: number): VdCircle[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [-1, 1].map((k) => ({ x: gate.x + k * VD_GATE_HALF * c, z: gate.z - k * VD_GATE_HALF * s, r: VD_GATE_PILLAR_R }));
}

/** 14 cột đồng quanh tâm sân phó bản Giới Trì. */
export function gioiTriPillars(center: { x: number; z: number }): VdCircle[] {
  return Array.from({ length: GIOI_TRI_PILLARS }, (_, i) => {
    const a = (i / GIOI_TRI_PILLARS) * Math.PI * 2;
    return { x: center.x + Math.cos(a) * GIOI_TRI_PILLAR_RING, z: center.z + Math.sin(a) * GIOI_TRI_PILLAR_RING, r: GIOI_TRI_PILLAR_R };
  });
}

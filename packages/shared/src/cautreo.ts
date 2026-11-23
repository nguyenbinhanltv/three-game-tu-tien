import type { Shape } from './collision';
import { BRIDGE_A, BRIDGE_B, TC_ORIGIN } from './tieucanh';

/**
 * Cầu treo Lạc Kiếm đi được (Chân Cảnh M2): MỘT mô hình dùng chung cho hình (client `lacKiemScenes.ts`), va chạm (`bridgeShapes`, content/colliders.ts
 * đăng ký cho level van_lam) và tiếng bước chân (`bridgeSurfaceT`). Server quyết định vị trí trên ván bằng `stepMove` + các hộp `walk` dưới đây,
 * client chỉ dự đoán cùng dữ liệu.
 *
 * Mặt cầu: võng parabol giữa nhịp (`sag`), hai đầu cao hơn mặt đất `lift` (≤ STEP_UP nên bước lên được từ đất). Lan can là tường đặc cao
 * `RAIL_TOP` trên mặt cầu (cao hơn độ nhảy ~1,5 m): không nhảy/đẩy lùi qua lan can được, không rơi xuống hác. Hai đầu cầu để hở.
 */
export const BRIDGE = {
  /** Bề rộng ván (m). */
  width: 3,
  /** Độ võng giữa nhịp (m). */
  sag: 1.6,
  /** Đầu cầu cao hơn mặt đất (m); phải ≤ STEP_UP. */
  lift: 0.1,
  /** Độ dày hộp ván (m). */
  thick: 0.4,
  /** Chiều dài mỗi đoạn va chạm (m). */
  seg: 2,
  /** Lan can: bề dày (m) và độ cao đỉnh tường trên mặt cầu (m). */
  railT: 0.2,
  railTop: 2.4,
} as const;

export interface BridgeModel {
  /** Hai đầu (tọa độ thế giới) và cao độ mặt cầu tại đó. */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  ya: number;
  yb: number;
  len: number;
  /** Vector đơn vị A → B. */
  dx: number;
  dz: number;
}

/** Dựng mô hình từ hàm độ cao mặt đất (`groundAt` của Vân Lam). */
export function bridgeModel(groundAt: (x: number, z: number) => number): BridgeModel {
  const ax = TC_ORIGIN.x + BRIDGE_A[0];
  const az = TC_ORIGIN.z + BRIDGE_A[1];
  const bx = TC_ORIGIN.x + BRIDGE_B[0];
  const bz = TC_ORIGIN.z + BRIDGE_B[1];
  const len = Math.hypot(bx - ax, bz - az);
  return {
    ax,
    az,
    bx,
    bz,
    ya: groundAt(ax, az) + BRIDGE.lift,
    yb: groundAt(bx, bz) + BRIDGE.lift,
    len,
    dx: (bx - ax) / len,
    dz: (bz - az) / len,
  };
}

/** Cao độ mặt cầu tại tham số t ∈ [0, 1] dọc nhịp (A → B). */
export function cauTreoDeckY(m: Pick<BridgeModel, 'ya' | 'yb'>, t: number): number {
  return m.ya + (m.yb - m.ya) * t - BRIDGE.sag * 4 * t * (1 - t);
}

/** Điểm (x, z) nằm trên ván cầu (trong `margin` m quanh dải)? Trả tham số t dọc nhịp, hoặc null. Không phụ thuộc độ cao (dùng cho tiếng bước chân). */
export function bridgeSurfaceT(m: Pick<BridgeModel, 'ax' | 'az' | 'dx' | 'dz' | 'len'>, x: number, z: number, margin = 0): number | null {
  const rx = x - m.ax;
  const rz = z - m.az;
  const along = rx * m.dx + rz * m.dz;
  const across = -rx * m.dz + rz * m.dx;
  if (along < -margin || along > m.len + margin || Math.abs(across) > BRIDGE.width / 2 + margin) return null;
  return Math.min(1, Math.max(0, along / m.len));
}

/** Hộp va chạm: ván (đi được, dốc theo võng) + hai lan can (tường đặc). Thứ tự và giá trị tất định. */
export function bridgeShapes(m: BridgeModel): Shape[] {
  const out: Shape[] = [];
  const n = Math.max(1, Math.round(m.len / BRIDGE.seg));
  // Quy ước yaw của hộp (Three.js rotation.y): trục cục bộ +z hướng về (sin yaw, cos yaw) trên mặt phẳng xz; hộp dốc: y1 ở mép -z, y1b ở mép +z.
  const yaw = Math.atan2(m.dx, m.dz);
  const hw = BRIDGE.width / 2;
  const nx = -m.dz;
  const nz = m.dx;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const tm = (t0 + t1) / 2;
    const cx = m.ax + m.dx * m.len * tm;
    const cz = m.az + m.dz * m.len * tm;
    const y0 = cauTreoDeckY(m, t0);
    const y1 = cauTreoDeckY(m, t1);
    const hz = m.len / n / 2 + 0.02; // chồng nhẹ để không hở khe giữa hai đoạn
    out.push({
      k: 'box',
      x: cx,
      z: cz,
      hx: hw,
      hz,
      yaw,
      y0: Math.min(y0, y1) - BRIDGE.thick,
      y1: y0,
      y1b: y1,
      walk: true,
      tag: 'cau_treo_van',
    });
    for (const side of [-1, 1]) {
      const top = Math.max(y0, y1) + BRIDGE.railTop;
      out.push({
        k: 'box',
        x: cx + nx * (hw + BRIDGE.railT / 2) * side,
        z: cz + nz * (hw + BRIDGE.railT / 2) * side,
        hx: BRIDGE.railT / 2,
        hz,
        yaw,
        y0: Math.min(y0, y1) - BRIDGE.thick,
        y1: top,
        walk: false,
        fly: 'pass',
        tag: 'cau_treo_lan_can',
      });
    }
  }
  return out;
}

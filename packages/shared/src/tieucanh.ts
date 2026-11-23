import { hash01 } from './noise';

/**
 * Tiểu cảnh Lạc Kiếm Tông (Chân Cảnh M1+M2): bố cục các vật đặc, DÙNG CHUNG client (dựng hình `lacKiemScenes.ts`) và server (va chạm, qua
 * `registerTerrain`), tọa độ tương đối tâm tông môn (SECT: 2048, 2048). COL-1: mọi vật nhìn thấy cao ≥ 0,6 m phải chặn; chỉ ao, phiến lối men vách,
 * dây/ván cầu treo cao và lớp sương/nước là đi xuyên được. Cột cổng bài chừa lối 9 m ở giữa.
 */
export const TC_ORIGIN = { x: 2048, z: 2048 } as const;

export type SceneGlbId =
  | 'prop_tc_da_reu'
  | 'prop_tc_den_da'
  | 'prop_tc_bia_khac'
  | 'prop_tc_tre'
  | 'prop_tc_cot_da_do'
  | 'prop_kiem_gay'
  | 'prop_tc_linh_thao'
  | 'prop_tc_long_den_giay'
  | 'prop_tc_hang_rao_tre';

export interface SceneGlb {
  id: SceneGlbId;
  x: number;
  z: number;
  yaw: number;
  /** Cạnh dài nhất sau co giãn (m). */
  h: number;
  rx?: number;
  rz?: number;
  sink?: number;
}

/** Cổng bài ngoài sơn môn: hai cột son cách nhau `w` (lối đi giữa rộng w − 2·bán kính cột). */
export const TC_GATE = { x: 0, z: 120, yaw: 0, w: 9, pillarR: 0.9 } as const;
/** Ao sen. */
export const TC_POND = { x: -62, z: 66, r: 8.5 } as const;
/** Cầu treo qua hác: tâm, hướng (rad), nửa nhịp (m). Hai đầu cầu là hai bờ hác (đo từ heightmap). */
export const TC_BRIDGE = { cx: -146, cz: 91, dir: (105 * Math.PI) / 180, half: 22 } as const;
export const BRIDGE_A: [number, number] = [
  TC_BRIDGE.cx - Math.cos(TC_BRIDGE.dir) * TC_BRIDGE.half,
  TC_BRIDGE.cz - Math.sin(TC_BRIDGE.dir) * TC_BRIDGE.half,
];
export const BRIDGE_B: [number, number] = [
  TC_BRIDGE.cx + Math.cos(TC_BRIDGE.dir) * TC_BRIDGE.half,
  TC_BRIDGE.cz + Math.sin(TC_BRIDGE.dir) * TC_BRIDGE.half,
];

const glb = (id: SceneGlbId, x: number, z: number, h: number, yaw = 0, o: Partial<SceneGlb> = {}): SceneGlb => ({ id, x, z, yaw, h, ...o });
const lanterns = (x: number, z0: number, z1: number, n: number): SceneGlb[] =>
  Array.from({ length: n }, (_, i) => glb('prop_tc_den_da', x, z0 + ((z1 - z0) * i) / (n - 1), 2.5, hash01(i, 1, 4) * 6));
/** Cụm tre tiền cảnh. */
const bamboo = (x: number, z: number, n = 3): SceneGlb[] =>
  Array.from({ length: n }, (_, i) =>
    glb('prop_tc_tre', x + hash01(i, 2, 4) * 3 - 1.5, z + hash01(i, 3, 4) * 3 - 1.5, 5 + hash01(i, 4, 4) * 2.5, hash01(i, 5, 4) * 6),
  );
/** Đá viền ao. */
const pondRim = (): SceneGlb[] =>
  Array.from({ length: 11 }, (_, k) => {
    const a = (k / 11) * Math.PI * 2 + hash01(k, 7, 8) * 0.3;
    const rr = TC_POND.r + 0.7 + hash01(k, 7, 2) * 0.9;
    return glb(
      'prop_tc_da_reu',
      TC_POND.x + Math.cos(a) * rr,
      TC_POND.z + Math.sin(a) * rr,
      0.7 + hash01(k, 7, 3) * 0.9,
      hash01(k, 7, 1) * 6,
      { sink: 0.15 },
    );
  });

/** Vật GLB của từng tiểu cảnh (id cảnh khớp `SCENES` ở client). */
export const SCENE_GLB: Record<string, SceneGlb[]> = {
  cong_bai: [
    ...lanterns(-6.5, 96, 140, 5),
    ...lanterns(6.5, 96, 140, 5),
    glb('prop_tc_da_reu', -14, 124, 2.4, 0.6),
    glb('prop_tc_da_reu', 15, 118, 2.0, 2.1),
    glb('prop_tc_da_reu', 13, 129, 1.2, 4.0),
    ...bamboo(9, 120, 3),
    ...bamboo(-10, 123, 2),
  ],
  ao_sen: [
    ...pondRim(),
    glb('prop_tc_da_reu', -70, 60, 2.2, 0.4),
    glb('prop_tc_da_reu', -53, 73, 1.6, 2.2),
    glb('prop_tc_den_da', -54, 60, 2.5, 0.3),
    glb('prop_tc_bia_khac', -74, 72, 3.0, 0.5),
    glb('prop_tc_linh_thao', -56, 58, 1.2, 0.7),
    ...bamboo(-52, 66, 3),
  ],
  kiem_bia: [
    glb('prop_tc_bia_khac', 66, 64, 3.6, -0.4),
    glb('prop_kiem_gay', 60.5, 62, 4.2, 0.3, { rz: 0.12 }),
    glb('prop_kiem_gay', 62, 69, 3.4, -0.5, { rz: -0.1 }),
    glb('prop_kiem_gay', 71, 68, 4.6, 1.2, { rz: 0.16 }),
    glb('prop_kiem_gay', 72, 60, 3.0, 2.4, { rz: -0.14 }),
    glb('prop_kiem_gay', 66, 56, 3.8, 3.0, { rz: 0.1 }),
    glb('prop_tc_den_da', 58, 70, 2.5, 1),
    glb('prop_tc_den_da', 74, 55, 2.5, 2),
    glb('prop_tc_da_reu', 76, 66, 1.8, 0.9),
    glb('prop_tc_linh_thao', 64, 60, 1.1, 0.2),
    ...bamboo(74, 64, 3),
  ],
  loi_vach: [
    glb('prop_tc_da_reu', -108, 50, 2.0, 0.2),
    glb('prop_tc_da_reu', -122, 71, 2.2, 1.0),
    glb('prop_tc_da_reu', -112, 67, 1.1, 2.0),
    glb('prop_tc_den_da', -98, 60, 2.5, 0.5),
    glb('prop_tc_long_den_giay', -120, 58, 2.2, 0.4),
    glb('prop_tc_hang_rao_tre', -110, 64, 3.2, 0.2),
    ...bamboo(-108, 62, 2),
  ],
  cau_treo: [
    glb('prop_tc_cot_da_do', BRIDGE_A[0] + 2.2, BRIDGE_A[1] - 0.6, 4.6, 0.2),
    glb('prop_tc_cot_da_do', BRIDGE_A[0] - 2.2, BRIDGE_A[1] + 0.6, 4.6, 0.2),
    glb('prop_tc_cot_da_do', BRIDGE_B[0] + 2.2, BRIDGE_B[1] - 0.6, 4.6, 0.2),
    glb('prop_tc_cot_da_do', BRIDGE_B[0] - 2.2, BRIDGE_B[1] + 0.6, 4.6, 0.2),
    glb('prop_tc_tre', BRIDGE_A[0] + 9, BRIDGE_A[1] - 1, 6, 0.1),
    glb('prop_tc_da_reu', BRIDGE_B[0] - 5, BRIDGE_B[1] + 3, 2.4, 0.9),
    glb('prop_tc_da_reu', BRIDGE_A[0] - 5, BRIDGE_A[1] - 3, 2.4, 0.3),
    glb('prop_tc_den_da', BRIDGE_B[0] + 4, BRIDGE_B[1] + 1, 2.5, 0.2),
  ],
  thach_lam: [
    glb('prop_tc_da_reu', 96, -12, 3.6, 0.3),
    glb('prop_tc_da_reu', 101, -6, 2.4, 1.1),
    glb('prop_tc_da_reu', 92, -4, 1.8, 2.0),
    glb('prop_tc_da_reu', 104, -12, 1.3, 4.0),
    glb('prop_tc_bia_khac', 99, -2, 3.0, 2.6),
    glb('prop_tc_den_da', 90, -14, 2.5, 0.4),
    glb('prop_tc_linh_thao', 95, -6, 1.2, 0.9),
    ...bamboo(104, 0, 3),
  ],
};

/** Bán kính va chạm (m) của một vật GLB; 0 = thấp/mềm, đi xuyên được (COL-1: bỏ qua vật dưới 0,6 m). */
export function sceneGlbRadius(g: SceneGlb): number {
  switch (g.id) {
    case 'prop_tc_den_da':
      return 0.45;
    case 'prop_kiem_gay':
      return 0.35;
    case 'prop_tc_bia_khac':
      return 0.7;
    case 'prop_tc_tre':
      return 0.4;
    case 'prop_tc_cot_da_do':
      return 0.75;
    case 'prop_tc_long_den_giay':
      return 0.3;
    case 'prop_tc_hang_rao_tre':
      return 0.9;
    case 'prop_tc_da_reu':
    case 'prop_tc_da_reu':
      return g.h < 0.6 ? 0 : Math.min(1.6, g.h * 0.5);
    default:
      return 0; // linh thảo: thấp
  }
}

/** Vòng va chạm của tiểu cảnh (toạ độ thế giới): cột cổng bài, mọi vật GLB đặc. Ao, phiến đá, cầu treo cao không chặn. */
export function lacKiemSceneColliders(): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  const ox = TC_ORIGIN.x;
  const oz = TC_ORIGIN.z;
  for (const s of [-1, 1]) {
    const px = TC_GATE.x + Math.cos(TC_GATE.yaw) * s * (TC_GATE.w / 2);
    const pz = TC_GATE.z - Math.sin(TC_GATE.yaw) * s * (TC_GATE.w / 2);
    out.push({ x: ox + px, z: oz + pz, r: TC_GATE.pillarR });
  }
  for (const list of Object.values(SCENE_GLB))
    for (const g of list) {
      const r = sceneGlbRadius(g);
      if (r > 0) out.push({ x: ox + g.x, z: oz + g.z, r });
    }
  return out;
}

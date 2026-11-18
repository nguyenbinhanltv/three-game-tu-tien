// Thư viện prop môi trường theo bản đồ mở rộng (E2: Đoạn Mạch Cổ Cốc / Vân Hải Phù Đảo / Thiên Khuyết Cổ Thành).
// Chỉ là dữ liệu: id asset (assets/source/prop/<id>), bản đồ dùng, va chạm đơn giản (hình tròn, cùng kiểu `COLLIDERS` của level.ts),
// cờ rải lặp (instancing qua pool của `game/props.ts`). Chưa rải vào bản đồ nào (E2-A/E2-I).
// Quy ước hướng (đã bake trong GLB): mặt trước/lối đi nhìn +Z, trục dài của cầu chạy theo Z, cổng thành trải theo X.
import type { CircleCollider } from './level';

/** Id bản đồ tạm dùng trong thư viện; E2-A đổi tên level thì sửa ở đây. */
export type PropMapId = 'doan_mach' | 'van_hai' | 'co_thanh';
export type PropLibKind = 'gate' | 'bridge' | 'tree' | 'rock' | 'poi' | 'arch' | 'light' | 'artifact';

/** Vòng va chạm theo tọa độ cục bộ của prop (mét, trước khi nhân `s` và xoay `yaw`). */
export interface LocalCircle {
  x: number;
  z: number;
  r: number;
}

export interface PropLibEntry {
  id: string;
  map: PropMapId;
  kind: PropLibKind;
  /** Rải lặp nhiều bản (cây, đá, cột, đèn): dùng pool instancing; false = đặt tay, một vài bản. */
  repeat: boolean;
  /** Chiều cao (m) lúc `s` = 1. */
  h: number;
  /** Va chạm; rỗng = đi xuyên được (cầu, đình, vật lơ lửng, pháp bảo). */
  colliders: readonly LocalCircle[];
  /** Có mặt đi bộ (cầu): E2 phải xử lý độ cao nền đi được, không chỉ va chạm. */
  walkable?: boolean;
}

const c = (x: number, z: number, r: number): LocalCircle => ({ x, z, r });

export const PROP_LIB: readonly PropLibEntry[] = [
  // Đoạn Mạch Cổ Cốc
  { id: 'prop_cong_khai_mach', map: 'doan_mach', kind: 'gate', repeat: false, h: 6, colliders: [c(0, 0, 4.4)] },
  { id: 'prop_cau_da_gay', map: 'doan_mach', kind: 'bridge', repeat: false, h: 5.45, colliders: [], walkable: true },
  { id: 'prop_mach_tinh_tru', map: 'doan_mach', kind: 'poi', repeat: true, h: 3.5, colliders: [c(0, 0, 1.6)] },
  { id: 'prop_cay_goc_kho', map: 'doan_mach', kind: 'tree', repeat: true, h: 6, colliders: [c(0, 0, 0.9)] },
  { id: 'prop_tru_nham_do', map: 'doan_mach', kind: 'rock', repeat: true, h: 8, colliders: [c(0, 0, 2.8)] },
  { id: 'prop_ngung_dan_lo', map: 'doan_mach', kind: 'artifact', repeat: false, h: 0.4, colliders: [] },
  // Vân Hải Phù Đảo
  { id: 'prop_phu_dao_dinh', map: 'van_hai', kind: 'arch', repeat: false, h: 6, colliders: [] },
  { id: 'prop_cau_may', map: 'van_hai', kind: 'bridge', repeat: false, h: 4.18, colliders: [], walkable: true },
  { id: 'prop_kinh_ho_dai', map: 'van_hai', kind: 'poi', repeat: false, h: 3.08, colliders: [c(0, 0, 2.8)] },
  { id: 'prop_da_troi', map: 'van_hai', kind: 'rock', repeat: true, h: 8, colliders: [] },
  { id: 'prop_tung_phu_dao', map: 'van_hai', kind: 'tree', repeat: true, h: 7.5, colliders: [c(0, 0, 0.8)] },
  { id: 'prop_anh_ngoc_kinh', map: 'van_hai', kind: 'artifact', repeat: false, h: 0.36, colliders: [] },
  // Thiên Khuyết Cổ Thành
  { id: 'prop_dai_tinh_bai', map: 'co_thanh', kind: 'poi', repeat: false, h: 2.43, colliders: [c(0, 0, 3.8)] },
  // Cổng: hai tháp ở hai bên, lối đi giữa rộng 7 m (|x| < 3,5).
  { id: 'prop_cong_thanh_vo', map: 'co_thanh', kind: 'gate', repeat: false, h: 14, colliders: [c(-8, 0, 4.5), c(8, 0, 4.5)] },
  { id: 'prop_den_long_troi', map: 'co_thanh', kind: 'light', repeat: true, h: 1.2, colliders: [] },
  { id: 'prop_tru_da_khac_van', map: 'co_thanh', kind: 'rock', repeat: true, h: 9, colliders: [c(0, 0, 1.4)] },
  {
    id: 'prop_tuong_da_vo_si',
    map: 'co_thanh',
    kind: 'arch',
    repeat: false,
    h: 7,
    colliders: [c(-3.3, 0, 2.8), c(0, 0, 2.8), c(3.3, 0, 2.8)],
  },
  { id: 'prop_than_nien_chau', map: 'co_thanh', kind: 'artifact', repeat: false, h: 0.23, colliders: [] },
];

const BY_ID = new Map(PROP_LIB.map((p) => [p.id, p]));

export function propLibEntry(id: string): PropLibEntry | undefined {
  return BY_ID.get(id);
}

export function propLibForMap(map: PropMapId): PropLibEntry[] {
  return PROP_LIB.filter((p) => p.map === map);
}

/** Va chạm thế giới của một bản prop đặt tại (x, z) xoay `yaw` (rad, quanh +Y như three.js) tỉ lệ `s`. */
export function propColliders(id: string, x: number, z: number, yaw = 0, s = 1): CircleCollider[] {
  const e = BY_ID.get(id);
  if (!e) return [];
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return e.colliders.map((k) => ({ x: x + (k.x * cs + k.z * sn) * s, z: z + (-k.x * sn + k.z * cs) * s, r: k.r * s }));
}

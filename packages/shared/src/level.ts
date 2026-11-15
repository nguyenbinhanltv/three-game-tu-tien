// Bố cục bản đồ Vân Lam Sơn Mạch. Dùng chung cho địa hình (client + server),
// va chạm và vị trí các khu. Đơn vị: mét. x về phía đông, z về phía nam.

import { PROP_COLLIDERS } from './props';

export const WORLD_SIZE = 4096;
export const WORLD_MARGIN = 24;
export const TERRAIN_SEED = 20261112;

export interface Feature {
  x: number;
  z: number;
  /** Độ cao mục tiêu của vùng phẳng. */
  y: number;
  /** Trong bán kính này địa hình phẳng hẳn. */
  flatR: number;
  /** Ngoài bán kính này địa hình tự nhiên. */
  outerR: number;
}

/** Lạc Kiếm Tông: đỉnh núi phẳng, hub an toàn. */
export const SECT: Feature = { x: 2048, z: 2048, y: 150, flatR: 95, outerR: 330 };
/**
 * Bố cục M-1: vùng chơi chính ~2,2 × 2,2 km quanh tông môn, các vùng cách tông môn 300–500 m xếp quanh ngọn núi,
 * ngoài ranh là vách đá và sương (xem `PLAY_HALF`, `playDist`). Thế giới 4096 m giữ làm cảnh xa.
 */
/** Thung lũng Thanh Phong chân núi, phía nam: khu Ngưng Khí 1–4. */
export const VALLEY: Feature = { x: 2048, z: 2460, y: 42, flatR: 110, outerR: 240 };
/** Suối Thanh Khê, đông nam, nối thung lũng với rừng: Ngưng Khí 4–8. */
export const SUOI: Feature = { x: 2390, z: 2440, y: 58, flatR: 70, outerR: 190 };
/** Rừng linh thảo, phía đông: Ngưng Khí 8–11. */
export const FOREST: Feature = { x: 2450, z: 2110, y: 74, flatR: 130, outerR: 270 };
/** Vách Đá Ngọc, đông bắc: thạch viên, u minh lang, mỏ khoáng; Ngưng Khí 11–15. */
export const VACH: Feature = { x: 2450, z: 1740, y: 122, flatR: 70, outerR: 200 };
/** Hồ sương mù, phía tây: boss thế giới. */
export const LAKE: Feature = { x: 1640, z: 2230, y: 16, flatR: 120, outerR: 300 };
/** Bệ đá cổng bí cảnh, phía bắc. */
export const PORTAL_PAD: Feature = { x: 2048, z: 1720, y: 96, flatR: 55, outerR: 170 };

/** Kiếm Trủng: lòng chảo giữa núi phía tây bắc, cách bệ cổng ~675 m qua đèo; đấu trường của bí cảnh. */
export const KIEM_TRUNG: Feature = { x: 1520, z: 1300, y: 150, flatR: 78, outerR: 215 };
export const DUNGEON_SPAWN = { x: 1520, z: 1352 };
export const DUNGEON_EXIT = { x: 1520, z: 1370 };
export const DUNGEON_MIN_LEVEL = 8;

/** Nửa cạnh vùng chơi chính (m) quanh tông môn: 2,2 km mỗi chiều. Ngoài đó là vách, không đi tiếp được. */
export const PLAY_HALF = 1100;
/** Vùng chơi chính theo toạ độ thế giới (đo đạc, công cụ báo cáo). */
export const PLAY_BOUNDS = { x0: SECT.x - PLAY_HALF, z0: SECT.z - PLAY_HALF, x1: SECT.x + PLAY_HALF, z1: SECT.z + PLAY_HALF };
/** Khoảng cách "ô vuông bo tròn" từ tông môn tới (x, z): bằng PLAY_HALF trên giữa cạnh, ~1,19× ở góc. */
export function playDist(x: number, z: number): number {
  const dx = Math.abs(x - SECT.x);
  const dz = Math.abs(z - SECT.z);
  return Math.sqrt(Math.sqrt(dx * dx * dx * dx + dz * dz * dz * dz));
}
/** Chân vách: không đi (hay bay) quá ranh này. Vách dựng lên ngay sau đó (terrain.ts). */
export const PLAY_WALL = PLAY_HALF - 10;

export const WATER_Y = 30;
/** Người và quái lội nước sâu tối đa chừng này. */
export const WADE_DEPTH = 1.3;
export const LAKE_WATER_R = 300;
export const ISLAND_R = 40;
/** Bãi ven hồ: phẳng tới LAKE_SHELF_R, hết dốc lên núi ở LAKE_SHELF_OUT; cao độ cao hơn mặt nước ~3 m. */
export const LAKE_SHELF_R = 215;
export const LAKE_SHELF_OUT = 330;
export const LAKE_SHELF_Y = WATER_Y + 3.4;

export const SPAWN_POINT = { x: 2048, z: 2088 };

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

/** Va chạm tĩnh của kiến trúc tông môn (xấp xỉ bằng hình tròn). */
export const COLLIDERS: CircleCollider[] = [
  { x: 2048, z: 2004, r: 17 }, // Chính điện
  { x: 1996, z: 2052, r: 8 }, // Đan phòng
  { x: 2100, z: 2052, r: 8 }, // Tàng Kiếm Các
  { x: 2040, z: 2128, r: 1.6 }, // Trụ cổng trái
  { x: 2056, z: 2128, r: 1.6 }, // Trụ cổng phải
  { x: 2048, z: 2066, r: 2.4 }, // Lư hương giữa sân
  { x: 2048, z: 1700, r: 3.2 }, // Cổng bí cảnh (khối đá)
  { x: 1520, z: 1300, r: 3.4 }, // Cự kiếm giữa Kiếm Trủng
  ...PROP_COLLIDERS, // Prop điểm nhấn có va chạm (cổ thụ, tượng thú, lư hương)
];

/**
 * Vật che tầm nhìn camera (chỉ dùng ở client để làm mờ, không chặn đường đi): mọi collider
 * cộng phần kiến trúc treo cao không có va chạm như mái và xà cổng.
 */
export const OCCLUDERS: CircleCollider[] = [
  ...COLLIDERS,
  // Cổng tam quan (z = 2128): mái giữa rộng 22 m và hai mái bên.
  { x: 2031, z: 2128, r: 4.5 },
  { x: 2040, z: 2128, r: 5 },
  { x: 2048, z: 2128, r: 5 },
  { x: 2056, z: 2128, r: 5 },
  { x: 2065, z: 2128, r: 4.5 },
  { x: 2048, z: 1708, r: 5.5 }, // Cổng đá bí cảnh
  { x: 1520, z: 1370, r: 5.5 }, // Cổng ra Kiếm Trủng
];

export const PORTAL_POS = { x: 2048, z: 1708 };
export const BOSS_POS = { x: LAKE.x, z: LAKE.z };

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

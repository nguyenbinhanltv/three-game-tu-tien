// Bố cục bản đồ Vân Lam Sơn Mạch. Dùng chung cho địa hình (client + server),
// va chạm và vị trí các khu. Đơn vị: mét. x về phía đông, z về phía nam.

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
/** Thung lũng chân núi: khu Ngưng Khí 1–7. */
export const VALLEY: Feature = { x: 2048, z: 2640, y: 42, flatR: 300, outerR: 560 };
/** Rừng linh thảo: khu Ngưng Khí 8–15. */
export const FOREST: Feature = { x: 2720, z: 2180, y: 74, flatR: 330, outerR: 560 };
/** Hồ sương mù: boss thế giới. */
export const LAKE: Feature = { x: 1380, z: 2180, y: 16, flatR: 170, outerR: 420 };
/** Bệ đá cổng bí cảnh. */
export const PORTAL_PAD: Feature = { x: 2048, z: 1520, y: 96, flatR: 55, outerR: 200 };

/** Kiếm Trủng: lòng chảo giữa núi phía tây bắc, đấu trường của bí cảnh. */
export const KIEM_TRUNG: Feature = { x: 900, z: 1000, y: 150, flatR: 78, outerR: 215 };
export const DUNGEON_SPAWN = { x: 900, z: 1052 };
export const DUNGEON_EXIT = { x: 900, z: 1070 };
export const DUNGEON_MIN_LEVEL = 8;

export const WATER_Y = 30;
/** Người và quái lội nước sâu tối đa chừng này. */
export const WADE_DEPTH = 1.3;
export const LAKE_WATER_R = 430;
export const ISLAND_R = 46;

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
  { x: 2048, z: 1500, r: 3.2 }, // Cổng bí cảnh (khối đá)
  { x: 900, z: 1000, r: 3.4 }, // Cự kiếm giữa Kiếm Trủng
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
  { x: 2048, z: 1508, r: 5.5 }, // Cổng đá bí cảnh
  { x: 900, z: 1070, r: 5.5 }, // Cổng ra Kiếm Trủng
];

export const PORTAL_POS = { x: 2048, z: 1508 };
export const BOSS_POS = { x: LAKE.x, z: LAKE.z };

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

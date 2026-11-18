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

// ---- Địa hình dữ liệu hóa (E1-A): mỗi level một TerrainDef; `terrainOf(levelId)` ở terrain.ts dựng hàm từ đây ----

/** Biome tính theo trọng số khu (xem `TerrainDef.biomes`). */
export type Biome = 'sect' | 'valley' | 'forest' | 'lake' | 'wild' | 'dungeon';

/** Khu đặt vào địa hình: vùng phẳng + chuyển tiếp mượt. Áp theo thứ tự khai báo. */
export interface TerrainFeature extends Feature {
  id: string;
  /** Giữ hình tròn (không méo bằng nhiễu): kiến trúc/đấu trường dựng theo bán kính. */
  round?: boolean;
  /** Hệ số nhiễu chi tiết cộng vào độ cao mục tiêu (m). */
  detail?: number;
  /** Cộng thêm sống núi nhỏ (vách đá). */
  ridge?: { amp: number; freq: number; oct: number; seedOff: number };
  /**
   * Nhấp nhô mặt khu tròn (E3-I, đảo nổi): biên độ `amp` (m), tần số `freq` (1/m), `crease` = nếp gấp (gò đá nhọn thay vì đồi tròn). Về 0 ở rìa
   * (6–46 m trong mép) nên đầu cầu, thang và vách vẫn ở đúng `y`.
   */
  relief?: { amp: number; freq: number; crease?: boolean };
  /** Khu là hồ: bãi ven hồ, đảo giữa hồ, kẹp rìa lòng hồ. Cần `water`. */
  lake?: { islandR: number; islandTop: number; shelfR: number; shelfOut: number; shelfY: number; waterR: number };
}

export interface NaturalDef {
  /** Tần số nhiễu nền (1/m). */
  freq: number;
  baseOct: number;
  ridgeOct: number;
  /** Độ cao nền, biên độ nhiễu nền, biên độ sống núi. */
  level: number;
  baseAmp: number;
  ridgeAmp: number;
  /** Mặt nạ vùng núi: tần số, số tầng, ngưỡng dưới/trên. */
  maskFreq: number;
  maskOct: number;
  maskLo: number;
  maskHi: number;
  /** Ngọn núi lớn dưới chân tâm khu (nếu có): cộng `amp` khi gần, hết ở `r0`, đầy ở `r1`. */
  hill?: { x: number; z: number; amp: number; r0: number; r1: number };
  /** Dãy núi quanh rìa thế giới. */
  edge?: { amp: number; r0: number; r1: number };
}

export interface IslandDef {
  x: number;
  z: number;
  /** Mặt đảo phẳng trong bán kính này. */
  r: number;
  /** Chuyển tiếp ra ngoài thêm chừng này (m). */
  edge: number;
  y: number;
}

/** Cầu xích nối hai điểm trên đảo (E3-N): dải đi được, độ cao nội suy giữa hai đầu, võng nhẹ ở giữa. */
export interface BridgeDef {
  id: string;
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  /** Nửa bề rộng mặt cầu (m). */
  halfW: number;
  /** Độ võng giữa nhịp (m). */
  sag: number;
}

export interface TerrainDef {
  id: string;
  seed: number;
  /** Cạnh thế giới (m) và lề không đi vào. */
  size: number;
  margin: number;
  natural: NaturalDef;
  features: TerrainFeature[];
  /** Đảo nổi: có thì nền tự nhiên bị thay bằng `voidFloor`, chỉ còn đảo và các khu. */
  islands?: IslandDef[];
  /** Độ cao khoảng trống giữa các đảo (m): sàn mây đi bộ được, rơi xuống đây không chết. */
  voidFloor?: number;
  /** Cầu xích nối các đảo (E3-N). */
  bridges?: BridgeDef[];
  /** Hồ gương nông trên đảo (E3-I): lòng chảo lõm `depth` m, đi bộ được (không phải `water`), client vẽ mặt nước phẳng. */
  ponds?: { x: number; z: number; r: number; depth: number }[];
  /** Đảo giả (E3-N): chỉ để vẽ, KHÔNG vào `heightAt` (bước lên là rơi xuống sàn mây); thần thức làm chúng mờ đi. */
  fakeIslands?: IslandDef[];
  /** Mặt nước, độ lội tối đa, đĩa nước của hồ. */
  water?: { y: number; wade: number; lake?: { x: number; z: number; r: number } };
  /**
   * Hẻm núi (DV-3K, phó bản Xích Tẫn Khích): sàn phẳng hình chữ nhật bo tròn nửa rộng `halfW` (x) × nửa dài `halfL` (z) quanh (`cx`, `cz`), vách dựng lên `wallH` m
   * trong `rise` m (dốc hơn `MAX_SLOPE_UP` nên chặn leo, xem `blockRise`), mép vách uốn lượn `wobble` m, gân đá `rib` m; ngoài vách là cao nguyên phẳng ở `wallH`.
   * Cộng vào độ cao nền (`natural.level` là cao độ sàn).
   */
  canyon?: { cx: number; cz: number; halfW: number; halfL: number; wallH: number; rise: number; wobble: number; rib: number };
  /** Ranh vùng chơi: ô vuông bo tròn quanh tâm, vách dựng lên sau `half - 10`. */
  play?: { cx: number; cz: number; half: number; wallH: number };
  /** Biome theo khu, ưu tiên từ trên xuống; mặc định 'wild'. */
  biomes?: { feature: string; biome: Biome; min: number }[];
  /** Va chạm tĩnh hình tròn của level. */
  colliders: CircleCollider[];
}

/** Địa hình Vân Lam Sơn Mạch (và Kiếm Trủng, cùng một thế giới). Kết quả giống hệt `heightAt` cũ từng bit. */
export const VAN_LAM_TERRAIN: TerrainDef = {
  id: 'van_lam',
  seed: TERRAIN_SEED,
  size: WORLD_SIZE,
  margin: WORLD_MARGIN,
  natural: {
    freq: 0.0011,
    baseOct: 5,
    ridgeOct: 4,
    level: 78,
    baseAmp: 56,
    ridgeAmp: 340,
    maskFreq: 0.00055,
    maskOct: 2,
    maskLo: -0.35,
    maskHi: 0.3,
    hill: { x: SECT.x, z: SECT.z, amp: 110, r0: 1100, r1: 150 },
    edge: { amp: 220, r0: 420, r1: 40 },
  },
  features: [
    { ...VALLEY, id: 'valley', detail: 2.2 },
    { ...SUOI, id: 'suoi', detail: 3 },
    { ...FOREST, id: 'forest', detail: 3.5 },
    { ...VACH, id: 'vach', detail: 6, ridge: { amp: 14, freq: 0.02, oct: 2, seedOff: 31 } },
    { ...PORTAL_PAD, id: 'portal', round: true },
    {
      ...LAKE,
      id: 'lake',
      lake: {
        islandR: ISLAND_R,
        islandTop: WATER_Y + 4,
        shelfR: LAKE_SHELF_R,
        shelfOut: LAKE_SHELF_OUT,
        shelfY: LAKE_SHELF_Y,
        waterR: LAKE_WATER_R,
      },
    },
    { ...KIEM_TRUNG, id: 'kiem_trung', round: true, detail: 0.6 },
    { ...SECT, id: 'sect', round: true },
  ],
  water: { y: WATER_Y, wade: WADE_DEPTH, lake: { x: LAKE.x, z: LAKE.z, r: LAKE_WATER_R } },
  play: { cx: SECT.x, cz: SECT.z, half: PLAY_HALF, wallH: 330 },
  biomes: [
    { feature: 'sect', biome: 'sect', min: 0.6 },
    { feature: 'kiem_trung', biome: 'dungeon', min: 0.3 },
    { feature: 'lake', biome: 'lake', min: 0.3 },
    { feature: 'forest', biome: 'forest', min: 0.35 },
    { feature: 'valley', biome: 'valley', min: 0.35 },
    { feature: 'suoi', biome: 'valley', min: 0.35 },
  ],
  colliders: COLLIDERS,
};

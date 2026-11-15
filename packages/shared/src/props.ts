// Prop điểm nhấn đặt tay (P2-A4, brief level-dressing P2-A1). Chỉ dữ liệu thuần, không import gì để level.ts dùng được
// (COLLIDERS) mà không vòng phụ thuộc. Cao độ lấy từ heightAt lúc dựng cảnh (client). Rải tự động theo khu:
// apps/client/src/game/propScatter.ts.

export interface HandProp {
  /** Asset id (assets/source/prop/<id>). */
  id: string;
  x: number;
  z: number;
  /** Quay quanh Y (rad); mặt trước model nhìn +Z khi 0. */
  yaw: number;
  /** Tỉ lệ đều so với kích thước chuẩn của asset. */
  s: number;
  /** Bán kính va chạm (m); không có thì không chặn đường. */
  r?: number;
}

const PI = Math.PI;
const lantern = (x: number, z: number, s = 1): HandProp => ({ id: 'prop_den_da', x, z, yaw: 0, s });
const guard = (x: number, z: number, yaw: number): HandProp => ({ id: 'prop_tuong_canh', x, z, yaw, s: 1, r: 0.9 });

export const HAND_PROPS: readonly HandProp[] = [
  // --- 01 Lạc Kiếm Tông: 8 đèn thay đèn cũ (4 cặp dọc lối), cặp tượng thú ngoài trụ cổng, lư hương sân tây ---
  ...[2080, 2092, 2104, 2116].flatMap((z) => [lantern(2040.5, z), lantern(2055.5, z)]),
  guard(2034.5, 2133, 0),
  guard(2061.5, 2133, 0),
  { id: 'prop_lu_huong', x: 2028, z: 2076, yaw: 0.6, s: 1, r: 1.1 },
  // --- 02 Sơn đạo: 3 cặp đèn, bia mốc đầu/ngoặt/cuối, thông nghênh khách ở khúc ngoặt ---
  ...[2160, 2200, 2240].flatMap((z) => [lantern(2042, z), lantern(2054, z)]),
  { id: 'prop_bia_da', x: 2039, z: 2150, yaw: 0.3, s: 1 },
  { id: 'prop_bia_da', x: 2062, z: 2236, yaw: -0.5, s: 1 },
  { id: 'prop_bia_da', x: 2038, z: 2385, yaw: 0.2, s: 1 },
  { id: 'prop_thong_co', x: 2074, z: 2232, yaw: -PI / 2, s: 1 },
  // --- 03 Thung lũng Thanh Khê: cổ thụ đồng cỏ, đèn đầu đồng ---
  { id: 'prop_co_thu', x: 1990, z: 2560, yaw: 0.8, s: 1, r: 2.2 },
  lantern(2036, 2388),
  lantern(2060, 2388),
  // --- 04 Rừng Linh Thảo: cổ thụ rễ nổi ở khoảng sáng, đèn + bia cửa rừng ---
  { id: 'prop_co_thu', x: 2500, z: 2060, yaw: 2.4, s: 1.05, r: 2.4 },
  lantern(2278, 2118),
  lantern(2278, 2134),
  { id: 'prop_bia_da', x: 2286, z: 2126, yaw: 1.2, s: 1 },
  // --- 05 Hồ Sương Mù: đèn ở lối từ thung lũng xuống bãi nam hồ; bãi ven hồ cách tâm ~150–215 m, cao độ phải > 31,3 ---
  lantern(1700, 2394),
  lantern(1716, 2398),
  // --- 06 Kiếm Trủng: đèn + tượng hai bên cửa ra ---
  lantern(1509, 1366),
  lantern(1531, 1366),
  guard(1504, 1378, 0),
  guard(1536, 1378, 0),
];

/** Va chạm của prop điểm nhấn (nối vào COLLIDERS: client và server dùng chung). */
export const PROP_COLLIDERS = HAND_PROPS.filter((p) => p.r).map((p) => ({ x: p.x, z: p.z, r: p.r as number }));

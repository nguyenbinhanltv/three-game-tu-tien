// Prop điểm nhấn đặt tay (P2-A4, brief level-dressing P2-A1). Chỉ dữ liệu thuần, không import gì để level.ts dùng được
// (COLLIDERS) mà không vòng phụ thuộc. Cao độ lấy từ heightAt lúc dựng cảnh (client). Rải tự động theo khu:
// apps/client/src/game/propScatter.ts.
import { DOAN_MACH_PROPS } from './props.doanmach';
import { VAN_HAI_PROPS } from './props.vanhai';
import { THIEN_KHUYET_PROPS } from './props.thienkhuyet';
import { BAC_HOANG_PROPS } from './props.bachoang';
import { VAN_DINH_PROPS } from './props.vandinh';
import { PHUC_MACH_PROPS } from './props.phucmach';
import { KINH_NGUYET_PROPS } from './props.kinhnguyet';
import { THAN_TANG_PROPS } from './props.thantang';
import { XICH_TAN_PROPS } from './props.xichtan';
import { KIM_DA_PROPS } from './props.kimda';
import { THIEN_CONG_PROPS } from './props.thiencong';

export type { HandProp } from './props.types';
import type { HandProp } from './props.types';

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
  // --- M-5: năm điểm đáng chú ý (pois ở levels/van_lam.json), chỉ bày prop sẵn có. Mỗi cụm nằm trong khe giữa các bãi quái
  //     (cách mép bãi ≥ 6 m, `content:check` kiểm); va chạm chỉ ở trụ đá lớn, r ≤ 1,2 m, chừa lối vào từ mọi phía. ---
  // Miếu Đổ Thanh Phong (2010, 2376): bốn trụ đá nghiêng ngả quanh nền miếu, phiến đá lát, lư hương vỡ, kiếm gãy, tượng thú còn đứng.
  { id: 'prop_da_dung', x: 2004, z: 2371, yaw: 0.3, s: 1, r: 1.1 },
  { id: 'prop_da_dung', x: 2016, z: 2370, yaw: -0.4, s: 0.85, r: 1 },
  { id: 'prop_da_dung', x: 2003, z: 2383, yaw: 1.1, s: 0.7, r: 0.9 },
  { id: 'prop_da_phien', x: 2002, z: 2377, yaw: 0.15, s: 1.2 }, // chừa nền Truyền Tống Trận tp_thung_lung (2010, 2375) trống
  { id: 'prop_da_nam', x: 2018, z: 2380, yaw: 0.9, s: 0.9 },
  { id: 'prop_lu_huong', x: 2010, z: 2368, yaw: 0.2, s: 0.9 },
  { id: 'prop_kiem_gay', x: 2006, z: 2378, yaw: 2.2, s: 0.9 },
  { id: 'prop_tuong_canh', x: 2015, z: 2376, yaw: Math.PI + 0.4, s: 1 },
  lantern(2006, 2387),
  // Linh Tuyền Thanh Khê (2414, 2443): vòng đá nằm quanh mạch nước, đèn, bia, dương xỉ ẩm.
  { id: 'prop_da_nam', x: 2410, z: 2438, yaw: 0.2, s: 0.8 },
  { id: 'prop_da_nam', x: 2419, z: 2439, yaw: -0.7, s: 0.9 },
  { id: 'prop_da_nam', x: 2420, z: 2446, yaw: 1.4, s: 0.8 },
  { id: 'prop_da_nam', x: 2408, z: 2445, yaw: 2.6, s: 0.9 },
  { id: 'prop_da_phien', x: 2414, z: 2442, yaw: 0.5, s: 0.9 },
  { id: 'prop_bia_da', x: 2423, z: 2452, yaw: -0.6, s: 0.9 },
  lantern(2408, 2452),
  { id: 'prop_duong_xi', x: 2412, z: 2437, yaw: 0.3, s: 1.2 },
  { id: 'prop_duong_xi', x: 2421, z: 2443, yaw: 1.9, s: 1.3 },
  { id: 'prop_duong_xi', x: 2409, z: 2441, yaw: 4.0, s: 1.1 },
  // Đình Nghỉ Linh Thảo (2451, 2010): bốn cột đá làm bốn góc đình, phiến lát giữa, lư hương, hai đèn, trúc quanh.
  { id: 'prop_da_dung', x: 2445, z: 2004, yaw: 0, s: 0.75, r: 0.9 },
  { id: 'prop_da_dung', x: 2457, z: 2004, yaw: 0.6, s: 0.75, r: 0.9 },
  { id: 'prop_da_dung', x: 2445, z: 2016, yaw: 1.2, s: 0.75, r: 0.9 },
  { id: 'prop_da_dung', x: 2457, z: 2016, yaw: 1.8, s: 0.75, r: 0.9 },
  { id: 'prop_da_phien', x: 2451, z: 2008, yaw: 0, s: 1.3 },
  { id: 'prop_lu_huong', x: 2451, z: 2003, yaw: 0.4, s: 0.9 },
  lantern(2446, 2011),
  lantern(2456, 2011),
  { id: 'prop_truc', x: 2441, z: 2008, yaw: 0.5, s: 1 },
  { id: 'prop_truc', x: 2461, z: 2009, yaw: 2.1, s: 1.1 },
  { id: 'prop_truc', x: 2449, z: 2000, yaw: 3.3, s: 0.9 },
  // Bia Đá Vách Ngọc (2419, 1795): ba bia so le, kiếm gãy cắm quanh, đá nằm, đèn.
  { id: 'prop_bia_da', x: 2416, z: 1792, yaw: 0.2, s: 1.15, r: 0.9 },
  { id: 'prop_bia_da', x: 2423, z: 1796, yaw: -0.4, s: 1, r: 0.8 },
  { id: 'prop_bia_da', x: 2419, z: 1801, yaw: 0.9, s: 0.9 },
  { id: 'prop_kiem_gay', x: 2412, z: 1797, yaw: 1.0, s: 1 },
  { id: 'prop_kiem_gay', x: 2426, z: 1791, yaw: 2.4, s: 0.9 },
  { id: 'prop_kiem_gay', x: 2421, z: 1788, yaw: 4.1, s: 1.1 },
  { id: 'prop_da_nam', x: 2427, z: 1802, yaw: 0.4, s: 1 },
  lantern(2414, 1802),
  // Đài Canh Hồ (1490, 2288): ba bậc đá nhìn ra hồ, hai trụ, tượng thú, đèn, lau sậy.
  { id: 'prop_da_phien', x: 1490, z: 2284, yaw: 0, s: 1.3 },
  { id: 'prop_da_phien', x: 1490, z: 2288, yaw: 0.1, s: 1.15 },
  { id: 'prop_da_phien', x: 1490, z: 2292, yaw: -0.1, s: 1 },
  { id: 'prop_da_dung', x: 1483, z: 2290, yaw: 0.5, s: 0.8, r: 1 },
  { id: 'prop_da_dung', x: 1497, z: 2290, yaw: -0.3, s: 0.8, r: 1 },
  { id: 'prop_tuong_canh', x: 1490, z: 2296, yaw: Math.PI, s: 1 },
  lantern(1484, 2297),
  lantern(1496, 2297),
  { id: 'prop_lau', x: 1480, z: 2283, yaw: 0.3, s: 1 },
  { id: 'prop_lau', x: 1500, z: 2284, yaw: 1.4, s: 1.1 },
  { id: 'prop_lau', x: 1478, z: 2288, yaw: 2.2, s: 0.9 },
  // --- 06 Kiếm Trủng: đèn + tượng hai bên cửa ra ---
  lantern(1509, 1366),
  lantern(1531, 1366),
  guard(1504, 1378, 0),
  guard(1536, 1378, 0),
];

/** Va chạm của prop điểm nhấn (nối vào COLLIDERS: client và server dùng chung). */
export const PROP_COLLIDERS = HAND_PROPS.filter((p) => p.r).map((p) => ({ x: p.x, z: p.z, r: p.r as number }));

/** Level dùng chung bố cục prop (Kiếm Trủng nằm trên bản đồ Vân Lam). */
const PROP_LEVELS: Record<string, readonly HandProp[]> = {
  van_lam: HAND_PROPS,
  kiem_trung: HAND_PROPS,
  doan_mach: DOAN_MACH_PROPS,
  van_hai: VAN_HAI_PROPS,
  thien_khuyet: THIEN_KHUYET_PROPS,
  bac_hoang: BAC_HOANG_PROPS,
  van_dinh: VAN_DINH_PROPS,
  phuc_mach: PHUC_MACH_PROPS,
  kinh_nguyet: KINH_NGUYET_PROPS,
  than_tang: THAN_TANG_PROPS,
  xich_tan_khich: XICH_TAN_PROPS,
  kim_da_cung: KIM_DA_PROPS,
};

/** Prop điểm nhấn đặt tay của level, chưa gồm bộ PROP-1 (bộ rải `gen-thien-cong.ts` đọc cái này để né). */
export function basePropsOf(levelId: string): readonly HandProp[] {
  return PROP_LEVELS[levelId] ?? [];
}

/** Prop điểm nhấn của level (E1-A) + bộ "Thiên Công Khai Vật" (PROP-1); level chưa có bố cục thì rỗng. */
export function propsOf(levelId: string): readonly HandProp[] {
  const tc = THIEN_CONG_PROPS[levelId];
  return tc?.length ? [...basePropsOf(levelId), ...tc] : basePropsOf(levelId);
}

/** Va chạm của prop điểm nhấn theo level. */
export function propCollidersOf(levelId: string): { x: number; z: number; r: number }[] {
  if (
    levelId === 'phuc_mach' ||
    levelId === 'kinh_nguyet' ||
    levelId === 'than_tang' ||
    levelId === 'xich_tan_khich' ||
    levelId === 'kim_da_cung' ||
    levelId === 'luyen_than'
  )
    return [];
  if (levelId === 'doan_mach') return DOAN_MACH_PROPS.filter((p) => p.r).map((p) => ({ x: p.x, z: p.z, r: p.r as number }));
  if (levelId === 'thien_khuyet' || levelId === 'bac_hoang' || levelId === 'van_dinh') return []; // va chạm trụ/cổng/tượng nằm trong terrain.colliders (nhiều vòng mỗi prop)
  if (levelId === 'van_hai') return VAN_HAI_PROPS.filter((p) => p.r).map((p) => ({ x: p.x, z: p.z, r: p.r as number }));
  return levelId in PROP_LEVELS ? PROP_COLLIDERS : [];
}

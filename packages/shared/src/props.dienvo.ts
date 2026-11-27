// Diễn Võ Trường (phòng tập GM, level `dien_vo`): sáu khu và đạo cụ. Dùng chung client (vẽ sàn, biển tên) và server (xếp quái gọi ra, va chạm).
// Sàn vuông 48 × 48 m quanh tâm (1300, 985); +z là phía cửa ra.
import type { HandProp } from './props.types';

export const DIEN_VO_CENTER = { x: 1300, z: 985 };
/** Nửa cạnh sàn đá (m). */
export const DIEN_VO_HALF = 24;

export type DienVoZoneId = 'arena' | 'boss' | 'stage' | 'props' | 'light' | 'fx';

export interface DienVoZone {
  id: DienVoZoneId;
  x: number;
  z: number;
  /** Bán kính (khu tròn) hoặc nửa cạnh theo x và z (khu chữ nhật). */
  r?: number;
  hx?: number;
  hz?: number;
}

export const DIEN_VO_ZONES: readonly DienVoZone[] = [
  // Sàn đấu: hình nộm và quái thường, ngay trước điểm vào.
  { id: 'arena', x: 1300, z: 985, r: 8 },
  // Hố boss: phía bắc, đủ rộng cho boss thân to.
  { id: 'boss', x: 1300, z: 968, r: 6 },
  // Bục nhân vật: góc tây nam, xem nhân vật ở góc 52° và cận.
  { id: 'stage', x: 1283, z: 1001, r: 4 },
  // Hành lang đạo cụ: hàng ngang ở mép bắc phía tây, đứng phía nam nhìn lên là thấy cả hàng trong một khung.
  { id: 'props', x: 1285, z: 964, hx: 7.5, hz: 3 },
  // Buồng ánh sáng: góc đông bắc.
  { id: 'light', x: 1318, z: 968, hx: 5, hz: 6 },
  // Tường hiệu ứng: dọc mép đông.
  { id: 'fx', x: 1319, z: 992, hx: 4, hz: 10 },
];

export function dienVoZone(id: DienVoZoneId): DienVoZone {
  return DIEN_VO_ZONES.find((z) => z.id === id)!;
}

/**
 * Chỗ đứng thứ `i` trong `n` con quái gọi ra ở phòng tập: quái thường xếp vòng trong sàn đấu, boss đứng giữa hố boss (nhiều boss thì xếp vòng nhỏ).
 * Hàm thuần để server đặt quái và test kiểm mọi chỗ đứng nằm trong khu.
 */
export function dienVoSpawnAt(i: number, n: number, boss: boolean): { x: number; z: number } {
  const z = dienVoZone(boss ? 'boss' : 'arena');
  if (n <= 1) return { x: z.x, z: z.z };
  const ring = Math.min((z.r ?? 6) - 1.5, boss ? 3 : 2.5 + n * 0.25);
  // Lệch nửa bước: không con nào đứng thẳng hướng bắc (mép trên khung hình ở camera 0°), con đầu danh sách (tinh anh) nằm chếch trong khung.
  const a = ((i + 0.5) / n) * Math.PI * 2;
  return { x: z.x + Math.sin(a) * ring, z: z.z - Math.cos(a) * ring };
}

/** Chỗ người chơi đứng khi nạp cảnh mẫu ở khu `id`: mép nam của khu (phía cửa ra), nhìn vào giữa khu; khu nhỏ thì đứng giữa. */
export function dienVoStandAt(id: DienVoZoneId): { x: number; z: number } {
  const z = dienVoZone(id);
  const half = z.r ?? z.hz ?? 0;
  // Khu tròn/lớn: đứng trong, sát mép nam. Khu chữ nhật hẹp (hành lang): đứng ngay ngoài mép nam để không đè lên vật bày.
  if (half > 5) return { x: z.x, z: z.z + half - 2 };
  return { x: z.x, z: z.hz ? z.z + z.hz + 1.5 : z.z };
}

/**
 * Cảnh mẫu của phòng tập (`packages/content/data/lab/scenes.json`): một tình huống dựng lại y hệt bằng `/gm scene <id>`,
 * là gốc của bộ ảnh chuẩn (`pnpm shots dienvo`). `state` ép lên mọi quái của cảnh; `cam` chỉ dùng khi chụp.
 */
export interface LabScene {
  id: string;
  at: DienVoZoneId;
  /** Công pháp và cấp của nhân vật thử. */
  method: string;
  level: number;
  mons: { id: string; n: number }[];
  state?: 'weak' | 'break' | 'stun' | 'chant';
  phase?: number;
  cam?: { pitch?: number; dist?: number };
}

const lamp = (x: number, z: number): HandProp => ({ id: 'prop_den_da', x, z, yaw: 0, s: 1, r: 0.5 });
// Trụ đá khắc vân cao 9 m ở tỉ lệ 1: trong phòng chỉ cần ~3,6 m để đánh dấu hố boss mà không che khung hình.
const pillar = (x: number, z: number, s = 0.4): HandProp => ({ id: 'prop_tru_da_khac_van', x, z, yaw: 0, s, r: 0.5 });
const sign = (x: number, z: number, yaw: number): HandProp => ({ id: 'prop_bia_da', x, z, yaw, s: 0.9, r: 0.6 });

/** Hàng đạo cụ mẫu của hành lang (mỗi món cách nhau 2 m, quay mặt về phía nam): đá, cây, kiến trúc nhỏ, đồ tông môn. */
// Tỉ lệ `s` đưa mỗi món về cỡ 2–2,5 m (chiều cao chuẩn ở assets/source/prop/<id>/meta.json: đá dựng 5 m, tượng võ sĩ 7 m…) để so chất liệu cạnh nhau.
const CORRIDOR: readonly (readonly [string, number])[] = [
  ['prop_da_dung', 0.45],
  ['prop_da_nam', 0.5],
  ['prop_tuong_da_vo_si', 0.34],
  ['prop_tc_lu_huong', 0.7],
  ['prop_tc_gia_kiem', 0.7],
  ['prop_tc_chuong_dong', 0.55],
  ['prop_tc_tinh_the_tim', 0.7],
];

export const DIEN_VO_PROPS: readonly HandProp[] = [
  // Bốn góc sàn và hai bên cửa ra: đèn đá.
  lamp(1277, 962),
  lamp(1323, 962),
  lamp(1277, 1008),
  lamp(1323, 1008),
  lamp(1295, 1008),
  lamp(1305, 1008),
  // Sàn đấu: bốn đèn ở vành ngoài (ngoài vòng đánh).
  lamp(1290.5, 975.5),
  lamp(1309.5, 975.5),
  lamp(1290.5, 994.5),
  lamp(1309.5, 994.5),
  // Hố boss: bốn trụ đá khắc vân.
  pillar(1293, 963),
  pillar(1307, 963),
  pillar(1293, 973),
  pillar(1307, 973),
  // Biển tên khu (bia đá), đặt ở mép mỗi khu, mặt quay về giữa phòng.
  sign(1300, 995, 0),
  sign(1300, 975.5, 0),
  sign(1288.5, 1001, 1.57),
  sign(1293.5, 968.5, 0),
  sign(1312, 968, -1.57),
  sign(1314, 992, -1.57),
  // Hành lang đạo cụ.
  ...CORRIDOR.map(([id, s], i): HandProp => ({ id, x: 1279 + i * 2, z: 963, yaw: 0, s, r: 0.7 })),
  // Buồng ánh sáng: góc cảnh mẫu (đá, cây khô, đèn lồng giấy) để chỉnh mood, sương, đèn.
  { id: 'prop_cay_goc_kho', x: 1320, z: 965, yaw: 0.6, s: 0.5, r: 0.6 },
  { id: 'prop_da_phien', x: 1316.5, z: 966, yaw: 0.2, s: 0.7 },
  { id: 'prop_tc_long_den_giay', x: 1318, z: 971, yaw: 0, s: 1, r: 0.4 },
  { id: 'prop_tc_da_reu', x: 1321, z: 970.5, yaw: 2.1, s: 0.7, r: 0.6 },
];

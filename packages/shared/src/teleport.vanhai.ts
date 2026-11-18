// Truyền Tống Trận của Vân Hải Phù Đảo (E3-A, tiền tố vh_). SINH BẰNG tools/maps/gen-van-hai.mjs.
import type { TelePad } from './teleport.types';

/** Trận hub (vh_tp_hub) mở khóa sau nhiệm vụ q2_ket_dan (unlockTele) hoặc "/gm tele vh_tp_hub"; tới nơi thì trận tự mở. Các trận đảo mở khi chạm. */
export const VAN_HAI_PADS: readonly TelePad[] = [
  { id: 'vh_tp_hub', level: 'van_hai', face: { x: 1024, z: 1024 }, zone: '', x: 1024, z: 986 },
  { id: 'vh_tp_tung_dai', level: 'van_hai', face: { x: 1024, z: 1024 }, zone: 'tung_dai_dao', x: 718, z: 1167 },
  { id: 'vh_tp_thach_quy', level: 'van_hai', face: { x: 1024, z: 1024 }, zone: 'thach_quy_dao', x: 1362, z: 1116 },
  { id: 'vh_tp_kinh_ho', level: 'van_hai', face: { x: 1024, z: 1024 }, zone: 'kinh_ho_dao', x: 1077, z: 1456 },
  { id: 'vh_tp_loi_van', level: 'van_hai', face: { x: 1024, z: 1024 }, zone: 'loi_van_dao', x: 1492, z: 608 },
  { id: 'vh_tp_kinh_ngu', level: 'van_hai', face: { x: 1024, z: 1024 }, zone: 'kinh_ngu_dai', x: 578, z: 627 },
];

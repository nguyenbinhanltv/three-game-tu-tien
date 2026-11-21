// Truyền Tống Trận của Vấn Đỉnh Âm Dương Giới (TN-3, tiền tố vd_). SINH BẰNG tools/maps/gen-van_dinh.mjs.
// vd_tp_tram nhận khách từ ngoài (mở bằng nhiệm vụ chương 6 hoặc "/gm tele vd_tp_tram"). vd_chuyen_am và vd_chuyen_duong là cặp
// Chuyển Diện Trận Đài nối mặt Âm Hư (tây) với mặt Dương Thực (đông); cả hai mở bằng cách đứng lên bệ, như mọi trận khác.
import type { TelePad } from './teleport';

export const VAN_DINH_PADS: readonly TelePad[] = [
  { id: 'vd_tp_tram', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: '', x: 1024, z: 1548 },
  { id: 'vd_tp_cong_gioi', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: 'cong_gioi', x: 1004, z: 1464 },
  { id: 'vd_tp_ho_hu_anh', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: 'ho_hu_anh', x: 774, z: 1239 },
  { id: 'vd_tp_rung_re_treo', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: 'rung_re_treo', x: 734, z: 839 },
  { id: 'vd_chuyen_am', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: 'bac_dinh', x: 939, z: 579 },
  { id: 'vd_chuyen_duong', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: 'rung_dong_kho', x: 1214, z: 624 },
  { id: 'vd_tp_gioi_tri', level: 'van_dinh', face: { x: 1024, z: 1024 }, zone: 'gioi_tri', x: 1279, z: 1214 },
];

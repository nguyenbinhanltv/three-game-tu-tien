// Truyền Tống Trận của Thiên Lộ Giới (TN-7, tiền tố ck_). SINH BẰNG tools/maps/gen-cuu_kieu.mjs.
// ck_tp_tram nhận khách từ ngoài (mở bằng nhiệm vụ chương 7 hoặc "/gm tele ck_tp_tram"); mỗi vùng còn lại một trận, mở khi đứng lên bệ.
import type { TelePad } from './teleport.types';

export const CUU_KIEU_PADS: readonly TelePad[] = [
  { id: 'ck_tp_tram', level: 'cuu_kieu', face: { x: 1024, z: 1024 }, zone: '', x: 1024, z: 1494 },
  { id: 'ck_tp_kieu_dau', level: 'cuu_kieu', face: { x: 1024, z: 1024 }, zone: 'kieu_dau', x: 994, z: 1414 },
  { id: 'ck_tp_duong_may', level: 'cuu_kieu', face: { x: 1024, z: 1024 }, zone: 'duong_may', x: 724, z: 1094 },
  { id: 'ck_tp_bia_lo', level: 'cuu_kieu', face: { x: 1024, z: 1024 }, zone: 'bia_lo', x: 1324, z: 1094 },
  { id: 'ck_tp_bac_cuoi', level: 'cuu_kieu', face: { x: 1024, z: 1024 }, zone: 'bac_cuoi', x: 964, z: 644 },
];

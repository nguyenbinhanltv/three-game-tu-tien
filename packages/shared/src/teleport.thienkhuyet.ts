// Truyền Tống Trận của Thiên Khuyết Cổ Thành (E4-A, tiền tố tk_). SINH BẰNG tools/maps/gen-thien-khuyet.mjs.
import type { TelePad } from './teleport';

/** Trận trạm (tk_tp_tram) mở khóa sau nhiệm vụ chương 3 (E4-H: unlockTele) hoặc "/gm tele tk_tp_tram"; tới nơi thì trận tự mở. Các trận vùng mở khi chạm. */
export const THIEN_KHUYET_PADS: readonly TelePad[] = [
  { id: 'tk_tp_tram', level: 'thien_khuyet', face: { x: 1024, z: 1024 }, zone: '', x: 1024, z: 986 },
  { id: 'tk_tp_dai_lo', level: 'thien_khuyet', face: { x: 1024, z: 1024 }, zone: 'dai_lo_den_troi', x: 990, z: 834 },
  { id: 'tk_tp_lam_sao', level: 'thien_khuyet', face: { x: 1024, z: 1024 }, zone: 'lam_sao_vien', x: 734, z: 994 },
  { id: 'tk_tp_binh_khi', level: 'thien_khuyet', face: { x: 1024, z: 1024 }, zone: 'binh_khi_kho', x: 1344, z: 964 },
  { id: 'tk_tp_dien_tien', level: 'thien_khuyet', face: { x: 1024, z: 1024 }, zone: 'dien_tien_quang_truong', x: 984, z: 464 },
  { id: 'tk_tp_mo_dao', level: 'thien_khuyet', face: { x: 1024, z: 1024 }, zone: 'mo_dao', x: 964, z: 1314 },
];

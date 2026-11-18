// Truyền Tống Trận của Bắc Hoang Tẫn Nguyên (DV-1, tiền tố bh_). SINH BẰNG tools/maps/gen-bac-hoang.mjs.
import type { TelePad } from './teleport';

/** Trận trạm (bh_tp_tram) không mở sẵn: mở khi nhận nhiệm vụ q5_bac_hanh (DV3-H) hoặc "/gm tele bh_tp_tram" rồi truyền tống từ Ngoại Thành Trạm (Thiên Khuyết); tới nơi thì trận tự mở. Các trận vùng mở khi chạm. */
export const BAC_HOANG_PADS: readonly TelePad[] = [
  { id: 'bh_tp_tram', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: '', x: 1024, z: 1510 },
  { id: 'bh_tp_han_hoi', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: 'han_hoi_nguyen', x: 1204, z: 1354 },
  { id: 'bh_tp_kho_loc', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: 'kho_loc_lam', x: 834, z: 1354 },
  { id: 'bh_tp_khich_giai', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: 'khich_giai', x: 964, z: 1084 },
  { id: 'bh_tp_xich_tan', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: 'xich_tan_binh', x: 1324, z: 740 },
  { id: 'bh_tp_kim_da', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: 'kim_da_ngoai_uyen', x: 724, z: 740 },
  { id: 'bh_tp_tran_gioi', level: 'bac_hoang', face: { x: 1024, z: 824 }, zone: 'tran_gioi_dai', x: 1024, z: 508 },
];

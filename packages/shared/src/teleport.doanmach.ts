// Truyền Tống Trận của Đoạn Mạch Cổ Cốc (E2-A, tiền tố dm_). SINH BẰNG tools/maps/gen-doan-mach.mjs.
import type { TelePad } from './teleport.types';

/** Trận trạm (dm_tp_tram) tự mở khi tới nơi; mở khóa lần đầu bằng nhiệm vụ (E2-H) hoặc "/gm tele dm_tp_tram". */
export const DOAN_MACH_PADS: readonly TelePad[] = [
  { id: 'dm_tp_tram', level: 'doan_mach', face: { x: 1024, z: 1024 }, zone: '', x: 1024, z: 986 },
  { id: 'dm_tp_sa_thach', level: 'doan_mach', face: { x: 1024, z: 1024 }, zone: 'sa_thach_pha', x: 1241, z: 1201 },
  { id: 'dm_tp_hoang_sa', level: 'doan_mach', face: { x: 1024, z: 1024 }, zone: 'hoang_sa_huyet', x: 946, z: 1314 },
  { id: 'dm_tp_cuu_mo', level: 'doan_mach', face: { x: 1024, z: 1024 }, zone: 'cuu_mo_khu', x: 735, z: 945 },
  { id: 'dm_tp_tuyet_bich', level: 'doan_mach', face: { x: 1024, z: 1024 }, zone: 'tuyet_bich', x: 1022, z: 594 },
  { id: 'dm_tp_kho_ha', level: 'doan_mach', face: { x: 1024, z: 1024 }, zone: 'kho_ha_dao', x: 1338, z: 922 },
];

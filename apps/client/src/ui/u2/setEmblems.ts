/** Dấu ấn bộ trang bị (U2-I): đường nét 24×24 cho huy hiệu nhỏ ở góc khung icon, tô bằng màu sáng của bộ (`look.blade`). Khóa = id bộ không có tiền tố `set_`. */
export const SET_EMBLEMS: Record<string, string> = {
  lac_kiem: 'M5 16 q-3 0 -3 -3 t3 -3 q1 -4 6 -3 q4 -3 8 1 q4 0 4 4 t-4 4 Z M8 13 h8',
  huyen_giap: 'M3 19 L9 7 L13 14 L16 10 L21 19 Z',
  dan_tam: 'M12 3 C6 8 6 16 12 21 C18 16 18 8 12 3 Z M12 6 V19',
  han_giao: 'M12 2 V22 M4 7 L20 17 M20 7 L4 17 M9 4 L12 7 L15 4 M9 20 L12 17 L15 20',
  liet_mach: 'M4 5 L10 10 L8 14 L15 17 L20 11 M10 10 L14 6',
  dia_giap: 'M3 18 Q8 8 12 18 M12 18 Q16 8 21 18 M7 12 Q12 2 17 12',
  phuc_mach: 'M12 21 V10 M12 13 C6 13 5 8 5 5 C10 5 12 8 12 13 M12 10 C18 10 19 5 19 3 C14 3 12 6 12 10',
  kinh_quang:
    'M12 6 A6 6 0 1 0 12 18 A6 6 0 1 0 12 6 M12 1 V4 M12 20 V23 M1 12 H4 M20 12 H23 M4 4 L6 6 M18 18 L20 20 M20 4 L18 6 M4 20 L6 18',
  van_kinh: 'M2 12 q3 -6 6 0 t6 0 t6 0 M2 18 q3 -6 6 0 t6 0 t6 0 M4 6 q3 -4 6 0',
  luu_ly: 'M12 2 L21 8 V16 L12 22 L3 16 V8 Z M12 2 V22 M3 8 L21 16 M21 8 L3 16',
  tinh_khuyet: 'M16 3 A9 9 0 1 0 16 21 A7 7 0 1 1 16 3 Z M19 5 L20 8 L23 8 L21 10 L22 13 L19 11 L16 13 L17 10 L15 8 L18 8 Z',
  co_thanh: 'M4 21 V10 Q4 3 12 3 Q20 3 20 10 V21 M9 21 V14 Q9 10 12 10 Q15 10 15 14 V21 M2 21 H22',
  than_tang: 'M4 4 H20 V20 H4 Z M8 8 H16 V16 H8 Z M11 11 H13 V13 H11 Z',
  tran_khich: 'M12 2 L9 9 L14 12 L9 16 L12 22 M5 12 H9 M15 12 H19',
  tan_thiet: 'M3 9 H21 L18 14 H6 Z M10 14 V19 M14 14 V19 M6 19 H18 M17 4 q-2 2 0 4',
  tinh_dan_bao:
    'M12 20 C6 19 4 13 6 9 C9 11 12 14 12 20 M12 20 C18 19 20 13 18 9 C15 11 12 14 12 20 M12 20 C9 15 9 8 12 3 C15 8 15 15 12 20 M12 1 V3',
  vo_danh_kiem: 'M12 2 L15 10 L22 12 L15 14 L12 22 L9 14 L2 12 L9 10 Z M12 7 V17',
  dong_dinh: 'M6 8 H18 V12 Q18 18 12 20 Q6 18 6 12 Z M4 8 H20 M9 20 V22 M15 20 V22 M9 4 V8 M15 4 V8',
  gioi_tri_dan: 'M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M12 3 A4.5 4.5 0 0 1 12 12 A4.5 4.5 0 0 0 12 21',
};

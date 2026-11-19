// Cấu hình vẽ cho bộ prop PROP-1 "Thiên Công Khai Vật" (mỗi món có bản `_2`): tầm vẽ, ngưỡng LOD, bỏ ở preset Thấp, đổ bóng.
// Danh mục món: tools/blender/prop_tc_items.json; bố cục: packages/content/src/thienCongScenes.ts.
interface Cfg {
  range: number;
  lod: [number, number];
  decor?: boolean;
  shadow?: boolean;
}

const SMALL: Cfg = { range: 150, lod: [20, 55], decor: true };
const MEDIUM: Cfg = { range: 260, lod: [35, 90] };
const LARGE: Cfg = { range: 380, lod: [50, 120] };
/** Vật phát sáng/cao: nhìn thấy từ xa hơn. */
const BEACON: Cfg = { range: 320, lod: [45, 110] };

export const TC_NAMES: Record<string, Cfg> = {
  // tông môn
  dinh_lu_dong: MEDIUM,
  gia_kiem: MEDIUM,
  bia_khac: MEDIUM,
  co_phuong: { range: 300, lod: [40, 100] },
  lo_luyen_dan: MEDIUM,
  chuong_dong: LARGE,
  trong: MEDIUM,
  den_da: { range: 260, lod: [40, 110] },
  lu_huong: MEDIUM,
  ban_ghe_da: MEDIUM,
  // chợ / làng
  sap_hang: { range: 260, lod: [35, 90] },
  vo_ruou: SMALL,
  gio_thuoc: SMALL,
  long_den_giay: { range: 220, lod: [30, 80], decor: true },
  xe_keo: MEDIUM,
  thung_go: SMALL,
  hang_rao_tre: { range: 200, lod: [30, 80], decor: true },
  gieng_nuoc: MEDIUM,
  lu_nuoc: SMALL,
  // hoang dã
  da_linh_khi: LARGE,
  tre: { range: 320, lod: [40, 100], shadow: true },
  cay_co_thu: { range: 480, lod: [55, 130], shadow: true },
  linh_thao: { range: 160, lod: [20, 55], decor: true },
  nam_phat_sang: { range: 160, lod: [20, 55], decor: true },
  mo_co: MEDIUM,
  cot_da_do: LARGE,
  re_cay: LARGE,
  kho_go: { range: 200, lod: [30, 80], decor: true },
  // trận pháp
  tran_do_khac_san: BEACON,
  cot_tran: BEACON,
  te_dan: LARGE,
  bia_tran: MEDIUM,
  linh_thach: BEACON,
  // Dị Vực
  xuong_cu_thu: LARGE,
  cot_ta_mau_tim: BEACON,
  tinh_the_tim: BEACON,
  chan_dong_do_nat: LARGE,
  co_rach: MEDIUM,
};

export const TC_PROP_CFG: Record<string, Cfg> = Object.fromEntries(
  Object.entries(TC_NAMES).flatMap(([n, c]) => [
    [`prop_tc_${n}`, c],
    [`prop_tc_${n}_2`, c],
  ]),
);

import {
  clampTier,
  pathOfKey,
  ROOT_IDS,
  registerMethodVoices,
  pickedBranch,
  skillGate,
  isEquipSlot,
  majorRealmOf,
  registerTerrain,
  resolveSkill,
  type BranchPicks,
  type CloneMethodDef,
  type JointDef,
  type MarkDef,
  type PathDef,
  type StarTable,
  type FxTimeline,
  type ResolvedSkill,
  type TerrainDef,
} from '@dtl/shared';
import type {
  ArtifactDef,
  PillQualityCfg,
  AppearanceData,
  MethodDef,
  SkillVariant,
  ItemDef,
  ForgeRecipe,
  ItemSysData,
  SetDef,
  ChapterDef,
  QualityDef,
  SlotDef,
  LevelAssets,
  LevelDef,
  MonsterDef,
  NpcDef,
  PoseDef,
  QuestDef,
  RealmDef,
  OriginDef,
  RootDef,
  RecipeDef,
  SkillDef,
} from '@dtl/shared';
import './colliders'; // COL-1: đăng ký va chạm 3D theo level khi nạp content (client và server cùng dữ liệu)
export { COLLIDER_LIB, INST_BY_LEVEL, propShapesOf } from './colliders';
import creditsJson from '../data/credits.json';
import itemsJson from '../data/items.json';
import monstersJson from '../data/monsters.json';
import skillsJson from '../data/skills.json';
import methodsJson from '../data/methods.json';
import marksJson from '../data/marks.json';
import jointsJson from '../data/joints.json';
import pathsJson from '../data/paths.json';
import recipesJson from '../data/recipes.json';
import artifactsJson from '../data/artifacts.json';
import clonesJson from '../data/clones.json';
import alchemyJson from '../data/alchemy.json';
import npcsJson from '../data/npcs.json';
import questsJson from '../data/quests.json';
import chaptersJson from '../data/chapters.json';
import realmsJson from '../data/realms.json';
import originsJson from '../data/origins.json';
import vanLamJson from '../data/levels/van_lam.json';
import kiemTrungJson from '../data/levels/kiem_trung.json';
import doanMachJson from '../data/levels/doan_mach.json';
import doanMachTerrainJson from '../data/levels/doan_mach.terrain.json';
import vanLamAssetsJson from '../data/levels/van_lam.assets.json';
import kiemTrungAssetsJson from '../data/levels/kiem_trung.assets.json';
import doanMachAssetsJson from '../data/levels/doan_mach.assets.json';
import vanHaiJson from '../data/levels/van_hai.json';
import vanHaiTerrainJson from '../data/levels/van_hai.terrain.json';
import vanHaiAssetsJson from '../data/levels/van_hai.assets.json';
import thienKhuyetJson from '../data/levels/thien_khuyet.json';
import thienKhuyetTerrainJson from '../data/levels/thien_khuyet.terrain.json';
import thienKhuyetAssetsJson from '../data/levels/thien_khuyet.assets.json';
import bacHoangJson from '../data/levels/bac_hoang.json';
import bacHoangTerrainJson from '../data/levels/bac_hoang.terrain.json';
import xichTanTerrainJson from '../data/levels/xich_tan_khich.terrain.json';
import bacHoangAssetsJson from '../data/levels/bac_hoang.assets.json';
import doKiepJson from '../data/levels/do_kiep.json';
import doKiepBhJson from '../data/levels/do_kiep_bac_hoang.json';
import phucMachJson from '../data/levels/phuc_mach.json';
import phucMachAssetsJson from '../data/levels/phuc_mach.assets.json';
import kinhNguyetJson from '../data/levels/kinh_nguyet.json';
import kinhNguyetAssetsJson from '../data/levels/kinh_nguyet.assets.json';
import thanTangJson from '../data/levels/than_tang.json';
import thanTangAssetsJson from '../data/levels/than_tang.assets.json';
import xichTanKhichJson from '../data/levels/xich_tan_khich.json';
import xichTanKhichAssetsJson from '../data/levels/xich_tan_khich.assets.json';
import kimDaCungJson from '../data/levels/kim_da_cung.json';
import kimDaCungAssetsJson from '../data/levels/kim_da_cung.assets.json';
import luyenThanJson from '../data/levels/luyen_than.json';
import luyenThanAssetsJson from '../data/levels/luyen_than.assets.json';
import starsJson from '../data/stars.json';
import doKiepAssetsJson from '../data/levels/do_kiep.assets.json';
import doKiepBhAssetsJson from '../data/levels/do_kiep_bac_hoang.assets.json';
import glossaryJson from '../data/glossary.json';
import itemSourcesJson from '../data/itemsources.json';
import viJson from '../data/i18n/vi.json';
import viUiJson from '../data/i18n/vi.ui.json';
import poseKiemThuJson from '../data/poses/kiem_thu.json';
import poseChemNgangJson from '../data/poses/chem_ngang.json';
import fxKiemKhiTramJson from '../data/fx/skl_kiem_khi_tram.json';
import fxPhiKiemJson from '../data/fx/skl_phi_kiem.json';
import fx_mon_bolt_impact from '../data/fx/mon_bolt_impact.json';
import fx_mon_bolt_muzzle from '../data/fx/mon_bolt_muzzle.json';
import fx_mon_boom_circle from '../data/fx/mon_boom_circle.json';
import fx_mon_boom_cone from '../data/fx/mon_boom_cone.json';
import fx_mon_boom_line from '../data/fx/mon_boom_line.json';
import fx_mon_cast from '../data/fx/mon_cast.json';
import fx_mon_death from '../data/fx/mon_death.json';
import fx_mon_hit from '../data/fx/mon_hit.json';
import fx_mon_strike from '../data/fx/mon_strike.json';
import fx_mon_warn from '../data/fx/mon_warn.json';
import fx_mon_warn_cone from '../data/fx/mon_warn_cone.json';
import fx_mon_warn_line from '../data/fx/mon_warn_line.json';
import fx_fx_blink from '../data/fx/fx_blink.json';
import fx_fx_dotpha_kd from '../data/fx/fx_dotpha_kd.json';
import fx_fx_dotpha_hn from '../data/fx/fx_dotpha_hn.json';
import fx_fx_dotpha_na from '../data/fx/fx_dotpha_na.json';
import fx_fx_dotpha_tc from '../data/fx/fx_dotpha_tc.json';
import fx_fx_fly_on from '../data/fx/fx_fly_on.json';
import fx_fx_kiep_kd from '../data/fx/fx_kiep_kd.json';
import fx_fx_kiep_hn from '../data/fx/fx_kiep_hn.json';
import fx_fx_kiep_na from '../data/fx/fx_kiep_na.json';
import fx_fx_kiep_tc from '../data/fx/fx_kiep_tc.json';
import fx_suy_den_dark from '../data/fx/suy_den_dark.json';
import fx_suy_den_gust from '../data/fx/suy_den_gust.json';
import fx_suy_den_light from '../data/fx/suy_den_light.json';
import fx_suy_den_lit from '../data/fx/suy_den_lit.json';
import fx_suy_den_out from '../data/fx/suy_den_out.json';
import fx_suy_den_relit from '../data/fx/suy_den_relit.json';
import fx_suy_enter_linh from '../data/fx/suy_enter_linh.json';
import fx_suy_enter_tam from '../data/fx/suy_enter_tam.json';
import fx_suy_enter_the from '../data/fx/suy_enter_the.json';
import fx_suy_enter_tho from '../data/fx/suy_enter_tho.json';
import fx_suy_enter_thuc from '../data/fx/suy_enter_thuc.json';
import fx_suy_fail from '../data/fx/suy_fail.json';
import fx_suy_nhan from '../data/fx/suy_nhan.json';
import fx_suy_nhan_end from '../data/fx/suy_nhan_end.json';
import fx_suy_nhan_open from '../data/fx/suy_nhan_open.json';
import fx_suy_ok from '../data/fx/suy_ok.json';
import fx_suy_tam_bad from '../data/fx/suy_tam_bad.json';
import fx_suy_tam_good from '../data/fx/suy_tam_good.json';
import fx_suy_tam_miss from '../data/fx/suy_tam_miss.json';
import fx_suy_tam_open from '../data/fx/suy_tam_open.json';
import fx_suy_thuc_boom from '../data/fx/suy_thuc_boom.json';
import fx_suy_thuc_brew from '../data/fx/suy_thuc_brew.json';
import fx_suy_thuc_pulse from '../data/fx/suy_thuc_pulse.json';
import fx_suy_thuc_void from '../data/fx/suy_thuc_void.json';
import fx_suy_toi_hit from '../data/fx/suy_toi_hit.json';
import fx_suy_toi_miss from '../data/fx/suy_toi_miss.json';
import fx_suy_toi_warn from '../data/fx/suy_toi_warn.json';
import fx_hk_chau from '../data/fx/hk_chau.json';
import fx_hk_chau_get from '../data/fx/hk_chau_get.json';
import fx_hk_chau_gone from '../data/fx/hk_chau_gone.json';
import fx_hk_enter from '../data/fx/hk_enter.json';
import fx_hk_huyet_kill from '../data/fx/hk_huyet_kill.json';
import fx_hk_huyet_spawn from '../data/fx/hk_huyet_spawn.json';
import fx_hk_loi_boom from '../data/fx/hk_loi_boom.json';
import fx_hk_loi_hot from '../data/fx/hk_loi_hot.json';
import fx_hk_loi_rod from '../data/fx/hk_loi_rod.json';
import fx_hk_loi_zap from '../data/fx/hk_loi_zap.json';
import fx_hk_luan_grind from '../data/fx/hk_luan_grind.json';
import fx_hk_luan_warn from '../data/fx/hk_luan_warn.json';
import fx_hk_luan_wheel from '../data/fx/hk_luan_wheel.json';
import fx_hk_ly_cut from '../data/fx/hk_ly_cut.json';
import fx_hk_ly_out from '../data/fx/hk_ly_out.json';
import fx_hk_ly_seal from '../data/fx/hk_ly_seal.json';
import fx_hk_phong_blow from '../data/fx/hk_phong_blow.json';
import fx_hk_phong_hit from '../data/fx/hk_phong_hit.json';
import fx_hk_phong_pillar from '../data/fx/hk_phong_pillar.json';
import fx_hk_phong_safe from '../data/fx/hk_phong_safe.json';
import fx_hk_phong_warn from '../data/fx/hk_phong_warn.json';
import fx_hk_tuc_bad from '../data/fx/hk_tuc_bad.json';
import fx_hk_tuc_beat from '../data/fx/hk_tuc_beat.json';
import fx_hk_tuc_good from '../data/fx/hk_tuc_good.json';
import fx_hk_tuyet_drift from '../data/fx/hk_tuyet_drift.json';
import fx_hk_van_bad from '../data/fx/hk_van_bad.json';
import fx_hk_van_ok from '../data/fx/hk_van_ok.json';
import fx_hk_van_spin from '../data/fx/hk_van_spin.json';
import fx_hk_van_true from '../data/fx/hk_van_true.json';
import fx_fx_soul_in from '../data/fx/fx_soul_in.json';
import fx_fx_soul_out from '../data/fx/fx_soul_out.json';
import fx_skl_anh_duoc_hoa_than from '../data/fx/skl_anh_duoc_hoa_than.json';
import fx_skl_anh_thiet_than from '../data/fx/skl_anh_thiet_than.json';
import fx_skl_dan_hoa_phong_tran from '../data/fx/skl_dan_hoa_phong_tran.json';
import fx_skl_dich_son_xung from '../data/fx/skl_dich_son_xung.json';
import fx_skl_duoc_vu from '../data/fx/skl_duoc_vu.json';
import fx_skl_hoanh_kiem_pha_mach from '../data/fx/skl_hoanh_kiem_pha_mach.json';
import fx_skl_hoi_nguyen_thuat from '../data/fx/skl_hoi_nguyen_thuat.json';
import fx_skl_hoi_thien_dan_lo from '../data/fx/skl_hoi_thien_dan_lo.json';
import fx_skl_hoi_xuan_quyet from '../data/fx/skl_hoi_xuan_quyet.json';
import fx_skl_kiem_anh_bo from '../data/fx/skl_kiem_anh_bo.json';
import fx_skl_kiem_dan_ban_menh from '../data/fx/skl_kiem_dan_ban_menh.json';
import fx_skl_u_anh_bo from '../data/fx/skl_u_anh_bo.json';
import fx_skl_phe_hon from '../data/fx/skl_phe_hon.json';
import fx_skl_suu_hon_thuat from '../data/fx/skl_suu_hon_thuat.json';
import fx_skl_am_hon_trieu from '../data/fx/skl_am_hon_trieu.json';
import fx_skl_dinh_than_thuat from '../data/fx/skl_dinh_than_thuat.json';
import fx_skl_hoang_tuyen_dan from '../data/fx/skl_hoang_tuyen_dan.json';
import fx_skl_tat_dau_thanh_binh from '../data/fx/skl_tat_dau_thanh_binh.json';
import fx_hon_binh_hit from '../data/fx/hon_binh_hit.json';
import fx_hon_reap from '../data/fx/hon_reap.json';
import fx_hon_binh_stand from '../data/fx/hon_binh_stand.json';
import fx_skl_kiem_vu_tam_diep from '../data/fx/skl_kiem_vu_tam_diep.json';
import fx_skl_kim_chung_tran from '../data/fx/skl_kim_chung_tran.json';
import fx_skl_bao_nhan from '../data/fx/skl_bao_nhan.json';
import fx_skl_tram_son_dao from '../data/fx/skl_tram_son_dao.json';
import fx_skl_hoanh_dao from '../data/fx/skl_hoanh_dao.json';
import fx_skl_tam_dao from '../data/fx/skl_tam_dao.json';
import fx_skl_doan_luu from '../data/fx/skl_doan_luu.json';
import fx_skl_liet_dia_tram from '../data/fx/skl_liet_dia_tram.json';
import fx_skl_kim_cuong_bat_hoai from '../data/fx/skl_kim_cuong_bat_hoai.json';
import fx_skl_linh_khi_ho_the from '../data/fx/skl_linh_khi_ho_the.json';
import fx_skl_loi_dinh_nhat_kiem from '../data/fx/skl_loi_dinh_nhat_kiem.json';
import fx_skl_luu_huong_bo from '../data/fx/skl_luu_huong_bo.json';
import fx_skl_moc_linh_tran from '../data/fx/skl_moc_linh_tran.json';
import fx_skl_nghich_kiem_chuyen_phong from '../data/fx/skl_nghich_kiem_chuyen_phong.json';
import fx_skl_ngung_dan_ho_the from '../data/fx/skl_ngung_dan_ho_the.json';
import fx_skl_phan_anh_kiem_anh from '../data/fx/skl_phan_anh_kiem_anh.json';
import fx_skl_phi_kiem_truy_hon from '../data/fx/skl_phi_kiem_truy_hon.json';
import fx_skl_son_nhac_hoa_than from '../data/fx/skl_son_nhac_hoa_than.json';
import fx_skl_thien_dan_phap_gioi from '../data/fx/skl_thien_dan_phap_gioi.json';
import fx_skl_thien_kiem_hoa_hinh from '../data/fx/skl_thien_kiem_hoa_hinh.json';
import fx_skl_thien_kiem_vu from '../data/fx/skl_thien_kiem_vu.json';
import fx_skl_thien_kim_phap_tuong from '../data/fx/skl_thien_kim_phap_tuong.json';
import fx_skl_thiet_bich_xung from '../data/fx/skl_thiet_bich_xung.json';
import fx_skl_thiet_quyen_chan_dia from '../data/fx/skl_thiet_quyen_chan_dia.json';
import fx_skl_thuan_di_cuu_vien from '../data/fx/skl_thuan_di_cuu_vien.json';
import fx_skl_thuan_di_ho_the from '../data/fx/skl_thuan_di_ho_the.json';
import fx_skl_thuan_di_tram from '../data/fx/skl_thuan_di_tram.json';
import fx_skl_tran_son_an from '../data/fx/skl_tran_son_an.json';
import fx_skl_van_kiem_quy_tong from '../data/fx/skl_van_kiem_quy_tong.json';
import posePhiKiemJson from '../data/poses/phi_kiem.json';
import poseKiemKhiTramJson from '../data/poses/kiem_khi_tram.json';
import poseHoTheJson from '../data/poses/ho_the.json';
import poseThienKiemVuJson from '../data/poses/thien_kiem_vu.json';
import poseHoiNguyenJson from '../data/poses/hoi_nguyen.json';
import poseLoiDinhJson from '../data/poses/loi_dinh.json';
import poseNguKiemJson from '../data/poses/ngu_kiem.json';
import poseNguKhongJson from '../data/poses/ngu_khong.json';
import poseNiemChuJson from '../data/poses/niem_chu.json';
import poseTamThienJson from '../data/poses/tam_thien.json';
import poseRutKiemJson from '../data/poses/rut_kiem.json';
import poseTraKiemJson from '../data/poses/tra_kiem.json';
import poseKiemAnhJson from '../data/poses/kiem_anh.json';
import poseVanKiemJson from '../data/poses/van_kiem.json';
import poseTranSonJson from '../data/poses/tran_son.json';
import poseKimCuongJson from '../data/poses/kim_cuong.json';
import poseXuanPhongJson from '../data/poses/xuan_phong.json';
import poseHoiThienJson from '../data/poses/hoi_thien.json';
import posePhiKiem2Json from '../data/poses/phi_kiem_2.json';
import posePhiKiem3Json from '../data/poses/phi_kiem_3.json';
import posePhiKiemHpJson from '../data/poses/phi_kiem_hp.json';
import posePhiKiem2HpJson from '../data/poses/phi_kiem_2_hp.json';
import posePhiKiem3HpJson from '../data/poses/phi_kiem_3_hp.json';
import posePhiKiemDsJson from '../data/poses/phi_kiem_ds.json';
import posePhiKiem2DsJson from '../data/poses/phi_kiem_2_ds.json';
import posePhiKiem3DsJson from '../data/poses/phi_kiem_3_ds.json';
import poseKiemKhiTramHpJson from '../data/poses/kiem_khi_tram_hp.json';
import poseKiemKhiTramDsJson from '../data/poses/kiem_khi_tram_ds.json';
import poseHoanhKiemJson from '../data/poses/hoanh_kiem.json';
import poseThuanDiTramJson from '../data/poses/thuan_di_tram.json';
import poseThienKiemHoaHinhJson from '../data/poses/thien_kiem_hoa_hinh.json';
import poseThietQuyenJson from '../data/poses/thiet_quyen.json';
import poseDanHoaJson from '../data/poses/dan_hoa.json';
import poseKiemVuJson from '../data/poses/kiem_vu.json';
import poseKiemDanJson from '../data/poses/kiem_dan.json';
import posePheHonJson from '../data/poses/phe_hon.json';
import poseTatDauThanhBinhJson from '../data/poses/tat_dau_thanh_binh.json';
import poseSuuHonThuatJson from '../data/poses/suu_hon_thuat.json';
import poseAmHonTrieuJson from '../data/poses/am_hon_trieu.json';
import poseDinhThanThuatJson from '../data/poses/dinh_than_thuat.json';
import poseHoangTuyenDanJson from '../data/poses/hoang_tuyen_dan.json';
import poseBaoNhanJson from '../data/poses/bao_nhan.json';
import poseTramSonDaoJson from '../data/poses/tram_son_dao.json';
import poseHoanhDaoJson from '../data/poses/hoanh_dao.json';
import poseTamDaoJson from '../data/poses/tam_dao.json';
import poseDoanLuuJson from '../data/poses/doan_luu.json';
import poseLietDiaTramJson from '../data/poses/liet_dia_tram.json';
import poseThaCoJson from '../data/poses/tha_co.json';
import poseCoTrieuJson from '../data/poses/co_trieu.json';
import poseHutMauCoJson from '../data/poses/hut_mau_co.json';
import poseCoBaoJson from '../data/poses/co_bao.json';
import poseThuCoJson from '../data/poses/thu_co.json';
import poseHoaCoVuongJson from '../data/poses/hoa_co_vuong.json';
import poseCoQuyenJson from '../data/poses/co_quyen.json';
import poseHuyetCuHoJson from '../data/poses/huyet_cu_ho.json';
import poseTinhBaoJson from '../data/poses/tinh_bao.json';
import poseNhatKichJson from '../data/poses/nhat_kich.json';
import posePhanAnhKiemAnhJson from '../data/poses/phan_anh_kiem_anh.json';
import poseKimChungJson from '../data/poses/kim_chung.json';
import poseSonNhacJson from '../data/poses/son_nhac.json';
import poseAnhThietThanJson from '../data/poses/anh_thiet_than.json';
import poseThuanDiHoTheJson from '../data/poses/thuan_di_ho_the.json';
import poseThienKimPhapTuongJson from '../data/poses/thien_kim_phap_tuong.json';
import poseMocLinhJson from '../data/poses/moc_linh.json';
import poseDuocVuJson from '../data/poses/duoc_vu.json';
import poseNgungDanJson from '../data/poses/ngung_dan.json';
import poseAnhDuocHoaThanJson from '../data/poses/anh_duoc_hoa_than.json';
import poseThuanDiCuuVienJson from '../data/poses/thuan_di_cuu_vien.json';
import poseThienDanPhapGioiJson from '../data/poses/thien_dan_phap_gioi.json';
import appearanceJson from '../data/appearance.json';
import equipSlotsJson from '../data/equipment/slots.json';
import equipQualitiesJson from '../data/equipment/qualities.json';
import equipTemplatesJson from '../data/equipment/templates.json';
import equipAffixesJson from '../data/equipment/affixes.json';
import equipSetsJson from '../data/equipment/sets.json';
import outfitsJson from '../data/equipment/outfits.json';
import equipSetItemsJson from '../data/equipment/setItems.json';
import forgeJson from '../data/equipment/forge.json';

/** Mẫu trang bị chỉ để rơi (chưa có icon trong atlas, dùng iconFallback) nằm ở data/equipment/templates.json. */
export const ITEMS = [
  ...(itemsJson as ItemDef[]),
  ...(equipTemplatesJson as ItemDef[]),
  ...(equipSetItemsJson as ItemDef[]),
  ...(methodsJson.items as ItemDef[]),
  ...(artifactsJson.items as ItemDef[]),
  ...(alchemyJson.items as ItemDef[]),
];
export const MONSTERS = monstersJson as unknown as MonsterDef[];
/** 6 chiêu chung (ô 1–6 trên thanh chiêu). Chiêu công pháp nằm riêng ở `METHOD_SKILLS`. */
export const SKILLS = skillsJson as SkillDef[];
/** Công pháp chủ tu và chiêu của chúng (Phase 3-5, data/methods.json). */
export const METHODS = methodsJson.methods as MethodDef[];
export const METHOD_SKILLS = methodsJson.skills as SkillDef[];
/** Ấn trên mục tiêu (VS-2c, data/marks.json): id → định nghĩa. */
export const MARKS = marksJson as MarkDef[];
export const MARK: ReadonlyMap<string, MarkDef> = new Map(MARKS.map((m) => [m.id, m]));
/** Hướng tu (VS-3, data/paths.json): gom hào quang, tranh đạo, bộ động tác, bảng màu, tiếng đòn của một lối tu. */
/** Thang sao Cổ Thần (TN-5, stars.json). */
export const STARS = starsJson as StarTable;
export const PATHS = pathsJson as PathDef[];
export const PATH: ReadonlyMap<string, PathDef> = new Map(PATHS.map((p) => [p.id, p]));
/** Hướng tu của một khóa (id công pháp, id hướng, hoặc bí danh cũ); không ra thì undefined. */
export function pathOf(key: string | undefined): PathDef | undefined {
  return pathOfKey(PATHS, key);
}
// Bộ động tác K-5 theo công pháp: shared giữ bảng, content nạp từ hướng tu.
registerMethodVoices(Object.fromEntries(PATHS.flatMap((p) => p.methods.map((m) => [m, p.voice] as const))));
/** Hợp kích tổ đội (VS-2f, data/joints.json). */
export const JOINTS = jointsJson as JointDef[];
/** id chiêu → biến thức A/B (cả chiêu chung lẫn chiêu công pháp). */
export const VARIANTS = methodsJson.variants as unknown as Record<string, { a: SkillVariant; b: SkillVariant }>;
export const RECIPES = [...(recipesJson as RecipeDef[]), ...(alchemyJson.recipes as RecipeDef[])];
/** Pháp bảo phụ (P3-8): id vật phẩm → định nghĩa. */
export const ARTIFACTS = artifactsJson.artifacts as ArtifactDef[];
/** Phẩm chất đan (P3-8): xác suất theo công pháp và hệ số hiệu lực. */
export const PILL_QUALITY = alchemyJson.quality as PillQualityCfg;
export const NPCS = npcsJson as NpcDef[];
export const QUESTS = questsJson as QuestDef[];
export const REALMS = realmsJson as RealmDef[];
export const LEVELS: Record<string, LevelDef> = {
  van_lam: vanLamJson as LevelDef,
  kiem_trung: kiemTrungJson as LevelDef,
  doan_mach: doanMachJson as LevelDef,
  van_hai: vanHaiJson as LevelDef,
  thien_khuyet: thienKhuyetJson as LevelDef,
  bac_hoang: bacHoangJson as LevelDef,
  do_kiep: doKiepJson as LevelDef,
  do_kiep_bac_hoang: doKiepBhJson as LevelDef,
  phuc_mach: phucMachJson as LevelDef,
  kinh_nguyet: kinhNguyetJson as LevelDef,
  than_tang: thanTangJson as LevelDef,
  xich_tan_khich: xichTanKhichJson as LevelDef,
  kim_da_cung: kimDaCungJson as LevelDef,
  luyen_than: luyenThanJson as LevelDef,
};
// Địa hình dữ liệu hóa của bản đồ mở rộng (E2-A): đăng ký khi nạp @dtl/content để server, client và công cụ cùng thấy `terrainOf('doan_mach')`.
registerTerrain(doanMachTerrainJson as unknown as TerrainDef);
registerTerrain(thienKhuyetTerrainJson as unknown as TerrainDef); // E4-A: cao nguyên thành cổ
registerTerrain(bacHoangTerrainJson as unknown as TerrainDef); // DV-1: hoang nguyên tro, khe Giới Khích
registerTerrain(xichTanTerrainJson as unknown as TerrainDef); // DV-3K: hẻm núi phó bản Xích Tẫn Khích
registerTerrain(vanHaiTerrainJson as unknown as TerrainDef); // E3-A/E3-N: đảo nổi, cầu xích, sàn mây
/** Asset client theo level (`levels/<id>.assets.json`, E1-D). */
export const LEVEL_ASSETS: Record<string, LevelAssets> = {
  van_lam: vanLamAssetsJson as LevelAssets,
  kiem_trung: kiemTrungAssetsJson as LevelAssets,
  doan_mach: doanMachAssetsJson as LevelAssets,
  van_hai: vanHaiAssetsJson as LevelAssets,
  thien_khuyet: thienKhuyetAssetsJson as LevelAssets,
  bac_hoang: bacHoangAssetsJson as LevelAssets,
  do_kiep: doKiepAssetsJson as LevelAssets,
  do_kiep_bac_hoang: doKiepBhAssetsJson as LevelAssets,
  phuc_mach: phucMachAssetsJson as LevelAssets,
  kinh_nguyet: kinhNguyetAssetsJson as LevelAssets,
  than_tang: thanTangAssetsJson as LevelAssets,
  xich_tan_khich: xichTanKhichAssetsJson as LevelAssets,
  kim_da_cung: kimDaCungAssetsJson as LevelAssets,
  luyen_than: luyenThanAssetsJson as LevelAssets,
};
/** 14 Bản Nguyên (TN-1, data/origins.json): sáu nguồn `real` đã mở, tám nguồn khóa theo chương. */
export const ORIGINS = originsJson as OriginDef[];
/** Các nguồn người chơi đang được mang (`ROOT_IDS`): năm linh căn ngũ hành (P3-7) + Lôi (TN-1). */
export const ROOTS: RootDef[] = ORIGINS.filter((o) => (ROOT_IDS as readonly string[]).includes(o.id));
export const GLOSSARY = glossaryJson;

/** Ghi công asset bên thứ ba (nguồn duy nhất, đối chiếu với assets/LICENSES.md + meta.json bằng content:check). */
export type CreditKind = 'model' | 'anim' | 'texture' | 'sound' | 'font' | 'music' | 'vfx';
export interface CreditEntry {
  id: string;
  kind: CreditKind;
  title: string;
  author: string;
  url: string;
  /** SPDX, hoặc 'GeneralUser-GS-2.0' cho soundfont. */
  license: string;
  /** Mã chỉnh sửa → chuỗi `credits.mod.<mã>`. */
  mods: string[];
  /** Id asset trong assets/source/<loại>/<id>/meta.json. */
  assets?: string[];
  /** Asset chưa nằm trên main (PR đang mở); check bỏ qua đối chiếu meta/LICENSES. */
  pending?: boolean;
  /** Ghi chú điều kiện giấy phép → chuỗi `ui.credits.note.<mã>` (vd. `nc`: CC BY-NC, gỡ nếu game có thu tiền). */
  note?: string;
}
export const CREDITS = (creditsJson as { entries: CreditEntry[] }).entries;
export const CREDIT_KINDS: CreditKind[] = ['model', 'anim', 'texture', 'sound', 'font', 'music', 'vfx'];
export const CREDIT_LICENSE_URL: Record<string, string> = {
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-NC-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  MIT: 'https://opensource.org/license/mit',
  'OFL-1.1': 'https://openfontlicense.org/open-font-license-official-text/',
  Fontzin: 'https://fontzin.com',
  'GeneralUser-GS-2.0': 'https://github.com/mrbumpy409/GeneralUser-GS/blob/main/LICENSE.txt',
};
/** Key pose cho công cụ tư thế IK (client nướng thành AnimationClip). Thêm tệp mới trong data/poses thì khai báo ở đây. */
export const POSES = [
  poseKiemThuJson,
  poseChemNgangJson,
  posePhiKiemJson,
  poseKiemKhiTramJson,
  poseHoTheJson,
  poseThienKiemVuJson,
  poseHoiNguyenJson,
  poseLoiDinhJson,
  poseNguKiemJson,
  poseNguKhongJson,
  poseNiemChuJson,
  poseTamThienJson,
  poseRutKiemJson,
  poseTraKiemJson,
  poseKiemAnhJson,
  poseVanKiemJson,
  poseTranSonJson,
  poseKimCuongJson,
  poseXuanPhongJson,
  poseHoiThienJson,
  posePhiKiem2Json,
  posePhiKiem3Json,
  posePhiKiemHpJson,
  posePhiKiem2HpJson,
  posePhiKiem3HpJson,
  posePhiKiemDsJson,
  posePhiKiem2DsJson,
  posePhiKiem3DsJson,
  poseKiemKhiTramHpJson,
  poseKiemKhiTramDsJson,
  poseHoanhKiemJson,
  poseThuanDiTramJson,
  poseThienKiemHoaHinhJson,
  poseThietQuyenJson,
  poseDanHoaJson,
  poseKiemVuJson,
  poseKiemDanJson,
  posePheHonJson,
  poseTatDauThanhBinhJson,
  poseSuuHonThuatJson,
  poseAmHonTrieuJson,
  poseDinhThanThuatJson,
  poseHoangTuyenDanJson,
  poseBaoNhanJson,
  poseTramSonDaoJson,
  poseHoanhDaoJson,
  poseTamDaoJson,
  poseDoanLuuJson,
  poseLietDiaTramJson,
  poseThaCoJson,
  poseCoTrieuJson,
  poseHutMauCoJson,
  poseCoBaoJson,
  poseThuCoJson,
  poseHoaCoVuongJson,
  poseCoQuyenJson,
  poseTinhBaoJson,
  poseHuyetCuHoJson,
  poseNhatKichJson,
  posePhanAnhKiemAnhJson,
  poseKimChungJson,
  poseSonNhacJson,
  poseAnhThietThanJson,
  poseThuanDiHoTheJson,
  poseThienKimPhapTuongJson,
  poseMocLinhJson,
  poseDuocVuJson,
  poseNgungDanJson,
  poseAnhDuocHoaThanJson,
  poseThuanDiCuuVienJson,
  poseThienDanPhapGioiJson,
] as unknown as PoseDef[];

function index<T extends { id: string }>(list: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of list) m.set(e.id, e);
  return m;
}

/** Nguồn rơi (id vật phẩm → id quái), sinh từ loot.json, không có tỉ lệ (xem sources.ts). */
export const ITEM_SOURCES = itemSourcesJson as Record<string, string[]>;

export const ITEM = index(ITEMS);

/** Bậc trang bị của món (thiếu = 1). */
export function itemTier(id: string): number {
  return clampTier(ITEM.get(id)?.tier);
}

/** Đích Thăng Bậc của món `id`: `promoteTo` nếu khai báo, không thì món thường cùng ô ở bậc kế. null nếu không có. */
export function promoteTarget(id: string): string | null {
  const def = ITEM.get(id);
  if (!def || !isEquipSlot(def.kind)) return null;
  if (def.promoteTo) return def.promoteTo;
  const to = itemTier(id) + 1;
  return ITEMS.find((i) => i.kind === def.kind && !i.set && itemTier(i.id) === to)?.id ?? null;
}
export const MONSTER = index(MONSTERS);
/** Mọi chiêu: chung + công pháp. */
export const SKILL = index([...SKILLS, ...METHOD_SKILLS]);
export const METHOD = index(METHODS);
export const RECIPE = index(RECIPES);
export const NPC = index(NPCS);
export const QUEST = index(QUESTS);
export const POSE = index(POSES);
/** Dòng thời gian hiệu ứng theo chiêu (VFX-V0): `data/fx/<id chiêu>.json`. Chiêu không có thì dùng đường hiệu ứng cũ. */
export const FX_TIMELINES = [
  fxKiemKhiTramJson,
  fxPhiKiemJson,
  fx_fx_blink,
  fx_fx_dotpha_hn,
  fx_fx_dotpha_kd,
  fx_fx_dotpha_na,
  fx_fx_dotpha_tc,
  fx_fx_fly_on,
  fx_fx_kiep_hn,
  fx_fx_kiep_kd,
  fx_fx_kiep_na,
  fx_fx_kiep_tc,
  fx_fx_soul_in,
  fx_fx_soul_out,
  fx_skl_anh_duoc_hoa_than,
  fx_skl_anh_thiet_than,
  fx_skl_dan_hoa_phong_tran,
  fx_skl_dich_son_xung,
  fx_skl_duoc_vu,
  fx_skl_hoanh_kiem_pha_mach,
  fx_skl_hoi_nguyen_thuat,
  fx_skl_hoi_thien_dan_lo,
  fx_skl_hoi_xuan_quyet,
  fx_skl_kiem_anh_bo,
  fx_skl_kiem_dan_ban_menh,
  fx_skl_u_anh_bo,
  fx_skl_phe_hon,
  fx_skl_suu_hon_thuat,
  fx_skl_am_hon_trieu,
  fx_skl_dinh_than_thuat,
  fx_skl_hoang_tuyen_dan,
  fx_skl_tat_dau_thanh_binh,
  fx_skl_kiem_vu_tam_diep,
  fx_skl_kim_chung_tran,
  fx_skl_bao_nhan,
  fx_skl_tram_son_dao,
  fx_skl_hoanh_dao,
  fx_skl_tam_dao,
  fx_skl_doan_luu,
  fx_skl_liet_dia_tram,
  fx_skl_kim_cuong_bat_hoai,
  fx_skl_linh_khi_ho_the,
  fx_skl_loi_dinh_nhat_kiem,
  fx_skl_luu_huong_bo,
  fx_skl_moc_linh_tran,
  fx_skl_nghich_kiem_chuyen_phong,
  fx_skl_ngung_dan_ho_the,
  fx_skl_phan_anh_kiem_anh,
  fx_skl_phi_kiem_truy_hon,
  fx_skl_son_nhac_hoa_than,
  fx_skl_thien_dan_phap_gioi,
  fx_skl_thien_kiem_hoa_hinh,
  fx_skl_thien_kiem_vu,
  fx_skl_thien_kim_phap_tuong,
  fx_skl_thiet_bich_xung,
  fx_skl_thiet_quyen_chan_dia,
  fx_skl_thuan_di_cuu_vien,
  fx_skl_thuan_di_ho_the,
  fx_skl_thuan_di_tram,
  fx_skl_tran_son_an,
  fx_skl_van_kiem_quy_tong,
] as unknown as FxTimeline[];
export const FX_TIMELINE = new Map(FX_TIMELINES.map((f) => [f.skill, f]));
/** Dòng thời gian hiệu ứng của quái/tinh anh/boss (VFX-V5): `data/fx/mon_*.json`, khóa theo loại sự kiện (mon_hit, mon_strike, mon_boom_circle...). Màu theo ngũ hành lúc chạy. */
export const MON_FX_TIMELINES = [
  fx_mon_bolt_impact,
  fx_mon_bolt_muzzle,
  fx_mon_boom_circle,
  fx_mon_boom_cone,
  fx_mon_boom_line,
  fx_mon_cast,
  fx_mon_death,
  fx_mon_hit,
  fx_mon_strike,
  fx_mon_warn_cone,
  fx_mon_warn_line,
  fx_mon_warn,
] as unknown as FxTimeline[];
export const MON_FX = new Map(MON_FX_TIMELINES.map((f) => [f.skill, f]));
/**
 * Dòng thời gian hiệu ứng của Thiên Nhân Ngũ Suy (TN-4): `data/fx/suy_*.json`, sinh bằng `tools/vfx/gen-fx-suy.py`. Khóa theo sự kiện trên sân
 * (suy_nhan, suy_toi_hit, suy_den_lit...); client phát tại điểm server báo (`game/fx/suyFx.ts`).
 */
export const SUY_FX_TIMELINES = [
  fx_suy_den_dark,
  fx_suy_den_gust,
  fx_suy_den_light,
  fx_suy_den_lit,
  fx_suy_den_out,
  fx_suy_den_relit,
  fx_suy_enter_linh,
  fx_suy_enter_tam,
  fx_suy_enter_the,
  fx_suy_enter_tho,
  fx_suy_enter_thuc,
  fx_suy_fail,
  fx_suy_nhan,
  fx_suy_nhan_end,
  fx_suy_nhan_open,
  fx_suy_ok,
  fx_suy_tam_bad,
  fx_suy_tam_good,
  fx_suy_tam_miss,
  fx_suy_tam_open,
  fx_suy_thuc_boom,
  fx_suy_thuc_brew,
  fx_suy_thuc_pulse,
  fx_suy_thuc_void,
  fx_suy_toi_hit,
  fx_suy_toi_miss,
  fx_suy_toi_warn,
] as unknown as FxTimeline[];
export const SUY_FX = new Map(SUY_FX_TIMELINES.map((f) => [f.skill, f]));
/**
 * Dòng thời gian hiệu ứng của Huyền Kiếp (TN-6): `data/fx/hk_*.json`, sinh bằng `tools/vfx/gen-fx-hk.py`; client phát tại điểm server báo qua `hkmark`.
 */
export const HK_FX_TIMELINES = [
  fx_hk_chau,
  fx_hk_chau_get,
  fx_hk_chau_gone,
  fx_hk_enter,
  fx_hk_huyet_kill,
  fx_hk_huyet_spawn,
  fx_hk_loi_boom,
  fx_hk_loi_hot,
  fx_hk_loi_rod,
  fx_hk_loi_zap,
  fx_hk_luan_grind,
  fx_hk_luan_warn,
  fx_hk_luan_wheel,
  fx_hk_ly_cut,
  fx_hk_ly_out,
  fx_hk_ly_seal,
  fx_hk_phong_blow,
  fx_hk_phong_hit,
  fx_hk_phong_pillar,
  fx_hk_phong_safe,
  fx_hk_phong_warn,
  fx_hk_tuc_bad,
  fx_hk_tuc_beat,
  fx_hk_tuc_good,
  fx_hk_tuyet_drift,
  fx_hk_van_bad,
  fx_hk_van_ok,
  fx_hk_van_spin,
  fx_hk_van_true,
] as unknown as FxTimeline[];
export const HK_FX = new Map(HK_FX_TIMELINES.map((f) => [f.skill, f]));

/** TN-2: hiệu ứng tại điểm của Hồn tu (nhịp hồn binh, tia hồn thu về), client phát bằng `FxRunner.startAt` (`game/fx/honFx.ts`). */
export const HON_FX_TIMELINES = [fx_hon_binh_hit, fx_hon_reap, fx_hon_binh_stand] as unknown as FxTimeline[];
export const HON_FX = new Map(HON_FX_TIMELINES.map((f) => [f.skill, f]));
/** Timeline của từng kiếp nhỏ (theo cơ chế `hk_*`), gồm cả phần chung vào/qua/trượt: ngân sách draw call kiểm theo nhóm này. */
export const HK_FX_STAGE: Record<string, string[]> = {
  hk_tuyet: ['hk_enter', 'hk_tuyet_drift', 'suy_ok', 'suy_fail'],
  hk_phong: ['hk_enter', 'hk_phong_pillar', 'hk_phong_warn', 'hk_phong_blow', 'hk_phong_safe', 'hk_phong_hit', 'suy_ok', 'suy_fail'],
  hk_loi: ['hk_enter', 'hk_loi_rod', 'hk_loi_hot', 'hk_loi_zap', 'hk_loi_boom', 'suy_ok', 'suy_fail'],
  hk_tram_ly: ['hk_enter', 'hk_ly_seal', 'hk_ly_out', 'hk_ly_cut', 'suy_ok', 'suy_fail'],
  hk_huyet_anh: ['hk_enter', 'hk_huyet_spawn', 'hk_huyet_kill', 'suy_ok', 'suy_fail'],
  hk_van_tam: ['hk_enter', 'hk_van_true', 'hk_van_spin', 'hk_van_ok', 'hk_van_bad', 'suy_ok', 'suy_fail'],
  hk_kho_than: ['hk_enter', 'hk_tuc_beat', 'hk_tuc_good', 'hk_tuc_bad', 'suy_ok', 'suy_fail'],
  hk_hon_tho: ['hk_enter', 'hk_chau', 'hk_chau_get', 'hk_chau_gone', 'suy_ok', 'suy_fail'],
  hk_luan_hoi: ['hk_enter', 'hk_luan_wheel', 'hk_luan_warn', 'hk_luan_grind', 'suy_ok', 'suy_fail'],
};
/** Timeline của từng ải (theo cơ chế `suy_*`), tính cả phần chung vào/qua/trượt ải: ngân sách draw call kiểm theo nhóm này. */
export const SUY_FX_STAGE: Record<string, string[]> = {
  suy_linh: ['suy_enter_linh', 'suy_nhan_open', 'suy_nhan', 'suy_nhan_end', 'suy_ok', 'suy_fail'],
  suy_the: ['suy_enter_the', 'suy_toi_warn', 'suy_toi_hit', 'suy_toi_miss', 'suy_ok', 'suy_fail'],
  suy_thuc: ['suy_enter_thuc', 'suy_thuc_brew', 'suy_thuc_pulse', 'suy_thuc_void', 'suy_thuc_boom', 'suy_ok', 'suy_fail'],
  suy_tho: [
    'suy_enter_tho',
    'suy_den_lit',
    'suy_den_dark',
    'suy_den_gust',
    'suy_den_out',
    'suy_den_light',
    'suy_den_relit',
    'suy_ok',
    'suy_fail',
  ],
  suy_tam: ['suy_enter_tam', 'suy_tam_open', 'suy_tam_good', 'suy_tam_bad', 'suy_tam_miss', 'suy_ok', 'suy_fail'],
};
/** Tra theo id trên CẢ 14 nguồn (nguồn nào được chọn do `isRootId` quyết định, không phải bảng này). */
export const ROOT = index(ORIGINS);
export const ORIGIN = ROOT;
export const ARTIFACT = index(ARTIFACTS);
/** Danh sách chiêu của phân thân thần niệm theo công pháp (E4-K): `data/clones.json`. */
export const CLONE_MOVES = clonesJson as unknown as Record<string, CloneMethodDef>;

/** Ngoại hình người chơi: giới tính, màu áo (quyết định 6.4b). */
export const APPEARANCE = appearanceJson as AppearanceData;
export const DYE = index(APPEARANCE.dyes);

/** Bảng trang bị 8 ô: ô, phẩm, dòng phụ (truyền vào các hàm roll/tính chỉ số của `@dtl/shared`). */
export const ITEM_SYS: ItemSysData = {
  slots: equipSlotsJson as SlotDef[],
  qualities: equipQualitiesJson as QualityDef[],
  affixes: equipAffixesJson.affixes as ItemSysData['affixes'],
  params: equipAffixesJson.params,
};

/** Bộ trang bị (P3-4) và công thức chế ở Thiết lão. */
export const SETS = equipSetsJson as unknown as SetDef[];
export const SET = index(SETS);

/** Hành trình theo chương (U2-4): màn "Bản đồ chương". */
export const CHAPTERS = chaptersJson.chapters as unknown as ChapterDef[];
/** Bộ trang bị có trang phục riêng: id bộ → tên trang phục. Từ N-7 hình là model v3 nguyên khối (`V3_OWN_SETS` ở client); áo mô-đun `<mảnh>_nam|nu` đã gỡ. */
export const OUTFITS = Object.fromEntries(Object.entries(outfitsJson).filter(([k]) => k !== '$comment')) as Record<string, string[]>;
export const FORGE = forgeJson as ForgeRecipe[];
export const FORGE_BY_ID = index(FORGE);

/** Vật phẩm dùng để cường hóa trang bị. */
export const ENHANCE_ORE = 'itm_thiet_tinh';
export const TRUC_CO_PILL = 'itm_truc_co_dan';

// ---- i18n ----

const STRINGS: Record<string, string> = { ...(viJson as Record<string, string>), ...(viUiJson as Record<string, string>) };

/** Lấy chuỗi hiển thị theo key, thay {tham_số}. Thiếu key thì trả về chính key để dễ phát hiện. */
export function t(key: string, params?: Record<string, string | number>): string {
  let s = STRINGS[key];
  if (s === undefined) return key;
  if (params) {
    for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  }
  return s;
}

export function hasString(key: string): boolean {
  return STRINGS[key] !== undefined;
}

export function realmName(level: number): string {
  return t('realm.' + level);
}

/** Tên đại cảnh giới kế tiếp (đích của độ kiếp) từ cấp `level`: Ngưng Khí → Trúc Cơ, Trúc Cơ → Kết Đan... Lấy từ bảng thuật ngữ. */
export function nextMajorRealmName(level: number): string {
  return GLOSSARY.realms[majorRealmOf(level) + 1] ?? '';
}

export function itemName(id: string, plus?: number): string {
  const n = t('item.' + id + '.name');
  if (!plus) return n;
  // Đan: `plus` là phẩm chất (1 Trung, 2 Thượng), không phải cường hóa.
  if (ITEM.get(id)?.kind === 'consumable') return `${n} (${t('ui.pill.q' + plus)})`;
  return `${n} +${plus}`;
}

/** Model kiếm mặc định (không đeo vũ khí, vũ khí lạ): kiếm Thanh Phong. */
export const SWORD_MODEL_DEFAULT = 'prop_kiem_thanh_phong';
/** Model theo phẩm (`rarity` 0..4) cho vũ khí chưa khai báo `model`: gần nhất theo phẩm. */
const SWORD_MODEL_BY_RARITY = [
  'prop_kiem_thiet',
  'prop_kiem_thanh_phong',
  'prop_kiem_han_quang',
  'prop_kiem_han_giao',
  'prop_kiem_tram_ta',
];
/** Kiếm bậc mới (E2): Liệt Mạch (bậc 2) đã gắn vật phẩm `itm_liet_mach_kiem`; Kính Quang (bậc 3) và Tinh Khuyết (bậc 4) đã nhập model, chờ E3/E4 thêm vật phẩm. */
export const SWORD_MODELS_TIER = [
  'prop_kiem_liet_mach',
  'prop_kiem_kinh_quang',
  'prop_kiem_tinh_khuyet',
  'prop_kiem_liet_mach_cuoi',
  'prop_kiem_tinh_khuyet_cuoi',
  'prop_kiem_kinh_quang_cuoi',
];
/** Dạng cuối khi cường hóa +10 (`glowStage` = 2): model kiếm → model dạng cuối (T-5). Kiếm chưa có dạng cuối giữ model cũ. */
export const SWORD_FINAL: Record<string, string> = {
  prop_kiem_liet_mach: 'prop_kiem_liet_mach_cuoi',
  prop_kiem_tinh_khuyet: 'prop_kiem_tinh_khuyet_cuoi',
  prop_kiem_kinh_quang: 'prop_kiem_kinh_quang_cuoi',
};
/** Vỏ kiếm đeo lưng khi mặc áo bộ mô-đun: dùng chung tạm cho mọi kiếm chưa có vỏ riêng. */
export const SCABBARD_DEFAULT = 'prop_vo_kiem_liet_mach';
/** Vỏ riêng theo model kiếm (cả dạng gốc và dạng cuối dùng chung một vỏ); kiếm không có tên ở đây dùng `SCABBARD_DEFAULT`. */
export const SCABBARD_OF: Record<string, string> = {
  prop_kiem_tinh_khuyet: 'prop_vo_kiem_tinh_khuyet',
  prop_kiem_tinh_khuyet_cuoi: 'prop_vo_kiem_tinh_khuyet',
  prop_kiem_kinh_quang: 'prop_vo_kiem_kinh_quang',
  prop_kiem_kinh_quang_cuoi: 'prop_vo_kiem_kinh_quang',
};
/** Màu hào quang cường hóa theo model kiếm (ưu tiên hơn màu của bộ): Tinh Khuyết là tím sao, Kính Quang là lam băng, không phải xanh ngọc của kiếm thấp. */
export const SWORD_GLOW_TINT: Record<string, string> = {
  prop_kiem_tinh_khuyet: '#9B84F2',
  prop_kiem_tinh_khuyet_cuoi: '#9B84F2',
  prop_kiem_kinh_quang: '#8FD8F0',
  prop_kiem_kinh_quang_cuoi: '#8FD8F0',
};
export function scabbardOf(swordModel?: string): string {
  return (swordModel && SCABBARD_OF[swordModel]) || SCABBARD_DEFAULT;
}
export const SWORD_MODELS = [...new Set([SWORD_MODEL_DEFAULT, ...SWORD_MODEL_BY_RARITY, ...SWORD_MODELS_TIER])];

/** Asset model 3D của kiếm đang cầm: `model` của món nếu có, không thì theo phẩm; id không phải vũ khí → kiếm mặc định. */
export function swordModelOf(itemId: string | undefined, glowStage = 0): string {
  const base = swordBaseModelOf(itemId);
  return glowStage >= 2 ? (SWORD_FINAL[base] ?? base) : base;
}

function swordBaseModelOf(itemId: string | undefined): string {
  const it = itemId ? ITEM.get(itemId) : undefined;
  if (!it || it.kind !== 'weapon') return SWORD_MODEL_DEFAULT;
  return it.model ?? SWORD_MODEL_BY_RARITY[Math.max(0, Math.min(SWORD_MODEL_BY_RARITY.length - 1, it.rarity))] ?? SWORD_MODEL_DEFAULT;
}

export function monsterName(id: string): string {
  return t('mon.' + id);
}

export function methodName(id: string): string {
  return t('method.' + id + '.name');
}

export function skillName(id: string): string {
  return t('skill.' + id + '.name');
}

/** Ô trên thanh chiêu 8 ô: 6 chiêu chung, rồi chiêu đặc trưng và tối thượng của công pháp (thiếu công pháp thì không có). */
export function skillBar(methodId: string | undefined): SkillDef[] {
  const m = methodId ? METHOD.get(methodId) : undefined;
  const bar = [...SKILLS];
  if (m) {
    const sig = SKILL.get(m.sig);
    const ult = SKILL.get(m.ult);
    if (sig) bar.push(sig);
    if (ult) bar.push(ult);
  }
  return bar;
}

/** Chiêu tư thế của công pháp (VS-2e, mỗi công pháp một chiêu `kind: 'stance'`); chưa có công pháp thì không có. */
export function stanceSkill(methodId: string | undefined): SkillDef | undefined {
  return methodId ? METHOD_SKILLS.find((s) => s.method === methodId && s.kind === 'stance') : undefined;
}

/** Phím tắt hàng chiêu bậc cao: Shift + số (E2-G). */
export const TIER_MIN_UNLOCK = 16;
/** Cấp mở thần thông ô 9 (Kết Đan sơ kỳ, E2-E). */
export const THAN_THONG_UNLOCK = 20;

/** Cấp mở thần thông ô 10 (Hóa Thần sơ kỳ, E4-K). */
export const THAN_THONG_10_UNLOCK = 28;

/** Thần thông ô 10 của công pháp (chiêu cấp 28): chỉ số `BAR_SIZE + 1` trong `Game.bar()`, phím `` ` `` (Backquote), ngay sau ô 9. */
export function thanThong10Skill(methodId: string | undefined): SkillDef | undefined {
  if (!methodId) return undefined;
  return METHOD_SKILLS.find((s) => s.method === methodId && s.unlock === THAN_THONG_10_UNLOCK && !s.locked);
}

/**
 * Thần thông của công pháp (chiêu mở ở Kết Đan sơ kỳ, cấp 20): nằm ở **ô chiêu 9** (chỉ số `BAR_SIZE` trong `Game.bar()`, phím 0).
 * Ô 10 (Hóa Thần, cấp 28) là `thanThong10Skill`. Không có công pháp thì không có thần thông.
 */
export function thanThongSkill(methodId: string | undefined, picks?: BranchPicks): SkillDef | undefined {
  if (!methodId) return undefined;
  const at20 = METHOD_SKILLS.filter((s) => s.method === methodId && s.unlock === THAN_THONG_UNLOCK && !s.locked);
  // VS-2d: mốc Kết Đan có hai nhánh, ô 9 là chiêu của nhánh đã chọn (chưa chọn thì tạm hiện chiêu đầu, server sẽ nhắc chọn nhánh).
  const m = METHOD.get(methodId);
  const picked = m ? pickedBranch(m, picks, THAN_THONG_UNLOCK) : undefined;
  return (picked && at20.find((s) => picked.grants.includes(s.id))) ?? at20[0];
}

/**
 * Chiêu bậc 2–3 của công pháp (mở theo cảnh giới Trúc Cơ/Kết Đan), xếp theo cảnh giới mở, **trừ thần thông ô 9** (đã ở ô chính).
 * Hàng này nằm sau ô 9 và ô 10 (chỉ số ≥ `BAR_SIZE + 2` trong `Game.bar()`), phím Shift+1…
 * Chiêu còn khóa (Nguyên Anh trở lên, cơ chế chưa làm) không có trong hàng.
 */
export function tierBar(methodId: string | undefined, picks?: BranchPicks): SkillDef[] {
  if (!methodId) return [];
  const m = METHOD.get(methodId);
  // VS-2d: hàng này là chiêu của mốc Trúc Cơ (16) và Nguyên Anh (24); mốc Kết Đan (20) và Hóa Thần (28) nằm ở ô 9, ô 10.
  // Mốc đã chọn nhánh chỉ hiện chiêu của nhánh đó; mốc chưa chọn hiện cả hai để người chơi thấy mình đang chọn giữa gì.
  return METHOD_SKILLS.filter(
    (s) =>
      s.method === methodId &&
      s.unlock >= TIER_MIN_UNLOCK &&
      !s.locked &&
      s.unlock !== THAN_THONG_UNLOCK &&
      s.unlock !== THAN_THONG_10_UNLOCK &&
      (!m || skillGate(m, picks, s.id) !== 'other'),
  ).sort((a, b) => a.unlock - b.unlock);
}

/** Chiêu `skill` đã gộp cấp chiêu và biến thức theo trạng thái công pháp server gửi (null = chưa có: cấp 1, không biến thức). */
export function resolveBarSkill(
  m: { lv: Record<string, number>; vr: Record<string, 'a' | 'b'> } | null | undefined,
  skill: SkillDef,
): ResolvedSkill {
  return resolveSkill(skill, m?.lv[skill.id] ?? 1, VARIANTS[skill.id], m?.vr[skill.id]);
}

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
  type ResolvedSkill,
  type TerrainDef,
  kieuOfLevel,
  KIEU_MOOD,
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
import cuuKieuJson from '../data/levels/cuu_kieu.json';
import cuuKieuTerrainJson from '../data/levels/cuu_kieu.terrain.json';
import cuuKieuAssetsJson from '../data/levels/cuu_kieu.assets.json';
import vanDinhJson from '../data/levels/van_dinh.json';
import vanDinhTerrainJson from '../data/levels/van_dinh.terrain.json';
import vanDinhAssetsJson from '../data/levels/van_dinh.assets.json';
import kieu1Json from '../data/levels/kieu_1.json';
import kieu1AssetsJson from '../data/levels/kieu_1.assets.json';
import kieu2Json from '../data/levels/kieu_2.json';
import kieu2AssetsJson from '../data/levels/kieu_2.assets.json';
import kieu3Json from '../data/levels/kieu_3.json';
import kieu3AssetsJson from '../data/levels/kieu_3.assets.json';
import kieu4Json from '../data/levels/kieu_4.json';
import kieu4AssetsJson from '../data/levels/kieu_4.assets.json';
import kieu5Json from '../data/levels/kieu_5.json';
import kieu5AssetsJson from '../data/levels/kieu_5.assets.json';
import kieu6Json from '../data/levels/kieu_6.json';
import kieu6AssetsJson from '../data/levels/kieu_6.assets.json';
import kieu7Json from '../data/levels/kieu_7.json';
import kieu7AssetsJson from '../data/levels/kieu_7.assets.json';
import kieu8Json from '../data/levels/kieu_8.json';
import kieu8AssetsJson from '../data/levels/kieu_8.assets.json';
import kieu9Json from '../data/levels/kieu_9.json';
import kieu9AssetsJson from '../data/levels/kieu_9.assets.json';
import gioiTriJson from '../data/levels/gioi_tri.json';
import gioiTriAssetsJson from '../data/levels/gioi_tri.assets.json';
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
import posePhiKiemJson from '../data/poses/phi_kiem.json';
import poseKiemKhiTramJson from '../data/poses/kiem_khi_tram.json';
// Thân Pháp T4 (pilot TP-1, sinh bằng tools/poses/thanphap.mjs): chỉ được chọn khi bật `?thanphap=1`.
import poseKiemKhiTramTpJson from '../data/poses/kiem_khi_tram_tp.json';
import posePhiKiemTpJson from '../data/poses/phi_kiem_tp.json';
import poseThienKiemVuTpJson from '../data/poses/thien_kiem_vu_tp.json';
import posePhiKiem2TpJson from '../data/poses/phi_kiem_2_tp.json';
import posePhiKiem3TpJson from '../data/poses/phi_kiem_3_tp.json';
import poseKiemIdleXoayJson from '../data/poses/kiem_idle_xoay.json';
import poseKiemIdleChapTayJson from '../data/poses/kiem_idle_chap_tay.json';
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
import posePhiKiemDtJson from '../data/poses/phi_kiem_dt.json';
import posePhiKiem2DtJson from '../data/poses/phi_kiem_2_dt.json';
import posePhiKiem3DtJson from '../data/poses/phi_kiem_3_dt.json';
import poseKiemKhiTramDtJson from '../data/poses/kiem_khi_tram_dt.json';
import posePhiKiemLtJson from '../data/poses/phi_kiem_lt.json';
import posePhiKiem2LtJson from '../data/poses/phi_kiem_2_lt.json';
import posePhiKiem3LtJson from '../data/poses/phi_kiem_3_lt.json';
import poseKiemKhiTramLtJson from '../data/poses/kiem_khi_tram_lt.json';
import posePhiKiemHtJson from '../data/poses/phi_kiem_ht.json';
import posePhiKiem2HtJson from '../data/poses/phi_kiem_2_ht.json';
import posePhiKiem3HtJson from '../data/poses/phi_kiem_3_ht.json';
import poseKiemKhiTramHtJson from '../data/poses/kiem_khi_tram_ht.json';
import posePhiKiemCtJson from '../data/poses/phi_kiem_ct.json';
import posePhiKiem2CtJson from '../data/poses/phi_kiem_2_ct.json';
import posePhiKiem3CtJson from '../data/poses/phi_kiem_3_ct.json';
import poseKiemKhiTramCtJson from '../data/poses/kiem_khi_tram_ct.json';
import posePhiKiemTtJson from '../data/poses/phi_kiem_tt.json';
import posePhiKiem2TtJson from '../data/poses/phi_kiem_2_tt.json';
import posePhiKiem3TtJson from '../data/poses/phi_kiem_3_tt.json';
import poseKiemKhiTramTtJson from '../data/poses/kiem_khi_tram_tt.json';
import posePhiKiemCsJson from '../data/poses/phi_kiem_cs.json';
import posePhiKiem2CsJson from '../data/poses/phi_kiem_2_cs.json';
import posePhiKiem3CsJson from '../data/poses/phi_kiem_3_cs.json';
import poseKiemKhiTramCsJson from '../data/poses/kiem_khi_tram_cs.json';
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
import posePhongCamJson from '../data/poses/phong_cam.json';
import poseMauDonCamJson from '../data/poses/mau_don_cam.json';
import posePhaDietCamJson from '../data/poses/pha_diet_cam.json';
import poseTueNguyetCamJson from '../data/poses/tue_nguyet_cam.json';
import poseSinhTuCamJson from '../data/poses/sinh_tu_cam.json';
import posePhienThienAnJson from '../data/poses/phien_thien_an.json';
import poseThuanDaoTramJson from '../data/poses/thuan_dao_tram.json';
import poseHuyetChienTheJson from '../data/poses/huyet_chien_the.json';
import poseDoanThienDaoJson from '../data/poses/doan_thien_dao.json';
import posePhanCoThuatJson from '../data/poses/phan_co_thuat.json';
import poseKimThienCoJson from '../data/poses/kim_thien_co.json';
import poseVanCoPheTheJson from '../data/poses/van_co_phe_the.json';
import poseDiaSatTranJson from '../data/poses/dia_sat_tran.json';
import poseThaiHuHoTranJson from '../data/poses/thai_hu_ho_tran.json';
import poseLacThuDaiTranJson from '../data/poses/lac_thu_dai_tran.json';
import poseCoQuyenJson from '../data/poses/co_quyen.json';
import poseHoaHinhJson from '../data/poses/hoa_hinh.json';
import poseHuyetCuHoJson from '../data/poses/huyet_cu_ho.json';
import poseTinhBaoJson from '../data/poses/tinh_bao.json';
import poseNhatKichJson from '../data/poses/nhat_kich.json';
import poseLoiAnKichJson from '../data/poses/loi_an_kich.json';
import poseCuuTieuJson from '../data/poses/cuu_tieu.json';
import posePhichLichJson from '../data/poses/phich_lich.json';
import poseLoiVongJson from '../data/poses/loi_vong.json';
import poseLoiPhatJson from '../data/poses/loi_phat.json';
import poseLoiHaiJson from '../data/poses/loi_hai.json';
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
/** Nhiệm vụ nhánh Hướng tu: nhận được khi nhiệm vụ không gắn hướng, hoặc `pathId` (hướng tu đang dùng) trùng. */
export function questPathOk(q: { path?: string }, pathId: string | undefined): boolean {
  return !q.path || q.path === pathId;
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
  van_dinh: vanDinhJson as LevelDef,
  cuu_kieu: cuuKieuJson as LevelDef,
  gioi_tri: gioiTriJson as LevelDef,
  kieu_1: kieu1Json as LevelDef,
  kieu_2: kieu2Json as LevelDef,
  kieu_3: kieu3Json as LevelDef,
  kieu_4: kieu4Json as LevelDef,
  kieu_5: kieu5Json as LevelDef,
  kieu_6: kieu6Json as LevelDef,
  kieu_7: kieu7Json as LevelDef,
  kieu_8: kieu8Json as LevelDef,
  kieu_9: kieu9Json as LevelDef,
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
registerTerrain(vanDinhTerrainJson as unknown as TerrainDef); // TN-3: Vấn Đỉnh Âm Dương Giới (chương 6)
registerTerrain(cuuKieuTerrainJson as unknown as TerrainDef); // TN-7: Thiên Lộ Giới (chương 7, Cửu Kiều)
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
  van_dinh: vanDinhAssetsJson as LevelAssets,
  cuu_kieu: cuuKieuAssetsJson as LevelAssets,
  gioi_tri: gioiTriAssetsJson as LevelAssets,
  kieu_1: kieu1AssetsJson as LevelAssets,
  kieu_2: kieu2AssetsJson as LevelAssets,
  kieu_3: kieu3AssetsJson as LevelAssets,
  kieu_4: kieu4AssetsJson as LevelAssets,
  kieu_5: kieu5AssetsJson as LevelAssets,
  kieu_6: kieu6AssetsJson as LevelAssets,
  kieu_7: kieu7AssetsJson as LevelAssets,
  kieu_8: kieu8AssetsJson as LevelAssets,
  kieu_9: kieu9AssetsJson as LevelAssets,
  do_kiep: doKiepAssetsJson as LevelAssets,
  do_kiep_bac_hoang: doKiepBhAssetsJson as LevelAssets,
  phuc_mach: phucMachAssetsJson as LevelAssets,
  kinh_nguyet: kinhNguyetAssetsJson as LevelAssets,
  than_tang: thanTangAssetsJson as LevelAssets,
  xich_tan_khich: xichTanKhichAssetsJson as LevelAssets,
  kim_da_cung: kimDaCungAssetsJson as LevelAssets,
  luyen_than: luyenThanAssetsJson as LevelAssets,
};
// Mood và lớp prop sàn phòng cầu Cửu Kiều (TN-7): bảng `KIEU_MOOD` (sinh bởi tools/maps/gen-kieu-arena.mjs) ghi đè `assets.mood` để cầu 3–9 (level thêm sau) tự theo.
for (const [id, a] of Object.entries(LEVEL_ASSETS)) {
  const n = kieuOfLevel(id);
  if (n) {
    a.mood = KIEU_MOOD[n - 1] as LevelAssets['mood'];
    a.ground = { mask: 'neutral', set: 'terrain-slate' }; // sàn đá thay cỏ trơn (đọc được là sân đá ở ?cam=iso)
    a.features = { ...a.features, trees: 'scatter' }; // bật lớp prop (props.kieu.ts); phòng cầu không có cây thật
  }
}
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
  poseKiemKhiTramTpJson,
  posePhiKiemTpJson,
  poseThienKiemVuTpJson,
  posePhiKiem2TpJson,
  posePhiKiem3TpJson,
  poseKiemIdleXoayJson,
  poseKiemIdleChapTayJson,
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
  posePhiKiemDtJson,
  posePhiKiem2DtJson,
  posePhiKiem3DtJson,
  poseKiemKhiTramDtJson,
  posePhiKiemLtJson,
  posePhiKiem2LtJson,
  posePhiKiem3LtJson,
  poseKiemKhiTramLtJson,
  posePhiKiemHtJson,
  posePhiKiem2HtJson,
  posePhiKiem3HtJson,
  poseKiemKhiTramHtJson,
  posePhiKiemCtJson,
  posePhiKiem2CtJson,
  posePhiKiem3CtJson,
  poseKiemKhiTramCtJson,
  posePhiKiemTtJson,
  posePhiKiem2TtJson,
  posePhiKiem3TtJson,
  poseKiemKhiTramTtJson,
  posePhiKiemCsJson,
  posePhiKiem2CsJson,
  posePhiKiem3CsJson,
  poseKiemKhiTramCsJson,
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
  posePhongCamJson,
  poseMauDonCamJson,
  posePhaDietCamJson,
  poseTueNguyetCamJson,
  poseSinhTuCamJson,
  posePhienThienAnJson,
  poseThuanDaoTramJson,
  poseHuyetChienTheJson,
  poseDoanThienDaoJson,
  posePhanCoThuatJson,
  poseKimThienCoJson,
  poseVanCoPheTheJson,
  poseDiaSatTranJson,
  poseThaiHuHoTranJson,
  poseLacThuDaiTranJson,
  poseCoQuyenJson,
  poseHoaHinhJson,
  poseTinhBaoJson,
  poseHuyetCuHoJson,
  poseNhatKichJson,
  poseLoiAnKichJson,
  poseCuuTieuJson,
  posePhichLichJson,
  poseLoiVongJson,
  poseLoiPhatJson,
  poseLoiHaiJson,
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
export * from './fxRegistry';
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

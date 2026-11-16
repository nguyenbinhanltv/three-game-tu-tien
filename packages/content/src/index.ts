import { majorRealmOf, resolveSkill, type ResolvedSkill } from '@dtl/shared';
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
  QualityDef,
  SlotDef,
  LevelAssets,
  LevelDef,
  MonsterDef,
  NpcDef,
  PoseDef,
  QuestDef,
  RealmDef,
  RootDef,
  RecipeDef,
  SkillDef,
} from '@dtl/shared';
import itemsJson from '../data/items.json';
import monstersJson from '../data/monsters.json';
import skillsJson from '../data/skills.json';
import methodsJson from '../data/methods.json';
import recipesJson from '../data/recipes.json';
import artifactsJson from '../data/artifacts.json';
import alchemyJson from '../data/alchemy.json';
import npcsJson from '../data/npcs.json';
import questsJson from '../data/quests.json';
import realmsJson from '../data/realms.json';
import rootsJson from '../data/roots.json';
import vanLamJson from '../data/levels/van_lam.json';
import kiemTrungJson from '../data/levels/kiem_trung.json';
import vanLamAssetsJson from '../data/levels/van_lam.assets.json';
import kiemTrungAssetsJson from '../data/levels/kiem_trung.assets.json';
import glossaryJson from '../data/glossary.json';
import viJson from '../data/i18n/vi.json';
import viUiJson from '../data/i18n/vi.ui.json';
import poseKiemThuJson from '../data/poses/kiem_thu.json';
import poseChemNgangJson from '../data/poses/chem_ngang.json';
import posePhiKiemJson from '../data/poses/phi_kiem.json';
import poseKiemKhiTramJson from '../data/poses/kiem_khi_tram.json';
import poseHoTheJson from '../data/poses/ho_the.json';
import poseThienKiemVuJson from '../data/poses/thien_kiem_vu.json';
import poseHoiNguyenJson from '../data/poses/hoi_nguyen.json';
import poseLoiDinhJson from '../data/poses/loi_dinh.json';
import poseNguKiemJson from '../data/poses/ngu_kiem.json';
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
import appearanceJson from '../data/appearance.json';
import equipSlotsJson from '../data/equipment/slots.json';
import equipQualitiesJson from '../data/equipment/qualities.json';
import equipTemplatesJson from '../data/equipment/templates.json';
import equipAffixesJson from '../data/equipment/affixes.json';
import equipSetsJson from '../data/equipment/sets.json';
import equipSetItemsJson from '../data/equipment/setItems.json';
import forgeJson from '../data/equipment/forge.json';

/** Mẫu trang bị chỉ để rơi (chưa có icon trong atlas, dùng iconFallback) nằm ở data/equipment/templates.json. */
export const ITEMS = [...(itemsJson as ItemDef[]), ...(equipTemplatesJson as ItemDef[]), ...(equipSetItemsJson as ItemDef[]), ...(methodsJson.items as ItemDef[]), ...(artifactsJson.items as ItemDef[]), ...(alchemyJson.items as ItemDef[])];
export const MONSTERS = monstersJson as unknown as MonsterDef[];
/** 6 chiêu chung (ô 1–6 trên thanh chiêu). Chiêu công pháp nằm riêng ở `METHOD_SKILLS`. */
export const SKILLS = skillsJson as SkillDef[];
/** Công pháp chủ tu và chiêu của chúng (Phase 3-5, data/methods.json). */
export const METHODS = methodsJson.methods as MethodDef[];
export const METHOD_SKILLS = methodsJson.skills as SkillDef[];
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
};
/** Asset client theo level (`levels/<id>.assets.json`, E1-D). */
export const LEVEL_ASSETS: Record<string, LevelAssets> = {
  van_lam: vanLamAssetsJson as LevelAssets,
  kiem_trung: kiemTrungAssetsJson as LevelAssets,
};
/** Năm linh căn ngũ hành (P3-7). */
export const ROOTS = rootsJson as RootDef[];
export const GLOSSARY = glossaryJson;
/** Key pose cho công cụ tư thế IK (client nướng thành AnimationClip). Thêm tệp mới trong data/poses thì khai báo ở đây. */
export const POSES = [poseKiemThuJson, poseChemNgangJson, posePhiKiemJson, poseKiemKhiTramJson, poseHoTheJson, poseThienKiemVuJson, poseHoiNguyenJson, poseLoiDinhJson, poseNguKiemJson, poseNiemChuJson, poseTamThienJson, poseRutKiemJson, poseTraKiemJson, poseKiemAnhJson, poseVanKiemJson, poseTranSonJson, poseKimCuongJson, poseXuanPhongJson, poseHoiThienJson, posePhiKiem2Json, posePhiKiem3Json, posePhiKiemHpJson, posePhiKiem2HpJson, posePhiKiem3HpJson, posePhiKiemDsJson, posePhiKiem2DsJson, posePhiKiem3DsJson, poseKiemKhiTramHpJson, poseKiemKhiTramDsJson] as unknown as PoseDef[];

function index<T extends { id: string }>(list: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of list) m.set(e.id, e);
  return m;
}

export const ITEM = index(ITEMS);
export const MONSTER = index(MONSTERS);
/** Mọi chiêu: chung + công pháp. */
export const SKILL = index([...SKILLS, ...METHOD_SKILLS]);
export const METHOD = index(METHODS);
export const RECIPE = index(RECIPES);
export const NPC = index(NPCS);
export const QUEST = index(QUESTS);
export const POSE = index(POSES);
export const ROOT = index(ROOTS);
export const ARTIFACT = index(ARTIFACTS);

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
const SWORD_MODEL_BY_RARITY = ['prop_kiem_thiet', 'prop_kiem_thanh_phong', 'prop_kiem_han_quang', 'prop_kiem_han_giao', 'prop_kiem_tram_ta'];
/** Kiếm bậc mới (E2: Đoạn Mạch 16–19, Vân Hải 20–23, Cổ Thành 24–27): đã nhập model, chưa gắn vật phẩm (E2-F nối `model` vào items.json). */
export const SWORD_MODELS_TIER = ['prop_kiem_liet_mach', 'prop_kiem_kinh_quang', 'prop_kiem_tinh_khuyet'];
export const SWORD_MODELS = [...new Set([SWORD_MODEL_DEFAULT, ...SWORD_MODEL_BY_RARITY, ...SWORD_MODELS_TIER])];

/** Asset model 3D của kiếm đang cầm: `model` của món nếu có, không thì theo phẩm; id không phải vũ khí → kiếm mặc định. */
export function swordModelOf(itemId: string | undefined): string {
  const it = itemId ? ITEM.get(itemId) : undefined;
  if (!it || it.kind !== 'weapon') return SWORD_MODEL_DEFAULT;
  return it.model ?? SWORD_MODEL_BY_RARITY[Math.max(0, Math.min(SWORD_MODEL_BY_RARITY.length - 1, it.rarity))];
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

/** Chiêu `skill` đã gộp cấp chiêu và biến thức theo trạng thái công pháp server gửi (null = chưa có: cấp 1, không biến thức). */
export function resolveBarSkill(m: { lv: Record<string, number>; vr: Record<string, 'a' | 'b'> } | null | undefined, skill: SkillDef): ResolvedSkill {
  return resolveSkill(skill, m?.lv[skill.id] ?? 1, VARIANTS[skill.id], m?.vr[skill.id]);
}

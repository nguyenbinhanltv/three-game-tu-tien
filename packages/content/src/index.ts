import type {
  AppearanceData,
  ItemDef,
  LevelDef,
  MonsterDef,
  NpcDef,
  PoseDef,
  QuestDef,
  RealmDef,
  RecipeDef,
  SkillDef,
} from '@dtl/shared';
import itemsJson from '../data/items.json';
import monstersJson from '../data/monsters.json';
import skillsJson from '../data/skills.json';
import recipesJson from '../data/recipes.json';
import npcsJson from '../data/npcs.json';
import questsJson from '../data/quests.json';
import realmsJson from '../data/realms.json';
import vanLamJson from '../data/levels/van_lam.json';
import kiemTrungJson from '../data/levels/kiem_trung.json';
import glossaryJson from '../data/glossary.json';
import viJson from '../data/i18n/vi.json';
import viUiJson from '../data/i18n/vi.ui.json';
import poseKiemThuJson from '../data/poses/kiem_thu.json';
import poseChemNgangJson from '../data/poses/chem_ngang.json';
import poseTamThienJson from '../data/poses/tam_thien.json';
import poseTamNguKiemJson from '../data/poses/tam_ngu_kiem.json';
import appearanceJson from '../data/appearance.json';

export const ITEMS = itemsJson as ItemDef[];
export const MONSTERS = monstersJson as unknown as MonsterDef[];
export const SKILLS = skillsJson as SkillDef[];
export const RECIPES = recipesJson as RecipeDef[];
export const NPCS = npcsJson as NpcDef[];
export const QUESTS = questsJson as QuestDef[];
export const REALMS = realmsJson as RealmDef[];
export const LEVELS: Record<string, LevelDef> = {
  van_lam: vanLamJson as LevelDef,
  kiem_trung: kiemTrungJson as LevelDef,
};
export const GLOSSARY = glossaryJson;
/** Key pose cho công cụ tư thế IK (client nướng thành AnimationClip). Thêm tệp mới trong data/poses thì khai báo ở đây. */
export const POSES = [poseKiemThuJson, poseChemNgangJson, poseTamThienJson, poseTamNguKiemJson] as unknown as PoseDef[];

function index<T extends { id: string }>(list: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of list) m.set(e.id, e);
  return m;
}

export const ITEM = index(ITEMS);
export const MONSTER = index(MONSTERS);
export const SKILL = index(SKILLS);
export const RECIPE = index(RECIPES);
export const NPC = index(NPCS);
export const QUEST = index(QUESTS);
export const POSE = index(POSES);

/** Ngoại hình người chơi: giới tính, màu áo (quyết định 6.4b). */
export const APPEARANCE = appearanceJson as AppearanceData;
export const DYE = index(APPEARANCE.dyes);

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

export function itemName(id: string, plus?: number): string {
  const n = t('item.' + id + '.name');
  return plus ? `${n} +${plus}` : n;
}

export function monsterName(id: string): string {
  return t('mon.' + id);
}

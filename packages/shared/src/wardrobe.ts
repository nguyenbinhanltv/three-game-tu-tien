// Tủ ngoại trang (P4, docs/wardrobe/README.md): hiện dáng món khác đã sở hữu thay cho món đang mặc, kèm nhuộm 3 kênh.
// Không đổi chỉ số: chỉ số luôn tính từ trang bị thật. Ở đây chỉ có kiểu và luật kiểm hợp lệ dùng chung cho server
// (quyết định, lưu DB) và client (UI, dựng hình). Không tin chuỗi từ client: chỉ nhận id có trong tủ / bảng màu.

import { wearableBy } from './items';
import type { EquipSlot } from './types';

/** Ô có hình thấy được trên người, vào được tủ. `jade`/`ring`/`artifact` không có hình trên người; `skin` đứng riêng. */
export const DISPLAY_SLOTS = ['weapon', 'robe', 'bracer', 'boots', 'belt', 'head'] as const satisfies readonly EquipSlot[];
export type DisplaySlot = (typeof DISPLAY_SLOTS)[number];
export const isDisplaySlot = (v: unknown): v is DisplaySlot => typeof v === 'string' && (DISPLAY_SLOTS as readonly string[]).includes(v);

/** Số kênh nhuộm: [vải chính, vải phụ/lót, viền kim loại/tua]. */
export const DYE_CHANNELS = 3;
export type DyeTriple = [string, string, string];

/** Lựa chọn tủ ngoại trang đang áp dụng (lưu ở `characters.look`, dạng JSON). */
export interface OutfitLook {
  /** Ô → id vật phẩm hiển thị thay cho món đang mặc. Thiếu ô = hiện đúng món đang mặc. */
  over: Partial<Record<DisplaySlot, string>>;
  /** Nhuộm 3 kênh (id trong `appearance.json`), một bộ ba cho cả người. Thiếu = màu gốc của bộ/màu chọn lúc tạo. */
  dye?: DyeTriple;
}

/** Tin `C.LOOK_SET`. */
export interface LookSetMsg {
  slot: DisplaySlot;
  id: string | null;
  r?: unknown;
}
/** Tin `C.LOOK_DYE`. */
export interface LookDyeMsg {
  dye: DyeTriple | null;
  r?: unknown;
}
/** Tin `S.WARDROBE` (riêng cho chủ). */
export interface WardrobeMsg {
  owned: string[];
  look: OutfitLook;
}

/** Tra cứu vật phẩm tối thiểu: server và client đều có `ITEM.get`. */
export type WardrobeItemLookup = (id: string) => { kind: string; gender?: string } | undefined;

export const emptyLook = (): OutfitLook => ({ over: {} });

export function isEmptyLook(l: OutfitLook): boolean {
  return !l.dye && Object.keys(l.over).length === 0;
}

/** Món `id` hiện được ở ô `slot` cho nhân vật giới `g`: đúng loại, đúng giới, và đã mở khóa. */
export function canShow(slot: DisplaySlot, id: string, g: string, item: WardrobeItemLookup, owned: ReadonlySet<string>): boolean {
  if (!owned.has(id)) return false;
  const def = item(id);
  return !!def && def.kind === slot && wearableBy(def, g);
}

/** Món vật phẩm này có thể vào tủ không (có ô hiển thị)? */
export function isWardrobeKind(kind: unknown): kind is DisplaySlot {
  return isDisplaySlot(kind);
}

/** Kiểm bộ ba màu: đủ 3 phần tử, mỗi phần tử là id trong bảng màu. Sai thì null. */
export function parseDye(dyeIds: ReadonlySet<string>, raw: unknown): DyeTriple | null {
  if (!Array.isArray(raw) || raw.length !== DYE_CHANNELS) return null;
  for (const x of raw) if (typeof x !== 'string' || !dyeIds.has(x)) return null;
  return [raw[0] as string, raw[1] as string, raw[2] as string];
}

/** Kiểm tin `C.LOOK_SET` (cấu trúc thôi; sở hữu/giới tính kiểm bằng `canShow` ở server). */
export function parseLookSetMsg(raw: unknown): LookSetMsg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as { slot?: unknown; id?: unknown; r?: unknown };
  if (!isDisplaySlot(o.slot)) return null;
  if (o.id !== null && (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 64)) return null;
  return { slot: o.slot, id: o.id as string | null, r: o.r };
}

/** Kiểm tin `C.LOOK_DYE`. */
export function parseLookDyeMsg(dyeIds: ReadonlySet<string>, raw: unknown): LookDyeMsg | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as { dye?: unknown; r?: unknown };
  if (o.dye === null) return { dye: null, r: o.r };
  const dye = parseDye(dyeIds, o.dye);
  return dye ? { dye, r: o.r } : null;
}

/**
 * Dọn `OutfitLook` đọc từ DB: bỏ từng mục không còn hợp lệ (món không còn trong tủ, sai ô, sai giới, mẫu đã xóa khỏi
 * content, màu lạ); cả bộ ba màu bỏ nếu có một màu lạ. Hỏng/trống thì trả về look rỗng. Không bao giờ ném lỗi.
 */
export function sanitizeOutfitLook(
  raw: unknown,
  g: string,
  item: WardrobeItemLookup,
  owned: ReadonlySet<string>,
  dyeIds: ReadonlySet<string>,
): OutfitLook {
  const out = emptyLook();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const o = raw as { over?: unknown; dye?: unknown };
  if (o.over && typeof o.over === 'object' && !Array.isArray(o.over)) {
    const over = o.over as Record<string, unknown>;
    for (const slot of DISPLAY_SLOTS) {
      const id = Object.hasOwn(over, slot) ? over[slot] : undefined;
      if (typeof id === 'string' && canShow(slot, id, g, item, owned)) out.over[slot] = id;
    }
  }
  const dye = parseDye(dyeIds, o.dye);
  if (dye) out.dye = dye;
  return out;
}

/** Đọc cột DB `characters.look` (JSON). */
export function outfitLookFromDb(
  json: string,
  g: string,
  item: WardrobeItemLookup,
  owned: ReadonlySet<string>,
  dyeIds: ReadonlySet<string>,
): OutfitLook {
  if (!json) return emptyLook();
  try {
    return sanitizeOutfitLook(JSON.parse(json), g, item, owned, dyeIds);
  } catch {
    return emptyLook();
  }
}

/** Ghi `OutfitLook` ra cột DB; look rỗng ghi chuỗi rỗng. */
export function outfitLookToDb(l: OutfitLook): string {
  return isEmptyLook(l) ? '' : JSON.stringify(l);
}

/**
 * Trang bị để HIỂN THỊ: trang bị thật với các ô bị ghi đè bằng món trong `look.over`. Chỉ dùng để tính `sk`/`sa`/`wp`
 * cho người xem; KHÔNG dùng cho chỉ số. Ô ghi đè mà ô thật trống vẫn hiện (mặc ngoại hình lên ô trống).
 * Skin ô 10 do nơi gọi xử lý (skin thắng mọi thứ).
 */
export function visualEquip<T extends { id: string }>(
  equip: Partial<Record<EquipSlot, T | undefined>>,
  look: OutfitLook,
): Partial<Record<EquipSlot, { id: string }>> {
  const out: Partial<Record<EquipSlot, { id: string }>> = {};
  for (const [k, v] of Object.entries(equip)) if (v) out[k as EquipSlot] = { id: v.id };
  for (const slot of DISPLAY_SLOTS) {
    const id = look.over[slot];
    if (id) out[slot] = { id };
  }
  return out;
}

/** Mã hóa bộ ba màu cho `PlayerS.dye3` (`"a,b,c"`, rỗng = không nhuộm). Id màu không chứa dấu phẩy. */
export const encodeDye3 = (d: DyeTriple | undefined): string => (d ? d.join(',') : '');

/** Giải mã `PlayerS.dye3`; sai định dạng hoặc màu lạ thì undefined. */
export function decodeDye3(dyeIds: ReadonlySet<string>, s: string): DyeTriple | undefined {
  if (!s) return undefined;
  return parseDye(dyeIds, s.split(',')) ?? undefined;
}

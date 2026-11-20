// Công cụ cho lệnh GM thử đồ (GM-TEST): bộ trang bị theo bậc × nhánh, tìm id, danh sách kiếm/bộ.
// Hàm thuần (không đụng sim/DB) để test được; sim.ts chỉ nối lệnh `/gm kit|outfit|weapon|find|skills|learn|help`.
import { EQUIP_SLOTS, type EquipSlot, at } from '@dtl/shared';
import {
  itemTier,
  ITEMS,
  itemName,
  METHODS,
  methodName,
  MONSTERS,
  monsterName,
  OUTFITS,
  SET,
  SETS,
  SKILL,
  skillName,
  t,
} from '@dtl/content';

/** Nhánh công pháp của `/gm kit`: kiếm tu (DPS), hộ pháp (tank), đan sư (hỗ trợ). Thứ tự khớp `METHODS`. */
export const GM_BRANCHES = ['kiem', 'hophap', 'dansu'] as const;
export type GmBranch = (typeof GM_BRANCHES)[number];

export function isGmBranch(v: unknown): v is GmBranch {
  return typeof v === 'string' && (GM_BRANCHES as readonly string[]).includes(v);
}

/** Công pháp ứng với nhánh. */
export const BRANCH_METHOD: Record<GmBranch, string> = { kiem: 'lac_kiem_quyet', hophap: 'bat_dong_kim_than', dansu: 'thanh_moc_dan_kinh' };

/** Bộ trang bị theo bậc (chỉ số 0 = bậc 1) × nhánh (kiem, hophap, dansu). Bậc chưa có vật phẩm thì dùng bậc cao nhất có. */
const GM_TIER_SETS: readonly (readonly [string, string, string])[] = [
  ['set_lac_kiem', 'set_huyen_giap', 'set_dan_tam'],
  ['set_liet_mach', 'set_dia_giap', 'set_phuc_mach'],
  ['set_kinh_quang', 'set_van_kinh', 'set_luu_ly'],
  ['set_tinh_khuyet', 'set_co_thanh', 'set_than_tang'],
  ['set_tran_khich', 'set_tan_thiet', 'set_tinh_dan_bao'],
];

export const GM_MAX_TIER = 5;
/** Bậc cao nhất đang có vật phẩm trang bị. */
const GM_TIER_AVAILABLE = GM_TIER_SETS.length;

interface KitPiece {
  slot: EquipSlot;
  id: string;
}
interface KitPlan {
  tier: number;
  /** Bậc thực dùng (nhỏ hơn `tier` nếu bậc đó chưa có vật phẩm). */
  used: number;
  set: string;
  pieces: KitPiece[];
}

const clampTier = (n: number): number => Math.max(1, Math.min(GM_MAX_TIER, Math.floor(n) || 1));

/**
 * Chọn đồ cho `/gm kit`: mỗi ô (trừ pháp bảo, cấp riêng bằng `/gm art`) lấy món của bộ đã chọn; ô bộ không có thì lấy món tốt nhất
 * bậc ≤ bậc dùng (không thuộc bộ lạ, chỉ nhận bộ cùng nhánh ở bậc thấp hơn); phẩm cao nhất do người gọi roll.
 */
export function planKit(tier: number, branch: GmBranch): KitPlan {
  const want = clampTier(tier);
  const used = Math.min(want, GM_TIER_AVAILABLE);
  const b = GM_BRANCHES.indexOf(branch);
  const set = at(at(GM_TIER_SETS, used - 1, 'GM_TIER_SETS'), b, 'GM_BRANCHES');
  const mine = new Set(GM_TIER_SETS.slice(0, used).map((r) => at(r, b, 'GM_BRANCHES')));
  const pieces: KitPiece[] = [];
  for (const slot of EQUIP_SLOTS) {
    if (slot === 'artifact') continue;
    const cand = ITEMS.filter((i) => i.kind === slot && itemTier(i.id) <= used && (!i.set || mine.has(i.set)));
    cand.sort(
      (x, y) =>
        Number(y.set === set) - Number(x.set === set) ||
        itemTier(y.id) - itemTier(x.id) ||
        (y.reqLevel ?? 0) - (x.reqLevel ?? 0) ||
        (x.id < y.id ? -1 : 1),
    );
    if (cand[0]) pieces.push({ slot, id: cand[0].id });
  }
  return { tier: want, used, set, pieces };
}

/** Kiếm xếp theo bậc rồi cấp yêu cầu. */
export function weaponIds(): string[] {
  return ITEMS.filter((i) => i.kind === 'weapon')
    .sort((a, b) => itemTier(a.id) - itemTier(b.id) || (a.reqLevel ?? 0) - (b.reqLevel ?? 0) || (a.id < b.id ? -1 : 1))
    .map((i) => i.id);
}

/** Skin ngoại hình (vật phẩm kind `skin`), xếp theo id. */
export function skinIds(): string[] {
  return ITEMS.filter((i) => i.kind === 'skin')
    .map((i) => i.id)
    .sort();
}

/** Bộ mặc được (có vật phẩm) kèm ghi chú mảnh asset trang phục. */
export function outfitRows(): { id: string; wearable: boolean; parts: number }[] {
  const ids = new Set<string>([...SETS.map((s) => s.id), ...Object.keys(OUTFITS)]);
  return [...ids].map((id) => ({ id, wearable: !!SET.get(id)?.pieces.length, parts: OUTFITS[id]?.length ?? 0 }));
}

/** Bộ có asset trang phục (outfits.json) dù chưa có vật phẩm. */
export function hasOutfitAsset(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(OUTFITS, id);
}

/** `+10` hoặc `10` → 0..max; không phải số thì null. */
export function parsePlus(v: string | undefined, max: number): number | null {
  if (v === undefined) return null;
  const m = /^\+?(\d{1,2})$/.exec(v);
  return m ? Math.min(max, Number(m[1])) : null;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

interface FindHit {
  kind: 'item' | 'skill' | 'set' | 'mon' | 'method';
  id: string;
  name: string;
}

/** Tìm id theo từ khóa (bỏ dấu, không phân biệt hoa thường) trong id hoặc tên tiếng Việt. Tối đa `limit` kết quả. */
export function findIds(q: string, limit = 30): FindHit[] {
  const k = fold(q.trim());
  if (k.length < 2) return [];
  const out: FindHit[] = [];
  const add = (kind: FindHit['kind'], id: string, name: string) => {
    if (out.length < limit && (fold(id).includes(k) || fold(name).includes(k))) out.push({ kind, id, name });
  };
  for (const i of ITEMS) add('item', i.id, itemName(i.id));
  for (const s of SKILL.values()) add('skill', s.id, skillName(s.id));
  for (const s of SETS) add('set', s.id, t('set.' + s.id + '.name'));
  for (const m of MONSTERS) add('mon', m.id, monsterName(m.id));
  for (const m of METHODS) add('method', m.id, methodName(m.id));
  return out;
}

/** Danh sách lệnh GM theo nhóm (khớp nhóm nút ở bảng F3). Chuỗi cú pháp/ví dụ ở i18n `gm.cmd.<id>`. */
export const GM_GROUPS: readonly { id: string; cmds: readonly string[] }[] = [
  { id: 'char', cmds: ['help', 'level', 'realm', 'trib', 'xp', 'gold', 'god', 'heal', 'die', 'charge', 'cd', 'dye'] },
  { id: 'skill', cmds: ['skills', 'learn', 'method', 'variant'] },
  { id: 'gear', cmds: ['kit', 'roll', 'set', 'plus', 'art', 'give', 'bag'] },
  { id: 'outfit', cmds: ['outfit', 'skin'] },
  { id: 'weapon', cmds: ['weapon'] },
  { id: 'map', cmds: ['tp', 'tele', 'qdone', 'qev'] },
  { id: 'mon', cmds: ['spawn', 'killall', 'hurt', 'tick'] },
  { id: 'find', cmds: ['find'] },
];

export const GM_COMMANDS: readonly string[] = GM_GROUPS.flatMap((g) => g.cmds);

/** Dòng trợ giúp của một lệnh, hoặc null nếu không có lệnh đó. */
export function helpLine(cmd: string): string | null {
  return GM_COMMANDS.includes(cmd) ? t('gm.cmd.' + cmd) : null;
}

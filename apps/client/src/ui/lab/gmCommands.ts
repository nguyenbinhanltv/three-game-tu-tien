import { ARTIFACTS, ITEMS, itemName, METHODS, methodName, MONSTERS, monsterName, OUTFITS, QUESTS, SETS, SKILLS, skillName, t } from '@dtl/content';
import { PLACES } from '@dtl/content/places';
import { MAX_LEVEL } from '@dtl/shared';

/**
 * Bảng lệnh `/gm` cho tab "Lệnh GM" của phòng tập (Diễn Võ Trường): mỗi lệnh là một hàng điều khiển (ô chọn có tìm, ô số, nút).
 * Client chỉ ghép chuỗi lệnh rồi gửi qua chat; server vẫn kiểm quyền GM/tài khoản thử và kiểm tham số như khi gõ tay.
 * Nhãn ngắn của lệnh: i18n `ui.gm.cmd.<tên>`; tooltip là dòng trợ giúp của server `gm.cmd.<tên>`; nhãn giá trị chọn: `ui.gm.opt.<giá trị>`.
 * Lệnh đã có nút ở nhóm Cân bằng (dummy, boss, phase, hp, cast, dps) không lặp ở đây: xem `GM_IN_BALANCE`.
 */

export type GmGroup = 'char' | 'items' | 'mon' | 'fight' | 'move' | 'world';
const ALL_GROUPS: readonly GmGroup[] = ['char', 'items', 'mon', 'fight', 'move', 'world'];

/** Nguồn id cho ô chọn có tìm. */
export type GmSource = 'items' | 'weapons' | 'skins' | 'monsters' | 'skills' | 'methods' | 'sets' | 'outfits' | 'arts' | 'places' | 'quests';

export interface GmParam {
  /** Khóa nhãn `ui.gm.param.<k>`. */
  k: string;
  kind: 'int' | 'text' | 'pick' | 'src';
  /** Ô số: biên và giá trị mặc định. */
  min?: number;
  max?: number;
  def?: string;
  /** Ô chọn cố định: danh sách giá trị (nhãn `ui.gm.opt.<giá trị>`). */
  opts?: readonly string[];
  src?: GmSource;
  /** Không bắt buộc: để trống thì bỏ khỏi lệnh. */
  opt?: boolean;
  /** Ghép vào lệnh dạng `+N` (kiếm, bộ kit) thay vì `N`. */
  plus?: boolean;
}

export interface GmCmd {
  name: string;
  group: GmGroup;
  params: readonly GmParam[];
  /** Nút phụ không tham số (nhãn `ui.gm.extra.<khóa>`), ví dụ `branch reset`. */
  extra?: readonly { k: string; cmd: string }[];
  /** Chuỗi cố định chèn sau tên lệnh trước các tham số. */
  pre?: string;
}

/** Lệnh nằm ở nhóm Cân bằng (#879), không lặp ở tab Lệnh GM. */
export const GM_IN_BALANCE = ['dps', 'dummy', 'boss', 'phase', 'hp', 'cast'] as const;

const I = (k: string, min: number, max: number, def?: string, opt = false): GmParam => ({ k, kind: 'int', min, max, def, opt });
const P = (k: string, opts: readonly string[], opt = false): GmParam => ({ k, kind: 'pick', opts, opt });
const S = (k: string, src: GmSource, opt = false): GmParam => ({ k, kind: 'src', src, opt });
const X = (k: string, opt = false): GmParam => ({ k, kind: 'text', opt });
const OnOff = ['on', 'off'] as const;
const Branch = ['kiem', 'hophap', 'dansu'] as const;

export const GM_CMDS: readonly GmCmd[] = [
  // ----- Nhân vật -----
  { name: 'level', group: 'char', params: [I('level', 1, MAX_LEVEL, '20')] },
  { name: 'realm', group: 'char', params: [X('realm')] },
  { name: 'dao', group: 'char', params: [P('dao', ['kim', 'moc', 'thuy', 'hoa', 'tho', 'loi', 'clear'])] },
  { name: 'xp', group: 'char', params: [I('n', 1, 100_000_000, '5000')] },
  { name: 'gold', group: 'char', params: [I('n', 1, 1_000_000_000, '100000')] },
  { name: 'god', group: 'char', params: [P('onoff', OnOff, true)] },
  { name: 'heal', group: 'char', params: [] },
  { name: 'die', group: 'char', params: [] },
  { name: 'stars', group: 'char', params: [I('stars', 0, 9, '3')] },
  { name: 'kieu', group: 'char', params: [I('kieu', 0, 9, '3')] },
  { name: 'charge', group: 'char', params: [I('pct', 0, 100, '100', true)] },
  { name: 'res', group: 'char', params: [I('n', 0, 99, '', true)] },
  { name: 'cd', group: 'char', params: [] },
  { name: 'free', group: 'char', params: [P('onoff', OnOff, true)] },
  {
    name: 'trib',
    group: 'char',
    params: [P('trib', ['truc_co', 'ket_dan', 'nguyen_anh', 'hoa_than', 'anh_bien', 'ngu_suy', 'huyen_ngoai', 'huyen_noi', 'huyen_hon'], true), I('stage', 1, 5, '', true)],
  },
  { name: 'build', group: 'char', params: [S('method', 'methods'), I('level', 1, MAX_LEVEL, '30', true)] },
  { name: 'preset', group: 'char', params: [P('branch', Branch), I('level', 1, MAX_LEVEL, '20'), I('quality', 0, 5, '5', true), I('skill', 1, 5, '5', true)] },
  { name: 'skills', group: 'char', params: [P('mode', ['list', 'max', 'all'])] },
  { name: 'learn', group: 'char', params: [S('skill', 'skills'), I('skill_lv', 1, 5, '5', true)] },
  { name: 'method', group: 'char', params: [S('method', 'methods'), I('skill_lv', 1, 5, '5', true)] },
  { name: 'variant', group: 'char', params: [S('skill', 'skills'), P('variant', ['a', 'b'])] },
  { name: 'branch', group: 'char', params: [I('tier', 1, MAX_LEVEL, '16'), X('branch_id')], extra: [{ k: 'reset', cmd: 'branch reset' }] },
  { name: 'dye', group: 'char', params: [X('dye')] },
];

/** Chỉ các nhóm đã có lệnh (nhóm trống chưa hiện). */
export const GM_GROUPS: readonly GmGroup[] = ALL_GROUPS.filter((g) => GM_CMDS.some((c) => c.group === g));

export const GM_NAMES = new Set(GM_CMDS.map((c) => c.name));

const cache = new Map<GmSource, { id: string; label: string }[]>();
const FROM: Record<GmSource, () => string[]> = {
  items: () => ITEMS.map((i) => i.id),
  weapons: () => ITEMS.filter((i) => i.kind === 'weapon').map((i) => i.id),
  skins: () => ITEMS.filter((i) => i.id.startsWith('itm_skin_')).map((i) => i.id),
  monsters: () => MONSTERS.map((m) => m.id),
  skills: () => SKILLS.map((s) => s.id),
  methods: () => METHODS.map((m) => m.id),
  sets: () => SETS.map((s) => s.id),
  outfits: () => Object.keys(OUTFITS),
  arts: () => ARTIFACTS.map((a) => a.id),
  places: () => PLACES.map((p) => p.id),
  quests: () => QUESTS.map((q) => q.id),
};
const NAME: Partial<Record<GmSource, (id: string) => string>> = {
  items: itemName,
  weapons: itemName,
  skins: itemName,
  arts: itemName,
  monsters: monsterName,
  skills: skillName,
  methods: methodName,
  sets: (id) => t(`set.${id}.name`),
  quests: (id) => t(`quest.${id}.name`),
};

/** Danh sách (id + tên hiển thị) của một nguồn, dựng một lần. Tên rỗng/thiếu thì dùng id. */
export function gmOptions(src: GmSource): { id: string; label: string }[] {
  let r = cache.get(src);
  if (!r) {
    const nm = NAME[src];
    r = FROM[src]().map((id) => {
      const n = nm?.(id);
      return { id, label: n && n !== id && !n.startsWith('[') ? `${n} (${id})` : id };
    });
    cache.set(src, r);
  }
  return r;
}

export type GmValues = Record<string, string>;

/** Giá trị mặc định của các tham số một lệnh. */
export function gmDefaults(c: GmCmd): GmValues {
  const v: GmValues = {};
  for (const p of c.params) v[p.k] = p.kind === 'pick' ? (p.opt ? '' : (p.opts?.[0] ?? '')) : (p.def ?? '');
  return v;
}

/**
 * Ghép chuỗi lệnh (sau `/gm `) từ giá trị các tham số; `null` nếu thiếu tham số bắt buộc hoặc số ngoài biên.
 * Tham số tùy chọn để trống thì bỏ, và các tham số sau nó phải để trống theo (cú pháp lệnh theo vị trí).
 */
export function gmBuild(c: GmCmd, v: GmValues): string | null {
  const parts = [c.name];
  if (c.pre) parts.push(c.pre);
  let skipRest = false;
  for (const p of c.params) {
    const raw = (v[p.k] ?? '').trim();
    if (!raw) {
      if (!p.opt) return null;
      skipRest = true;
      continue;
    }
    if (skipRest) return null;
    if (p.kind === 'int') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < (p.min ?? -Infinity) || n > (p.max ?? Infinity)) return null;
      parts.push(p.plus ? `+${n}` : String(n));
    } else {
      if (/\s/.test(raw)) return null;
      parts.push(raw);
    }
  }
  return parts.join(' ');
}

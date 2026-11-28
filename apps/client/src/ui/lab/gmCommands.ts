import { ARTIFACTS, ITEMS, LAB_SCENES, itemName, METHODS, methodName, MONSTERS, monsterName, OUTFITS, QUESTS, SETS, SKILLS, skillName, t } from '@dtl/content';
import { PLACES } from '@dtl/content/places';
import { EQUIP_SLOTS, MAX_ENHANCE, MAX_LEVEL } from '@dtl/shared';

/**
 * Bảng lệnh `/gm` cho tab "Lệnh GM" của phòng tập (Diễn Võ Trường): mỗi lệnh là một hàng điều khiển (ô chọn có tìm, ô số, nút).
 * Client chỉ ghép chuỗi lệnh rồi gửi qua chat; server vẫn kiểm quyền GM/tài khoản thử và kiểm tham số như khi gõ tay.
 * Nhãn ngắn của lệnh: i18n `ui.gm.cmd.<tên>`; tooltip là dòng trợ giúp của server `gm.cmd.<tên>`; nhãn giá trị chọn: `ui.gm.opt.<giá trị>`.
 * Lệnh đã có nút ở nhóm Cân bằng (dummy, boss, phase, hp, cast, dps) không lặp ở đây: xem `GM_IN_BALANCE`.
 */

export type GmGroup = 'char' | 'items' | 'mon' | 'fight' | 'move' | 'world';
const ALL_GROUPS: readonly GmGroup[] = ['char', 'items', 'mon', 'fight', 'move', 'world'];

/** Nguồn id cho ô chọn có tìm. */
export type GmSource = 'items' | 'weapons' | 'skins' | 'monsters' | 'skills' | 'methods' | 'sets' | 'outfits' | 'arts' | 'places' | 'quests' | 'scenes';

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
  /** Cho phép dấu cách trong giá trị (từ khóa tìm kiếm). */
  spaces?: boolean;
  /** Đuôi lệnh nhận đối số theo dấu hiệu chứ không theo vị trí: để trống tham số này không buộc các tham số sau phải trống. */
  loose?: boolean;
}

export interface GmCmd {
  name: string;
  /** Khóa nhãn/React khi một lệnh có nhiều hàng (ví dụ `tp` theo địa điểm và theo tọa độ). Mặc định là `name`. */
  key?: string;
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
const Loose = (p: GmParam): GmParam => ({ ...p, loose: true });
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

  // ----- Đồ -----
  { name: 'find', group: 'items', params: [{ ...X('keyword'), spaces: true }] },
  {
    name: 'kit',
    group: 'items',
    params: [I('tier', 1, 6, '2'), P('branch', Branch), Loose({ ...I('plus', 0, MAX_ENHANCE, '', true), plus: true }), Loose(P('gender', ['m', 'f'], true))],
  },
  { name: 'roll', group: 'items', params: [S('item', 'items'), I('quality', 0, 5, '5', true), I('ilvl', 1, 200, '', true)] },
  { name: 'set', group: 'items', params: [S('set', 'sets'), I('pieces', 1, 12, '', true)], extra: [{ k: 'off', cmd: 'set off' }] },
  { name: 'plus', group: 'items', params: [I('plus_n', 0, MAX_ENHANCE, '10'), P('slot', EQUIP_SLOTS, true)] },
  { name: 'art', group: 'items', params: [S('art', 'arts'), I('art_lv', 1, 5, '5', true)], extra: [{ k: 'off', cmd: 'art off' }] },
  { name: 'give', group: 'items', params: [S('item', 'items'), I('n', 1, 9999, '1', true)] },
  { name: 'bag', group: 'items', params: [P('bag', ['clear', 'sort'])] },
  { name: 'outfit', group: 'items', params: [S('outfit', 'outfits'), P('gender', ['m', 'f'], true)], extra: [{ k: 'list', cmd: 'outfit list' }, { k: 'off', cmd: 'outfit off' }] },
  { name: 'skin', group: 'items', params: [S('skin', 'skins')], extra: [{ k: 'list', cmd: 'skin list' }, { k: 'off', cmd: 'skin off' }] },
  { name: 'weapon', group: 'items', params: [S('weapon', 'weapons'), { ...I('plus', 0, MAX_ENHANCE, '', true), plus: true }], extra: [{ k: 'list', cmd: 'weapon list' }] },

  // ----- Quái / Boss (dummy, boss, phase, hp, cast ở nhóm Cân bằng) -----
  { name: 'spawn', group: 'mon', params: [S('monster', 'monsters'), I('n', 1, 20, '1', true)], extra: [{ k: 'clear', cmd: 'spawn clear' }] },
  { name: 'killall', group: 'mon', params: [] },
  { name: 'hurt', group: 'mon', params: [I('pct', 1, 100, '30')] },
  { name: 'lockhp', group: 'mon', params: [P('onoff', OnOff, true)] },
  { name: 'freeze', group: 'mon', params: [P('onoff', OnOff, true)] },
  { name: 'face', group: 'mon', params: [I('deg', 0, 359, '90', true)] },
  { name: 'state', group: 'mon', params: [P('state', ['weak', 'break', 'stun', 'chant', 'clear']), I('sec', 1, 600, '10', true)] },

  // ----- Chiến đấu / Đo (dps ở nhóm Cân bằng) -----
  { name: 'tick', group: 'fight', params: [] },
  { name: 'labreset', group: 'fight', params: [] },
  { name: 'help', group: 'fight', params: [X('cmd_name', true)] },

  // ----- Di chuyển -----
  { name: 'tp', key: 'tp', group: 'move', params: [S('place', 'places')] },
  { name: 'tp', key: 'tp_xz', group: 'move', params: [I('x', 0, 100000, '2048'), I('z', 0, 100000, '2048')] },
  { name: 'tele', group: 'move', params: [P('tele', ['all', 'none', 'cd'])] },
  { name: 'tele', key: 'tele_id', group: 'move', params: [X('pad')] },
  { name: 'dvt', group: 'move', params: [X('room_key', true)] },

  // ----- Thế giới -----
  { name: 'qdone', group: 'world', params: [S('quest', 'quests')], extra: [{ k: 'chuong2', cmd: 'qdone chuong2' }] },
  { name: 'qev', group: 'world', params: [X('qkind'), X('qtarget', true), I('n', 1, 9999, '', true)] },
  { name: 'scene', group: 'world', params: [S('scene', 'scenes')], extra: [{ k: 'save', cmd: 'scene save' }] },
];

/** Chỉ các nhóm đã có lệnh (nhóm trống chưa hiện). */
export const GM_GROUPS: readonly GmGroup[] = ALL_GROUPS.filter((g) => GM_CMDS.some((c) => c.group === g));

export const GM_NAMES = new Set(GM_CMDS.map((c) => c.name));
/** Khóa duy nhất của một hàng lệnh. */
export const gmKey = (c: GmCmd): string => c.key ?? c.name;

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
  scenes: () => LAB_SCENES.map((x) => x.id),
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
      if (!p.loose) skipRest = true;
      continue;
    }
    if (skipRest) return null;
    if (p.kind === 'int') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < (p.min ?? -Infinity) || n > (p.max ?? Infinity)) return null;
      parts.push(p.plus ? `+${n}` : String(n));
    } else {
      if (!p.spaces && /\s/.test(raw)) return null;
      parts.push(raw);
    }
  }
  return parts.join(' ');
}

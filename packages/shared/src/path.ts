// Hướng tu (VS-3): một lối tu luyện (Kiếm tu, Thể tu/Hộ pháp, Đan sư…) gom mọi thứ trước đây suy từ id công pháp bằng regex
// hay bảng cứng: hào quang, tranh đạo, bộ động tác, bảng màu VFX, tiếng đòn, bí danh GM. Dữ liệu ở
// packages/content/data/paths.json; module này chỉ có kiểu và hàm tra thuần. Thêm hướng mới = thêm một mục dữ liệu.

import type { MarkId } from './marks';
import type { MethodRole } from './methods';
import type { PoseVoice } from './posestyle';

/** Khóa hào quang cảnh giới và hình phân thân (client có bộ hình cho từng khóa). */
export type PathDao = 'kiem' | 'ho' | 'dan' | 'hon';
/** Khóa tranh đạo (chân dung, pháp tướng). */
export type PathArt = 'kiem' | 'ho_phap' | 'dan_su';

/** Bảng màu VFX năm tầng (số hex 0xRRGGBB viết dạng chuỗi 6 ký tự trong JSON). */
export interface PathPalette {
  core: string;
  body: string;
  rim: string;
  accent: string;
  shadow: string;
}

export interface PathDef {
  id: string;
  role: MethodRole;
  /** Công pháp thuộc hướng này (mỗi công pháp thuộc đúng một hướng). */
  methods: string[];
  dao: PathDao;
  art: PathArt;
  /** Bộ động tác K-5. */
  voice: PoseVoice;
  /** Bí danh trong lệnh GM (`/gm kit <bậc> <bí danh>`). */
  gm: string;
  /** Loại vũ khí hướng này cầm (hiện chỉ để khai báo; model vũ khí vẫn theo trang bị). */
  weapons: string[];
  palette: PathPalette;
  /** Màu linh quang của chiêu (hex 6 ký tự). */
  tint: string;
  /** Lớp tiếng chồng lên tiếng trúng đòn; `strongOnly`: chỉ với đòn mạnh. */
  hit?: { sfx: string; gain: number; rate: number; strongOnly?: boolean };
  /**
   * Chuỗi con nhận ra hướng này trong một khóa KHÔNG phải id công pháp (bí danh cũ như `ho_phap`, `dansu`): giữ đúng hành vi
   * khớp chuỗi con của các bảng màu/hào quang trước VS-3. Thứ tự hướng trong paths.json là thứ tự thử.
   */
  match: string[];
  /** Phối hợp tổ đội: ấn hướng này tạo ra và ấn nó muốn đồng đội tạo. */
  synergy: { gives: MarkId[]; wants: MarkId[] };
  /**
   * TN-2: hướng phải lĩnh ngộ mới tu được (không có = chọn tự do từ Ngưng Khí 5 như ba hướng đầu). Lĩnh ngộ một lần ở chỗ
   * người truyền công pháp: đủ cảnh giới `level`, trả `gold` linh thạch, nhận vật `grant` (pháp bảo gắn mệnh của hướng).
   */
  unlock?: PathUnlock;
}

export interface PathUnlock {
  level: number;
  gold: number;
  grant?: string;
}

/** Hướng `p` đã mở với nhân vật có danh sách hướng đã lĩnh ngộ `learned` chưa (hướng không có `unlock` luôn mở). */
export function pathOpen(p: PathDef | undefined, learned: readonly string[] | undefined): boolean {
  return !p?.unlock || !!learned?.includes(p.id);
}

/** Làm sạch danh sách hướng đã lĩnh ngộ đọc từ DB: chỉ giữ id hướng có `unlock`, bỏ trùng. */
export function sanitizeLearnedPaths(paths: readonly PathDef[], raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(paths.filter((p) => p.unlock).map((p) => p.id));
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && ok.has(x)))];
}

/**
 * Hướng tu của một khóa: id công pháp (khớp đúng), id hướng, hoặc khóa lạ có chứa một chuỗi con trong `match`.
 * Không ra thì undefined (nơi gọi tự chọn mặc định, thường là hướng đầu tiên).
 */
export function pathOfKey(paths: readonly PathDef[], key: string | undefined): PathDef | undefined {
  if (!key) return undefined;
  for (const p of paths) if (p.id === key || p.methods.includes(key)) return p;
  for (const p of paths) if (p.match.some((m) => key.includes(m))) return p;
  return undefined;
}

const HEX6 = /^[0-9a-f]{6}$/i;

/** Kiểm bảng hướng tu so với danh sách công pháp và ấn; trả danh sách lỗi (rỗng = hợp lệ). */
export function pathErrors(
  paths: readonly PathDef[],
  methods: readonly { id: string; role: MethodRole }[],
  markIds: ReadonlySet<string>,
  voices: readonly string[],
): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const gms = new Set<string>();
  const owner = new Map<string, string>();
  for (const p of paths) {
    const at = `path ${p.id}`;
    if (!/^[a-z0-9_]+$/.test(p.id)) errs.push(`${at}: id phải là snake_case`);
    if (ids.has(p.id)) errs.push(`${at}: trùng id`);
    ids.add(p.id);
    if (gms.has(p.gm)) errs.push(`${at}: bí danh GM "${p.gm}" trùng hướng khác`);
    gms.add(p.gm);
    if (!p.methods?.length) errs.push(`${at}: chưa có công pháp nào`);
    for (const m of p.methods ?? []) {
      const def = methods.find((x) => x.id === m);
      if (!def) errs.push(`${at}: công pháp "${m}" không tồn tại`);
      else if (def.role !== p.role) errs.push(`${at}: vai ${p.role} lệch vai ${def.role} của công pháp ${m}`);
      if (owner.has(m)) errs.push(`${at}: công pháp ${m} đã thuộc hướng ${owner.get(m)}`);
      owner.set(m, p.id);
    }
    if (!['kiem', 'ho', 'dan', 'hon'].includes(p.dao)) errs.push(`${at}: dao lạ`);
    if (!['kiem', 'ho_phap', 'dan_su'].includes(p.art)) errs.push(`${at}: art lạ`);
    if (!voices.includes(p.voice)) errs.push(`${at}: voice "${p.voice}" không phải bộ động tác`);
    for (const k of ['core', 'body', 'rim', 'accent', 'shadow'] as const)
      if (!HEX6.test(p.palette?.[k] ?? '')) errs.push(`${at}: palette.${k} phải là hex 6 ký tự`);
    if (!HEX6.test(p.tint ?? '')) errs.push(`${at}: tint phải là hex 6 ký tự`);
    if (p.hit && !(p.hit.gain > 0 && p.hit.gain <= 0.5 && p.hit.rate > 0)) errs.push(`${at}: hit.gain trong (0; 0,5], rate dương`);
    if (!Array.isArray(p.match)) errs.push(`${at}: thiếu match (mảng, có thể rỗng)`);
    if (!p.weapons?.length) errs.push(`${at}: chưa khai vũ khí`);
    if (p.unlock) {
      const u = p.unlock;
      if (!(Number.isInteger(u.level) && u.level >= 5 && u.level <= 60)) errs.push(`${at}: unlock.level phải là cảnh giới 5–60`);
      if (!(Number.isInteger(u.gold) && u.gold >= 0 && u.gold <= 100000)) errs.push(`${at}: unlock.gold phải là số nguyên 0–100000`);
      if (u.grant !== undefined && !/^itm_[a-z0-9_]+$/.test(u.grant)) errs.push(`${at}: unlock.grant phải là id vật phẩm`);
    }
    for (const k of [...(p.synergy?.gives ?? []), ...(p.synergy?.wants ?? [])])
      if (!markIds.has(k)) errs.push(`${at}: synergy trỏ tới ấn "${k}" không tồn tại`);
  }
  for (const m of methods) if (!owner.has(m.id)) errs.push(`method ${m.id}: không thuộc hướng tu nào`);
  return errs;
}

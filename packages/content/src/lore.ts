// TN-0: ranh giới Tiên Nghịch. Danh sách tên cấm (nhân vật, nơi khởi đầu, tông môn, pháp bảo trung tâm, tên truyện)
// và kiểm cấu trúc các bộ thuật ngữ mượn trong glossary. `check.ts` gọi `scanBannedDir` trên toàn bộ `data/`
// (gồm `i18n/`) nên `pnpm content:check` báo lỗi khi dữ liệu hoặc chuỗi hiển thị chứa tên cấm.
// Ranh giới đầy đủ: docs/handbook/lore-boundary.md. Chỉ chạy ở Node (check, test), không export qua index.ts.
import fs from 'node:fs';
import path from 'node:path';

export type BannedKind = 'title' | 'character' | 'place' | 'sect' | 'artifact';

export interface BannedName {
  /** Tên tiếng Việt có dấu, viết như trong bản dịch. So khớp không phân biệt hoa thường, theo ranh giới từ. */
  name: string;
  kind: BannedKind;
  /** Chỉ so dạng có dấu. Dùng cho tên mà dạng không dấu trùng từ thường gặp trong id (ví dụ `chu_dat`). */
  exact?: boolean;
}

export const BANNED_KIND_LABEL: Record<BannedKind, string> = {
  title: 'tên truyện/tác giả',
  character: 'tên nhân vật Tiên Nghịch',
  place: 'địa danh khởi đầu của Tiên Nghịch',
  sect: 'tên tông môn Tiên Nghịch',
  artifact: 'tên pháp bảo gắn nhân vật chính',
};

const names = (kind: BannedKind, list: string[], exact = false): BannedName[] =>
  list.map((name) => (exact ? { name, kind, exact } : { name, kind }));

/**
 * Tên không được xuất hiện trong dữ liệu game và i18n. Thêm tên: nối vào đúng nhóm, chạy `pnpm content:check`.
 * Tên quá chung (trùng từ ghép thông thường) thì không đưa vào đây, để lore-keeper soát bằng mắt.
 */
export const BANNED_NAMES: BannedName[] = [
  // Tên truyện và bút danh tác giả: không làm nhãn trong game. "Thiên Nghịch" cấm cả khi đứng riêng lẫn trong tên ghép.
  ...names('title', ['Tiên Nghịch', 'Thiên Nghịch']),
  ...names('title', ['Nhĩ Căn'], true),
  ...names('character', [
    'Vương Lâm',
    'Lý Mộ Uyển',
    'Tư Đồ Nam',
    'Hứa Lập Quốc',
    'Đằng Hóa Nguyên',
    'Mộc Băng Mi',
    'Lý Thiến Mai',
    'Thiên Vận Tử',
    'Vân Tước Tử',
    'Diêu Tích Tuyết',
    'Tôn Đại Trụ',
    'Lưu Kim Bưu',
    'Vương Trác',
    'Vương Bình',
    'Vương Y Y',
    'Thác Sâm',
    'Độn Thiên',
  ]),
  ...names('character', ['Chu Dật', 'Đồ Ti', 'Tôn Thái', 'Huyền La', 'Liễu Mi'], true),
  ...names('place', ['Hằng Nhạc', 'Chu Tước tinh']),
  ...names('sect', ['Luyện Hồn Tông', 'Thi Âm Tông', 'Vân Thiên Tông', 'Đại La Kiếm Tông']),
  ...names('artifact', ['Thiên Nghịch Châu', 'Thập Ức Tôn Hồn Phiên', 'Phong Tiên Ấn', 'Định Giới La Bàn']),
];

/** Bỏ dấu tiếng Việt, đ → d. */
export const foldVi = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** Chuẩn hóa để so dạng có dấu: NFC, chữ thường, bỏ ký tự vô hình, gộp khoảng trắng. */
const normVi = (s: string): string =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/\s+/g, ' ');

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED = BANNED_NAMES.map((b) => ({
  b,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(normVi(b.name))}(?![\\p{L}\\p{N}])`, 'u'),
  /** Dạng id/không dấu: các âm tiết nối bằng một dấu cách, có dấu cách bao hai đầu. */
  ascii: b.exact ? undefined : ` ${foldVi(b.name).toLowerCase()} `,
}));

const ASCII_ONLY = /^[\x20-\x7e\t\r\n]*$/;

/**
 * Tên cấm có trong một chuỗi. So hai dạng:
 * - có dấu, ở mọi chuỗi (chữ hiển thị);
 * - không dấu, chỉ ở chuỗi thuần ASCII (id, key i18n, tên file: `npc_vuong_lam`, `Vuong Lam`), để chữ tiếng Việt
 *   khác dấu (ví dụ "vương lầm") không bị bắt nhầm.
 */
export function findBanned(text: string): BannedName[] {
  const hits: BannedName[] = [];
  const n = normVi(text);
  const ascii = ASCII_ONLY.test(text)
    ? ` ${text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()} `
    : undefined;
  for (const c of COMPILED) {
    if (c.re.test(n) || (ascii && c.ascii && ascii.includes(c.ascii))) hits.push(c.b);
  }
  return hits;
}

const describe = (b: BannedName): string => `"${b.name}" (${BANNED_KIND_LABEL[b.kind]})`;
const HINT = 'đặt tên mới, xem docs/handbook/lore-boundary.md';

/** Duyệt một giá trị JSON, soát cả khóa lẫn chuỗi. `where` là tiền tố vị trí để báo lỗi. */
export function scanBanned(value: unknown, where: string, out: string[] = []): string[] {
  if (typeof value === 'string') {
    const hits = findBanned(value);
    if (hits.length) out.push(`${where}: chứa tên cấm ${hits.map(describe).join(', ')}; ${HINT}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanBanned(v, `${where}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hits = findBanned(k);
      if (hits.length) out.push(`${where}: khóa "${k}" chứa tên cấm ${hits.map(describe).join(', ')}; ${HINT}`);
      scanBanned(v, `${where}.${k}`, out);
    }
  }
  return out;
}

/** Quét mọi file `.json` (theo cấu trúc) và `.md` (theo dòng) trong thư mục, kể cả tên file. Trả danh sách lỗi. */
export function scanBannedDir(dir: string, out: string[] = [], root = dir): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    const nameHits = findBanned(ent.name.replace(/\.[^.]+$/, ''));
    if (nameHits.length) out.push(`${rel}: tên file chứa tên cấm ${nameHits.map(describe).join(', ')}; ${HINT}`);
    if (ent.isDirectory()) scanBannedDir(full, out, root);
    else if (ent.name.endsWith('.json')) {
      const text = fs.readFileSync(full, 'utf8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // JSON hỏng đã có kiểm khác báo; vẫn soát theo văn bản thô để không lọt tên cấm.
        parsed = text;
      }
      scanBanned(parsed, rel, out);
    } else if (ent.name.endsWith('.md')) {
      fs.readFileSync(full, 'utf8')
        .split(/\r?\n/)
        .forEach((ln, i) => scanBanned(ln, `${rel}:${i + 1}`, out));
    }
  }
  return out;
}

/** Phần glossary do TN-0 thêm (thuật ngữ mượn từ thang Tiên Nghịch). */
export interface LoreGlossary {
  elements: Record<string, string>;
  realms: string[];
  steps: string[];
  dao: Record<string, string>;
  originGroups: Record<string, string>;
  origins: Record<string, Record<string, string>>;
  /** Tên năm ải của Thiên Nhân Ngũ Suy (TN-4, tự đặt) và thuật ngữ riêng của chuỗi. */
  nguSuy: Record<string, string>;
  nguSuyTerms: Record<string, string>;
  huyenKiepGroups: Record<string, string>;
  huyenKiep: Record<string, Record<string, string>>;
  cuuKieu: string[];
  coThanStars: string[];
}

export const ORIGIN_GROUP_SIZES = { real: 6, void: 4, special: 4 } as const;
export const HUYEN_KIEP_GROUPS = ['ngoai', 'noi', 'hon'] as const;

function distinct(what: string, list: string[], errors: string[]) {
  const seen = new Set<string>();
  for (const v of list) {
    if (!v || v !== v.trim()) errors.push(`${what}: tên rỗng hoặc thừa khoảng trắng ("${v}")`);
    if (seen.has(v)) errors.push(`${what}: trùng tên "${v}"`);
    seen.add(v);
  }
}

/** Kiểm các bộ thuật ngữ có số lượng cố định: Bản Nguyên 14 (6 + 4 + 4), Ngũ Suy 5, Huyền Kiếp 9 (3 × 3), Cửu Kiều 9, 4 Bộ, 9 sao Cổ Thần. */
export function checkLoreTerms(g: LoreGlossary): string[] {
  const errors: string[] = [];
  if (g.steps.length !== 4) errors.push(`glossary.steps: cần 4 Bộ, đang có ${g.steps.length}`);
  distinct('glossary.steps', g.steps, errors);
  distinct('glossary.dao', Object.values(g.dao), errors);

  const groups = Object.keys(ORIGIN_GROUP_SIZES) as (keyof typeof ORIGIN_GROUP_SIZES)[];
  if (Object.keys(g.origins).join() !== groups.join()) errors.push(`glossary.origins: cần đúng các nhóm ${groups.join(', ')}`);
  if (Object.keys(g.originGroups).join() !== groups.join()) errors.push(`glossary.originGroups: cần đúng các nhóm ${groups.join(', ')}`);
  const originIds: string[] = [];
  const originNames: string[] = [];
  for (const grp of groups) {
    const list = g.origins[grp] ?? {};
    const n = Object.keys(list).length;
    if (n !== ORIGIN_GROUP_SIZES[grp]) errors.push(`glossary.origins.${grp}: cần ${ORIGIN_GROUP_SIZES[grp]} nguồn, đang có ${n}`);
    originIds.push(...Object.keys(list));
    originNames.push(...Object.values(list));
  }
  distinct('glossary.origins (id)', originIds, errors);
  distinct('glossary.origins', originNames, errors);
  // Ngũ hành là 5 nguồn đầu của nhóm thực, cùng id và tên với glossary.elements (linh căn, ngọc khảm đang dùng).
  const real = Object.entries(g.origins.real ?? {});
  Object.entries(g.elements).forEach(([id, name], i) => {
    if (real[i]?.[0] !== id || real[i]?.[1] !== name)
      errors.push(`glossary.origins.real: vị trí ${i + 1} phải là ${id} "${name}" như glossary.elements`);
  });

  if (Object.keys(g.huyenKiep).join() !== HUYEN_KIEP_GROUPS.join())
    errors.push(`glossary.huyenKiep: cần đúng các nhóm ${HUYEN_KIEP_GROUPS.join(', ')}`);
  if (Object.keys(g.huyenKiepGroups).join() !== HUYEN_KIEP_GROUPS.join())
    errors.push(`glossary.huyenKiepGroups: cần đúng các nhóm ${HUYEN_KIEP_GROUPS.join(', ')}`);
  const kiepIds: string[] = [];
  const kiepNames: string[] = [];
  for (const grp of HUYEN_KIEP_GROUPS) {
    const list = g.huyenKiep[grp] ?? {};
    const n = Object.keys(list).length;
    if (n !== 3) errors.push(`glossary.huyenKiep.${grp}: cần 3 kiếp, đang có ${n}`);
    kiepIds.push(...Object.keys(list).map((id) => `${grp}.${id}`));
    kiepNames.push(...Object.values(list));
  }
  distinct('glossary.huyenKiep (id)', kiepIds, errors);
  distinct('glossary.huyenKiep', kiepNames, errors);

  const suyN = Object.keys(g.nguSuy ?? {}).length;
  if (suyN !== 5) errors.push(`glossary.nguSuy: cần 5 ải, đang có ${suyN}`);
  distinct('glossary.nguSuy', Object.values(g.nguSuy ?? {}), errors);
  distinct('glossary.nguSuyTerms', Object.values(g.nguSuyTerms ?? {}), errors);

  if (g.cuuKieu.length !== 9) errors.push(`glossary.cuuKieu: cần 9 cầu, đang có ${g.cuuKieu.length}`);
  distinct('glossary.cuuKieu', g.cuuKieu, errors);
  if (g.coThanStars.length !== 9) errors.push(`glossary.coThanStars: cần 9 sao, đang có ${g.coThanStars.length}`);
  distinct('glossary.coThanStars', g.coThanStars, errors);

  // Thuật ngữ đạo không được trùng tên một đại cảnh giới (trừ khi cố ý ghép, như "bán bộ Đạp Thiên").
  for (const [k, v] of Object.entries(g.dao)) if (g.realms.includes(v)) errors.push(`glossary.dao.${k}: "${v}" trùng tên cảnh giới`);
  return errors;
}

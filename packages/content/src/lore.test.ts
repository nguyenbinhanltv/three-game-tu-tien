import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import glossary from '../data/glossary.json';
import { BANNED_NAMES, checkLoreTerms, findBanned, foldVi, scanBanned, scanBannedDir, type LoreGlossary } from './lore';

const DATA = fileURLToPath(new URL('../data/', import.meta.url));
const hit = (s: string) => findBanned(s).map((b) => b.name);

describe('TN-0: danh sách tên cấm', () => {
  it('bắt tên có dấu, không phân biệt hoa thường, khoảng trắng lạ và dạng tổ hợp dấu', () => {
    expect(hit('Đệ tử của Vương Lâm ghé qua.')).toEqual(['Vương Lâm']);
    expect(hit('VƯƠNG  LÂM')).toEqual(['Vương Lâm']);
    expect(hit('vương lâm')).toEqual(['Vương Lâm']);
    expect(hit('Vương Lâm'.normalize('NFD'))).toEqual(['Vương Lâm']);
    expect(hit('Hằng Nhạc Phái')).toEqual(['Hằng Nhạc']);
    expect(hit('Bay tới Chu Tước Tinh')).toEqual(['Chu Tước tinh']);
  });

  it('"Thiên Nghịch" bị cấm cả khi đứng riêng lẫn trong tên pháp bảo', () => {
    expect(hit('Thiên Nghịch')).toEqual(['Thiên Nghịch']);
    expect(hit('Thiên Nghịch Châu')).toEqual(['Thiên Nghịch', 'Thiên Nghịch Châu']);
    expect(hit('Tiên Nghịch')).toEqual(['Tiên Nghịch']);
  });

  it('bắt dạng không dấu trong id, key i18n và chữ ASCII', () => {
    expect(hit('npc_vuong_lam')).toEqual(['Vương Lâm']);
    expect(hit('npc.vuong_lam.name')).toEqual(['Vương Lâm']);
    expect(hit('Vuong Lam')).toEqual(['Vương Lâm']);
    expect(hit('itm_thien_nghich_chau')).toEqual(['Thiên Nghịch', 'Thiên Nghịch Châu']);
    expect(hit('map_hang_nhac')).toEqual(['Hằng Nhạc']);
  });

  it('không bắt nhầm: khác dấu, dính trong từ dài hơn, tên được phép', () => {
    expect(hit('vương lầm đường')).toEqual([]);
    expect(hit('npc_vuong_lamx')).toEqual([]);
    expect(hit('xvuong_lam')).toEqual([]);
    expect(hit('Chu Tước')).toEqual([]);
    expect(hit('Thiên Nhân Ngũ Suy, Huyền Kiếp, Đạp Thiên Cửu Kiều')).toEqual([]);
    // Tên đánh dấu `exact` chỉ so dạng có dấu: `chu_dat` trong id không bị bắt.
    expect(hit('npc_chu_dat')).toEqual([]);
    expect(hit('Chu Dật')).toEqual(['Chu Dật']);
  });

  it('danh sách không trùng, không thừa khoảng trắng; dạng không dấu không đụng nhau', () => {
    const names = BANNED_NAMES.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toBe(n.trim().replace(/\s+/g, ' '));
    expect(foldVi('Đằng Hóa Nguyên')).toBe('Dang Hoa Nguyen');
  });

  it('scanBanned soát cả khóa lẫn giá trị lồng nhau và chỉ đúng vị trí', () => {
    const errs = scanBanned({ npc: [{ id: 'npc_a', name: 'Tư Đồ Nam' }], 'npc.vuong_lam.name': 'Lão Giả' }, 'x.json');
    expect(errs).toHaveLength(2);
    expect(errs[0]).toContain('x.json.npc[0].name');
    expect(errs[0]).toContain('Tư Đồ Nam');
    expect(errs[1]).toContain('khóa "npc.vuong_lam.name"');
    expect(scanBanned({ a: [1, null, true, { b: 'Lạc Kiếm Tông' }] }, 'x.json')).toEqual([]);
  });
});

describe('TN-0: content:check chặn tên cấm trong dữ liệu và i18n', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-lore-'));
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('thư mục dữ liệu có tên cấm thì báo lỗi kèm file và vị trí', () => {
    fs.mkdirSync(path.join(tmp, 'i18n'));
    fs.mkdirSync(path.join(tmp, 'levels'));
    fs.writeFileSync(
      path.join(tmp, 'i18n', 'vi.json'),
      JSON.stringify({ 'quest.q1.desc': 'Tìm Lý Mộ Uyển ở chân núi.', 'quest.q1.name': 'Lên núi' }),
    );
    fs.writeFileSync(path.join(tmp, 'npcs.json'), JSON.stringify([{ id: 'npc_tu_do_nam' }, { id: 'npc_lao_gia' }]));
    fs.writeFileSync(path.join(tmp, 'levels', 'hang_nhac.json'), '{"id":"ok"}');
    fs.writeFileSync(path.join(tmp, 'levels', 'README.md'), 'dòng một\nBản đồ Chu Tước tinh\n');
    const errs = scanBannedDir(tmp);
    expect(errs).toHaveLength(4);
    expect(errs.find((e) => e.startsWith('i18n/vi.json.quest.q1.desc'))).toContain('Lý Mộ Uyển');
    expect(errs.find((e) => e.startsWith('npcs.json[0].id'))).toContain('Tư Đồ Nam');
    expect(errs.find((e) => e.startsWith('levels/hang_nhac.json: tên file'))).toContain('Hằng Nhạc');
    expect(errs.find((e) => e.startsWith('levels/README.md:2'))).toContain('Chu Tước tinh');
  });

  it('dữ liệu và i18n hiện tại không chứa tên cấm', () => {
    expect(scanBannedDir(DATA)).toEqual([]);
  });
});

describe('TN-0: bộ thuật ngữ mượn trong glossary', () => {
  const g: LoreGlossary = glossary;
  const clone = (): LoreGlossary => JSON.parse(JSON.stringify(g));

  it('đủ Bản Nguyên 14, Huyền Kiếp 9, Cửu Kiều 9, 4 Bộ, 9 sao Cổ Thần', () => {
    expect(checkLoreTerms(g)).toEqual([]);
    expect(Object.values(g.origins).flatMap((o) => Object.keys(o))).toHaveLength(14);
    expect(Object.values(g.huyenKiep).flatMap((o) => Object.keys(o))).toHaveLength(9);
    expect(g.cuuKieu).toHaveLength(9);
    expect(g.origins.real?.loi).toBe('Lôi');
  });

  it('thiếu, trùng hoặc lệch ngũ hành thì báo lỗi', () => {
    const a = clone();
    delete a.origins.void!.luan_hoi;
    expect(checkLoreTerms(a).join()).toContain('glossary.origins.void: cần 4 nguồn');
    const b = clone();
    b.cuuKieu[8] = b.cuuKieu[0]!;
    expect(checkLoreTerms(b).join()).toContain('glossary.cuuKieu: trùng tên');
    const c = clone();
    c.origins.real = { loi: 'Lôi', kim: 'Kim', moc: 'Mộc', thuy: 'Thủy', hoa: 'Hỏa', tho: 'Thổ' };
    expect(checkLoreTerms(c).join()).toContain('như glossary.elements');
    const d = clone();
    d.huyenKiep.noi!.them = 'Kiếp thừa';
    expect(checkLoreTerms(d).join()).toContain('glossary.huyenKiep.noi: cần 3 kiếp');
  });
});

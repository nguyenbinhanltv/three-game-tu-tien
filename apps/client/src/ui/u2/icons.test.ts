import { describe, expect, it } from 'vitest';
import { SETS } from '@dtl/content';
import { SYS_GLYPHS } from './sysGlyphs';
import { SET_EMBLEMS } from './setEmblems';
import { isSysGlyph } from './SysGlyph';
import { emblemOf } from './SetMark';

const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/;

describe('icon hệ thống SVG (U2-I)', () => {
  it('có 75 icon, mỗi icon một đường nét hợp lệ', () => {
    const ids = Object.keys(SYS_GLYPHS);
    expect(ids.length).toBe(75);
    for (const id of ids) {
      const [d, f] = SYS_GLYPHS[id]!;
      expect(PATH.test(d), id).toBe(true);
      expect(d.startsWith('M'), id).toBe(true);
      if (f) expect(PATH.test(f), id).toBe(true);
    }
  });
  it('id đúng tiền tố nhóm và isSysGlyph khớp', () => {
    for (const id of Object.keys(SYS_GLYPHS)) expect(/^(hud|mark|cur|st|ui|sys)_[a-z0-9_]+$/.test(id), id).toBe(true);
    expect(isSysGlyph('hud_tui')).toBe(true);
    expect(isSysGlyph('constructor')).toBe(false);
    expect(isSysGlyph('skl_phi_kiem')).toBe(false);
  });
});

describe('dấu ấn bộ trang bị (U2-I)', () => {
  it('mọi bộ trong sets.json có dấu ấn và ngược lại', () => {
    const keys = SETS.map((s) => s.id.replace(/^set_/, '')).sort();
    expect(Object.keys(SET_EMBLEMS).sort()).toEqual(keys);
    for (const s of SETS) expect(emblemOf(s.id), s.id).toBeTruthy();
    expect(emblemOf(undefined)).toBeUndefined();
    expect(emblemOf('set_khong_co')).toBeUndefined();
  });
  it('đường nét hợp lệ', () => {
    for (const [k, d] of Object.entries(SET_EMBLEMS)) expect(PATH.test(d), k).toBe(true);
  });
  it('Tẫn Thiết tách màu khỏi Trấn Khích (viền cam than, không còn ngọc lam)', () => {
    const tan = SETS.find((s) => s.id === 'set_tan_thiet')!.look;
    const tran = SETS.find((s) => s.id === 'set_tran_khich')!.look;
    expect(tan.trim).not.toBe(tran.trim);
    expect(tan.blade).not.toBe(tran.blade);
  });
});

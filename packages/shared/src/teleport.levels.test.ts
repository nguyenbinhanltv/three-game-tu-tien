import { describe, expect, it } from 'vitest';
import { padsOfLevel, TELE_PADS } from './teleport';

describe('padsOfLevel', () => {
  it('mỗi level chỉ có trận của chính nó (không lẫn tọa độ Vân Lam, Đoạn Mạch và Vân Hải)', () => {
    const dm = padsOfLevel('doan_mach');
    expect(dm.length).toBeGreaterThanOrEqual(6);
    expect(dm.every((p) => p.level === 'doan_mach' && p.id.startsWith('dm_'))).toBe(true);
    const vl = padsOfLevel('van_lam');
    expect(vl.some((p) => p.id === 'tp_tong_mon')).toBe(true);
    expect(vl.some((p) => p.id.startsWith('dm_'))).toBe(false);
    const vh = padsOfLevel('van_hai');
    expect(vh.length).toBeGreaterThanOrEqual(6);
    expect(vh.every((p) => p.level === 'van_hai' && p.id.startsWith('vh_'))).toBe(true);
    const tk = padsOfLevel('thien_khuyet');
    expect(tk.length).toBeGreaterThanOrEqual(6);
    expect(tk.every((p) => p.level === 'thien_khuyet' && p.id.startsWith('tk_'))).toBe(true);
    const bh = padsOfLevel('bac_hoang');
    expect(bh).toHaveLength(7);
    expect(bh.every((p) => p.level === 'bac_hoang' && p.id.startsWith('bh_'))).toBe(true);
    expect(dm.length + vl.length + vh.length + tk.length + bh.length).toBe(TELE_PADS.length);
  });
});

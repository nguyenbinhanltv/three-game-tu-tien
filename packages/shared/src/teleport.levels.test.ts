import { describe, expect, it } from 'vitest';
import { padsOfLevel, TELE_PADS } from './teleport';

describe('padsOfLevel', () => {
  it('mỗi level chỉ có trận của chính nó (không lẫn tọa độ Vân Lam và Đoạn Mạch)', () => {
    const dm = padsOfLevel('doan_mach');
    expect(dm.length).toBeGreaterThanOrEqual(6);
    expect(dm.every((p) => p.level === 'doan_mach' && p.id.startsWith('dm_'))).toBe(true);
    const vl = padsOfLevel('van_lam');
    expect(vl.some((p) => p.id === 'tp_tong_mon')).toBe(true);
    expect(vl.some((p) => p.id.startsWith('dm_'))).toBe(false);
    expect(dm.length + vl.length).toBe(TELE_PADS.length);
  });
});

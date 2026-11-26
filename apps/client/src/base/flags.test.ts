import { describe, expect, it } from 'vitest';
import { FLAG_DOCS, readFlags } from './flags';

describe('cờ ?chr (N-7: v3 là mặc định)', () => {
  it('không có cờ = mặc định (v3); v1 là cờ quay về; v2 đã gỡ', () => {
    expect(readFlags('').chr).toBeNull();
    expect(readFlags('?chr=v1').chr).toBe('v1');
    expect(readFlags('?chr=v2').chr).toBeNull();
    expect(readFlags('?chr=v3').chr).toBe('v3');
  });

  it('giá trị lạ bị bỏ qua (về mặc định)', () => {
    expect(readFlags('?chr=v9').chr).toBeNull();
    expect(readFlags('?chr=').chr).toBeNull();
  });

  it('cờ quay về v1 dành cho người chơi (không chỉ tài khoản thử)', () => {
    expect(FLAG_DOCS.chr?.scope).toBe('user');
  });
});

describe('cờ ?style (Họa Cảnh)', () => {
  it('mặc định tắt; chỉ painted bật; giá trị lạ bị bỏ qua', () => {
    expect(readFlags('').style).toBeNull();
    expect(readFlags('?style=painted').style).toBe('painted');
    expect(readFlags('?style=PAINTED').style).toBeNull();
    expect(readFlags('?style=').style).toBeNull();
  });

  it('?style=da bật hướng Dạ Cảnh, loại trừ painted', () => {
    expect(readFlags('?style=da').style).toBe('da');
    expect(readFlags('?style=DA').style).toBeNull();
    expect(readFlags('?style=da&style=painted').style).toBe('da');
  });

  it('hai thành phần painted/da suy từ style; ?style=dahoa (Dạ Họa) bật cả hai', () => {
    const pick = (q: string) => [readFlags(q).painted, readFlags(q).da];
    expect(pick('')).toEqual([false, false]);
    expect(pick('?style=painted')).toEqual([true, false]);
    expect(pick('?style=da')).toEqual([false, true]);
    expect(pick('?style=dahoa')).toEqual([true, true]);
    expect(readFlags('?style=dahoa').style).toBe('dahoa');
    expect(pick('?style=xyz')).toEqual([false, false]);
  });

  it('có mô tả trong FLAG_DOCS', () => {
    expect(FLAG_DOCS.style?.scope).toBe('diag');
  });
});

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

  it('có mô tả trong FLAG_DOCS', () => {
    expect(FLAG_DOCS.style?.scope).toBe('diag');
  });
});

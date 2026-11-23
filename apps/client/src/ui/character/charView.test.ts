import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCharView, writeCharView } from './charView';

afterEach(() => vi.unstubAllGlobals());

describe('kiểu xem bảng Nhân vật', () => {
  it('đọc/ghi qua localStorage, mặc định tranh', () => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
    expect(readCharView()).toBe('art');
    writeCharView('3d');
    expect(readCharView()).toBe('3d');
  });
  it('bộ nhớ bị chặn (ném SecurityError) thì không làm hỏng, mặc định tranh', () => {
    const boom = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
    expect(readCharView()).toBe('art');
    expect(() => writeCharView('3d')).not.toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fog } from './fog';

// Môi trường node: giả canvas/Image/localStorage vừa đủ để kiểm thứ tự nạp và lưu.
const store = new Map<string, string>();
let images: { onload?: () => void; onerror?: () => void; src: string }[] = [];

beforeEach(() => {
  store.clear();
  images = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,MOI' }),
  });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal(
    'Image',
    class {
      onload?: () => void;
      onerror?: () => void;
      src = '';
      constructor() {
        images.push(this);
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Fog: không ghi đè sương đã lưu trước khi nạp xong', () => {
  it('có ảnh cũ: save (kể cả force) không ghi cho tới khi ảnh nạp xong', () => {
    store.set('k', 'data:image/png;base64,CU');
    const f = new Fog('k', 4096);
    f.reveal(100, 100);
    f.save(20_000);
    f.save(0, true);
    expect(store.get('k')).toBe('data:image/png;base64,CU');
    images[0]!.onload!();
    f.save(20_000);
    expect(store.get('k')).toBe('data:image/png;base64,MOI');
  });

  it('ảnh cũ lỗi: vẫn lưu được sau onerror', () => {
    store.set('k', 'hong');
    const f = new Fog('k', 4096);
    f.reveal(100, 100);
    f.save(20_000);
    expect(store.get('k')).toBe('hong');
    images[0]!.onerror!();
    f.save(20_000);
    expect(store.get('k')).toBe('data:image/png;base64,MOI');
  });

  it('không có khóa: lưu ngay được', () => {
    const f = new Fog('k', 4096);
    f.reveal(100, 100);
    f.save(20_000);
    expect(store.get('k')).toBe('data:image/png;base64,MOI');
  });
});

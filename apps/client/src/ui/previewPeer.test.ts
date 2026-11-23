import { beforeAll, describe, expect, it, vi } from 'vitest';

// Store kéo theo giao diện u2 nên cần localStorage trước khi nạp.
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
vi.stubGlobal('window', {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
});
let S: typeof import('./store');
beforeAll(async () => {
  S = await import('./store');
});

const open = () => S.useUI.getState().windows.map((w) => w.id);

describe('hai cửa sổ dùng chung khung xem trước 3D', () => {
  it('mở Nhân vật khi Tủ ngoại trang đang mở thì tủ đóng, và ngược lại', () => {
    S.openPanel('wardrobe');
    expect(open()).toContain('wardrobe');
    S.openPanel('char');
    expect(open()).toContain('char');
    expect(open()).not.toContain('wardrobe');
    S.openPanel('wardrobe');
    expect(open()).toContain('wardrobe');
    expect(open()).not.toContain('char');
    S.closePanel('wardrobe');
  });
  it('cửa sổ khác (túi) không bị đóng', () => {
    S.openPanel('bag');
    S.openPanel('char');
    expect(open()).toEqual(expect.arrayContaining(['bag', 'char']));
    S.closePanel('bag');
    S.closePanel('char');
  });
});

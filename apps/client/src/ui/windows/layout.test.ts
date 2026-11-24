import { describe, expect, it } from 'vitest';
import {
  clampPos,
  closeWindow,
  fitWindows,
  focusWindow,
  moveWindow,
  openWindow,
  overlaps,
  topWindow,
  withoutPreviewPeer,
  type Viewport,
  type WinState,
  winRect,
} from './layout';

const VPS: Viewport[] = [
  { vw: 1280, vh: 720 },
  { vw: 1920, vh: 1080 },
];

describe('window manager', () => {
  it('mở độc lập, z tăng dần, cái trên cùng là cái vừa chạm', () => {
    const vp = VPS[1]!;
    let l: WinState[] = [];
    l = openWindow(l, 'quests', vp).list;
    l = openWindow(l, 'map', vp).list;
    expect(l.map((w) => w.id)).toEqual(['quests', 'map']);
    expect(topWindow(l)?.id).toBe('map');
    l = focusWindow(l, 'quests').list;
    expect(topWindow(l)?.id).toBe('quests');
    l = closeWindow(l, 'quests');
    expect(l.map((w) => w.id)).toEqual(['map']);
  });
  it('mở lại cửa sổ đã mở chỉ đưa lên trên, không nhân đôi', () => {
    const vp = VPS[1]!;
    let l = openWindow([], 'bag', vp).list;
    l = openWindow(l, 'char', vp).list;
    l = openWindow(l, 'bag', vp).list;
    expect(l).toHaveLength(2);
    expect(topWindow(l)?.id).toBe('bag');
  });
  for (const vp of VPS) {
    it(`B mở khi C đang mở: nhân vật trái, túi phải, không chồng (${vp.vw}×${vp.vh})`, () => {
      let l = openWindow([], 'char', vp).list;
      l = openWindow(l, 'bag', vp).list;
      const c = l.find((w) => w.id === 'char')!;
      const b = l.find((w) => w.id === 'bag')!;
      expect(c.x).toBeLessThan(b.x);
      expect(overlaps(winRect(c, vp), winRect(b, vp))).toBe(false);
      expect(b.x + 520).toBeLessThanOrEqual(vp.vw);
      expect(c.x).toBeGreaterThanOrEqual(0);
    });
    it(`C mở khi B đang mở cũng xếp cạnh nhau (${vp.vw}×${vp.vh})`, () => {
      let l = openWindow([], 'bag', vp).list;
      l = openWindow(l, 'char', vp).list;
      const c = l.find((w) => w.id === 'char')!;
      const b = l.find((w) => w.id === 'bag')!;
      expect(c.x).toBeLessThan(b.x);
      expect(overlaps(winRect(c, vp), winRect(b, vp))).toBe(false);
    });
  }
  it('vị trí đã nhớ được dùng và kẹp trong màn hình', () => {
    const vp = VPS[0]!;
    const l = openWindow([], 'help', vp, { x: 99999, y: -50 }).list;
    expect(l[0]!.x).toBeLessThanOrEqual(vp.vw - 120);
    expect(l[0]!.y).toBe(0);
  });
  it('kéo giữ thanh tiêu đề trong màn hình', () => {
    const vp = VPS[0]!;
    const c = clampPos('bag', -9999, 9999, vp);
    expect(c.x).toBe(120 - 520);
    expect(c.y).toBe(vp.vh - 48);
    const l = moveWindow(openWindow([], 'bag', vp).list, 'bag', 10, 20, vp);
    expect(l[0]).toMatchObject({ x: 10, y: 20 });
  });
  it('z không vượt số cửa sổ sau nhiều lần focus (luôn dưới toast/modal/tooltip)', () => {
    const vp = VPS[1]!;
    let l = openWindow([], 'bag', vp).list;
    l = openWindow(l, 'char', vp).list;
    l = openWindow(l, 'quests', vp).list;
    for (let i = 0; i < 200; i++) l = focusWindow(l, i % 2 ? 'bag' : 'char').list;
    expect(Math.max(...l.map((w) => w.z))).toBeLessThanOrEqual(l.length);
    expect(new Set(l.map((w) => w.z)).size).toBe(l.length);
    expect(topWindow(l)?.id).toBe('bag');
  });
});

describe('fitWindows', () => {
  it('co bảng đang mở vào khung nhỏ hơn, không đổi khi đã vừa', () => {
    const big = { vw: 1920, vh: 1080 };
    const small = { vw: 1366, vh: 768 };
    let l: WinState[] = [];
    l = openWindow(l, 'char', big).list;
    l = openWindow(l, 'bag', big).list;
    const fitted = fitWindows(l, () => small);
    for (const w of fitted) expect(w.x + winRect(w, small).w).toBeLessThanOrEqual(small.vw);
    expect(fitWindows(fitted, () => small)).toBe(fitted);
  });
});

describe('cửa sổ dùng chung khung xem trước 3D', () => {
  const win = (id: WinState['id']): WinState => ({ id, x: 0, y: 0, z: 1 });
  it('mở Nhân vật thì bỏ Tủ ngoại trang đang mở, và ngược lại', () => {
    expect(withoutPreviewPeer([win('wardrobe'), win('bag')], 'char').map((w) => w.id)).toEqual(['bag']);
    expect(withoutPreviewPeer([win('char')], 'wardrobe')).toEqual([]);
  });
  it('cửa sổ khác không bị đóng; không có đồng chủ thì giữ nguyên', () => {
    const l = [win('bag'), win('char')];
    expect(withoutPreviewPeer(l, 'bag')).toBe(l);
    expect(withoutPreviewPeer([win('bag')], 'char').map((w) => w.id)).toEqual(['bag']);
  });
});

describe('chừa theo khối HUD thật (U13)', () => {
  // 1280×720 ở chế độ compact: vùng thiết kế 1506×847; thanh chiêu thanh ngang + máu cao ~264, cột phải bắt đầu x ≈ 1130.
  const clear = { bottom: 264, rightX: 1130, rightY: 410 };
  const vp: Viewport = { vw: 1506, vh: 847, clear };
  it('cửa sổ ở giữa không phủ khối đáy HUD', () => {
    const st = openWindow([], 'char', vp).opened;
    const r = winRect(st, vp);
    expect(r.y + r.h).toBeLessThanOrEqual(vp.vh - clear.bottom);
  });
  it('Nhân vật + Túi mở cùng lúc: cả cặp không chạm cột HUD góc phải trên', () => {
    const a = openWindow([], 'char', vp).list;
    const both = openWindow(a, 'bag', vp).list;
    for (const w of both) {
      const r = winRect(w, vp);
      expect(r.x + r.w).toBeLessThanOrEqual(clear.rightX);
      expect(r.x).toBeGreaterThanOrEqual(0);
    }
  });
  it('không có `clear` thì giữ số chừa mặc định (tương thích)', () => {
    const plain: Viewport = { vw: 1506, vh: 847 };
    const r = winRect(openWindow([], 'char', plain).opened, plain);
    expect(r.y + r.h).toBeLessThanOrEqual(plain.vh - 84);
  });
});

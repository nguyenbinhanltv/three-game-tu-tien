import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUY_FX, SUY_FX_STAGE } from '@dtl/content';
import { FX_SKILL_DRAW_MAX, SUY_MECHANICS, fxDrawCount, type FxMsg } from '@dtl/shared';
import { SuyFx } from './suyFx';
import type { FxRunner } from './fxTimeline';

// TN-4: lớp hình của Thiên Nhân Ngũ Suy. Kiểm phần điều phối (phát timeline nào, ở đâu, vòng lặp sống/chết đúng lúc), không dựng WebGPU.

interface Call {
  key: string;
  x: number;
  z: number;
  yaw: number;
  pal: string;
  delay?: number;
}

function mk(opts: { trib?: boolean } = {}) {
  const calls: Call[] = [];
  const state = { trib: opts.trib ?? true };
  const runner = {
    startAt: (
      tl: { skill: string },
      o: { actor: { x: number; z: number; yaw: number }; palette: string; delay?: number; area?: { x: number; z: number } },
    ) => {
      calls.push({ key: tl.skill, x: o.area?.x ?? o.actor.x, z: o.area?.z ?? o.actor.z, yaw: o.actor.yaw, pal: o.palette, delay: o.delay });
    },
  } as unknown as FxRunner;
  const me = { x: 10, y: 0, z: 20, yaw: 0, model: {} };
  const fx = new SuyFx(runner, {
    player: (sid) => (sid === 'me' ? me : undefined),
    ground: () => 0,
    tribOn: () => state.trib,
    shadow: () => ({ x: 14, y: 0, z: 20 }),
  });
  const keys = () => calls.map((c) => c.key);
  return { fx, calls, keys, state, me };
}

const bar = (s: string, extra: Partial<FxMsg> = {}): FxMsg => ({ t: 'suy', src: 'me', s, pg: 30, ...extra });
const mark = (s: string, extra: Partial<FxMsg> = {}): FxMsg => ({ t: 'suymark', src: 'me', s, ...extra });

let now = 0;
beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe('dữ liệu', () => {
  it('mỗi ải có đủ timeline và nằm trong ngân sách draw call', () => {
    for (const mech of SUY_MECHANICS) {
      const keys = SUY_FX_STAGE[mech]!;
      expect(keys.length).toBeGreaterThan(3);
      for (const k of keys) expect(SUY_FX.has(k), k).toBe(true);
      expect(fxDrawCount(keys.flatMap((k) => SUY_FX.get(k)!.events))).toBeLessThanOrEqual(FX_SKILL_DRAW_MAX);
    }
  });
});

describe('SuyFx', () => {
  it('vào ải: thẻ ấn đúng bảng màu ải, tại tâm server báo; tin thanh kế tiếp không phát lại', () => {
    const { fx, calls } = mk();
    fx.bar(bar('suy_the', { x: 5, z: 6 }));
    fx.bar(bar('suy_the', { pg: 40 }));
    expect(calls).toEqual([{ key: 'suy_enter_the', x: 5, z: 6, yaw: 0, pal: 'suy_the', delay: undefined }]);
  });

  it('Linh Nhãn là vòng lặp: phát lại mỗi giây, dời chỗ thì chỗ cũ tắt, khép ải thì ngừng hẳn', () => {
    const { fx, calls, keys } = mk();
    fx.bar(bar('suy_linh', { x: 0, z: 0 }));
    fx.mark(mark('nhan', { x: 8, z: 0, r: 3.2, d: 8, pg: 1 }));
    fx.update();
    expect(keys()).toEqual(['suy_enter_linh', 'suy_nhan_open', 'suy_nhan']);
    now += 400;
    fx.update();
    expect(keys().filter((k) => k === 'suy_nhan')).toHaveLength(1);
    now += 700;
    fx.update();
    expect(keys().filter((k) => k === 'suy_nhan')).toHaveLength(2);
    // Dời chỗ: tắt ở chỗ cũ, mở ở chỗ mới, vòng lặp theo chỗ mới.
    fx.mark(mark('nhan', { x: -8, z: 0, r: 3.2, d: 6, pg: 1 }));
    expect(calls.at(-2)).toMatchObject({ key: 'suy_nhan_end', x: 8 });
    expect(calls.at(-1)).toMatchObject({ key: 'suy_nhan_open', x: -8 });
    fx.update();
    expect(calls.at(-1)).toMatchObject({ key: 'suy_nhan', x: -8 });
    fx.bar(bar('suy_linh', { pg: -1 }));
    const n = calls.length;
    now += 5000;
    fx.update();
    expect(calls).toHaveLength(n);
    expect(fx.live).toBe(0);
  });

  it('Tôi Thể Lôi: báo mang đúng thời lượng server; đón được và lỡ là hai hình khác nhau', () => {
    const { fx, calls } = mk();
    fx.mark(mark('toi', { x: 3, z: 4, r: 2.8, d: 2.2, pg: 1 }));
    fx.mark(mark('toi', { x: 3, z: 4, r: 2.8, pg: 2 }));
    fx.mark(mark('toi', { x: 3, z: 4, r: 2.8, pg: 0 }));
    expect(calls.map((c) => [c.key, c.delay])).toEqual([
      ['suy_toi_warn', 2.2],
      ['suy_toi_hit', undefined],
      ['suy_toi_miss', undefined],
    ]);
  });

  it('lôi ẩn: lúc tụ không có hình nào theo cung; nổ thì mỗi cung nổ một vệt đúng hướng', () => {
    const { fx, calls } = mk();
    fx.mark(mark('thuc', { x: 0, z: 0, r: 14, d: 3, pg: 3 }));
    expect(calls.map((c) => c.key)).toEqual(['suy_thuc_brew']);
    fx.mark(mark('thuc', { x: 0, z: 0, r: 14, n: 0b10000101, lv: 8, pg: 0 }));
    const booms = calls.filter((c) => c.key === 'suy_thuc_boom');
    expect(booms).toHaveLength(3);
    const step = (Math.PI * 2) / 8;
    expect(booms.map((b) => b.yaw)).toEqual([0.5 * step, 2.5 * step, 7.5 * step]);
  });

  it('Thọ Đăng: cháy/tắt là hai vòng lặp; tắt có khói, thắp lại có chớp; suy phong và đang thắp không đổi vòng lặp', () => {
    const { fx, calls, keys } = mk();
    fx.mark(mark('den', { n: 0, x: 0, z: 9, r: 2.8, pg: 1 }));
    fx.mark(mark('den', { n: 1, x: 9, z: 0, r: 2.8, pg: 1 }));
    fx.update();
    expect(keys()).toEqual(['suy_den_lit', 'suy_den_lit']);
    fx.mark(mark('den', { n: 1, x: 9, z: 0, r: 2.8, d: 1.5, pg: 2 }));
    expect(calls.at(-1)).toMatchObject({ key: 'suy_den_gust', delay: 1.5 });
    fx.mark(mark('den', { n: 1, x: 9, z: 0, r: 2.8, pg: 0 }));
    expect(keys().at(-1)).toBe('suy_den_out');
    now += 1100;
    fx.update();
    expect(keys().slice(-2).sort()).toEqual(['suy_den_dark', 'suy_den_lit']);
    fx.mark(mark('den', { n: 1, x: 9, z: 0, r: 2.8, d: 1.2, pg: 3 }));
    expect(keys().at(-1)).toBe('suy_den_light');
    fx.mark(mark('den', { n: 1, x: 9, z: 0, r: 2.8, pg: 1 }));
    expect(keys().at(-1)).toBe('suy_den_relit');
    expect(fx.live).toBe(2);
    fx.mark(mark('den', { n: -1, pg: 0 }));
    expect(fx.live).toBe(0);
  });

  it('Đạo Tâm Suy: nhịp phá vọng mở một lần mỗi nhịp, đúng thời lượng; trúng thì vết chém đặt ở Tâm Ma Ảnh', () => {
    const { fx, calls } = mk();
    fx.bar(bar('suy_tam', { x: 10, z: 20, n: 0 }));
    fx.bar(bar('suy_tam', { n: 1, d: 3 }));
    fx.bar(bar('suy_tam', { n: 1 }));
    expect(calls.filter((c) => c.key === 'suy_tam_open')).toEqual([
      { key: 'suy_tam_open', x: 10, z: 20, yaw: 0, pal: 'suy_tam', delay: 3 },
    ]);
    fx.mark(mark('tam', { pg: 1 }));
    fx.mark(mark('tam', { pg: 0 }));
    fx.mark(mark('tam', { pg: 2 }));
    expect(calls.slice(-3).map((c) => c.key)).toEqual(['suy_tam_good', 'suy_tam_bad', 'suy_tam_miss']);
    fx.bar(bar('suy_tam', { n: 0 }));
    fx.bar(bar('suy_tam', { n: 1, d: 3 }));
    expect(calls.filter((c) => c.key === 'suy_tam_open')).toHaveLength(2);
  });

  it('suy khí công tâm (thanh 100) phát hình thất bại; qua ải phát hình qua ải theo màu ải', () => {
    const { fx, calls } = mk();
    fx.bar(bar('suy_tho', { x: 0, z: 0 }));
    fx.ok({ t: 'suyok', src: 'me', n: 3 });
    expect(calls.at(-1)).toMatchObject({ key: 'suy_ok', pal: 'suy_tho', x: 10, z: 20 });
    fx.bar(bar('suy_tho', { pg: 100 }));
    expect(calls.at(-1)).toMatchObject({ key: 'suy_fail', x: 10, z: 20 });
  });

  it('lỡ tin khép ải: chủ hết cờ độ kiếp quá 2 giây thì vòng lặp tự dọn, không sót hình trên sân', () => {
    const { fx, calls, state } = mk();
    fx.bar(bar('suy_tho', { x: 0, z: 0 }));
    fx.mark(mark('den', { n: 0, x: 0, z: 9, r: 2.8, pg: 1 }));
    fx.update();
    state.trib = false;
    now += 1000;
    fx.update();
    expect(fx.live).toBe(1);
    now += 2100;
    fx.update();
    expect(fx.live).toBe(0);
    const n = calls.length;
    now += 3000;
    fx.update();
    expect(calls).toHaveLength(n);
  });

  it('người ngoài tầm nhìn: hình bám người bị bỏ qua, không lỗi', () => {
    const { fx, calls } = mk();
    fx.mark({ t: 'suymark', src: 'khac', s: 'tam', pg: 1 });
    fx.ok({ t: 'suyok', src: 'khac' });
    expect(calls).toHaveLength(0);
  });
});

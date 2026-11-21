import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HK_FX, HK_FX_STAGE, SUY_FX, SUY_FX_STAGE } from '@dtl/content';
import { FX_SKILL_DRAW_MAX, HK_MECHANICS, SUY_MECHANICS, fxDrawCount, type FxMsg } from '@dtl/shared';
import * as THREE from 'three/webgpu';
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

describe('lớp đọc được từ xa (đèn khu ải, cột linh quang, lửa Thọ Đăng)', () => {
  function mkGlow() {
    const beacons: { color: number; stopped: boolean; dur: number }[] = [];
    const lampSets: [number, number, number | undefined][] = [];
    let lampStops = 0;
    const scene = new THREE.Scene();
    const calls: string[] = [];
    const runner = { startAt: (tl: { skill: string }) => calls.push(tl.skill) } as unknown as FxRunner;
    const me = { x: 10, y: 0, z: 20, yaw: 0, model: {} };
    const fx = new SuyFx(runner, {
      player: (sid) => (sid === 'me' ? me : undefined),
      ground: () => 0,
      tribOn: () => true,
      shadow: () => null,
      mySid: () => 'me',
      scene,
      vfx: {
        boltGlowMul: 1,
        suyBeacon: (_pos, color, o) => {
          const b = { color, stopped: false, dur: o.dur };
          beacons.push(b);
          return { stop: () => (b.stopped = true) };
        },
        suyLamps: (pts) => {
          expect(pts).toHaveLength(5);
          return { set: (i, s, sec) => lampSets.push([i, s, sec]), stop: () => lampStops++ };
        },
      },
    });
    const lights = () => scene.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    return { fx, beacons, lampSets, lights, scene, stops: () => lampStops };
  }

  it('vào ải: thêm đúng hai đèn không đổ bóng (chủ đạo trên tâm ải, viền bám nhân vật); khép ải thì gỡ sạch', () => {
    const { fx, lights, scene } = mkGlow();
    fx.bar(bar('suy_linh', { x: 4, z: 6 }));
    expect(lights()).toHaveLength(2);
    expect(lights().every((l) => !l.castShadow)).toBe(true);
    expect(lights()[0]!.position.x).toBe(4);
    expect(lights()[0]!.position.y).toBeGreaterThan(8);
    fx.update();
    // Đèn viền đứng sau lưng nhân vật (yaw 0 = nhìn +Z nên đèn lùi về -Z).
    expect(lights()[1]!.position.z).toBeLessThan(20);
    // Sang ải khác: vẫn hai đèn (không cộng dồn), đổi màu theo ải.
    const c0 = lights()[0]!.color.getHex();
    fx.bar(bar('suy_the', { x: 4, z: 6 }));
    expect(lights()).toHaveLength(2);
    expect(lights()[0]!.color.getHex()).not.toBe(c0);
    // Khép ải: đèn TẮT (intensity 0) nhưng vẫn ở trong cảnh, số con của scene không đổi (đổi số đèn = dựng lại shader, khựng).
    const n = scene.children.length;
    fx.bar(bar('suy_the', { pg: -1 }));
    expect(scene.children.length).toBe(n);
    expect(lights().every((l) => l.intensity === 0)).toBe(true);
    expect(fx.lit).toBe(false);
    // Cả chuỗi khép ải → ải mới: vẫn đúng hai đèn ấy, bật lại.
    const [k0, r0] = lights();
    for (const id of ['suy_thuc', 'suy_tho', 'suy_tam']) {
      fx.bar(bar(id, { x: 4, z: 6 }));
      expect(scene.children.length).toBe(n);
      expect(lights()).toEqual([k0, r0]);
      expect(fx.lit).toBe(true);
      fx.bar(bar(id, { pg: -1 }));
      expect(scene.children.length).toBe(n);
    }
    // Chỉ dispose() mới gỡ đèn.
    fx.dispose();
    expect(lights()).toHaveLength(0);
  });

  it('cột linh quang: Linh Nhãn dời thì cột cũ tắt; Tôi Thể Lôi sống đúng thời lượng báo; khép ải tắt hết', () => {
    const { fx, beacons } = mkGlow();
    fx.bar(bar('suy_linh', { x: 0, z: 0 }));
    fx.mark(mark('nhan', { x: 8, z: 0, r: 3.2, d: 8, pg: 1 }));
    fx.mark(mark('nhan', { x: -8, z: 0, r: 3.2, d: 6, pg: 1 }));
    expect(beacons.map((b) => b.stopped)).toEqual([true, false]);
    fx.mark(mark('toi', { x: 1, z: 1, r: 2.8, d: 2.2, pg: 1 }));
    expect(beacons.at(-1)!.dur).toBe(2.2);
    fx.mark(mark('toi', { x: 1, z: 1, r: 2.8, pg: 2 }));
    expect(beacons.at(-1)!.stopped).toBe(true);
    fx.bar(bar('suy_linh', { pg: -1 }));
    expect(beacons.every((b) => b.stopped)).toBe(true);
  });

  it('lửa Thọ Đăng theo đúng trạng thái server báo (cháy, bị nhắm kèm thời lượng, tắt, đang thắp) và tắt khi dọn đèn', () => {
    const { fx, lampSets, stops } = mkGlow();
    fx.bar(bar('suy_tho', { x: 0, z: 0 }));
    fx.mark(mark('den', { n: 2, x: 0, z: 8, r: 2.8, pg: 1 }));
    fx.mark(mark('den', { n: 2, x: 0, z: 8, r: 2.8, d: 1.5, pg: 2 }));
    fx.mark(mark('den', { n: 2, x: 0, z: 8, r: 2.8, pg: 0 }));
    fx.mark(mark('den', { n: 2, x: 0, z: 8, r: 2.8, d: 1.2, pg: 3 }));
    expect(lampSets).toEqual([
      [2, 1, undefined],
      [2, 2, 1.5],
      [2, 0, undefined],
      [2, 3, 1.2],
    ]);
    fx.mark(mark('den', { n: -1, pg: 0 }));
    expect(stops()).toBe(1);
  });
});

describe('Huyền Kiếp (TN-6)', () => {
  const hk = (s: string, extra: Partial<FxMsg> = {}): FxMsg => ({ t: 'hkmark', src: 'me', s, ...extra });

  it('mỗi kiếp nhỏ có đủ timeline và nằm trong ngân sách draw call', () => {
    for (const mech of HK_MECHANICS) {
      const keys = HK_FX_STAGE[mech]!;
      for (const k of keys) expect(HK_FX.has(k) || SUY_FX.has(k), k).toBe(true);
      expect(fxDrawCount(keys.flatMap((k) => (HK_FX.get(k) ?? SUY_FX.get(k))!.events))).toBeLessThanOrEqual(FX_SKILL_DRAW_MAX);
    }
  });

  it('vào kiếp dùng thẻ ấn chung với bảng màu của kiếp; Lôi: trụ nguội/nóng là hai vòng lặp, khép kiếp thì dọn', () => {
    const { fx, calls, keys } = mk();
    fx.bar(bar('hk_loi', { x: 0, z: 0 }));
    expect(calls[0]).toMatchObject({ key: 'hk_enter', pal: 'hk_loi' });
    fx.hkMark(hk('loi', { n: 0, x: 0, z: 6.5, r: 2.2, pg: 1 }));
    fx.update();
    expect(keys().at(-1)).toBe('hk_loi_rod');
    fx.hkMark(hk('loi', { n: 0, x: 0, z: 6.5, r: 4.5, d: 9, pg: 2 }));
    expect(keys().at(-1)).toBe('hk_loi_zap');
    now += 1100;
    fx.update();
    expect(keys().at(-1)).toBe('hk_loi_hot');
    fx.hkMark(hk('loi', { n: 0, x: 0, z: 6.5, r: 4.5, pg: 4 }));
    expect(keys().at(-1)).toBe('hk_loi_boom');
    fx.bar(bar('hk_loi', { pg: -1 }));
    expect(fx.live).toBe(0);
  });

  it('Phong: báo gió xoay theo hướng server gửi; Hồn Châu nhặt xong là hết vòng lặp ngay', () => {
    const { fx, calls, keys } = mk();
    fx.bar(bar('hk_phong', { x: 0, z: 0 }));
    fx.hkMark(hk('phong', { n: 3, x: 0, z: 0, r: 6, pg: 1 }));
    expect(fx.live).toBe(3);
    fx.hkMark(hk('phong', { x: 0, z: 0, ox: 1, oz: 0, d: 3, pg: 2 }));
    expect(calls.at(-1)).toMatchObject({ key: 'hk_phong_warn', delay: 3 });
    expect(calls.at(-1)!.yaw).toBeCloseTo(Math.PI / 2);
    fx.hkMark(hk('phong', { x: 0, z: 0, ox: 1, oz: 0, pg: 4 }));
    expect(keys().slice(-2)).toEqual(['hk_phong_blow', 'hk_phong_hit']);
    fx.bar(bar('hk_hon_tho', { x: 0, z: 0 }));
    fx.hkMark(hk('chau', { n: 2, x: 3, z: 4, r: 1.8, d: 6, pg: 1 }));
    expect(fx.live).toBe(1);
    fx.hkMark(hk('chau', { n: 2, x: 3, z: 4, pg: 2 }));
    expect(fx.live).toBe(0);
    expect(calls.at(-1)).toMatchObject({ key: 'hk_chau_get', x: 3, z: 4 });
  });

  it('Vấn Tâm: lúc đổi chỗ (pg 3) các ấn PHẢI chuyển động xoay và dừng đúng `shift` bước (không đứng yên để người chơi phải đoán)', () => {
    const pos: (() => { x: number; z: number } | null)[] = [];
    const runner = { startAt: () => undefined } as unknown as FxRunner;
    const fx = new SuyFx(runner, {
      player: () => ({ x: 0, y: 0, z: 0, yaw: 0, model: {} }),
      ground: () => 0,
      tribOn: () => true,
      shadow: () => null,
      vfx: {
        boltGlowMul: 1,
        suyBeacon: (p) => {
          pos.push(p);
          return { stop: () => undefined };
        },
        suyLamps: () => ({ set: () => undefined, stop: () => undefined }),
      },
    });
    fx.bar(bar('hk_van_tam', { x: 0, z: 0 }));
    fx.hkMark(hk('van', { n: 3, x: 0, z: 0, r: 6, lv: 2.6, pg: 1 }));
    const seals = pos.slice(0, 3);
    const at0 = seals.map((f) => f()!);
    expect(at0[0]!.z).toBeCloseTo(6);
    fx.hkMark(hk('van', { n: 0, x: 0, z: 6, r: 2.6, d: 1.4, pg: 2 }));
    fx.hkMark(hk('van', { n: 1, x: 0, z: 0, r: 6, d: 3.2, pg: 3 }));
    now += 800;
    const mid = seals[0]!()!;
    expect(Math.hypot(mid.x - at0[0]!.x, mid.z - at0[0]!.z)).toBeGreaterThan(1);
    now += 3000;
    const end = seals[0]!()!;
    // Xoay một bước: ấn 0 tới đúng chỗ ban đầu của ấn 1.
    expect(end.x).toBeCloseTo(at0[1]!.x, 3);
    expect(end.z).toBeCloseTo(at0[1]!.z, 3);
  });
});

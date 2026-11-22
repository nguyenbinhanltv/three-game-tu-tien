import { describe, expect, it } from 'vitest';
import type { FxMsg, FxTimeline } from '@dtl/shared';
import { fxDrawCount, fxParticleCount, validateFxTimeline } from '@dtl/shared';
import { TRAN_FX, TRAN_FX_TIMELINES } from '@dtl/content';
import { paletteOf } from '../../render/vfx/palette';
import { playTranFx, tranKind, TRAN_FX_DIST, TRAN_PALETTE, TRAN_STAND_SEG, type TranEnv } from './tranFx';

const MODES = ['sat', 'khon', 'ho', 'sinhtu'];

function env(over: Partial<TranEnv> = {}) {
  const started: { tl: FxTimeline; area: { x: number; z: number; r: number }; mul?: number; mine?: boolean }[] = [];
  const timers: { sec: number; done: () => void }[] = [];
  const e: TranEnv = {
    startAt: (tl, o) => started.push({ tl, area: o.area, mul: o.mul, mine: o.mine }),
    groundAt: () => 0,
    mySid: () => 'me',
    viewer: () => ({ x: 0, z: 0 }),
    live: () => 0,
    after: (sec, done) => timers.push({ sec, done }),
    ...over,
  };
  return { e, started, timers };
}
const msg = (t: string, o: Partial<FxMsg> = {}): FxMsg => ({ t, src: 'me', x: 5, z: 6, r: 7, d: 10, ...o });

describe('VFX trận Cấm chế sư: timeline', () => {
  it('đủ 4 kiểu × (đứng, nhịp), hợp lệ, đúng bảng màu, trong ngân sách, không khựng/rung/chớp', () => {
    expect(TRAN_FX_TIMELINES).toHaveLength(8);
    for (const m of MODES)
      for (const k of ['stand', 'tick']) {
        const tl = TRAN_FX.get(`tran_${m}_${k}`)!;
        expect(tl, `${m}_${k}`).toBeDefined();
        expect(validateFxTimeline(tl, (id) => id.startsWith('tran_'))).toEqual([]);
        expect(tl.palette).toBe(TRAN_PALETTE);
        expect(fxDrawCount(tl.events)).toBeLessThanOrEqual(k === 'stand' ? 5 : 3);
        expect(fxParticleCount(tl.events)).toBeLessThanOrEqual(30);
        expect(tl.events.some((x) => x.type === 'hitstop' || x.type === 'shake' || x.type === 'flash')).toBe(false);
      }
  });

  it('mọi mesh vẽ theo vùng (fit area) hoặc là decal/hạt; không khối đứng che người', () => {
    for (const tl of TRAN_FX_TIMELINES)
      for (const x of tl.events) if (x.type === 'mesh') expect(x.fit, `${tl.skill}:${x.shape}`).toBe('area');
  });

  it('bảng màu cam_che_kinh có 3 tầng màu khác nhau', () => {
    const p = paletteOf(TRAN_PALETTE);
    expect(new Set([p.core, p.body, p.rim]).size).toBe(3);
  });
});

describe('playTranFx', () => {
  it('nhận đúng tên tin, bỏ tin khác', () => {
    expect(tranKind('tran_sat')).toEqual({ mode: 'sat', tick: false });
    expect(tranKind('tran_tick_sinhtu')).toEqual({ mode: 'sinhtu', tick: true });
    expect(tranKind('tran_xx')).toBeNull();
    expect(tranKind('rain')).toBeNull();
    const { e, started } = env();
    expect(playTranFx(e, { t: 'rain' })).toBe(false);
    expect(started).toHaveLength(0);
  });

  it('nhịp trận: một lần, vẽ đúng vùng của server (x, z, r)', () => {
    const { e, started, timers } = env();
    expect(playTranFx(e, msg('tran_tick_khon'))).toBe(true);
    expect(started).toHaveLength(1);
    expect(started[0]!.tl.skill).toBe('tran_khon_tick');
    expect(started[0]!.area).toEqual({ x: 5, z: 6, r: 7 });
    expect(started[0]!.mul).toBe(7);
    expect(timers).toHaveLength(0);
  });

  it('trận đứng: phát nối tiếp từng đoạn tới hết `d`, đặt trận mới đúng chỗ đó thì đoạn cũ dừng', () => {
    const { e, started, timers } = env();
    playTranFx(e, msg('tran_sat', { d: 8 }));
    expect(started).toHaveLength(1);
    let n = 0;
    while (timers.length && n++ < 10) {
      const t = timers.shift()!;
      expect(t.sec).toBe(TRAN_STAND_SEG);
      t.done();
    }
    expect(started.length).toBe(3); // 8 s → 3 đoạn 3,3 s
    const r = env();
    playTranFx(r.e, msg('tran_ho', { d: 20 }));
    playTranFx(r.e, msg('tran_ho', { d: 20 }));
    expect(r.started).toHaveLength(2);
    r.timers.shift()!.done(); // đoạn của lượt cũ tự dừng
    expect(r.started).toHaveLength(2);
    r.timers.shift()!.done();
    expect(r.started).toHaveLength(3);
  });

  it('bỏ tin lỗi (thiếu x/z/r), trận của người khác ở xa, nhịp của người khác khi sân đông', () => {
    const { e, started } = env();
    expect(playTranFx(e, { t: 'tran_sat', src: 'me', d: 5 })).toBe(true);
    expect(playTranFx(e, msg('tran_sat', { r: 0 }))).toBe(true);
    expect(playTranFx(e, msg('tran_sat', { src: 'other', x: TRAN_FX_DIST + 100 }))).toBe(true);
    expect(started).toHaveLength(0);
    const crowded = env({ live: () => 999 });
    playTranFx(crowded.e, msg('tran_tick_sat', { src: 'other' }));
    expect(crowded.started).toHaveLength(0);
    playTranFx(crowded.e, msg('tran_tick_sat', { src: 'me' }));
    expect(crowded.started).toHaveLength(1);
  });
});

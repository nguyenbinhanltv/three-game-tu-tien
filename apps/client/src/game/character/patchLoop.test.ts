import { describe, expect, it } from 'vitest';
import { LOCO, locoClipName, locoMix } from './mannequinAnim';
import { clipTimeAt, PATCH_LOCO, PATCH_PHASE, PATCH_TABLE, phaseOffsetOf, STRIDE_SCALE, REV_PHASE, diagStrideGain } from './patchLoop';

describe('vòng chạy Patch: bảng và pha', () => {
  it('bảng Patch: đi bộ UAL, chạy/chạy nhanh là PM_Run/PM_Sprint với tên clip khớp locoClipName', () => {
    expect(PATCH_TABLE.walk).toBe(LOCO.walk);
    expect(locoClipName('jog', 'f', PATCH_TABLE)).toBe('PM_Run');
    expect(locoClipName('sprint', 'f', PATCH_TABLE)).toBe('PM_Sprint');
    expect(locoClipName('walk', 'f', PATCH_TABLE)).toBe('Walk_Loop');
    // lùi/ngang vẫn là clip UAL dựng thủ tục
    expect(locoClipName('jog', 'l', PATCH_TABLE)).toBe('Jog_StrafeL_Loop');
    // mặc định không đổi
    expect(locoClipName('jog', 'f')).toBe('Jog_Fwd_Loop');
  });

  it('chu kỳ/giây = tốc độ / độ dài chu kỳ của clip Patch (mặc định vẫn là UAL)', () => {
    expect(locoMix(PATCH_LOCO.jog.speed, PATCH_TABLE).cycles).toBeCloseTo(PATCH_LOCO.jog.speed / PATCH_TABLE.jog.stride, 2);
    expect(locoMix(PATCH_LOCO.sprint.speed, PATCH_TABLE).cycles).toBeCloseTo(PATCH_LOCO.sprint.speed / PATCH_TABLE.sprint.stride, 2);
    expect(locoMix(LOCO.jog.speed).cycles).toBeCloseTo(LOCO.jog.speed / LOCO.jog.stride, 2);
    // ở tốc độ chạy của game (5,4 m/s) gần như 100% dải chạy
    const m = locoMix(5.4, PATCH_TABLE);
    expect(m.jog).toBeGreaterThan(0.95);
    expect(m.walk + m.jog + m.sprint).toBeCloseTo(1, 6);
  });

  it('hiệu chỉnh độ dài chu kỳ: bảng = chu kỳ clip × STRIDE_SCALE', () => {
    expect(STRIDE_SCALE).toBeCloseTo(1.1, 6);
    expect(PATCH_TABLE.jog.stride).toBeCloseTo(PATCH_LOCO.jog.stride * STRIDE_SCALE, 9);
    expect(PATCH_TABLE.sprint.stride).toBeCloseTo(PATCH_LOCO.sprint.stride * STRIDE_SCALE, 9);
  });

  it('độ lệch pha chỉ áp cho clip Patch (kể cả clip tách nửa thân), clipTimeAt luôn trong [0, dur)', () => {
    expect(phaseOffsetOf('Jog_Fwd_Loop')).toBe(0);
    expect(phaseOffsetOf('PM_Run')).toBeCloseTo(PATCH_PHASE.PM_Run!, 9);
    expect(phaseOffsetOf('PM_Run|lower')).toBeCloseTo(PATCH_PHASE.PM_Run!, 9);
    for (const ph of [0, 0.02, 0.5, 0.999]) {
      const t = clipTimeAt('PM_Run', 0.667, ph);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(0.667);
    }
    // pha 0 của clip UAL = thời gian 0; clip Patch lệch -0,029 chu kỳ
    expect(clipTimeAt('Jog_Fwd_Loop', 0.933, 0)).toBe(0);
    expect(clipTimeAt('PM_Run', 1, 0.029)).toBeCloseTo(0, 6);
  });

  it('bản đọc ngược của clip ngang (chéo-lùi): thời gian giảm khi pha tăng, luôn trong [0, dur), kể cả clip tách nửa dưới', () => {
    const dur = 0.8;
    expect(clipTimeAt('Jog_StrafeR_Loop|rev', dur, REV_PHASE)).toBeCloseTo(0, 9);
    expect(clipTimeAt('Jog_StrafeR_Loop|rev', dur, REV_PHASE - 0.25)).toBeCloseTo(0.25 * dur, 9);
    expect(clipTimeAt('Jog_StrafeR_Loop|rev|lower', dur, REV_PHASE - 0.25)).toBeCloseTo(0.25 * dur, 9);
    for (const ph of [0, 0.3, 0.53, 0.75, 0.999]) {
      const t = clipTimeAt('Sprint_StrafeL_Loop|rev', dur, ph);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(dur);
    }
    // clip thường không đổi
    expect(clipTimeAt('Jog_StrafeR_Loop', dur, 0.25)).toBeCloseTo(0.25 * dur, 9);
  });

  it('bù sải chéo-tới: 1 ở tới hẳn và ngang hẳn, nhỏ nhất quanh 60–70% hướng tới, đi bộ không bù', () => {
    expect(diagStrideGain(1, 1)).toBe(1);
    expect(diagStrideGain(0, 1)).toBe(1);
    expect(diagStrideGain(0.7, 1)).toBeCloseTo(0.83, 6);
    expect(diagStrideGain(0.65, 1)).toBeCloseTo(0.8325, 6);
    expect(diagStrideGain(0.7, 0)).toBe(1);
    expect(diagStrideGain(0.7, 0.5)).toBeCloseTo(0.915, 6);
    for (let f = 0; f <= 1.001; f += 0.05) {
      expect(diagStrideGain(f, 1)).toBeGreaterThanOrEqual(0.83 - 1e-9);
      expect(diagStrideGain(f, 1)).toBeLessThanOrEqual(1);
    }
  });

  it('chu kỳ theo hướng: chạy tới theo clip Patch, lùi/ngang (clip UAL) theo chu kỳ UAL, chéo trộn; bảng UAL không đổi theo hướng', () => {
    const v = 5.4;
    const fwd = locoMix(v, PATCH_TABLE, 1).cycles;
    const side = locoMix(v, PATCH_TABLE, 0).cycles;
    const diag = locoMix(v, PATCH_TABLE, 0.5).cycles;
    expect(fwd).toBeCloseTo(v / PATCH_TABLE.jog.stride, 1);
    expect(side).toBeCloseTo(v / LOCO.jog.stride, 1);
    expect(diag).toBeLessThan(fwd);
    expect(diag).toBeGreaterThan(side);
    // UAL: không phụ thuộc hướng
    expect(locoMix(v, LOCO, 0).cycles).toBeCloseTo(locoMix(v, LOCO, 1).cycles, 9);
  });
});

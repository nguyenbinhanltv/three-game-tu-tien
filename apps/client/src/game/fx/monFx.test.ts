import { describe, expect, it } from 'vitest';
import { MON_FX, MON_FX_TIMELINES } from '@dtl/content';
import { fxDrawCount, fxParticleCount, fxEventsFor } from '@dtl/shared';
import { FX_PALETTE, monPaletteKey } from '../../render/vfx/palette';
import type { FxTimeline } from '@dtl/shared';
import { FxRunner } from './fxTimeline';
import { decalNeed, dropLegacyTelegraph, hazardMul, monScale } from './monFx';

describe('FX quái (V5)', () => {
  it('đủ timeline cho mọi loại sự kiện quái và trong ngân sách', () => {
    for (const k of [
      'mon_hit',
      'mon_strike',
      'mon_cast',
      'mon_warn',
      'mon_boom_circle',
      'mon_boom_line',
      'mon_boom_cone',
      'mon_warn_line',
      'mon_warn_cone',
      'mon_bolt_muzzle',
      'mon_bolt_impact',
      'mon_death',
      'mon_face',
      'mon_face_warn',
    ]) {
      const tl = MON_FX.get(k);
      expect(tl, k).toBeTruthy();
      const ev = fxEventsFor(tl!, -1);
      expect(fxDrawCount(ev), k).toBeLessThanOrEqual(12);
      expect(fxParticleCount(ev), k).toBeLessThanOrEqual(1500);
      const boss = fxEventsFor(tl!, -1, 'boss');
      expect(fxDrawCount(boss), k + ' boss').toBeLessThanOrEqual(12);
      expect(fxParticleCount(boss), k + ' boss').toBeLessThanOrEqual(1500);
    }
    expect(MON_FX_TIMELINES.length).toBe(MON_FX.size);
  });
  it('mọi hệ ngũ hành có bảng màu nguy hiểm riêng, accent đỏ', () => {
    for (const e of ['kim', 'moc', 'thuy', 'hoa', 'tho']) expect(FX_PALETTE[monPaletteKey(e)]).toBe(FX_PALETTE['mon_' + e]);
    for (const e of ['kim', 'moc', 'thuy', 'hoa', 'tho']) expect(FX_PALETTE[monPaletteKey(e, true)]!.accent).toBe(0xff1f3d);
    expect(monPaletteKey(undefined)).toBe('mon_neutral');
    expect(monPaletteKey(undefined, true)).toBe('mon_boss_neutral');
    expect(monPaletteKey('khong_co')).toBe('mon_neutral');
  });
  it('tinh anh A4: bỏ pháp trận quạt cũ chỉ khi vạch riêng thật sự phát; runner đầy decal thì vẫn vẽ pháp trận cũ (đường lùi)', () => {
    const tl = MON_FX.get('mon_warn_cone__elite_huyet_nha_lang__caster') as FxTimeline;
    expect(tl).toBeTruthy();
    const need = decalNeed(tl);
    expect(need).toBeGreaterThan(0);
    // Quái không báo theo màu hệ (tint undefined): luôn giữ pháp trận cũ, dù warn có phát hay không.
    expect(dropLegacyTelegraph(undefined, true)).toBe(false);
    // Báo theo màu hệ + warn đã phát: bỏ pháp trận cũ.
    expect(dropLegacyTelegraph(0xb02a8c, true)).toBe(true);
    // Báo theo màu hệ nhưng warn KHÔNG phát (runner đầy decal, quá xa, atlas chưa nạp): giữ pháp trận cũ.
    expect(dropLegacyTelegraph(0xb02a8c, false)).toBe(false);
    // Runner mới có đủ chỗ cho vạch; runner đầy decal (trần DECAL_MAX) thì không đủ chỗ → `MonFx.warn` trả false và `room.ts` giữ pháp trận cũ.
    const runner = new FxRunner(null as never, { camera: () => ({ position: { x: 0, y: 0, z: 0 } }) } as never);
    expect(runner.decalSlots()).toBeGreaterThanOrEqual(need);
    (runner as unknown as { decals: number }).decals = 6;
    expect(runner.decalSlots()).toBe(0);
    expect(runner.decalSlots() < need).toBe(true);
    (runner as unknown as { decals: number }).decals = 6 - need;
    expect(runner.decalSlots()).toBe(need);
  });
  it('hệ số cỡ có kẹp', () => {
    expect(hazardMul(100, 4)).toBe(4);
    expect(hazardMul(0.1, 4)).toBe(0.5);
    expect(monScale(0.1)).toBe(0.7);
    expect(monScale(20)).toBe(3);
  });
});

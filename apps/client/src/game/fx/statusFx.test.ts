import { describe, expect, it } from 'vitest';
import { FX_TIMELINE } from '@dtl/content';
import { MF_BURN, MF_DAZED, MF_POISON, MF_SLOW, MF_STUN, PF_DEAD, PF_HOT } from '@dtl/shared';
import { FX_PALETTE } from '../../render/vfx/palette';
import { STATUS_DEF, monStatusOf, playerStatusOf, type StatusKind } from './statusFx';

describe('hình trạng thái kéo dài (HPL2 PR2)', () => {
  it('ưu tiên: choáng > bỏng > độc > chậm', () => {
    expect(monStatusOf(MF_SLOW | MF_POISON | MF_BURN | MF_DAZED)).toBe('stun');
    expect(monStatusOf(MF_SLOW | MF_POISON | MF_BURN)).toBe('burn');
    expect(monStatusOf(MF_SLOW | MF_POISON)).toBe('poison');
    expect(monStatusOf(MF_SLOW)).toBe('slow');
    expect(monStatusOf(0)).toBeUndefined();
  });
  it('MF_STUN (khựng của đòn nặng) không vẽ choáng, không che bỏng/độc/chậm', () => {
    expect(monStatusOf(MF_STUN)).toBeUndefined();
    expect(monStatusOf(MF_STUN | MF_BURN)).toBe('burn');
  });
  it('hồi dần chỉ vẽ khi còn sống', () => {
    expect(playerStatusOf(PF_HOT)).toBe('hot');
    expect(playerStatusOf(PF_HOT | PF_DEAD)).toBeUndefined();
    expect(playerStatusOf(0)).toBeUndefined();
  });
  it('mỗi trạng thái có timeline fx_st_* và bảng màu', () => {
    for (const k of Object.keys(STATUS_DEF) as StatusKind[]) {
      const d = STATUS_DEF[k];
      expect(FX_TIMELINE.get(d.key), k).toBeTruthy();
      expect(FX_PALETTE[d.pal], d.pal).toBeTruthy();
      expect(d.period).toBeGreaterThan(0.5);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { SKILL } from '@dtl/content';
import { PF_DEAD, PF_FLYING, PF_MEDITATING } from '@dtl/shared';
import {
  auraCaps,
  auraStage,
  AURA_COMBAT_SEC,
  danBeat,
  daoOf,
  haloVisibility,
  isCalm,
  phantomPhase,
  PHANTOM_DUR,
  qualityTier,
  summonsPhantom,
  swordCount,
} from './realmAuraRules';

describe('realmAuraRules', () => {
  it('stage theo mốc cảnh giới', () => {
    expect([15, 16, 19, 20, 23, 24, 27, 28, 31, 32].map(auraStage)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4]);
  });
  it('đạo theo công pháp', () => {
    expect(daoOf('lac_kiem_quyet')).toBe('kiem');
    expect(daoOf('bat_dong_kim_than')).toBe('ho');
    expect(daoOf('thanh_moc_dan_kinh')).toBe('dan');
    expect(daoOf('')).toBe('kiem');
    expect(daoOf(undefined)).toBe('kiem');
  });
  it('phi kiếm 3 → 9', () => {
    expect(swordCount(24)).toBe(3);
    expect(swordCount(28)).toBe(6);
    expect(swordCount(32)).toBe(9);
    expect(swordCount(40)).toBe(9);
  });
  it('trần theo chất lượng: Thấp tắt cho người khác, giảm cho mình', () => {
    expect(qualityTier('high', 'low')).toBe(0);
    expect(qualityTier('medium', 'high')).toBe(1);
    expect(qualityTier('ultra', 'high')).toBe(2);
    expect(auraCaps(0, false)).toMatchObject({ main: false, particles: false, phantom: false });
    expect(auraCaps(0, true)).toMatchObject({ main: true, particles: false, orbitScale: 0.5, phantom: false });
    expect(auraCaps(1, false)).toMatchObject({ particles: false, orbitScale: 0.5 });
    expect(auraCaps(2, false).particleScale).toBe(0.5);
    expect(auraCaps(2, true).particleScale).toBe(1);
  });
  it('tắt khi ngự kiếm, mờ khi chiến đấu', () => {
    expect(haloVisibility({ fl: PF_FLYING, sinceCast: 99, speed: 0 })).toBe(0);
    expect(haloVisibility({ fl: PF_DEAD, sinceCast: 99, speed: 0 })).toBe(0);
    expect(haloVisibility({ fl: 0, sinceCast: AURA_COMBAT_SEC - 0.1, speed: 0 })).toBeLessThan(0.5);
    expect(haloVisibility({ fl: 0, sinceCast: 99, speed: 5 })).toBe(1);
  });
  it('lặng: đứng yên hoặc đả tọa, không khi bay/chết', () => {
    expect(isCalm({ fl: 0, sinceCast: 0, speed: 0.1 })).toBe(true);
    expect(isCalm({ fl: 0, sinceCast: 0, speed: 4 })).toBe(false);
    expect(isCalm({ fl: PF_MEDITATING, sinceCast: 0, speed: 4 })).toBe(true);
    expect(isCalm({ fl: PF_FLYING, sinceCast: 0, speed: 0 })).toBe(false);
  });
  it('nhịp kim đan trong 0..1', () => {
    for (let t = 0; t < 3; t += 0.05) (expect(danBeat(t)).toBeGreaterThanOrEqual(0), expect(danBeat(t)).toBeLessThanOrEqual(1));
  });
  it('pháp tướng chỉ từ Hóa Thần với chiêu tối thượng / chiêu mở ở 28', () => {
    const ult = SKILL.get('skl_van_kiem_quy_tong');
    const cap = SKILL.get('skl_thien_kiem_hoa_hinh');
    const normal = SKILL.get('skl_phi_kiem_truy_hon');
    expect(summonsPhantom(ult, 28)).toBe(true);
    expect(summonsPhantom(ult, 27)).toBe(false);
    expect(summonsPhantom(cap, 28)).toBe(true);
    expect(summonsPhantom(normal, 32)).toBe(false);
    expect(summonsPhantom(undefined, 32)).toBe(false);
  });
  it('vòng đời pháp tướng ngắn và tan hết', () => {
    expect(PHANTOM_DUR).toBeLessThanOrEqual(1.5);
    expect(phantomPhase(0).reveal).toBe(0);
    expect(phantomPhase(0.5).erode).toBe(0);
    expect(phantomPhase(PHANTOM_DUR).erode).toBeGreaterThan(1);
  });
});

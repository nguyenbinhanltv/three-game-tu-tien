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
  auraWeights,
  otherAuraLevel,
  OTHERS_MAIN_DIST,
  OTHERS_OFF_DIST,
  phantomAnchor,
  roleAllowed,
  settledTarget,
  SETTLE_SEC,
  W_BG,
  W_MAIN_ACTIVE,
  W_SUB,
  W_SUB_FULL,
  W_BG_FULL,
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
  it('đủ 9 phi kiếm từ Nguyên Anh', () => {
    expect(swordCount(23)).toBe(0);
    expect(swordCount(24)).toBe(9);
    expect(swordCount(32)).toBe(9);
  });
  it('trần theo chất lượng: Thấp tắt cho người khác, giảm cho mình', () => {
    expect(qualityTier('high', 'low')).toBe(0);
    expect(qualityTier('medium', 'high')).toBe(1);
    expect(qualityTier('ultra', 'high')).toBe(2);
    expect(auraCaps(0, false)).toMatchObject({ main: false, particles: false, phantom: false });
    expect(auraCaps(0, true)).toMatchObject({ main: true, detail: false, particles: false, orbitScale: 0.55, phantom: false });
    expect(auraCaps(1, false)).toMatchObject({ particles: false, orbitScale: 0.55, detail: false });
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

  describe('VS-0 thứ bậc thị giác', () => {
    const idle = { combat: 'dim', moving: false, fighting: false, settle: 1 } as const;
    it('vai nào được dựng ở chế độ nào', () => {
      expect(roleAllowed('main', 'off')).toBe(false);
      expect(roleAllowed('main', 'min')).toBe(true);
      expect(roleAllowed('sub', 'min')).toBe(false);
      expect(roleAllowed('sub', 'std')).toBe(true);
      expect(roleAllowed('extra', 'std')).toBe(false);
      expect(roleAllowed('extra', 'full')).toBe(true);
      expect(roleAllowed('event', 'min')).toBe(false);
      expect(roleAllowed('event', 'std')).toBe(true);
    });
    it('Chuẩn: yên đủ lâu thì chính 1, phụ ≤ 0,5, nền ≤ 0,2', () => {
      const w = auraWeights({ mode: 'std', ...idle });
      expect(w.main).toBe(1);
      expect(w.sub).toBeLessThanOrEqual(0.5);
      expect(w.bg).toBeLessThanOrEqual(0.2);
      expect(w).toEqual({ main: 1, sub: W_SUB, bg: W_BG });
    });
    it('chạy hoặc chiến đấu: chỉ lớp chính, 30–50%', () => {
      for (const st of [
        { moving: true, fighting: false },
        { moving: false, fighting: true },
      ]) {
        const w = auraWeights({ mode: 'std', combat: 'dim', settle: 0, ...st });
        expect(w.main).toBe(W_MAIN_ACTIVE);
        expect(w.main).toBeGreaterThanOrEqual(0.3);
        expect(w.main).toBeLessThanOrEqual(0.5);
        expect(w.sub).toBe(0);
        expect(w.bg).toBe(0);
      }
    });
    it('"Khi chiến đấu: Giữ" không làm mờ lớp chính lúc giao chiến (vẫn mờ khi chạy)', () => {
      expect(auraWeights({ mode: 'std', combat: 'keep', moving: false, fighting: true, settle: 0 }).main).toBe(1);
      expect(auraWeights({ mode: 'std', combat: 'keep', moving: true, fighting: false, settle: 0 }).main).toBe(W_MAIN_ACTIVE);
    });
    it('Tối giản chỉ lớp chính; Tắt không gì; Đầy đủ nới trần phụ/nền', () => {
      expect(auraWeights({ mode: 'min', ...idle })).toEqual({ main: 0.6, sub: 0, bg: 0 });
      expect(auraWeights({ mode: 'off', ...idle })).toEqual({ main: 0, sub: 0, bg: 0 });
      expect(auraWeights({ mode: 'full', ...idle })).toEqual({ main: 1, sub: W_SUB_FULL, bg: W_BG_FULL });
    });
    it('lớp phụ mở dần theo mức đã yên', () => {
      expect(auraWeights({ mode: 'std', ...idle, settle: 0.5 }).sub).toBeCloseTo(W_SUB / 2);
    });
    it('đứng yên 3 s hoặc đả tọa thì coi là đã yên', () => {
      expect(settledTarget(SETTLE_SEC - 0.1, false)).toBe(0);
      expect(settledTarget(SETTLE_SEC, false)).toBe(1);
      expect(settledTarget(0, true)).toBe(1);
    });
    it('người khác: Tắt/Chỉ tổ đội/Gần theo khoảng cách', () => {
      const L = otherAuraLevel;
      expect(L('off', 3, true, true, 45)).toBe('none');
      expect(L('party', 3, false, true, 45)).toBe('none');
      expect(L('party', 3, true, true, 45)).toBe('full');
      expect(L('near', OTHERS_MAIN_DIST, false, true, 45)).toBe('full');
      expect(L('near', OTHERS_MAIN_DIST + 1, false, true, 45)).toBe('main');
      expect(L('near', OTHERS_OFF_DIST + 1, false, true, 45)).toBe('none');
      expect(L('near', 5, false, false, 45)).toBe('main');
    });
    it('đồng đội giữ lớp chính tới hết tầm hiệu ứng', () => {
      expect(otherAuraLevel('near', 40, true, false, 45)).toBe('main');
      expect(otherAuraLevel('near', 46, true, false, 45)).toBe('none');
    });
    it('pháp tướng lệch khỏi trục camera → nhân vật', () => {
      for (const sign of [1, -1]) {
        const o = phantomAnchor(0, 1, sign); // camera nhìn dọc +z
        expect(Math.abs(o.x)).toBeGreaterThan(2.5); // lệch ngang đủ xa
      }
      expect(phantomAnchor(0, 1, 1).x).toBe(-phantomAnchor(0, 1, -1).x);
    });
    it('pháp tướng sống ≤ 1,3 s', () => {
      expect(PHANTOM_DUR).toBeLessThanOrEqual(1.3);
      expect(phantomPhase(PHANTOM_DUR).alpha).toBeGreaterThan(0);
    });
  });
});

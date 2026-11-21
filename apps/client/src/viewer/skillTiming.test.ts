import { describe, expect, it } from 'vitest';
import { GCD } from '@dtl/shared';
import { isSkillViewer, showAssetId } from '../game/core/testParams';
import { MAX_HOLD } from '../game/combat/skillPose';
import { allSkillTimings, skillForId } from './skillTiming';

describe('bảng thời gian chiêu (K-1)', () => {
  const rows = allSkillTimings();

  it('đủ 43 chiêu có pose: 6 gốc + 6 công pháp + 19 chiêu bậc 2–3 (E2-G, trừ 2 chiêu lướt không có pose) + 12 chiêu tư thế (VS-2e)', () => {
    expect(rows).toHaveLength(43);
    expect(rows.filter((r) => r.method === '')).toHaveLength(6);
  });

  it('khung vung nằm trong clip và clip không dài quá GCD', () => {
    for (const r of rows) {
      expect(r.hit[0]).toBeGreaterThan(0);
      expect(r.hit[1]).toBeGreaterThanOrEqual(r.hit[0]);
      expect(r.hit[1]).toBeLessThanOrEqual(r.duration);
      expect(r.duration).toBeLessThanOrEqual(GCD);
      expect(r.recovery).toBeCloseTo(r.duration - r.hit[1], 6);
    }
  });

  it('chiêu ngay: hiệu ứng trễ tối đa MAX_HOLD; chiêu niệm: hình ra đòn trùng lúc server áp', () => {
    for (const r of rows) {
      if (r.cast > 0) expect(r.gap).toBeCloseTo(0, 6);
      else expect(r.fxAt).toBeLessThanOrEqual(MAX_HOLD + 1e-9);
    }
  });

  it('?id nhận id chiêu hoặc id pose', () => {
    expect(skillForId('skl_kiem_khi_tram')?.pose).toBe('kiem_khi_tram');
    expect(skillForId('kiem_khi_tram')?.id).toBe('skl_kiem_khi_tram');
    expect(skillForId('khong_co')).toBeUndefined();
  });

  it('?show=skill là trang xem chiêu, không phải id asset', () => {
    expect(isSkillViewer('?show=skill&id=x')).toBe(true);
    expect(showAssetId('?show=skill')).toBeNull();
  });
});

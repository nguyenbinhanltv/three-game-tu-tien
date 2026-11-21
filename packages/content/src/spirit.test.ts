import { describe, expect, it } from 'vitest';
import { BONDED_ARTIFACT_ID, BONDED_UNLOCK_LEVEL, SPIRIT_UNLOCK_LEVEL, spiritRadius, spiritUnlocked } from '@dtl/shared';
import { ARTIFACT, METHODS, skillBar, thanThongSkill, tierBar } from './index';

describe('E2-E: thần thức, ô chiêu 9, bản mệnh pháp bảo', () => {
  it('phạm vi thần thức theo cảnh giới: 60 / 80 / 120 m, ngọc cộng thêm', () => {
    expect(spiritUnlocked(SPIRIT_UNLOCK_LEVEL - 1)).toBe(false);
    expect([20, 21, 22, 23, 27, 28].map((l) => spiritRadius(l))).toEqual([60, 80, 80, 80, 80, 120]);
    expect(spiritRadius(20, 3)).toBe(63);
  });

  it('mỗi công pháp có đúng một thần thông ô 9 mở ở cấp 20, không lẫn trong hàng bậc cao', () => {
    for (const m of METHODS) {
      const tt = thanThongSkill(m.id);
      expect(tt?.unlock).toBe(20);
      expect(tierBar(m.id).includes(tt!)).toBe(false);
      expect(skillBar(m.id)).toHaveLength(8);
    }
    expect(thanThongSkill(undefined)).toBeUndefined();
  });

  it('hàng bậc cao còn 16, 18, 22, 24, 26 theo thứ tự (không gồm 20)', () => {
    // VS-2d: hàng bậc cao là chiêu mốc 16 và 24; chưa chọn nhánh thì hiện cả hai chiêu mỗi mốc, chọn rồi chỉ còn chiêu của nhánh.
    for (const m of METHODS) {
      expect(tierBar(m.id).map((s) => s.unlock)).toEqual([16, 16, 24, 24]);
      const picks = { 16: m.branches.find((b) => b.tier === 16)!.id, 24: m.branches.find((b) => b.tier === 24)!.id };
      expect(tierBar(m.id, picks).map((s) => s.unlock)).toEqual([16, 24]);
      // Ô 9 theo nhánh mốc 20 đã chọn.
      const b20 = m.branches.filter((b) => b.tier === 20);
      for (const b of b20) expect(b.grants).toContain(thanThongSkill(m.id, { 20: b.id })!.id);
    }
  });

  it('Ngưng Đan Lô là bản mệnh, mở ở cấp Kết Đan', () => {
    const lo = ARTIFACT.get(BONDED_ARTIFACT_ID)!;
    expect(lo.bonded).toBe(true);
    expect(lo.kind).toBe('heal');
    expect(BONDED_UNLOCK_LEVEL).toBe(SPIRIT_UNLOCK_LEVEL);
  });
});

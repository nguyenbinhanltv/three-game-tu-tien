import { describe, expect, it } from 'vitest';
import { BRANCH_TIERS } from '@dtl/shared';
import { hasString, METHODS, SKILL } from '@dtl/content';
import { branchState } from './branchState';

describe('cây nhánh công pháp (VS-2d)', () => {
  const m = METHODS.find((x) => x.id === 'lac_kiem_quyet')!;
  const [a, b] = m.branches.filter((x) => x.tier === 16);
  it('chưa đủ cảnh giới thì khóa; đủ thì chọn được; chọn rồi thì nhánh kia mờ', () => {
    expect(branchState(m, undefined, a!, 15)).toBe('locked');
    expect(branchState(m, undefined, a!, 16)).toBe('open');
    expect(branchState(m, { 16: a!.id }, a!, 16)).toBe('picked');
    expect(branchState(m, { 16: a!.id }, b!, 16)).toBe('other');
  });
  it('lựa chọn lạ (nhánh đã gỡ khỏi dữ liệu) coi như chưa chọn', () => {
    expect(branchState(m, { 16: 'khong_co' }, a!, 20)).toBe('open');
  });
  it('mỗi công pháp tối đa bốn mốc, mốc đã làm có hai nhánh, có đủ tên, mô tả và chiêu hiển thị được', () => {
    for (const md of METHODS) {
      for (const t of BRANCH_TIERS)
        // TN-2: công pháp mới có thể chưa làm tới mốc cao (0 nhánh); mốc đã làm thì đúng hai nhánh.
        expect([0, 2], `${md.id} ${t}`).toContain(md.branches.filter((x) => x.tier === t).length);
      expect(
        md.branches.filter((x) => x.tier === BRANCH_TIERS[0]),
        md.id,
      ).toHaveLength(2);
      for (const br of md.branches) {
        expect(hasString(`branch.${md.id}.${br.id}.name`), br.id).toBe(true);
        expect(hasString(`branch.${md.id}.${br.id}.desc`), br.id).toBe(true);
        for (const g of br.grants) expect(SKILL.get(g)?.unlock, g).toBe(br.tier);
      }
    }
  });
});

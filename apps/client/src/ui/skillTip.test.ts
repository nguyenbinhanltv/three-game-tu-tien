import { describe, expect, it } from 'vitest';
import { resolveSkill } from '@dtl/shared';
import { SKILL } from '@dtl/content';
import { branchOfSkill, hitDamages, skillShape, skillStatLines } from './skillTip';

const get = (id: string) => SKILL.get(id)!;

describe('chú giải chiêu', () => {
  it('hình vùng theo loại chiêu', () => {
    expect(skillShape(get('skl_phi_kiem_truy_hon'))).toEqual({ k: 'single', range: 26 });
    expect(skillShape(get('skl_van_kiem_quy_tong'))).toMatchObject({ k: 'circle', r: 10 });
    expect(skillShape(get('skl_hoanh_kiem_pha_mach'))).toEqual({ k: 'line', len: 12, width: 3 });
    expect(skillShape(get('skl_kiem_anh_bo'))).toMatchObject({ k: 'dash', dist: 8 });
    expect(skillShape(get('skl_hoi_xuan_quyet'))).toBeNull();
  });
  it('sát thương ước tính = công × hệ số', () => {
    const sk = get('skl_phi_kiem_truy_hon');
    const rs = resolveSkill(sk, 1, undefined, undefined);
    expect(hitDamages(rs, 100)).toEqual([Math.round(100 * rs.hits[0]!)]);
  });
  it('dòng chỉ số có sát thương, tầm, vùng', () => {
    const sk = get('skl_van_kiem_quy_tong');
    const rs = resolveSkill(sk, 1, undefined, undefined);
    const lines = skillStatLines(sk, rs, 200);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]!.tone).toBe('good');
  });
  it('nhánh cấp chiêu', () => {
    expect(branchOfSkill(get('skl_hoanh_kiem_pha_mach'))).toEqual({ m: 'lac_kiem_quyet', b: 'pha_mach' });
    expect(branchOfSkill(get('skl_phi_kiem_truy_hon'))).toBeNull();
  });
});

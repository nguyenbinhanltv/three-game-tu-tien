import { describe, expect, it } from 'vitest';
import { jointAllowed, jointErrors, jointKey, type JointDef, type MarkDef } from './index';

const MARKS = new Map<string, MarkDef>([
  ['mat_the', { id: 'mat_the', on: 'mon', max: 1, dur: 5, color: 'ff8a5a' }],
  ['moc_an', { id: 'moc_an', on: 'ally', max: 1, dur: 10, color: '7dffa0' }],
]);
const PHA: JointDef = { id: 'pha_the_tram', mark: 'mat_the', finisher: 'spend', powerMul: 1.5, charge: 20, cd: 6 };
const KET: JointDef = { id: 'moc_an_ket', mark: 'moc_an', finisher: 'kill_or_ult', healPct: 0.08, r: 12, res: 20, cd: 6 };

describe('hợp kích tổ đội (VS-2f)', () => {
  it('chỉ nổ giữa hai người khác nhau, cùng tổ đội, khi cặp đã hết hồi nội bộ', () => {
    const base = { openerId: 1, finisherId: 2, sameParty: true, readyAt: undefined, nowMs: 1000 };
    expect(jointAllowed(base)).toBe(true);
    expect(jointAllowed({ ...base, finisherId: 1 })).toBe(false);
    expect(jointAllowed({ ...base, sameParty: false })).toBe(false);
    expect(jointAllowed({ ...base, readyAt: 1001 })).toBe(false);
    expect(jointAllowed({ ...base, readyAt: 1000 })).toBe(true);
  });
  it('khóa hồi nội bộ phân biệt chiều mở → kết', () => {
    expect(jointKey('x', 1, 2)).not.toBe(jointKey('x', 2, 1));
  });
  it('kiểm dữ liệu', () => {
    expect(jointErrors([PHA, KET], MARKS)).toEqual([]);
    const bad = (d: Partial<JointDef>, base = PHA) => jointErrors([{ ...base, ...d }], MARKS).join(' | ');
    expect(bad({ mark: 'kiem_an' })).toMatch(/không phải ấn/);
    expect(bad({ mark: 'moc_an' })).toMatch(/cần ấn trên quái/);
    expect(bad({ mark: 'mat_the' }, KET)).toMatch(/cần ấn trên đạo hữu/);
    expect(bad({ cd: 1 })).toMatch(/cd 3–60/);
    expect(bad({ powerMul: 3 })).toMatch(/powerMul trong/);
    expect(bad({ powerMul: 1.5 }, KET)).toMatch(/chỉ dùng với finisher spend/);
    expect(bad({ r: undefined }, KET)).toMatch(/healPct cần r/);
    expect(bad({ powerMul: undefined, charge: undefined })).toMatch(/không có thưởng/);
    expect(jointErrors([PHA, { ...PHA, id: 'khac' }], MARKS).join()).toMatch(/đã mở một hợp kích khác/);
    expect(jointErrors([PHA, PHA], MARKS).join()).toMatch(/trùng id/);
  });
});

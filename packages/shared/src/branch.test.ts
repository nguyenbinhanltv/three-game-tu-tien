import { describe, expect, it } from 'vitest';
import {
  branchErrors,
  branchMods,
  branchResetCost,
  branchesAt,
  pendingTier,
  pickBlock,
  pickedBranch,
  sanitizePicks,
  skillGate,
  skillTier,
  type BranchDef,
} from './index';

const BR: BranchDef[] = [
  { id: 'a16', tier: 16, grants: ['s16a'] },
  { id: 'b16', tier: 16, grants: ['s16b'] },
  { id: 'a20', tier: 20, grants: ['s20a'] },
  { id: 'b20', tier: 20, grants: ['s20b'] },
  { id: 'a24', tier: 24, grants: ['s24a'] },
  { id: 'b24', tier: 24, grants: ['s24b'], mods: { markDurMul: 1.5 } },
  { id: 'a28', tier: 28, grants: ['s28'], mods: { res: { max: 2 } } },
  { id: 'b28', tier: 28, grants: ['s28'], mods: { res: { keep: 2, gainMul: 1.3 } } },
];
const M = { id: 'm', sig: 'sig', ult: 'ult', dash: 'dash', branches: BR };
const SKILLS = [
  ...['s16a', 's16b'].map((id) => ({ id, method: 'm', unlock: 16 })),
  ...['s20a', 's20b'].map((id) => ({ id, method: 'm', unlock: 20 })),
  ...['s24a', 's24b'].map((id) => ({ id, method: 'm', unlock: 24 })),
  { id: 's28', method: 'm', unlock: 28 },
  { id: 'sig', method: 'm', unlock: 5 },
  { id: 'ult', method: 'm', unlock: 8 },
  { id: 'dash', method: 'm', unlock: 5 },
];

describe('nhánh công pháp (VS-2d)', () => {
  it('tra nhánh theo mốc; lựa chọn lạ coi như chưa chọn', () => {
    expect(branchesAt(M, 16).map((b) => b.id)).toEqual(['a16', 'b16']);
    expect(pickedBranch(M, { 16: 'a16' }, 16)?.id).toBe('a16');
    expect(pickedBranch(M, { 16: 'zz' }, 16)).toBeUndefined();
    expect(pickedBranch(M, undefined, 16)).toBeUndefined();
    expect(skillTier(M, 's20b')).toBe(20);
    expect(skillTier(M, 'sig')).toBe(0);
  });
  it('chặn chiêu: chưa chọn → need, chọn nhánh khác → other, chiêu không gắn nhánh và chiêu mốc 28 dùng chung → ok', () => {
    expect(skillGate(M, undefined, 's16a')).toBe('need');
    expect(skillGate(M, { 16: 'a16' }, 's16a')).toBe('ok');
    expect(skillGate(M, { 16: 'a16' }, 's16b')).toBe('other');
    expect(skillGate(M, {}, 'sig')).toBe('ok');
    expect(skillGate(M, { 28: 'a28' }, 's28')).toBe('ok');
    expect(skillGate(M, { 28: 'b28' }, 's28')).toBe('ok');
    expect(skillGate(M, {}, 's28')).toBe('need');
    expect(skillGate(undefined, {}, 's16a')).toBe('ok');
  });
  it('điều kiện chọn: đủ cảnh giới, đúng mốc, đúng nhánh, mốc chưa chọn', () => {
    expect(pickBlock(M, {}, 16, 'a16', 16)).toBeNull();
    expect(pickBlock(M, {}, 16, 'a16', 15)).toBe('level');
    expect(pickBlock(M, {}, 17, 'a16', 30)).toBe('tier');
    expect(pickBlock(M, {}, '16', 'a16', 30)).toBe('tier');
    expect(pickBlock(M, {}, 16, 'a20', 30)).toBe('branch');
    expect(pickBlock(M, {}, 16, 7, 30)).toBe('branch');
    expect(pickBlock(M, {}, 16, '__proto__', 30)).toBe('branch');
    expect(pickBlock(M, { 16: 'b16' }, 16, 'a16', 30)).toBe('taken');
    expect(pickBlock(undefined, {}, 16, 'a16', 30)).toBe('method');
  });
  it('mốc còn chờ chọn: thấp nhất đã đủ cảnh giới', () => {
    expect(pendingTier(M, {}, 15)).toBe(0);
    expect(pendingTier(M, {}, 21)).toBe(16);
    expect(pendingTier(M, { 16: 'a16' }, 21)).toBe(20);
    expect(pendingTier(M, { 16: 'a16', 20: 'b20' }, 21)).toBe(0);
    expect(pendingTier(undefined, {}, 30)).toBe(0);
  });
  it('gộp luật riêng; mốc chưa đủ cảnh giới không tính', () => {
    expect(branchMods(M, { 28: 'a28' }, 28)).toEqual({ res: { max: 2 } });
    expect(branchMods(M, { 28: 'a28' }, 27)).toEqual({});
    expect(branchMods(M, { 24: 'b24', 28: 'b28' }, 30)).toEqual({ res: { keep: 2, gainMul: 1.3 }, markDurMul: 1.5 });
    expect(branchMods(M, undefined, 30)).toEqual({});
  });
  it('làm sạch lựa chọn đọc từ DB', () => {
    expect(sanitizePicks(M, { 16: 'a16', 20: 'zz', 99: 'a16', 24: 5 })).toEqual({ 16: 'a16' });
    expect(sanitizePicks(M, null)).toEqual({});
    expect(sanitizePicks(undefined, { 16: 'a16' })).toEqual({});
  });
  it('phí reset tăng theo cảnh giới', () => {
    expect(branchResetCost(16)).toBe(680);
    expect(branchResetCost(28)).toBeGreaterThan(branchResetCost(16));
  });
  it('kiểm dữ liệu cây nhánh', () => {
    expect(branchErrors(M, SKILLS)).toEqual([]);
    const no = (branches: BranchDef[], skills = SKILLS) => branchErrors({ ...M, branches }, skills).join(' | ');
    expect(no(BR.slice(1))).toMatch(/mốc 16 cần 2–3 nhánh/);
    expect(no([...BR, { id: 'a16', tier: 16, grants: ['s16a'] }])).toMatch(/trùng id/);
    expect(no([{ id: 'a16', tier: 16, grants: ['zz'] }, ...BR.slice(1)])).toMatch(/không phải chiêu của công pháp/);
    expect(no([{ id: 'a16', tier: 16, grants: ['s20a'] }, ...BR.slice(1)])).toMatch(/phải bằng mốc 16/);
    expect(no([{ id: 'a16', tier: 16, grants: ['sig'] }, ...BR.slice(1)])).toMatch(/không gắn nhánh/);
    expect(no([...BR.slice(0, 6), { id: 'a28', tier: 28, grants: ['s28'] }, { id: 'b28', tier: 28, grants: ['s28'] }])).toMatch(
      /giống hệt nhau/,
    );
    expect(no(BR, [...SKILLS, { id: 'le', method: 'm', unlock: 24 }])).toMatch(/không thuộc nhánh nào/);
    expect(no([{ id: 'A16', tier: 16, grants: ['s16a'] }, ...BR.slice(1)])).toMatch(/snake_case/);
  });
});

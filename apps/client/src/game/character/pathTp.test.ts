import { describe, expect, it } from 'vitest';
import { PATHS, POSE } from '@dtl/content';
import { isTpIdlePose, PATH_TP, tpIdleFor, tpPathOf } from './pathTp';

describe('PATH_TP: bảng Thân Pháp theo hướng tu', () => {
  it('Kiếm tu giữ nguyên hành vi TP-1 (khóa): idle xoay kiếm/chắp tay, pose _tp, nét kéo, lướt thấp, cut-in', () => {
    expect(PATH_TP.kiem_tu).toEqual({
      idle: { drawn: 'kiem_idle_xoay', free: 'kiem_idle_chap_tay' },
      poses: true,
      smear: true,
      glide: true,
      cutin: true,
    });
    expect(tpIdleFor('kiem_tu', true)).toBe('kiem_idle_xoay');
    expect(tpIdleFor('kiem_tu', false)).toBe('kiem_idle_chap_tay');
  });
  it('Thể tu: pose _tp và idle riêng, không nét kéo/lướt thấp/cut-in', () => {
    expect(PATH_TP.the_tu).toMatchObject({ poses: true, smear: false, glide: false, cutin: false });
    expect(tpIdleFor('the_tu', true)).toBe('the_idle_nen_quyen');
    expect(tpIdleFor('the_tu', false)).toBe('the_idle_van_vai');
  });
  it('tpPathOf: công pháp của hướng có dòng thì ra khóa hướng, hướng chưa có / khóa trống / lạ thì undefined', () => {
    for (const p of PATHS) for (const m of p.methods) expect(tpPathOf(m)).toBe(PATH_TP[p.id] ? p.id : undefined);
    expect(tpPathOf(undefined)).toBeUndefined();
    expect(tpPathOf('')).toBeUndefined();
    expect(tpPathOf('khong_co_cong_phap')).toBeUndefined();
    expect(tpIdleFor(undefined, true)).toBeUndefined();
    expect(tpIdleFor('dao_tu', false)).toBeUndefined();
  });
  it('mọi khóa PATH_TP là hướng thật; mọi pose idle có trong dữ liệu pose; isTpIdlePose đúng', () => {
    const ids = new Set(PATHS.map((p) => p.id));
    for (const [path, t] of Object.entries(PATH_TP)) {
      expect(ids.has(path), path).toBe(true);
      expect(POSE.has(t.idle.drawn), t.idle.drawn).toBe(true);
      expect(POSE.has(t.idle.free), t.idle.free).toBe(true);
      expect(isTpIdlePose(t.idle.drawn) && isTpIdlePose(t.idle.free)).toBe(true);
    }
    expect(isTpIdlePose('phi_kiem')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { COTHAN_METHOD, LOI_METHOD, PF_DEAD, PF_FLYING, PF_SOUL, PF_TRIBULATION } from '@dtl/shared';
import { PATH } from '@dtl/content';
import {
  bugOrbit,
  pathAuraCount,
  pathAuraHidden,
  pathAuraOf,
  pathAuraPalette,
  realmSuppressed,
  runeRadius,
  slashTilt,
  slashAngle,
  slashPhase,
  SLASH_ACTIVE,
  SLASH_PERIOD,
  PATH_AURA_BASE,
} from './pathAuraRules';
import { auraWeights } from './realmAuraRules';

const DAO = 'liet_nhan_dao_kinh';
const CO = 'duong_co_kinh';
const CAM = 'cam_che_kinh';

describe('hào quang riêng của Đao tu / Cổ tu / Cấm chế sư', () => {
  it('chỉ ba hướng này có lớp riêng; hướng khác và chưa chọn công pháp thì không', () => {
    expect(pathAuraOf(DAO)).toBe('dao');
    expect(pathAuraOf(CO)).toBe('co');
    expect(pathAuraOf(CAM)).toBe('cam');
    for (const mt of [
      'lac_kiem_quyet',
      'bat_dong_kim_than',
      'thanh_moc_dan_kinh',
      'dan_hon_kinh',
      COTHAN_METHOD,
      LOI_METHOD,
      '',
      undefined,
    ])
      expect(pathAuraOf(mt), String(mt)).toBeNull();
  });
  it('lớp hướng thay hào quang cảnh giới (không vẽ chồng hai hệ); cờ ?pathaura=0 trả về như cũ; hướng khác không đổi', () => {
    for (const mt of [DAO, CO, CAM]) {
      expect(realmSuppressed(mt, true), mt).toBe(true);
      expect(realmSuppressed(mt, false), mt).toBe(false);
    }
    expect(realmSuppressed('lac_kiem_quyet', true)).toBe(false);
    expect(realmSuppressed(undefined, true)).toBe(false);
  });
  it('màu lấy từ bảng màu hướng tu trong paths.json', () => {
    for (const [mt, id] of [
      [DAO, 'dao_tu'],
      [CO, 'co_tu'],
      [CAM, 'cam_che_su'],
    ] as const) {
      const pal = PATH.get(id)!.palette;
      const p = pathAuraPalette(mt)!;
      expect(p.body).toBe(Number.parseInt(pal.body, 16));
      expect(p.rim).toBe(Number.parseInt(pal.rim, 16));
    }
    expect(pathAuraPalette('lac_kiem_quyet')).toBeNull();
  });
  it('MỘT lớp nhẹ: số phần tử ít, tăng chậm theo cảnh giới, Cấm chế sư luôn đúng một vòng văn trận', () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      expect(pathAuraCount('dao', stage)).toBeGreaterThanOrEqual(2);
      expect(pathAuraCount('dao', stage)).toBeLessThanOrEqual(3);
      expect(pathAuraCount('co', stage)).toBeGreaterThanOrEqual(3);
      expect(pathAuraCount('co', stage)).toBeLessThanOrEqual(5);
      expect(pathAuraCount('cam', stage)).toBe(1);
    }
    expect(pathAuraCount('co', 4)).toBeGreaterThan(pathAuraCount('co', 0));
    expect(runeRadius(4)).toBeGreaterThan(runeRadius(0));
    expect(runeRadius(4)).toBeLessThan(2.3); // không phủ rộng như trận đứng thật (r ≥ 5)
  });
  it('độ sáng gốc không quá 1 và chạy/giao chiến làm mờ còn 40%; chế độ Tắt tắt hẳn, Tối giản ≤ 60%', () => {
    for (const k of ['dao', 'co', 'cam'] as const) expect(PATH_AURA_BASE[k]).toBeLessThanOrEqual(1);
    const w = (mode: 'off' | 'min' | 'std' | 'full', moving: boolean, fighting: boolean) =>
      auraWeights({ mode, combat: 'dim', moving, fighting, settle: 1 }).main;
    expect(w('std', false, false)).toBe(1);
    expect(w('std', true, false)).toBeCloseTo(0.4, 5);
    expect(w('std', false, true)).toBeCloseTo(0.4, 5);
    expect(w('off', false, false)).toBe(0);
    expect(w('min', false, false)).toBeLessThanOrEqual(0.6);
  });
  it('ẩn khi hóa hình, chết, ngự kiếm, độ kiếp, xuất khiếu; bình thường thì hiện', () => {
    expect(pathAuraHidden(0, 0)).toBe(false);
    expect(pathAuraHidden(0, undefined)).toBe(false);
    expect(pathAuraHidden(0, 0.01)).toBe(false);
    expect(pathAuraHidden(0, 0.5)).toBe(true);
    for (const f of [PF_DEAD, PF_FLYING, PF_TRIBULATION, PF_SOUL]) expect(pathAuraHidden(f, 0), String(f)).toBe(true);
  });
  it('cổ trùng bay lượn: mỗi con một nhịp riêng, trong tầm 0,3–1,3 m quanh thân và cao 0,3–1,7 m (không lên che mặt/che camera)', () => {
    for (const n of [3, 4, 5]) {
      const seen = new Set<string>();
      for (let i = 0; i < n; i++) {
        for (let t = 0; t < 60; t += 0.37) {
          const o = bugOrbit(i, n, t);
          expect(o.r).toBeGreaterThan(0.3);
          expect(o.r).toBeLessThan(1.3);
          expect(o.y).toBeGreaterThan(0.3);
          expect(o.y).toBeLessThan(1.7);
        }
        seen.add(bugOrbit(i, n, 5).ang.toFixed(3));
      }
      expect(seen.size).toBe(n);
    }
  });
  it('vệt đao xen kẽ hai bên nghiêng ngược nhau (không thành vòng đều như phi kiếm)', () => {
    expect(Math.sign(slashTilt(0))).not.toBe(Math.sign(slashTilt(1)));
    expect(slashTilt(0)).toBe(slashTilt(2));
  });
});

describe('vệt đao theo nhịp (không khối cố định)', () => {
  it('mỗi vệt chỉ hiện một đoạn ngắn trong chu kỳ; các vệt lệch pha; không lúc nào hiện đủ mọi vệt', () => {
    let active = 0;
    let all = 0;
    let steps = 0;
    for (let t = 0; t < 26; t += 0.05) {
      const n = [0, 1].filter((i) => slashPhase(t, i, 2) >= 0).length;
      active += n > 0 ? 1 : 0;
      all += n === 2 ? 1 : 0;
      steps++;
    }
    expect(active / steps).toBeLessThan(0.5);
    expect(all).toBe(0);
    expect(slashPhase(0, 0, 2)).toBeGreaterThanOrEqual(0);
    expect(slashPhase(SLASH_ACTIVE + 0.1, 0, 2)).toBe(-1);
  });
  it('vệt quét một cung hẹp (< 1,3 rad) và mỗi chu kỳ xuất phát từ hướng khác', () => {
    const a0 = slashAngle(0, 2, 0, 0);
    expect(slashAngle(0, 2, 0, 1) - a0).toBeLessThan(1.3);
    expect(slashAngle(0, 2, SLASH_PERIOD, 0)).not.toBeCloseTo(a0, 3);
  });
});

describe('vệt đao không dịch chỗ giữa đường quét', () => {
  it('n = 2 và 3, mọi vệt: trong mỗi cửa sổ hiện, góc tăng đơn điệu và bước nhảy giữa hai khung < 0,2 rad', () => {
    for (const n of [2, 3]) {
      for (let i = 0; i < n; i++) {
        let prev: number | null = null;
        let prevCycle = -1;
        for (let t = 0; t < 60; t += 0.01) {
          const ph = slashPhase(t, i, n);
          if (ph < 0) {
            prev = null;
            continue;
          }
          const a = slashAngle(i, n, t, ph);
          if (prev !== null) {
            expect(a - prev, `n=${n} i=${i} t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
            expect(a - prev, `n=${n} i=${i} t=${t.toFixed(2)}`).toBeLessThan(0.2);
          }
          prev = a;
          prevCycle = Math.floor(t);
        }
        expect(prevCycle).toBeGreaterThan(0);
      }
    }
  });
});

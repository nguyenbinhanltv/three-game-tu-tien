import { describe, expect, it } from 'vitest';
import { playerBaseStats } from '@dtl/shared';
import { breakInfo, nextTrib } from './breakthrough';
import { charPower, elemRows, statRows } from './stats';

const base = (level: number) => {
  const b = playerBaseStats(level);
  return { mhp: b.hp, mmp: b.mp, atk: b.atk, def: b.def };
};

describe('bảng thuộc tính', () => {
  it('không trang bị, không linh căn: công toàn là gốc cảnh giới', () => {
    const rows = statRows(10, {}, '', base(10));
    const atk = rows.find((r) => r.id === 'atk')!;
    expect(atk.total).toBe(playerBaseStats(10).atk);
    expect(atk.sources).toEqual([{ src: 'base', v: playerBaseStats(10).atk }]);
  });

  it('có ba nhóm và đủ chỉ số', () => {
    const rows = statRows(5, {}, '', base(5));
    expect(new Set(rows.map((r) => r.group))).toEqual(new Set(['attack', 'defense', 'recovery']));
    expect(rows.map((r) => r.id)).toContain('cdr');
  });

  it('phần chênh giữa số server và số tính được thành nguồn "khác"', () => {
    const b = base(10);
    const atk = statRows(10, {}, '', { ...b, atk: b.atk + 50 }).find((r) => r.id === 'atk')!;
    expect(atk.sources.find((s) => s.src === 'other')?.v).toBe(50);
    expect(atk.total).toBe(b.atk + 50);
  });

  it('lực chiến tăng khi công tăng; ngũ hành đủ 5 hệ', () => {
    const b = base(10);
    expect(charPower(10, {}, '', { ...b, atk: b.atk + 10 })).toBeGreaterThan(charPower(10, {}, '', b));
    expect(elemRows(10, {}, '')).toHaveLength(5);
  });
});

describe('khối độ kiếp theo dữ liệu', () => {
  it('kiếp kế tiếp theo cấp, không riêng Trúc Cơ', () => {
    expect(nextTrib(3)?.id).toBe('truc_co');
    expect(nextTrib(15)?.id).toBe('truc_co');
    expect(nextTrib(16)?.id).toBe('ket_dan');
    expect(nextTrib(19)?.id).toBe('ket_dan');
    expect(nextTrib(20)?.id).toBe('nguyen_anh');
  });

  it('Kết Đan: cần vật phẩm của chính kiếp và tu vi đầy', () => {
    const c = { level: 19, bk: 19, xp: 100, xpNeed: 100 };
    const no = breakInfo(c, []);
    expect(no.def?.id).toBe('ket_dan');
    expect(no.item).toBe('itm_ket_dan_dich');
    expect(no.ready).toBe(false);
    expect(breakInfo(c, [{ id: 'itm_ket_dan_dich', n: 1 }]).ready).toBe(true);
    expect(breakInfo({ ...c, xp: 10 }, [{ id: 'itm_ket_dan_dich', n: 1 }]).ready).toBe(false);
    expect(breakInfo({ ...c, bk: 17 }, [{ id: 'itm_ket_dan_dich', n: 1 }]).bkOk).toBe(false);
  });

  it('Thiên Nhân Kiếp đã bật (E4-D) nhưng thiếu Hóa Thần Lộ thì chưa sẵn sàng', () => {
    const c = { level: 27, bk: 27, xp: 100, xpNeed: 100 };
    expect(breakInfo(c, []).enabled).toBe(true);
    expect(breakInfo(c, []).ready).toBe(false);
  });
});

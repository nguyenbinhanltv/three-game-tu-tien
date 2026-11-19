import { collisionOf, type Shape } from '@dtl/shared';
import { describe, expect, it } from 'vitest';
import { COLLIDER_LIB, INST_BY_LEVEL, propShapesOf } from './colliders';

describe('collider prop theo level (COL-1 / C-2)', () => {
  it('mọi level đã bake có hình được đăng ký theo levelId', () => {
    for (const level of ['van_lam', 'doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang']) {
      expect(collisionOf(level).size, level).toBeGreaterThan(50);
    }
    // Kiếm Trủng là level riêng (khóa theo levelId) nhưng cùng danh sách prop với Vân Lam.
    expect(collisionOf('kiem_trung').size).toBe(collisionOf('van_lam').size);
    expect(collisionOf('kiem_trung')).not.toBe(collisionOf('van_lam'));
  });

  it('mọi id prop trong file bake đều có mục trong lib (hình hoặc rỗng = đi xuyên có chủ ý)', () => {
    const missing = new Set<string>();
    for (const f of Object.values(INST_BY_LEVEL)) for (const id of f.ids) if (!(id in COLLIDER_LIB)) missing.add(id);
    expect([...missing], 'asset thiếu trong lib.json: chạy pnpm colliders:lib').toEqual([]);
  });

  it('áp x, z, yaw, tỉ lệ: trụ thân cây ở đúng chỗ, cao theo tỉ lệ', () => {
    const lib = { t: [{ k: 'cyl' as const, x: 1, z: 0, r: 1, y0: 0, y1: 10 }] };
    // propShapesOf đọc INST_BY_LEVEL; thử trực tiếp bằng một level giả.
    INST_BY_LEVEL.__t = { ids: ['t'], p: [[0, 100, 200, 5, Math.PI / 2, 2]] };
    const [s] = propShapesOf('__t', lib) as Shape[];
    delete INST_BY_LEVEL.__t;
    // yaw 90°: (lx=1,lz=0) → (cos, -sin) = (0, -1) nhân s=2 → x=100, z=198.
    expect(s).toMatchObject({ k: 'cyl', r: 2, y0: 5, y1: 25 });
    expect(s!.x).toBeCloseTo(100, 6);
    expect(s!.z).toBeCloseTo(198, 6);
  });
  it('Đoạn Mạch: mỗi cây phong có trụ thân chặn đi bộ, tán không có hình (COL-B)', () => {
    const f = INST_BY_LEVEL.doan_mach!;
    const k = f.ids.indexOf('x_maple_trunk');
    expect(k).toBeGreaterThanOrEqual(0);
    const rows = f.p.filter((r) => r[0] === k);
    expect(rows.length).toBeGreaterThan(150);
    const shapes = propShapesOf('doan_mach').filter((s) => s.tag === 'x_maple_trunk');
    expect(shapes.length).toBe(rows.length);
    for (const s of shapes) expect(s).toMatchObject({ k: 'cyl', fly: undefined });
    expect(shapes.some((s) => s.k === 'cyl' && s.r > 1.4)).toBe(true); // cây lớn điểm nhìn
  });
});

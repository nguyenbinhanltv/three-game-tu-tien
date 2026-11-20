import { collisionOf, type MoveCtx, type MoveState, type Shape, stepMove, terrainOf } from '@dtl/shared';
import { describe, expect, it } from 'vitest';
import { LEVELS } from './index';
import { COLLIDER_LIB, INST_BY_LEVEL, propShapesOf } from './colliders';

describe('collider prop theo level (COL-1 / C-2)', () => {
  it('mọi level đã bake có hình được đăng ký theo levelId', () => {
    for (const level of ['van_lam', 'doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang']) {
      expect(collisionOf(level).size, level).toBeGreaterThan(50);
    }
    // Kiếm Trủng là level riêng (khóa theo levelId): kiến trúc hang + kiếm cắm của riêng nó, không lẫn kiến trúc tông môn của Vân Lam.
    expect(collisionOf('kiem_trung').size).toBeGreaterThan(50);
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
  it('Vân Hải: mỗi cây vườn có trụ thân mảnh, ngự kiếm bay xuyên (COL-B)', () => {
    const f = INST_BY_LEVEL.van_hai!;
    const k = f.ids.indexOf('x_vh_trunk');
    expect(k).toBeGreaterThanOrEqual(0);
    const shapes = propShapesOf('van_hai').filter((s) => s.tag === 'x_vh_trunk');
    expect(shapes.length).toBe(f.p.filter((r) => r[0] === k).length);
    expect(shapes.length).toBeGreaterThan(1000);
    for (const s of shapes) expect(s).toMatchObject({ k: 'cyl', fly: 'pass' });
  });

  it('Bắc Hoang: cây chết, băng ven khe và cột tà trận có hình; Sân Nhật Thực Kiếp chỉ có cây chết (client chỉ vẽ BhWonders ở bac_hoang) (COL-C)', () => {
    const count = (level: string): Map<string, number> => {
      const tags = new Map<string, number>();
      for (const s of propShapesOf(level)) tags.set(s.tag ?? '', (tags.get(s.tag ?? '') ?? 0) + 1);
      return tags;
    };
    const bh = count('bac_hoang');
    expect(bh.get('x_bh_dead_tree')).toBeGreaterThan(100);
    expect(bh.get('x_bh_ice')).toBeGreaterThan(10);
    expect(bh.get('x_bh_pillar')).toBe(12); // 6 cột × (đế + thân)
    const dk = count('do_kiep_bac_hoang');
    expect(dk.get('x_bh_dead_tree')).toBe(bh.get('x_bh_dead_tree'));
    expect(dk.get('x_bh_ice')).toBeUndefined();
    expect(dk.get('x_bh_pillar')).toBeUndefined();
  });
});

describe('vòng va chạm Vân Lam không rò sang bí cảnh dùng chung địa hình', () => {
  const stuck = (level: string, x: number, z: number): boolean => {
    const g = terrainOf(level).groundAt(x, z);
    const s: MoveState = { x: x - 8, y: terrainOf(level).groundAt(x - 8, z), z, vy: 0, grounded: true, flying: false };
    const ctx: MoveCtx = { canFly: false, frozen: false, speedMul: 1, terrain: terrainOf(level), collision: collisionOf(level) };
    // Chạy thẳng về phía +x (yaw −π/2: hướng tiến = (−sin, −cos) = (+1, 0)) qua tâm trong 3 s.
    for (let k = 0; k < 60; k++) stepMove(s, { s: k, mx: 0, mz: 1, yaw: -Math.PI / 2, f: 0 }, ctx);
    return s.x < x + 4 && Math.abs(s.z - z) < 2 && g > -1e3; // chưa vượt qua tâm
  };

  it('tâm các bí cảnh Vân Lam (1520, 1300) không còn vòng tròn cự kiếm; Kiếm Trủng vẫn có', () => {
    for (const level of ['do_kiep', 'kim_da_cung', 'kinh_nguyet', 'phuc_mach', 'than_tang']) {
      expect(terrainOf(level).colliders, level).toEqual([]);
      expect(terrainOf(level).heightAt, level).toBe(terrainOf('van_lam').heightAt); // cùng heightmap, không dựng lại
    }
    for (const level of ['van_lam', 'kiem_trung']) {
      expect(
        terrainOf(level).colliders.some((c) => c.x === 1520 && c.z === 1300 && c.r === 3.4),
        level,
      ).toBe(true);
    }
    // terrainOf nhận cả LevelDef (server): bí cảnh vẫn nhận bản sao sạch
    expect(terrainOf(LEVELS.phuc_mach!).colliders).toEqual([]);
  });

  it('chạy thẳng qua tâm: Kiếm Trủng bị cự kiếm chặn, phó bản khác đi xuyên được', () => {
    expect(stuck('kiem_trung', 1520, 1300)).toBe(true);
    // Phục Mạch/Kính Nguyệt có hộp kiến trúc quanh tâm: dùng Xích Tẫn/Độ Kiếp không có hộp tại tâm này làm đối chứng không phụ thuộc kiến trúc.
    expect(stuck('do_kiep', 1520, 1300)).toBe(false);
  });
});

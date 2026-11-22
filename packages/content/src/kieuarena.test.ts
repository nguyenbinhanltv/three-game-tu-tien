import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KIEU_COUNT, KIEU_MOOD, KIEU_PROPS, kieuLevelId, propCollidersOf, propsOf } from '@dtl/shared';
import { LEVEL_ASSETS } from './index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const C = { x: 1300, z: 985 };

describe('mỹ thuật sàn chín phòng cầu (TN-7)', () => {
  it('đủ chín cầu, mỗi cầu có prop, mọi asset tồn tại, không va chạm', () => {
    for (let n = 1; n <= KIEU_COUNT; n++) {
      const id = kieuLevelId(n);
      const ps = propsOf(id);
      expect(ps.length, id).toBeGreaterThan(30);
      for (const p of ps) {
        expect(existsSync(path.join(ROOT, 'assets/source/prop', p.id)), `${id}:${p.id}`).toBe(true);
        expect(p.r, id).toBeUndefined();
      }
      expect(propCollidersOf(id), id).toEqual([]);
    }
    expect(Object.keys(KIEU_PROPS)).toHaveLength(KIEU_COUNT);
  });

  it('chừa chỗ cho cơ chế: lòng sàn (< 9 m) trống, cầu 3 (sân kiếp) trống trong 46 m trừ sảnh vào, công tắc cầu 4 cách >= 5 m', () => {
    const SW = [
      { x: 1300, z: 963 },
      { x: 1319, z: 996 },
      { x: 1281, z: 996 },
    ];
    for (let n = 1; n <= KIEU_COUNT; n++)
      for (const p of propsOf(kieuLevelId(n))) {
        const d = Math.hypot(p.x - C.x, p.z - C.z);
        expect(d, `${n}:${p.id}`).toBeGreaterThanOrEqual(9);
        if (n === 3) expect(d, `3:${p.id}`).toBeGreaterThanOrEqual(46);
        if (n === 4) for (const w of SW) expect(Math.hypot(p.x - w.x, p.z - w.z), `4:${p.id}`).toBeGreaterThanOrEqual(5);
      }
  });

  it('trụ đá cao không đứng ở cung phía nam (chỗ vào, camera sau lưng): ±0,6 rad quanh +z, xa hơn 40 m', () => {
    for (let n = 1; n <= KIEU_COUNT; n++)
      for (const p of propsOf(kieuLevelId(n))) {
        if (p.id !== 'prop_tru_da_khac_van') continue;
        const d = Math.hypot(p.x - C.x, p.z - C.z);
        if (d > 40) expect(Math.abs(Math.atan2(p.z - C.z, p.x - C.x) - Math.PI / 2), `${n}`).toBeGreaterThan(0.6);
      }
  });

  it('mood theo bảng KIEU_MOOD (ghi đè cả level thêm sau) và bật lớp prop', () => {
    expect(KIEU_MOOD).toHaveLength(KIEU_COUNT);
    for (const m of KIEU_MOOD) expect(m).toMatch(/^ck_(dawn|day|dusk|night)$/);
    for (const [id, a] of Object.entries(LEVEL_ASSETS)) {
      const m = /^kieu_([1-9])$/.exec(id);
      if (!m) continue;
      expect(a.mood, id).toBe(KIEU_MOOD[Number(m[1]) - 1]);
      expect(a.features.trees, id).toBe('scatter');
    }
  });
});

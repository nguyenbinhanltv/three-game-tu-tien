import { LEVELS, LEVEL_ASSETS } from '@dtl/content';
import { heightAt as sharedHeight, SECT, terrainOf } from '@dtl/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { biomeAt, groundAt, heightAt, knownLevel, levelAssets, levelId, levelTerrain, sameLayout, setActiveLevel } from './levelCtx';
import { TEST_LEVEL } from './testLevel';

describe('levelCtx (E1-D)', () => {
  afterAll(() => setActiveLevel('van_lam'));

  it('mặc định là Vân Lam, kết quả giống hệt hàm shared', () => {
    setActiveLevel('van_lam');
    expect(levelId()).toBe('van_lam');
    for (const [x, z] of [
      [2048, 2088],
      [1640, 2230],
      [2450, 1740],
      [100, 100],
    ])
      expect(heightAt(x, z)).toBe(sharedHeight(x, z));
  });

  it('mọi level có LevelDef đều khai báo assets; bí cảnh dùng chung địa hình Vân Lam', () => {
    for (const id of Object.keys(LEVELS)) expect(LEVEL_ASSETS[id], id).toBeDefined();
    setActiveLevel('kiem_trung');
    expect(levelTerrain()).toBe(terrainOf('van_lam'));
  });

  it('level thử: đổi hai chiều, địa hình khác rồi trả lại đúng như cũ', () => {
    expect(knownLevel(TEST_LEVEL)).toBe(true);
    setActiveLevel('van_lam');
    const before = heightAt(2300, 2300);
    setActiveLevel(TEST_LEVEL);
    expect(levelId()).toBe(TEST_LEVEL);
    expect(heightAt(SECT.x, SECT.z)).toBeCloseTo(SECT.y, 0);
    expect(heightAt(2300, 2300)).not.toBe(before);
    expect(groundAt(100, 100)).toBeLessThan(0);
    expect(biomeAt(100, 100)).toBe('wild');
    setActiveLevel('van_lam');
    expect(heightAt(2300, 2300)).toBe(before);
  });

  it('thế giới ↔ Kiếm Trủng đi nhánh nhanh (không dựng lại), level thử thì không', () => {
    expect(sameLayout('van_lam', 'kiem_trung')).toBe(true);
    expect(sameLayout('kiem_trung', 'van_lam')).toBe(true);
    expect(sameLayout('van_lam', TEST_LEVEL)).toBe(false);
    // Hai file assets chỉ được khác nhau ở nhạc (và minimap): thêm khác biệt khác sẽ làm bí cảnh dựng lại cả cảnh mỗi lần vào/ra.
    const { music: _m1, minimap: _a, ...vl } = LEVEL_ASSETS.van_lam;
    const { music: _m2, minimap: _b, ...kt } = LEVEL_ASSETS.kiem_trung;
    expect(kt).toEqual(vl);
  });

  it('level lạ không có assets thì báo lỗi rõ', () => {
    expect(() => levelAssets('khong_co')).toThrow(/assets\.json/);
    expect(knownLevel('khong_co')).toBe(false);
  });
});

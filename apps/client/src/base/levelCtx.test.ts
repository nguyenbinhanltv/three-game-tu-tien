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
      expect(heightAt(x!, z!)).toBe(sharedHeight(x!, z!));
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

  it('Kiếm Trủng có mỹ thuật riêng (DUN-1) nên đổi qua lại với thế giới phải dựng lại cảnh', () => {
    // Trước DUN-1 hai level cùng bố cục nên đi nhánh nhanh; nay Kiếm Trủng có mood `kt`, đất `terrain-slate`, huyệt kiếm: không dùng chung cảnh.
    expect(sameLayout('van_lam', 'kiem_trung')).toBe(false);
    expect(sameLayout('kiem_trung', 'van_lam')).toBe(false);
    expect(sameLayout('van_lam', TEST_LEVEL)).toBe(false);
    expect(levelAssets('kiem_trung').kiemTrungArt).toBe(true);
    expect(levelAssets('kiem_trung').cave).toBeDefined();
  });

  it('level lạ không có assets thì báo lỗi rõ', () => {
    expect(() => levelAssets('khong_co')).toThrow(/assets\.json/);
    expect(knownLevel('khong_co')).toBe(false);
  });
});

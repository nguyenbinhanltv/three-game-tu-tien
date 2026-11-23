import { describe, expect, it } from 'vitest';
import { hasString, t } from '@dtl/content';
import { firstTipIndex, placeKey, tipKey, TIP_COUNT } from './loadTips';

describe('mẹo màn tải', () => {
  it('mọi mẹo đều có chuỗi i18n', () => {
    for (let i = 0; i < TIP_COUNT; i++) expect(hasString(tipKey(i)), tipKey(i)).toBe(true);
  });
  it('xoay vòng, kể cả số âm', () => {
    expect(tipKey(0)).toBe('ui.tip.1');
    expect(tipKey(TIP_COUNT)).toBe('ui.tip.1');
    expect(tipKey(-1)).toBe(`ui.tip.${TIP_COUNT}`);
  });
  it('chỉ số đầu nằm trong dải', () => {
    for (const s of [0, 1, 12345, -7, 1e9]) {
      const i = firstTipIndex(s);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(TIP_COUNT);
    }
  });
});

describe('tên nơi đến ở màn tải (theo level đích)', () => {
  const name = (level: string, art: string) => t(placeKey(level, art, hasString));
  it('level dùng chung một tranh vẫn ra đúng tên riêng', () => {
    expect(name('kinh_nguyet', 'van_hai_phu_dao')).toBe(t('dungeon.kinh_nguyet.name'));
    expect(name('van_hai', 'van_hai_phu_dao')).toBe(t('map.van_hai'));
    expect(name('than_tang', 'thien_khuyet_co_thanh')).toBe(t('dungeon.than_tang.name'));
    expect(name('thien_khuyet', 'thien_khuyet_co_thanh')).toBe(t('map.thien_khuyet'));
    expect(name('phuc_mach', 'doan_mach')).toBe(t('dungeon.phuc_mach.name'));
    expect(name('doan_mach', 'doan_mach')).toBe(t('map.doan_mach'));
    expect(name('gioi_tri', 'van_dinh')).toBe(t('dungeon.gioi_tri.name'));
    expect(name('kim_da_cung', 'bac_hoang')).toBe(t('dungeon.kim_da_cung.name'));
    expect(name('do_kiep_bac_hoang', 'bac_hoang')).toBe(t('map.do_kiep_bac_hoang'));
  });
  it('phòng Cửu Kiều (không có trong LEVEL_ART) ra tên kiều, không phải Lạc Kiếm Tông', () => {
    expect(name('kieu_3', 'load_song')).toBe(t('map.kieu_3'));
  });
  it('Vân Lam đi theo vùng: tông môn và các vùng', () => {
    expect(name('van_lam', 'load_song')).toBe(t('ui.load.place.load_song'));
    expect(name('van_lam', 'ho_suong_mu')).toBe(t('zone.ho_suong_mu'));
    expect(name('', 'thung_lung')).toBe(t('zone.thung_lung'));
  });
  it('mọi tên khóa trả về đều có chuỗi', () => {
    for (const [lv, art] of [
      ['van_lam', 'load_song'],
      ['van_lam', 'vach_da_ngoc'],
      ['kiem_trung', 'kiem_trung'],
      ['', 'load_song'],
    ] as const)
      expect(hasString(placeKey(lv, art, hasString)), `${lv}/${art}`).toBe(true);
  });
});

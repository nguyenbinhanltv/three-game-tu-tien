import { describe, expect, it } from 'vitest';
import { hasString } from '@dtl/content';
import { regionOfArt, type LoadRegion } from './bootArt';

const REGIONS: LoadRegion[] = ['doan_mach', 'van_hai', 'thien_khuyet', 'bac_hoang', 'van_dinh'];
const KEYS = ['ui.subtitle', 'ui.load.enter', 'ui.load.env', 'ui.load.terrain', 'ui.load.sect', 'ui.load.minimap'];

describe('màn tải theo vùng', () => {
  it('tranh → vùng chuỗi', () => {
    expect(regionOfArt('bac_hoang')).toBe('bac_hoang');
    expect(regionOfArt('van_dinh')).toBe('van_dinh');
    expect(regionOfArt('doan_mach')).toBe('doan_mach');
    expect(regionOfArt('phuc_mach_quat')).toBe('doan_mach');
    expect(regionOfArt('van_hai_phu_dao')).toBe('van_hai');
    expect(regionOfArt('thien_khuyet_co_thanh')).toBe('thien_khuyet');
    for (const a of ['load_song', 'tong_mon', 'thung_lung', 'kiem_trung', 'ho_suong_mu']) expect(regionOfArt(a)).toBe('van_lam');
  });
  it('mỗi vùng ngoài Vân Lam có đủ phụ đề và dòng tải riêng, không nhắc Vân Lam/Lạc Kiếm Tông', async () => {
    const { t } = await import('@dtl/content');
    for (const r of REGIONS)
      for (const k of KEYS) {
        expect(hasString(`${k}.${r}`), `${k}.${r}`).toBe(true);
        expect(t(`${k}.${r}`), `${k}.${r}`).not.toMatch(/Vân Lam Sơn Mạch|Lạc Kiếm Tông/);
      }
  }, 30000);
  it('Bắc Hoang nói về Giới Khích và nhật thực', async () => {
    const { t } = await import('@dtl/content');
    expect(t('ui.subtitle.bac_hoang')).toContain('Giới Khích');
    expect(t('ui.load.env.bac_hoang')).toMatch(/Nhật thực/);
  }, 30000);
});

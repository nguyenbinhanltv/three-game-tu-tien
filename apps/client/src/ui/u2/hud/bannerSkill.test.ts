import { describe, expect, it } from 'vitest';
import { bannerSkill } from './bannerSkill';

describe('tên chiêu trên dải vệt mực', () => {
  it('Cổ Thần vào Hóa Hình thì hiện Hóa Hình, không phải chiêu nền Sơn Nhạc Hóa Thân', () => {
    expect(bannerSkill('skl_son_nhac_hoa_than', 'co_than_quyet')).toBe('skl_hoa_hinh');
  });
  it('người tu đúng công pháp của chiêu nền, hay chiêu không mượn hình, giữ nguyên tên', () => {
    expect(bannerSkill('skl_son_nhac_hoa_than', 'bat_dong_kim_than')).toBe('skl_son_nhac_hoa_than');
    expect(bannerSkill('skl_thai_co_quyen', 'co_than_quyet')).toBe('skl_thai_co_quyen');
    expect(bannerSkill('skl_hoa_hinh', 'co_than_quyet')).toBe('skl_hoa_hinh');
    expect(bannerSkill('skl_son_nhac_hoa_than', undefined)).toBe('skl_son_nhac_hoa_than');
    expect(bannerSkill('khong_co', 'co_than_quyet')).toBe('khong_co');
  });
});

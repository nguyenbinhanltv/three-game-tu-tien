import { describe, expect, it } from 'vitest';
import { LOI_METHOD } from '@dtl/shared';
import { PATH } from '@dtl/content';
import { bladeLook } from './loiBlade';

describe('kiếm điện của Lôi tu', () => {
  it('Lôi tu: ánh kiếm tím điện của hướng và phát sáng tối thiểu bậc 1; công pháp khác không đổi', () => {
    const body = PATH.get('loi_tu')!.palette.body;
    expect(bladeLook(LOI_METHOD, '', 0)).toEqual({ tint: `#${body}`, glow: 1 });
    expect(bladeLook('lac_kiem_quyet', '', 0)).toEqual({ tint: '', glow: 0 });
    expect(bladeLook(undefined, '#112233', 2)).toEqual({ tint: '#112233', glow: 2 });
  });
  it('bộ trang bị có màu lưỡi riêng và cường hóa cao hơn vẫn thắng', () => {
    expect(bladeLook(LOI_METHOD, '#aabbcc', 2)).toEqual({ tint: '#aabbcc', glow: 2 });
  });
});

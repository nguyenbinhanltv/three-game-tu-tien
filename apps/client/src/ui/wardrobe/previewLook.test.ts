import { describe, expect, it } from 'vitest';
import { APPEARANCE, swordModelOf } from '@dtl/content';
import { draftFrom } from './model';
import { draftLook } from './previewLook';

const [a, b, c] = APPEARANCE.dyes;
const base = { g: 'm', dye: a!.id, skin: 'set_skin_x' };

describe('draftLook (xem trước Tủ ngoại trang)', () => {
  it('bản nháp trống giữ ngoại hình thật, kiếm theo món đang cầm, không có tint', () => {
    const l = draftLook(base, { weapon: { id: 'itm_thanh_phong_kiem', n: 1 } }, draftFrom({ over: {} }));
    expect(l.g).toBe('m');
    expect(l.dye).toBe(a!.id);
    expect(l.skin).toBe('set_skin_x'); // skin ô 10 vẫn đè lên trên
    expect(l.w).toBe(swordModelOf('itm_thanh_phong_kiem'));
    expect(l.tint).toBeUndefined();
  });

  it('ghi đè kiếm đổi model, nhuộm ba kênh đổi tint (kênh 1 = vải, kênh 2 = viền)', () => {
    const d = draftFrom({ over: {} });
    d.over.weapon = 'itm_moc_kiem';
    d.dye = [b!.id, c!.id, a!.id];
    const l = draftLook(base, { weapon: { id: 'itm_thanh_phong_kiem', n: 1 } }, d);
    expect(l.w).toBe(swordModelOf('itm_moc_kiem'));
    expect(l.tint).toEqual({ hex: b!.hex, trim: c!.hex });
  });

  it('ô nháp null hiện đúng món đang mặc; không sửa trang bị thật', () => {
    const equip = { weapon: { id: 'itm_thanh_phong_kiem', n: 1 } };
    const snap = JSON.stringify(equip);
    const d = draftFrom({ over: { weapon: 'itm_moc_kiem' } });
    d.over.weapon = null;
    expect(draftLook(base, equip, d).w).toBe(swordModelOf('itm_thanh_phong_kiem'));
    expect(JSON.stringify(equip)).toBe(snap);
  });
});

import { describe, expect, it } from 'vitest';
import { appearanceFromDb, type AppearanceData, hashName, legacyAppearance, parseAppearance } from './appearance';

const data: AppearanceData = {
  defaultGender: 'm',
  defaultDye: 'a',
  genders: [
    { id: 'm', model: 'chr_x', enabled: true },
    { id: 'f', model: null, enabled: false },
  ],
  dyes: [
    { id: 'a', hex: '#000000', trim: '#ffffff' },
    { id: 'b', hex: '#111111', trim: '#ffffff' },
  ],
  legacyByNameHash: ['a', 'b', 'a', 'b', 'a', 'b', 'a', 'zzz'],
};

describe('appearance', () => {
  it('chỉ nhận id màu có trong bảng và giới tính đang mở', () => {
    expect(parseAppearance(data, { g: 'm', dye: 'b' })).toEqual({ g: 'm', dye: 'b' });
    expect(parseAppearance(data, { g: 'f', dye: 'b' })).toBeNull();
    expect(parseAppearance(data, { g: 'm', dye: '#ff0000' })).toBeNull();
    expect(parseAppearance(data, { g: 'm', dye: 'toString' })).toBeNull();
    expect(parseAppearance(data, { g: 'm' })).toBeNull();
    expect(parseAppearance(data, 'm:a')).toBeNull();
    expect(parseAppearance(data, null)).toBeNull();
    expect(parseAppearance(data, [])).toBeNull();
  });

  it('bỏ trường thừa từ client', () => {
    expect(parseAppearance(data, { g: 'm', dye: 'a', hex: '#fff', extra: 1 })).toEqual({ g: 'm', dye: 'a' });
  });

  it('nhân vật cũ lấy màu theo băm tên như client cũ (FNV-1a)', () => {
    expect(hashName('')).toBe(2166136261);
    for (const name of ['Lạc Vân', 'bot_1', 'Thanh Phong']) {
      const want = data.legacyByNameHash[hashName(name) % 8];
      expect(legacyAppearance(data, name).dye).toBe(want === 'zzz' ? 'a' : want);
    }
  });

  it('cột DB trống/hỏng/không hợp lệ thì dùng màu theo tên', () => {
    expect(appearanceFromDb(data, '{"g":"m","dye":"b"}', 'x')).toEqual({ g: 'm', dye: 'b' });
    expect(appearanceFromDb(data, '', 'x')).toEqual(legacyAppearance(data, 'x'));
    expect(appearanceFromDb(data, '{bad', 'x')).toEqual(legacyAppearance(data, 'x'));
    expect(appearanceFromDb(data, '{"g":"f","dye":"b"}', 'x')).toEqual(legacyAppearance(data, 'x'));
  });

  it('kiểu tóc (hair): chỉ nhận a|b, thiếu thì không có khóa hair', () => {
    expect(parseAppearance(data, { g: 'm', dye: 'b', hair: 'b' })).toEqual({ g: 'm', dye: 'b', hair: 'b' });
    expect(parseAppearance(data, { g: 'm', dye: 'b', hair: 'a' })).toEqual({ g: 'm', dye: 'b', hair: 'a' });
    const noHair = parseAppearance(data, { g: 'm', dye: 'b' });
    expect(noHair).toEqual({ g: 'm', dye: 'b' });
    expect(noHair && 'hair' in noHair).toBe(false);
    for (const bad of ['c', 1, 'toString', null, '', ['a'], {}]) expect(parseAppearance(data, { g: 'm', dye: 'b', hair: bad })).toBeNull();
  });

  it('appearanceFromDb giữ hair đã lưu, hair hỏng thì lùi về màu theo tên', () => {
    expect(appearanceFromDb(data, JSON.stringify({ g: 'm', dye: 'b', hair: 'b' }), 'x')).toEqual({ g: 'm', dye: 'b', hair: 'b' });
    expect(appearanceFromDb(data, JSON.stringify({ g: 'm', dye: 'b' }), 'x')).toEqual({ g: 'm', dye: 'b' });
    expect(appearanceFromDb(data, JSON.stringify({ g: 'm', dye: 'b', hair: 'zzz' }), 'x')).toEqual(legacyAppearance(data, 'x'));
  });
});

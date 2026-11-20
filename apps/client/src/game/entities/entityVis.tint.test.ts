import { describe, expect, it } from 'vitest';
import { APPEARANCE } from '@dtl/content';
import { lookOf, tintOf, type PState } from './entityVis';

const [a, b, c] = APPEARANCE.dyes;

describe('nhuộm 3 kênh của tủ ngoại trang (v1)', () => {
  it('kênh 1 → màu vải, kênh 2 → màu viền; kênh 3 để dành cho v3', () => {
    expect(tintOf(`${a!.id},${b!.id},${c!.id}`)).toEqual({ hex: a!.hex, trim: b!.hex });
  });

  it('rỗng, sai định dạng hoặc màu lạ thì không nhuộm', () => {
    for (const s of [undefined, '', 'x', `${a!.id},${b!.id}`, `${a!.id},zz,${c!.id}`, '#ff0000,#00ff00,#0000ff'])
      expect(tintOf(s)).toBeUndefined();
  });

  it('lookOf mang tint khi server gửi dye3, và không có khi vắng', () => {
    const s = { name: 'a', dye: a!.id, g: 'm', wp: '', dye3: `${b!.id},${c!.id},${a!.id}` } as unknown as PState;
    expect(lookOf(s).tint).toEqual({ hex: b!.hex, trim: c!.hex });
    expect(lookOf({ ...s, dye3: '' }).tint).toBeUndefined();
  });
});

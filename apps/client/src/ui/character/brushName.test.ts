import { describe, expect, it } from 'vitest';
import { BRUSH_MAX_ROWS, brushColumns } from './brushName';

describe('tên thư pháp dọc: chia chữ', () => {
  it('mỗi chữ (tiếng) một ô, tên ngắn một cột', () => {
    expect(brushColumns('Lạc Vân Tiêu')).toEqual([['Lạc', 'Vân', 'Tiêu']]);
    expect(brushColumns('Tg4436')).toEqual([['Tg4436']]);
  });
  it('quá 4 chữ thì chia 2 cột, cột đầu (bên phải) nhiều hơn hoặc bằng', () => {
    const cols = brushColumns('Âu Dương Thiên Lộ Vân');
    expect(cols).toHaveLength(2);
    expect(cols[0]).toEqual(['Âu', 'Dương', 'Thiên']);
    expect(cols[1]).toEqual(['Lộ', 'Vân']);
    expect(Math.max(...cols.map((c) => c.length))).toBeLessThanOrEqual(BRUSH_MAX_ROWS);
  });
  it('khoảng trắng thừa và dấu dựng sẵn/tổ hợp cho cùng kết quả', () => {
    expect(brushColumns('  Lạc   Vân ')).toEqual([['Lạc', 'Vân']]);
    expect(brushColumns('La\u0323c')).toEqual([['Lạc']]);
  });
});

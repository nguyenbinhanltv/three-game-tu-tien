import { describe, expect, it } from 'vitest';
import { MARK_ORDER, packMarks, type MarkRt } from '@dtl/shared';
import { MARKS } from '@dtl/content';
import { markLabelSpec, markText, markViews } from './markLabel';

const rt = (id: MarkRt['id'], n: number): MarkRt => ({ id, sid: 'x', n, until: 1e12 });

describe('nhãn ấn trên đầu mục tiêu (VS-2c)', () => {
  it('không có ấn thì không có nhãn', () => {
    expect(markLabelSpec(0)).toBeNull();
    expect(markLabelSpec(undefined)).toBeNull();
    expect(markViews(0)).toEqual([]);
  });
  it('tên theo i18n, số tầng từ 2 trở lên mới ghi "×n", màu theo ấn đầu', () => {
    const mk = packMarks([rt('kiem_an', 3), rt('truy_hon', 1)], 0);
    expect(markLabelSpec(mk)).toEqual({ text: '◈ Kiếm ấn ×3 · Truy hồn', color: '#9fd8ff' });
    expect(markText({ name: 'Mộc ấn', n: 1 })).toBe('Mộc ấn');
  });
  it('mọi ấn trong bảng đều có tên và màu hiển thị', () => {
    expect(MARKS.map((m) => m.id)).toEqual([...MARK_ORDER]);
    for (const m of MARKS) {
      const v = markViews(packMarks([rt(m.id, 1)], 0))[0]!;
      expect(v.name, m.id).not.toMatch(/^mark\./);
      expect(v.color, m.id).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

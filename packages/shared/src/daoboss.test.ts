import { describe, expect, it } from 'vitest';
import { daoForm, daoResistMul, sourceElem, type MonsterDao } from './index';

const cfg: MonsterDao = { forms: ['hoa', 'kim', 'thuy'], same: 0.3, beat: 1.3 };

describe('kháng theo Bản Nguyên (TN-7)', () => {
  it('hình thái theo pha, quá cuối thì giữ hình cuối', () => {
    expect(daoForm(cfg, 0)).toBe('hoa');
    expect(daoForm(cfg, 2)).toBe('thuy');
    expect(daoForm(cfg, 9)).toBe('thuy');
    expect(daoForm({ forms: ['', '', 'hoa'], same: 0.3, beat: 1.3 }, 1)).toBe('');
  });
  it('cùng hành bị kháng, hành khắc được nhân, còn lại giữ nguyên', () => {
    expect(daoResistMul(cfg, 0, 'hoa')).toBe(0.3);
    expect(daoResistMul(cfg, 0, 'thuy')).toBe(1.3); // thủy khắc hỏa
    expect(daoResistMul(cfg, 0, 'moc')).toBe(1);
    expect(daoResistMul(cfg, 1, 'kim')).toBe(0.3);
    expect(daoResistMul(cfg, 1, 'hoa')).toBe(1.3); // hỏa khắc kim
  });
  it('không có nguồn ngũ hành (Lôi) hay hình thái rỗng thì không đổi', () => {
    expect(daoResistMul(cfg, 0, '')).toBe(1);
    expect(daoResistMul({ forms: [''], same: 0.3, beat: 1.3 }, 0, 'hoa')).toBe(1);
  });
  it('nguồn người đánh: Đạo trước, không có Đạo thì linh căn; Lôi không có hành', () => {
    expect(sourceElem('kim', 'hoa')).toBe('hoa');
    expect(sourceElem('moc', null)).toBe('moc');
    expect(sourceElem('loi', null)).toBe('');
    expect(sourceElem(undefined, null)).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { methodSwitchCost } from '@dtl/shared';
import { PATH, t } from '@dtl/content';
import { methodPickView } from './methodPick';

const HON = 'dan_hon_kinh';
const u = PATH.get('hon_tu')!.unlock!;

describe('nút chọn công pháp (TN-2: lĩnh ngộ Hồn tu)', () => {
  it('ba công pháp đầu: chọn lần đầu, đang tu, đổi (như trước)', () => {
    expect(methodPickView({ id: 'lac_kiem_quyet', level: 4, gold: 0 })).toMatchObject({ label: t('ui.method.pick'), disabled: true });
    expect(methodPickView({ id: 'lac_kiem_quyet', level: 5, gold: 0 })).toMatchObject({ label: t('ui.method.pick'), disabled: false });
    expect(methodPickView({ id: 'lac_kiem_quyet', current: 'lac_kiem_quyet', level: 9, gold: 0 }).disabled).toBe(true);
    const sw = methodPickView({ id: 'bat_dong_kim_than', current: 'lac_kiem_quyet', level: 9, gold: 0 });
    expect(sw).toMatchObject({ label: t('ui.method.switch', { n: methodSwitchCost(9) }), disabled: false });
    expect(sw.note).toBeUndefined();
    expect(sw.learned).toBe(false);
  });
  it('Dẫn Hồn Kinh chưa lĩnh ngộ: nút "Lĩnh ngộ" kèm điều kiện; thiếu cảnh giới hoặc linh thạch thì khóa', () => {
    const low = methodPickView({ id: HON, current: 'lac_kiem_quyet', level: u.level - 1, gold: 9999 });
    expect(low.label).toBe(t('ui.method.learn', { n: u.gold }));
    expect(low.disabled).toBe(true);
    expect(low.note).toContain(String(u.gold));
    expect(low.note).toContain(t('item.itm_hon_phien.name'));
    expect(methodPickView({ id: HON, level: u.level, gold: u.gold - 1 }).disabled).toBe(true);
    expect(methodPickView({ id: HON, level: u.level, gold: u.gold }).disabled).toBe(false);
  });
  it('đã lĩnh ngộ: trở lại nút đổi công pháp thường, có cờ đã lĩnh ngộ', () => {
    const v = methodPickView({ id: HON, current: 'lac_kiem_quyet', level: 12, gold: 0, learned: ['hon_tu'] });
    expect(v).toMatchObject({ label: t('ui.method.switch', { n: methodSwitchCost(12) }), disabled: false, learned: true });
    expect(v.note).toBeUndefined();
    expect(methodPickView({ id: HON, current: HON, level: 12, gold: 0, learned: ['hon_tu'] }).disabled).toBe(true);
  });
});

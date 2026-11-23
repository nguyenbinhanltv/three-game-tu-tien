import { describe, expect, it } from 'vitest';
import { PRESET_IDS, PRESETS, presetOf } from './settingsPresets';

describe('preset đồ họa', () => {
  it('mỗi preset nhận ra chính nó', () => {
    for (const id of PRESET_IDS) expect(presetOf(PRESETS[id])).toBe(id);
  });
  it('đã tinh chỉnh riêng thì không khớp preset nào', () => {
    expect(presetOf({ ...PRESETS.balanced, heroRim: false })).toBeNull();
  });
  it('chất lượng tăng dần theo thứ tự preset', () => {
    const order = ['low', 'medium', 'high', 'ultra'];
    const q = PRESET_IDS.map((id) => order.indexOf(PRESETS[id].quality));
    expect(q).toEqual([...q].sort((a, b) => a - b));
  });
});

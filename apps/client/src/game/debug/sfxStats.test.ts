import { describe, expect, it } from 'vitest';
import { sfxStats, type SfxRow } from './sfxStats';

const row = (name: string, at: number, why: SfxRow['why'] = 'mute', vol = 1): SfxRow => ({ name, vol, at, why });

describe('sfxStats (mật độ tiếng từ nhật ký lời gọi)', () => {
  it('đếm lời gọi đáng phát trong cửa sổ, kể cả khi đang tắt tiếng', () => {
    const rows = [row('hit', 0), row('hit', 900, 'ok'), row('slash', 1500, 'idle'), row('hit', 1600, 'throttle'), row('step', 1700, 'quiet')];
    const s = sfxStats(rows, 2000, 2000);
    expect(s.calls).toBe(3);
    expect(s.throttled).toBe(1);
    expect(s.quiet).toBe(1);
    expect(s.top[0]).toEqual({ name: 'hit', n: 2 });
  });

  it('bỏ lời gọi cũ hơn cửa sổ', () => {
    const s = sfxStats([row('a', 0), row('b', 5000)], 5100, 1000);
    expect(s.calls).toBe(1);
    expect(s.top).toEqual([{ name: 'b', n: 1 }]);
  });

  it('đỉnh dồn = nhiều tiếng nhất trong 100 ms và tổng âm lượng của cửa sổ đó', () => {
    // Tám người cùng ra đòn: 8 tiếng trong 60 ms, rồi 2 tiếng lẻ.
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row('slash', 1000 + i * 8, 'mute', 0.5)),
      row('hit', 1400),
      row('hit', 1700),
    ];
    const s = sfxStats(rows, 2000);
    expect(s.burst).toBe(8);
    expect(s.burstVol).toBe(4);
  });

  it('nhật ký rỗng cho số không', () => {
    expect(sfxStats([], 100)).toEqual({ calls: 0, throttled: 0, quiet: 0, burst: 0, burstVol: 0, top: [] });
  });
});

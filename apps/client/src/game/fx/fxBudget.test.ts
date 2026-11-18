import { describe, expect, it } from 'vitest';
import { OTHERS_FX_DIST, OTHERS_FX_LIVE_MAX, skipOthersFx } from './fxBudget';

const other = { involvesMe: false, live: 0, dist: 10 };

describe('skipOthersFx', () => {
  it('giữ hiệu ứng chiêu người khác khi pool còn thưa và ở gần', () => {
    expect(skipOthersFx('sword', other)).toBe(false);
    expect(skipOthersFx('rain', { ...other, live: OTHERS_FX_LIVE_MAX - 1 })).toBe(false);
  });

  it('bỏ hiệu ứng chiêu người khác khi pool đã đông hoặc ở xa', () => {
    expect(skipOthersFx('sword', { ...other, live: OTHERS_FX_LIVE_MAX })).toBe(true);
    expect(skipOthersFx('thunder', { ...other, dist: OTHERS_FX_DIST + 1 })).toBe(true);
  });

  it('không bao giờ bỏ hiệu ứng dính tới mình (mình ra chiêu, đòn hay cú cắn nhắm vào mình)', () => {
    const crowded = { involvesMe: true, live: 999, dist: 999 };
    for (const t of ['sword', 'thunder', 'rain', 'bite']) expect(skipOthersFx(t, crowded)).toBe(false);
  });

  it('quái cắn người khác giữa đám đông cũng là trang trí', () => {
    expect(skipOthersFx('bite', { ...other, live: OTHERS_FX_LIVE_MAX })).toBe(true);
  });

  it('không đụng tới hiệu ứng mang trạng thái (niệm chú, độ kiếp, lên cấp)', () => {
    const crowded = { ...other, live: 999, dist: 999 };
    for (const t of [
      'cast',
      'castend',
      'mcast',
      'chant',
      'interrupt',
      'break',
      'phase',
      'tribstart',
      'levelup',
      'ascend',
      'death',
      'respawn',
    ])
      expect(skipOthersFx(t, crowded)).toBe(false);
  });
});

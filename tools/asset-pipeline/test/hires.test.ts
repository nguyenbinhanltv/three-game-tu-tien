import { describe, expect, it } from 'vitest';
import { loadBudgets } from '../src/config.js';
import { gpuBytesOf, hiresSide, hiresWanted } from '../src/hires.js';

describe('hires', () => {
  const boss = loadBudgets().classes.boss;
  it('màu gấp đôi ngân sách tới trần 4096, không quá nguồn', () => {
    const limit = boss.texture.color;
    expect(hiresSide(boss, ['baseColorTexture'], 8192, limit)).toBe(Math.min(limit * 2, 4096));
    expect(hiresSide(boss, ['baseColorTexture'], limit + 100, limit)).toBe(limit + 100);
  });
  it('normal/ORM trần 2048', () => {
    expect(hiresSide(boss, ['normalTexture'], 8192, 1024)).toBe(2048);
  });
  it('không làm khi nguồn không lớn hơn bản build', () => {
    expect(hiresSide(boss, ['baseColorTexture'], 2048, 2048)).toBeNull();
  });
  it('chỉ màu của boss và tinh anh được làm bậc cao (quái, normal, ORM thì không)', () => {
    for (const c of ['boss', 'boss_mq', 'elite', 'elite_mq']) expect(hiresWanted(c, ['baseColorTexture']), c).toBe(true);
    for (const c of ['monster', 'monster_mq']) expect(hiresWanted(c, ['baseColorTexture']), c).toBe(false);
    for (const sl of [['normalTexture'], ['metallicRoughnessTexture'], ['emissiveTexture'], []])
      expect(hiresWanted('boss', sl), sl.join()).toBe(false);
  });
  it('ước lượng GPU: normal RGBA8 gấp 4 lần', () => {
    expect(Math.abs(gpuBytesOf(2048, 2048, true) - gpuBytesOf(2048, 2048, false) * 4)).toBeLessThan(8);
  });
});

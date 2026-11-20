import { describe, expect, it } from 'vitest';
import { terrainOf } from '@dtl/shared';
import { LEVELS } from '@dtl/content';
import { distToRect, FOOT_K, peakCandidate } from './bhFar';

describe('bhFar: chân núi xa nằm ngoài vùng chơi', () => {
  it('mọi đỉnh được chọn có toàn bộ chân nón (r × FOOT_K) ngoài playBounds', () => {
    const T = terrainOf(LEVELS.bac_hoang!);
    let n = 0;
    for (let i = 1; i < 4000; i++) {
      const p = peakCandidate(i, T.playBounds, T.def.size);
      if (!p) continue;
      n++;
      expect(distToRect(p.x, p.z, T.playBounds)).toBeGreaterThanOrEqual(p.r * FOOT_K);
    }
    expect(n).toBeGreaterThan(100);
  });
});

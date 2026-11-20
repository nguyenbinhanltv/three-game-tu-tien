import { describe, expect, it } from 'vitest';
import { playDist } from '@dtl/shared';
import { FAR_MIN_PLAY_DIST, farCandidate } from './lacKiemFar';

describe('lacKiemFar: cảnh xa chỉ ở ngoài vùng chơi', () => {
  it('mọi điểm cây/đá ứng viên đều ngoài khung chơi (playDist ≥ ngưỡng) và trong bản đồ', () => {
    let n = 0;
    for (const salt of [4001, 4101]) {
      for (let i = 1; i < 6000; i++) {
        const p = farCandidate(i, salt);
        if (!p) continue;
        n++;
        expect(playDist(p.x, p.z)).toBeGreaterThanOrEqual(FAR_MIN_PLAY_DIST);
        expect(p.x).toBeGreaterThan(0);
        expect(p.z).toBeLessThan(4096);
      }
    }
    expect(n).toBeGreaterThan(500);
  });
});

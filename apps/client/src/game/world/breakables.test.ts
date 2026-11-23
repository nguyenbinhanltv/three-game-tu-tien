import { describe, expect, it } from 'vitest';
import { BREAKABLES_BY_LEVEL, BREAK_KINDS, SHARD_LIFE, brokenBy, spawnShard, stepShard, type BreakableSpec } from './breakables';

const specs: BreakableSpec[] = [
  { id: 'a', kind: 'jar', x: 0, z: 0, yaw: 0 },
  { id: 'b', kind: 'dummy', x: 10, z: 0, yaw: 0 },
  { id: 'c', kind: 'stake', x: 0, z: 10, yaw: 0 },
];

describe('vật thể vỡ: chọn vật bị đòn', () => {
  it('đòn nhẹ không làm vỡ, từ vừa trở lên thì vỡ vật trong tầm (bán kính đòn + thân)', () => {
    expect(brokenBy(specs, [true, true, true], 0, 0, 1.5, 'light')).toEqual([]);
    expect(brokenBy(specs, [true, true, true], 0, 0, 1.5, 'medium')).toEqual([0]);
    expect(brokenBy(specs, [true, true, true], 9, 0, 1.5, 'heavy')).toEqual([1]);
  });
  it('xa quá tầm thì không vỡ; vật đã vỡ không vỡ lại; một đòn rộng vỡ nhiều vật', () => {
    expect(brokenBy(specs, [true, true, true], 4, 4, 1.5, 'finisher')).toEqual([]);
    expect(brokenBy(specs, [false, true, true], 0, 0, 1.5, 'finisher')).toEqual([]);
    expect(brokenBy(specs, [true, true, true], 5, 5, 8, 'finisher')).toEqual([0, 1, 2]);
  });
  it('mọi loại cần tối thiểu cấp vừa (đề: vỡ khi trúng chiêu cấp vừa trở lên)', () => {
    for (const k of Object.values(BREAK_KINDS)) expect(k.minTier).toBe('medium');
  });
  it('Lạc Kiếm Tông (van_lam) có vò và bia mẫu, id duy nhất', () => {
    const list = BREAKABLES_BY_LEVEL.van_lam!;
    expect(new Set(list.map((s) => s.kind))).toEqual(new Set(['jar', 'dummy', 'stake']));
    expect(new Set(list.map((s) => s.id)).size).toBe(list.length);
  });
});

describe('mảnh vỡ', () => {
  const rnd = (() => {
    let t = 7;
    return () => ((t = (t * 9301 + 49297) % 233280) / 233280) as number;
  })();
  it('bay lên rồi rơi, nảy trên đất, không chìm xuống đất và hết đời sau ~1,3 s', () => {
    const s = spawnShard(0, 0.5, 0, 1, 0, '#fff', rnd);
    let maxY = s.y;
    for (let i = 0; i < 120; i++) {
      stepShard(s, 1 / 60, 0);
      maxY = Math.max(maxY, s.y);
      expect(s.y).toBeGreaterThanOrEqual(0 + s.size * 0.5 - 1e-9);
    }
    expect(maxY).toBeGreaterThan(0.8);
    expect(s.life).toBeLessThan(0);
    expect(SHARD_LIFE).toBeLessThan(2);
  });
  it('tản theo hướng đòn', () => {
    let sx = 0;
    for (let i = 0; i < 50; i++) sx += spawnShard(0, 0, 0, 1, 0, '#fff', rnd).vx;
    expect(sx / 50).toBeGreaterThan(1);
  });
});

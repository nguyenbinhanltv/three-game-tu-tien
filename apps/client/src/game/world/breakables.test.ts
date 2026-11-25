import { describe, expect, it } from 'vitest';
import { BRIDGE_A, BRIDGE_B, SCENE_GLB, TC_GATE, TC_ORIGIN, TC_POND } from '@dtl/shared';
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
    expect(new Set(list.map((s) => s.kind))).toEqual(new Set(['jar', 'dummy', 'stake', 'rock']));
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

describe('vật vỡ Lạc Kiếm: bố cục (M5)', () => {
  const list = BREAKABLES_BY_LEVEL.van_lam!;
  const relOf = (s: BreakableSpec) => ({ x: s.x - TC_ORIGIN.x, z: s.z - TC_ORIGIN.z });
  const scene = list.filter((s) => s.id.startsWith('vl_') && !['vl_jar_a', 'vl_jar_b', 'vl_jar_c', 'vl_dummy', 'vl_stake'].includes(s.id));
  it('cách mọi prop tiểu cảnh ≥ 1,2 m (khỏi chồng hình)', () => {
    const glbs = Object.values(SCENE_GLB).flat();
    for (const s of scene) {
      const r = relOf(s);
      for (const g of glbs) expect(Math.hypot(g.x - r.x, g.z - r.z), `${s.id} ~ ${g.id}`).toBeGreaterThanOrEqual(1.2);
    }
  });
  it('không đè lối đại lộ qua cổng, không trong ao, không trên nhịp cầu', () => {
    for (const s of scene) {
      const r = relOf(s);
      expect(Math.hypot(r.x - TC_POND.x, r.z - TC_POND.z), s.id).toBeGreaterThan(TC_POND.r + 1.5);
      if (r.z > 90 && r.z < TC_GATE.z + 20) expect(Math.abs(r.x), s.id).toBeGreaterThan(8);
      const bx = BRIDGE_B[0] - BRIDGE_A[0];
      const bz = BRIDGE_B[1] - BRIDGE_A[1];
      const t = ((r.x - BRIDGE_A[0]) * bx + (r.z - BRIDGE_A[1]) * bz) / (bx * bx + bz * bz);
      if (t > 0 && t < 1) expect(Math.hypot(r.x - BRIDGE_A[0] - bx * t, r.z - BRIDGE_A[1] - bz * t), s.id).toBeGreaterThan(5);
    }
  });
  it('vật vỡ rải ở ≥ 5 vùng khác nhau và có đá nhỏ', () => {
    const cells = new Set(list.map((s) => `${Math.round((s.x - TC_ORIGIN.x) / 40)},${Math.round((s.z - TC_ORIGIN.z) / 40)}`));
    expect(cells.size).toBeGreaterThanOrEqual(5);
    expect(list.filter((s) => s.kind === 'rock').length).toBeGreaterThanOrEqual(3);
  });
});

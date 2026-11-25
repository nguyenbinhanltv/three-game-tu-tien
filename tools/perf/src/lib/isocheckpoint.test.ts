import { describe, expect, it } from 'vitest';
import { bucketGroups, type IsoPoint } from './isoreport';
import { doneKey, emptyCheckpoint, incompatibility, isDone, markDone } from './isocheckpoint';

const pt = (target: string, name: string, preset = 'high'): IsoPoint => ({
  id: `${target}/${name}`,
  target,
  kind: 'map',
  preset,
  frames: 1,
  fps: 1,
  cpuMs: { p50: 1, p95: 1, max: 1, mean: 1 },
  parts: {},
  gpuMs: null,
  drawCalls: { p50: 1, max: 1 },
  triangles: { p50: 1, max: 1 },
  textures: 1,
  textureMB: 1,
  geometries: 1,
  materials: 1,
  gpuMemMB: 1,
  jsHeapMB: null,
  monsters: 0,
  byCat: bucketGroups([]),
  topGroups: [],
});

describe('checkpoint', () => {
  it('markDone ghi điểm, đánh dấu xong và thay điểm cũ khi chạy lại', () => {
    const cp = emptyCheckpoint('1280x720', 'settled-v1');
    markDone(cp, 'high', 'van_lam', [pt('van_lam', 'san'), pt('van_lam', 'cong')]);
    expect(isDone(cp, 'high', 'van_lam')).toBe(true);
    expect(isDone(cp, 'high', 'van_hai')).toBe(false);
    expect(isDone(cp, 'medium', 'van_lam')).toBe(false);
    expect(cp.points).toHaveLength(2);
    markDone(cp, 'high', 'van_lam', [pt('van_lam', 'san')]);
    expect(cp.points.map((p) => p.id)).toEqual(['van_lam/san']);
    expect(cp.done).toEqual([doneKey('high', 'van_lam')]);
  });

  it('không xóa điểm của preset/mục tiêu khác', () => {
    const cp = emptyCheckpoint('1280x720');
    markDone(cp, 'high', 'a', [pt('a', 'x')]);
    markDone(cp, 'medium', 'a', [pt('a', 'x', 'medium')]);
    markDone(cp, 'high', 'b', [pt('b', 'x')]);
    expect(cp.points).toHaveLength(3);
  });

  it('incompatibility: trùng viewport/cách đo thì ghép được, khác thì báo lý do', () => {
    const cp = emptyCheckpoint('1280x720', 'settled-v1');
    cp.backend = 'WebGPU';
    expect(incompatibility(cp, { viewport: '1280x720', method: 'settled-v1', backend: 'WebGPU' })).toBeNull();
    expect(incompatibility(cp, { viewport: '1920x1080', method: 'settled-v1' })).toContain('viewport');
    expect(incompatibility(cp, { viewport: '1280x720' })).toContain('cách đo');
    expect(incompatibility(cp, { viewport: '1280x720', method: 'settled-v1', backend: 'WebGL2' })).toContain('backend');
  });
});

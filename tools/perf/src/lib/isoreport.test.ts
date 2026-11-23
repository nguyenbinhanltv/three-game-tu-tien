import { describe, expect, it } from 'vitest';
import { bucketGroups, categorize, compareRuns, quant, stat, toMarkdown, topHeavy, type IsoPoint, type IsoRun } from './isoreport';

const pt = (id: string, dc: number, cpu: number, preset = 'high'): IsoPoint => ({
  id,
  target: id.split('/')[0]!,
  kind: 'map',
  preset,
  frames: 10,
  fps: 100,
  cpuMs: { p50: cpu, p95: cpu, max: cpu, mean: cpu },
  parts: { render: 1 },
  gpuMs: null,
  drawCalls: { p50: dc, max: dc },
  triangles: { p50: 500_000, max: 600_000 },
  textures: 1,
  textureMB: 100,
  geometries: 1,
  materials: 1,
  gpuMemMB: 120,
  jsHeapMB: null,
  monsters: 0,
  byCat: bucketGroups([]),
  topGroups: [],
});
const run = (points: IsoPoint[]): IsoRun => ({ version: 1, date: 'd', adapter: 'x', backend: 'WebGPU', viewport: '1280x720', quick: false, firstLoadMB: 20, points, errors: [] });

describe('isoreport', () => {
  it('quant/stat', () => {
    expect(quant([1, 2, 3, 4], 0.5)).toBe(3);
    expect(stat([4, 1, 3, 2]).max).toBe(4);
    expect(stat([]).p95).toBe(0);
  });
  it('categorize', () => {
    expect(categorize('grass | blade | MeshBasic')).toBe('cỏ');
    expect(categorize('scene | terrain-tile | X')).toBe('địa hình');
    expect(categorize('sect | roof | X')).toBe('kiến trúc/đá');
    expect(categorize('zzz | ·')).toBe('khác');
  });
  it('bucketGroups cộng đúng', () => {
    const b = bucketGroups([
      { key: 'sect | roof', dc: 3, tris: 100, shadow: 1 },
      { key: 'sect | wall', dc: 2, tris: 50, shadow: 0 },
    ]);
    expect(b['kiến trúc/đá']).toEqual({ dc: 5, tris: 150, shadow: 1 });
  });
  it('compareRuns báo đổi > 10% và bỏ nhiễu nhỏ', () => {
    const d = compareRuns(run([pt('a/b', 200, 5)]), run([pt('a/b', 150, 5.1)]));
    expect(d.map((x) => x.metric)).toEqual(['draw call p50']);
    expect(d[0]!.pct).toBe(-25);
  });
  it('topHeavy xếp theo nặng và md có bảng', () => {
    const r = run([pt('a/1', 100, 2), pt('a/2', 300, 6)]);
    expect(topHeavy(r, 'high', 1)[0]!.id).toBe('a/2');
    expect(toMarkdown(r)).toContain('| a/2 | 300 |');
  });
});

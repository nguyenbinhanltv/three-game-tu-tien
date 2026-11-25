import { describe, expect, it } from 'vitest';
import { bucketGroups, type IsoPoint, type IsoRun } from './isoreport';
import { classify, failed, findingsToMarkdown, gate, toBaseline, ZONE_BUDGETS, type Baseline } from './gate';

const pt = (
  id: string,
  kind: IsoPoint['kind'],
  o: { dc?: number; tris?: number; tex?: number; cpu?: number; heap?: number | null; preset?: string } = {},
): IsoPoint => ({
  id,
  target: id.split('/')[0]!,
  kind,
  preset: o.preset ?? 'high',
  frames: 10,
  fps: 100,
  cpuMs: { p50: 3, p95: o.cpu ?? 4, max: 5, mean: 3 },
  parts: {},
  gpuMs: null,
  drawCalls: { p50: o.dc ?? 80, max: o.dc ?? 80 },
  triangles: { p50: o.tris ?? 500_000, max: o.tris ?? 500_000 },
  textures: 1,
  textureMB: o.tex ?? 200,
  geometries: 1,
  materials: 1,
  gpuMemMB: 100,
  jsHeapMB: o.heap === undefined ? 200 : o.heap,
  monsters: 0,
  byCat: bucketGroups([]),
  topGroups: [],
});
const run = (points: IsoPoint[], errors: string[] = []): IsoRun => ({
  version: 1,
  date: 'd',
  adapter: 'x',
  backend: 'WebGPU',
  viewport: '1280x720',
  quick: false,
  devBytesMB: null,
  points,
  errors,
});

describe('classify', () => {
  it('phân vùng theo loại điểm', () => {
    expect(classify(pt('van_lam/san', 'map'))).toBe('tong_mon');
    expect(classify(pt('van_lam/rung_1', 'map'))).toBe('dong');
    expect(classify(pt('van_hai/giua', 'map'))).toBe('dong');
    expect(classify(pt('phuc_mach/giua', 'dungeon'))).toBe('phoban');
    expect(classify(pt('kieu_3/giua', 'kieu'))).toBe('phongnho');
    expect(classify(pt('do_kiep/giua', 'trib'))).toBe('phongnho');
    expect(classify(pt('fight/dong', 'fight'))).toBe('dong');
  });
});

describe('gate', () => {
  it('đạt khi trong ngân sách, không có baseline', () => {
    expect(failed(gate(run([pt('van_hai/giua', 'map')]), null))).toBe(false);
  });

  it('chặn khi vượt ngân sách mà chưa có baseline cho điểm đó', () => {
    const f = gate(run([pt('phuc_mach/giua', 'dungeon', { dc: ZONE_BUDGETS.phoban.drawCalls + 10 })]), null);
    expect(failed(f)).toBe(true);
    expect(f[0]).toMatchObject({ metric: 'draw call (max)', why: 'vượt ngân sách', severity: 'fail' });
  });

  it('ratchet: đã vượt sẵn trong baseline thì không chặn nếu không tệ hơn quá 10%', () => {
    const base: Baseline = toBaseline(run([pt('van_lam/rung_1', 'map', { tex: 515 })]));
    expect(failed(gate(run([pt('van_lam/rung_1', 'map', { tex: 520 })]), base))).toBe(false);
    const f = gate(run([pt('van_lam/rung_1', 'map', { tex: 600 })]), base);
    expect(failed(f)).toBe(true);
    expect(f[0]).toMatchObject({ metric: 'texture MB', why: 'tệ hơn baseline' });
  });

  it('chặn khi tệ hơn baseline quá 10% dù còn trong ngân sách; bỏ qua chênh nhỏ tuyệt đối', () => {
    const base = toBaseline(run([pt('van_hai/giua', 'map', { dc: 100, tris: 500_000 })]));
    expect(failed(gate(run([pt('van_hai/giua', 'map', { dc: 120 })]), base))).toBe(true);
    // +4 draw call trên nền 40 là +10% nhưng dưới ngưỡng tuyệt đối 5: không chặn.
    const small = toBaseline(run([pt('van_hai/giua', 'map', { dc: 40 })]));
    expect(failed(gate(run([pt('van_hai/giua', 'map', { dc: 44 })]), small))).toBe(false);
  });

  it('ms chỉ cảnh báo, không chặn', () => {
    const base = toBaseline(run([pt('van_hai/giua', 'map', { cpu: 4 })]));
    const f = gate(run([pt('van_hai/giua', 'map', { cpu: 9 })]), base);
    expect(failed(f)).toBe(false);
    expect(f.some((x) => x.severity === 'warn' && x.metric === 'CPU p95 ms')).toBe(true);
  });

  it('chỉ xét preset được chọn; thiếu điểm so baseline là cảnh báo', () => {
    const base = toBaseline(run([pt('a/x', 'map'), pt('b/y', 'map')]));
    const f = gate(run([pt('a/x', 'map'), pt('c/z', 'map', { preset: 'ultra', dc: 999 })]), base);
    expect(failed(f)).toBe(false);
    expect(f.filter((x) => x.why === 'thiếu điểm').map((x) => x.id)).toEqual(['b/y']);
  });

  it('lỗi console luôn chặn; heap vượt chặn', () => {
    expect(failed(gate(run([pt('a/x', 'map')], ['TypeError: x']), null))).toBe(true);
    expect(failed(gate(run([pt('a/x', 'map', { heap: 450 })]), null))).toBe(true);
    expect(failed(gate(run([pt('a/x', 'map', { heap: null })]), null))).toBe(false);
  });

  it('bảng markdown nêu kết quả', () => {
    const r = run([pt('phuc_mach/giua', 'dungeon', { dc: 200 })]);
    const f = gate(r, null);
    const md = findingsToMarkdown(f, r, null);
    expect(md).toContain('KHÔNG ĐẠT');
    expect(md).toContain('phuc_mach/giua');
    expect(findingsToMarkdown([], r, null)).toContain('ĐẠT');
  });
});

describe('toBaseline', () => {
  it('giữ đủ trường gọn', () => {
    const b = toBaseline(run([pt('a/x', 'map', { dc: 90, tris: 123_000, tex: 150, cpu: 5, heap: 220 })]), 'ghi chú');
    expect(b).toMatchObject({ version: 1, note: 'ghi chú' });
    expect(b.points[0]).toEqual({ id: 'a/x', preset: 'high', dc: 90, tris: 123_000, texMB: 150, heapMB: 220, cpu95: 5 });
  });
});

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

  it('lỗ hổng bậc thang: baseline đang đạt ngân sách mà nay vượt (dù chưa quá tol) vẫn bị chặn', () => {
    const budget = ZONE_BUDGETS.tong_mon.drawCalls;
    const base = toBaseline(run([pt('van_lam/san', 'map', { dc: budget - 5 })]));
    const f = gate(run([pt('van_lam/san', 'map', { dc: budget + 3 })]), base);
    expect(failed(f)).toBe(true);
    expect(f[0]).toMatchObject({ metric: 'draw call (max)', why: 'vượt ngân sách', severity: 'fail', limit: budget });
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
    // `b/y` thuộc mục tiêu `b` mà lần chạy không đo: không báo thiếu.
    expect(f.filter((x) => x.why === 'thiếu điểm')).toEqual([]);
    const g = gate(run([pt('a/x', 'map')]), toBaseline(run([pt('a/x', 'map'), pt('a/y', 'map')])));
    expect(g.filter((x) => x.why === 'thiếu điểm').map((x) => x.id)).toEqual(['a/y']);
  });

  it('lỗi console luôn chặn; heap vượt chỉ cảnh báo (dao động theo GC)', () => {
    expect(failed(gate(run([pt('a/x', 'map')], ['TypeError: x']), null))).toBe(true);
    const f = gate(run([pt('a/x', 'map', { heap: 450 })]), null);
    expect(failed(f)).toBe(false);
    expect(f.some((x) => x.severity === 'warn' && x.metric === 'heap JS MB')).toBe(true);
    expect(failed(gate(run([pt('a/x', 'map', { heap: null })]), null))).toBe(false);
  });

  it('lỗi console đã có trong baseline chỉ cảnh báo; lỗi mới vẫn chặn', () => {
    const base = toBaseline(run([pt('a/x', 'map')], ['nợ cũ']));
    expect(failed(gate(run([pt('a/x', 'map')], ['nợ cũ']), base))).toBe(false);
    const f = gate(run([pt('a/x', 'map')], ['nợ cũ', 'lỗi mới']), base);
    expect(failed(f)).toBe(true);
    expect(f.filter((y) => y.severity === 'fail').map((y) => y.metric)).toEqual(['lỗi mới']);
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

describe('baseline khác backend', () => {
  const webgl = (points: IsoPoint[]): IsoRun => ({ ...run(points), backend: 'WebGL2' });

  it('chặn khi baseline đo ở backend khác, không so số chéo', () => {
    const base = toBaseline(run([pt('a/x', 'map', { dc: 80 })]));
    const f = gate(webgl([pt('a/x', 'map', { dc: 80 })]), base);
    expect(failed(f)).toBe(true);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ why: 'baseline khác backend', severity: 'fail' });
    expect(f[0]!.metric).toContain('WebGPU');
    expect(f[0]!.metric).toContain('WebGL2');
  });

  it('chặn khi khác viewport', () => {
    const base = toBaseline(run([pt('a/x', 'map')]));
    const r = { ...run([pt('a/x', 'map')]), viewport: '1920x1080' };
    expect(gate(r, base)[0]).toMatchObject({ why: 'baseline khác backend', severity: 'fail' });
  });

  it('--ignore-baseline-mismatch: cảnh báo, bỏ baseline, vẫn áp ngân sách vùng', () => {
    const base = toBaseline(run([pt('phuc_mach/giua', 'dungeon', { dc: 500 })]));
    const ok = gate(webgl([pt('phuc_mach/giua', 'dungeon', { dc: 100 })]), base, { ignoreBaselineMismatch: true });
    expect(failed(ok)).toBe(false);
    expect(ok.some((x) => x.why === 'baseline khác backend' && x.severity === 'warn')).toBe(true);
    const bad = gate(webgl([pt('phuc_mach/giua', 'dungeon', { dc: 300 })]), base, { ignoreBaselineMismatch: true });
    expect(failed(bad)).toBe(true);
  });

  it('baseline cũ không ghi backend thì không so khớp', () => {
    const base = toBaseline(run([pt('a/x', 'map')]));
    delete base.backend;
    delete base.viewport;
    expect(failed(gate(webgl([pt('a/x', 'map')]), base))).toBe(false);
  });
});

describe('toBaseline', () => {
  it('giữ đủ trường gọn', () => {
    const b = toBaseline(run([pt('a/x', 'map', { dc: 90, tris: 123_000, tex: 150, cpu: 5, heap: 220 })]), 'ghi chú');
    expect(b).toMatchObject({ version: 1, note: 'ghi chú', backend: 'WebGPU', viewport: '1280x720' });
    expect(b.points[0]).toEqual({ id: 'a/x', preset: 'high', dc: 90, tris: 123_000, texMB: 150, heapMB: 220, cpu95: 5 });
  });
});

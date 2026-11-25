// Cổng đo bản đồ (B2 của kế hoạch hiệu năng): phần thuần, không đụng trình duyệt nên có test.
// Đầu vào là kết quả `pnpm perf:iso` (IsoRun) và, nếu có, baseline gọn của `main`.
// Luật:
//  - CHẶN (fail) trên SỐ ĐẾM không phụ thuộc máy: draw call, tam giác, texture MB, lỗi console. Heap JS và ms CPU chỉ cảnh báo (heap dao động theo GC và độ dài lần chạy: cùng điểm 189 và 259 MB ở hai lần chạy khác nhau).
//  - Vượt ngân sách vùng mà baseline đã vượt sẵn thì chỉ chặn khi TỆ HƠN baseline quá `tol` (ratchet: không ai làm xấu thêm).
//  - Mọi chỉ số tệ hơn baseline quá `tol` (và quá ngưỡng tuyệt đối nhỏ) đều chặn, dù chưa vượt ngân sách.
//  - ms (CPU p95) chỉ GHI/cảnh báo: phụ thuộc máy, nhiễu giữa các lượt, không chặn.
import { round, type IsoPoint, type IsoRun } from './isoreport';

export type ZoneClass = 'tong_mon' | 'dong' | 'phoban' | 'phongnho';

export interface ZoneBudget {
  drawCalls: number;
  triangles: number;
  textureMB: number;
  /** Chỉ cảnh báo. */
  cpuP95: number;
}

/** Ngân sách theo vùng, mức Cao (kế hoạch hiệu năng bản đồ, mục 3). */
export const ZONE_BUDGETS: Record<ZoneClass, ZoneBudget> = {
  tong_mon: { drawCalls: 130, triangles: 1_000_000, textureMB: 400, cpuP95: 6 },
  dong: { drawCalls: 200, triangles: 1_400_000, textureMB: 450, cpuP95: 7 },
  phoban: { drawCalls: 140, triangles: 900_000, textureMB: 400, cpuP95: 7 },
  phongnho: { drawCalls: 100, triangles: 600_000, textureMB: 350, cpuP95: 5 },
};
/** Heap JS toàn cục (MB). */
export const HEAP_MB_MAX = 400;

/** Cấp vùng của một điểm đo: sân/cổng tông môn Vân Lam là `tong_mon`, bản đồ còn lại `dong`, phó bản `phoban`, phòng cầu/độ kiếp `phongnho`. */
export function classify(p: Pick<IsoPoint, 'id' | 'kind' | 'target'>): ZoneClass {
  if (p.kind === 'dungeon') return 'phoban';
  if (p.kind === 'kieu' || p.kind === 'trib') return 'phongnho';
  const spot = p.id.slice(p.target.length + 1);
  if (p.kind === 'map' && p.target === 'van_lam' && /^(san|cong|tong_mon)/.test(spot)) return 'tong_mon';
  return 'dong';
}

/** Baseline gọn (đủ cho cổng, ~vài chục KB): một dòng mỗi (điểm, preset). */
export interface BaselinePoint {
  id: string;
  preset: string;
  dc: number;
  tris: number;
  texMB: number;
  heapMB: number | null;
  cpu95: number;
}
export interface Baseline {
  version: 1;
  date: string;
  note?: string;
  /** Backend/viewport lúc đo: số đếm khác nhau thật giữa WebGPU và WebGL2 (đèn điểm chỉ WebGPU, trần pixel WebGL2…), nên không so chéo. */
  backend?: string;
  viewport?: string;
  /** Lỗi console đã có sẵn lúc lập baseline (nợ đã biết): không chặn, chỉ cảnh báo; lỗi MỚI vẫn chặn. */
  errors?: string[];
  points: BaselinePoint[];
}

export function toBaseline(run: IsoRun, note?: string): Baseline {
  return {
    version: 1,
    date: run.date,
    ...(note ? { note } : {}),
    backend: run.backend,
    viewport: run.viewport,
    errors: [...new Set(run.errors)].slice(0, 50),
    points: run.points.map((p) => ({
      id: p.id,
      preset: p.preset,
      dc: p.drawCalls.max,
      tris: p.triangles.max,
      texMB: p.textureMB,
      heapMB: p.jsHeapMB,
      cpu95: p.cpuMs.p95,
    })),
  };
}

export type Severity = 'fail' | 'warn';
export interface Finding {
  severity: Severity;
  id: string;
  preset: string;
  metric: string;
  value: number;
  /** Giới hạn đã áp (ngân sách hoặc baseline×(1+tol)). */
  limit: number;
  why: 'vượt ngân sách' | 'tệ hơn baseline' | 'cảnh báo không chặn' | 'lỗi console' | 'thiếu điểm' | 'baseline khác backend';
}

export interface GateOptions {
  /** Cỡ chênh cho phép so baseline (mặc định 10%). */
  tol?: number;
  /** Chỉ xét các preset này (mặc định `high`: ngân sách ghi cho mức Cao). */
  presets?: string[];
  /** Baseline đo ở backend/viewport khác: mặc định CHẶN (không so chéo); bật cờ này thì bỏ qua baseline, chỉ xét ngân sách vùng (+ cảnh báo). */
  ignoreBaselineMismatch?: boolean;
}

interface Metric {
  name: string;
  value: number;
  base: number | null;
  budget: number | null;
  /** Chênh tuyệt đối tối thiểu để tính là "tệ hơn" (chống nhiễu nhỏ). */
  minAbs: number;
  /** ms: chỉ cảnh báo. */
  soft: boolean;
}

function metricsOf(p: IsoPoint, b: BaselinePoint | undefined, z: ZoneBudget): Metric[] {
  return [
    { name: 'draw call (max)', value: p.drawCalls.max, base: b?.dc ?? null, budget: z.drawCalls, minAbs: 5, soft: false },
    { name: 'tam giác (max)', value: p.triangles.max, base: b?.tris ?? null, budget: z.triangles, minAbs: 20_000, soft: false },
    { name: 'texture MB', value: p.textureMB, base: b?.texMB ?? null, budget: z.textureMB, minAbs: 4, soft: false },
    ...(p.jsHeapMB === null
      ? []
      : [{ name: 'heap JS MB', value: p.jsHeapMB, base: b?.heapMB ?? null, budget: HEAP_MB_MAX, minAbs: 8, soft: true }]),
    { name: 'CPU p95 ms', value: p.cpuMs.p95, base: b?.cpu95 ?? null, budget: z.cpuP95, minAbs: 0.5, soft: true },
  ];
}

/** Áp luật cổng lên một lần chạy. Trả mọi phát hiện; `failed(findings)` cho biết có chặn không. */
export function gate(run: IsoRun, baseIn: Baseline | null, opts: GateOptions = {}): Finding[] {
  let base = baseIn;
  const early: Finding[] = [];
  if (base && ((base.backend && base.backend !== run.backend) || (base.viewport && base.viewport !== run.viewport))) {
    const f: Finding = {
      severity: opts.ignoreBaselineMismatch ? 'warn' : 'fail',
      id: '(baseline)',
      preset: '-',
      metric: `baseline ${base.backend ?? '?'} ${base.viewport ?? '?'} ≠ lần chạy ${run.backend} ${run.viewport}`,
      value: 0,
      limit: 0,
      why: 'baseline khác backend',
    };
    if (!opts.ignoreBaselineMismatch) return [f];
    early.push(f);
    base = null;
  }
  const tol = opts.tol ?? 0.1;
  const presets = new Set(opts.presets ?? ['high']);
  const bmap = new Map((base?.points ?? []).map((b) => [`${b.preset}|${b.id}`, b]));
  const out: Finding[] = [...early];
  const seen = new Set<string>();
  for (const p of run.points) {
    if (!presets.has(p.preset)) continue;
    seen.add(`${p.preset}|${p.id}`);
    const b = bmap.get(`${p.preset}|${p.id}`);
    const z = ZONE_BUDGETS[classify(p)];
    for (const m of metricsOf(p, b, z)) {
      const sev: Severity = m.soft ? 'warn' : 'fail';
      const worse = m.base !== null && m.value > m.base * (1 + tol) && m.value - m.base >= m.minAbs;
      const over = m.budget !== null && m.value > m.budget;
      if (worse) {
        out.push({
          severity: sev,
          id: p.id,
          preset: p.preset,
          metric: m.name,
          value: m.value,
          limit: round(m.base! * (1 + tol)),
          why: m.soft ? 'cảnh báo không chặn' : 'tệ hơn baseline',
        });
      } else if (over && (m.base === null || m.base <= m.budget!)) {
        // Ngân sách vùng là cổng cứng, trừ điểm mà CHÍNH baseline đã vượt (ratchet: chỉ chặn khi tệ hơn baseline, xét ở nhánh trên).
        // Điểm đang đạt ngân sách trong baseline mà nay vượt (dù chưa quá `tol`) là hồi quy thật nên bị chặn.
        out.push({
          severity: sev,
          id: p.id,
          preset: p.preset,
          metric: m.name,
          value: m.value,
          limit: m.budget!,
          why: m.soft ? 'cảnh báo không chặn' : 'vượt ngân sách',
        });
      }
    }
  }
  // Chỉ báo thiếu điểm của mục tiêu mà lần chạy CÓ đo (chạy `--only` một vài bản đồ không bị báo thiếu các bản đồ còn lại).
  const ranTargets = new Set(run.points.map((p) => `${p.preset}|${p.target}`));
  for (const b of base?.points ?? []) {
    const target = b.id.slice(0, b.id.indexOf('/'));
    if (presets.has(b.preset) && ranTargets.has(`${b.preset}|${target}`) && !seen.has(`${b.preset}|${b.id}`))
      out.push({ severity: 'warn', id: b.id, preset: b.preset, metric: 'điểm đo', value: 0, limit: 0, why: 'thiếu điểm' });
  }
  const known = new Set(base?.errors ?? []);
  for (const e of [...new Set(run.errors)].slice(0, 20)) {
    out.push({
      severity: known.has(e) ? 'warn' : 'fail',
      id: '(console)',
      preset: '-',
      metric: e.slice(0, 120),
      value: 0,
      limit: 0,
      why: 'lỗi console',
    });
  }
  return out;
}

export const failed = (f: Finding[]): boolean => f.some((x) => x.severity === 'fail');

/** Bảng markdown dán vào mô tả PR. */
export function findingsToMarkdown(f: Finding[], run: IsoRun, base: Baseline | null): string {
  const L: string[] = [
    '# perf:gate',
    '',
    `Lần chạy ${run.date} · ${run.backend} · ${run.viewport} · baseline: ${base ? base.date : 'không có (chỉ xét ngân sách vùng)'}`,
    '',
  ];
  const fails = f.filter((x) => x.severity === 'fail');
  const warns = f.filter((x) => x.severity === 'warn');
  L.push(
    fails.length ? `**KHÔNG ĐẠT**: ${fails.length} lỗi chặn, ${warns.length} cảnh báo.` : `**ĐẠT**: 0 lỗi chặn, ${warns.length} cảnh báo.`,
    '',
  );
  if (f.length) {
    L.push('| mức | điểm | preset | chỉ số | giá trị | giới hạn | lý do |', '|---|---|---|---|---:|---:|---|');
    for (const x of [...fails, ...warns])
      L.push(
        `| ${x.severity === 'fail' ? 'CHẶN' : 'cảnh báo'} | ${x.id} | ${x.preset} | ${x.metric} | ${x.value} | ${x.limit} | ${x.why} |`,
      );
    L.push('');
  }
  return L.join('\n');
}

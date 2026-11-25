// pnpm perf:gate: cổng đo bản đồ (B2). Đọc kết quả `pnpm perf:iso`, áp ngân sách vùng + so baseline (xem lib/gate.ts).
//
//   pnpm perf:gate <iso-*.json> [--baseline tools/perf/baselines/iso-high.json] [--tol 0.1] [--presets high] [--md <file>]
//   pnpm perf:gate --make-baseline <iso-*.json> --out tools/perf/baselines/iso-high.json [--note "main <sha>"]
//   pnpm perf:gate --run [--only van_lam,kiem_trung] ...   chạy `perf:iso` (cần trình duyệt, xin lượt) rồi áp cổng
//
// Thoát mã 1 khi có lỗi chặn (số đếm vượt ngân sách/tệ hơn baseline, lỗi console). ms chỉ cảnh báo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, flag, opt as optEnv } from './lib/env';
import { failed, findingsToMarkdown, gate, toBaseline, type Baseline } from './lib/gate';
import type { IsoRun } from './lib/isoreport';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const opt = (n: string, d = ''): string => optEnv(n, d);
const has = flag;
/** Đối số vị trí đầu tiên không phải cờ hoặc giá trị của cờ. */
const positional = (): string | undefined => {
  const withValue = new Set(['--baseline', '--tol', '--presets', '--md', '--out', '--note', '--only']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      if (withValue.has(a)) i++;
      continue;
    }
    return a;
  }
  return undefined;
};
const readRun = (f: string): IsoRun => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) as IsoRun;

function latestIso(dir: string): string {
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /^iso-.*\.json$/.test(f))
        .sort()
    : [];
  if (!files.length) throw new Error(`không có iso-*.json trong ${dir}`);
  return path.join(dir, files[files.length - 1]!);
}

let input = positional() ?? '';
if (has('--run')) {
  const outDir = path.join(ROOT, 'bench/results');
  const extra = ['--presets', opt('--presets', 'high')];
  if (opt('--only')) extra.push('--only', opt('--only'));
  console.log('[perf-gate] chạy perf:iso (cần trình duyệt)…');
  execFileSync('pnpm', ['--filter', '@dtl/perf', 'iso', '--', ...extra, '--out', outDir], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  input = latestIso(outDir);
}
if (!input) {
  console.error('thiếu đường dẫn iso-*.json (hoặc dùng --run). Xem đầu tools/perf/src/gate.ts');
  process.exit(2);
}
const run = readRun(input);

if (has('--make-baseline')) {
  const out = opt('--out');
  if (!out) {
    console.error('--make-baseline cần --out <file>');
    process.exit(2);
  }
  const b = toBaseline(run, opt('--note') || undefined);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), JSON.stringify(b, null, 1) + '\n');
  console.log(`[perf-gate] ghi baseline ${out}: ${b.points.length} dòng`);
  process.exit(0);
}

const baseFile = opt('--baseline');
const base: Baseline | null =
  baseFile && fs.existsSync(path.resolve(baseFile)) ? (JSON.parse(fs.readFileSync(path.resolve(baseFile), 'utf8')) as Baseline) : null;
if (baseFile && !base) console.warn(`[perf-gate] không thấy baseline ${baseFile}: chỉ xét ngân sách vùng`);
const findings = gate(run, base, { tol: Number(opt('--tol', '0.1')), presets: opt('--presets', 'high').split(',') });
const md = findingsToMarkdown(findings, run, base);
console.log(md);
if (opt('--md')) fs.writeFileSync(path.resolve(opt('--md')), md);
process.exit(failed(findings) ? 1 : 0);

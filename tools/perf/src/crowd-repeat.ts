// pnpm --filter @dtl/perf crowd:repeat -- [--runs 5] [--tag nhan] [các cờ của crowd.ts, mặc định: --bots 50 --scenes rung --renderers webgpu --presets medium --seconds 12]
// Chạy bench:crowd nhiều lượt liên tiếp và in trung vị / khoảng của CPU p50, p95, draw call: số đo một lượt nhiễu ±1,5 ms.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/devserver';
import { at } from '@dtl/shared';

const argv = process.argv.slice(2);
const take = (n: string, d: string): string => {
  const i = argv.indexOf(n);
  if (i < 0) return d;
  const v = argv[i + 1] ?? d;
  argv.splice(i, 2);
  return v;
};
const RUNS = Number(take('--runs', '5'));
const TAG = take('--tag', 'run');
const pass = argv.length ? argv : ['--bots', '50', '--scenes', 'rung', '--renderers', 'webgpu', '--presets', 'medium', '--seconds', '12'];
const med = (a: number[]): number =>
  at(
    [...a].sort((x, y) => x - y),
    Math.floor(a.length / 2),
    'bảng',
  );
const p95s: number[] = [];
const p50s: number[] = [];
const draws: number[] = [];
for (let i = 0; i < RUNS; i++) {
  const r = spawnSync('pnpm', ['--filter', '@dtl/perf', 'crowd', ...pass], { encoding: 'utf8', shell: true, timeout: 600_000 });
  const line = (r.stdout ?? '').split('\n').find((l) => /^\S+\s+\d+\s+(WebGPU|WebGL2)/.test(l.trim() ? l : ''));
  if (!line) {
    console.log(`lượt ${i + 1}: không có kết quả`);
    continue;
  }
  const f = line.trim().split(/\s+/);
  // cảnh bot backend preset fps cpu50 p95 p99 gpu50 gpu95 draw ...
  p50s.push(Number(f[5]));
  p95s.push(Number(f[6]));
  draws.push(Number(f[10]));
  console.log(`lượt ${i + 1}: ${line.trim()}`);
}
const out = { tag: TAG, runs: p95s.length, p50Median: med(p50s), p95Median: med(p95s), p95All: p95s, drawMedian: med(draws) };
console.log(JSON.stringify(out));
const outDir = path.join(ROOT, 'bench/results');
fs.mkdirSync(outDir, { recursive: true });
fs.appendFileSync(path.join(outDir, 'crowd-repeat.jsonl'), JSON.stringify(out) + '\n');

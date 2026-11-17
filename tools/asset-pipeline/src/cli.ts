// Điểm vào dòng lệnh của pipeline asset.
//   tsx src/cli.ts build    [--only <id>] [--force] [--no-ktx]   Blender (tools/blender/run.mjs) rồi optimize
//   tsx src/cli.ts optimize [--only <id>] [--force] [--no-ktx] [--raw <dir>] [--out <dir>] [--cache <file>]
//   tsx src/cli.ts validate [--only <id>] [--raw <dir>] [--out <dir>]
// Lệnh ở gốc repo: pnpm assets:build, pnpm assets:validate.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.js';
import { optimize, parseArgs } from './optimize.js';
import { validate } from './validate.js';

const [cmd = 'build', ...args] = process.argv.slice(2).filter((a) => a !== '--');
const t0 = performance.now();
const secs = () => ((performance.now() - t0) / 1000).toFixed(1);

async function runOptimize(): Promise<boolean> {
  let report;
  try {
    report = await optimize(parseArgs(args));
  } catch (e) {
    console.error(`[optimize] LỖI: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  for (const f of report.failed) console.error(`[optimize] LỖI ${f.id}: ${f.error}`);
  console.log(
    `[optimize] ${report.built.length} build, ${report.cached.length} dùng cache, ${report.failed.length} lỗi, ${report.warnings.length} cảnh báo — ${secs()}s`,
  );
  return report.failed.length === 0;
}

async function runValidate(): Promise<boolean> {
  const opts = parseArgs(args);
  const report = await validate({ only: opts.only, rawDir: opts.rawDir, outDir: opts.outDir });
  for (const id of report.checked) {
    const errs = report.errors.filter((e) => e.id === id);
    const h = report.heights[id]?.rest;
    console.log(`[validate] ${errs.length ? 'KHÔNG ĐẠT' : 'đạt'} ${id}${h ? ` (cao ${h.build}m, raw ${h.raw}m)` : ''}`);
  }
  for (const w of report.warnings) console.warn(`[validate] cảnh báo ${w.id}: ${w.message}`);
  for (const e of report.errors) console.error(`[validate] LỖI ${e.id}: ${e.message}`);
  console.log(`[validate] ${report.checked.length} asset, ${report.errors.length} lỗi, ${report.warnings.length} cảnh báo — ${secs()}s`);
  return report.errors.length === 0;
}

let ok = true;
if (cmd === 'build') {
  const blenderArgs = args.filter((a, i) => a === '--force' || a === '--only' || args[i - 1] === '--only');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/blender/run.mjs'), ...blenderArgs], { stdio: 'inherit', cwd: ROOT });
  ok = r.status === 0 && (await runOptimize());
  if (ok) console.log('Xong. Kiểm bằng: pnpm assets:validate');
} else if (cmd === 'optimize') ok = await runOptimize();
else if (cmd === 'validate') ok = await runValidate();
else {
  console.error(`Lệnh không rõ: ${cmd} (build | optimize | validate)`);
  ok = false;
}
process.exit(ok ? 0 : 1);

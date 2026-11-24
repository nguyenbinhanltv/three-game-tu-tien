// Điểm vào dòng lệnh của pipeline asset.
//   tsx src/cli.ts build    [--only <id>] [--force] [--no-ktx]   Blender (tools/blender/run.mjs) rồi optimize
//   tsx src/cli.ts optimize [--only <id>] [--force] [--no-ktx] [--raw <dir>] [--out <dir>] [--cache <file>]
//   tsx src/cli.ts validate [--only <id>] [--raw <dir>] [--out <dir>] [--no-r2]
//   tsx src/cli.ts lock | push [--dry] [--only <khóa>] | pull [--verify] | gc [--days N] [--apply]   (R2, xem push.ts/pull.ts/gc.ts)
// Lệnh ở gốc repo: pnpm assets:build, pnpm assets:validate.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.js';
import { optimize, parseArgs } from './optimize.js';
import { gc } from './gc.js';
import { pull } from './pull.js';
import { push } from './push.js';
import { assetBase } from './r2/env.js';
import { readLock, scanLock, unhashedBinaries, writeLock } from './r2/lock.js';
import { changedKeys, hasR2Credentials, readBaseLock, verifyLock, verifyRemote, verifyRemoteList } from './r2/verify.js';
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
  let ok = report.errors.length === 0;
  // R2: sổ khóa khớp đĩa, và (khi có VITE_ASSET_BASE, trừ --no-r2) mọi file trong sổ có trên R2.
  if (!args.includes('--no-r2') && !opts.only) {
    const lockErrs = await verifyLock();
    for (const e of lockErrs) console.error(`[validate] LỖI sổ khóa ${e}`);
    ok = ok && lockErrs.length === 0;
    const base = assetBase();
    // Có khóa R2 (máy dev) → một lượt ListObjectsV2; không có (CI) → HEAD công khai chỉ cho file mới/đổi so với main (cờ --all-head: HEAD tất cả).
    if (hasR2Credentials() && !args.includes('--all-head')) {
      const r = await verifyRemoteList();
      for (const w of r.warnings) console.warn(`[validate] cảnh báo R2: ${w}`);
      for (const e of r.errors) console.error(`[validate] LỖI R2 ${e}`);
      console.log(`[validate] R2 (ListObjectsV2): ${r.checked} file, ${r.errors.length} lỗi`);
      ok = ok && r.errors.length === 0;
    } else if (base) {
      const lockNow = readLock();
      const baseLock = args.includes('--all-head') ? null : readBaseLock();
      const r = await verifyRemote(base, lockNow, baseLock ? changedKeys(lockNow, baseLock) : undefined);
      for (const w of r.warnings) console.warn(`[validate] cảnh báo R2: ${w}`);
      for (const e of r.errors) console.error(`[validate] LỖI R2 ${e}`);
      console.log(`[validate] R2: ${r.checked} file, ${r.errors.length} lỗi`);
      ok = ok && r.errors.length === 0;
    } else console.log('[validate] bỏ qua kiểm R2 (chưa đặt VITE_ASSET_BASE)');
  }
  return ok;
}

const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

let ok = true;
if (cmd === 'build') {
  const blenderArgs = args.filter((a, i) => a === '--force' || a === '--only' || args[i - 1] === '--only');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/blender/run.mjs'), ...blenderArgs], { stdio: 'inherit', cwd: ROOT });
  ok = r.status === 0 && (await runOptimize());
  if (ok) console.log('Xong. Kiểm bằng: pnpm assets:validate');
} else if (cmd === 'optimize') ok = await runOptimize();
else if (cmd === 'validate') ok = await runValidate();
else if (cmd === 'lock') {
  const lock = await scanLock(readLock());
  const changed = writeLock(lock);
  console.log(`[lock] ${Object.keys(lock.files).length} file, ${changed ? 'đã cập nhật assets/asset-lock.json' : 'không đổi'}`);
  for (const k of unhashedBinaries(lock))
    console.warn(`[lock] CẢNH BÁO ${k}: nhị phân mới không có hash trong tên (cần <tên>.<hash10>.<đuôi>); assets:validate sẽ báo lỗi`);
} else if (cmd === 'push') {
  try {
    const r = await push({ dry: args.includes('--dry'), only: flag('--only'), noLock: args.includes('--no-lock') });
    console.log(
      `[push] ${r.total} file trong sổ, ${r.present} đã có trên R2, ${args.includes('--dry') ? 'sẽ đẩy' : 'đã đẩy'} ${r.uploaded.length} (${mb(r.uploadedBytes)}), ${r.failed.length} lỗi${r.lockChanged ? ', sổ khóa đã cập nhật' : ''}`,
    );
    for (const f of r.failed) console.error(`[push] LỖI ${f.key}: ${f.error}`);
    for (const c of r.conflicts) console.error(`[push] XUNG ĐỘT ${c.key}: ${c.reason}`);
    ok = r.failed.length === 0 && r.conflicts.length === 0;
  } catch (e) {
    console.error(`[push] LỖI: ${e instanceof Error ? e.message : String(e)}`);
    ok = false;
  }
} else if (cmd === 'pull') {
  try {
    const r = await pull({ base: flag('--base'), verify: args.includes('--verify'), only: flag('--only') });
    console.log(`[pull] ${r.total} file trong sổ, ${r.have} đã có, tải ${r.downloaded} (${mb(r.downloadedBytes)}), ${r.failed.length} lỗi`);
    for (const f of r.failed) console.error(`[pull] LỖI ${f.key}: ${f.error}`);
    ok = r.failed.length === 0;
  } catch (e) {
    console.error(`[pull] LỖI: ${e instanceof Error ? e.message : String(e)}`);
    ok = false;
  }
} else if (cmd === 'gc') {
  try {
    const apply = args.includes('--apply');
    const r = await gc({ days: flag('--days') ? Number(flag('--days')) : undefined, apply });
    const size = r.garbage.reduce((n, g) => n + g.size, 0);
    console.log(
      `[gc] ${r.total} object trên R2, ${r.referenced} khóa còn tham chiếu, ${r.garbage.length} rác (${mb(size)})${apply ? `, đã xóa ${r.deleted}` : ' — chạy thử, thêm --apply để xóa'}`,
    );
    for (const g of r.garbage.slice(0, 20)) console.log(`[gc]   ${g.key}`);
  } catch (e) {
    console.error(`[gc] LỖI: ${e instanceof Error ? e.message : String(e)}`);
    ok = false;
  }
} else {
  console.error(`Lệnh không rõ: ${cmd} (build | optimize | validate | lock | push | pull | gc)`);
  ok = false;
}
// Node trên Windows có thể abort (libuv UV_HANDLE_CLOSING) nếu thoát ngay khi socket fetch còn đang đóng: chờ một nhịp.
await new Promise((r) => setTimeout(r, 150));
process.exit(ok ? 0 : 1);

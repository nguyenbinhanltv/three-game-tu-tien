// Chặn nhị phân lớn trong git (R2-3): file ảnh/model/âm thanh/video > 200 KB dưới apps/client/public và docs/
// phải nằm trên R2 (asset game, `pnpm assets:push`) hoặc ở artifact phiên (ảnh duyệt PR), không commit.
//   node tools/docs/check-binaries.mjs            kiểm mọi file đang được git theo dõi (CI)
//   node tools/docs/check-binaries.mjs --staged   chỉ kiểm file đang staged (hook pre-commit)
// File cũ được ân hạn ở assets/binary-allowlist.txt (mỗi dòng một đường dẫn); danh sách chỉ được rút ngắn.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIMIT = 200 * 1024;
const DIRS = ['apps/client/public/', 'docs/'];
const BIN = /\.(glb|gltf|ktx2|webp|png|jpe?g|gif|webm|m4a|ogg|mp3|wav|mp4|mov|psd|blend)$/i;
const staged = process.argv.includes('--staged');

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
const allow = new Set(
  fs.existsSync(path.join(ROOT, 'assets/binary-allowlist.txt'))
    ? fs.readFileSync(path.join(ROOT, 'assets/binary-allowlist.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [],
);
const files = (staged ? git(['diff', '--cached', '--name-only', '--diff-filter=AM']) : git(['ls-files'])).split('\n').filter(Boolean);
const bad = [];
for (const f of files) {
  if (!DIRS.some((d) => f.startsWith(d)) || !BIN.test(f) || allow.has(f)) continue;
  let size;
  try {
    size = Number(git(['cat-file', '-s', staged ? `:${f}` : `HEAD:${f}`]).trim());
  } catch {
    size = fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).size : 0;
  }
  if (size > LIMIT) bad.push(`${f} (${(size / 1024).toFixed(0)} KB)`);
}
const stale = [...allow].filter((f) => !files.includes(f) && !staged);
if (stale.length) console.warn(`check-binaries: ${stale.length} dòng ân hạn đã lỗi thời, xóa khỏi assets/binary-allowlist.txt: ${stale.slice(0, 3).join(', ')}…`);
if (bad.length) {
  console.error(`check-binaries: ${bad.length} nhị phân > 200 KB không được commit:`);
  for (const b of bad) console.error('  ' + b);
  console.error('Asset game: để ở apps/client/public (gitignore) rồi `pnpm assets:push` (lên R2, cập nhật assets/asset-lock.json).');
  console.error('Ảnh/video duyệt PR: để ở artifact phiên (ao artifact add), không commit vào docs/.');
  process.exit(1);
}
console.log(`check-binaries: ${files.length} file${staged ? ' staged' : ''}, không có nhị phân > 200 KB ngoài danh sách ân hạn`);

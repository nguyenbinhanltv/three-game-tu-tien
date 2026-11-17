#!/usr/bin/env node
// Kiểm thư mục docs/ (R-1): không PNG, không file trên 400 KB, tổng dưới 60 MB,
// và mọi liên kết ảnh/video trong file .md đều trỏ tới file có thật.
// Chạy: node tools/docs/check.mjs  (hoặc pnpm docs:check). Không cần dependency.
//
// Quy ước: ảnh/video duyệt PR ghi vào thư mục artifact của phiên, KHÔNG commit vào repo.
// docs/<hạng mục>/ chỉ giữ README và tối đa 3–5 ảnh then chốt WebP (cạnh dài ≤ 1600 px, ≤ 300 KB).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MAX_FILE = 400 * 1024;
export const MAX_TOTAL = 60 * 1024 * 1024;
const MEDIA = /\.(png|jpe?g|webp|gif|avif|svg|webm|mp4|mov)$/i;
/** Thư mục của hạng mục đang làm dở lúc R-1 (worker khác giữ): miễn luật PNG/kích thước từng file, vẫn tính vào tổng. Gỡ ở R-2. */
const EXEMPT = ['docs/e4-c/'];
/** File md của bên thứ ba, không kiểm liên kết. */
const SKIP_MD = ['.claude/skills/guizang-game-skill/'];

/** Lấy đích của mọi liên kết ảnh/video trong một đoạn Markdown: `![..](đích)`, `[..](đích.ext)`, `<img|video|source src="đích">`. */
export function mediaLinks(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let fence = false;
  lines.forEach((ln, i) => {
    if (/^\s*(```|~~~)/.test(ln)) { fence = !fence; return; }
    if (fence) return;
    const src = ln.replace(/`[^`]*`/g, m => ' '.repeat(m.length)); // bỏ mã trong dòng
    for (const m of src.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      if (m[1] === '!' || MEDIA.test(m[2].split(/[?#]/)[0])) out.push({ line: i + 1, target: m[2] });
    }
    for (const m of src.matchAll(/<(?:img|video|source)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) out.push({ line: i + 1, target: m[1] });
  });
  return out;
}

/** Đường dẫn file (tương đối gốc repo, dấu `/`) mà liên kết trỏ tới; null nếu là liên kết ngoài. */
export function resolveLink(mdFile, target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('#')) return null;
  let t = target.split(/[?#]/)[0];
  try { t = decodeURIComponent(t); } catch { /* giữ nguyên */ }
  const p = t.startsWith('/') ? t.slice(1) : path.posix.join(path.posix.dirname(mdFile), t);
  return path.posix.normalize(p);
}

export function check(root = ROOT) {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString().split('\0').filter(Boolean);
  const exists = f => fs.existsSync(path.join(root, f));
  const errors = [];
  const warnings = [];
  let total = 0;
  const docs = tracked.filter(f => f.startsWith('docs/') && exists(f));
  for (const f of docs) {
    const size = fs.statSync(path.join(root, f)).size;
    total += size;
    if (EXEMPT.some(p => f.startsWith(p))) continue;
    if (/\.png$/i.test(f)) errors.push(`${f}: PNG không được nằm trong docs/ (chuyển WebP, cạnh dài ≤ 1600 px)`);
    if (size > MAX_FILE) errors.push(`${f}: ${(size / 1024).toFixed(0)} KB, vượt ${MAX_FILE / 1024} KB`);
  }
  if (total >= MAX_TOTAL) errors.push(`docs/ nặng ${(total / 1048576).toFixed(1)} MB, phải dưới ${MAX_TOTAL / 1048576} MB`);

  const mds = tracked.filter(f => /\.md$/i.test(f) && exists(f) && !SKIP_MD.some(p => f.startsWith(p)));
  const mentioned = new Set();
  let links = 0;
  for (const md of mds) {
    const text = fs.readFileSync(path.join(root, md), 'utf8');
    for (const { line, target } of mediaLinks(text)) {
      const p = resolveLink(md, target);
      if (!p) continue;
      links++;
      if (!exists(p)) errors.push(`${md}:${line}: liên kết ảnh hỏng → ${target}`);
    }
    if (md.startsWith('docs/')) {
      const top = md.split('/').length > 2 ? md.split('/').slice(0, 2).join('/') + '/' : 'docs/';
      for (const f of docs) if (MEDIA.test(f) && f.startsWith(top) && text.includes(path.posix.basename(f))) mentioned.add(f);
    }
    for (const f of docs) if (MEDIA.test(f) && !mentioned.has(f) && text.includes(f.replace(/^docs\//, ''))) mentioned.add(f);
  }
  // Cảnh báo (không chặn): ảnh không được md nào nhắc tên là ứng viên xóa.
  for (const f of docs) if (MEDIA.test(f) && !mentioned.has(f)) warnings.push(`${f}: không file .md nào nhắc tên`);
  return { errors, warnings, total, files: docs.length, links };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = check();
  for (const w of r.warnings) console.warn(`cảnh báo: ${w}`);
  for (const e of r.errors) console.error(`LỖI: ${e}`);
  console.log(`docs: ${r.files} file, ${(r.total / 1048576).toFixed(1)} MB (trần ${MAX_TOTAL / 1048576} MB), ${r.links} liên kết ảnh, ${r.warnings.length} cảnh báo, ${r.errors.length} lỗi`);
  process.exit(r.errors.length ? 1 : 0);
}

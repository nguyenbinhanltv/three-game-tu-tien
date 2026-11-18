#!/usr/bin/env node
// Kiểm đường dẫn file nêu trong CLAUDE.md, docs/handbook/*.md, skill và agent (R-2): mỗi `đường/dẫn/file.ext` trong
// dấu huyền phải trỏ tới file hoặc thư mục có thật. Chạy: node tools/docs/check-paths.mjs (hoặc pnpm docs:paths).
// Bỏ qua: mẫu có `<..>`, `*`, `|`, `{..}`, `$`, đường dẫn ngoài repo (`../`), URL, skill bên thứ ba, file sinh ra lúc chạy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_DIRS = ['.claude/skills/guizang-game-skill'];
/** Thư mục gốc để thử khi đường dẫn viết tắt (`game/engine.ts`, `ui/store.ts`, `levels/van_lam.json`...). */
const BASES = ['', 'apps/client/src', 'apps/client', 'apps/server/src', 'apps/server', 'apps/bot-client/src', 'apps/client/src/game', 'packages', 'packages/shared/src', 'packages/content', 'packages/content/data', 'packages/content/src', 'tools', 'assets', 'docs'];
/** File chỉ có sau khi chạy lệnh (không nằm trong git). */
const GENERATED = [/^bench\/results\//, /^apps\/client\/public\/(assets|audio|map|terrain|art|icons)\//, /^assets\/build\//, /\/dist\//, /\.local$/, /\.env/, /node_modules/, /^\.mcp\.json$/, /data\/game\.db$/, /^assets-online/];

const files = [];
const add = (p) => fs.existsSync(path.join(ROOT, p)) && files.push(p);
add('CLAUDE.md');
add('README.md');
for (const d of ['docs/handbook', '.claude/agents']) {
  if (!fs.existsSync(path.join(ROOT, d))) continue;
  for (const f of fs.readdirSync(path.join(ROOT, d))) if (f.endsWith('.md')) files.push(`${d}/${f}`);
}
const skills = path.join(ROOT, '.claude/skills');
if (fs.existsSync(skills)) {
  for (const s of fs.readdirSync(skills)) {
    const rel = `.claude/skills/${s}`;
    if (SKIP_DIRS.includes(rel)) continue;
    if (fs.existsSync(path.join(skills, s, 'SKILL.md'))) files.push(`${rel}/SKILL.md`);
  }
}

const exists = (p) => BASES.some((b) => fs.existsSync(path.join(ROOT, b, p)));
const bad = [];
let total = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(/`([^`\s]+)`/g)) {
      let t = m[1].replace(/[,;:.)]+$/, '').replace(/^\.\//, '');
      if (!/\//.test(t) || !/^[\w@.][\w@./-]*$/.test(t)) continue; // không phải đường dẫn thuần
      if (/^(https?:|\.\.\/|@|\/)/.test(t) || t.includes('..') || /^\d/.test(t)) continue;
      if (!/(\.[a-z0-9]{1,5}$)|\/$/.test(t)) continue; // phải có đuôi file hoặc kết thúc bằng /
      if (GENERATED.some((r) => r.test(t))) continue;
      t = t.replace(/\/$/, '');
      total++;
      if (!exists(t)) bad.push(`${f}:${i + 1}  ${t}`);
    }
  });
}
if (bad.length) {
  console.error(`docs:paths: ${bad.length}/${total} đường dẫn không tồn tại`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log(`docs:paths: ${total} đường dẫn trong ${files.length} file, 0 lỗi`);

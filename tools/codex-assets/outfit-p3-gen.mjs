#!/usr/bin/env node
// Sinh ảnh concept trang phục bậc 4 (P3-concept) bằng Codex (codex exec + công cụ ảnh tích hợp, không Tripo, không API key).
// Dùng: node tools/codex-assets/outfit-p3-gen.mjs [id…|tinh_khuyet|co_thanh|than_tang|kiem] [--jobs 3] [--force]
// Ra: <DTL_ASSET_SOURCE>/2d/outfit_p3/<id>.png + <id>.prompt.txt (không đụng 2d/outfit của T-3).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { build } from './outfit-p3-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const jobs = Number(flag('--jobs', '3'));
const force = args.includes('--force');
const all = build();
const sel = args.filter((a) => !a.startsWith('--'));
const ids = sel.length
  ? [...new Set(sel.flatMap((s) => (all[s] ? [s] : s === 'kiem' ? Object.keys(all).filter((k) => k.startsWith('kiem_')) : Object.keys(all).filter((k) => k.startsWith(`${s}_`)))))]
  : Object.keys(all);
const outDir = path.join(source, '2d', 'outfit_p3');
fs.mkdirSync(outDir, { recursive: true });
const todo = ids.filter((id) => force || !fs.existsSync(path.join(outDir, `${id}.png`)));
console.log(`outfit_p3: ${todo.length}/${ids.length} ảnh, ${jobs} luồng → ${outDir}`);

const genDir = path.join(process.env.CODEX_HOME ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.codex'), 'generated_images');
// Codex trên Windows hay lỗi bước shell (sao chép), nên không nhờ nó sao chép: đọc session id, đợi ảnh trong generated_images/<session>/ rồi tự sao chép.
const runOne = (id) =>
  new Promise((resolve) => {
    const prompt = all[id].prompt;
    fs.writeFileSync(path.join(outDir, `${id}.prompt.txt`), prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below. Do NOT run any shell command, do not copy or move files, do nothing else after the image is generated.\n\n${prompt}\n`;
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', outDir, '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let session = '';
    const grab = (d) => {
      const m = /session id: (\S+)/.exec(String(d));
      if (m && !session) session = m[1];
    };
    p.stdout.on('data', grab);
    p.stderr.on('data', grab);
    p.stdin.end(body);
    const start = Date.now();
    const poll = setInterval(() => {
      const dir = path.join(genDir, session);
      const imgs = session && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
      if (imgs.length) {
        const f = path.join(dir, imgs[0]);
        if (Date.now() - fs.statSync(f).mtimeMs < 2000) return; // đang ghi
        fs.copyFileSync(f, path.join(outDir, `${id}.png`));
        finish();
      } else if (Date.now() - start > 8 * 60_000) finish();
    }, 3000);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      spawnSync('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
      resolve(fs.existsSync(path.join(outDir, `${id}.png`)));
    };
    p.on('close', () => setTimeout(finish, 4000));
  });

let next = 0;
const failed = [];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const id = todo[next++];
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        if (force || attempt) fs.rmSync(path.join(outDir, `${id}.png`), { force: true });
        done = await runOne(id);
      }
      if (!done) failed.push(id);
      console.log(`${done ? 'OK ' : 'LỖI'} ${id}`);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

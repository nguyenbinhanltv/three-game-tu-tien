#!/usr/bin/env node
// Thân Pháp T7: tranh cut-in chiêu cuối theo từng bộ nhân vật, do Codex vẽ (codex exec + công cụ ảnh tích hợp, không Tripo, không API key).
// Dùng: node tools/codex-assets/cutin-gen.mjs [kiem_tu_m|kiem_tu_f …] [--force] [--timeout <phút, mặc định 8>]
// Ra: <DTL_ASSET_SOURCE>/2d/cutin/<id>.png (+ .prompt.txt, .log). Ảnh nguồn nằm NGOÀI repo; bản đưa vào game là WebP nhỏ ở apps/client/public/assets/cutin/
// (xem `--pack`: node tools/codex-assets/cutin-gen.mjs --pack). Quá giờ thì giết cả cây tiến trình con (taskkill /T trên Windows), không để codex treo.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const outDir = path.join(source, '2d/cutin');
const refDir = path.join(source, '2d/hoa-truc/thien_giai');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const timeoutMin = Number(flag('--timeout', '8'));
const force = args.includes('--force');
const pack = args.includes('--pack');
const ids = args.filter((a) => !a.startsWith('--'));

// Bộ mặc định của Kiếm tu (Tinh Khuyết Kiếm Bào, v3): ảnh multiview làm tham chiếu mặt, tóc, áo.
const SETS = {
  kiem_tu_m: { ref: 'tinh_khuyet_nam_front.png', who: 'young male sword cultivator' },
  kiem_tu_f: { ref: 'tinh_khuyet_nu_front.png', who: 'young female sword cultivator' },
};

const prompt = (who) =>
  `Use case: game cut-in illustration. Landscape 16:9 image, 2400x1350. An original east-asian cultivation-fantasy ${who}, SAME character, face, hairstyle and robe as the attached reference image, ` +
  'shown from the waist up in a dramatic ultimate-skill pose: leaping forward-left, long sword swept across the body toward the viewer, robe sleeves and hair whipped back by the motion, intense focused eyes, strong diagonal composition, camera slightly below eye level. ' +
  'Style: semi-realistic cinematic painting blended with Chinese ink-wash (thuy mac) brushwork, bold dry-brush speed streaks and ink splashes behind the figure. ' +
  'Palette: pale sky-blue and white sword-light (#9fd8ff, #ffffff), deep ink black, a touch of antique gold (#C9A45C). No red, no orange, no purple, no neon. ' +
  'BACKGROUND MUST BE SOLID PURE BLACK (#000000) everywhere except the figure and a few white-blue ink streaks, so it can be screen-blended over the game. Figure on the right 60% of the frame, empty black on the left 35%. ' +
  'No text, no letters, no calligraphy, no logo, no watermark, no border, no frame, no weapon trails drawn as flat shapes. Original design, not copied from any existing game, anime or artwork.';

const NOTE =
  'Generate the image with the built-in image generation tool, then save the resulting PNG into the current working directory as ./OUT using a shell copy command. Do not write any other files.';

/** Giết cả cây tiến trình (Windows: taskkill /T /F; nơi khác: kill nhóm). */
function killTree(p) {
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGKILL');
  } catch {}
}

function run(id) {
  const set = SETS[id];
  const ref = path.join(refDir, set.ref);
  const out = path.join(outDir, `${id}.png`);
  if (fs.existsSync(out) && !force) return Promise.resolve({ id, ok: true, skipped: true });
  if (!fs.existsSync(ref)) return Promise.resolve({ id, ok: false, note: `thiếu ảnh tham chiếu ${ref}` });
  fs.mkdirSync(outDir, { recursive: true });
  const body = `${NOTE.replace('./OUT', `./${id}.png`)}\n\n${prompt(set.who)}\n`;
  fs.writeFileSync(path.join(outDir, `${id}.prompt.txt`), prompt(set.who) + '\n');
  const log = fs.createWriteStream(path.join(outDir, `${id}.log`));
  const win = process.platform === 'win32';
  const q = (a) => (win && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const cargs = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', outDir, '-i', ref, '-'];
  return new Promise((resolve) => {
    const p = spawn('codex', win ? cargs.map(q) : cargs, { stdio: ['pipe', 'pipe', 'pipe'], shell: win });
    p.stdout.pipe(log, { end: false });
    p.stderr.pipe(log, { end: false });
    p.stdin.end(body);
    let done = false;
    const finish = (note) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      log.end(() => resolve({ id, ok: fs.existsSync(out), note }));
    };
    const t = setTimeout(() => {
      killTree(p);
      finish('quá giờ, đã giết cây tiến trình codex');
    }, timeoutMin * 60_000);
    p.on('close', (c) => finish(c === 0 ? undefined : `codex thoát mã ${c}`));
    p.on('error', (e) => finish(`không chạy được codex: ${e.message}`));
  });
}

if (pack) {
  // Nén PNG nguồn thành WebP ≤ 1600 px ngang cho game.
  const { default: sharp } = await import('sharp');
  const dst = path.join(root, 'apps/client/public/assets/cutin');
  fs.mkdirSync(dst, { recursive: true });
  for (const id of Object.keys(SETS)) {
    const src = path.join(outDir, `${id}.png`);
    if (!fs.existsSync(src)) {
      console.log(`bỏ qua ${id}: chưa có ${src}`);
      continue;
    }
    await sharp(src).resize({ width: 1600 }).webp({ quality: 82 }).toFile(path.join(dst, `${id}.webp`));
    console.log(`đã nén ${id}.webp (${(fs.statSync(path.join(dst, `${id}.webp`)).size / 1024).toFixed(0)} KB)`);
  }
} else {
  const todo = ids.length ? ids : Object.keys(SETS);
  const res = await Promise.all(todo.map(run));
  for (const r of res) console.log(r.ok ? `ok   ${r.id}${r.skipped ? ' (đã có)' : ''}` : `LỖI ${r.id}: ${r.note ?? 'không ra ảnh'}`);
  process.exitCode = res.every((r) => r.ok) ? 0 : 1;
}

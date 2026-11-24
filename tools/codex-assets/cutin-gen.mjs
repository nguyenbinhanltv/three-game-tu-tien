#!/usr/bin/env node
// Thân Pháp T7: tranh cut-in chiêu cuối theo từng bộ nhân vật, do Codex vẽ (codex exec + công cụ ảnh tích hợp, không Tripo, không API key).
// Dùng: node tools/codex-assets/cutin-gen.mjs [<bộ>_<m|f> …] [--force] [--timeout <phút, mặc định 8>] (chạy TỪNG tranh một: mỗi lúc một việc Codex)
// Ra: <DTL_ASSET_SOURCE>/2d/cutin/<id>.png (+ .prompt.txt, .log). Ảnh nguồn nằm NGOÀI repo; bản đưa vào game là WebP nhỏ ở apps/client/public/assets/cutin/
// (xem `--pack`: node tools/codex-assets/cutin-gen.mjs --pack). Quá giờ thì giết cả cây tiến trình con (taskkill /T trên Windows), không để codex treo.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

// Mỗi bộ trang phục v3 (khóa của `v3SetKeyOf`) có hai tranh `<bộ>_<m|f>`. Tham chiếu: ảnh multiview Thiên Giải (`2d/hoa-truc/thien_giai/<tiền tố>_<nam|nu>_front.png`)
// hoặc, nếu bộ chưa có, ảnh nhân vật thật chụp trong game (`2d/cutin/ref/<bộ>_<m|f>.png`, `pnpm shots animlab --stills ref`).
const THIEN_GIAI = {
  tinh_khuyet: 'tinh_khuyet',
  co_thanh: 'co_thanh',
  dia_long: 'dia_giap',
  van_kinh: 'van_kinh',
  luu_ly: 'luu_ly',
  phuc_mach: 'phuc_mach',
  than_tang: 'than_tang',
  kinh_quang: 'kinh_quang',
  liet_mach: 'liet_mach',
};
const GAME_REF = ['de_tu', 'lac_kiem', 'huyen_giap', 'dan_tam'];
const SETS = {};
for (const g of ['m', 'f']) {
  const who = g === 'm' ? 'young male cultivator' : 'young female cultivator';
  for (const [k, pre] of Object.entries(THIEN_GIAI))
    SETS[`${k}_${g}`] = { ref: path.join(refDir, `${pre}_${g === 'm' ? 'nam' : 'nu'}_front.png`), who, game: false };
  for (const k of GAME_REF) SETS[`${k}_${g}`] = { ref: path.join(outDir, 'ref', `${k}_${g}.png`), who, game: true };
}

const prompt = (who, game) =>
  `Use case: game cut-in illustration. Landscape 16:9 image, 2400x1350. An original east-asian cultivation-fantasy ${who}, SAME character, face, hairstyle and outfit (robe colors, trims, sash, shoulder armor, boots) as the attached reference image, ` +
  (game
    ? 'which is a low-resolution in-game screenshot: keep the outfit design and colors, redraw the face and details beautifully; IGNORE the glowing rings, the scenery and the ground in the screenshot. '
    : '') +
  'shown from the waist up in a dramatic ultimate-skill pose: leaping forward-left, long sword swept across the body toward the viewer, robe sleeves and hair whipped back by the motion, intense focused eyes, strong diagonal composition, camera slightly below eye level. ' +
  'Style: semi-realistic cinematic painting blended with Chinese ink-wash (thuy mac) brushwork, bold dry-brush speed streaks and ink splashes behind the figure. ' +
  'Palette for the energy and ink streaks: pale sky-blue and white sword-light (#9fd8ff, #ffffff), deep ink black, a touch of antique gold (#C9A45C); the outfit keeps its own colors from the reference. No red, no orange, no purple energy, no neon. ' +
  'BACKGROUND MUST BE SOLID PURE BLACK (#000000) everywhere except the figure and a few white-blue ink streaks, so it can be keyed out. Figure on the right 60% of the frame, empty black on the left 35%. ' +
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

/** Codex sinh ảnh xong nhưng bước chép ra thư mục việc hay treo (sandbox Windows): ảnh vẫn nằm ở ~/.codex/generated_images/<session>/; chép PNG mới nhất ra `out`. */
function rescue(logFile, out) {
  try {
    const sid = /session id:\s*([0-9a-f-]{20,})/i.exec(fs.readFileSync(logFile, 'utf8'))?.[1];
    const dir = sid && path.join(os.homedir(), '.codex', 'generated_images', sid);
    if (!dir || !fs.existsSync(dir)) return false;
    const pngs = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!pngs.length) return false;
    fs.copyFileSync(path.join(dir, pngs[0].f), out);
    return true;
  } catch {
    return false;
  }
}

function run(id) {
  const set = SETS[id];
  const ref = set.ref;
  const out = path.join(outDir, `${id}.png`);
  if (fs.existsSync(out) && !force) return Promise.resolve({ id, ok: true, skipped: true });
  if (!fs.existsSync(ref)) return Promise.resolve({ id, ok: false, note: `thiếu ảnh tham chiếu ${ref}` });
  fs.mkdirSync(outDir, { recursive: true });
  const body = `${NOTE.replace('./OUT', `./${id}.png`)}\n\n${prompt(set.who, set.game)}\n`;
  fs.writeFileSync(path.join(outDir, `${id}.prompt.txt`), prompt(set.who, set.game) + '\n');
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
      log.end(() => {
        const rescued = !fs.existsSync(out) && rescue(path.join(outDir, `${id}.log`), out);
        resolve({ id, ok: fs.existsSync(out), note: rescued ? `${note ?? ''} (đã cứu ảnh từ kho codex)`.trim() : note });
      });
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
  // `sharp` là phụ thuộc của tools/perf (không phải của gói này): nạp qua createRequire từ đó.
  const { createRequire } = await import('node:module');
  const sharp = createRequire(path.join(root, 'tools/perf/package.json'))('sharp');
  const dst = path.join(root, 'apps/client/public/assets/cutin');
  fs.mkdirSync(dst, { recursive: true });
  for (const id of Object.keys(SETS)) {
    const src = path.join(outDir, `${id}.png`);
    if (!fs.existsSync(src)) {
      console.log(`bỏ qua ${id}: chưa có ${src}`);
      continue;
    }
    // Nền đen thuần → trong suốt: alpha = smoothstep theo kênh sáng nhất (mép mềm), giữ nguyên màu. Các nếp vải rất tối thành lỗ trong suốt, bù bằng lớp mực tối phía sau trong UI.
    const { data, info } = await sharp(src).resize({ width: 1600 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const m = Math.max(data[i], data[i + 1], data[i + 2]);
      const u = Math.min(1, Math.max(0, (m - 4) / 22));
      data[i + 3] = Math.round(u * u * (3 - 2 * u) * 255);
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .webp({ quality: 84, alphaQuality: 90 })
      .toFile(path.join(dst, `${id}.webp`));
    console.log(`đã nén ${id}.webp (${(fs.statSync(path.join(dst, `${id}.webp`)).size / 1024).toFixed(0)} KB)`);
  }
} else {
  const todo = ids.length ? ids : Object.keys(SETS);
  const res = await Promise.all(todo.map(run));
  for (const r of res) console.log(r.ok ? `ok   ${r.id}${r.skipped ? ' (đã có)' : ''}` : `LỖI ${r.id}: ${r.note ?? 'không ra ảnh'}`);
  process.exitCode = res.every((r) => r.ok) ? 0 : 1;
}

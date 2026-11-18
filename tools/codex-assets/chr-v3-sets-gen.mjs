#!/usr/bin/env node
// CHR-V3 hàng loạt: concept NHÂN VẬT NGUYÊN KHỐI CÓ MẶT theo từng bộ (v3-sets-data.mjs), nam và nữ, trước/sau/nghiêng, tư thế chữ A, kiểu v3b.
// Ra: <DTL_ASSET_SOURCE>/chr/<thư mục bộ>/concept/v3_<nam|nu>_<front|back|side>.png + .prompt.txt (chỉ THÊM file mới, không ghi đè).
// Dùng: node tools/codex-assets/chr-v3-sets-gen.mjs [--sets set_de_tu,set_huyen_giap] [--jobs 3] [--force]. Codex tích hợp công cụ ảnh, không dùng Tripo API/credit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { A, NOTEXT, ORIGINAL, STYLE } from './outfit-data.mjs';
import { COMMON_RULES, V3_SETS } from './v3-sets-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const jobs = Number(opt('--jobs', 3));
const force = args.includes('--force');
const only = opt('--sets', Object.keys(V3_SETS).join(',')).split(',');

const VIEW = {
  front:
    'strictly FRONT view, orthographic-looking, camera at chest height, figure facing the camera, symmetric, face clearly visible and well lit',
  back: 'strictly BACK view, orthographic-looking, camera at chest height, figure facing away from the camera, symmetric',
  side: 'strictly SIDE view (left profile, figure facing left of the image), orthographic-looking, camera at chest height, head in profile',
};
const prompt = (
  set,
  g,
  v,
) => `Use case: stylized-concept. ONE full-body 3D character concept image (FULL CHARACTER WITH FACE, head to feet, one single piece) for image-to-3D modeling, for a Chinese fantasy cultivation game. ${ORIGINAL}
Subject: ${set.who[g]}, wearing ${set.outfit}. Slender build, about 8 heads tall, narrow shoulders, long legs. The clothing follows the torso closely with modest ease and hangs straight and clean, NO bulky padding, NO oversized volume. Bare hands with relaxed open fingers. NO weapon in hand, NO sword on the back, NO props.
${COMMON_RULES}
Pose: strict A-pose, standing upright, feet shoulder-width apart, arms straight and held about 35 degrees away from the torso with a CLEAR VISIBLE GAP between each sleeve and the torso (visible armpit gap), sleeves not touching the body, the lower garment not covering between the legs (clear gap between the legs), head neutral facing forward${v === 'side' ? ' (side view: head in profile)' : ''}.
View: ${VIEW[v]}. Whole figure from head to feet inside the frame with 6% margin. Portrait 2:3.
Style: ${STYLE}
Render: neutral soft even studio lighting from the front, no strong shadows, no color cast, plain flat light grey seamless background (#D8D8D8), no floor scenery, no floor shadow, single subject only.
${NOTEXT}`;

const todo = [];
for (const id of only) {
  const set = V3_SETS[id];
  if (!set) throw new Error(`không có bộ ${id} trong v3-sets-data.mjs`);
  const dir = path.join(source, 'chr', set.folder, 'concept');
  fs.mkdirSync(dir, { recursive: true });
  for (const g of Object.keys(set.who))
    for (const v of Object.keys(VIEW)) todo.push({ dir, name: `v3_${g}_${v}`, prompt: A(prompt(set, g, v)) });
}
const queue = todo.filter((t) => force || !fs.existsSync(path.join(t.dir, `${t.name}.png`)));
console.log(`${queue.length}/${todo.length} ảnh, ${jobs} luồng`);

// Codex tích hợp công cụ ảnh nhưng bước "copy ảnh vào thư mục" trong sandbox của nó hay treo (setup helper thoát 143): ảnh vẫn nằm ở
// ~/.codex/generated_images/<session id>/*.png. Nên đọc session id từ đầu ra, thấy ảnh xuất hiện (kích thước ổn định) thì tự sao chép rồi dừng tiến trình.
const GEN = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.codex', 'generated_images');
const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(t.dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below. Do nothing else (do not copy or move the file).\n\n${t.prompt}\n`;
    const target = path.join(t.dir, `${t.name}.png`);
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', t.dir, '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let session = null;
    let text = '';
    const onData = (d) => {
      text += d.toString();
      if (!session) session = /session id:\s*([0-9a-f-]{20,})/i.exec(text)?.[1] ?? null;
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.stdin.end(body);
    let last = -1;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
      else p.kill();
      resolve(ok);
    };
    const poll = setInterval(() => {
      if (!session) return;
      const d = path.join(GEN, session);
      const f = fs.existsSync(d)
        ? fs
            .readdirSync(d)
            .filter((x) => x.endsWith('.png'))
            .sort()
        : [];
      if (!f.length) return;
      const file = path.join(d, f[f.length - 1]);
      const size = fs.statSync(file).size;
      if (size > 50_000 && size === last) {
        fs.copyFileSync(file, target);
        finish(true);
      }
      last = size;
    }, 3000);
    const timer = setTimeout(() => finish(fs.existsSync(target)), 10 * 60_000);
    p.on('close', () => finish(fs.existsSync(target)));
  });

let next = 0;
const failed = [];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < queue.length) {
      const t = queue[next++];
      let ok = false;
      for (let a = 0; a < 3 && !ok; a++) {
        if (a) fs.rmSync(path.join(t.dir, `${t.name}.png`), { force: true });
        ok = await runOne(t);
      }
      console.log(`${ok ? 'OK ' : 'LỖI'} ${t.name}`);
      if (!ok) failed.push(t.name);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

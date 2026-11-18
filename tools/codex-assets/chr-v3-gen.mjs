#!/usr/bin/env node
// CHR-V3 (N-1): concept NHÂN VẬT NGUYÊN KHỐI CÓ MẶT cho bộ thử Lạc Kiếm Môn Phục, nam và nữ, trước/sau/nghiêng, tư thế chữ A.
// Ra: <DTL_ASSET_SOURCE>/chr/set_lac_kiem/concept/v3_<nam|nu>_<front|back|side>.png + .prompt.txt (chỉ THÊM file mới, không ghi đè).
// Dùng: node tools/codex-assets/chr-v3-gen.mjs [--jobs 3] [--force]. Codex tích hợp công cụ ảnh, không dùng Tripo API/credit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { A, NOTEXT, ORIGINAL, STYLE } from './outfit-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const ji = args.indexOf('--jobs');
const jobs = ji >= 0 ? Number(args.splice(ji, 2)[1]) : 3;
const force = args.includes('--force');

const OUTFIT =
  'the Lac Kiem sword sect elite disciple outfit: a long IVORY (#E4DEC8) robe (dao pao) to mid-calf with a CROSSED collar and deep-navy (#27476E) trim along collar, cuffs and hem, wide but not puffy sleeves, a deep-navy (#27476E) sash belt with a small jade-green (#7FE3D0) plaque, a pair of BLUE lacquered shoulder pauldrons (#3B6584 with lighter #4C86B0 highlights and a thin silver edge, layered like a sword-guard petal, slim and compact) over the shoulders, a small silver hair crown (guan) holding the topknot, dark navy trousers with cloth leg wraps, dark navy boots with silver toe caps';
const WHO = {
  nam: 'a young adult MAN, East Asian, calm sharp-eyed face with a clean-shaven jaw, straight dark eyebrows, long black hair tied in a high topknot with a silver guan, the rest of the hair falling straight down the back to mid-back',
  nu: 'a young adult WOMAN, East Asian, serene refined face with almond eyes and soft features, long black hair half tied up with a silver guan and a thin hairpin, the rest falling straight down the back to the waist',
};
const VIEW = {
  front: 'strictly FRONT view, orthographic-looking, camera at chest height, figure facing the camera, symmetric, face clearly visible and well lit',
  back: 'strictly BACK view, orthographic-looking, camera at chest height, figure facing away from the camera, symmetric',
  side: 'strictly SIDE view (left profile, figure facing left of the image), orthographic-looking, camera at chest height, head in profile',
};
const prompt = (g, v) => `Use case: stylized-concept. ONE full-body 3D character concept image (FULL CHARACTER WITH FACE, head to feet, one single piece) for image-to-3D modeling, for a Chinese fantasy cultivation game. ${ORIGINAL}
Subject: ${WHO[g]}, wearing ${OUTFIT}. Slender build, about 8 heads tall, narrow shoulders, long legs. The robe follows the torso closely with modest ease and hangs straight and clean, NO bulky padding, NO oversized volume. Bare hands with relaxed open fingers. NO weapon in hand, NO sword on the back, NO props.
Pose: strict A-pose, standing upright, feet shoulder-width apart, arms straight and held about 35 degrees away from the torso with a CLEAR VISIBLE GAP between each sleeve and the torso (visible armpit gap), sleeves not touching the body, the robe skirt not covering between the legs (clear gap between the legs), head neutral facing forward${v === 'side' ? ' (side view: head in profile)' : ''}.
View: ${VIEW[v]}. Whole figure from head to feet inside the frame with 6% margin. Portrait 2:3.
Style: ${STYLE}
Render: neutral soft even studio lighting from the front, no strong shadows, no color cast, plain flat light grey seamless background (#D8D8D8), no floor scenery, no floor shadow, single subject only.
${NOTEXT}`;

const dir = path.join(source, 'chr', 'set_lac_kiem', 'concept');
fs.mkdirSync(dir, { recursive: true });
const todo = [];
for (const g of Object.keys(WHO)) for (const v of Object.keys(VIEW)) todo.push({ name: `v3_${g}_${v}`, prompt: A(prompt(g, v)) });
const queue = todo.filter((t) => force || !fs.existsSync(path.join(dir, `${t.name}.png`)));
console.log(`${queue.length}/${todo.length} ảnh, ${jobs} luồng`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir, '-'], { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 8 * 60_000);
    p.on('close', () => {
      clearTimeout(timer);
      resolve(fs.existsSync(path.join(dir, `${t.name}.png`)));
    });
  });

let next = 0;
const failed = [];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < queue.length) {
      const t = queue[next++];
      let ok = false;
      for (let a = 0; a < 3 && !ok; a++) {
        if (a) fs.rmSync(path.join(dir, `${t.name}.png`), { force: true });
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

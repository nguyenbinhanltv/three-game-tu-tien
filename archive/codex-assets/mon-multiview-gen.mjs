#!/usr/bin/env node
// C6: concept 4 hướng (front/left/right/back) cho quái và boss còn dựng bằng khối, để người dùng tự dựng Multiview → 3D trên Tripo web.
// Mô tả từng con ở tools/codex-assets/mon-concepts.json. Mặt trước vẽ trước (không tham chiếu), ba hướng còn lại sửa từ ảnh mặt trước để giữ nguyên nhân vật.
// Ra: <DTL_ASSET_SOURCE>/3d/<quai|boss>/<id>/concept/concept_{front,left,right,back}.png (+ .prompt.txt). Chỉ THÊM file (--force để vẽ lại).
// Dùng: node tools/codex-assets/mon-multiview-gen.mjs [--only id,id] [--jobs 3] [--force]. KHÔNG dùng Tripo API/credit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const force = args.includes('--force');
const only = opt('--only', '').split(',').filter(Boolean);
const jobs = Number(opt('--jobs', '3'));
const concepts = JSON.parse(fs.readFileSync(path.join(here, 'mon-concepts.json'), 'utf8'));
const ids = Object.keys(concepts).filter((k) => !k.startsWith('_') && (!only.length || only.includes(k)));

const STYLE = `Style: semi-realistic cinematic painterly rendering for a Chinese-fantasy cultivation action game (not cartoon, not anime, not chibi, not a photograph), believable materials, original design (no existing game or franchise creature). Strong readable silhouette when seen from above at a 52 degree camera: large head and shoulders, big readable weapons or claws, a clear identifying color. Dangerous parts (fangs, claws, fists, blades) are brighter or higher-contrast than the rest of the body.
Render: neutral soft even studio lighting from the front, no cast shadows, no ground, plain flat light grey seamless background (#D8D8D8), ONE subject only, the whole body fully inside the frame with a 8 percent margin on every side, orthographic-looking camera at mid-body height (no strong perspective). No text, no labels, no watermark, no UI, no particles, no glow halos, no extra creatures.`;

const poseOf = (c) =>
  c.pose === 'biped'
    ? 'Pose: A-pose, standing upright and symmetric, both arms held away from the torso at about 35-45 degrees with the hands open (a weapon if any is held in the lower hand pointing down, never raised), feet shoulder-width apart and flat on the ground, head level, mouth closed, calm neutral stance. If the creature has wings or a cape, keep them in the same arrangement in every view and not hiding the body.'
    : 'Pose: standard four-legged standing pose, all four legs straight and clearly separated so each leg is visible, body level, head raised to about shoulder height, mouth closed, tail relaxed and hanging, standing still (not crouching, not running, not snarling).';

const FRONT = (
  id,
  c,
) => `Use case: stylized-concept. ONE reference image of a game monster for multi-view image-to-3D modelling: ${c.vi} (${id}).
Subject: ${c.desc}. Dominant colors: ${c.colors}.
View: strictly FRONT view, the creature facing straight into the camera, perfectly symmetric.
${poseOf(c)}
${STYLE}`;

const SIDE = {
  left: 'LEFT SIDE VIEW: turned exactly 90 degrees so that the creature FACES TOWARD THE LEFT EDGE of the image; we see its LEFT side in pure profile (it is the mirror-opposite of the right view).',
  right:
    'RIGHT SIDE VIEW: turned exactly 90 degrees so that the creature FACES TOWARD THE RIGHT EDGE of the image; we see its RIGHT side in pure profile (it is the mirror-opposite of the left view).',
  back: 'BACK VIEW: the creature stands with its BACK TO THE CAMERA, facing directly away, perfectly symmetric; we see the back of the head, the back of the body, the tail or cape or wings from behind and any back armor or markings.',
};
const VIEWED = (
  id,
  c,
  v,
) => `Use case: precise-object-edit / multi-view turnaround. ONE image for multi-view image-to-3D modelling. The attached reference is the FRONT view of the game monster ${c.vi} (${id}); produce the SAME creature from another angle: identical design, proportions, colors, materials, armor, markings and scale, same pose family and same lighting, only the viewing angle changes.
${SIDE[v]}
${poseOf(c)}
${STYLE}`;

const dirOf = (id) => path.join(source, '3d', concepts[id].dir, id, 'concept');
const fileOf = (id, v) => path.join(dirOf(id), `concept_${v}.png`);
const genRoot = path.join(os.homedir(), '.codex', 'generated_images');

const runOne = (id, v) =>
  new Promise((resolve) => {
    const c = concepts[id];
    const dir = dirOf(id);
    fs.mkdirSync(dir, { recursive: true });
    const prompt = v === 'front' ? FRONT(id, c) : VIEWED(id, c, v);
    fs.writeFileSync(path.join(dir, `concept_${v}.prompt.txt`), prompt + '\n');
    const body =
      v === 'front'
        ? `Use the built-in image generation tool to create exactly ONE image from the brief below. Do nothing else; do not copy or move files.\n\n${prompt}\n`
        : `Use the built-in image generation tool to create exactly ONE image from the brief below (edit/derive from the attached FRONT reference to keep the creature identical). Do nothing else; do not copy or move files.\n\n${prompt}\n`;
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir];
    if (v !== 'front') a.push('-i', fileOf(id, 'front'));
    a.push('-');
    const p = spawn('codex', a, { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let sid = '';
    let done = false;
    const onData = (d) => {
      if (!sid) sid = /session id:\s*([0-9a-f-]{36})/i.exec(String(d))?.[1] ?? '';
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.stdin.end(body);
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      if (process.platform === 'win32') spawnSync('taskkill', ['/T', '/F', '/PID', String(p.pid)]);
      else p.kill();
      resolve(ok);
    };
    let copied = false;
    let copyTimer = null;
    const sessionPng = () => {
      if (!sid) return null;
      const d = path.join(genRoot, sid);
      const png = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.png')) : [];
      return png.length ? path.join(d, png[png.length - 1]) : null;
    };
    const copyNow = () => {
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = null;
      const src = sessionPng();
      if (src) {
        fs.copyFileSync(src, fileOf(id, v));
        copied = true;
      }
      finish(copied);
    };
    const poll = setInterval(() => {
      if (sessionPng()) {
        clearInterval(poll);
        copyTimer = setTimeout(copyNow, 3000);
      }
    }, 3000);
    const timer = setTimeout(copyNow, 9 * 60_000);
    p.on('close', copyNow);
  });

const failed = [];
let next = 0;
// Mỗi luồng lấy một con: vẽ mặt trước trước, rồi ba hướng còn lại (cần ảnh mặt trước làm tham chiếu).
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      for (const v of ['front', 'left', 'right', 'back']) {
        if (!force && fs.existsSync(fileOf(id, v))) continue;
        if (v !== 'front' && !fs.existsSync(fileOf(id, 'front'))) {
          console.log('BỎ', `${id}_${v}`, '(chưa có mặt trước)');
          failed.push(`${id}_${v}`);
          continue;
        }
        let ok = false;
        for (let i = 0; i < 3 && !ok; i++) ok = await runOne(id, v);
        console.log(`${ok ? 'OK ' : 'LỖI'} ${id}_${v}`);
        if (!ok) failed.push(`${id}_${v}`);
      }
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

#!/usr/bin/env node
// MULTIVIEW 4 góc cho 18 model v3 bậc cao: từ <bo>_<nam|nu>_apose.png (mặt trước) sinh LEFT/RIGHT/BACK bằng Codex (image edit, ảnh front làm tham chiếu).
// Ra: <DTL_ASSET_SOURCE>/2d/hoa-truc/thien_giai/<bo>_<nam|nu>_{front,left,right,back}.png (+ .prompt.txt). Chỉ THÊM file (--force để vẽ lại).
// Dùng: node tools/codex-assets/multiview-gen.mjs [--phai kiem|hophap|dansu] [--only kinh_quang_nam,...] [--jobs 3] [--force]. KHÔNG dùng Tripo.
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
const phaiSel = opt('--phai', '');
const viewSel = opt('--views', 'left,right,back').split(',');
const jobs = Number(opt('--jobs', '3'));

const PHAI = {
  kiem: ['kinh_quang', 'liet_mach', 'tinh_khuyet'],
  hophap: ['co_thanh', 'dia_giap', 'van_kinh'],
  dansu: ['luu_ly', 'phuc_mach', 'than_tang'],
};
const GENDER = { nam: 'man', nu: 'woman' };
const VIEWS = {
  left: "LEFT SIDE VIEW: the figure is turned exactly 90 degrees so that she/he FACES TOWARD THE LEFT EDGE of the image; we see the character's LEFT side (profile). Keep the SAME A-pose as the front view: both arms held away from the torso at about 35-45 degrees, so in profile the near arm visibly angles down and slightly away from the body with a clear gap between arm and torso (NOT hanging straight against the body, NOT crossed); hands open and relaxed.",
  right:
    "RIGHT SIDE VIEW: the figure is turned exactly 90 degrees so that she/he FACES TOWARD THE RIGHT EDGE of the image; we see the character's RIGHT side (profile), the mirror-opposite of the left view. Keep the SAME A-pose as the front view: both arms held away from the torso at about 35-45 degrees, with a clear gap between arm and torso in profile (NOT hanging straight against the body); hands open and relaxed.",
  back: 'BACK VIEW: the figure stands with the BACK TO THE CAMERA, facing directly away; we see the back of the head (hair, topknot, hair ornaments), the back of the robe/armor/cape, and any back embroidery or pattern. Same A-pose, arms ~35-45 degrees from torso.',
};

const dir = path.join(source, '2d', 'hoa-truc', 'thien_giai');
const bos = phaiSel ? (PHAI[phaiSel] ?? []) : Object.values(PHAI).flat();
const items = [];
for (const bo of bos)
  for (const g of ['nam', 'nu']) {
    const id = `${bo}_${g}`;
    if (only.length && !only.includes(id)) continue;
    const front = path.join(dir, `${id}_apose.png`);
    if (!fs.existsSync(front)) {
      console.log('THIẾU', front);
      continue;
    }
    const f = path.join(dir, `${id}_front.png`);
    if (!fs.existsSync(f)) fs.copyFileSync(front, f);
    fs.copyFileSync(path.join(dir, `${id}_apose.prompt.txt`), path.join(dir, `${id}_front.prompt.txt`));
    for (const v of Object.keys(VIEWS).filter((x) => viewSel.includes(x))) items.push({ id, g, v, front, name: `${id}_${v}` });
  }
const has = (n) => fs.existsSync(path.join(dir, `${n}.png`));
const queue = items.filter((t) => force || !has(t.name));
console.log(`${queue.length}/${items.length} ảnh → ${dir}`);

const promptOf = (t) =>
  `Use case: precise-object-edit / multi-view turnaround. ONE full-body character sheet image for multi-view image-to-3D modelling. The attached reference is the FRONT view of a young adult ${GENDER[t.g]}; produce the SAME character from another angle: identical face, hairstyle, outfit, every colour, trim, pattern, ornament, jewellery, layering, body proportions and height. Do NOT redesign, simplify or add anything. ${VIEWS[t.v]} Strict A-pose, standing upright, feet shoulder-width, calm neutral expression, garment layers hanging straight and symmetric, no wind, no flying ribbons, NO weapon, NO props. Orthographic (no perspective distortion), camera at chest height, whole figure inside the frame with the same 6% margin and the SAME character height and framing as the front reference. Portrait 2:3. Plain flat light grey seamless background (#D8D8D8), neutral soft even lighting, no floor shadow, no cast shadow, single subject. Same ink-wash painterly semi-realistic xianxia illustration style as the reference, NOT cartoon, NOT 3D render, NOT photo. No text, no letters, no Chinese characters, no logo, no watermark, no signature, no frame, no border.`;

const genRoot = path.join(os.homedir(), '.codex', 'generated_images');
// Codex vẽ ảnh vào ~/.codex/generated_images/<session id>/ rồi hay kẹt ở bước copy; ta tự lấy ảnh theo session id của chính tiến trình rồi dừng nó.
const runOne = (t) =>
  new Promise((resolve) => {
    const prompt = promptOf(t);
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below (edit/derive from the attached FRONT reference to keep the character identical). Do nothing else; do not copy or move files.\n\n${prompt}\n`;
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir, '-i', t.front, '-'];
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
    // Thành công = đã chép ảnh của PHIÊN NÀY (không dùng has(): với --force ảnh cũ làm lần lỗi bị tính là OK).
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
        fs.copyFileSync(src, path.join(dir, `${t.name}.png`));
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
    // Codex thường thoát ngay sau khi vẽ: chép ngay thay vì đợi 3 giây (tránh chạy lại cả lượt sinh ảnh).
    p.on('close', copyNow);
  });

const failed = [];
let next = 0;
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < queue.length) {
      const t = queue[next++];
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) ok = await runOne(t);
      console.log(`${ok ? 'OK ' : 'LỖI'} ${t.name}`);
      if (!ok) failed.push(t.name);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

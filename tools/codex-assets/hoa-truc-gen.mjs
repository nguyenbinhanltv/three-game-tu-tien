#!/usr/bin/env node
// HOA TRÚC (bước 1): tranh vẽ tĩnh toàn thân theo bộ trang phục cho bảng Nhân vật + nền cảnh giới + lớp kiếm riêng.
// Ra: <DTL_ASSET_SOURCE>/portrait/hoa_truc/<tên>.png (+ .prompt.txt). Chỉ THÊM file mới (--force để vẽ lại).
// Dùng: node tools/codex-assets/hoa-truc-gen.mjs [--jobs 3] [--force] [--only a,b]. Codex tích hợp công cụ ảnh; KHÔNG dùng Tripo.
// Ảnh tham chiếu trang phục: concept nhân vật v3 đã duyệt (set_lac_kiem v3b, set_de_tu v3) để tranh khớp đúng trang phục.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const jobs = Number(opt('--jobs', 3));
const force = args.includes('--force');
const only = opt('--only', '').split(',').filter(Boolean);

const STYLE =
  'Painted in the "Mặc Kim Giản" ink-wash (shui-mo) xianxia illustration style: soft jade-green and celadon washes, fine dark ink contour lines, subtle gold-leaf line accents, semi-realistic painterly faces and cloth folds, elegant and calm, high detail, clean silhouette, NOT cartoon, NOT 3D render, NOT photo';
const NOTEXT = 'No text, no letters, no logo, no watermark, no signature, no frame, no border.';
const CHROMA =
  'plain perfectly flat pure magenta #FF00FF background with NO gradient, NO floor, NO shadow, NO ground, NO glow, NO mist, single subject only, hair and cloth edges crisp against the flat magenta';

const WHO = {
  nam: 'a young adult MAN, East Asian, calm sharp-eyed face, straight dark eyebrows, long black hair',
  nu: 'a young adult WOMAN, East Asian, serene refined face with almond eyes, long black hair',
};
const OUTFIT = {
  lac_kiem:
    'the Lac Kiem sword sect elite disciple outfit, EXACTLY as in the attached reference image: ivory robe with crossed collar and deep-navy trim, deep-navy sash with a jade plaque, blue lacquered shoulder pauldrons, dark navy trousers and boots with silver toe caps, silver hair crown',
  de_tu:
    'the plain blue-grey disciple outfit, EXACTLY as in the attached reference image: blue-grey crossed-collar short robe with dark navy trim and sash, dark trousers and dark boots, simple tied hair',
};
const REF = {
  lac_kiem_nam: 'set_lac_kiem/concept/v3b_nam_front.png',
  lac_kiem_nu: 'set_lac_kiem/concept/v3b_nu_front.png',
  de_tu_nam: 'set_de_tu/concept/v3_nam_front.png',
  de_tu_nu: 'set_de_tu/concept/v3_nu_front.png',
};

const jobsList = [];
for (const o of Object.keys(OUTFIT)) {
  for (const g of Object.keys(WHO)) {
    const name = `${o}_${g}`;
    jobsList.push({
      name,
      ref: path.join(source, 'chr', REF[name]),
      prompt: `Use case: stylized-concept. ONE full-length character painting for the character sheet of a Chinese cultivation game. Subject: ${WHO[g]}, wearing ${OUTFIT[o]}. Standing relaxed and dignified in a gentle three-quarter pose (body turned slightly to the left of the image, face turned toward the viewer), arms relaxed at the sides with empty hands, NO weapon, NO sword on the back, NO props. Sleeves, sash ends and hair fall naturally with slight ease so cloth areas read clearly. Whole figure from the top of the hair to the soles of the boots inside the frame with 4% margin. Portrait 2:3. Style: ${STYLE}. Background: ${CHROMA}. ${NOTEXT}`,
    });
  }
}
const REALM = {
  nk: 'the first cultivation realm "Qi Condensation": a quiet misty mountain valley at dawn, low jade-green hills fading into celadon mist, a small distant pavilion roof, a few pine silhouettes, pale sky, very calm and humble, mostly soft celadon and pale ivory with only a faint warm gold light',
  tc: 'the second cultivation realm "Foundation Establishment": taller jade cliffs with a thin waterfall, drifting sword-light motes, a pagoda tier on a cliff top, brighter jade-green and gold-leaf highlights, clearer sky with layered clouds, more majestic yet serene',
};
for (const [k, d] of Object.entries(REALM)) {
  jobsList.push({
    name: `canh_${k}`,
    prompt: `Use case: ui-background. A vertical ink-wash landscape backdrop, portrait 2:3, for a character panel in a Chinese cultivation game, representing ${d}. NO people, NO characters, NO text. Keep the central vertical third (where a standing figure will be placed) lower in contrast and lighter, with the visual interest toward the edges and lower area; the top 15% is a soft pale mist. Style: ${STYLE}. ${NOTEXT}`,
  });
}
const SWORD = {
  thanh_phong:
    'a slender straight jian sword with a pale blue-steel blade with a faint celadon edge glow, a dark navy wrapped grip, a small silver guard and a jade pommel, plain dark navy lacquered scabbard shown separately NOT included',
  han_quang:
    'a slender straight jian sword with an icy white-silver blade that has pale cyan frost light along the edge, a deep blue wrapped grip, a refined silver guard with a small pale-blue gem',
};
for (const [k, d] of Object.entries(SWORD)) {
  jobsList.push({
    name: `kiem_${k}`,
    prompt: `Use case: stylized-concept. ONE sword painting: ${d}. The sword is shown completely vertical, blade pointing UP, hilt at the bottom, centered, occupying about 90% of the frame height, no hand, no scabbard, no ornaments around it. Portrait 1:4 tall narrow canvas. Style: ${STYLE}. Background: ${CHROMA}. ${NOTEXT}`,
  });
}

const dir = path.join(source, 'portrait', 'hoa_truc');
fs.mkdirSync(dir, { recursive: true });
const queue = jobsList.filter((t) => (!only.length || only.includes(t.name)) && (force || !fs.existsSync(path.join(dir, `${t.name}.png`))));
console.log(`${queue.length}/${jobsList.length} ảnh, ${jobs} luồng → ${dir}`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below${t.ref ? ' (the attached reference image shows the exact outfit to reproduce)' : ''}, then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir];
    if (t.ref && fs.existsSync(t.ref)) a.push('-i', t.ref);
    a.push('-');
    const p = spawn('codex', a, { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 9 * 60_000);
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
      for (let i = 0; i < 3 && !ok; i++) {
        if (i) fs.rmSync(path.join(dir, `${t.name}.png`), { force: true });
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

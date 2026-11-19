#!/usr/bin/env node
// THIÊN GIAI HOA TRÚC (thử: bộ Liệt Mạch): tranh nhân vật phong cách "tiên giới" nhiều lớp voan + kim tuyến, A-pose sạch cho Tripo,
// nền cảnh giới Kết Đan/Nguyên Anh/Hóa Thần, pháp tướng kiếm long ngọc, Nguyên Anh, phi kiếm.
// Ra: <DTL_ASSET_SOURCE>/2d/hoa-truc/thien_giai/<tên>.png (+ .prompt.txt). Chỉ THÊM file (--force để vẽ lại).
// Dùng: node tools/codex-assets/thien-giai-gen.mjs [--jobs 4] [--force] [--only a,b]. Codex tích hợp công cụ ảnh; KHÔNG dùng Tripo.
// Ảnh tham khảo phong cách của người dùng chỉ để lấy PHONG CÁCH (voan, kim tuyến, tóc/lụa bay), không vẽ lại nhân vật nào, không chữ Hán/logo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const jobs = Number(opt('--jobs', 4));
const force = args.includes('--force');
const only = opt('--only', '').split(',').filter(Boolean);

const STYLE =
  'Painted in the "Mac Kim Gian" ink-wash xianxia illustration style: soft jade and celadon washes, fine dark ink contours, delicate gold-leaf filigree, semi-realistic painterly faces and cloth, luminous and elegant, extremely high detail, NOT cartoon, NOT 3D render, NOT photo';
const NOTEXT = 'No text, no letters, no Chinese characters, no logo, no watermark, no signature, no frame, no border.';
const MAGENTA =
  'plain perfectly flat pure magenta #FF00FF background, NO gradient, NO floor, NO shadow, NO ground, single subject, edges crisp against the flat magenta';
const GREY = 'plain flat light grey seamless background (#D8D8D8), no floor shadow, single subject';
const WHO = {
  nam: 'a young adult MAN, East Asian, calm sharp-eyed face, straight dark eyebrows, very long black hair tied in a high topknot with a small gold hair crown, the rest of the hair flowing long',
  nu: 'a young adult WOMAN, East Asian, serene refined face with almond eyes, very long black hair half up with a small gold hair crown and fine gold hairpins, the rest flowing long',
};
const OUTFIT =
  'the Liet Mach sword-cultivator outfit, ELEVATED to an immortal-realm grade, using the attached reference for its identity (ochre-gold and warm tan robe, bronze dragon-scale pauldron on one shoulder, brown sash with a jade disc pendant, bronze bracers, tall tan boots with green line trim): now with TWO TO THREE LAYERS OF SHEER TRANSLUCENT VOILE gauze outer robes in ivory and pale gold, edges trimmed with dense GOLD-THREAD embroidery borders, wide flowing sleeves with long trailing silk ribbons, a long jade-and-gold sash, small jade pendants and tassels, and a long open outer coat that sweeps along the ground behind';
const posePrompt = (g) =>
  `Use case: stylized-concept. ONE full-length character illustration for the character sheet of a Chinese cultivation game. Subject: ${WHO[g]}, wearing ${OUTFIT}. Dynamic dignified pose: body in three-quarter view, one arm raised with an open palm gathering spiritual qi, the other arm relaxed, the hair, ribbons and voile layers blown strongly sideways by a gust of spiritual wind, NO weapon, NO sword in hand. Whole figure from the top of the hair to the soles with 4% margin. Portrait 2:3. Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`;
const aposePrompt = (g) =>
  `Use case: stylized-concept. ONE full-body character concept for image-to-3D modelling, the SAME character and outfit as the attached reference image: ${WHO[g]}, wearing ${OUTFIT}. Strict A-pose, standing upright facing the camera, arms about 35 degrees away from the torso with visible gaps, feet shoulder-width, calm neutral face, voile layers hanging straight and symmetric, no wind, no ribbons flying, NO weapon, NO props. Orthographic-looking, camera at chest height, whole figure inside the frame with 6% margin. Portrait 2:3. Style: ${STYLE}. Render: neutral soft even lighting, ${GREY}. ${NOTEXT}`;
const BG = {
  kd: 'the Golden Core realm ("Ket Dan"): a vast misty valley of tall jade peaks with silver waterfalls, small floating rock islets in the distance, warm gold dawn light cutting through layered clouds, a distant pavilion on a cliff, glittering gold motes, richer and more majestic than a common mountain scene',
  na: 'the Nascent Soul realm ("Nguyen Anh"): towering floating mountains connected by long chains, great cascading cloud-waterfalls, sacred pagoda halls on the floating islands, a huge pale moon behind veils of cloud, drifting sword-light streaks, deep jade and gold palette, awe-inspiring scale',
  ht: 'the Spirit Transformation realm ("Hoa Than"): an immortal heaven realm at the edge of the sky, a colossal celestial palace gate half hidden in luminous clouds, nine floating palaces, rivers of light falling from the sky, gold-white radiance, a faint ink-wash mountain silhouette below, transcendent and sacred',
};
const list = [];
for (const g of Object.keys(WHO)) {
  list.push({
    name: `liet_mach_${g}_pose`,
    ref: path.join(source, '3d/nhan-vat/set_liet_mach_kiem_y/concept/concept_34_v01.png'),
    prompt: posePrompt(g),
  });
  list.push({ name: `liet_mach_${g}_apose`, after: `liet_mach_${g}_pose`, prompt: aposePrompt(g) });
}
for (const [k, d] of Object.entries(BG))
  list.push({
    name: `canh_${k}`,
    prompt: `Use case: ui-background. A vertical ink-wash landscape backdrop, portrait 2:3, for a character panel in a Chinese cultivation game, representing ${d}. NO people, NO characters, NO text. Keep the central vertical third (where a standing figure will be placed) calmer, lighter and lower in contrast, with the visual interest toward the edges and lower area; the top 12% is soft pale mist. Style: ${STYLE}. ${NOTEXT}`,
  });
list.push({
  name: 'phap_tuong_kiem_long',
  prompt: `Use case: stylized-concept. ONE huge ghostly spiritual avatar ("Dharma image"): a colossal straight jade sword standing point-down with a translucent jade dragon spiraling around the blade, the dragon's head raised at the top with flowing whiskers and mane, scales and the sword rendered in luminous translucent jade-green and white with gold filigree edges, glowing from within as if made of light, wispy ethereal edges. Vertical portrait 1:2, the avatar fills the frame height. Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`,
});
list.push({
  name: 'nguyen_anh',
  prompt: `Use case: stylized-concept. ONE small luminous "Nascent Soul" spirit figure: a miniature translucent cultivator (about a child's size) seated in lotus meditation pose, made of soft white-gold light with a faint jade aura, calm face, simplified flowing robe lines, a tiny halo, wispy light trails at the edges. Square 1:1, centered, the figure fills 80% of the frame. Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`,
});
list.push({
  name: 'phi_kiem',
  prompt: `Use case: stylized-concept. ONE slender straight jian flying sword, pale jade-white blade with a luminous cyan edge and a faint trailing wisp of spiritual light behind the hilt, small gold guard, dark jade grip, shown vertical with the blade pointing UP, centered, occupying 90% of the frame height. Portrait 1:4 tall narrow canvas. Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`,
});

const dir = path.join(source, '2d', 'hoa-truc', 'thien_giai');
fs.mkdirSync(dir, { recursive: true });
const has = (n) => fs.existsSync(path.join(dir, `${n}.png`));
const queue = list.filter((t) => (!only.length || only.includes(t.name)) && (force || !has(t.name)));
console.log(`${queue.length}/${list.length} ảnh → ${dir}`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const ref = t.after ? path.join(dir, `${t.after}.png`) : t.ref;
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below${ref ? ' (the attached reference image shows the exact character and outfit to reproduce)' : ''}, then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir];
    if (ref && fs.existsSync(ref)) a.push('-i', ref);
    a.push('-');
    const p = spawn('codex', a, { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 9 * 60_000);
    p.on('close', () => {
      clearTimeout(timer);
      resolve(has(t.name));
    });
  });

const done = new Set(list.filter((t) => has(t.name)).map((t) => t.name));
let next = 0;
const failed = [];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < queue.length) {
      const t = queue[next++];
      while (t.after && !done.has(t.after) && !failed.includes(t.after)) await new Promise((r) => setTimeout(r, 4000));
      let ok = false;
      if (!(t.after && failed.includes(t.after)))
        for (let i = 0; i < 3 && !ok; i++) {
          if (i) fs.rmSync(path.join(dir, `${t.name}.png`), { force: true });
          ok = await runOne(t);
        }
      if (ok) done.add(t.name);
      else failed.push(t.name);
      console.log(`${ok ? 'OK ' : 'LỖI'} ${t.name}`);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

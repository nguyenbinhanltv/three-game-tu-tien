#!/usr/bin/env node
// THIÊN GIAI hướng A: LỚP NỀN + LỚP HIỆU ỨNG dùng chung theo cảnh giới (nhân vật vẫn là tranh theo bộ trang phục, cảnh giới chỉ CHỒNG hiệu ứng).
// Ra: <DTL_ASSET_SOURCE>/2d/hoa-truc/thien_giai_lop/<tên>.png (+ .prompt.txt). Chỉ THÊM file (--force để vẽ lại).
// Dùng: node tools/codex-assets/thien-giai-lop-gen.mjs [--jobs 6] [--force] [--only a,b]. Codex tích hợp công cụ ảnh; KHÔNG dùng Tripo.
// Chỉ lấy PHONG CÁCH poster donghua tiên hiệp cao cấp; không sao chép IP, không chữ Hán thật (phù văn tự tạo), không logo.
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
const jobs = Number(opt('--jobs', 6));
const force = args.includes('--force');
const only = opt('--only', '').split(',').filter(Boolean);

const STYLE =
  'Premium Chinese xianxia "donghua" key-art, painterly semi-realistic illustration with ink-wash influence and gold-leaf filigree, cinematic luminous lighting, extremely high detail, epic scale, NOT cartoon, NOT 3D render, NOT photo';
const NOTEXT =
  'No people, no characters, no text, no letters, no Chinese characters, no logo, no watermark, no frame, no border. Any glyph-like marks must be invented abstract talisman strokes, never real writing.';
const MAGENTA =
  'plain perfectly flat pure magenta #FF00FF background, NO gradient, NO floor, NO shadow, single subject, edges crisp against the flat magenta';
const bg = (d) =>
  `Use case: ui-background. A vertical backdrop painting, portrait 2:3, for a character panel in a Chinese cultivation game: ${d} Keep the central vertical third (where a standing figure will be placed) calmer and lower in contrast, with the visual interest toward the edges, the top and the lower area. Style: ${STYLE}. ${NOTEXT}`;
const sprite = (d, shape) => `Use case: stylized-concept. ${d} ${shape} Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`;

const LIST = [
  {
    name: 'nen_na',
    prompt: bg(
      'NASCENT SOUL realm: a sea of clouds high above the world, towering immortal mountains floating in the sky with tiny pagodas, long spirit-qi chain bridges, great beams of heavenly light shining down from the top, palette of radiant gold, jade and warm cream with a pale blue sky.',
    ),
  },
  {
    name: 'nen_ht',
    prompt: bg(
      'SPIRIT TRANSFORMATION realm: the cosmic void, a vast deep-indigo starry sky with glittering stars and swirling nebula clouds in indigo, teal and gold, an enormous pale moon filling the upper part, thin silver rings of light, palette of deep blue-indigo, silver-white and a little gold.',
    ),
  },
  {
    name: 'nen_ab',
    prompt: bg(
      'HEAVEN-DEFYING TRIBULATION: ink-wash black and gold, a stormy black sky TORN OPEN by violet-and-gold lightning, a huge HEAVEN GATE (a grand celestial gate with two great doors) swinging open at the top in the rift pouring gold light, below a shattered world with mountain fragments, palette of black ink, gold and violet.',
    ),
  },
  {
    name: 'ngu_hanh',
    prompt: sprite(
      'A great circular RING of FIVE-ELEMENT spiritual qi seen slightly from the front: five luminous swirling bands of energy in five vivid colours (gold, green, azure, crimson, earth-yellow) flowing around into one large ring with an empty center, luminous wispy edges.',
      'Square 1:1, the ring fills the frame, wide empty center.',
    ),
  },
  {
    name: 'dai_sen_may',
    prompt: sprite(
      'A glowing LOTUS-AND-CLOUD platform seen from the front at a low angle: layered golden lotus petals with rising clouds and soft golden light radiating, meant to lift a standing figure; luminous, ethereal.',
      'Wide landscape 3:1, the platform fills the frame width, flat base.',
    ),
  },
  {
    name: 'cau_linh_vuc',
    prompt: sprite(
      'A glowing WORLD-SPHERE ("domain"): a shining crystal globe containing a miniature world with mountains, rivers, clouds and a tiny sun, luminous rim light, gold and jade glow, small floating motes around.',
      'Square 1:1, the sphere fills 80% of the frame.',
    ),
  },
  {
    name: 'phap_tuong_kiem_long',
    prompt: sprite(
      'A colossal spiritual avatar ("Dharma image"): a giant straight jade sword point-down at the center with a translucent jade DRAGON spiraling around the blade, the DRAGON HEAD LARGE AND CLEARLY VISIBLE at the upper left turned toward the right with open jaws, long whiskers, mane and horns; scales and sword luminous translucent jade-green and white with gold filigree edges, glowing from within as if made of light, wispy ethereal edges.',
      'Wide vertical portrait 3:4, the avatar fills the frame, big head near the top.',
    ),
  },
  {
    name: 'phap_tuong_huyen_vu',
    prompt: sprite(
      'A colossal spiritual avatar ("Dharma image") of the Black Tortoise Xuanwu: a giant armoured tortoise with a luminous jade-and-deep-blue carapace with gold filigree, a serpent coiled around its body rising up, the TORTOISE HEAD LARGE AND CLEARLY VISIBLE at the upper left with a calm wise face, and the serpent head raised at the upper right; translucent luminous, ethereal wispy edges, glowing from within.',
      'Wide vertical portrait 3:4, the avatar fills the frame, big head near the top.',
    ),
  },
  {
    name: 'phap_tuong_chu_tuoc',
    prompt: sprite(
      'A colossal spiritual avatar ("Dharma image") of the Vermilion Bird Zhuque: a giant fiery phoenix with wings spread wide and long flowing tail feathers of flame, the BIRD HEAD LARGE AND CLEARLY VISIBLE at the upper left with a sharp beak and crest, turned toward the right; feathers luminous vermilion, gold and white-hot orange with gold filigree, translucent luminous, ethereal wispy edges, glowing from within.',
      'Wide vertical portrait 3:4, the avatar fills the frame, big head near the top.',
    ),
  },
  {
    name: 'thien_mon',
    prompt: sprite(
      'A grand HEAVEN GATE seen from the front: two colossal ornate celestial doors swung open with gold filigree, pouring radiant golden light, wreathed in violet-and-gold lightning, luminous clouds around its base.',
      'Wide landscape 3:2, the gate fills the frame.',
    ),
  },
  {
    name: 'set_tim_vang',
    prompt: sprite(
      'A fan of branching violet-and-gold LIGHTNING bolts tearing across the frame diagonally, luminous cores of white-gold with violet halos, dramatic and sharp.',
      'Vertical portrait 2:3, the lightning fills the frame.',
    ),
  },
  {
    name: 'sen_lua',
    prompt: sprite(
      'A blooming FIRE LOTUS seen from the front: layered lotus petals of living flame in vermilion, orange and gold, a small elixir cauldron glow at its heart, drifting sparks, luminous.',
      'Square 1:1, the lotus fills 85% of the frame.',
    ),
  },
];

const dir = path.join(source, '2d', 'hoa-truc', 'thien_giai_lop');
fs.mkdirSync(dir, { recursive: true });
const has = (n) => fs.existsSync(path.join(dir, `${n}.png`));
const queue = LIST.filter((t) => (!only.length || only.includes(t.name)) && (force || !has(t.name)));
console.log(`${queue.length}/${LIST.length} ảnh → ${dir}`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir, '-'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      shell: process.platform === 'win32',
    });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 9 * 60_000);
    p.on('close', () => {
      clearTimeout(timer);
      resolve(has(t.name));
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

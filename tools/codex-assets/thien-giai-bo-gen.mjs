#!/usr/bin/env node
// THIÊN GIAI HOA TRÚC (hàng loạt): tranh nhân vật 8 bộ bậc cao × nam/nữ + bản A-pose sạch cho Tripo + pháp tướng Hộ pháp/Đan sư.
// Ra: <DTL_ASSET_SOURCE>/portrait/thien_giai/<bộ>_<nam|nu>_pose.png, _apose.png, phap_tuong_*.png (+ .prompt.txt). Chỉ THÊM file (--force để vẽ lại).
// Dùng: node tools/codex-assets/thien-giai-bo-gen.mjs [--jobs 5] [--force] [--only a,b] [--tier kd|na|ht]. Codex tích hợp công cụ ảnh; KHÔNG dùng Tripo.
// Phong cách tham khảo của người dùng chỉ để lấy PHONG CÁCH (voan, kim tuyến, tóc/lụa bay), không vẽ lại nhân vật nào, không chữ Hán/logo.
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
const jobs = Number(opt('--jobs', 5));
const force = args.includes('--force');
const only = opt('--only', '').split(',').filter(Boolean);
const tierOnly = opt('--tier', '');

const STYLE =
  'Painted in the "Mac Kim Gian" ink-wash xianxia illustration style: soft jade and celadon washes, fine dark ink contours, delicate gold-leaf filigree, semi-realistic painterly faces and cloth, luminous and elegant, extremely high detail, NOT cartoon, NOT 3D render, NOT photo';
const NOTEXT = 'No text, no letters, no Chinese characters, no logo, no watermark, no signature, no frame, no border.';
const MAGENTA =
  'plain perfectly flat pure magenta #FF00FF background, NO gradient, NO floor, NO shadow, NO ground, single subject, edges crisp against the flat magenta';
const GREY = 'plain flat light grey seamless background (#D8D8D8), no floor shadow, single subject';
const WHO = {
  nam: 'a young adult MAN, East Asian, calm sharp-eyed face, straight dark eyebrows, very long black hair tied in a high topknot with a small crown, the rest of the hair flowing long',
  nu: 'a young adult WOMAN, East Asian, serene refined face with almond eyes, very long black hair half up with a small crown and fine hairpins, the rest flowing long',
};
// tier: kd = Kết Đan (2–3 lớp voan, viền kim tuyến), na = Nguyên Anh (nhiều lớp hơn, giáp vai chạm, dải lụa dài), ht = Hóa Thần (áo choàng dài quét đất, ngọc bội, cực kỳ lộng lẫy)
const TIER_TEXT = {
  kd: 'Elevate it to a Golden-Core-realm grade: TWO TO THREE LAYERS of sheer translucent voile gauze outer robes, edges trimmed with dense GOLD-THREAD embroidery, wide flowing sleeves with long trailing silk ribbons, small jade pendants and tassels',
  na: 'Elevate it to a Nascent-Soul-realm grade: THREE LAYERS of sheer translucent voile, richly chased metal shoulder pauldrons with filigree, long gold-embroidered borders everywhere, very long trailing ribbons and a flowing sash, jade ornaments and a refined crown',
  ht: 'Elevate it to a Spirit-Transformation-realm grade, an immortal-realm masterpiece: a grand LONG sweeping outer cloak of translucent voile that trails along the ground behind, FOUR LAYERS of gauze, ornate chased pauldrons and jade belt ornaments, dense gold-thread filigree across the whole garment, ribbons and long hair streaming in a spiritual wind, ethereal radiance',
};
const SETS = [
  {
    id: 'dia_giap',
    tier: 'kd',
    dir: 'set_dia_long_ho_giap',
    piece: 'dia_long',
    look: 'a heavy guardian outfit in deep earthen brown (#6E4A32) with antique-gold (#C9A04A) trim, layered armour plates like a dragon-earth shell, a broad belt, a stoic protector feel',
  },
  {
    id: 'phuc_mach',
    tier: 'kd',
    dir: 'set_phuc_mach_dan_bao',
    piece: 'phuc_mach',
    look: 'an alchemist robe in moss green (#58724A) with pale gold (#CFC08A) trim, herb pouches, a small medicine gourd and vials hanging from the belt, a gentle scholarly healer feel',
  },
  {
    id: 'kinh_quang',
    tier: 'na',
    dir: 'set_kinh_quang_kiem_y',
    piece: 'kinh_quang',
    look: 'a sword-cultivator outfit in pale silver-white (#C9D3E0) with steel-blue (#7E93B3) trim, mirror-bright shoulder pauldrons, a cold sharp elegant feel',
  },
  {
    id: 'van_kinh',
    tier: 'na',
    dir: 'set_van_kinh_thiet_giap',
    piece: 'van_kinh',
    look: 'a heavy guardian outfit in cloud-slate grey-blue (#5C6C7E) with silver (#B8C4D2) trim, cloud-pattern armour plates, broad cloud-scroll belt',
  },
  {
    id: 'luu_ly',
    tier: 'na',
    dir: 'set_luu_ly_dan_y',
    piece: 'luu_ly',
    look: 'an alchemist robe in glazed teal (#3F9C96) with pale ivory (#E8F1E4) trim, liuli glass beads and a jade elixir vial at the belt, translucent glass-like sleeve overlays',
  },
  {
    id: 'tinh_khuyet',
    tier: 'ht',
    dir: 'set_tinh_khuyet_kiem_bao',
    piece: 'tinh_khuyet',
    look: 'a sword-cultivator outfit in deep night indigo (#1E2335) with antique-gold (#B89B56) trim, constellation star embroidery in gold and violet (#9B84F2), a regal starry feel',
  },
  {
    id: 'co_thanh',
    tier: 'ht',
    dir: 'set_co_thanh_huyen_giap',
    piece: 'co_thanh',
    look: 'a heavy guardian outfit in ancient-city dark slate (#262B38) with weathered gold (#BA9A55) trim, carved city-wall relief armour, a noble ancient fortress feel',
  },
  {
    id: 'than_tang',
    tier: 'ht',
    dir: 'set_than_tang_dan_bao',
    piece: 'than_tang',
    look: 'an alchemist-sage robe in deep navy (#232B3D) with gold (#C2AA62) trim and soft jade-green (#8FE8B8) glow accents, a sealed-vault treasury feel, scroll cases and a small elixir cauldron charm at the belt',
  },
];
const pose = (s, g) =>
  `Use case: stylized-concept. ONE full-length character illustration for the character sheet of a Chinese cultivation game. Subject: ${WHO[g]}, wearing the outfit of the attached reference (keep its identity: ${s.look}). ${TIER_TEXT[s.tier]}. Dynamic dignified pose: body in three-quarter view, one arm raised with an open palm gathering spiritual qi, the other arm relaxed, hair, ribbons and voile layers blown strongly sideways by a gust of spiritual wind, NO weapon, NO sword in hand. Whole figure from the top of the hair to the soles with 4% margin. Portrait 2:3. Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`;
const apose = (s, g) =>
  `Use case: stylized-concept. ONE full-body character concept for image-to-3D modelling, the SAME character and outfit as the attached reference image: ${WHO[g]}, wearing the outfit (${s.look}) in its elevated immortal-grade form with the layered voile and gold filigree exactly as in the reference. Strict A-pose, standing upright facing the camera, arms about 35 degrees away from the torso with visible gaps, feet shoulder-width, calm neutral face, layers hanging straight and symmetric, no wind, no flying ribbons, NO weapon, NO props. Orthographic-looking, camera at chest height, whole figure inside the frame with 6% margin. Portrait 2:3. Style: ${STYLE}. Render: neutral soft even lighting, ${GREY}. ${NOTEXT}`;

const list = [];
for (const s of SETS) {
  const concept = path.join(source, 'chr', s.dir, 'concept', 'concept_34_v01.png');
  const piece = path.join(source, 'chr', s.dir, 'concept', `outfit_${s.piece}_ao_ngoai_v01_front.png`);
  const refs = [fs.existsSync(concept) && concept, fs.existsSync(piece) && piece].filter(Boolean);
  for (const g of Object.keys(WHO)) {
    list.push({ name: `${s.id}_${g}_pose`, tier: s.tier, refs, prompt: pose(s, g) });
    list.push({ name: `${s.id}_${g}_apose`, tier: s.tier, after: `${s.id}_${g}_pose`, prompt: apose(s, g) });
  }
}
const PT = {
  huyen_vu:
    'a colossal spiritual avatar ("Dharma image") of the Black Tortoise Xuanwu: a giant armoured tortoise with a luminous jade-and-dark-blue carapace with gold filigree, a serpent coiled around its body rising up, the HEAD OF THE TORTOISE LARGE AND CLEARLY VISIBLE at the upper left looking toward the right with a calm wise face, and the serpent head raised at the upper right; translucent luminous with ethereal wispy edges, glowing from within as if made of light',
  chu_tuoc:
    'a colossal spiritual avatar ("Dharma image") of the Vermilion Bird Zhuque: a giant fiery phoenix with wings spread wide, long flowing tail feathers of flame, the HEAD OF THE BIRD LARGE AND CLEARLY VISIBLE at the upper left with a sharp beak and crest, turned toward the right, feathers in luminous vermilion, gold and white-hot orange with gold filigree, translucent luminous with ethereal wispy edges, glowing from within as if made of light',
  kiem_long:
    'a colossal spiritual avatar ("Dharma image"): a colossal straight jade sword point-down at the center with a translucent jade DRAGON spiraling around the blade, the DRAGON HEAD LARGE AND CLEARLY VISIBLE at the upper left turned toward the right with open jaws, long whiskers, mane and horns, scales and the sword rendered in luminous translucent jade-green and white with gold filigree edges, glowing from within as if made of light, wispy ethereal edges',
};
for (const [k, d] of Object.entries(PT))
  list.push({
    name: `phap_tuong_${k}`,
    tier: 'kd',
    prompt: `Use case: stylized-concept. ONE huge ghostly ${d}. Wide vertical portrait 3:4, the avatar fills the frame, the big head near the top. Style: ${STYLE}. Background: ${MAGENTA}. ${NOTEXT}`,
  });

const dir = path.join(source, 'portrait', 'thien_giai');
fs.mkdirSync(dir, { recursive: true });
const has = (n) => fs.existsSync(path.join(dir, `${n}.png`));
const queue = list.filter(
  (t) =>
    (!only.length || only.includes(t.name)) &&
    (!tierOnly || t.tier === tierOnly || (t.name.startsWith('phap_tuong') && tierOnly === 'kd')) &&
    (force || !has(t.name)),
);
console.log(`${queue.length}/${list.length} ảnh → ${dir}`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const refs = t.after ? [path.join(dir, `${t.after}.png`)] : (t.refs ?? []);
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below${refs.length ? ' (the attached reference image(s) show the exact character and outfit to reproduce)' : ''}, then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir];
    for (const r of refs) if (fs.existsSync(r)) a.push('-i', r);
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

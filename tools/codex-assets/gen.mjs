#!/usr/bin/env node
// Sinh ảnh 2D bằng Codex (codex exec + công cụ ảnh tích hợp, không Tripo, không API key).
// Dùng: node tools/codex-assets/gen.mjs <nhóm> [id…] [--jobs 4] [--force]
// Nhóm: icons | portraits | loading | ui | concepts (E-0: concept asset cho Tripo, chủ thể là object có `look`). Ra: <DTL_ASSET_SOURCE>/2d/<nhóm>/<id>.png + <id>.prompt.txt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const group = args.shift();
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const jobs = Number(flag('--jobs', '4'));
const force = args.includes('--force');
const ids = args.filter((a) => !a.startsWith('--'));

const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));
const PALETTE = 'Palette #2B5552 #123B45 #AE8B49 #F2C47E #DCE6DF #7FE3D0 plus subject material color.';
const NO_TEXT = 'No text, letters, watermark, logo, signature, circular borders, ink brush ring, cartoon, purple background.';
const ART = 'Semi-realistic cinematic painterly rendering (Chinese fantasy), muted misty-dawn palette, original design, not copied from any existing game, novel or artwork.';

const templates = {
  icons: (s) => `Use case: stylized-concept. ONE square original cultivation fantasy inventory/ability icon.
Subject: ${s}.
Same family: thin bronze chamfered SQUARE border inset 5%, dark jade teal mist gradient background,
warm dawn gold upper-left light, cool teal shadows. Semi-realistic cinematic painterly material rendering,
subject fills 75%, bold silhouette readable at 48px, restrained fine detail.
${PALETTE}
No text, letters, watermark, circular borders, ink brush ring, cartoon, purple background, scenery.
Entire object inside frame. Purple only as a tiny accent under 5%.`,
  portraits: (s) => `Use case: stylized-concept. ONE vertical 3:4 portrait-orientation picture for a Chinese fantasy cultivation game dialog frame.
Subject: ${s}.
Head-and-shoulders framing (or head-and-upper-body for creatures), face fully visible in the upper half, soft dawn rim light from the upper left, cool teal shadows,
dark misty teal-grey blurred background, thin bronze chamfered rectangular border inset 4% around the picture.
${ART} Colors from: ivory #E6DDCB, sect blue #3B6584, deep navy #22364E, dark teal #2B5552, cinnabar #9D392E, bronze #AE8B49, dark wood #4D3324, skin #E6BF9C, ink black hair #29292C, jade #7FE3D0 only as a small accent.
${NO_TEXT} No second character, no scenery detail, no strong magic glow.`,
  loading: (s) => `Use case: stylized-concept. ONE wide cinematic 16:9 landscape concept painting used as a game loading screen background.
Scene: ${s}.
Early morning, warm golden sunlight breaking through thick layered mist, jade-teal atmosphere, distant mountains fading into teal mist,
cool teal shadows and warm gold highlights, soft volumetric light. The lower third and the center-left are kept low-detail and darker so UI text can sit on top.
${ART} Any figures tiny and in the middle distance.
${NO_TEXT} No snow, no purple tint, no UI, no frame border.`,
  concepts: (s) => `Use case: stylized-concept. ONE single-object 3D game asset concept image for a Chinese fantasy cultivation game, original design, not copied from any existing game, novel or artwork.
Subject: ${s.look}.
View: ${s.cat === 'set' ? 'full body, front view, plain neutral dummy figure' : s.cat === 'grass' ? 'a single clump, slight 3/4 angle from above, whole clump visible' : ['elite', 'boss', 'mon'].includes(s.cat) ? 'full body three-quarter side view (front-left), neutral standing pose, whole subject fully inside the frame with 8% margin' : 'three-quarter view slightly from above, whole object fully inside the frame with 8% margin'}.
Style: semi-realistic cinematic painterly rendering, believable materials with hand-painted detail, clear readable silhouette, large shapes first, restrained fine detail, muted misty-dawn palette (stone greys, bronze #AE8B49, ivory #E6DDCB, dark teal #2B5552, jade #7FE3D0 only as a small accent).
Render: neutral soft even studio lighting from the front-left, no strong directional shadows, no color cast, plain light grey seamless background (#D8D8D8), no floor scenery, no floor shadow, single subject only. Landscape 3:2.
No text, letters, calligraphy, watermark, logo, signature, no glow bloom, no particles, no smoke, no fog, no magic effects, no cel shading, no toon outlines, no anime, no chibi, no photograph, no purple tint, no snow, no cropped parts, no second creature, no people unless stated, no harness, no jewelry, no saddle, no ornaments on creatures.`,
  ui: (s) => `Use case: stylized-concept. ONE UI texture asset for a Chinese fantasy cultivation game, flat orthographic view, no perspective.
Asset: ${s}.
${ART} Colors from: ivory #E6DDCB, parchment, dark teal #2B5552, deep navy #22364E, cinnabar #9D392E, bronze #AE8B49, jade #7FE3D0 as a tiny accent.
${NO_TEXT}`,
};

if (!templates[group]) {
  console.error('Nhóm: icons | portraits | loading | ui | concepts');
  process.exit(1);
}
const all = read(`${group}.json`);
const todo = (ids.length ? ids : Object.keys(all)).filter((id) => {
  if (!all[id]) throw new Error(`Không có chủ thể: ${id}`);
  return force || !fs.existsSync(path.join(source, '2d', group, `${id}.png`));
});
const outDir = path.join(source, '2d', group);
fs.mkdirSync(outDir, { recursive: true });
console.log(`${group}: ${todo.length}/${Object.keys(all).length} ảnh, ${jobs} luồng → ${outDir}`);

const runOne = (id) =>
  new Promise((resolve) => {
    const prompt = templates[group](all[id]);
    fs.writeFileSync(path.join(outDir, `${id}.prompt.txt`), prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./${id}.png in the current directory (shell copy). Do nothing else.\n\n${prompt}\n`;
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', outDir, '-'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      shell: process.platform === 'win32',
    });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 8 * 60_000);
    p.on('close', () => {
      clearTimeout(timer);
      resolve(fs.existsSync(path.join(outDir, `${id}.png`)));
    });
  });

let next = 0;
let ok = 0;
const failed = [];
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const id = todo[next++];
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        if (force || attempt) fs.rmSync(path.join(outDir, `${id}.png`), { force: true });
        done = await runOne(id);
      }
      if (done) ok++;
      else failed.push(id);
      console.log(`${done ? 'OK ' : 'LỖI'} ${id} (${ok + failed.length}/${todo.length})`);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

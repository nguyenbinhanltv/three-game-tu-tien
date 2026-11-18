#!/usr/bin/env node
// CHR-PROTO: concept đầu trọc + mảnh tóc cho nhân vật nền v2 (người dùng dựng trên Tripo web).
// Dùng: node tools/codex-assets/chr-base-gen.mjs [id…] [--jobs 3] [--force]. Ra: <DTL_ASSET_SOURCE>/chr/chr_base_v2/concept/<id>.png + .prompt.txt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const args = process.argv.slice(2);
const jobsAt = args.indexOf('--jobs');
const jobs = jobsAt >= 0 ? Number(args.splice(jobsAt, 2)[1]) : 3;
const force = args.includes('--force');
const ids = args.filter((a) => !a.startsWith('--'));

const HEAD = (
  sex,
  desc,
) => `Use case: stylized-concept. ONE reference image of a bald human head and neck for 3D modeling, original character design for a Chinese fantasy cultivation game.
Subject: ${desc}. Completely bald, NO hair at all, no hairline stubble, no hat, no headband, no ornaments, no earrings, ears visible, bare neck and a hint of collarbone only, cropped at the base of the neck.
View: strictly FRONT view, orthographic-looking, camera at eye level, face looking straight into the camera, head perfectly upright and symmetric, neutral calm closed-mouth expression, eyes open and looking forward, eyelids relaxed.
Style: semi-realistic cinematic painterly rendering, believable skin with soft pores, East Asian features, healthy warm skin tone #E6BF9C, refined high cheekbones, composed noble gaze. ${sex}
Render: neutral soft even studio lighting from the front, no strong shadows, no color cast, plain flat light grey seamless background (#D8D8D8), single subject only, head fills 80% of the frame height, portrait 3:4.
No text, watermark, glow, particles, makeup effects, face paint, scars, tattoos, no side lighting, no cartoon, no anime, no chibi, no photograph of a real person.`;
const HAIR = (
  desc,
) => `Use case: stylized-concept. ONE reference image of a hairstyle ALONE as a separate wig-like hair piece for 3D modeling, original design for a Chinese fantasy cultivation game.
Subject: ${desc}. Shown as a hair piece only: NO face, NO head, NO neck, NO body, NO headband or ornaments, hair floats on its own showing the inside cap shape of the scalp. Jet ink-black hair #29292C with subtle cool blue sheen, clearly separated thick locks with a readable silhouette, large shapes first.
View: strictly FRONT view, symmetric, whole hair piece inside the frame with 10% margin.
Style: semi-realistic cinematic painterly rendering, hand-painted strand groups, not individual hairs.
Render: neutral soft even lighting from the front, no strong shadows, plain flat light grey seamless background (#D8D8D8), single object only, portrait 3:4.
No text, watermark, glow, particles, no ribbon, no jewelry, no hairpin, no cartoon, no anime, no photograph.`;

const all = {
  head_nam: HEAD(
    'Masculine.',
    'a young adult East Asian man, age about 25, strong straight jaw, straight dark brows, calm sword-cultivator look',
  ),
  head_nu: HEAD(
    'Feminine.',
    'a young adult East Asian woman, age about 24, soft oval face, slim jaw, fine arched brows, graceful calm look',
  ),
  hair_nam_a: HAIR(
    "men's hair style A: tied in a high topknot at the crown with a long straight ponytail falling down the back to the waist, short neat side strands framing the temples",
  ),
  hair_nam_b: HAIR(
    "men's hair style B: half-up half-down, upper half gathered into a small high topknot, the lower hair loose and straight past the shoulders to the mid-back, two thin face-framing locks in front",
  ),
  hair_nu_a: HAIR(
    "women's hair style A: tied high into a single ponytail at the crown falling to the waist, with straight see-through bangs (fringe) across the forehead and two long side locks framing the cheeks",
  ),
  hair_nu_b: HAIR(
    "women's hair style B: high twin-tail style gathered at the crown into one tight bun with a long tail trailing down the back to the waist, blunt side-swept bangs, two long face-framing locks to the chest",
  ),
};
const outDir = path.join(source, 'chr/chr_base_v2/concept');
fs.mkdirSync(outDir, { recursive: true });
const todo = (ids.length ? ids : Object.keys(all)).filter((id) => force || !fs.existsSync(path.join(outDir, `${id}.png`)));
const runOne = (id) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(outDir, `${id}.prompt.txt`), all[id] + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./${id}.png in the current directory (shell copy). Do nothing else.\n\n${all[id]}\n`;
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', outDir, '-'], {
      stdio: ['pipe', 'ignore', 'ignore'],
      shell: process.platform === 'win32',
    });
    p.stdin.end(body);
    const t = setTimeout(() => p.kill(), 8 * 60_000);
    p.on('close', () => {
      clearTimeout(t);
      resolve(fs.existsSync(path.join(outDir, `${id}.png`)));
    });
  });
let next = 0;
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < todo.length) {
      const id = todo[next++];
      let ok = false;
      for (let a = 0; a < 3 && !ok; a++) {
        if (a) fs.rmSync(path.join(outDir, `${id}.png`), { force: true });
        ok = await runOne(id);
      }
      console.log(`${ok ? 'OK ' : 'LỖI'} ${id}`);
    }
  }),
);

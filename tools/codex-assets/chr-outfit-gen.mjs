#!/usr/bin/env node
// CHR-OUTFIT-V2: concept trang phục VỪA thân nền v2 (MakeHuman, cao ráo, vai hẹp) cho 3 bộ: đồ đệ tử tân thủ (set_de_tu), Lạc Kiếm (set_lac_kiem), Liệt Mạch (set_liet_mach_kiem_y).
// Mỗi bộ: 3 ảnh toàn thân tư thế A (trước/sau/nghiêng) + ảnh từng mảnh (cho Tripo HD). Ra: <DTL_ASSET_SOURCE>/chr/<thư mục bộ>/concept/v2_<tên>.png + .prompt.txt (chỉ THÊM file mới).
// Dùng: node tools/codex-assets/chr-outfit-gen.mjs [bộ …] [--jobs 4] [--force] (bộ: de_tu | lac_kiem | liet_mach). Codex tích hợp công cụ ảnh, không dùng Tripo API/credit.
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
const jobs = ji >= 0 ? Number(args.splice(ji, 2)[1]) : 4;
const force = args.includes('--force');
const want = args.filter((a) => !a.startsWith('--'));

const FIT =
  'The garment is TAILORED to a tall slender body (about 8 heads tall, narrow shoulders, long legs): it follows the torso closely with only modest ease, hangs straight and clean, sleeves wide at the cuff but NOT puffy, NO bulky padding, NO oversized volume, silhouette stays slim and elegant like a long cultivator robe (dao pao).';

const SETS = {
  de_tu: {
    dir: 'set_de_tu',
    name: 'Đồ đệ tử tân thủ',
    look: 'a plain disciple outfit of a sword sect: a long sect-blue (#3B6584) robe (dao pao) reaching mid-calf with a CROSSED collar (right panel over left, ivory #E6DDCB under-collar visible as a narrow V), ivory cuff bands on wide sleeves, thin deep-navy (#22364E) edge piping, a brown (#6B4B2F) leather sash belt tied with a simple knot at the left hip, dark charcoal (#2A2C33) trousers visible below the hem, dark brown (#2B211B) short boots with cloth wraps, NO shoulder armor, NO decoration beyond piping',
    pieces: {
      ao_ngoai: 'a long sect-blue (#3B6584) disciple robe (dao pao) to mid-calf: crossed collar with a narrow ivory under-collar V, wide sleeves with ivory cuff bands, thin deep-navy edge piping along collar, hem and cuffs, side slits at the hips, hanging in clean straight folds, open at the bottom (hollow tube shape, no legs inside)',
      lop_duoi: 'plain dark charcoal (#2A2C33) straight linen trousers with a short ivory inner under-robe hem panel at the front and back, cloth leg wraps below the knee, simple stitched hems',
      dai_tua: 'a brown (#6B4B2F) leather sash belt as a closed ring with a plain knot and two short hanging tails, a small iron ring, no ornaments',
      ung: 'a pair of dark brown (#2B211B) short leather boots with cloth ankle wraps, simple round toes',
      trang_suc_dau: 'a plain deep-navy cloth hair band (forehead ribbon) with two short tails, nothing else',
    },
  },
  lac_kiem: {
    dir: 'set_lac_kiem',
    name: 'Lạc Kiếm',
    look: 'the outfit of the Lac Kiem sword sect elite disciple: a long IVORY (#E4DEC8) robe (dao pao) to mid-calf with a CROSSED collar and deep-navy (#27476E) trim along collar, cuffs and hem, wide sleeves, a navy sash belt with a small jade (#7FE3D0) plaque, a pair of BLUE lacquered shoulder pauldrons (#3B6584 with lighter #4C86B0 highlights and thin silver edge, layered like a sword-guard petal) over the shoulders, dark navy trousers and dark boots, a pale ice-blue sword-light accent on the pauldron edges only',
    pieces: {
      ao_ngoai: 'a long ivory (#E4DEC8) robe (dao pao) to mid-calf: crossed collar, deep-navy (#27476E) trim along collar, cuffs and hem, wide sleeves with navy cuff bands, high side slits, clean straight folds, open at the bottom (hollow tube shape)',
      lop_duoi: 'dark navy straight trousers with a long ivory inner under-robe panel split at the middle, cloth leg wraps below the knee',
      vai_giap: 'a matching pair of blue lacquered shoulder pauldrons (#3B6584 with lighter #4C86B0 highlights, thin silver edge), each made of three overlapping curved petal plates shaped like a sword guard, small silver rivets, a faint ice-blue edge glow, slim and compact (not huge)',
      dai_tua: 'a deep-navy (#27476E) sash belt with a small rectangular jade (#7FE3D0) plaque and one short hanging silver-blue cord with a bead, closed ring around the waist',
      ung: 'a pair of dark navy leather boots with silver toe caps and cloth ankle wraps',
      trang_suc_dau: 'a small silver and pale-blue hair crown (guan) holding a topknot: a slim silver cap with a tiny blue gem and a thin hairpin',
    },
  },
  liet_mach: {
    dir: 'set_liet_mach_kiem_y',
    name: 'Liệt Mạch Kiếm Y',
    look: 'a swordsman outfit in ivory and earth tones: a long IVORY (#E6DDCB) outer coat (dao pao) to mid-calf with a crossed collar, cinnabar-earth (#9A4A32) lining visible at cuffs and the high side slits, narrow tidy torso with a long back panel ending in a swallow-tail hem, bronze (#B07A3C) thread crack-vein embroidery on the hem and sleeve edges, a pair of angular bronze shoulder pauldrons shaped like cracked cliff strata with faint amber (#E8A33D) vein glow, a wide cinnabar leather belt with a bronze buckle, dark cinnabar-brown trousers and leather boots',
    pieces: {
      ao_ngoai: 'a long ivory (#E6DDCB) outer coat (dao pao) to mid-calf: crossed collar, wide but not puffy sleeves with cinnabar-earth lining cuffs, high side slits, long back panel ending in a swallow-tail hem, bronze-thread crack-vein embroidery along the hem and sleeve edges, clean straight folds, open at the bottom (hollow tube shape)',
      lop_duoi: 'wide-leg dark cinnabar-brown (#6B3A2A) linen trousers with a front-and-back long ivory under-skirt panel split at the middle, cinnabar leather leg wraps below the knee',
      vai_giap: 'a matching pair of angular bronze (#B07A3C) shoulder pauldrons shaped like cracked cliff strata: three stacked overlapping plates rising to a sharp upward point, engraved crack-vein lines inlaid with thin amber (#E8A33D) glow, small rivets, slim and compact',
      dai_tua: 'a wide cinnabar leather belt with a rectangular bronze buckle plate engraved with crack veins and a small amber stone, a thinner side sash knot, two short braided cords with amber-bead tassels',
      ung: 'a pair of cinnabar-brown leather boots with bronze toe caps and straps, cloth leg wraps',
      trang_suc_dau: 'a small bronze hair crown (guan) with a thin hairpin and a tiny amber stone, holding a topknot',
    },
  },
};

const BODY = 'a plain neutral faceless bald grey mannequin of a tall slender East Asian cultivator';
const VIEW = {
  front: 'strictly FRONT view, orthographic-looking, camera at chest height, figure facing the camera, symmetric',
  back: 'strictly BACK view, orthographic-looking, camera at chest height, figure facing away from the camera, symmetric',
  side: 'strictly SIDE view (left profile, figure facing left of the image), orthographic-looking, camera at chest height',
};
const RENDER =
  'Render: neutral soft even studio lighting from the front, no strong shadows, no color cast, plain flat light grey seamless background (#D8D8D8), no floor scenery, no floor shadow, single subject only.';

const full = (s, view) => `Use case: stylized-concept. ONE full-body 3D character-outfit concept image for a Chinese fantasy cultivation game. ${ORIGINAL}
Subject: ${BODY} wearing ${s.look}. ${FIT}
Pose: A-pose, standing upright, feet shoulder-width apart, arms straight and held about 35 degrees away from the torso with relaxed open hands (clear gap between arms and body), head neutral facing forward${view === 'side' ? ' (side view: head in profile)' : ''}.
View: ${VIEW[view]}. Whole figure from head to feet inside the frame with 6% margin. Portrait 2:3.
Style: ${STYLE}
${RENDER}
${NOTEXT}`;

const piece = (s, key) => `Use case: stylized-concept. ONE single-object 3D game asset concept image (for image-to-3D modeling), a clothing piece of a Chinese fantasy cultivation game outfit. ${ORIGINAL}
Subject: ${s.pieces[key]}. ${key === 'ao_ngoai' ? FIT : 'Slim and compact, matching a slender body.'}
View: strictly FRONT view of the piece alone, shown as worn shape standing upright on an invisible form, WITHOUT a body or mannequin inside, whole piece inside the frame with 8% margin, ${key === 'ao_ngoai' ? 'arms/sleeves hanging down in a relaxed A-pose angle (about 35 degrees away from the torso)' : 'symmetric'}. Landscape or portrait as needed.
Style: ${STYLE}
${RENDER}
${NOTEXT}`;

const todo = [];
for (const [id, s] of Object.entries(SETS)) {
  if (want.length && !want.includes(id)) continue;
  const dir = path.join(source, 'chr', s.dir, 'concept');
  fs.mkdirSync(dir, { recursive: true });
  for (const v of Object.keys(VIEW)) todo.push({ dir, name: `v2_${v}`, prompt: A(full(s, v)) });
  for (const k of Object.keys(s.pieces)) todo.push({ dir, name: `v2_piece_${k}`, prompt: A(piece(s, k)) });
}
const queue = todo.filter((t) => force || !fs.existsSync(path.join(t.dir, `${t.name}.png`)));
console.log(`${queue.length}/${todo.length} ảnh, ${jobs} luồng`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(t.dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below, then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const p = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', t.dir, '-'], { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 8 * 60_000);
    p.on('close', () => {
      clearTimeout(timer);
      resolve(fs.existsSync(path.join(t.dir, `${t.name}.png`)));
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
        if (a) fs.rmSync(path.join(t.dir, `${t.name}.png`), { force: true });
        ok = await runOne(t);
      }
      console.log(`${ok ? 'OK ' : 'LỖI'} ${path.basename(t.dir === '' ? '' : path.dirname(t.dir))}/${t.name}`);
      if (!ok) failed.push(t.name);
    }
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

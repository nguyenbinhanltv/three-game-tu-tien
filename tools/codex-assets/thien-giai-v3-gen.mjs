#!/usr/bin/env node
// THIÊN GIAI v3 (làm lại bản thử, nữ, bộ Liệt Mạch): ba tranh poster HOÀN TOÀN MỚI cho Nguyên Anh / Hóa Thần / Dị Biến, không chồng lớp lên tranh cũ.
// Ra: <DTL_ASSET_SOURCE>/portrait/thien_giai_v3/<tên>.png (+ .prompt.txt). Chỉ THÊM file (--force để vẽ lại).
// Dùng: node tools/codex-assets/thien-giai-v3-gen.mjs [--force] [--only a,b]. Codex tích hợp công cụ ảnh; KHÔNG dùng Tripo.
// Chỉ lấy PHONG CÁCH poster donghua tu tiên cao cấp; không sao chép nhân vật/IP nào, không chữ Hán thật, không logo.
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
const force = args.includes('--force');
const only = opt('--only', '').split(',').filter(Boolean);

const STYLE =
  'Premium Chinese xianxia "donghua" key-art poster, painterly semi-realistic illustration with ink-wash influence and gold-leaf filigree, cinematic lighting, extremely high detail, epic scale, NOT cartoon, NOT 3D render, NOT photo';
const NOTEXT =
  'No text, no letters, no Chinese characters, no logo, no watermark, no signature, no UI, no frame, no border. Any glyph-like patterns must be invented abstract talisman strokes, not real writing.';
const WHO =
  'a young adult WOMAN cultivator, East Asian, serene refined face with almond eyes, long black hair, wearing the LIET MACH outfit identity of the attached reference (ochre-gold and warm tan robe, bronze dragon-scale pauldron on one shoulder, jade-green accents, jade disc pendant, bronze bracers), evolved into a higher immortal form';

const LIST = [
  {
    name: 'nguyen_anh_nu',
    prompt: `Use case: stylized-concept. Vertical key-art poster, portrait 2:3. NASCENT SOUL realm ("Nguyen Anh"). Subject: ${WHO}. She floats high in the AIR, not standing on ground, seated in meditation or standing serenely upon a luminous platform of lotus and cloud. Above her head, a golden NASCENT SOUL: a miniature translucent golden-glowing double of herself (same face, tiny, seated in meditation, radiant gold light with a halo) hovering like a crown, with a faint golden beam linking it to her brow. Around her body a ring of FIVE-ELEMENT spiritual qi in five vivid colours (gold, green, azure, crimson, earth-yellow) swirling in a great orbit. Her long hair streams UPWARD from spiritual pressure; her eyes glow softly gold-white. Her gown is now an immortal gown of glowing translucent voile with luminous invented talisman patterns running along it. Background: a sea of clouds far above the world, floating immortal mountains with pagodas, spirit-qi bridges, beams of heavenly light shining down from above. Dominant palette: radiant gold, jade, warm cream, with hints of five colours. Composition: figure centered, large, heroic. Style: ${STYLE}. ${NOTEXT}`,
  },
  {
    name: 'hoa_than_nu',
    prompt: `Use case: stylized-concept. Vertical key-art poster, portrait 2:3. SPIRIT TRANSFORMATION realm ("Hoa Than"). Subject: ${WHO}. Her body is HALF-TRANSPARENT, made of luminous light, an ascended immortal figure; her long hair has turned SILVER-WHITE and glows. Holding up in her open palm a glowing WORLD-SPHERE (her own "domain"): a tiny shining globe containing a miniature world with mountains, rivers, clouds and a sun, bathing her face in light. Behind her rises a COLOSSAL DHARMA IMAGE as tall as a mountain: a giant immortal titan of golden-white light, THREE HEADS and SIX ARMS (invented, abstract, majestic), standing on a sea of stars, translucent and radiant. Background: the void of space, a vast starry sky, nebula clouds in deep indigo and gold, an enormous moon, and a great turning circle-chain of invented talisman glyphs (law of the Dao) rotating around the titan like a halo. Dominant palette: deep indigo-black, silver-white, gold, with cyan-jade glow. Composition: figure centered with the titan towering behind. Style: ${STYLE}. ${NOTEXT}`,
  },
  {
    name: 'di_bien_nu',
    prompt: `Use case: stylized-concept. Vertical key-art poster, portrait 2:3. HEAVEN-DEFYING TRIBULATION ("Di Bien", the peak). Subject: ${WHO}. She ascends defiantly INTO a heavenly tribulation, flying upward with one arm thrust toward the sky, fearless fierce expression, her eyes and the meridian lines on her skin glowing GOLD. A violet-and-gold LIGHTNING storm TEARS THE SKY open, a vast HEAVEN GATE swings open high above in the rift. Behind her back, MANY AFTERIMAGES / avatars of herself arranged in a great circle like a halo of phantoms in different poses. Far below, the WORLD is shattering and rising in fragments, mountains and rivers breaking apart and floating upward. Visual style: ink-wash black and gold with a violet light, high contrast, dramatic, monumental. Her robe is torn and streaming, outer voile scorched and glowing at the edges. Composition: figure centered, ascending diagonal energy. Style: ${STYLE}. ${NOTEXT}`,
  },
];

const dir = path.join(source, 'portrait', 'thien_giai_v3');
fs.mkdirSync(dir, { recursive: true });
const ref = path.join(source, 'portrait', 'thien_giai', 'liet_mach_nu_pose.png');
const has = (n) => fs.existsSync(path.join(dir, `${n}.png`));
const queue = LIST.filter((t) => (!only.length || only.includes(t.name)) && (force || !has(t.name)));
console.log(`${queue.length}/${LIST.length} ảnh → ${dir}`);

const runOne = (t) =>
  new Promise((resolve) => {
    fs.writeFileSync(path.join(dir, `${t.name}.prompt.txt`), t.prompt + '\n');
    const body = `Use the built-in image generation tool to create exactly ONE image from the brief below (the attached reference shows only the CHARACTER IDENTITY and outfit colours to keep; the composition must be completely new), then copy the generated PNG to ./${t.name}.png in the current directory (shell copy). Do nothing else.\n\n${t.prompt}\n`;
    const a = ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir];
    if (fs.existsSync(ref)) a.push('-i', ref);
    a.push('-');
    const p = spawn('codex', a, { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    p.stdin.end(body);
    const timer = setTimeout(() => p.kill(), 9 * 60_000);
    p.on('close', () => {
      clearTimeout(timer);
      resolve(has(t.name));
    });
  });

const failed = [];
await Promise.all(
  queue.map(async (t) => {
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      if (i) fs.rmSync(path.join(dir, `${t.name}.png`), { force: true });
      ok = await runOne(t);
    }
    console.log(`${ok ? 'OK ' : 'LỖI'} ${t.name}`);
    if (!ok) failed.push(t.name);
  }),
);
if (failed.length) {
  console.log('Thất bại:', failed.join(' '));
  process.exitCode = 1;
}

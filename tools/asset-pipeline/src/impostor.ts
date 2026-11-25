// Bake impostor cây xa (P2-A4b): chạy tools/blender/bake_impostor.py trên GLB thô, đổi sang WebP (sharp), đặt tên theo
// hash nội dung, ghi apps/client/public/assets/impostor/<id>.<hash>.webp và apps/client/src/game/core/impostors.json.
//   pnpm assets:impostor [--size 256]  (luôn bake đủ các loài để ghép atlas)
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { findBlender } from '../../blender/find-blender.mjs';
import { at } from '@dtl/shared';

const root = path.resolve(import.meta.dirname, '../../..');
const outDir = path.join(root, 'apps/client/public/assets/impostor');
const indexFile = path.join(root, 'apps/client/src/game/core/impostors.json');
const TREES = ['prop_co_thu', 'prop_thong_co', 'prop_soi_nui', 'prop_anh_dao', 'prop_phong_do'];

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const size = Number(opt('--size', '256'));

const blender = findBlender() as string | null;
if (!blender) {
  console.error('[impostor] không tìm thấy Blender (đặt BLENDER=đường_dẫn)');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
// Atlas chung: mỗi cây một hàng (2 góc nhìn ngang), để mọi loài ở xa cùng một draw call mỗi ô.
const rows: { id: string; png: string; frame: number; height: number }[] = [];
for (const id of TREES) {
  const raw = path.join(root, 'assets/build/raw', `${id}.glb`);
  if (!fs.existsSync(raw)) {
    console.error(`[impostor] thiếu ${raw} (chạy pnpm assets:build --only ${id})`);
    process.exit(1);
  }
  const png = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-imp-')), `${id}.png`);
  const r = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python',
      path.join(root, 'tools/blender/bake_impostor.py'),
      '--',
      raw,
      png,
      '--size',
      String(size),
    ],
    { encoding: 'utf8' },
  );
  const m = /IMPOSTOR (\{.*\})/.exec(r.stdout ?? '');
  if (r.status !== 0 || !m) {
    console.error(r.stdout, r.stderr);
    process.exit(1);
  }
  const info = JSON.parse(at(m, 1, 'm')) as { frame: number; height: number };
  rows.push({ id, png, ...info });
}
const atlas = await sharp({
  create: { width: size * 2, height: size * rows.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(rows.map((r, i) => ({ input: r.png, left: 0, top: i * size })))
  .webp({ quality: 82, alphaQuality: 90, effort: 6 })
  .toBuffer();
const hash = crypto.createHash('sha256').update(atlas).digest('hex').slice(0, 10);
for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f));
const file = `trees.${hash}.webp`;
fs.writeFileSync(path.join(outDir, file), atlas);
const index = {
  file,
  rows: rows.length,
  species: Object.fromEntries(rows.map((r, i) => [r.id, { row: i, frame: r.frame, height: r.height }])),
};
fs.writeFileSync(
  indexFile,
  `${JSON.stringify(index, null, 2)}
`,
);
console.log(`[impostor] ${file} ${(atlas.length / 1024).toFixed(1)}KB, ${rows.length} loài`, index.species);

// Tải bộ texture mặt đất CC0 (Poly Haven) rồi đóng gói cho shader địa hình (M-P2-A2).
//   tsx src/terrain-textures.ts      (lệnh gốc repo: pnpm assets:terrain)
// Nguồn lớn (JPG 1K gốc) để ở ../dtl-asset-source/texture/<id>/ (ngoài repo, xem assets/README.md).
// Mỗi lớp ra 2 file WebP 1024: `<layer>.a.*.webp` (albedo sRGB) và `<layer>.n.*.webp`
// (R,G = pháp tuyến OpenGL, B = độ nhám). Client ghép các lớp thành 2 texture mảng (game/groundTextures.ts), nên shader
// chỉ tốn 2 slot texture dù có 8 lớp. Ghi `apps/client/public/terrain/manifest.json` (kèm hash nội dung).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './config.js';

/** Thứ tự = chỉ số lớp trong texture mảng; khớp `GROUND_LAYER` ở client. */
export const LAYERS = [
  { layer: 'grass', ph: 'leafy_grass', author: 'Charlotte Baglioni' },
  { layer: 'dirt', ph: 'brown_mud_leaves_01', author: 'Rob Tuytel' },
  { layer: 'forest', ph: 'forrest_ground_01', author: 'Rob Tuytel' },
  { layer: 'rock', ph: 'rocky_terrain_02', author: 'Amal Kumar' },
  { layer: 'cliff', ph: 'rock_face', author: 'Greg Zaal, Dario Barresi' },
  { layer: 'sand', ph: 'coast_sand_rocks_02', author: 'Rob Tuytel' },
  { layer: 'paving', ph: 'cobblestone_floor_04', author: 'Rob Tuytel' },
  { layer: 'gravel', ph: 'gravelly_sand', author: 'Dario Barresi' },
] as const;

const SRC = path.resolve(ROOT, '..', 'dtl-asset-source', 'texture');
const OUT = path.join(ROOT, 'apps', 'client', 'public', 'terrain');
const SIZE = 1024;

async function fetchBuf(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function source(ph: string, kind: 'Diffuse' | 'nor_gl' | 'Rough'): Promise<Buffer> {
  const f = path.join(SRC, ph, `${ph}_${kind}_1k.jpg`);
  if (existsSync(f)) return readFile(f);
  const files = (await (await fetch(`https://api.polyhaven.com/files/${ph}`)).json()) as Record<string, Record<string, Record<string, { url: string }>>>;
  const buf = await fetchBuf(files[kind]['1k'].jpg.url);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, buf);
  return buf;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const manifest: { layer: string; ph: string; a: string; n: string }[] = [];
  for (const L of LAYERS) {
    const [diff, nor, rough] = await Promise.all([source(L.ph, 'Diffuse'), source(L.ph, 'nor_gl'), source(L.ph, 'Rough')]);
    const albedo = await sharp(diff).resize(SIZE, SIZE).removeAlpha().webp({ quality: 76 }).toBuffer();
    // Pháp tuyến: R = x, G = y (z dựng lại ở shader), B = độ nhám.
    const nrm = await sharp(nor).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
    const r = await sharp(rough).resize(SIZE, SIZE).greyscale().raw().toBuffer();
    for (let i = 0; i < SIZE * SIZE; i++) nrm[i * 3 + 2] = r[i];
    const n = await sharp(nrm, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 78 }).toBuffer();
    const ar = albedo;
    const name = (suffix: string, b: Buffer) => `${L.layer}.${suffix}.${createHash('sha1').update(b).digest('hex').slice(0, 10)}.webp`;
    const entry = { layer: L.layer, ph: L.ph, a: name('a', ar), n: name('n', n) };
    await writeFile(path.join(OUT, entry.a), ar);
    await writeFile(path.join(OUT, entry.n), n);
    manifest.push(entry);
    console.log(`[terrain] ${L.layer} (${L.ph}): a ${(ar.length / 1024) | 0} KB, n ${(n.length / 1024) | 0} KB`);
  }
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ size: SIZE, layers: manifest }, null, 2) + '\n');
}

void main();

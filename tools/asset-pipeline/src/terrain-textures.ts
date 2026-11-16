// Tải bộ texture mặt đất CC0 (Poly Haven) rồi đóng gói cho shader địa hình (M-P2-A2).
//   tsx src/terrain-textures.ts      (lệnh gốc repo: pnpm assets:terrain)
// Nguồn lớn (JPG 1K gốc) để ở ../dtl-asset-source/texture/<id>/ (ngoài repo, xem assets/README.md).
// Mỗi lớp ra 2 file WebP 1024: `<layer>.a.*.webp` (albedo sRGB) và `<layer>.n.*.webp`
// (R,G = pháp tuyến OpenGL, B = độ nhám). Client ghép các lớp thành 2 texture mảng (game/groundTextures.ts), nên shader
// chỉ tốn 2 slot texture dù có 8 lớp. Thêm `mask.<hash>.png` (RGBA, groundMask.ts). Ghi `apps/client/public/terrain/manifest.json` (kèm hash nội dung).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './config.js';
import { buildMaskData, MASK_RES } from '../../../apps/client/src/render/groundMask.js';

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

/**
 * Bộ ochre cho Đoạn Mạch Cổ Cốc (E2-I): cùng thứ tự lớp (khớp `GROUND_LAYER`), ra `public/terrain-ochre/`, client nạp lười khi vào level
 * (`levels/doan_mach.assets.json` `ground.set`), không nằm trong tải đầu. `tint` nhân màu sRGB cho ngả đất son (cốc đứt mạch: cát đỏ nâu, đá sa thạch).
 * Không có mặt nạ riêng: level dùng mặt nạ `neutral`.
 */
export const OCHRE_LAYERS = [
  { layer: 'grass', ph: 'dry_ground_rocks', author: 'Rob Tuytel', tint: [1.05, 0.95, 0.82] },
  { layer: 'dirt', ph: 'red_laterite_soil_stones', author: 'Rob Tuytel', tint: [1.0, 0.9, 0.82] },
  { layer: 'forest', ph: 'cracked_red_ground', author: 'Rob Tuytel', tint: [0.92, 0.82, 0.72] },
  { layer: 'rock', ph: 'sandstone_cracks', author: 'Rob Tuytel', tint: [1.04, 0.92, 0.8] },
  { layer: 'cliff', ph: 'rock_face_03', author: 'Rob Tuytel', tint: [1.04, 0.9, 0.78] },
  { layer: 'sand', ph: 'aerial_sand', author: 'Rob Tuytel', tint: [1.04, 0.94, 0.8] },
  { layer: 'paving', ph: 'cobblestone_floor_04', author: 'Rob Tuytel', tint: [1.1, 0.74, 0.58] },
  { layer: 'gravel', ph: 'gravelly_sand', author: 'Dario Barresi', tint: [1.04, 0.93, 0.8] },
] as const;

const SRC = process.env.DTL_ASSET_SOURCE ? path.resolve(process.env.DTL_ASSET_SOURCE, 'texture') : path.resolve(ROOT, '..', 'dtl-asset-source', 'texture');
const SET = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'terrain';
const OUT = path.join(ROOT, 'apps', 'client', 'public', SET === 'ochre' ? 'terrain-ochre' : 'terrain');
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
  const layers: readonly { layer: string; ph: string; author: string; tint?: readonly number[] }[] = SET === 'ochre' ? OCHRE_LAYERS : LAYERS;
  for (const L of layers) {
    const [diff, nor, rough] = await Promise.all([source(L.ph, 'Diffuse'), source(L.ph, 'nor_gl'), source(L.ph, 'Rough')]);
    let img = sharp(diff).resize(SIZE, SIZE).removeAlpha();
    if (L.tint) img = img.modulate({ saturation: 0.66, brightness: 1.06 }).linear([...L.tint], [0, 0, 0]);
    const albedo = await img.webp({ quality: 76 }).toBuffer();
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
  if (SET === 'ochre') {
    await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ size: SIZE, layers: manifest }, null, 2) + '\n');
    return;
  }
  // Mặt nạ vùng (đường mòn, sân lát, cát, nhiễu vĩ mô): tính một lần ở đây (~1 s), client chỉ giải mã PNG.
  const maskRaw = buildMaskData();
  const maskPng = await sharp(Buffer.from(maskRaw.buffer), { raw: { width: MASK_RES, height: MASK_RES, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  const mask = `mask.${createHash('sha1').update(maskPng).digest('hex').slice(0, 10)}.png`;
  await writeFile(path.join(OUT, mask), maskPng);
  console.log(`[terrain] mask: ${(maskPng.length / 1024) | 0} KB`);
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ size: SIZE, mask, layers: manifest }, null, 2) + '\n');
}

void main();

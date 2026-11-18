// Tải bộ texture mặt đất CC0 (Poly Haven) rồi đóng gói cho shader địa hình (M-P2-A2).
//   tsx src/terrain-textures.ts      (lệnh gốc repo: pnpm assets:terrain)
// Nguồn lớn (JPG 1K gốc) để ở ../dtl-asset-source/texture/<id>/ (ngoài repo, xem assets/README.md).
// Mỗi lớp ra 2 file WebP 1024: `<layer>.a.*.webp` (albedo sRGB) và `<layer>.n.*.webp`
// (R,G = pháp tuyến OpenGL, B = độ nhám). Client ghép các lớp thành 2 texture mảng (game/groundTextures.ts), nên shader
// chỉ tốn 2 slot texture dù có 8 lớp. Thêm `mask.<hash>.png` (RGBA, groundMask.ts). Ghi `apps/client/public/terrain/manifest.json` (kèm hash nội dung).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
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
  { layer: 'grass', ph: 'dry_ground_rocks', author: 'Rob Tuytel', tint: [1.02, 0.96, 0.86] },
  { layer: 'dirt', ph: 'red_laterite_soil_stones', author: 'Rob Tuytel', tint: [1.6, 1.5, 1.4] },
  { layer: 'forest', ph: 'gravelly_sand', author: 'Dario Barresi', tint: [0.96, 0.9, 0.8] },
  { layer: 'rock', ph: 'sandstone_cracks', author: 'Rob Tuytel', tint: [1.04, 0.92, 0.8] },
  { layer: 'cliff', ph: 'rock_face_03', author: 'Rob Tuytel', tint: [1.04, 0.9, 0.78] },
  { layer: 'sand', ph: 'aerial_sand', author: 'Rob Tuytel', tint: [1.04, 0.94, 0.8] },
  { layer: 'paving', ph: 'cobblestone_floor_04', author: 'Rob Tuytel', tint: [1.1, 0.74, 0.58] },
  { layer: 'gravel', ph: 'gravelly_sand', author: 'Dario Barresi', tint: [1.04, 0.93, 0.8] },
] as const;

/**
 * Bộ slate cho Thiên Khuyết Cổ Thành (E4-I): sân đá phiến/đá lát cổ ngả xanh lam đêm, rêu thưa, đá vỡ; cùng thứ tự lớp, ra `public/terrain-slate/`,
 * nạp lười khi vào level (`levels/thien_khuyet.assets.json` `ground.set`). `tint` kéo màu về xám lam (đã hạ bão hòa ở `modulate`).
 */
export const SLATE_LAYERS = [
  { layer: 'grass', ph: 'monastery_stone_floor', author: 'Amal Kumar', tint: [0.95, 1.0, 1.04] },
  { layer: 'dirt', ph: 'rock_path', author: 'Amal Kumar', tint: [0.95, 0.99, 1.03] },
  { layer: 'forest', ph: 'mossy_cobblestone', author: 'Sơn Nguyễn', tint: [0.88, 1.0, 0.98] },
  { layer: 'rock', ph: 'slate_floor_02', author: 'Dimitrios Savva', tint: [0.95, 1.0, 1.06] },
  { layer: 'cliff', ph: 'rock_face_03', author: 'Rob Tuytel', tint: [0.92, 0.97, 1.04] },
  { layer: 'sand', ph: 'gravelly_sand', author: 'Dario Barresi', tint: [0.94, 0.98, 1.02] },
  { layer: 'paving', ph: 'patterned_slate_tiles', author: 'Dimitrios Savva', tint: [0.95, 1.0, 1.06] },
  { layer: 'gravel', ph: 'rocky_gravel', author: 'Dario Barresi, Dimitrios Savva', tint: [0.94, 0.98, 1.02] },
] as const;

/**
 * Bộ ash cho Bắc Hoang Tẫn Nguyên (DV-3I, chương 5): đất cháy, tro, đá nứt, đá núi lửa. Cùng thứ tự lớp, ra `public/terrain-ash/`, nạp lười khi vào level
 * (`levels/bac_hoang.assets.json` `ground.set`). `tint` kéo về tro than (`rift_ash`/`rift_ash_light`), hạ bão hòa ở `modulate`; ánh than hồng do shader vẽ khe nứt
 * và màu đỉnh (`game/bacHoangArt.ts`), không in vào texture.
 */
export const ASH_LAYERS = [
  { layer: 'grass', ph: 'burned_ground_01', author: 'Rob Tuytel', tint: [1.0, 0.95, 0.93] },
  { layer: 'dirt', ph: 'mud_cracked_dry_03', author: 'Dario Barresi, Dimitrios Savva', tint: [0.95, 0.9, 0.88] },
  { layer: 'forest', ph: 'aerial_mud_1', author: 'Rob Tuytel', tint: [0.92, 0.88, 0.86] },
  { layer: 'rock', ph: 'rock_boulder_cracked', author: 'Dario Barresi, Dimitrios Savva', tint: [0.98, 0.93, 0.92] },
  { layer: 'cliff', ph: 'rock_wall_08', author: 'Amal Kumar', tint: [0.92, 0.88, 0.88] },
  { layer: 'sand', ph: 'aerial_sand', author: 'Rob Tuytel', tint: [0.96, 0.93, 0.92] },
  { layer: 'paving', ph: 'volcanic_rock_tiles', author: 'Charlotte Baglioni', tint: [0.95, 0.9, 0.9] },
  { layer: 'gravel', ph: 'dry_riverbed_rock', author: 'Amal Kumar', tint: [0.94, 0.9, 0.88] },
] as const;

const SRC = process.env.DTL_ASSET_SOURCE ? path.resolve(process.env.DTL_ASSET_SOURCE, 'texture') : path.resolve(ROOT, '..', 'dtl-asset-source', 'texture');
const SET = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'terrain';
const OUT = path.join(ROOT, 'apps', 'client', 'public', SET === 'ochre' ? 'terrain-ochre' : SET === 'slate' ? 'terrain-slate' : SET === 'ash' ? 'terrain-ash' : 'terrain');
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

/** Bộ gốc (Vân Lam): bộ khác trỏ sang đây khi một lớp ra đúng cùng nội dung (X14), thay vì chép thêm một bản. */
const BASE_SET = 'terrain';

/**
 * Ghi một lớp ra `OUT` và trả tên ghi vào manifest. Nội dung đã có sẵn thì không ghi bản thứ hai: trùng với lớp vừa ghi trong
 * lần chạy này thì dùng lại tên đó, trùng với file của bộ gốc thì trỏ `../terrain/<file>` (client ghép `<bộ>/<tên>` nên đường dẫn tương đối chạy được).
 */
async function emit(layer: string, suffix: 'a' | 'n', buf: Buffer, written: Map<string, string>): Promise<string> {
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 10);
  const key = `${suffix}.${hash}.webp`;
  const prev = written.get(key);
  if (prev) return prev;
  let name = `${layer}.${key}`;
  const baseDir = path.join(path.dirname(OUT), BASE_SET);
  const shared = path.basename(OUT) !== BASE_SET && existsSync(baseDir) ? readdirSync(baseDir).find((f) => f.endsWith(`.${key}`)) : undefined;
  if (shared) name = `../${BASE_SET}/${shared}`;
  else await writeFile(path.join(OUT, name), buf);
  written.set(key, name);
  return name;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const written = new Map<string, string>();
  const manifest: { layer: string; ph: string; a: string; n: string }[] = [];
  const layers: readonly { layer: string; ph: string; author: string; tint?: readonly number[] }[] = SET === 'ochre' ? OCHRE_LAYERS : SET === 'slate' ? SLATE_LAYERS : SET === 'ash' ? ASH_LAYERS : LAYERS;
  for (const L of layers) {
    const [diff, nor, rough] = await Promise.all([source(L.ph, 'Diffuse'), source(L.ph, 'nor_gl'), source(L.ph, 'Rough')]);
    let img = sharp(diff).resize(SIZE, SIZE).removeAlpha();
    if (L.tint) img = img.modulate({ saturation: 0.48, brightness: 1.08 }).linear([...L.tint], [0, 0, 0]);
    const albedo = await img.webp({ quality: 76 }).toBuffer();
    // Pháp tuyến: R = x, G = y (z dựng lại ở shader), B = độ nhám.
    const nrm = await sharp(nor).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
    const r = await sharp(rough).resize(SIZE, SIZE).greyscale().raw().toBuffer();
    for (let i = 0; i < SIZE * SIZE; i++) nrm[i * 3 + 2] = r[i];
    const n = await sharp(nrm, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ quality: 78 }).toBuffer();
    const ar = albedo;
    const entry = { layer: L.layer, ph: L.ph, a: await emit(L.layer, 'a', ar, written), n: await emit(L.layer, 'n', n, written) };
    manifest.push(entry);
    console.log(`[terrain] ${L.layer} (${L.ph}): a ${(ar.length / 1024) | 0} KB, n ${(n.length / 1024) | 0} KB`);
  }
  if (SET !== 'terrain') {
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

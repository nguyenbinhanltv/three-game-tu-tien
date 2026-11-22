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

/**
 * Bộ snow cho Bắc Hoang (MAP-5 PR2, phong cách B): tuyết (nhiều biến thể), đá đen, vách đá lạnh. Cùng thứ tự lớp, ra `public/terrain-snow/`, nạp lười khi vào level
 * (`levels/bac_hoang.assets.json` `ground.set`). Lớp tuyết không nhuộm (đã trắng); đá/vách kéo về đen lam bằng `tint`.
 */
export const SNOW_LAYERS = [
  { layer: 'grass', ph: 'proc:powder', author: 'thủ tục (tools/asset-pipeline)' },
  { layer: 'dirt', ph: 'proc:ripple', author: 'thủ tục (tools/asset-pipeline)' },
  { layer: 'forest', ph: 'proc:crust', author: 'thủ tục (tools/asset-pipeline)' },
  { layer: 'rock', ph: 'dark_rock', author: 'Rob Tuytel', tint: [0.8, 0.82, 0.95] },
  { layer: 'cliff', ph: 'rock_wall_08', author: 'Amal Kumar', tint: [0.78, 0.8, 0.95] },
  { layer: 'sand', ph: 'proc:drift', author: 'thủ tục (tools/asset-pipeline)' },
  { layer: 'paving', ph: 'volcanic_rock_tiles', author: 'Charlotte Baglioni', tint: [0.8, 0.82, 0.95] },
  { layer: 'gravel', ph: 'proc:grit', author: 'thủ tục (tools/asset-pipeline)' },
] as const;

/**
 * Bộ ck cho Thiên Lộ Giới (TN-7, vòng mỹ thuật 3): tám lớp do Codex sinh (ảnh nguồn `texture/ck/<tên>.png` ngoài repo, KHÔNG commit), làm liền mạch bằng
 * trộn lệch (`makeTileable`), pháp tuyến dựng từ độ sáng. Cùng thứ tự lớp (khớp `GROUND_LAYER`), ra `public/terrain-ck/`, nạp lười khi vào level
 * (`levels/cuu_kieu.assets.json` `ground.set`). Ngoài tám lớp còn ba texture riêng cho kiến trúc/cảnh: `masonry.webp` (đá xây, cầu/cổng/lan can),
 * `leaf.webp` (thẻ lá RGBA, khử nền magenta) và `water.webp` (nước chảy cho thác), ghi cùng thư mục và liệt kê ở `manifest.json` mục `extras`.
 */
export const CK_LAYERS = [
  { layer: 'grass', ph: 'codex:ck_grass', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'dirt', ph: 'codex:ck_dirt', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'forest', ph: 'codex:ck_forest', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'rock', ph: 'codex:ck_rock', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'cliff', ph: 'codex:ck_cliff', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'sand', ph: 'codex:ck_sand', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'paving', ph: 'codex:ck_paving', author: 'Codex (sinh ảnh, dự án)' },
  { layer: 'gravel', ph: 'codex:ck_gravel', author: 'Codex (sinh ảnh, dự án)' },
] as const;

/**
 * Làm một ô RGB `n × n` liền mạch bằng trộn lệch: ảnh gốc ở giữa, ảnh dịch nửa ô ở rìa, trọng số lõi mượt (hết đường nối ở mép; đường nối mới nằm ở
 * giữa ảnh dịch, nơi ảnh gốc chiếm hết). Đủ cho texture tự nhiên (cỏ, đất, đá); không dành cho họa tiết có đường thẳng dài.
 */
function makeTileable(src: Buffer, n: number): Buffer {
  const out = Buffer.alloc(n * n * 3);
  const half = n >> 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const wx = Math.min(x, n - 1 - x) / half; // 0 ở mép, 1 ở giữa
      const wy = Math.min(y, n - 1 - y) / half;
      const smooth = (t: number) => t * t * (3 - 2 * t);
      const w = smooth(Math.min(1, wx * 1.6)) * smooth(Math.min(1, wy * 1.6));
      const i = (y * n + x) * 3;
      const j = (((y + half) % n) * n + ((x + half) % n)) * 3;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(src[i + c]! * w + src[j + c]! * (1 - w));
    }
  }
  return out;
}

/** Độ cao 0..1 từ độ sáng của ảnh RGB (làm mờ nhẹ, tuần hoàn) để dựng pháp tuyến cho lớp Codex. */
function heightFromRgb(rgb: Buffer, n: number): Float32Array {
  const lum = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) lum[i] = (rgb[i * 3]! * 0.299 + rgb[i * 3 + 1]! * 0.587 + rgb[i * 3 + 2]! * 0.114) / 255;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let a = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += lum[((y + dy + n) % n) * n + ((x + dx + n) % n)]!;
      out[y * n + x] = a / 9;
    }
  }
  return out;
}

// ---- tuyết thủ tục: ô liền mạch (nhiễu giá trị tuần hoàn), không có dấu chân/vết bánh xe như bộ snow_* của Poly Haven ----
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Nhiễu giá trị tuần hoàn theo chu kỳ `p` ô (tile liền mạch), nội suy quintic. */
function pnoise(x: number, y: number, p: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const m = (n: number) => ((n % p) + p) % p;
  const a = hash2(m(xi), m(yi), seed);
  const b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed);
  const d = hash2(m(xi + 1), m(yi + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbmT(u: number, v: number, base: number, oct: number, seed: number): number {
  let s = 0;
  let amp = 0.5;
  let norm = 0;
  let f = base;
  for (let o = 0; o < oct; o++) {
    s += amp * pnoise(u * f, v * f, f, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / norm;
}

/** Tuyết thủ tục 1024²: trả albedo (RGB) và độ cao 0..1 để dựng pháp tuyến/độ nhám. */
function procSnow(kind: string, n: number): { rgb: Buffer; height: Float32Array; rough: Float32Array } {
  const height = new Float32Array(n * n);
  const rgb = Buffer.alloc(n * n * 3);
  const rough = new Float32Array(n * n);
  const seed = { powder: 11, ripple: 23, crust: 37, drift: 51, grit: 67 }[kind] ?? 1;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n;
      const v = y / n;
      let h: number;
      switch (kind) {
        case 'ripple': {
          // gờ gió (sastrugi): sóng kéo dài theo một phương, méo bởi nhiễu thấp tần
          const warp = fbmT(u, v, 3, 3, seed) * 2.2;
          const r = Math.sin((u * 14 + Math.round(warp) + fbmT(u, v, 2, 2, seed + 5) * 4) * Math.PI * 2);
          h = 0.5 + 0.28 * r * (0.6 + 0.4 * fbmT(u, v, 4, 3, seed + 9)) + (fbmT(u, v, 16, 3, seed + 13) - 0.5) * 0.18;
          break;
        }
        case 'crust': {
          // lớp vỏ băng nứt: ô đa giác lớn + khe nứt hẹp
          const a = fbmT(u, v, 6, 3, seed);
          const crack = Math.abs(fbmT(u, v, 8, 2, seed + 3) - 0.5);
          h = 0.55 + (a - 0.5) * 0.35 - Math.max(0, 0.035 - crack) * 6 + (fbmT(u, v, 32, 2, seed + 7) - 0.5) * 0.08;
          break;
        }
        case 'drift':
          h = 0.5 + (fbmT(u, v, 3, 5, seed) - 0.5) * 0.9;
          break;
        case 'grit': {
          // tuyết lẫn sỏi đen mịn
          const base = 0.5 + (fbmT(u, v, 4, 4, seed) - 0.5) * 0.5;
          const g = pnoise(u * 90, v * 90, 90, seed + 2);
          h = base + (g > 0.86 ? (g - 0.86) * 2.2 : 0);
          break;
        }
        default:
          // bột mịn: gò tuyết thấp tần + hạt mịn
          h = 0.5 + (fbmT(u, v, 4, 5, seed) - 0.5) * 0.8 + (pnoise(u * 128, v * 128, 128, seed + 4) - 0.5) * 0.05;
      }
      h = Math.min(1, Math.max(0, h));
      const i = y * n + x;
      height[i] = h;
      // màu: trắng ngả lam, thung sâu lam đậm hơn, đỉnh gò trắng sáng
      const shade = 0.78 + h * 0.3;
      let r = 0.9 * shade;
      let g = 0.93 * shade;
      let b = 1.0 * shade;
      if (kind === 'grit' && pnoise(u * 90, v * 90, 90, seed + 2) > 0.86) {
        r = 0.18;
        g = 0.18;
        b = 0.22;
      }
      if (kind === 'crust') {
        const k = Math.max(0, 0.5 - h) * 0.9;
        r -= k * 0.35;
        g -= k * 0.22;
      }
      rgb[i * 3] = Math.min(255, Math.round(r * 255));
      rgb[i * 3 + 1] = Math.min(255, Math.round(g * 255));
      rgb[i * 3 + 2] = Math.min(255, Math.round(b * 255));
      rough[i] = kind === 'crust' ? 0.35 + (1 - h) * 0.3 : 0.62 + (1 - h) * 0.18;
    }
  }
  return { rgb, height, rough };
}

/** Pháp tuyến (OpenGL, R,G) từ độ cao tuần hoàn, B = độ nhám. */
function procNormal(h: Float32Array, rough: Float32Array, n: number, strength: number): Buffer {
  const out = Buffer.alloc(n * n * 3);
  const at = (x: number, y: number) => h[((y + n) % n) * n + ((x + n) % n)]!;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 3;
      out[i] = Math.round(((-dx / l) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((dy / l) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(rough[y * n + x]! * 255);
    }
  }
  return out;
}

const SRC = process.env.DTL_ASSET_SOURCE
  ? path.resolve(process.env.DTL_ASSET_SOURCE, 'texture')
  : path.resolve(ROOT, '..', 'dtl-asset-source', 'texture');
const SET = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : 'terrain';
const OUT = path.join(
  ROOT,
  'apps',
  'client',
  'public',
  SET === 'ochre'
    ? 'terrain-ochre'
    : SET === 'slate'
      ? 'terrain-slate'
      : SET === 'ash'
        ? 'terrain-ash'
        : SET === 'snow'
          ? 'terrain-snow'
          : SET === 'ck'
            ? 'terrain-ck'
            : SET === 'lackiem'
              ? 'terrain-lk'
              : 'terrain',
);
/** Bộ `lackiem` (MAP-1 bản B, chỉ Vân Lam/Kiếm Trủng): màu 2048², pháp tuyến/nhám 1024² (client giải mã ở nửa kích thước albedo); bộ khác 1024². */
const LK = SET === 'lackiem';
const SIZE = LK ? 2048 : 1024;
const NSIZE = LK ? 1024 : SIZE;
const TAG = LK ? '2k' : '1k';

async function fetchBuf(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function source(ph: string, kind: 'Diffuse' | 'nor_gl' | 'Rough'): Promise<Buffer> {
  const f = path.join(SRC, ph, `${ph}_${kind}_${TAG}.jpg`);
  if (existsSync(f)) return readFile(f);
  const files = (await (await fetch(`https://api.polyhaven.com/files/${ph}`)).json()) as Record<
    string,
    Record<string, Record<string, { url: string }>>
  >;
  const buf = await fetchBuf(files[kind][TAG].jpg.url);
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
  const shared =
    path.basename(OUT) !== BASE_SET && existsSync(baseDir) ? readdirSync(baseDir).find((f) => f.endsWith(`.${key}`)) : undefined;
  if (shared) name = `../${BASE_SET}/${shared}`;
  else await writeFile(path.join(OUT, name), buf);
  written.set(key, name);
  return name;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const written = new Map<string, string>();
  const manifest: { layer: string; ph: string; a: string; n: string }[] = [];
  const layers: readonly { layer: string; ph: string; author: string; tint?: readonly number[] }[] =
    SET === 'ochre'
      ? OCHRE_LAYERS
      : SET === 'slate'
        ? SLATE_LAYERS
        : SET === 'ash'
          ? ASH_LAYERS
          : SET === 'snow'
            ? SNOW_LAYERS
            : SET === 'ck'
              ? CK_LAYERS
              : LAYERS;
  for (const L of layers) {
    if (L.ph.startsWith('codex:')) {
      const file = path.join(SRC, 'ck', `${L.ph.slice(6)}.png`);
      if (!existsSync(file)) throw new Error(`thiếu ảnh nguồn Codex ${file} (sinh bằng Codex, xem docs/handbook/assets.md)`);
      const raw = await sharp(await readFile(file))
        .resize(SIZE, SIZE)
        .removeAlpha()
        .raw()
        .toBuffer();
      const tiled = makeTileable(raw, SIZE);
      // Hạ bão hòa ~28% và độ sáng ~8%, kéo cỏ về xanh rêu (bớt xanh chanh); các lớp khác chỉ hạ nhẹ.
      const grassy = L.layer === 'grass' || L.layer === 'forest';
      const albedo = await sharp(tiled, { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .modulate({ saturation: grassy ? 0.72 : 0.88, brightness: grassy ? 0.92 : 0.97 })
        .linear(grassy ? [1.03, 0.98, 0.88] : [1, 1, 1], [0, 0, 0])
        .webp({ quality: 76 })
        .toBuffer();
      const hgt = heightFromRgb(tiled, SIZE);
      const rough = new Float32Array(SIZE * SIZE).fill(0.82);
      const nraw = procNormal(hgt, rough, SIZE, L.layer === 'cliff' || L.layer === 'rock' ? 5 : 3);
      const n = await sharp(nraw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .resize(NSIZE, NSIZE)
        .webp({ quality: 78 })
        .toBuffer();
      const entry = { layer: L.layer, ph: L.ph, a: await emit(L.layer, 'a', albedo, written), n: await emit(L.layer, 'n', n, written) };
      manifest.push(entry);
      console.log(`[terrain] ${L.layer} (${L.ph}): a ${(albedo.length / 1024) | 0} KB, n ${(n.length / 1024) | 0} KB`);
      continue;
    }
    if (L.ph.startsWith('proc:')) {
      const ps = procSnow(L.ph.slice(5), SIZE);
      const albedo = await sharp(ps.rgb, { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .webp({ quality: 80 })
        .toBuffer();
      const n = await sharp(procNormal(ps.height, ps.rough, SIZE, 14), { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .webp({ quality: 80 })
        .toBuffer();
      const entry = { layer: L.layer, ph: L.ph, a: await emit(L.layer, 'a', albedo, written), n: await emit(L.layer, 'n', n, written) };
      manifest.push(entry);
      console.log(`[terrain] ${L.layer} (${L.ph}): a ${(albedo.length / 1024) | 0} KB, n ${(n.length / 1024) | 0} KB`);
      continue;
    }
    const [diff, nor, rough] = await Promise.all([source(L.ph, 'Diffuse'), source(L.ph, 'nor_gl'), source(L.ph, 'Rough')]);
    let img = sharp(diff).resize(SIZE, SIZE).removeAlpha();
    if (L.tint) img = img.modulate({ saturation: 0.48, brightness: 1.08 }).linear([...L.tint], [0, 0, 0]);
    const albedo = await img.webp({ quality: 76 }).toBuffer();
    // Pháp tuyến: R = x, G = y (z dựng lại ở shader), B = độ nhám.
    const nrm = await sharp(nor).resize(NSIZE, NSIZE).removeAlpha().raw().toBuffer();
    const r = await sharp(rough).resize(NSIZE, NSIZE).greyscale().raw().toBuffer();
    for (let i = 0; i < NSIZE * NSIZE; i++) nrm[i * 3 + 2] = r[i];
    const n = await sharp(nrm, { raw: { width: NSIZE, height: NSIZE, channels: 3 } })
      .webp({ quality: 78 })
      .toBuffer();
    const ar = albedo;
    const entry = { layer: L.layer, ph: L.ph, a: await emit(L.layer, 'a', ar, written), n: await emit(L.layer, 'n', n, written) };
    manifest.push(entry);
    console.log(`[terrain] ${L.layer} (${L.ph}): a ${(ar.length / 1024) | 0} KB, n ${(n.length / 1024) | 0} KB`);
  }
  if (SET === 'ck') {
    const extras: Record<string, string> = {};
    const put = async (key: string, buf: Buffer): Promise<void> => {
      const name = `${key}.${createHash('sha1').update(buf).digest('hex').slice(0, 10)}.webp`;
      await writeFile(path.join(OUT, name), buf);
      extras[key] = name;
      console.log(`[terrain] extra ${key}: ${(buf.length / 1024) | 0} KB`);
    };
    // đá xây: liền mạch (trộn lệch), 1024² cho cầu/cổng/lan can (triplanar ở client)
    const mRaw = await sharp(await readFile(path.join(SRC, 'ck', 'ck_masonry.png')))
      .resize(1024, 1024)
      .removeAlpha()
      .raw()
      .toBuffer();
    await put(
      'masonry',
      await sharp(makeTileable(mRaw, 1024), { raw: { width: 1024, height: 1024, channels: 3 } })
        .webp({ quality: 78 })
        .toBuffer(),
    );
    // nước chảy: liền mạch theo chiều dọc (cuộn UV), 512²
    const wRaw = await sharp(await readFile(path.join(SRC, 'ck', 'ck_water.png')))
      .resize(512, 512)
      .removeAlpha()
      .raw()
      .toBuffer();
    await put(
      'water',
      await sharp(makeTileable(wRaw, 512), { raw: { width: 512, height: 512, channels: 3 } })
        .webp({ quality: 78 })
        .toBuffer(),
    );
    // thẻ lá: khử nền magenta (khóa màu theo khoảng cách tới #FF00FF, mép mềm), khử viền magenta ở mép lá, 512²
    const lRaw = await sharp(await readFile(path.join(SRC, 'ck', 'ck_leaf.png')))
      .resize(512, 512)
      .removeAlpha()
      .raw()
      .toBuffer();
    const rgba = Buffer.alloc(512 * 512 * 4);
    for (let i = 0; i < 512 * 512; i++) {
      const r = lRaw[i * 3]!;
      const g = lRaw[i * 3 + 1]!;
      const b = lRaw[i * 3 + 2]!;
      const mag = Math.max(0, Math.min(r, b) - g); // độ "magenta": r và b cùng cao, g thấp
      const a = Math.min(1, Math.max(0, 1 - (mag - 40) / 90));
      // khử viền: kéo r,b về g khi pixel nhiễm magenta
      const k = Math.min(1, mag / 160);
      rgba[i * 4] = Math.round(r - (r - g) * k * 0.9);
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = Math.round(b - (b - g) * k * 0.9);
      rgba[i * 4 + 3] = Math.round(a * 255);
    }
    await put(
      'leaf',
      await sharp(rgba, { raw: { width: 512, height: 512, channels: 4 } })
        .webp({ quality: 80, alphaQuality: 85 })
        .toBuffer(),
    );
    await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ size: SIZE, layers: manifest, extras }, null, 2) + '\n');
    return;
  }
  if (SET !== 'terrain' && !LK) {
    await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ size: SIZE, layers: manifest }, null, 2) + '\n');
    return;
  }
  // Mặt nạ vùng (đường mòn, sân lát, cát, nhiễu vĩ mô): tính một lần ở đây (~1 s), client chỉ giải mã PNG.
  const maskRaw = buildMaskData();
  const maskPng = await sharp(Buffer.from(maskRaw.buffer), { raw: { width: MASK_RES, height: MASK_RES, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const mask = `mask.${createHash('sha1').update(maskPng).digest('hex').slice(0, 10)}.png`;
  await writeFile(path.join(OUT, mask), maskPng);
  console.log(`[terrain] mask: ${(maskPng.length / 1024) | 0} KB`);
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ size: SIZE, mask, layers: manifest }, null, 2) + '\n');
}

void main();

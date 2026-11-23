// IO của lò rèn: đọc/ghi raster bằng sharp, nén KTX2 bằng toktx, contact sheet.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { cropFrame, newRaster, type Raster } from './forge.js';

export async function loadRaster(file: string | Buffer): Promise<Raster> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = newRaster(info.width, info.height);
  for (let i = 0; i < r.data.length; i++) r.data[i] = data[i]! / 255;
  return r;
}

export function toRgba8(r: Raster): Buffer {
  const b = Buffer.alloc(r.data.length);
  for (let i = 0; i < b.length; i++) b[i] = Math.round(Math.min(1, Math.max(0, r.data[i]!)) * 255);
  return b;
}

const rawOf = (r: Raster) => sharp(toRgba8(r), { raw: { width: r.w, height: r.h, channels: 4 } });

export const toPng = (r: Raster): Promise<Buffer> => rawOf(r).png().toBuffer();

/** Hạ về cạnh dài tối đa `max` (giữ tỉ lệ, bội số của 4 để nén KTX2 mượt). */
export async function fitRaster(r: Raster, max: number): Promise<Raster> {
  if (Math.max(r.w, r.h) <= max) return r;
  const f = max / Math.max(r.w, r.h);
  const w = Math.max(4, Math.round((r.w * f) / 4) * 4);
  const h = Math.max(4, Math.round((r.h * f) / 4) * 4);
  return loadRaster(await rawOf(r).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer());
}

/** Dò toktx: biến TOKTX, PATH, thư mục cài mặc định, bản di động ở `dtl-asset-source` (cùng cách dò với tools/asset-pipeline/src/ktx.ts). */
export function findToktx(root: string): string | null {
  const env = process.env.TOKTX;
  if (env) return fs.existsSync(env) ? env : null;
  if (spawnSync('toktx', ['--version'], { encoding: 'utf8' }).status === 0) return 'toktx';
  const exe = process.platform === 'win32' ? 'toktx.exe' : 'toktx';
  const c = [
    path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'KTX-Software', 'bin', exe),
    path.resolve(root, '..', 'dtl-asset-source', 'tools', 'KTX-Software', 'bin', exe),
    ...(process.env.DTL_ASSET_SOURCE ? [path.join(process.env.DTL_ASSET_SOURCE, 'tools', 'KTX-Software', 'bin', exe)] : []),
  ];
  return c.find((x) => fs.existsSync(x)) ?? null;
}

/** ETC1S có mip. `srgb` cho texture màu; dữ liệu đóng kênh (R/G/B) dùng linear và chất lượng cao hơn để G không vỡ bậc. */
export function encodeKtx2(toktx: string, png: string, out: string, srgb: boolean): void {
  const q = srgb ? ['--clevel', '3', '--qlevel', '192'] : ['--clevel', '3', '--qlevel', '224'];
  const script = /\.m?js$/.test(toktx);
  const args = ['--t2', '--genmipmap', '--assign_oetf', srgb ? 'srgb' : 'linear', '--encode', 'etc1s', ...q, out, png];
  const r = spawnSync(script ? process.execPath : toktx, script ? [toktx, ...args] : args, { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`toktx lỗi: ${(r.stdout + r.stderr).trim()}`);
}

/** Co ảnh để mỗi ô lưới có cạnh là bội số của 4 (ảnh Codex hay có cỡ lẻ như 1254): khung cắt đều, nén KTX2 không lệch. */
export async function snapToGrid(r: Raster, g: { cols: number; rows: number }): Promise<Raster> {
  const cw = Math.max(4, Math.round(r.w / g.cols / 4) * 4);
  const ch = Math.max(4, Math.round(r.h / g.rows / 4) * 4);
  const w = cw * g.cols;
  const h = ch * g.rows;
  if (w === r.w && h === r.h) return r;
  return loadRaster(await rawOf(r).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer());
}

export const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-vfxforge-'));

/** Contact sheet: lưới các khung trên nền ca-rô, mỗi ô `cell` px, để duyệt mắt trước khi vào game. */
export async function contactSheet(r: Raster, g: { cols: number; rows: number }, cell = 128): Promise<Buffer> {
  const W = g.cols * cell;
  const H = g.rows * cell;
  const checker = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = ((x >> 4) + (y >> 4)) & 1 ? 70 : 100;
      const i = (y * W + x) * 3;
      checker[i] = checker[i + 1] = checker[i + 2] = v;
    }
  }
  const layers: OverlayOptions[] = [];
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < g.cols; col++) {
      const png = await rawOf(cropFrame(r, g, col, row))
        .resize(cell - 2, cell - 2, { fit: 'inside' })
        .png()
        .toBuffer();
      layers.push({ input: png, left: col * cell + 1, top: row * cell + 1 });
    }
  }
  return sharp(checker, { raw: { width: W, height: H, channels: 3 } }).composite(layers).png().toBuffer();
}

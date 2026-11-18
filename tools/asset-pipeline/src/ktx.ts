// Nén texture sang KTX2 (Basis Universal) bằng `toktx` của KTX-Software.
// ETC1S cho màu và dữ liệu thường (ORM), UASTC cho normal map (`encodeArgs`). Hạ cạnh dài nhất về ngân sách theo slot (--resize).
// Mọi asset đã commit dùng KTX2: optimize.ts dừng với hướng dẫn cài khi thiếu toktx (trừ khi chạy --no-ktx).

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { getTextureColorSpace, listTextureSlots } from '@gltf-transform/functions';
import sharp from 'sharp';
import { assetSourceCandidates } from '../../blender/find-blender.mjs';
import { type BudgetClass, ROOT, textureLimit } from './config.js';
import { imageSize } from './stats.js';

/** Bản toktx di động (giải nén, không cần quyền admin), tương đối so với thư mục nguồn asset `dtl-asset-source`. */
export const PORTABLE_TOKTX = ['tools', 'KTX-Software', 'bin', process.platform === 'win32' ? 'toktx.exe' : 'toktx'].join('/');

/** Cách cài, in kèm lỗi khi thiếu toktx (chi tiết: assets/README.md, mục "Cài toktx"). */
export const TOKTX_HELP =
  'Cài KTX-Software 4.x (https://github.com/KhronosGroup/KTX-Software/releases, Apache-2.0): chạy bộ cài (thư mục mặc định được dò tự động), ' +
  `hoặc giải nén vào <dtl-asset-source>/${PORTABLE_TOKTX}, hoặc đặt TOKTX=đường_dẫn_tới_toktx.`;

/**
 * Dò toktx: biến TOKTX, PATH, thư mục cài mặc định của KTX-Software, rồi bản di động trong thư mục nguồn asset
 * (`DTL_ASSET_SOURCE` hoặc `../dtl-asset-source`, cùng cách dò với run.mjs).
 */
export function findToktx(): string | null {
  const env = process.env.TOKTX;
  if (env) return fs.existsSync(env) ? env : null;
  const probe = spawnSync('toktx', ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'toktx';
  const candidates =
    process.platform === 'win32'
      ? [path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'KTX-Software', 'bin', 'toktx.exe')]
      : ['/usr/local/bin/toktx', '/opt/homebrew/bin/toktx', '/usr/bin/toktx'];
  for (const source of assetSourceCandidates(ROOT)) candidates.push(path.join(source, PORTABLE_TOKTX));
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/** Chạy toktx. Đường dẫn .mjs/.js chạy bằng Node (toktx giả trong test). */
function runToktx(toktx: string, args: string[]) {
  const script = /\.m?js$/.test(toktx);
  return spawnSync(script ? process.execPath : toktx, script ? [toktx, ...args] : args, { encoding: 'utf8' });
}

export function toktxVersion(toktx: string): string {
  const r = runToktx(toktx, ['--version']);
  return (r.stdout || r.stderr || '').trim().split(/\s+/).pop() ?? 'unknown';
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'png' };

/**
 * Tham số mã hóa theo loại texture, chọn bằng số đo trên texture thật (docs/ktx2/README.md):
 * - normal map: UASTC (ETC1S chỉ đạt ~35 dB, vỡ khối trên pháp tuyến; UASTC ~45–48 dB), RDO λ=1 + zstd cho file nhỏ hơn ~25%;
 * - màu sRGB (base color, emissive): ETC1S chất lượng cao (q192) vì là thứ nhìn thấy trực tiếp;
 * - dữ liệu tuyến tính khác (ORM): ETC1S mức vừa.
 * Client: WebGL2 chuyển mã mọi thứ sang BC7; WebGPU (three r178 không có BC7) nén ETC1S thành BC1/BC3 và giải UASTC ra RGBA8,
 * xem `GameKtx2Loader` ở apps/client/src/game/core/assets.ts.
 */
export function encodeArgs(normal: boolean, srgb: boolean): string[] {
  if (normal) return ['--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '1.0', '--zcmp', '18'];
  return srgb ? ['--encode', 'etc1s', '--clevel', '3', '--qlevel', '192'] : ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '128'];
}

/** Kích thước mới sau khi hạ cạnh dài về `max` (bội số của 4, giữ tỉ lệ). null nếu không cần hạ. */
export function fitWithin(w: number, h: number, max: number): [number, number] | null {
  if (max <= 0 || Math.max(w, h) <= max) return null;
  const f = max / Math.max(w, h);
  const r4 = (x: number) => Math.max(4, Math.round((x * f) / 4) * 4);
  return [r4(w), r4(h)];
}

export interface KtxResult {
  converted: number;
  resized: number;
}

/** Chạy toktx không chặn (các texture của một asset nén song song). */
function runToktxAsync(toktx: string, args: string[]): Promise<{ status: number | null; out: string }> {
  const script = /\.m?js$/.test(toktx);
  return new Promise((resolve) => {
    const p = spawn(script ? process.execPath : toktx, script ? [toktx, ...args] : args);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('error', (e) => resolve({ status: 1, out: String(e) }));
    p.on('close', (status) => resolve({ status, out }));
  });
}

export async function compressTexturesKTX2(doc: Document, toktx: string, spec: BudgetClass): Promise<KtxResult> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-ktx-'));
  const result: KtxResult = { converted: 0, resized: 0 };
  try {
    const textures = doc.getRoot().listTextures();
    await Promise.all(
      textures.map(async (tex, i) => {
        const mime = tex.getMimeType();
        let data = tex.getImage();
        if (!data || !EXT[mime]) return;
        // toktx không đọc WebP: giải mã sang PNG trước (GLB thô của vài job đã nén WebP sẵn).
        if (mime === 'image/webp') data = new Uint8Array(await sharp(data).png().toBuffer());
        const size = imageSize(data, mime === 'image/webp' ? 'image/png' : mime);
        const slots = listTextureSlots(tex);
        const normal = slots.includes('normalTexture');
        const srgb = getTextureColorSpace(tex) === 'srgb';
        const input = path.join(tmp, `in_${i}.${EXT[mime]}`);
        const output = path.join(tmp, `out_${i}.ktx2`);
        fs.writeFileSync(input, data);
        const args = ['--t2', '--genmipmap', '--assign_oetf', srgb ? 'srgb' : 'linear', ...encodeArgs(normal, srgb)];
        const fit = size ? fitWithin(size[0], size[1], textureLimit(spec, slots)) : null;
        if (fit) {
          args.push('--resize', `${fit[0]}x${fit[1]}`);
          result.resized++;
        }
        args.push(output, input);
        const r = await runToktxAsync(toktx, args);
        if (r.status !== 0 || !fs.existsSync(output)) throw new Error(`toktx lỗi với texture ${tex.getName() || i}: ${r.out.trim()}`);
        tex.setImage(new Uint8Array(fs.readFileSync(output))).setMimeType('image/ktx2');
        if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(png|jpe?g|webp)$/i, '.ktx2'));
        result.converted++;
      }),
    );
    if (result.converted > 0) doc.createExtension(KHRTextureBasisu).setRequired(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return result;
}

// Nén texture sang KTX2 (Basis Universal) bằng `toktx` của KTX-Software.
// ETC1S cho màu và dữ liệu thường (ORM), UASTC cho normal map. Hạ cạnh dài nhất về ngân sách theo slot (--resize).
// Không có toktx thì bỏ qua, giữ PNG/JPEG và in cảnh báo (validate.ts vẫn kiểm kích thước).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document } from '@gltf-transform/core';
import { KHRTextureBasisu } from '@gltf-transform/extensions';
import { getTextureColorSpace, listTextureSlots } from '@gltf-transform/functions';
import { type BudgetClass, textureLimit } from './config.js';
import { imageSize } from './stats.js';

/** Dò toktx: biến TOKTX, PATH, rồi thư mục cài mặc định của KTX-Software (giống run.mjs dò Blender). */
export function findToktx(): string | null {
  const env = process.env.TOKTX;
  if (env) return fs.existsSync(env) ? env : null;
  const probe = spawnSync('toktx', ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'toktx';
  const candidates =
    process.platform === 'win32'
      ? [path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'KTX-Software', 'bin', 'toktx.exe')]
      : ['/usr/local/bin/toktx', '/opt/homebrew/bin/toktx', '/usr/bin/toktx'];
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

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

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

export function compressTexturesKTX2(doc: Document, toktx: string, spec: BudgetClass): KtxResult {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-ktx-'));
  const result: KtxResult = { converted: 0, resized: 0 };
  try {
    const textures = doc.getRoot().listTextures();
    textures.forEach((tex, i) => {
      const mime = tex.getMimeType();
      const data = tex.getImage();
      if (!data || !EXT[mime]) return;
      const size = imageSize(data, mime);
      const slots = listTextureSlots(tex);
      const normal = slots.includes('normalTexture');
      const srgb = getTextureColorSpace(tex) === 'srgb';
      const input = path.join(tmp, `in_${i}.${EXT[mime]}`);
      const output = path.join(tmp, `out_${i}.ktx2`);
      fs.writeFileSync(input, data);
      const args = ['--t2', '--genmipmap', '--assign_oetf', srgb ? 'srgb' : 'linear'];
      args.push(...(normal ? ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18'] : ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '128']));
      const fit = size ? fitWithin(size[0], size[1], textureLimit(spec, slots)) : null;
      if (fit) {
        args.push('--resize', `${fit[0]}x${fit[1]}`);
        result.resized++;
      }
      args.push(output, input);
      const r = runToktx(toktx, args);
      if (r.status !== 0 || !fs.existsSync(output)) {
        throw new Error(`toktx lỗi với texture ${tex.getName() || i}: ${(r.stderr || r.stdout || '').trim()}`);
      }
      tex.setImage(new Uint8Array(fs.readFileSync(output))).setMimeType('image/ktx2');
      if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(png|jpe?g)$/i, '.ktx2'));
      result.converted++;
    });
    if (result.converted > 0) doc.createExtension(KHRTextureBasisu).setRequired(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return result;
}

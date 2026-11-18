// Bậc texture cao tải nền (Cao/Cực cao): `pnpm assets:hires [--only id,id] [--dry]`.
// Với asset nhập từ nguồn ngoài (meta.json `import.source`, trong `dtl-asset-source`), texture gốc (Tripo 4096²) lớn hơn
// texture đã hạ về ngân sách trong GLB build. Công cụ này lấy texture gốc, nén KTX2 ở cỡ cao hơn và ghi thành tệp rời
// `apps/client/public/assets/hi/<id>.<slot>.<hash>.ktx2`; manifest.json mục `hires` ghi vật liệu + slot để client thay sau
// khi vào game (apps/client/src/game/hires/). GLB build KHÔNG đổi (tải đầu giữ nguyên); chỉ thêm tệp, không xóa nguồn.
// Chạy SAU `assets:build` (build ghi lại manifest nên mất mục `hires`; chạy lại là có lại).

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Document, Texture } from '@gltf-transform/core';
import { getTextureColorSpace } from '@gltf-transform/functions';
import sharp from 'sharp';
import { assetSourceCandidates } from '../../blender/find-blender.mjs';
import { DEFAULTS, ROOT, createIO, findMeta, loadBudgets, rel, textureLimit, type BudgetClass } from './config.js';
import { encodeArgs, findToktx, fitWithin } from './ktx.js';
import { imageSize } from './stats.js';
import type { HiresEntry, Manifest, ManifestEntry } from './optimize.js';

import { at } from '@dtl/shared';
/**
 * Lớp ngân sách được làm bậc cao (quái, tinh anh, boss). KHÔNG gồm nhân vật `player*`: texture nhân vật trong GLB đã bị chỉnh sau khi nhập
 * (màu/mặt nạ nhuộm) nên không còn là bản thu nhỏ của texture gốc, bậc cao từ nguồn gốc làm lệch màu (đã thấy ở chr_kiem_tu_nam).
 */
export const HIRES_CLASSES = new Set(['monster', 'monster_mq', 'elite', 'elite_mq', 'boss', 'boss_mq']);
/** Trần cạnh texture bậc cao: màu tối đa 4096, dữ liệu (normal/ORM) 2048 (normal giải ra RGBA8 trên WebGPU: 4096² ≈ 85 MB). */
export const HIRES_MAX_COLOR = 4096;
export const HIRES_MAX_DATA = 2048;

/**
 * Chỉ bậc cao cho texture MÀU của boss và tinh anh (nhìn gần, ít bản sao). Quái thường không làm bậc cao (nhiều bản, nhỏ trên màn hình);
 * normal/ORM không làm (normal 2048 chiếm 19 MB riêng của boss, bản trong GLB 1024 đủ ở khoảng cách chơi). Giảm tệp rời 66 → ~15 MB.
 */
export function hiresWanted(cls: string, slots: string[]): boolean {
  if (!/^(boss|elite)(_mq)?$/.test(cls)) return false;
  return slots.length > 0 && slots.every((s) => s === 'baseColorTexture');
}

/** Tên thuộc tính vật liệu three tương ứng slot glTF (khớp cách GLTFLoader gán). */
export const THREE_SLOTS: Record<string, string[]> = {
  baseColorTexture: ['map'],
  emissiveTexture: ['emissiveMap'],
  normalTexture: ['normalMap'],
  metallicRoughnessTexture: ['roughnessMap', 'metalnessMap'],
  occlusionTexture: ['aoMap'],
};

/** Cạnh đích bậc cao cho một texture: gấp đôi ngân sách lớp, tới trần slot, không quá nguồn. null nếu không lớn hơn bản build. */
export function hiresSide(spec: BudgetClass, slots: string[], srcSide: number, builtSide: number): number | null {
  const data = slots.length > 0 && slots.every((s) => s !== 'baseColorTexture' && s !== 'emissiveTexture');
  const cap = Math.min(textureLimit(spec, slots) * 2, data ? HIRES_MAX_DATA : HIRES_MAX_COLOR);
  const side = Math.min(cap, srcSide);
  return side > builtSide ? side : null;
}

/** Bộ nhớ GPU ước lượng của texture cạnh w×h (có mip ×4/3). `rgba8`: normal trên WebGPU. */
export function gpuBytesOf(w: number, h: number, rgba8: boolean): number {
  return Math.round(w * h * (rgba8 ? 4 : 1) * (4 / 3));
}

interface MatSlot {
  tex: Texture;
  slot: string;
}

/** Vật liệu có tên → (slot glTF → texture). */
export function materialSlots(doc: Document): Map<string, MatSlot[]> {
  const out = new Map<string, MatSlot[]>();
  for (const m of doc.getRoot().listMaterials()) {
    const name = m.getName();
    if (!name) continue;
    const list: MatSlot[] = [];
    const pairs: [string, Texture | null][] = [
      ['baseColorTexture', m.getBaseColorTexture()],
      ['emissiveTexture', m.getEmissiveTexture()],
      ['normalTexture', m.getNormalTexture()],
      ['metallicRoughnessTexture', m.getMetallicRoughnessTexture()],
      ['occlusionTexture', m.getOcclusionTexture()],
    ];
    for (const [slot, tex] of pairs) if (tex) list.push({ tex, slot });
    out.set(name, list);
  }
  return out;
}

function sourceFileOf(id: string): string | null {
  const meta = findMeta(id)?.data as { import?: { kind?: string; source?: string } } | undefined;
  const src = meta?.import?.source;
  if (!src || meta?.import?.kind === 'procedural') return null;
  for (const dir of assetSourceCandidates(ROOT)) {
    const f = path.join(dir, src);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function runToktx(toktx: string, args: string[]) {
  const script = /\.m?js$/.test(toktx);
  return spawnSync(script ? process.execPath : toktx, script ? [toktx, ...args] : args, { encoding: 'utf8' });
}

async function pngOf(tex: Texture): Promise<Uint8Array | null> {
  const img = tex.getImage();
  if (!img) return null;
  const mime = tex.getMimeType();
  if (mime === 'image/png' || mime === 'image/jpeg') return img;
  if (mime === 'image/webp') return new Uint8Array(await sharp(img).png().toBuffer());
  return null; // ktx2 không đọc lại được bằng sharp
}

export async function buildHires(entry: ManifestEntry, toktx: string, outDir: string, dry: boolean): Promise<HiresEntry[]> {
  const budgets = loadBudgets();
  const spec = budgets.classes[entry.class];
  const srcFile = sourceFileOf(entry.id);
  if (!spec || !HIRES_CLASSES.has(entry.class) || !srcFile) return [];
  const io = await createIO();
  const built = materialSlots(await io.read(path.join(outDir, entry.file)));
  const source = materialSlots(await io.read(srcFile));
  const results: HiresEntry[] = [];
  const done = new Set<Texture>();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-hires-'));
  try {
    // Blender đổi tên vật liệu thành `<id>_mat`: khớp theo tên, không có thì ghép theo thứ tự khi hai bên cùng số vật liệu.
    const bnames = [...built.keys()];
    const snames = [...source.keys()];
    for (const [i, [mat, bslots]] of [...built].entries()) {
      const sslots = source.get(mat) ?? (bnames.length === snames.length ? source.get(at(snames, i)) : undefined);
      if (!sslots) continue;
      for (const b of bslots) {
        const s = sslots.find((x) => x.slot === b.slot);
        if (!s || done.has(s.tex)) continue;
        const bimg = b.tex.getImage();
        const bsz = bimg ? imageSize(bimg, b.tex.getMimeType()) : null;
        const data = await pngOf(s.tex);
        if (!bsz || !data) continue;
        const meta = await sharp(data).metadata();
        const ssz: [number, number] = [meta.width ?? 0, meta.height ?? 0];
        if (ssz[0] === 0) continue;
        // Mọi slot dùng chung một texture (ORM): gom thành một tệp.
        const slotsOfTex = sslots.filter((x) => x.tex === s.tex).map((x) => x.slot);
        if (!hiresWanted(entry.class, slotsOfTex)) continue;
        const side = hiresSide(spec, slotsOfTex, Math.max(...ssz), Math.max(...bsz));
        if (!side) continue;
        done.add(s.tex);
        const fit = fitWithin(ssz[0], ssz[1], side);
        const w = fit ? fit[0] : ssz[0];
        const h = fit ? fit[1] : ssz[1];
        const normal = slotsOfTex.includes('normalTexture');
        const srgb = getTextureColorSpace(s.tex) === 'srgb';
        const input = path.join(tmp, `in_${results.length}.png`);
        const output = path.join(tmp, `out_${results.length}.ktx2`);
        fs.writeFileSync(input, data);
        const args = ['--t2', '--genmipmap', '--assign_oetf', srgb ? 'srgb' : 'linear', ...encodeArgs(normal, srgb)];
        if (fit) args.push('--resize', `${w}x${h}`);
        args.push(output, input);
        const r = runToktx(toktx, args);
        if (r.status !== 0 || !fs.existsSync(output))
          throw new Error(`toktx lỗi (${entry.id}/${mat}/${b.slot}): ${(r.stdout + r.stderr).trim()}`);
        const bytes = fs.readFileSync(output);
        const tag = slotsOfTex.map((x) => x.replace('Texture', '')).join('-');
        const file = `hi/${entry.id}.${tag}.${crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10)}.ktx2`;
        if (!dry) {
          fs.mkdirSync(path.join(outDir, 'hi'), { recursive: true });
          fs.writeFileSync(path.join(outDir, file), bytes);
        }
        results.push({
          mat,
          slots: slotsOfTex.flatMap((x) => THREE_SLOTS[x] ?? []),
          file,
          width: w,
          height: h,
          bytes: bytes.byteLength,
          gpuBytes: gpuBytesOf(w, h, normal),
        });
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const only =
    args
      .find((a) => a.startsWith('--only='))
      ?.slice(7)
      .split(',') ?? (args.includes('--only') ? args[args.indexOf('--only') + 1]?.split(',') : undefined);
  const toktx = findToktx();
  if (!toktx) throw new Error('thiếu toktx (xem assets/README.md, mục "Cài toktx")');
  const outDir = DEFAULTS.outDir;
  const manifestFile = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
  let total = 0;
  let gpu = 0;
  for (const entry of Object.values(manifest.assets)) {
    if (only && !only.includes(entry.id)) continue;
    const list = await buildHires(entry, toktx, outDir, dry);
    if (list.length === 0) {
      if (entry.hires) delete entry.hires;
      continue;
    }
    entry.hires = list;
    const b = list.reduce((a, x) => a + x.bytes, 0);
    const g = list.reduce((a, x) => a + x.gpuBytes, 0);
    total += b;
    gpu += g;
    console.log(
      `[hires] ${entry.id}: ${list.map((x) => `${x.mat}/${x.slots[0]} ${x.width}`).join(', ')} (+${(b / 1048576).toFixed(1)} MB tải, +${(g / 1048576).toFixed(0)} MB GPU)`,
    );
  }
  // Dọn tệp hi/ không còn được manifest tham chiếu (chỉ thư mục hi/, không đụng nguồn).
  if (!dry && !only) {
    const keep = new Set(Object.values(manifest.assets).flatMap((e) => (e.hires ?? []).map((h) => h.file)));
    const dir = path.join(outDir, 'hi');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!keep.has(`hi/${f}`)) fs.unlinkSync(path.join(dir, f));
  }
  if (!dry) fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `[hires] tổng +${(total / 1048576).toFixed(1)} MB tải nền, +${(gpu / 1048576).toFixed(0)} MB GPU nếu nạp hết${dry ? ' (chạy thử)' : ''} — ${rel(manifestFile)}`,
  );
}

if (process.argv[1] && /hires\.[tj]s$/.test(process.argv[1])) await main();

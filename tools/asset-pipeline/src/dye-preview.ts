// Xem trước mặt nạ nhuộm 3 kênh của nhân vật v3 (`packages/shared/src/v3dye.ts`): đọc texture gốc Tripo trong
// `dtl-asset-source` (`DTL_ASSET_SOURCE` hoặc `../dtl-asset-source`), tính trọng số ba kênh bằng ĐÚNG hàm dùng chung của client (`@dtl/shared`), in tỉ lệ phủ và
// ghi ảnh ghép (texture | mặt nạ: đỏ = vải chính, lục = viền/lót, lam = kim loại/điểm nhấn) vào thư mục đích. Tất định, không dùng mạng.
//   pnpm dye:preview [thư-mục-đích] [id-model ...]     (mặc định: $TEMP/dye-preview, mọi model)
//   pnpm dye:preview --clusters <id-model>             in 8 cụm màu của phần texture NGOÀI vải chính (để chọn màu tham chiếu viền/kim loại)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { dyeWeights, V3_DYE_REF } from '@dtl/shared';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = path.resolve(process.env.DTL_ASSET_SOURCE ?? path.join(ROOT, '..', 'dtl-asset-source'), '3d', 'nhan-vat');
const SIZE = 256;

/** `chr_v3_<x>` → tên file raw (`raw_v3_<x>_nam.glb`; Lạc Kiếm v3 không có tên giữa). */
function rawName(key: string): string {
  const x = key.replace(/^chr_v3b?2?_/, '');
  const v = /^chr_(v3b2?)_/.exec(key)?.[1] ?? 'v3';
  return x === 'lac_kiem' ? `raw_${v === 'v3b2' ? 'v3b' : v}_nam.glb` : `raw_v3_${x}_nam.glb`;
}

function findRaw(file: string): string | null {
  if (!fs.existsSync(SRC)) return null;
  for (const d of fs.readdirSync(SRC)) {
    const p = path.join(SRC, d, 'tripo', file);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function loadTexel(file: string): Promise<Buffer> {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const tex = doc.getRoot().listMaterials()[0]?.getBaseColorTexture();
  if (!tex) throw new Error(`${file}: không có texture màu`);
  return sharp(Buffer.from(tex.getImage()!)).resize(SIZE, SIZE).removeAlpha().raw().toBuffer();
}

type Rgb = readonly [number, number, number];
/** Cụm màu k-means tất định (khởi tạo xa nhất, bộ sinh số tự dựng). */
function kmeans(pts: Rgb[], k: number): { c: Rgb; n: number }[] {
  let seed = 7;
  const rnd = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const d2 = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cs: Rgb[] = [pts[Math.floor(rnd() * pts.length)]!];
  while (cs.length < k) {
    let best = pts[0]!;
    let bd = -1;
    for (let t = 0; t < 300; t++) {
      const p = pts[Math.floor(rnd() * pts.length)]!;
      const d = Math.min(...cs.map((c) => d2(c, p)));
      if (d > bd) [bd, best] = [d, p];
    }
    cs.push(best);
  }
  let cnt: number[] = [];
  for (let it = 0; it < 12; it++) {
    const sum = cs.map(() => [0, 0, 0]);
    cnt = cs.map(() => 0);
    for (const p of pts) {
      let bk = 0;
      let bd = Infinity;
      cs.forEach((c, j) => {
        const d = d2(c, p);
        if (d < bd) [bd, bk] = [d, j];
      });
      cnt[bk]!++;
      for (let q = 0; q < 3; q++) sum[bk]![q]! += p[q]!;
    }
    cs.forEach((_, j) => {
      if (cnt[j]) cs[j] = [sum[j]![0]! / cnt[j]!, sum[j]![1]! / cnt[j]!, sum[j]![2]! / cnt[j]!];
    });
  }
  return cs.map((c, j) => ({ c, n: cnt[j]! })).sort((a, b) => b.n - a.n);
}

const hex = (c: Rgb): string =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

/** Texel sRGB 8 bit → tuyến tính đủ ba kênh. */
function texel(data: Buffer, i: number): Rgb {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [f(data[i * 3]!), f(data[i * 3 + 1]!), f(data[i * 3 + 2]!)];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === '--clusters') {
    const key = args[1] ?? '';
    const ref = V3_DYE_REF[key];
    const file = findRaw(rawName(key));
    if (!ref || !file) throw new Error(`không có ${key}`);
    const data = await loadTexel(file);
    const rest: Rgb[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const c = texel(data, i);
      if (dyeWeights(c, { mode: ref.mode, ref: ref.ref }).main < 0.5)
        rest.push([data[i * 3]! / 255, data[i * 3 + 1]! / 255, data[i * 3 + 2]! / 255]);
    }
    for (const { c, n } of kmeans(rest, 8)) console.log(hex(c), `${((n / rest.length) * 100).toFixed(0)}%`);
    return;
  }
  const out = path.resolve(args[0] && !args[0].startsWith('chr_') ? args[0] : path.join(os.tmpdir(), 'dye-preview'));
  const only = args.filter((a) => a.startsWith('chr_'));
  fs.mkdirSync(out, { recursive: true });
  for (const [key, ref] of Object.entries(V3_DYE_REF)) {
    if (only.length && !only.includes(key)) continue;
    const file = findRaw(rawName(key));
    if (!file) {
      console.warn(`bỏ qua ${key}: không thấy ${rawName(key)} trong ${SRC}`);
      continue;
    }
    const data = await loadTexel(file);
    const mask = Buffer.alloc(SIZE * SIZE * 3);
    const tot = { main: 0, trim: 0, accent: 0 };
    for (let i = 0; i < SIZE * SIZE; i++) {
      const w = dyeWeights(texel(data, i), ref);
      tot.main += w.main;
      tot.trim += w.trim;
      tot.accent += w.accent;
      const g = (data[i * 3]! + data[i * 3 + 1]! + data[i * 3 + 2]!) / 3 / 3;
      mask[i * 3] = Math.min(255, g + w.main * 200);
      mask[i * 3 + 1] = Math.min(255, g + w.trim * 220);
      mask[i * 3 + 2] = Math.min(255, g + w.accent * 220);
    }
    const left = await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .png()
      .toBuffer();
    const right = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .png()
      .toBuffer();
    await sharp({ create: { width: SIZE * 2, height: SIZE, channels: 3, background: '#000' } })
      .composite([
        { input: left, left: 0, top: 0 },
        { input: right, left: SIZE, top: 0 },
      ])
      .png()
      .toFile(path.join(out, `${key}.png`));
    const n = SIZE * SIZE;
    console.log(
      key.padEnd(20),
      `chính ${((tot.main / n) * 100).toFixed(0)}%  viền ${((tot.trim / n) * 100).toFixed(0)}%  kim loại ${((tot.accent / n) * 100).toFixed(0)}%`,
    );
  }
}

await main();

// Lò rèn texture VFX "Họa Pháp Lô" (V-P0). Dùng:
//   pnpm --filter @dtl/vfx-forge forge import <ảnh> --id <id> [--grid auto|4x4|8x8] [--mode luma|alpha|auto] [--pack color|packed]
//        [--erode <ảnh xám>] [--distort <ảnh xám>] [--max 1024] [--no-ktx] [--out <thư mục>] [--sheets <thư mục>] [--note <chữ>]
//   pnpm --filter @dtl/vfx-forge forge sample --out <thư mục>    sinh ảnh mẫu (flipbook nền đen 4x4 và 8x8, bản trong suốt, noise)
//   pnpm --filter @dtl/vfx-forge forge check [--out <thư mục>]    kiểm manifest (CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlphaMode } from './forge.js';
import { sampleSlashFlipbook, sampleTileNoise } from './samples.js';
import { checkManifest, forge } from './pipeline.js';
import { toPng } from './io.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUT = path.join(root, 'apps/client/public/assets/vfx');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n: string, d?: string): string | undefined => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};

async function main(): Promise<void> {
  if (cmd === 'sample') {
    const out = flag('--out');
    if (!out) throw new Error('thiếu --out <thư mục>');
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'sample_slash_4x4_black.png'), await toPng(sampleSlashFlipbook(4, 128, 'black')));
    fs.writeFileSync(path.join(out, 'sample_slash_8x8_black.png'), await toPng(sampleSlashFlipbook(8, 64, 'black')));
    fs.writeFileSync(path.join(out, 'sample_slash_4x4_alpha.png'), await toPng(sampleSlashFlipbook(4, 128, 'alpha')));
    fs.writeFileSync(path.join(out, 'sample_noise.png'), await toPng(sampleTileNoise(256)));
    console.log(`đã ghi ảnh mẫu vào ${out}`);
  } else if (cmd === 'import') {
    const input = argv[1];
    const id = flag('--id');
    if (!input || !id) throw new Error('dùng: import <ảnh> --id <id>');
    const res = await forge(
      {
        id,
        input,
        outDir: flag('--out') ?? DEFAULT_OUT,
        sheetDir: flag('--sheets'),
        mode: flag('--mode') as AlphaMode | undefined,
        pack: flag('--pack') as 'color' | 'packed' | undefined,
        grid: flag('--grid'),
        erode: flag('--erode'),
        distort: flag('--distort'),
        max: flag('--max') ? Number(flag('--max')) : undefined,
        ktx: argv.includes('--no-ktx') ? false : undefined,
        note: flag('--note'),
      },
      root,
    );
    const e = res.entry;
    console.log(`${e.id}: ${e.file} ${e.size.join('×')} lưới ${e.grid.cols}×${e.grid.rows} ${e.format} ${(e.bytes / 1024).toFixed(1)} KB`);
    for (const w of res.warnings) console.warn(`cảnh báo: ${w}`);
  } else if (cmd === 'check') {
    const errs = checkManifest(flag('--out') ?? DEFAULT_OUT);
    for (const e of errs) console.error(e);
    if (errs.length) process.exitCode = 1;
    else console.log('vfx-forge: manifest hợp lệ.');
  } else {
    console.log('lệnh: import | sample | check (xem đầu file cli.ts)');
    process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  console.error('vfx-forge:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

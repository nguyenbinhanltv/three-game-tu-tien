// Lò rèn texture VFX "Họa Pháp Lô" (V-P0). Dùng:
//   pnpm --filter @dtl/vfx-forge forge import <ảnh> --id <id> [--grid auto|4x4|8x8] [--mode luma|alpha|auto] [--pack color|packed]
//        [--erode <ảnh xám>] [--distort <ảnh xám>] [--max 1024] [--no-ktx] [--out <thư mục>] [--sheets <thư mục>] [--note <chữ>]
//   pnpm --filter @dtl/vfx-forge forge sample --out <thư mục>    sinh ảnh mẫu (flipbook nền đen 4x4 và 8x8, bản trong suốt, noise)
//   pnpm --filter @dtl/vfx-forge forge check [--out <thư mục>]    kiểm manifest (CI)
//   pnpm --filter @dtl/vfx-forge forge concept --card <skillId> --shot <ảnh chụp game> [--ref <ảnh mẫu đã duyệt>]... --out <thư mục ngoài repo>
//   pnpm --filter @dtl/vfx-forge forge texture --card <skillId> --kind flipbook|slash|decal|noise|ramp --name <tên> [--grid 4x4] [--ref <ảnh>]... --out <thư mục ngoài repo>
//   pnpm --filter @dtl/vfx-forge forge cards --path <id hướng tu>    sinh thẻ chiêu cho mọi chiêu chưa có thẻ (V-P2..P8)
//   (concept/texture gọi Codex; thêm --dry chỉ in prompt)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AlphaMode } from './forge.js';
import { sampleSlashFlipbook, sampleTileNoise } from './samples.js';
import { checkManifest, forge } from './pipeline.js';
import { toPng } from './io.js';
import { conceptJob, monConceptJob, runCodex, textureJob } from './codex.js';
import { writeCards } from './cards.js';
import { sharedJob } from './sharedTex.js';
import type { TextureKind } from './prompts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_OUT = path.join(root, 'apps/client/public/assets/vfx');

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = (n: string): string[] => argv.flatMap((a, i) => (a === n && argv[i + 1] ? [argv[i + 1]!] : []));
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
  } else if (cmd === 'concept' || cmd === 'texture') {
    const monCard = flag('--mon-card');
    const card = flag('--card') ?? monCard;
    const out = flag('--out');
    if (!card || !out) throw new Error(`dùng: ${cmd} --card <skillId> | --mon-card <monId__chiêu> --out <thư mục>`);
    let job;
    if (cmd === 'concept') {
      const shot = flag('--shot');
      if (!shot) throw new Error('concept cần --shot <ảnh chụp game camera chéo>');
      job = monCard ? monConceptJob(root, card, shot, flags('--ref'), out) : conceptJob(root, card, shot, flags('--ref'), out);
    } else {
      const kind = flag('--kind') as TextureKind | undefined;
      const name = flag('--name');
      if (!kind || !name) throw new Error('texture cần --kind và --name');
      job = textureJob(root, card, kind, name, flag('--grid') ?? '4x4', flags('--ref'), out);
    }
    if (argv.includes('--dry')) {
      console.log(job.prompt);
      return;
    }
    const res = await runCodex(job);
    if (!res.file) throw new Error(`Codex không ra ảnh (mã thoát ${res.code ?? 'không có'}); xem log: ${res.log}`);
    console.log(`đã sinh ${res.file}`);
  } else if (cmd === 'shared') {
    const id = argv[1];
    const out = flag('--out');
    if (!id || !out) throw new Error('dùng: shared <warn_crack|ice_crack|ice_flip> --out <thư mục ngoài repo> [--dry]');
    const job = sharedJob(id, out, flags('--ref'));
    if (argv.includes('--dry')) {
      console.log(job.prompt);
      return;
    }
    const res = await runCodex(job);
    if (!res.file) throw new Error(`Codex không ra ảnh (mã thoát ${res.code ?? 'không có'}); xem log: ${res.log}`);
    console.log(`đã sinh ${res.file}`);
  } else if (cmd === 'cards') {
    const pid = flag('--path');
    if (!pid) throw new Error('dùng: cards --path <id hướng tu>');
    const i18n: Record<string, string> = {};
    const dir = path.join(root, 'packages/content/data/i18n');
    for (const f of fs.readdirSync(dir))
      if (f.endsWith('.json')) Object.assign(i18n, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const r = writeCards(pid, root, i18n);
    console.log(`thẻ mới: ${r.written.join(' ') || '(không)'}
đã có: ${r.skipped.join(' ') || '(không)'}`);
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

// Dựng texture cho cảnh trên không của Lạc Kiếm Tông (MAP-1 bản B tả thực): đá vách đảo nổi (Poly Haven CC0) và atlas tán lá có alpha.
//   tsx src/sky-textures.ts      (lệnh gốc repo: pnpm assets:sky-textures)
// Ra apps/client/public/sky/: rock.a.<hash>.webp (màu sRGB), rock.n.<hash>.webp (R,G = pháp tuyến OpenGL, B = độ nhám, như bộ terrain),
// foliage.<hash>.webp (atlas 2×2 ô 512, có alpha: tùng, phong, trúc, đào) và manifest.json. Nguồn JPG 2K ở ../dtl-asset-source/texture (xem sect-textures.ts).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from './config.js';

const SRC = process.env.DTL_ASSET_SOURCE
  ? path.resolve(process.env.DTL_ASSET_SOURCE, 'texture')
  : path.resolve(ROOT, '..', 'dtl-asset-source', 'texture');
const OUT = path.join(ROOT, 'apps', 'client', 'public', 'sky');
const ROCK = 'cliff_side';
const SIZE = 1024;

const hash = (b: Buffer): string => createHash('sha1').update(b).digest('hex').slice(0, 10);

/** Số ngẫu nhiên tất định. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const fmt = (n: number) => n.toFixed(1);
const hsl = (h: number, s: number, l: number) => `hsl(${fmt(h)} ${fmt(s)}% ${fmt(l)}%)`;

type Kind = 'pine' | 'maple' | 'bamboo' | 'peach';

/** Một ô tán lá 512×512 dưới dạng SVG (nền trong suốt). */
function leafTile(kind: Kind, seed: number): string {
  const r = rng(seed);
  const S = 512;
  const parts: string[] = [];
  const leaf = (x: number, y: number, ang: number, len: number, wid: number, fill: string, rib: string) => {
    // Lá thon hai đầu nhọn: hai cung bézier + gân giữa.
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const px = (u: number, v: number) => `${fmt(x + u * c - v * s)} ${fmt(y + u * s + v * c)}`;
    parts.push(
      `<path d="M ${px(0, 0)} Q ${px(len * 0.5, -wid)} ${px(len, 0)} Q ${px(len * 0.5, wid)} ${px(0, 0)} Z" fill="${fill}" stroke="#0a1a0a" stroke-opacity="0.35" stroke-width="0.8"/>`,
      `<path d="M ${px(0, 0)} L ${px(len * 0.92, 0)}" stroke="${rib}" stroke-width="${fmt(Math.max(0.6, wid * 0.12))}" stroke-opacity="0.7"/>`,
    );
  };
  if (kind === 'pine') {
    // Cành tùng rủ: trục cong từ trái, mỗi nút một chùm kim xòe quạt.
    for (let b = 0; b < 5; b++) {
      const by = 90 + b * 80 + r() * 20;
      parts.push(`<path d="M 20 ${fmt(by)} Q 220 ${fmt(by - 10)} 480 ${fmt(by + 52)}" stroke="#3b2a1c" stroke-width="5" fill="none"/>`);
      for (let k = 0; k < 26; k++) {
        const t = k / 26;
        const x = 30 + t * 440;
        const y = by + Math.sin(t * 3 + b) * 18 + t * 40;
        for (let n = 0; n < 11; n++) {
          const a = -0.9 + (n / 10) * 1.8 + (r() - 0.5) * 0.3 + 0.35;
          const len = 40 + r() * 36;
          parts.push(
            `<path d="M ${fmt(x)} ${fmt(y)} L ${fmt(x + Math.cos(a) * len)} ${fmt(y + Math.sin(a) * len)}" stroke="${hsl(118 + r() * 24, 40 + r() * 18, 12 + r() * 16)}" stroke-width="${fmt(1.6 + r() * 1.2)}" stroke-linecap="round"/>`,
          );
        }
      }
    }
  } else if (kind === 'maple') {
    for (let k = 0; k < 120; k++) {
      const x = 40 + r() * 430;
      const y = 40 + r() * 430;
      const a = r() * Math.PI * 2;
      const size = 26 + r() * 22;
      const hot = r() < 0.55;
      const fill = hot ? hsl(8 + r() * 26, 70 + r() * 18, 36 + r() * 16) : hsl(30 + r() * 20, 75, 44 + r() * 10);
      // Lá phong: năm thùy (đa giác hình sao).
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? size : size * 0.42;
        const aa = a + (i / 10) * Math.PI * 2;
        pts.push(`${fmt(x + Math.cos(aa) * rad)},${fmt(y + Math.sin(aa) * rad)}`);
      }
      parts.push(`<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#2a0d05" stroke-opacity="0.35" stroke-width="0.8"/>`);
    }
  } else if (kind === 'bamboo') {
    for (let k = 0; k < 7; k++) {
      const bx = 60 + k * 60 + r() * 20;
      parts.push(`<path d="M ${fmt(bx)} 512 L ${fmt(bx + (r() - 0.5) * 10)} 360" stroke="#6b8a3c" stroke-width="4"/>`);
      for (let n = 0; n < 22; n++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.4 + (n % 2 ? 0.5 : -0.5);
        leaf(bx, 430 - r() * 60 - n * 12, a, 90 + r() * 70, 8 + r() * 5, hsl(92 + r() * 30, 48 + r() * 14, 26 + r() * 20), '#cfe9a0');
      }
    }
  } else {
    // Đào: lá xanh nền + chùm hoa hồng năm cánh.
    for (let k = 0; k < 60; k++)
      leaf(
        40 + r() * 430,
        40 + r() * 430,
        r() * Math.PI * 2,
        40 + r() * 30,
        9 + r() * 5,
        hsl(100 + r() * 26, 42 + r() * 14, 28 + r() * 16),
        '#cfe9a0',
      );
    for (let k = 0; k < 70; k++) {
      const x = 40 + r() * 430;
      const y = 40 + r() * 430;
      const sz = 12 + r() * 9;
      const tint = hsl(340 + r() * 14, 70 + r() * 18, 74 + r() * 12);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + r() * 0.3;
        const cx = x + Math.cos(a) * sz * 0.55;
        const cy = y + Math.sin(a) * sz * 0.55;
        parts.push(
          `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(sz * 0.55)}" ry="${fmt(sz * 0.4)}" transform="rotate(${fmt((a * 180) / Math.PI)} ${fmt(cx)} ${fmt(cy)})" fill="${tint}" stroke="#7a2a45" stroke-opacity="0.25" stroke-width="0.6"/>`,
        );
      }
      parts.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(sz * 0.16)}" fill="#e8c24a"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${parts.join('')}</svg>`;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  for (const f of await readdir(OUT)) if (/\.(webp|json)$/.test(f)) await rm(path.join(OUT, f));
  if (!existsSync(path.join(SRC, ROCK, `${ROCK}_Diffuse_2k.jpg`)))
    throw new Error(`thiếu ${ROCK} 2k: chạy pnpm assets:sect-textures trước`);
  const read = async (kind: string) => readFile(path.join(SRC, ROCK, `${ROCK}_${kind}_2k.jpg`));
  // Đá vách: giữ màu gốc; pháp tuyến + nhám gói như bộ terrain.
  const albedo = await sharp(await read('Diffuse'))
    .resize(SIZE, SIZE)
    .removeAlpha()
    .webp({ quality: 80 })
    .toBuffer();
  const nrm = await sharp(await read('nor_gl'))
    .resize(SIZE, SIZE)
    .removeAlpha()
    .raw()
    .toBuffer();
  const rough = await sharp(await read('Rough'))
    .resize(SIZE, SIZE)
    .greyscale()
    .raw()
    .toBuffer();
  for (let i = 0; i < SIZE * SIZE; i++) nrm[i * 3 + 2] = rough[i]!;
  const normal = await sharp(nrm, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .webp({ quality: 82 })
    .toBuffer();
  const rockA = `rock.a.${hash(albedo)}.webp`;
  const rockN = `rock.n.${hash(normal)}.webp`;
  await writeFile(path.join(OUT, rockA), albedo);
  await writeFile(path.join(OUT, rockN), normal);
  // Atlas tán lá 2×2.
  const kinds: Kind[] = ['pine', 'maple', 'bamboo', 'peach'];
  const tiles = await Promise.all(
    kinds.map((k, i) =>
      sharp(Buffer.from(leafTile(k, 1000 + i * 77)), { density: 72 })
        .resize(512, 512)
        .png()
        .toBuffer(),
    ),
  );
  const atlas = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 2) * 512, top: Math.floor(i / 2) * 512 })))
    .webp({ quality: 88, alphaQuality: 92 })
    .toBuffer();
  const fol = `foliage.${hash(atlas)}.webp`;
  await writeFile(path.join(OUT, fol), atlas);
  await writeFile(
    path.join(OUT, 'manifest.json'),
    JSON.stringify({ rock: { albedo: rockA, normal: rockN, source: ROCK }, foliage: { atlas: fol, tiles: kinds } }, null, 2) + '\n',
  );
  console.log(
    `[sky] ${rockA} ${(albedo.length / 1024) | 0} KB, ${rockN} ${(normal.length / 1024) | 0} KB, ${fol} ${(atlas.length / 1024) | 0} KB`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

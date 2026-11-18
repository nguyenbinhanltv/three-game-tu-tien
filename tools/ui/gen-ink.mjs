#!/usr/bin/env node
// Sinh vệt mực nét bút lông (U2-1) → apps/client/src/ui/u2/inkPaths.ts. Dùng: node tools/ui/gen-ink.mjs
// Mỗi biến thể là một path SVG (viewBox 320×64) gồm nhiều "sợi lông" ngang: đầu bút đậm và kín, đuôi thưa dần,
// xơ cọ (sợi đứt quãng, sợi lẻ bay xa), mép răng cưa. Seed cố định nên kết quả ổn định giữa các lần chạy.
import { writeFileSync } from 'node:fs';

const W = 320;
const H = 64;
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const f = (n) => Math.round(n * 10) / 10;

/** Một sợi: đa giác mỏng từ x0 đến x1, dày h, đầu/đuôi nhọn lệch ngẫu nhiên, mép răng cưa. */
function strand(r, x0, x1, y, h, wob) {
  const n = Math.max(3, Math.round((x1 - x0) / 7));
  const top = [];
  const bot = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const t = i / n;
    const taper = t < 0.04 ? 0.4 + t * 15 : t > 0.88 ? Math.max(0.12, (1 - t) / 0.12) : 1; // đuôi vuốt nhọn
    const yy = y + Math.sin(x * 0.045 + wob) * 1.6;
    const hh = h * taper * (0.75 + r() * 0.5);
    top.push([x, yy - hh / 2]);
    bot.push([x + (r() - 0.5) * 3, yy + hh / 2]);
  }
  const pts = [...top, ...bot.reverse()];
  return 'M' + pts.map(([x, yv]) => `${f(x)} ${f(yv)}`).join('L') + 'Z';
}

function variant({ seed, len, thick, strands, gapFrom, tailSpread, y0 = H / 2 }) {
  const r = rng(seed);
  const d = [];
  const wob = r() * 6;
  for (let i = 0; i < strands; i++) {
    const fy = (i / (strands - 1)) * 2 - 1; // -1 … 1 trên bề dày
    const edge = Math.abs(fy);
    const y = y0 + fy * thick * 0.5 + (r() - 0.5) * 1.4;
    const h = (thick / strands) * (1.5 + r() * 0.9);
    const x0 = 6 + r() * 8 + edge * 6; // đầu bút: sợi ngoài vào sau một chút
    // sợi ngoài ngắn hơn, sợi giữa dài nhất; một số sợi bay xa (xơ cọ)
    let x1 = x0 + len * (0.55 + (1 - edge) * 0.4) + (r() - 0.5) * 30;
    if (r() < tailSpread) x1 = Math.min(W - 4, x1 + 40 + r() * 70);
    x1 = Math.min(W - 3, x1);
    // sau gapFrom, sợi bị ngắt thành các đoạn (bút khô)
    const cut = x0 + (x1 - x0) * gapFrom;
    if (cut < x1 - 20) {
      d.push(strand(r, x0, cut, y, h, wob));
      let x = cut + 4 + r() * 12;
      while (x < x1 - 8) {
        const seg = 10 + r() * 38;
        d.push(strand(r, x, Math.min(x1, x + seg), y, h * (0.55 + r() * 0.35), wob));
        x += seg + 5 + r() * 16;
      }
    } else d.push(strand(r, x0, x1, y, h, wob));
  }
  // vết bắn ở đầu bút
  for (let i = 0; i < 7; i++) {
    const cx = 2 + r() * 14;
    const cy = y0 + (r() - 0.5) * (thick + 14);
    const rr = 0.8 + r() * 1.7;
    d.push(`M${f(cx - rr)} ${f(cy)}a${f(rr)} ${f(rr)} 0 1 0 ${f(rr * 2)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(-rr * 2)} 0Z`);
  }
  return d.join('');
}

const VARIANTS = [
  variant({ seed: 11, len: 250, thick: 34, strands: 26, gapFrom: 0.55, tailSpread: 0.16 }),
  variant({ seed: 29, len: 200, thick: 42, strands: 30, gapFrom: 0.48, tailSpread: 0.1 }),
  variant({ seed: 53, len: 270, thick: 24, strands: 20, gapFrom: 0.4, tailSpread: 0.25 }),
];

writeFileSync(
  new URL('../../apps/client/src/ui/u2/inkPaths.ts', import.meta.url),
  `// Sinh bởi tools/ui/gen-ink.mjs, đừng sửa tay. Vệt mực nét bút lông (viewBox ${W}×${H}), ${VARIANTS.length} biến thể.\nexport const INK_PATHS: readonly string[] = ${JSON.stringify(VARIANTS, null, 2)};\n`,
);
console.log(VARIANTS.map((v) => v.length + ' ký tự').join(', '));

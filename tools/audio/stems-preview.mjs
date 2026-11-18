#!/usr/bin/env node
// Xuất MP3 nghe thử nhạc phân lớp (M4-13): khám phá → bị nhắm → đánh nhau → hết đòn → khám phá, trộn đúng bảng
// STEM_MIX và hằng chuyển lớp của client.
//   node tools/audio/stems-preview.mjs <vùng> <file.mp3>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { findFfmpeg, SR } from './common.mjs';
import { loadGroup, mixTimeline, readRamps, readStemMix } from './stemsmix.mjs';

const [zone, out] = process.argv.slice(2);
if (!zone || !out) {
  console.error('dùng: node tools/audio/stems-preview.mjs <sect|wild|dungeon> <file.mp3>');
  process.exit(1);
}
const g = loadGroup(zone);
// [giây, mức]: 0 yên · 1 bị nhắm · 2 đang đánh · (hết đòn 7 s → 1; hết quái 6 s → 0 như musicDirector)
const steps = [
  [0, 0],
  [24, 1],
  [30, 2],
  [66, 1],
  [73, 0],
];
const total = 100;
const mix = mixTimeline(g, readStemMix(), steps, total, readRamps());
const n = mix[0].length;
const inter = new Float32Array(n * 2);
for (let i = 0; i < n; i++) {
  inter[i * 2] = mix[0][i];
  inter[i * 2 + 1] = mix[1][i];
}
const r = spawnSync(
  findFfmpeg(),
  ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0', '-c:a', 'libmp3lame', '-b:a', '192k', out],
  { input: Buffer.from(inter.buffer), maxBuffer: 1 << 30 },
);
if (r.status !== 0) throw new Error(String(r.stderr));
console.log(
  `${out}: ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${total} s — 0–24 khám phá, 24–30 bị nhắm, 30–66 đánh nhau, 66–73 hết đòn, 73+ khám phá`,
);

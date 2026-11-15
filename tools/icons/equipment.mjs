#!/usr/bin/env node
// Sinh 28 icon trang bị: Blender dựng vật thể (render_equipment.py) rồi ghép lên nền + khung đồng cùng họ icon M4-7
// (nền ngọc lam sương, nắng sớm vàng góc trên trái, khung đồng vuông vát góc thụt 5%).
// Ra: <DTL_ASSET_SOURCE>/icons/<id>.png (1024×1024). Sau đó chạy `pnpm icons:build`.
// Dùng: node tools/icons/equipment.mjs [id ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { findBlender, runBlender } from '../blender/find-blender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(root, 'tools/asset-pipeline/package.json'))('sharp');
const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
const source = process.env.DTL_ASSET_SOURCE ?? path.resolve(path.dirname(git.stdout.trim()), '../dtl-asset-source');
const outDir = path.join(source, 'icons');
fs.mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
const blender = findBlender();
if (!blender) throw new Error('Không tìm thấy Blender (đặt BLENDER=...)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-eq-'));
const code = runBlender(blender, path.join(root, 'tools/icons/render_equipment.py'), [tmp, ...only]);
if (code !== 0) throw new Error(`Blender thoát với mã ${code}`);

const N = 1024;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
// sương: nhiễu thô làm mờ → kênh alpha của lớp ngọc lam nhạt
async function mist() {
  const w = 24, buf = Buffer.alloc(w * w);
  for (let i = 0; i < buf.length; i++) buf[i] = 60 + rnd() * 130;
  const a = await sharp(buf, { raw: { width: w, height: w, channels: 1 } }).resize(N, N, { kernel: 'cubic' }).blur(14).raw().toBuffer();
  const rgba = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) { rgba[i * 4] = 95; rgba[i * 4 + 1] = 179; rgba[i * 4 + 2] = 165; rgba[i * 4 + 3] = Math.round(a[i] * 0.22); }
  return sharp(rgba, { raw: { width: N, height: N, channels: 4 } }).png().toBuffer();
}
const m = N * 0.05, c = N * 0.045; // lề, góc vát
const poly = (inset) => {
  const a = m + inset, b = N - m - inset, k = c;
  return `${a + k},${a} ${b - k},${a} ${b},${a + k} ${b},${b - k} ${b - k},${b} ${a + k},${b} ${a},${b - k} ${a},${a + k}`;
};
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}">
<defs>
<radialGradient id="g" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="#2F6A68"/><stop offset=".55" stop-color="#1D4B52"/><stop offset="1" stop-color="#0E3038"/></radialGradient>
<radialGradient id="sun" cx="6%" cy="4%" r="62%"><stop offset="0" stop-color="#F2C47E" stop-opacity=".78"/><stop offset=".35" stop-color="#E0A860" stop-opacity=".32"/><stop offset="1" stop-color="#F2C47E" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="50%" cy="50%" r="72%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#021418" stop-opacity=".55"/></radialGradient>
<linearGradient id="br" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8C77F"/><stop offset=".5" stop-color="#AE8B49"/><stop offset="1" stop-color="#6D5329"/></linearGradient>
<clipPath id="cl"><polygon points="${poly(0)}"/></clipPath>
</defs>
<rect width="${N}" height="${N}" fill="#0B2A31"/>
<g clip-path="url(#cl)"><rect width="${N}" height="${N}" fill="url(#g)"/><rect width="${N}" height="${N}" fill="url(#sun)"/><rect width="${N}" height="${N}" fill="url(#vig)"/></g>
<polygon points="${poly(0)}" fill="none" stroke="url(#br)" stroke-width="9"/>
<polygon points="${poly(14)}" fill="none" stroke="#F2C47E" stroke-opacity=".35" stroke-width="2"/>
</svg>`;
const bgBase = await sharp(Buffer.from(bgSvg)).png().toBuffer();
const clip = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><polygon points="${poly(0)}" fill="#fff"/></svg>`);
const mistClipped = await sharp(await mist()).composite([{ input: clip, blend: 'dest-in' }]).png().toBuffer();
const frame = await sharp(Buffer.from(bgSvg.replace(/<rect width="1024" height="1024" fill="#0B2A31"\/>/, '').replace(/<g clip-path[\s\S]*?<\/g>/, ''))).png().toBuffer();

for (const f of fs.readdirSync(tmp).filter((x) => x.endsWith('.png'))) {
  const id = f.replace(/\.png$/, '');
  const obj = await sharp(path.join(tmp, f)).resize(Math.round(N * 0.8), Math.round(N * 0.8)).png().toBuffer();
  const shadow = await sharp(obj).ensureAlpha().tint('#02141A').blur(18).linear([1, 1, 1, 0.55], [0, 0, 0, 0]).png().toBuffer();
  const left = Math.round(N * 0.1), top = Math.round(N * 0.1);
  const img = await sharp(bgBase)
    .composite([
      { input: mistClipped },
      { input: shadow, left: left + 14, top: top + 22 },
      { input: obj, left, top },
      { input: frame },
    ]).png().toBuffer();
  fs.writeFileSync(path.join(outDir, `${id}.png`), img);
  console.log('icon', id);
}
fs.rmSync(tmp, { recursive: true, force: true });

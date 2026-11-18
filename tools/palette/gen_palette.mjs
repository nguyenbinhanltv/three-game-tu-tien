#!/usr/bin/env node
// Sinh assets/palette.png (ô màu 256x1) từ assets/palette.json (bảng màu tâm trạng) và kiểm tra palette + khối grading.
// Không phụ thuộc thư viện ngoài (chỉ node:zlib, node:fs).
//
//   node tools/palette/gen_palette.mjs                 kiểm tra + ghi assets/palette.png
//   node tools/palette/gen_palette.mjs --check         chỉ kiểm tra, báo lỗi nếu palette.png lệch JSON
//   node tools/palette/gen_palette.mjs --preview <f>   ghi thêm ảnh xem trước (ô = màu gốc, 2 dải = dưới nắng và trong bóng theo preset grading mặc định)
//
// Mã thoát khác 0 khi palette sai (thiếu màu, trùng, tham chiếu hỏng, hai màu quá gần nhau).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const JSON_PATH = resolve(ROOT, 'assets/palette.json');
const PNG_PATH = resolve(ROOT, 'assets/palette.png');
const COUNT = 32;
const MIN_DELTA_E = 8; // CIE76, dưới mức này hai màu khó phân biệt sau khi ép palette

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const previewIdx = args.indexOf('--preview');
const previewPath = previewIdx >= 0 ? resolve(process.cwd(), args[previewIdx + 1] ?? '') : null;

// ---------- màu ----------
const hexToRgb = (hex) => {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) throw new Error(`mã màu sai: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toSrgb = (l) => {
  l = Math.min(1, Math.max(0, l));
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
};
const rgbToLab = ([r, g, b]) => {
  const [R, G, B] = [r, g, b].map(toLin);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ---------- PNG ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const encodePng = (w, h, rgb) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bit, RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  // Không ghi gAMA/sRGB/tIME để file sinh lại luôn giống hệt từng byte.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
// Đọc lại PNG RGB 8 bit không interlace (chỉ đủ cho file do script này ghi).
const decodePngRgb = (buf) => {
  let off = 8, w = 0, h = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[9] !== 2 || data[8] !== 8) return null; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    if (raw[y * (w * 3 + 1)] !== 0) return null;
    raw.copy(out, y * w * 3, y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1));
  }
  return { w, h, rgb: out };
};

// ---------- kiểm tra ----------
const pal = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const errors = [];
const groups = new Set(pal.groups.map((g) => g.id));
const colors = pal.colors;
if (colors.length !== COUNT) errors.push(`cần đúng ${COUNT} màu, đang có ${colors.length}`);
const byId = new Map();
colors.forEach((c, i) => {
  if (c.index !== i) errors.push(`${c.id}: index ${c.index} phải bằng vị trí ${i}`);
  if (!/^[a-z][a-z0-9_]*$/.test(c.id)) errors.push(`${c.id}: id phải là snake_case không dấu`);
  if (byId.has(c.id)) errors.push(`trùng id ${c.id}`);
  if (!groups.has(c.group)) errors.push(`${c.id}: nhóm lạ ${c.group}`);
  try { c.rgb = hexToRgb(c.hex); c.lab = rgbToLab(c.rgb); } catch (e) { errors.push(`${c.id}: ${e.message}`); }
  byId.set(c.id, c);
});
for (const g of groups) if (!colors.some((c) => c.group === g)) errors.push(`nhóm ${g} không có màu nào`);
for (const id of pal.playerDyes.options) if (!byId.has(id)) errors.push(`playerDyes tham chiếu màu không có: ${id}`);
if (!pal.playerDyes.options.includes(pal.playerDyes.default)) errors.push('playerDyes.default không nằm trong options');
// Mọi giá trị màu trong khối grading phải là hex hợp lệ.
const walkHex = (obj, path) => {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object') walkHex(v, `${path}.${k}`);
    else if (typeof v === 'string' && /(Color|Tint|blackLift)$/.test(k)) {
      try { hexToRgb(v); } catch (e) { errors.push(`${path}.${k}: ${e.message}`); }
    }
  }
};
if (!pal.grading?.presets?.[pal.grading.default]) errors.push('grading.default phải trỏ tới một preset có trong grading.presets');
else walkHex(pal.grading, 'grading');
let minPair = null;
for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
  const a = colors[i], b = colors[j];
  if (!a.lab || !b.lab) continue;
  const d = deltaE(a.lab, b.lab);
  if (!minPair || d < minPair.d) minPair = { a: a.id, b: b.id, d };
  if (d < MIN_DELTA_E) errors.push(`${a.id} và ${b.id} quá gần nhau (ΔE76 = ${d.toFixed(1)} < ${MIN_DELTA_E})`);
}
// Bóng ban ngày phải ngả ngọc lam (G, B lớn hơn R), không ngả về đen hay nâu.
const grade = pal.grading?.presets?.[pal.grading?.default];
if (grade) {
  const st = hexToRgb(grade.shadowTint);
  if (!(st[1] > st[0] && st[2] > st[0])) errors.push(`grading.presets.${pal.grading.default}.shadowTint phải ngả ngọc lam (G, B > R)`);
}

// Bảng phụ Dị vực (riftColors): ngoài LUT, chỉ kiểm hex/id/trùng.
const riftIds = new Set();
for (const c of pal.riftColors?.colors ?? []) {
  if (!/^rift_[a-z0-9_]+$/.test(c.id)) errors.push(`riftColors: id ${c.id} phải bắt đầu rift_`);
  if (riftIds.has(c.id) || byId.has(c.id)) errors.push(`riftColors: trùng id ${c.id}`);
  riftIds.add(c.id);
  try { hexToRgb(c.hex); } catch (e) { errors.push(`${c.id}: ${e.message}`); }
}
if (pal.riftColors && riftIds.size !== 8) errors.push(`riftColors cần đúng 8 màu, đang có ${riftIds.size}`);

if (errors.length) {
  console.error('palette SAI:\n  - ' + errors.join('\n  - '));
  process.exit(1);
}
console.log(`palette ok: ${colors.length} màu, ${groups.size} nhóm; cặp gần nhất ${minPair.a} / ${minPair.b} ΔE76 = ${minPair.d.toFixed(1)}`);

// ---------- LUT 256x1 ----------
const cell = pal.lut.cellWidth;
const lut = Buffer.alloc(pal.lut.width * 3);
colors.forEach((c, i) => { for (let x = 0; x < cell; x++) lut.set(c.rgb, (i * cell + x) * 3); });
const lutPng = encodePng(pal.lut.width, 1, lut);

if (checkOnly) {
  if (!existsSync(PNG_PATH)) { console.error('thiếu assets/palette.png, chạy lại không có --check'); process.exit(1); }
  const cur = decodePngRgb(readFileSync(PNG_PATH));
  if (!cur || cur.w !== pal.lut.width || cur.h !== 1 || !cur.rgb.equals(lut)) {
    console.error('assets/palette.png lệch với palette.json, chạy lại script để sinh lại');
    process.exit(1);
  }
  console.log('assets/palette.png khớp palette.json');
} else {
  writeFileSync(PNG_PATH, lutPng);
  console.log(`đã ghi ${PNG_PATH} (${pal.lut.width}x1)`);
}

// ---------- ảnh xem trước ----------
if (previewPath) {
  const S = 72, BAND = 18, GAP = 10, PAD = 24, COLS = 6;
  const groupRows = pal.groups.map((g) => colors.filter((c) => c.group === g.id));
  const W = PAD * 2 + COLS * S + (COLS - 1) * GAP;
  const rowH = S + 2 * BAND + GAP * 2;
  const H = PAD * 2 + groupRows.length * rowH;
  const img = Buffer.alloc(W * H * 3);
  const fill = (x0, y0, w, h, rgb) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.set(rgb, (y * W + x) * 3);
  };
  const paper = byId.get('attire_ivory').rgb;
  const ink = byId.get('attire_ink').rgb;
  fill(0, 0, W, H, paper);
  // Minh họa thô: nhân màu gốc với sắc nắng hoặc sắc bóng của preset mặc định (không phải shader thật).
  const lumOf = (lin) => 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const tintNorm = (hex) => { const l = hexToRgb(hex).map(toLin); const y = lumOf(l); return l.map((v) => v / y); };
  const hi = tintNorm(grade.highlightTint), sh = tintNorm(grade.shadowTint);
  const shade = (rgb, lum, t, k) => rgb.map((c, i) => toSrgb(toLin(c) * lum * (1 + (t[i] - 1) * k)));
  // chữ số 3x5 để ghi index lên ô
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
  const drawNum = (n, x0, y0, rgb, sc = 3) => {
    String(n).split('').forEach((d, di) => {
      const p = DIGITS[+d];
      for (let i = 0; i < 15; i++) if (p[i] === '1') fill(x0 + di * 4 * sc + (i % 3) * sc, y0 + Math.floor(i / 3) * sc, sc, sc, rgb);
    });
  };
  groupRows.forEach((row, r) => {
    const y = PAD + r * rowH;
    row.forEach((c, i) => {
      const x = PAD + i * (S + GAP);
      // ô lớn = màu gốc; dải 1 = dưới nắng (ấm), dải 2 = trong bóng (ngọc lam)
      fill(x - 2, y - 2, S + 4, S + 2 * BAND + 4, ink);
      fill(x, y, S, S, c.rgb);
      fill(x, y + S, S, BAND, shade(c.rgb, 1.0, hi, 0.35));
      fill(x, y + S + BAND, S, BAND, shade(c.rgb, 0.45, sh, 0.5));
      const txt = c.lab[0] > 55 ? ink : paper;
      drawNum(c.index, x + 5, y + 5, txt);
    });
  });
  mkdirSync(dirname(previewPath), { recursive: true });
  writeFileSync(previewPath, encodePng(W, H, img));
  console.log(`đã ghi ảnh xem trước ${previewPath} (${W}x${H})`);
}

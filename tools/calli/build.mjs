#!/usr/bin/env node
// Vẽ chữ thư pháp Giao Long thành ảnh PNG trong suốt từ danh sách chuỗi cố định (tools/calli/groups.json, i18n key).
//   node tools/calli/build.mjs [nhóm…]   vẽ (mặc định mọi nhóm); thiếu font → cảnh báo rồi bỏ qua (exit 0)
//   node tools/calli/build.mjs --check   kiểm manifest/ảnh/i18n/ngân sách, KHÔNG cần font (chạy ở CI)
// Font KHÔNG nằm trong repo: đường dẫn lấy từ biến môi trường CALLI_FONT (Fz Thu Phap Giao Long, Thái Hiếu, Fontzin).
// Chỉ commit ảnh đã vẽ + manifest (apps/client/public/assets/calli/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const here = path.join(root, 'tools/calli');
const outDir = path.join(root, 'apps/client/public/assets/calli');
const manifestPath = path.join(root, 'apps/client/src/ui/calli/manifest.json'); // client import được (tra theo i18n key)
const BUDGET = 2 * 1024 * 1024; // tổng ảnh thư pháp < 2 MB
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const groups = read(path.join(here, 'groups.json')).groups;
const i18n = {};
for (const f of fs.readdirSync(path.join(root, 'packages/content/data/i18n'))) {
  if (f.endsWith('.json')) Object.assign(i18n, read(path.join(root, 'packages/content/data/i18n', f)));
}
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 12);
const all = Object.entries(groups).flatMap(([g, d]) => d.items.map((it) => ({ ...it, group: g })));
const fail = (m) => {
  console.error('calli: ' + m);
  process.exitCode = 1;
};

// Màu lấy từ token UI Kit 2.0 (--u-*) để đồng bộ.
const tokens = {};
for (const m of fs.readFileSync(path.join(root, 'apps/client/src/ui/u2/tokens.css'), 'utf8').matchAll(/--(u-[\w-]+):\s*(#[0-9a-fA-F]{6})/g))
  tokens[m[1]] = m[2];
const tok = (n) => {
  if (!tokens[n]) fail(`thiếu token --${n}`);
  return tokens[n] ?? '#000000';
};
const STYLES = {
  ink: {
    fill: [tok('u-ink-3'), tok('u-ink-1'), tok('u-ink-0')],
    edge: [tok('u-gold-hi'), tok('u-gold'), tok('u-gold-lo')],
    glow: tok('u-gold-lo'),
  },
  gold: {
    fill: [tok('u-gold-hi'), tok('u-gold'), tok('u-gold-lo')],
    edge: [tok('u-ink-2'), tok('u-ink-1'), tok('u-ink-0')],
    glow: tok('u-son'),
  },
};

function check() {
  if (!fs.existsSync(manifestPath)) return fail('thiếu ' + path.relative(root, manifestPath));
  const m = read(manifestPath);
  let total = 0;
  for (const it of all) {
    const text = i18n[it.key];
    if (text == null) fail(`${it.id}: i18n key ${it.key} không tồn tại`);
    const e = m[it.id];
    if (!e) {
      fail(`${it.id}: chưa có trong manifest (chạy node tools/calli/build.mjs với CALLI_FONT)`);
      continue;
    }
    if (e.key !== it.key || e.text !== text) fail(`${it.id}: ảnh cũ so với i18n (${it.key}) → vẽ lại`);
    const file = path.join(outDir, e.file);
    if (!fs.existsSync(file)) fail(`${it.id}: thiếu ${e.file}`);
    else {
      const b = fs.readFileSync(file);
      total += b.length;
      if (sha(b) !== e.hash) fail(`${it.id}: hash ảnh lệch manifest`);
    }
  }
  // Tên file phải chứa hash; index.html phải lấy ảnh qua placeholder (vite điền từ manifest), không ghi cứng tên.
  for (const [id, e] of Object.entries(m)) if (!e.file.includes(`.${e.hash}.`)) fail(`${id}: tên file không chứa hash ${e.hash}`);
  const html = fs.readFileSync(path.join(root, 'apps/client/index.html'), 'utf8');
  if (/assets\/calli\/[\w-]+\.(?:[0-9a-f]{12}\.)?png/.test(html)) fail('index.html ghi cứng tên ảnh calli; dùng %DTL_CALLI_TITLE%');
  if (!html.includes('%DTL_CALLI_TITLE%')) fail('index.html thiếu placeholder %DTL_CALLI_TITLE%');
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.png') && !Object.values(m).some((e) => e.file === f)) fail(`ảnh mồ côi ${f}`);
  for (const id of Object.keys(m)) if (!all.some((x) => x.id === id)) fail(`manifest thừa ${id}`);
  if (total > BUDGET) fail(`tổng ảnh ${total} B vượt ngân sách ${BUDGET} B`);
  // Chặn lỡ tay commit font.
  const bad = fs.readdirSync(outDir, { recursive: true }).filter((f) => /\.(ttf|otf|woff2?)$/i.test(String(f)));
  if (bad.length) fail('có file font trong ' + outDir + ': ' + bad.join(', '));
  if (!process.exitCode) console.log(`calli: ${all.length} ảnh, ${(total / 1024).toFixed(0)} KB — đạt`);
}

async function build(only) {
  const fontPath = process.env.CALLI_FONT;
  if (!fontPath || !fs.existsSync(fontPath)) {
    console.warn('calli: CẢNH BÁO — thiếu font (đặt CALLI_FONT=<đường dẫn Fz Thu Phap Giao Long .ttf>); bỏ qua, không vẽ ảnh nào.');
    return;
  }
  const req = createRequire(path.join(here, 'package.json'));
  const opentype = req('opentype.js');
  const sharp = req('sharp');
  const buf = fs.readFileSync(fontPath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  fs.mkdirSync(outDir, { recursive: true });
  const m = fs.existsSync(manifestPath) ? read(manifestPath) : {};
  for (const it of all) {
    if (only.length && !only.includes(it.group)) continue;
    const text = i18n[it.key];
    if (text == null) throw new Error(`i18n key ${it.key} không tồn tại`);
    const st = STYLES[it.style ?? 'ink'];
    const size = it.size ?? 200;
    const k = size / font.unitsPerEm;
    // Dàn chữ từng glyph (kerning + giãn chữ).
    let x = 0;
    let prev = null;
    const d = [];
    const dots = [];
    let x1 = Infinity,
      y1 = Infinity,
      x2 = -Infinity,
      y2 = -Infinity;
    const chars = [...text];
    const gl = font.stringToGlyphs(text);
    for (const [gi, g] of gl.entries()) {
      // Font không có "·" (dấu giữa phụ đề): vẽ chấm tròn ở giữa x-height.
      if (chars[gi] === '·' && gl.length === chars.length) {
        const r = size * 0.04;
        const cx = x + size * 0.17;
        const cy = -size * 0.22;
        dots.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}"/>`);
        x1 = Math.min(x1, cx - r);
        x2 = Math.max(x2, cx + r);
        y1 = Math.min(y1, cy - r);
        y2 = Math.max(y2, cy + r);
        x += size * 0.34 + (it.spacing ?? 0) * size;
        prev = null;
        continue;
      }
      if (prev) x += font.getKerningValue(prev, g) * k;
      const p = g.getPath(x, 0, size);
      // Tách chấm dưới (dấu nặng): contour nằm hẳn dưới đường chữ. Vẽ riêng, to hơn và hạ xuống để không bị nét chân chữ bên cạnh nuốt.
      const main = [];
      let cur = null;
      const contours = [];
      for (const c of p.commands) {
        if (c.type === 'M') contours.push((cur = []));
        cur?.push(c);
      }
      for (const cs of contours) {
        const q = new opentype.Path();
        q.commands = cs;
        const cb = q.getBoundingBox();
        if (cb.y1 >= size * 0.01) {
          const cx = (cb.x1 + cb.x2) / 2,
            cy = (cb.y1 + cb.y2) / 2;
          const sc = 1.15,
            dy = size * 0.04;
          dots.push(
            `<path transform="translate(${cx.toFixed(2)} ${(cy + dy).toFixed(2)}) scale(${sc}) translate(${-cx.toFixed(2)} ${-cy.toFixed(2)})" d="${q.toPathData(2)}"/>`,
          );
          const hw = ((cb.x2 - cb.x1) * sc) / 2,
            hh = ((cb.y2 - cb.y1) * sc) / 2;
          x1 = Math.min(x1, cx - hw);
          x2 = Math.max(x2, cx + hw);
          y2 = Math.max(y2, cy + dy + hh);
        } else main.push(...cs);
      }
      const mp = new opentype.Path();
      mp.commands = main;
      const b = mp.getBoundingBox();
      if (main.length) {
        x1 = Math.min(x1, b.x1);
        y1 = Math.min(y1, b.y1);
        x2 = Math.max(x2, b.x2);
        y2 = Math.max(y2, b.y2);
      }
      d.push(mp.toPathData(2));
      x += g.advanceWidth * k + (it.spacing ?? 0) * size;
      prev = g;
    }
    const pathData = d.join(' ');
    const edge = Math.max(2, size * 0.028); // bề dày viền
    const pad = Math.ceil(edge * 2 + size * 0.06);
    const W = Math.ceil(x2 - x1) + pad * 2;
    const H = Math.ceil(y2 - y1) + pad * 2;
    const tx = pad - x1;
    const ty = pad - y1;
    const stops = (c) => c.map((v, i) => `<stop offset="${i / (c.length - 1)}" stop-color="${v}"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1">${stops(st.fill)}</linearGradient>
<linearGradient id="e" x1="0" y1="0" x2="0" y2="1">${stops(st.edge)}</linearGradient>
<filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="${(size * 0.012).toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/>
</filter>
<filter id="glow" x="-10%" y="-10%" width="120%" height="130%">
<feGaussianBlur stdDeviation="${(size * 0.035).toFixed(2)}"/>
</filter>
</defs>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)})" stroke-linejoin="round" stroke-linecap="round">
<path d="${pathData}" fill="${st.glow}" stroke="${st.glow}" stroke-width="${(edge * 2.4).toFixed(2)}" opacity="0.55" filter="url(#glow)"/>
<g filter="url(#rough)">
<path d="${pathData}" fill="url(#e)" stroke="url(#e)" stroke-width="${(edge * 2).toFixed(2)}"/>
<path d="${pathData}" fill="url(#f)"/>
<g stroke="url(#e)" stroke-width="${(edge * 2.2).toFixed(2)}" fill="url(#e)">${dots.join('')}</g>
<g fill="url(#f)">${dots.join('')}</g>
</g>
</g></svg>`;
    const png = await sharp(Buffer.from(svg)).png({ palette: true, quality: 92, effort: 10, colours: 128 }).toBuffer();
    const file = `${it.group}-${it.id}.${sha(png)}.png`; // có hash: /assets/* được cache immutable
    for (const old of fs.readdirSync(outDir))
      if (old.startsWith(`${it.group}-${it.id}.`) && old !== file && old.endsWith('.png')) fs.rmSync(path.join(outDir, old));
    fs.writeFileSync(path.join(outDir, file), png);
    m[it.id] = { key: it.key, text, file, w: W, h: H, hash: sha(png) };
    console.log(`calli: ${file} ${W}×${H} ${(png.length / 1024).toFixed(1)} KB`);
  }
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
}

const args = process.argv.slice(2);
if (args.includes('--check')) check();
else await build(args.filter((a) => !a.startsWith('-')));

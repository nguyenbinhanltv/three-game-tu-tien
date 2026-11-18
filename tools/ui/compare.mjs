#!/usr/bin/env node
// So sánh ảnh UI giữa hai lần chạy `pnpm shots ui` (U2-5): ghép cạnh nhau (trước | sau) và đo tỉ lệ điểm ảnh khác nhau.
// Dùng:  node tools/ui/compare.mjs <thư mục trước> <thư mục sau> <thư mục ra> [--min 0.2]
//   <thư mục ra>/<tên>.jpg   ảnh ghép (cùng tên tệp ở hai thư mục)
//   <thư mục ra>/compare.json  { tên: { diffPct, only: 'truoc'|'sau' } }, in bảng tóm tắt; thoát mã 1 nếu có tệp chỉ ở một bên
//   --min N   chỉ ghi ảnh ghép khi lệch ≥ N % (mặc định 0 = ghi hết); ngưỡng nhiễu thường ~0,05 % (khử răng cưa, đồng hồ)
// Quy trình: chạy `pnpm shots ui --out A` ở nhánh gốc, `pnpm shots ui --out B` ở nhánh mới (cùng `--sizes`), rồi gọi tệp này.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(root, 'tools/asset-pipeline/package.json'))('sharp');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const min = Number(flag('--min', '0'));
const [a, b, out] = args;
if (!a || !b || !out) {
  console.error('Dùng: node tools/ui/compare.mjs <trước> <sau> <ra> [--min 0.2]');
  process.exit(2);
}
const imgs = (d) => new Set(fs.readdirSync(d).filter((f) => /\.(jpe?g|png)$/i.test(f)));
const A = imgs(a);
const B = imgs(b);
fs.mkdirSync(out, { recursive: true });

/** Tỉ lệ điểm ảnh có độ lệch kênh > 24/255 (bỏ nhiễu nén JPEG); ảnh khác cỡ thì coi như lệch hoàn toàn. */
async function diffPct(pa, pb) {
  const ia = await sharp(pa).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ib = await sharp(pb).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (ia.info.width !== ib.info.width || ia.info.height !== ib.info.height) return 100;
  let n = 0;
  const ch = ia.info.channels;
  for (let i = 0; i < ia.data.length; i += ch) {
    if (
      Math.abs(ia.data[i] - ib.data[i]) > 24 ||
      Math.abs(ia.data[i + 1] - ib.data[i + 1]) > 24 ||
      Math.abs(ia.data[i + 2] - ib.data[i + 2]) > 24
    )
      n++;
  }
  return (n / (ia.data.length / ch)) * 100;
}

const report = {};
let missing = 0;
for (const f of [...new Set([...A, ...B])].sort()) {
  const stem = f.replace(/\.[^.]+$/, '');
  if (!A.has(f) || !B.has(f)) {
    report[stem] = { only: A.has(f) ? 'truoc' : 'sau' };
    missing++;
    continue;
  }
  const pa = path.join(a, f);
  const pb = path.join(b, f);
  const d = await diffPct(pa, pb);
  report[stem] = { diffPct: +d.toFixed(3) };
  if (d < min) continue;
  const [ma, mb] = await Promise.all([sharp(pa).metadata(), sharp(pb).metadata()]);
  const w = Math.max(ma.width, mb.width);
  const h = Math.max(ma.height, mb.height);
  const gap = 12;
  const label = (t, x) => ({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34"><text x="10" y="24" font-family="Arial" font-size="22" fill="#f0cd72">${t}</text></svg>`,
    ),
    left: x,
    top: 0,
  });
  await sharp({ create: { width: w * 2 + gap, height: h + 34, channels: 3, background: '#0b0908' } })
    .composite([
      label('TRƯỚC', 0),
      label(`SAU · lệch ${d.toFixed(2)} %`, w + gap),
      { input: await sharp(pa).toBuffer(), left: 0, top: 34 },
      { input: await sharp(pb).toBuffer(), left: w + gap, top: 34 },
    ])
    .jpeg({ quality: 84 })
    .toFile(path.join(out, stem + '.jpg'));
}
fs.writeFileSync(path.join(out, 'compare.json'), JSON.stringify(report, null, 2));
const rows = Object.entries(report).sort((x, y) => (y[1].diffPct ?? 101) - (x[1].diffPct ?? 101));
for (const [k, v] of rows) console.log(`${v.only ? 'CHỈ Ở ' + v.only.toUpperCase() : (v.diffPct + ' %').padStart(10)}  ${k}`);
console.log(`${rows.length} ảnh, ${missing} chỉ có một bên → ${out}`);
process.exit(missing ? 1 : 0);

// So hai ảnh bằng số: SSIM (độ chói, cửa sổ Gauss 11×11 σ 1,5, như bản gốc của Wang et al.) + ΔE trung bình (CIE76 và CIEDE2000) + ảnh chênh.
//   node tools/painted-compare/compare.mjs <ref.png> <ours.png> [--out diff.png] [--json out.json] [--max 20]
// Ảnh chênh: bản đồ nhiệt ΔE00 (0 → đen, --max → vàng sáng). Thoát mã 0 luôn; đọc số ở JSON/stdout.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../perf/package.json', import.meta.url));
const sharp = require('sharp');

const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};
const [fa, fb] = files;
const maxDe = Number(opt('--max', '20'));

async function load(f) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const A = await load(fa);
const B = await load(fb);
if (A.w !== B.w || A.h !== B.h) throw new Error(`khác cỡ: ${A.w}x${A.h} vs ${B.w}x${B.h}`);
const { w, h } = A;

// sRGB -> tuyến tính -> XYZ -> Lab (D65)
const lin = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  lin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
function lab(r, g, b, out, o) {
  const R = lin[r], G = lin[g], B_ = lin[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B_) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B_;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B_) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}
const rad = (d) => (d * Math.PI) / 180;
function de00(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : ((Math.atan2(b1, a1p) * 180) / Math.PI + 360) % 360;
  const h2p = C2p === 0 ? 0 : ((Math.atan2(b2, a2p) * 180) / Math.PI + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) {
    dh = h2p - h1p;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dh / 2));
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p === 0) hb = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hb /= 2;
  else hb = (hb + (hb < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hb - 30)) + 0.24 * Math.cos(rad(2 * hb)) + 0.32 * Math.cos(rad(3 * hb + 6)) - 0.2 * Math.cos(rad(4 * hb - 63));
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

const n = w * h;
const lumA = new Float32Array(n), lumB = new Float32Array(n);
const la = new Float32Array(3), lb = new Float32Array(3);
const heat = Buffer.alloc(n * 3);
let sum76 = 0, sum00 = 0;
const de = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const o = i * 3;
  lab(A.data[o], A.data[o + 1], A.data[o + 2], la, 0);
  lab(B.data[o], B.data[o + 1], B.data[o + 2], lb, 0);
  lumA[i] = 0.299 * A.data[o] + 0.587 * A.data[o + 1] + 0.114 * A.data[o + 2];
  lumB[i] = 0.299 * B.data[o] + 0.587 * B.data[o + 1] + 0.114 * B.data[o + 2];
  sum76 += Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
  const d = de00(la[0], la[1], la[2], lb[0], lb[1], lb[2]);
  de[i] = d;
  sum00 += d;
  const t = Math.min(1, d / maxDe);
  heat[o] = Math.round(255 * Math.min(1, t * 2));
  heat[o + 1] = Math.round(255 * Math.max(0, t * 2 - 0.6));
  heat[o + 2] = Math.round(255 * (t < 0.5 ? t * 0.6 : 0));
}

// SSIM, cửa sổ Gauss 11×11 σ 1,5 tách thành hai lượt 1 chiều
const K = 11, sig = 1.5;
const ker = new Float32Array(K);
let ks = 0;
for (let i = 0; i < K; i++) { ker[i] = Math.exp(-((i - 5) ** 2) / (2 * sig * sig)); ks += ker[i]; }
for (let i = 0; i < K; i++) ker[i] /= ks;
function blur(src) {
  const tmp = new Float32Array(n), dst = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k < K; k++) s += ker[k] * src[y * w + Math.min(w - 1, Math.max(0, x + k - 5))];
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = 0; k < K; k++) s += ker[k] * tmp[Math.min(h - 1, Math.max(0, y + k - 5)) * w + x];
    dst[y * w + x] = s;
  }
  return dst;
}
const prod = (a, b) => { const r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = a[i] * b[i]; return r; };
const mA = blur(lumA), mB = blur(lumB), sAA = blur(prod(lumA, lumA)), sBB = blur(prod(lumB, lumB)), sAB = blur(prod(lumA, lumB));
const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
let ssimSum = 0;
for (let i = 0; i < n; i++) {
  const vA = sAA[i] - mA[i] * mA[i], vB = sBB[i] - mB[i] * mB[i], cov = sAB[i] - mA[i] * mB[i];
  ssimSum += ((2 * mA[i] * mB[i] + C1) * (2 * cov + C2)) / ((mA[i] ** 2 + mB[i] ** 2 + C1) * (vA + vB + C2));
}
const res = { ssim: +(ssimSum / n).toFixed(4), deltaE00: +(sum00 / n).toFixed(3), deltaE76: +(sum76 / n).toFixed(3), size: [w, h] };
const out = opt('--out', null);
if (out) await sharp(heat, { raw: { width: w, height: h, channels: 3 } }).png().toFile(out);
const js = opt('--json', null);
if (js) fs.writeFileSync(js, JSON.stringify(res, null, 2));
console.log(JSON.stringify(res));
